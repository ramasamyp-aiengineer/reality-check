import json

import httpx
import pytest
from evidence_agents.serp import client as serp_mod
from evidence_agents.serp.client import (
    BudgetExceeded,
    SearchBudget,
    SerpClient,
    SerpError,
    params_hash,
    redact,
)

from .conftest import ROOT

FAKE_KEY = "a" * 64


def test_redact_and_hash_ignore_key():
    assert redact(f"error for key {FAKE_KEY}", FAKE_KEY) == "error for key REDACTED"
    base = {"engine": "google_news", "q": "quickrupee"}
    assert params_hash(base) == params_hash({**base, "api_key": FAKE_KEY})


def test_live_mode_requires_key():
    with pytest.raises(SerpError):
        SerpClient(api_key=None, mode="live")


def test_budget_is_enforced():
    budget = SearchBudget(max_searches=2)
    budget.reserve()
    budget.reserve()
    with pytest.raises(BudgetExceeded):
        budget.reserve()
    budget.refund()
    budget.reserve()


async def test_demo_mode_replays_sample_fixtures_and_never_calls_network(monkeypatch):
    def boom(*args, **kwargs):
        raise AssertionError("demo mode must not touch the network")

    monkeypatch.setattr(serp_mod.httpx, "AsyncClient", boom)
    serp = SerpClient(api_key=None, mode="demo", fixtures_dir=ROOT / "fixtures" / "serp",
                      sample_fixtures_dir=ROOT / "fixtures" / "sample")
    body = await serp.search({"engine": "google_news", "q": "QuickRupee loan app"}, node_id="news")
    assert body.get("news_results")
    missing = await serp.search({"engine": "google_news", "q": "a query with no recording"}, node_id="news")
    assert "error" in missing
    receipt = serp.receipt()
    assert receipt["paid_searches"] == 0
    assert receipt["fixture_hits"] == 1 and receipt["missing"] == 1


def _mock_serpapi(monkeypatch, handler):
    real = httpx.AsyncClient
    monkeypatch.setattr(serp_mod.httpx, "AsyncClient", lambda **kw: real(transport=httpx.MockTransport(handler), **kw))


async def test_live_search_is_cached_and_counted(monkeypatch, tmp_path):
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return httpx.Response(200, json={"search_metadata": {"status": "Success"}, "organic_results": [{"title": "x"}]})

    _mock_serpapi(monkeypatch, handler)
    serp = SerpClient(api_key=FAKE_KEY, mode="live", cache_path=tmp_path / "cache.sqlite", budget=SearchBudget(5))
    params = {"engine": "google_light", "q": "quickrupee complaints"}
    await serp.search(params, node_id="web")
    await serp.search(params, node_id="web")
    assert len(calls) == 1
    receipt = serp.receipt()
    assert receipt["paid_searches"] == 1 and receipt["cache_hits"] == 1
    assert serp.budget.used == 1
    assert FAKE_KEY not in json.dumps(receipt)


async def test_key_never_leaks_in_errors(monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError(f"connection failed for {request.url}", request=request)

    async def no_sleep(_):
        return None

    _mock_serpapi(monkeypatch, handler)
    monkeypatch.setattr(serp_mod.asyncio, "sleep", no_sleep)
    serp = SerpClient(api_key=FAKE_KEY, mode="live")
    with pytest.raises(SerpError) as exc:
        await serp.search({"engine": "google", "q": "x"})
    assert FAKE_KEY not in str(exc.value)
    assert serp.budget.used == 0


async def test_record_mode_writes_fixture_without_key(monkeypatch, tmp_path):
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.params["api_key"] == FAKE_KEY
        return httpx.Response(200, json={"search_metadata": {"status": "Success"}, "echo": f"key={FAKE_KEY}"})

    _mock_serpapi(monkeypatch, handler)
    serp = SerpClient(api_key=FAKE_KEY, mode="record", fixtures_dir=tmp_path)
    await serp.search({"engine": "google_news", "q": "ev scooter"})
    files = list(tmp_path.glob("*.json"))
    assert len(files) == 1
    text = files[0].read_text(encoding="utf-8")
    assert FAKE_KEY not in text and "REDACTED" in text
    assert "api_key" not in json.loads(text)["params"]
