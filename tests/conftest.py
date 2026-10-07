"""Test isolation: a throwaway data directory, demo mode forced on, no real SerpApi key and no replay delays.

These variables must be set before `reality_api` is imported because settings are cached on first use.
"""

from __future__ import annotations

import os
import shutil
import tempfile
from pathlib import Path

import pytest

_DATA_DIR = Path(tempfile.mkdtemp(prefix="rc-tests-"))
os.environ.update(
    {
        "RC_DATA_DIR": str(_DATA_DIR),
        "RC_FORCE_DEMO": "1",
        "RC_REPLAY_PACING": "0",
        "ALLOW_DEMO_LOGIN": "1",
        "SERPAPI_API_KEY": "",
        "LLM_MODEL": "",
        "APP_SECRET_KEY": "test-secret-key-for-pytest-only-0123456789",
        "TELEGRAM_BOT_TOKEN": "",
        "SMTP_HOST": "",
    }
)

ROOT = Path(__file__).resolve().parents[1]


def pytest_sessionfinish(session: pytest.Session, exitstatus: int) -> None:
    shutil.rmtree(_DATA_DIR, ignore_errors=True)


@pytest.fixture(scope="session")
def client():
    from fastapi.testclient import TestClient
    from reality_api.main import app

    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="session")
def demo_client(client):
    r = client.post("/api/auth/demo")
    assert r.status_code == 200, r.text
    client.headers["x-csrf-token"] = client.cookies.get("rc_csrf") or ""
    return client
