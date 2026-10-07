"""SQLite storage (stdlib sqlite3, WAL mode). Small typed helpers instead of an ORM keep the stack dependency-light."""

from __future__ import annotations

import json
import sqlite3
import threading
import time
import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any

from reality_api.config import get_settings

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, password_hash TEXT,
  created_at REAL NOT NULL, failed_logins INTEGER NOT NULL DEFAULT 0, locked_until REAL NOT NULL DEFAULT 0,
  is_demo INTEGER NOT NULL DEFAULT 0, last_login_at REAL
);
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, mode TEXT NOT NULL DEFAULT 'live', run_budget INTEGER NOT NULL,
  monthly_budget INTEGER NOT NULL, llm_model TEXT, language TEXT NOT NULL DEFAULT 'en',
  alert_telegram_chat TEXT, alert_email TEXT, retention_days INTEGER NOT NULL DEFAULT 90, created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS memberships (
  user_id TEXT NOT NULL, workspace_id TEXT NOT NULL, role TEXT NOT NULL, PRIMARY KEY (user_id, workspace_id)
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, workspace_id TEXT NOT NULL, csrf TEXT NOT NULL,
  created_at REAL NOT NULL, expires_at REAL NOT NULL, ip TEXT, user_agent TEXT
);
CREATE TABLE IF NOT EXISTS secrets (
  workspace_id TEXT NOT NULL, name TEXT NOT NULL, nonce BLOB NOT NULL, ciphertext BLOB NOT NULL, last4 TEXT,
  created_at REAL NOT NULL, PRIMARY KEY (workspace_id, name)
);
CREATE TABLE IF NOT EXISTS workflows (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, name TEXT NOT NULL, description TEXT, doc TEXT NOT NULL,
  created_by TEXT, created_at REAL NOT NULL, updated_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, workflow_id TEXT, workflow_name TEXT, workflow_doc TEXT NOT NULL,
  input TEXT NOT NULL, status TEXT NOT NULL, mode TEXT NOT NULL, created_by TEXT, created_at REAL NOT NULL,
  finished_at REAL, verdict_status TEXT, decision TEXT, confidence REAL, paid_searches INTEGER DEFAULT 0,
  cache_hits INTEGER DEFAULT 0, total_calls INTEGER DEFAULT 0, engines TEXT, result TEXT, error TEXT, watch_id TEXT,
  estimate INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS runs_ws ON runs (workspace_id, created_at DESC);
CREATE TABLE IF NOT EXISTS run_events (
  run_id TEXT NOT NULL, seq INTEGER NOT NULL, ts REAL NOT NULL, event TEXT NOT NULL, PRIMARY KEY (run_id, seq)
);
CREATE TABLE IF NOT EXISTS evidence (
  run_id TEXT NOT NULL, id TEXT NOT NULL, workspace_id TEXT NOT NULL, agent TEXT, engine TEXT, kind TEXT, title TEXT,
  snippet TEXT, url TEXT, source TEXT, published_at TEXT, created_at REAL NOT NULL, PRIMARY KEY (run_id, id)
);
CREATE INDEX IF NOT EXISTS evidence_ws ON evidence (workspace_id, created_at DESC);
CREATE TABLE IF NOT EXISTS verdicts (
  run_id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, status TEXT, decision TEXT, confidence REAL, headline TEXT,
  doc TEXT NOT NULL, created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS ad_packs (
  run_id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, topic TEXT, doc TEXT NOT NULL, created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS watches (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, name TEXT NOT NULL, workflow_doc TEXT NOT NULL, input TEXT NOT NULL,
  interval_minutes INTEGER NOT NULL, channels TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, last_run_id TEXT,
  last_run_at REAL, next_run_at REAL, created_by TEXT, created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS watch_snapshots (
  id TEXT PRIMARY KEY, watch_id TEXT NOT NULL, run_id TEXT NOT NULL, created_at REAL NOT NULL, metrics TEXT NOT NULL,
  diff TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts REAL NOT NULL, workspace_id TEXT, user_id TEXT, user_email TEXT,
  action TEXT NOT NULL, target TEXT, detail TEXT, ip TEXT
);
CREATE TABLE IF NOT EXISTS api_tokens (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, workspace_id TEXT NOT NULL, name TEXT NOT NULL, token_hash TEXT UNIQUE NOT NULL,
  last4 TEXT NOT NULL, created_at REAL NOT NULL, last_used_at REAL
);
"""

_lock = threading.RLock()
_initialized = False


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:16]}"


def now() -> float:
    return time.time()


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(get_settings().db_path, timeout=15, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    global _initialized
    with _lock:
        conn = _connect()
        try:
            conn.execute("PRAGMA journal_mode = WAL")
            conn.executescript(SCHEMA)
            conn.commit()
        finally:
            conn.close()
        _initialized = True


@contextmanager
def tx() -> Iterator[sqlite3.Connection]:
    if not _initialized:
        init_db()
    with _lock:
        conn = _connect()
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()


def one(sql: str, params: tuple[Any, ...] = ()) -> dict[str, Any] | None:
    with tx() as c:
        row = c.execute(sql, params).fetchone()
    return dict(row) if row else None


def many(sql: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
    with tx() as c:
        return [dict(r) for r in c.execute(sql, params).fetchall()]


def run(sql: str, params: tuple[Any, ...] = ()) -> int:
    with tx() as c:
        cur = c.execute(sql, params)
        return cur.rowcount


def dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, default=str)


def loads(value: str | None, default: Any = None) -> Any:
    if not value:
        return default
    return json.loads(value)


def audit(action: str, *, workspace_id: str | None = None, user: dict[str, Any] | None = None, target: str | None = None,
          detail: dict[str, Any] | None = None, ip: str | None = None) -> None:
    run("INSERT INTO audit_log (ts, workspace_id, user_id, user_email, action, target, detail, ip) VALUES (?,?,?,?,?,?,?,?)",
        (now(), workspace_id, user["id"] if user else None, user["email"] if user else None, action, target,
         dumps(detail or {}), ip))
