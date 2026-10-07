"""Passwords (Argon2id), sessions (hashed opaque tokens), CSRF, encrypted secrets (AES-GCM) and roles."""

from __future__ import annotations

import base64
import hashlib
import hmac
import os
import secrets
from functools import lru_cache
from typing import Any

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from pwdlib import PasswordHash
from pwdlib.hashers.argon2 import Argon2Hasher

from reality_api import db
from reality_api.config import get_settings

ROLES = ("viewer", "analyst", "admin")
SESSION_COOKIE = "rc_session"
CSRF_COOKIE = "rc_csrf"
CSRF_HEADER = "x-csrf-token"
MAX_FAILED_LOGINS = 5
LOCKOUT_SECONDS = 15 * 60

_hasher = PasswordHash((Argon2Hasher(),))
_DUMMY_HASH = _hasher.hash("timing-equaliser-not-a-password")


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, hashed: str | None) -> bool:
    if not hashed:
        _hasher.verify(password, _DUMMY_HASH)
        return False
    try:
        return _hasher.verify(password, hashed)
    except Exception:  # noqa: BLE001 - malformed hash means "no match"
        return False


def password_problems(password: str) -> list[str]:
    problems = []
    if len(password) < 10:
        problems.append("at least 10 characters")
    if password.lower() == password or password.upper() == password:
        problems.append("mixed upper and lower case")
    if not any(c.isdigit() for c in password):
        problems.append("at least one digit")
    return problems


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def role_at_least(role: str, minimum: str) -> bool:
    return ROLES.index(role) >= ROLES.index(minimum)


def create_session(user_id: str, workspace_id: str, ip: str | None, user_agent: str | None) -> tuple[str, str]:
    token = secrets.token_urlsafe(32)
    csrf = secrets.token_urlsafe(24)
    now = db.now()
    db.run("INSERT INTO sessions (token_hash, user_id, workspace_id, csrf, created_at, expires_at, ip, user_agent) "
           "VALUES (?,?,?,?,?,?,?,?)",
           (token_hash(token), user_id, workspace_id, csrf, now, now + get_settings().session_hours * 3600, ip,
            (user_agent or "")[:200]))
    return token, csrf


def resolve_session(token: str | None) -> dict[str, Any] | None:
    if not token:
        return None
    row = db.one(
        "SELECT s.token_hash, s.csrf, s.expires_at, s.workspace_id, u.id AS user_id, u.email, u.name, u.is_demo, m.role "
        "FROM sessions s JOIN users u ON u.id = s.user_id "
        "JOIN memberships m ON m.user_id = u.id AND m.workspace_id = s.workspace_id WHERE s.token_hash = ?",
        (token_hash(token),))
    if not row or row["expires_at"] < db.now():
        if row:
            db.run("DELETE FROM sessions WHERE token_hash = ?", (row["token_hash"],))
        return None
    return row


def resolve_api_token(token: str) -> dict[str, Any] | None:
    row = db.one(
        "SELECT t.id AS token_id, t.workspace_id, u.id AS user_id, u.email, u.name, u.is_demo, m.role "
        "FROM api_tokens t JOIN users u ON u.id = t.user_id "
        "JOIN memberships m ON m.user_id = u.id AND m.workspace_id = t.workspace_id WHERE t.token_hash = ?",
        (token_hash(token),))
    if row:
        db.run("UPDATE api_tokens SET last_used_at = ? WHERE id = ?", (db.now(), row["token_id"]))
    return row


def csrf_valid(session_csrf: str, header_value: str | None) -> bool:
    return bool(header_value) and hmac.compare_digest(session_csrf, header_value or "")


@lru_cache(maxsize=1)
def _master_key() -> bytes:
    settings = get_settings()
    raw = settings.app_secret_key
    if not raw:
        path = settings.data_dir / ".app_secret"
        if not path.exists():
            path.write_text(base64.urlsafe_b64encode(os.urandom(32)).decode(), encoding="utf-8")
            try:
                os.chmod(path, 0o600)
            except OSError:
                pass
        raw = path.read_text(encoding="utf-8").strip()
    return HKDF(algorithm=hashes.SHA256(), length=32, salt=b"reality-check/secrets", info=b"aes-gcm").derive(raw.encode())


def derived_key(label: str) -> str:
    return base64.urlsafe_b64encode(
        HKDF(algorithm=hashes.SHA256(), length=32, salt=b"reality-check/derived", info=label.encode()).derive(_master_key())
    ).decode()


def encrypt_secret(workspace_id: str, name: str, value: str) -> None:
    nonce = os.urandom(12)
    ct = AESGCM(_master_key()).encrypt(nonce, value.encode(), f"{workspace_id}:{name}".encode())
    db.run("INSERT OR REPLACE INTO secrets (workspace_id, name, nonce, ciphertext, last4, created_at) VALUES (?,?,?,?,?,?)",
           (workspace_id, name, nonce, ct, value[-4:], db.now()))


def decrypt_secret(workspace_id: str, name: str) -> str | None:
    row = db.one("SELECT nonce, ciphertext FROM secrets WHERE workspace_id = ? AND name = ?", (workspace_id, name))
    if not row:
        return None
    try:
        return AESGCM(_master_key()).decrypt(row["nonce"], row["ciphertext"], f"{workspace_id}:{name}".encode()).decode()
    except Exception:  # noqa: BLE001 - wrong master key or tampering: treat as missing
        return None


def mask(value: str | None) -> str | None:
    return f"****{value[-4:]}" if value else None
