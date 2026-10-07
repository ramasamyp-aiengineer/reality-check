"""Workspace settings, members and roles, audit log, personal API tokens and MCP configuration."""

from __future__ import annotations

import secrets
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field

from reality_api import db
from reality_api.config import get_settings
from reality_api.deps import Principal, client_ip, current_principal, not_demo, require
from reality_api.security import ROLES, hash_password, password_problems, token_hash

router = APIRouter(prefix="/api", tags=["admin"])


class SettingsIn(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=80)
    mode: str | None = Field(default=None, pattern="^(live|demo)$")
    run_budget: int | None = Field(default=None, ge=1, le=60)
    monthly_budget: int | None = Field(default=None, ge=0, le=100000)
    llm_model: str | None = Field(default=None, max_length=120)
    language: str | None = Field(default=None, pattern="^(en|hi|ta)$")
    alert_telegram_chat: str | None = Field(default=None, max_length=64)
    alert_email: EmailStr | None = None
    retention_days: int | None = Field(default=None, ge=1, le=3650)


@router.get("/settings")
def get_ws_settings(p: Principal = Depends(current_principal)) -> dict[str, Any]:
    ws = p.workspace()
    s = get_settings()
    return {**{k: ws[k] for k in ("id", "name", "mode", "run_budget", "monthly_budget", "llm_model", "language",
                                  "alert_telegram_chat", "alert_email", "retention_days")},
            "telegram_configured": bool(s.telegram_bot_token), "smtp_configured": bool(s.smtp_host),
            "force_demo": s.force_demo}


@router.put("/settings")
def put_ws_settings(body: SettingsIn, request: Request, p: Principal = Depends(require("admin")),
                    _: Principal = Depends(not_demo)) -> dict[str, Any]:
    changes = {k: v for k, v in body.model_dump().items() if v is not None}
    if body.llm_model == "":
        changes["llm_model"] = None
    if changes:
        cols = ", ".join(f"{k} = ?" for k in changes)
        db.run(f"UPDATE workspaces SET {cols} WHERE id = ?", (*changes.values(), p.workspace_id))  # noqa: S608 - keys from model
        db.audit("settings_changed", workspace_id=p.workspace_id, user=p.user, ip=client_ip(request),
                 detail={k: v for k, v in changes.items() if k != "alert_email"})
    return get_ws_settings(p)


class MemberIn(BaseModel):
    email: EmailStr
    name: str = Field(min_length=2, max_length=80)
    role: str = Field(pattern="^(viewer|analyst|admin)$")
    password: str = Field(min_length=10, max_length=200)


class RoleIn(BaseModel):
    role: str = Field(pattern="^(viewer|analyst|admin)$")


@router.get("/members")
def members(p: Principal = Depends(current_principal)) -> dict[str, Any]:
    rows = db.many("SELECT u.id, u.email, u.name, u.last_login_at, u.created_at, m.role FROM memberships m "
                   "JOIN users u ON u.id = m.user_id WHERE m.workspace_id = ? ORDER BY u.created_at", (p.workspace_id,))
    return {"members": rows, "roles": list(ROLES)}


@router.post("/members")
def add_member(body: MemberIn, request: Request, p: Principal = Depends(require("admin")),
               _: Principal = Depends(not_demo)) -> dict[str, Any]:
    problems = password_problems(body.password)
    if problems:
        raise HTTPException(422, "Password needs " + ", ".join(problems))
    email = body.email.lower()
    user = db.one("SELECT id FROM users WHERE email = ?", (email,))
    uid = user["id"] if user else db.new_id("usr")
    if not user:
        db.run("INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?,?,?,?,?)",
               (uid, email, body.name, hash_password(body.password), db.now()))
    db.run("INSERT OR REPLACE INTO memberships (user_id, workspace_id, role) VALUES (?,?,?)", (uid, p.workspace_id, body.role))
    db.audit("member_added", workspace_id=p.workspace_id, user=p.user, target=email, ip=client_ip(request),
             detail={"role": body.role})
    return {"ok": True, "id": uid}


