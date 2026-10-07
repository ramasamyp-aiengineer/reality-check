from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr, Field

from reality_api import db
from reality_api.bootstrap import DEMO_EMAIL, DEMO_WORKSPACE, has_real_users
from reality_api.config import get_settings
from reality_api.deps import Principal, client_ip, current_principal
from reality_api.keys import drop_session_key
from reality_api.limiter import limiter
from reality_api.security import (
    CSRF_COOKIE,
    LOCKOUT_SECONDS,
    MAX_FAILED_LOGINS,
    SESSION_COOKIE,
    create_session,
    hash_password,
    password_problems,
    resolve_session,
    verify_password,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])
RETURN_COOKIE = "rc_return"


class SetupIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: EmailStr
    password: str = Field(min_length=10, max_length=200)
    workspace_name: str = Field(default="My workspace", min_length=2, max_length=80)


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=200)


def set_session_cookies(request: Request, response: Response, token: str, csrf: str) -> None:
    settings = get_settings()
    secure = settings.cookie_secure or request.url.scheme == "https"
    max_age = settings.session_hours * 3600
    response.set_cookie(SESSION_COOKIE, token, max_age=max_age, httponly=True, secure=secure, samesite="strict", path="/")
    response.set_cookie(CSRF_COOKIE, csrf, max_age=max_age, httponly=False, secure=secure, samesite="strict", path="/")


def providers() -> list[str]:
    s = get_settings()
    out = []
    if s.github_client_id and s.github_client_secret:
        out.append("github")
    if s.google_client_id and s.google_client_secret:
        out.append("google")
    return out


@router.get("/state")
def auth_state(request: Request) -> dict[str, Any]:
    session = resolve_session(request.cookies.get(SESSION_COOKIE))
    return {"needs_setup": not has_real_users(), "allow_demo": get_settings().allow_demo_login,
            "providers": providers(), "signed_in": bool(session)}


@router.post("/setup")
@limiter.limit("5/minute")
def setup(request: Request, body: SetupIn, response: Response) -> dict[str, Any]:
    if has_real_users():
        raise HTTPException(409, "Setup already completed")
    problems = password_problems(body.password)
    if problems:
        raise HTTPException(422, "Password needs " + ", ".join(problems))
    s = get_settings()
    uid, wid = db.new_id("usr"), db.new_id("ws")
    with db.tx() as c:
        c.execute("INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?,?,?,?,?)",
                  (uid, body.email.lower(), body.name.strip(), hash_password(body.password), db.now()))
        c.execute("INSERT INTO workspaces (id, name, mode, run_budget, monthly_budget, created_at) VALUES (?,?,?,?,?,?)",
                  (wid, body.workspace_name.strip(), "live", s.default_run_budget, s.default_monthly_budget, db.now()))
        c.execute("INSERT INTO memberships (user_id, workspace_id, role) VALUES (?,?,?)", (uid, wid, "admin"))
    token, csrf = create_session(uid, wid, client_ip(request), request.headers.get("user-agent"))
    set_session_cookies(request, response, token, csrf)
    db.audit("setup", workspace_id=wid, user={"id": uid, "email": body.email.lower()}, ip=client_ip(request))
    return {"ok": True}


@router.post("/login")
@limiter.limit("5/minute")
def login(request: Request, body: LoginIn, response: Response) -> dict[str, Any]:
    email = body.email.lower()
    user = db.one("SELECT * FROM users WHERE email = ? AND is_demo = 0", (email,))
    ip = client_ip(request)
    if user and user["locked_until"] > db.now():
        db.audit("login_locked", user=user, ip=ip)
        raise HTTPException(423, "Too many failed attempts. Try again in a few minutes.")
    if not user or not verify_password(body.password, user["password_hash"]):
        if user:
            failed = user["failed_logins"] + 1
            locked = db.now() + LOCKOUT_SECONDS if failed >= MAX_FAILED_LOGINS else 0
            db.run("UPDATE users SET failed_logins = ?, locked_until = ? WHERE id = ?",
                   (0 if locked else failed, locked, user["id"]))
        db.audit("login_failed", target=email, ip=ip)
        raise HTTPException(401, "Incorrect email or password")
    membership = db.one("SELECT workspace_id FROM memberships WHERE user_id = ? ORDER BY role = 'admin' DESC LIMIT 1",
                        (user["id"],))
    if not membership:
        raise HTTPException(403, "No workspace access")
    db.run("UPDATE users SET failed_logins = 0, locked_until = 0, last_login_at = ? WHERE id = ?", (db.now(), user["id"]))
    token, csrf = create_session(user["id"], membership["workspace_id"], ip, request.headers.get("user-agent"))
    set_session_cookies(request, response, token, csrf)
    db.audit("login", workspace_id=membership["workspace_id"], user=user, ip=ip)
    return {"ok": True}


