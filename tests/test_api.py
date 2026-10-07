import json
import time

import pytest
from reality_api import db


def wait_for_run(c, run_id: str, timeout: float = 30) -> dict:
    deadline = time.time() + timeout
    while time.time() < deadline:
        run = c.get(f"/api/runs/{run_id}").json()
        if run["status"] not in ("queued", "running"):
            return run
        time.sleep(0.2)
    raise AssertionError("run did not finish")


def test_health_and_security_headers(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    h = r.headers
    assert h["x-content-type-options"] == "nosniff"
    assert h["x-frame-options"] == "DENY"
    assert "default-src 'self'" in h["content-security-policy"]
    assert "script-src 'self'" in h["content-security-policy"]
    assert h["cache-control"] == "no-store"


def test_protected_routes_require_login():
    from fastapi.testclient import TestClient
    from reality_api.main import app

    with TestClient(app) as anon:
        assert anon.get("/api/auth/me").status_code == 401
        assert anon.get("/api/runs").status_code == 401
        assert anon.post("/api/runs", json={}).status_code in (401, 403)


def test_csrf_required_for_writes(demo_client):
    token = demo_client.headers.pop("x-csrf-token")
    try:
        r = demo_client.post("/api/workflows/validate", json={"id": "x", "name": "x", "nodes": [], "edges": []})
        assert r.status_code == 403
    finally:
        demo_client.headers["x-csrf-token"] = token


def test_demo_identity_and_catalog(demo_client):
    me = demo_client.get("/api/auth/me").json()
    assert me["user"]["is_demo"] is True
    assert me["user"]["role"] == "analyst"
    assert len(demo_client.get("/api/agents").json()["agents"]) >= 18
    assert len(demo_client.get("/api/engines").json()["engines"]) >= 16
    wfs = demo_client.get("/api/workflows").json()
    assert {"loan_forward_check", "market_pulse_ads"} <= {t["id"] for t in wfs["templates"]}


def test_run_requires_approval(demo_client):
    r = demo_client.post("/api/runs", json={"workflow_id": "loan_forward_check", "input": {"text": "x"}, "approved": False})
    assert r.status_code == 400


def test_loan_run_end_to_end(demo_client):
    r = demo_client.post("/api/runs", json={
        "workflow_id": "loan_forward_check",
        "input": {"text": "Instant Personal Loan Rs 50,000 in 5 minutes! No CIBIL check. Download QuickRupee app now"},
        "approved": True,
    })
    assert r.status_code == 200, r.text
    run_id = r.json()["id"]
    run = wait_for_run(demo_client, run_id)
    assert run["status"].startswith("completed")
    assert run["verdict_status"] == "CONTRADICTED"
    assert run["decision"] == "DO_NOT_PROCEED"
    assert run["paid_searches"] == 0

    with demo_client.stream("GET", f"/api/runs/{run_id}/events") as stream:
        events = [json.loads(line[5:]) for line in stream.iter_lines() if line.startswith("data:")]
    types = [e["type"] for e in events]
    assert types[0] == "run_started" and types[-1] == "run_completed"
    assert [e["seq"] for e in events] == sorted(e["seq"] for e in events)

    pdf = demo_client.get(f"/api/runs/{run_id}/report.pdf")
    assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF")

    ev = demo_client.get(f"/api/evidence?run_id={run_id}").json()
    assert ev["items"] and ev["facets"]
    usage = demo_client.get("/api/usage?days=7").json()
    assert usage["totals"]["runs"] >= 1


def test_workflow_validate_and_plan(demo_client):
    bad = demo_client.post("/api/workflows/validate", json={"id": "x", "name": "x", "nodes": [{"id": "a", "agent": "news_timeline"}], "edges": []})
    assert bad.status_code == 200 and bad.json()["problems"]
    plan = demo_client.post("/api/workflows/plan", json={"prompt": "watch competitor ads and prices for my electric scooter"})
    assert plan.status_code == 200
    body = plan.json()
    assert body["workflow"]["nodes"] and body["problems"] == []
    assert body["estimate"]["total"] <= 15


def test_image_url_ssrf_rejected(demo_client):
    r = demo_client.post("/api/runs", json={"workflow_id": "image_check", "approved": True,
                                            "input": {"text": "", "image_url": "http://169.254.169.254/latest"}})
    assert r.status_code == 422


def test_watch_lifecycle(demo_client):
    r = demo_client.post("/api/watches", json={"name": "Competitor ads", "workflow_id": "competitor_watch",
                                               "input": {"text": "ZipVolt electric scooter"}, "interval_minutes": 60})
    assert r.status_code == 200, r.text
    watch = r.json()
    wait_for_run(demo_client, watch["started_run_id"])
    second = demo_client.post(f"/api/watches/{watch['id']}/run").json()["run_id"]
    wait_for_run(demo_client, second)
    time.sleep(0.5)
    listed = next(w for w in demo_client.get("/api/watches").json()["watches"] if w["id"] == watch["id"])
    assert len(listed["history"]) >= 2
    assert demo_client.patch(f"/api/watches/{watch['id']}", json={"active": False}).json()["active"] is False
    assert demo_client.delete(f"/api/watches/{watch['id']}").status_code == 200


def test_analyst_cannot_read_audit_or_change_settings(demo_client):
    assert demo_client.get("/api/audit").status_code == 403
    assert demo_client.put("/api/settings", json={"run_budget": 60}).status_code == 403


@pytest.fixture(scope="module")
def admin_client(demo_client):
    from fastapi.testclient import TestClient
    from reality_api.main import app

    with TestClient(app) as c:
        state = c.get("/api/auth/state").json()
        assert state["needs_setup"] is True
        weak = c.post("/api/auth/setup", json={"name": "Asha", "email": "asha@example.in", "password": "short"})
        assert weak.status_code == 422
        r = c.post("/api/auth/setup", json={"name": "Asha", "email": "asha@example.in", "password": "Str0ngPassw0rd!",
                                           "workspace_name": "Asha Labs"})
        assert r.status_code == 200, r.text
        c.headers["x-csrf-token"] = c.cookies.get("rc_csrf") or ""
        yield c


def test_admin_flows_and_encrypted_key_storage(admin_client, monkeypatch):
    c = admin_client
    me = c.get("/api/auth/me").json()
    assert me["user"]["role"] == "admin"
    assert c.post("/api/auth/setup", json={"name": "Eve", "email": "eve@example.in", "password": "Str0ngPassw0rd!"}).status_code == 409

    saved = c.put("/api/settings", json={"run_budget": 12, "retention_days": 30})
    assert saved.status_code == 200 and saved.json()["run_budget"] == 12

    async def fake_account(key, force=False):
        return {"plan_name": "Developer", "total_searches_left": 4900}

    monkeypatch.setattr("reality_api.routers.keys.account_status", fake_account)
    secret = "k" * 64
    r = c.put("/api/keys/serpapi", json={"api_key": secret, "remember": True})
    assert r.status_code == 200, r.text
    assert secret not in r.text and r.json()["masked"].endswith(secret[-4:])
    status = c.get("/api/keys/serpapi/status").json()
    assert status["connected"] and status["scope"] == "workspace"
    assert secret not in json.dumps(status)
    stored = db.many("SELECT * FROM secrets")
    assert stored and all(secret not in json.dumps(row, default=str) for row in stored)
    assert all(secret not in json.dumps(e) for e in c.get("/api/audit").json()["entries"])

    member = c.post("/api/members", json={"email": "ravi@example.in", "name": "Ravi", "role": "viewer", "password": "An0therStr0ngOne"})
    assert member.status_code == 200
    roles = {m["email"]: m["role"] for m in c.get("/api/members").json()["members"]}
    assert roles["ravi@example.in"] == "viewer"

    token = c.post("/api/tokens", json={"name": "ci"}).json()["token"]
    from fastapi.testclient import TestClient
    from reality_api.main import app

    with TestClient(app) as api_client:
        r = api_client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200 and r.json()["user"]["email"] == "asha@example.in"
        assert api_client.get("/api/auth/me", headers={"Authorization": "Bearer rc_wrong"}).status_code == 401


def test_admin_can_open_demo_and_return_without_signing_in(admin_client):
    from fastapi.testclient import TestClient
    from reality_api.main import app

    with TestClient(app) as c:
        assert c.post("/api/auth/login", json={"email": "asha@example.in", "password": "Str0ngPassw0rd!"}).status_code == 200
        assert c.post("/api/auth/demo").status_code == 200
        me = c.get("/api/auth/me").json()
        assert me["user"]["is_demo"] and me["can_return"] and me["workspace"]["mode"] == "demo"
        assert c.post("/api/auth/return").status_code == 200
        me = c.get("/api/auth/me").json()
        assert me["user"]["email"] == "asha@example.in" and not me["can_return"]
        assert c.post("/api/auth/return").status_code == 401


def test_run_mode_keeps_demo_workspace_on_replay(monkeypatch):
    from types import SimpleNamespace

    from reality_api.runs_service import run_mode

    monkeypatch.setattr("reality_api.runs_service.get_settings", lambda: SimpleNamespace(force_demo=False))
    assert run_mode({"id": "ws_demo", "mode": "live"}) == "demo"
    assert run_mode({"id": "ws_real", "mode": "live"}) == "live"
    assert run_mode({"id": "ws_real", "mode": "demo"}) == "demo"


def test_login_lockout_and_generic_errors(admin_client):
    from fastapi.testclient import TestClient
    from reality_api.main import app

    with TestClient(app) as c:
        unknown = c.post("/api/auth/login", json={"email": "nobody@example.in", "password": "whatever"})
        wrong = c.post("/api/auth/login", json={"email": "asha@example.in", "password": "wrong-password"})
        assert unknown.status_code == wrong.status_code == 401
        assert unknown.json()["detail"] == wrong.json()["detail"]
