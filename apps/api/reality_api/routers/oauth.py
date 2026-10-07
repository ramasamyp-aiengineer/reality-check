"""Optional GitHub / Google sign-in (Authlib). Only existing, invited users can sign in this way."""

from __future__ import annotations

from typing import Any

from authlib.integrations.starlette_client import OAuth, OAuthError
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse

from reality_api import db
from reality_api.config import get_settings
from reality_api.deps import client_ip
from reality_api.routers.auth import set_session_cookies
from reality_api.security import create_session

router = APIRouter(prefix="/api/auth/oauth", tags=["auth"])
_oauth: OAuth | None = None


def oauth() -> OAuth:
    global _oauth
    if _oauth is None:
        s = get_settings()
        _oauth = OAuth()
        if s.github_client_id and s.github_client_secret:
            _oauth.register("github", client_id=s.github_client_id, client_secret=s.github_client_secret,
                            access_token_url="https://github.com/login/oauth/access_token",
                            authorize_url="https://github.com/login/oauth/authorize",
                            api_base_url="https://api.github.com/", client_kwargs={"scope": "read:user user:email"})
        if s.google_client_id and s.google_client_secret:
            _oauth.register("google", client_id=s.google_client_id, client_secret=s.google_client_secret,
                            server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
                            client_kwargs={"scope": "openid email profile"})
    return _oauth


def _client(provider: str) -> Any:
    client = oauth().create_client(provider)
    if client is None:
        raise HTTPException(404, "Sign-in provider not configured")
    return client


@router.get("/{provider}/start")
async def start(provider: str, request: Request) -> Any:
    redirect_uri = f"{get_settings().public_url}/api/auth/oauth/{provider}/callback"
    return await _client(provider).authorize_redirect(request, redirect_uri)


@router.get("/{provider}/callback")
async def callback(provider: str, request: Request) -> Any:
    client = _client(provider)
    try:
        token = await client.authorize_access_token(request)
    except OAuthError:
        return RedirectResponse("/login?error=oauth")
    email = None
    if provider == "google":
        email = (token.get("userinfo") or {}).get("email")
    else:
        emails = (await client.get("user/emails", token=token)).json()
        email = next((e["email"] for e in emails if e.get("primary") and e.get("verified")), None)
    user = db.one("SELECT * FROM users WHERE email = ? AND is_demo = 0", ((email or "").lower(),))
    if not user:
        db.audit("oauth_denied", target=email, ip=client_ip(request), detail={"provider": provider})
        return RedirectResponse("/login?error=not_invited")
    membership = db.one("SELECT workspace_id FROM memberships WHERE user_id = ? LIMIT 1", (user["id"],))
    if not membership:
        return RedirectResponse("/login?error=no_workspace")
    session, csrf = create_session(user["id"], membership["workspace_id"], client_ip(request),
                                   request.headers.get("user-agent"))
    response = RedirectResponse("/")
    set_session_cookies(request, response, session, csrf)
    db.audit("login", workspace_id=membership["workspace_id"], user=user, ip=client_ip(request),
             detail={"provider": provider})
    return response