@router.post("/demo")
@limiter.limit("20/minute")
def demo_login(request: Request, response: Response) -> dict[str, Any]:
    if not get_settings().allow_demo_login:
        raise HTTPException(403, "Demo login is disabled")
    user = db.one("SELECT * FROM users WHERE email = ?", (DEMO_EMAIL,))
    if not user:
        raise HTTPException(500, "Demo workspace missing")
    current_token = request.cookies.get(SESSION_COOKIE)
    current = resolve_session(current_token)
    if current and not current["is_demo"]:
        # Keep the real session parked so "Back to my workspace" needs no second sign-in.
        secure = get_settings().cookie_secure or request.url.scheme == "https"
        response.set_cookie(RETURN_COOKIE, current_token or "", max_age=get_settings().session_hours * 3600,
                            httponly=True, secure=secure, samesite="strict", path="/api/auth")
    elif current:
        db.run("DELETE FROM sessions WHERE token_hash = ?", (current["token_hash"],))
    token, csrf = create_session(user["id"], DEMO_WORKSPACE, client_ip(request), request.headers.get("user-agent"))
    set_session_cookies(request, response, token, csrf)
    return {"ok": True}


@router.post("/return")
@limiter.limit("20/minute")
def return_to_workspace(request: Request, response: Response) -> dict[str, Any]:
    parked_token = request.cookies.get(RETURN_COOKIE)
    parked = resolve_session(parked_token)
    if not parked_token or not parked or parked["is_demo"]:
        response.delete_cookie(RETURN_COOKIE, path="/api/auth")
        raise HTTPException(401, "Your workspace session has ended. Sign in again.")
    demo = resolve_session(request.cookies.get(SESSION_COOKIE))
    if demo and demo["is_demo"]:
        db.run("DELETE FROM sessions WHERE token_hash = ?", (demo["token_hash"],))
    set_session_cookies(request, response, parked_token, parked["csrf"])
    response.delete_cookie(RETURN_COOKIE, path="/api/auth")
    return {"ok": True}


@router.post("/logout")
def logout(request: Request, response: Response, p: Principal = Depends(current_principal)) -> dict[str, Any]:
    if p.session_hash:
        db.run("DELETE FROM sessions WHERE token_hash = ?", (p.session_hash,))
        drop_session_key(p.session_hash)
    parked = resolve_session(request.cookies.get(RETURN_COOKIE))
    if parked:
        db.run("DELETE FROM sessions WHERE token_hash = ?", (parked["token_hash"],))
        drop_session_key(parked["token_hash"])
    response.delete_cookie(SESSION_COOKIE, path="/")
    response.delete_cookie(CSRF_COOKIE, path="/")
    response.delete_cookie(RETURN_COOKIE, path="/api/auth")
    db.audit("logout", workspace_id=p.workspace_id, user=p.user, ip=client_ip(request))
    return {"ok": True}


@router.get("/me")
def me(request: Request, p: Principal = Depends(current_principal)) -> dict[str, Any]:
    ws = p.workspace()
    from reality_api.runs_service import run_mode, workspace_llm

    return {
        "user": {"id": p.user_id, "email": p.email, "name": p.name, "role": p.role, "is_demo": p.is_demo},
        "can_return": p.is_demo and bool(resolve_session(request.cookies.get(RETURN_COOKIE))),
        "allow_demo": get_settings().allow_demo_login,
        "force_demo": get_settings().force_demo,
        "workspace": {"id": ws["id"], "name": ws["name"], "mode": run_mode(ws), "run_budget": ws["run_budget"],
                      "monthly_budget": ws["monthly_budget"], "language": ws["language"],
                      "llm": workspace_llm(ws).label},
    }
