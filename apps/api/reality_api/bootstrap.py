"""Startup data: the demo workspace and user (recorded fixtures only, never spends searches)."""

from __future__ import annotations

from reality_api import db
from reality_api.config import get_settings

DEMO_EMAIL = "demo@reality-check.local"
DEMO_WORKSPACE = "ws_demo"


def ensure_demo() -> None:
    settings = get_settings()
    if not db.one("SELECT id FROM workspaces WHERE id = ?", (DEMO_WORKSPACE,)):
        db.run("INSERT INTO workspaces (id, name, mode, run_budget, monthly_budget, created_at) VALUES (?,?,?,?,?,?)",
               (DEMO_WORKSPACE, "Demo workspace", "demo", settings.default_run_budget, 0, db.now()))
    user = db.one("SELECT id FROM users WHERE email = ?", (DEMO_EMAIL,))
    if not user:
        uid = db.new_id("usr")
        db.run("INSERT INTO users (id, email, name, password_hash, created_at, is_demo) VALUES (?,?,?,?,?,1)",
               (uid, DEMO_EMAIL, "Demo Analyst", None, db.now()))
        db.run("INSERT INTO memberships (user_id, workspace_id, role) VALUES (?,?,?)", (uid, DEMO_WORKSPACE, "analyst"))


def has_real_users() -> bool:
    return bool(db.one("SELECT id FROM users WHERE is_demo = 0 LIMIT 1"))
