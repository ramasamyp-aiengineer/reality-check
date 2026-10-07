"""SerpApi key resolution.

Order: key held in server memory for this session only (default) -> key the workspace chose to
remember (AES-GCM encrypted at rest) -> SERPAPI_API_KEY from .env (local single-user setups).
Keys are never returned to the browser and never logged.
"""

from __future__ import annotations

import time
from typing import Any

from evidence_agents.serp.client import fetch_account

from reality_api.config import get_settings
from reality_api.security import decrypt_secret

_SESSION_KEYS: dict[str, str] = {}
_ACCOUNT_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}


def set_session_key(session_hash: str, key: str) -> None:
    _SESSION_KEYS[session_hash] = key


def drop_session_key(session_hash: str | None) -> None:
    if session_hash:
        _SESSION_KEYS.pop(session_hash, None)


def resolve_key(workspace_id: str, session_hash: str | None) -> tuple[str | None, str]:
    if session_hash and session_hash in _SESSION_KEYS:
        return _SESSION_KEYS[session_hash], "session"
    stored = decrypt_secret(workspace_id, "serpapi")
    if stored:
        return stored, "workspace"
    settings = get_settings()
    if settings.allow_env_serpapi_key and settings.env_serpapi_key:
        return settings.env_serpapi_key, "env"
    return None, "none"


async def account_status(key: str, force: bool = False) -> dict[str, Any]:
    cache_key = key[-8:]
    hit = _ACCOUNT_CACHE.get(cache_key)
    if hit and not force and time.time() - hit[0] < 60:
        return hit[1]
    data = await fetch_account(key)
    _ACCOUNT_CACHE[cache_key] = (time.time(), data)
    return data