@router.put("/members/{user_id}")
def change_role(user_id: str, body: RoleIn, request: Request, p: Principal = Depends(require("admin")),
                _: Principal = Depends(not_demo)) -> dict[str, Any]:
    if user_id == p.user_id and body.role != "admin":
        admins = db.one("SELECT COUNT(*) AS n FROM memberships WHERE workspace_id = ? AND role = 'admin'", (p.workspace_id,))
        if admins and admins["n"] <= 1:
            raise HTTPException(409, "A workspace needs at least one admin")
    db.run("UPDATE memberships SET role = ? WHERE user_id = ? AND workspace_id = ?", (body.role, user_id, p.workspace_id))
    db.audit("role_changed", workspace_id=p.workspace_id, user=p.user, target=user_id, ip=client_ip(request),
             detail={"role": body.role})
    return {"ok": True}


@router.delete("/members/{user_id}")
def remove_member(user_id: str, request: Request, p: Principal = Depends(require("admin")),
                  _: Principal = Depends(not_demo)) -> dict[str, Any]:
    if user_id == p.user_id:
        raise HTTPException(409, "You cannot remove yourself")
    db.run("DELETE FROM memberships WHERE user_id = ? AND workspace_id = ?", (user_id, p.workspace_id))
    db.run("DELETE FROM sessions WHERE user_id = ? AND workspace_id = ?", (user_id, p.workspace_id))
    db.audit("member_removed", workspace_id=p.workspace_id, user=p.user, target=user_id, ip=client_ip(request))
    return {"ok": True}


@router.get("/audit")
def audit_log(limit: int = 200, p: Principal = Depends(require("admin"))) -> dict[str, Any]:
    rows = db.many("SELECT id, ts, user_email, action, target, detail, ip FROM audit_log WHERE workspace_id = ? "
                   "ORDER BY id DESC LIMIT ?", (p.workspace_id, max(1, min(limit, 1000))))
    for r in rows:
        r["detail"] = db.loads(r["detail"], {})
    return {"entries": rows}


class TokenIn(BaseModel):
    name: str = Field(min_length=2, max_length=60)


@router.get("/tokens")
def list_tokens(p: Principal = Depends(current_principal)) -> dict[str, Any]:
    return {"tokens": db.many("SELECT id, name, last4, created_at, last_used_at FROM api_tokens WHERE user_id = ? AND "
                              "workspace_id = ? ORDER BY created_at DESC", (p.user_id, p.workspace_id))}


@router.post("/tokens")
def create_token(body: TokenIn, request: Request, p: Principal = Depends(require("analyst")),
                 _: Principal = Depends(not_demo)) -> dict[str, Any]:
    token = "rc_" + secrets.token_urlsafe(32)
    tid = db.new_id("tok")
    db.run("INSERT INTO api_tokens (id, user_id, workspace_id, name, token_hash, last4, created_at) VALUES (?,?,?,?,?,?,?)",
           (tid, p.user_id, p.workspace_id, body.name, token_hash(token), token[-4:], db.now()))
    db.audit("token_created", workspace_id=p.workspace_id, user=p.user, target=tid, ip=client_ip(request))
    return {"id": tid, "token": token, "note": "Copy this token now. It will not be shown again."}


@router.delete("/tokens/{token_id}")
def delete_token(token_id: str, request: Request, p: Principal = Depends(current_principal)) -> dict[str, Any]:
    db.run("DELETE FROM api_tokens WHERE id = ? AND user_id = ?", (token_id, p.user_id))
    db.audit("token_revoked", workspace_id=p.workspace_id, user=p.user, target=token_id, ip=client_ip(request))
    return {"ok": True}


@router.get("/developer/mcp")
def mcp_config(_: Principal = Depends(current_principal)) -> dict[str, Any]:
    root = str(get_settings().root)
    server = {"command": "uv", "args": ["run", "--directory", root, "reality-check-mcp"],
              "env": {"SERPAPI_API_KEY": "<your SerpApi key>", "RC_MODE": "live"}}
    return {
        "claude_desktop": {"mcpServers": {"reality-check": server}},
        "cursor": {"mcpServers": {"reality-check": server}},
        "tools": ["list_agents", "run_agent", "verify_claim", "market_pulse", "list_workflows", "run_workflow"],
        "rest_example": "curl -H 'Authorization: Bearer rc_...' http://localhost:8000/api/runs",
    }
