"""Runtime settings, read from environment variables and the project .env file."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[3]


def _bool(name: str, default: bool) -> bool:
    value = os.environ.get(name)
    return default if value is None else value.strip().lower() in ("1", "true", "yes", "on")


def _pacing() -> tuple[float, float] | None:
    """RC_REPLAY_PACING: on/off, or "min,max" seconds of simulated latency per replayed search."""
    value = os.environ.get("RC_REPLAY_PACING", "1").strip()
    if "," in value:
        low, high = (float(v) for v in value.split(",", 1))
        return (low, max(low, high))
    return (0.6, 1.8) if _bool("RC_REPLAY_PACING", True) else None


@dataclass(frozen=True)
class Settings:
    root: Path
    data_dir: Path
    db_path: Path
    fixtures_dir: Path
    sample_fixtures_dir: Path
    web_dist: Path
    app_secret_key: str | None
    cookie_secure: bool
    force_demo: bool
    allow_demo_login: bool
    allow_env_serpapi_key: bool
    env_serpapi_key: str | None = field(repr=False, default=None)
    default_run_budget: int = 15
    default_monthly_budget: int = 250
    session_hours: int = 12
    telegram_bot_token: str | None = field(repr=False, default=None)
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_user: str | None = None
    smtp_password: str | None = field(repr=False, default=None)
    smtp_from: str | None = None
    github_client_id: str | None = None
    github_client_secret: str | None = field(repr=False, default=None)
    google_client_id: str | None = None
    google_client_secret: str | None = field(repr=False, default=None)
    public_url: str = "http://localhost:8000"
    replay_pacing: tuple[float, float] | None = None


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    load_dotenv(ROOT / ".env")
    data_dir = Path(os.environ.get("RC_DATA_DIR", ROOT / "data"))
    data_dir.mkdir(parents=True, exist_ok=True)
    return Settings(
        root=ROOT,
        data_dir=data_dir,
        db_path=data_dir / "reality_check.sqlite",
        fixtures_dir=ROOT / "fixtures" / "serp",
        sample_fixtures_dir=ROOT / "fixtures" / "sample",
        web_dist=ROOT / "apps" / "web" / "dist",
        app_secret_key=os.environ.get("APP_SECRET_KEY") or None,
        cookie_secure=_bool("COOKIE_SECURE", False),
        force_demo=_bool("RC_FORCE_DEMO", False),
        allow_demo_login=_bool("ALLOW_DEMO_LOGIN", True),
        allow_env_serpapi_key=_bool("ALLOW_ENV_SERPAPI_KEY", True),
        env_serpapi_key=os.environ.get("SERPAPI_API_KEY") or None,
        default_run_budget=int(os.environ.get("RUN_SEARCH_BUDGET", "15")),
        default_monthly_budget=int(os.environ.get("MONTHLY_SEARCH_BUDGET", "250")),
        session_hours=int(os.environ.get("SESSION_HOURS", "12")),
        telegram_bot_token=os.environ.get("TELEGRAM_BOT_TOKEN") or None,
        smtp_host=os.environ.get("SMTP_HOST") or None,
        smtp_port=int(os.environ.get("SMTP_PORT", "587")),
        smtp_user=os.environ.get("SMTP_USER") or None,
        smtp_password=os.environ.get("SMTP_PASSWORD") or None,
        smtp_from=os.environ.get("SMTP_FROM") or None,
        github_client_id=os.environ.get("GITHUB_CLIENT_ID") or None,
        github_client_secret=os.environ.get("GITHUB_CLIENT_SECRET") or None,
        google_client_id=os.environ.get("GOOGLE_CLIENT_ID") or None,
        google_client_secret=os.environ.get("GOOGLE_CLIENT_SECRET") or None,
        public_url=os.environ.get("PUBLIC_URL", "http://localhost:8000"),
        replay_pacing=_pacing(),
    )
