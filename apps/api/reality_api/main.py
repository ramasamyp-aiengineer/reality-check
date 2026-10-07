"""FastAPI application: API under /api, the built React app everywhere else."""

from __future__ import annotations

import logging
import re
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from starlette.middleware.sessions import SessionMiddleware

from reality_api import db
from reality_api.bootstrap import ensure_demo
from reality_api.config import get_settings
from reality_api.limiter import limiter
from reality_api.routers import admin, auth, catalog, data, keys, oauth, runs, watches, workflows
from reality_api.security import derived_key
from reality_api.watch_service import start_scheduler, stop_scheduler

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
# httpx logs full request URLs at INFO; SerpApi keys travel as ?api_key= and Telegram tokens in the path.
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)


class _SecretFilter(logging.Filter):
    _PATTERNS = (
        (re.compile(r"(api_key|apikey|token|key|secret|password)=[^&\s\"']+", re.I), r"\1=***"),
        (re.compile(r"/bot\d+:[A-Za-z0-9_-]+"), "/bot***"),
    )

    def filter(self, record: logging.LogRecord) -> bool:
        message = record.getMessage()
        clean = message
        for pattern, repl in self._PATTERNS:
            clean = pattern.sub(repl, clean)
        if clean != message:
            record.msg, record.args = clean, None
        return True


for _name in ("", "uvicorn", "uvicorn.error", "uvicorn.access"):
    for _handler in logging.getLogger(_name).handlers:
        _handler.addFilter(_SecretFilter())

CSP = ("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; "
       "font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; "
       "object-src 'none'")


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    db.init_db()
    ensure_demo()
    start_scheduler()
    yield
    stop_scheduler()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="Reality Check API", version="0.1.0", lifespan=lifespan,
                  docs_url="/api/docs", openapi_url="/api/openapi.json", redoc_url=None)
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)  # type: ignore[arg-type]
    app.add_middleware(SessionMiddleware, secret_key=derived_key("oauth-state-cookie"),
                       same_site="lax", https_only=settings.cookie_secure, session_cookie="rc_oauth_state")

    @app.middleware("http")
    async def security_headers(request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
        response = await call_next(request)
        h = response.headers
        h.setdefault("X-Content-Type-Options", "nosniff")
        h.setdefault("X-Frame-Options", "DENY")
        h.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        h.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        h.setdefault("Cross-Origin-Opener-Policy", "same-origin")
        if not request.url.path.startswith("/api/docs"):
            h.setdefault("Content-Security-Policy", CSP)
        if request.url.scheme == "https" or settings.cookie_secure:
            h.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        if request.url.path.startswith("/api/"):
            h.setdefault("Cache-Control", "no-store")
        return response

    @app.exception_handler(RequestValidationError)
    async def validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        errors = [{"field": ".".join(str(x) for x in e.get("loc", [])[1:]), "message": e.get("msg")} for e in exc.errors()]
        return JSONResponse({"detail": errors[0]["message"] if errors else "Invalid request", "errors": errors},
                            status_code=422)

    for r in (auth, oauth, keys, workflows, catalog, runs, data, watches, admin):
        app.include_router(r.router)

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    dist = settings.web_dist
    if (dist / "index.html").exists():
        app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

        @app.get("/{path:path}", include_in_schema=False)
        def spa(path: str) -> Response:
            if path.startswith("api/"):
                return JSONResponse({"detail": "Not found"}, status_code=404)
            candidate = (dist / path).resolve()
            if path and candidate.is_file() and Path(dist.resolve()) in candidate.parents:
                return FileResponse(candidate)
            return FileResponse(dist / "index.html")
    else:
        @app.get("/", include_in_schema=False)
        def no_ui() -> JSONResponse:
            return JSONResponse({"detail": "UI not built. Run `npm run build` in apps/web, or `npm run dev` for development."})

    return app


app = create_app()
