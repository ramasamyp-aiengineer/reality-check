"""Request authentication (session cookie or API token), CSRF enforcement and role checks."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from fastapi import Depends, HTTPException, Request

from reality_api import db
from reality_api.security import (
    CSRF_HEADER,
    SESSION_COOKIE,
    csrf_valid,
    resolve_api_token,
    resolve_session,
    role_at_least,
    token_hash,
)

SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


@dataclass
class Principal:
    user_id: str
    email: str
    name: str
    role: str
    workspace_id: str
    is_demo: bool
    session_hash: str | None
    via_token: bool = False

    @property
    def user(self) -> dict[str, Any]:
        return {"id": self.user_id, "email": self.email}

    def workspace(self) -> dict[str, Any]:
        ws = db.one("SELECT * FROM workspaces WHERE id = ?", (self.workspace_id,))
        if not ws:
            raise HTTPException(404, "Workspace not found")
        return ws


def client_ip(request: Request) -> str | None:
    return request.client.host if request.client else None


def current_principal(request: Request) -> Principal:
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        row = resolve_api_token(auth[7:].strip())
        if not row:
            raise HTTPException(401, "Invalid API token")
        return Principal(row["user_id"], row["email"], row["name"], row["role"], row["workspace_id"],
                         bool(row["is_demo"]), None, via_token=True)
    token = request.cookies.get(SESSION_COOKIE)
    row = resolve_session(token)
    if not row:
        raise HTTPException(401, "Not signed in")
    if request.method not in SAFE_METHODS and not csrf_valid(row["csrf"], request.headers.get(CSRF_HEADER)):
        raise HTTPException(403, "CSRF token missing or invalid")
    return Principal(row["user_id"], row["email"], row["name"], row["role"], row["workspace_id"], bool(row["is_demo"]),
                     token_hash(token or ""))


def require(minimum: str):  # noqa: ANN201 - FastAPI dependency factory
    def check(p: Principal = Depends(current_principal)) -> Principal:
        if not role_at_least(p.role, minimum):
            raise HTTPException(403, f"Requires the {minimum} role")
        return p

    return check


def not_demo(p: Principal = Depends(current_principal)) -> Principal:
    if p.is_demo:
        raise HTTPException(403, "Not available in the demo workspace")
    return p
