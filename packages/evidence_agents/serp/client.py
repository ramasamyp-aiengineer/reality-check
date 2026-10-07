"""SerpApi access layer used by every agent.

- `live`   : real SerpApi calls, cached locally in SQLite (identical params are never paid twice)
- `record` : live calls that are also written to `fixtures/serp/` (key scrubbed) for demo mode and tests
- `demo`   : replays fixtures only; never touches the network and never needs a key

A `SearchBudget` caps paid searches per run, and every call is recorded on the
run receipt (engine, cached or not, latency) so the UI can show exactly what
SerpApi did.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import random
import sqlite3
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal

import httpx

SERPAPI_URL = "https://serpapi.com/search.json"
ACCOUNT_URL = "https://serpapi.com/account.json"
Mode = Literal["live", "record", "demo"]

_PRIMARY_KEYS = ("q", "product_id", "data_id", "text", "page_token", "advertiser_id", "url", "departure_id")
_IGNORED_KEYS = {"api_key", "no_cache", "output", "async"}


class SerpError(RuntimeError):
    pass


class BudgetExceeded(SerpError):
    pass


def redact(text: str, secret: str | None) -> str:
    if secret and secret in text:
        return text.replace(secret, "REDACTED")
    return text


def params_hash(params: dict[str, Any]) -> str:
    clean = {k: str(v) for k, v in sorted(params.items()) if k not in _IGNORED_KEYS}
    return hashlib.sha256(json.dumps(clean, sort_keys=True).encode()).hexdigest()[:20]


def primary_key(params: dict[str, Any]) -> str:
    engine = str(params.get("engine", "google"))
    for key in _PRIMARY_KEYS:
        if params.get(key):
            extra = params.get("data_type") or params.get("type") or ("reviews" if params.get("all_reviews") else "")
            return f"{engine}|{key}={str(params[key]).strip().lower()}|{extra}".lower()
    return f"{engine}|"


@dataclass
class SearchRecord:
    engine: str
    query: str
    cached: bool
    source: Literal["serpapi", "cache", "fixture", "missing"]
    status: str
    ms: int
    node_id: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return self.__dict__.copy()


@dataclass
class SearchBudget:
    max_searches: int = 15
    used: int = 0
    _lock: threading.Lock = field(default_factory=threading.Lock, repr=False)

    def reserve(self) -> None:
        with self._lock:
            if self.used >= self.max_searches:
                raise BudgetExceeded(f"Search budget of {self.max_searches} reached for this run")
            self.used += 1

    def refund(self) -> None:
        with self._lock:
            self.used = max(0, self.used - 1)


class ResponseCache:
    def __init__(self, path: Path, ttl_seconds: int = 24 * 3600) -> None:
        self.path = path
        self.ttl = ttl_seconds
        path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        with self._connect() as db:
            db.execute(
                "CREATE TABLE IF NOT EXISTS serp_cache (hash TEXT PRIMARY KEY, engine TEXT, created REAL, body TEXT)"
            )

    def _connect(self) -> sqlite3.Connection:
        return sqlite3.connect(self.path, timeout=10)

    def get(self, key: str) -> dict[str, Any] | None:
        with self._lock, self._connect() as db:
            row = db.execute("SELECT created, body FROM serp_cache WHERE hash = ?", (key,)).fetchone()
        if not row or time.time() - row[0] > self.ttl:
            return None
        return json.loads(row[1])

    def put(self, key: str, engine: str, body: dict[str, Any]) -> None:
        with self._lock, self._connect() as db:
            db.execute(
                "INSERT OR REPLACE INTO serp_cache (hash, engine, created, body) VALUES (?, ?, ?, ?)",
                (key, engine, time.time(), json.dumps(body)),
            )


class FixtureStore:
    """Recorded responses, matched by exact params hash first, then by engine + primary query."""

    def __init__(self, root: Path, fallbacks: list[Path] | None = None) -> None:
        self.root = root
        self.fallbacks = fallbacks or []
        self._by_hash: dict[str, dict[str, Any]] = {}
        self._by_primary: dict[str, dict[str, Any]] = {}
        self._loaded = False

    def _load(self) -> None:
        if self._loaded:
            return
        self._loaded = True
        for directory in [self.root, *self.fallbacks]:
            if not directory.exists():
                continue
            for path in sorted(directory.glob("*.json")):
                try:
                    doc = json.loads(path.read_text(encoding="utf-8"))
                except (OSError, json.JSONDecodeError):
                    continue
                params = doc.get("params", {})
                self._by_hash.setdefault(params_hash(params), doc)
                self._by_primary.setdefault(primary_key(params), doc)

    def find(self, params: dict[str, Any]) -> dict[str, Any] | None:
        self._load()
        doc = self._by_hash.get(params_hash(params)) or self._by_primary.get(primary_key(params))
        return doc.get("response") if doc else None

    def write(self, params: dict[str, Any], response: dict[str, Any], api_key: str | None) -> Path:
        self.root.mkdir(parents=True, exist_ok=True)
        safe_params = {k: v for k, v in params.items() if k not in _IGNORED_KEYS}
        name = f"{params.get('engine', 'google')}__{params_hash(params)}.json"
        body = json.dumps({"params": safe_params, "response": response}, indent=1, ensure_ascii=False)
        path = self.root / name
        path.write_text(redact(body, api_key), encoding="utf-8")
        self._by_hash[params_hash(params)] = {"params": safe_params, "response": response}
        return path


class SerpClient:
    def __init__(
        self,
        *,
        api_key: str | None,
        mode: Mode = "live",
        cache_path: Path | None = None,
        fixtures_dir: Path | None = None,
        sample_fixtures_dir: Path | None = None,
        budget: SearchBudget | None = None,
        timeout: float = 40.0,
        use_cache: bool = True,
        replay_pacing: tuple[float, float] | None = None,
    ) -> None:
        if mode in ("live", "record") and not api_key:
            raise SerpError("A SerpApi key is required in live mode")
        self._api_key = api_key
        self.mode: Mode = mode
        self.cache = ResponseCache(cache_path) if cache_path and use_cache else None
        fallbacks = [sample_fixtures_dir] if sample_fixtures_dir and mode == "demo" else []
        self.fixtures = FixtureStore(fixtures_dir, fallbacks) if fixtures_dir else None
        self.budget = budget or SearchBudget()
        self.timeout = timeout
        # Demo replays are instant; optional pacing mimics real search latency so live views stay readable.
        self.replay_pacing = replay_pacing if mode == "demo" else None
        self.records: list[SearchRecord] = []
        self._records_lock = threading.Lock()

    def _record(self, rec: SearchRecord) -> None:
        with self._records_lock:
            self.records.append(rec)

    def receipt(self) -> dict[str, Any]:
        engines: dict[str, int] = {}
        for r in self.records:
            engines[r.engine] = engines.get(r.engine, 0) + 1
        return {
            "mode": self.mode,
            "total_calls": len(self.records),
            "paid_searches": sum(1 for r in self.records if r.source == "serpapi"),
            "cache_hits": sum(1 for r in self.records if r.source == "cache"),
            "fixture_hits": sum(1 for r in self.records if r.source == "fixture"),
            "synthetic_hits": sum(1 for r in self.records if r.status == "synthetic sample"),
            "missing": sum(1 for r in self.records if r.source == "missing"),
            "engines": engines,
            "records": [r.to_dict() for r in self.records],
        }

    def _lookup_local(self, params: dict[str, Any], node_id: str | None) -> tuple[dict[str, Any] | None, float]:
        start = time.perf_counter()
        engine = str(params.get("engine", "google"))
        query = primary_key(params).split("|")[1]
        if self.mode == "demo":
            body = self.fixtures.find(params) if self.fixtures else None
            src: Literal["fixture", "missing"] = "fixture" if body is not None else "missing"
            status = "no fixture" if body is None else "synthetic sample" if body.get("_synthetic") else "recorded"
            self._record(SearchRecord(engine, query, True, src, status,
                                      int((time.perf_counter() - start) * 1000), node_id))
            return (body or {"search_metadata": {"status": "Missing fixture"}, "error": "No recorded fixture"}), start
        if self.cache and not params.get("no_cache"):
            cached = self.cache.get(params_hash(params))
            if cached is not None:
                self._record(SearchRecord(engine, query, True, "cache", "ok",
                                          int((time.perf_counter() - start) * 1000), node_id))
                return cached, start
        return None, start

    def _store(self, params: dict[str, Any], body: dict[str, Any], start: float, node_id: str | None) -> None:
        engine = str(params.get("engine", "google"))
        status = str(body.get("search_metadata", {}).get("status", "ok"))
        if self.cache:
            self.cache.put(params_hash(params), engine, body)
        if self.mode == "record" and self.fixtures:
            self.fixtures.write(params, body, self._api_key)
        self._record(SearchRecord(engine, primary_key(params).split("|")[1], False, "serpapi", status,
                                  int((time.perf_counter() - start) * 1000), node_id))

    def _query(self, params: dict[str, Any]) -> dict[str, Any]:
        return {**params, "api_key": self._api_key, "output": "json"}

    def _handle(self, resp: httpx.Response) -> dict[str, Any]:
        if resp.status_code == 429:
            raise SerpError("SerpApi rate limit reached (429). Try again later or lower the workflow size.")
        if resp.status_code == 401:
            raise SerpError("SerpApi rejected the API key (401).")
        try:
            body = resp.json()
        except json.JSONDecodeError as exc:
            raise SerpError(f"SerpApi returned a non-JSON response ({resp.status_code})") from exc
        if resp.status_code >= 400 and "error" not in body:
            raise SerpError(f"SerpApi error {resp.status_code}")
        return body

    async def search(self, params: dict[str, Any], node_id: str | None = None) -> dict[str, Any]:
        local, start = self._lookup_local(params, node_id)
        if local is not None:
            if self.replay_pacing:
                await asyncio.sleep(random.uniform(*self.replay_pacing))  # noqa: S311 - pacing only
            return local
        self.budget.reserve()
        last_exc: Exception | None = None
        for attempt in range(3):
            try:
                async with httpx.AsyncClient(timeout=self.timeout) as http:
                    resp = await http.get(SERPAPI_URL, params=self._query(params))
                if resp.status_code >= 500:
                    raise SerpError(f"SerpApi server error {resp.status_code}")
                body = self._handle(resp)
                self._store(params, body, start, node_id)
                return body
            except (httpx.TransportError, SerpError) as exc:
                last_exc = exc
                if isinstance(exc, SerpError) and "server error" not in str(exc):
                    break
                await asyncio.sleep(0.8 * (attempt + 1))
        self.budget.refund()
        raise SerpError(redact(str(last_exc), self._api_key))

    def search_sync(self, params: dict[str, Any]) -> dict[str, Any]:
        """Blocking variant; satisfies the `serpapi_search_tools.SearchClient` protocol via `search_tools_client`."""
        local, start = self._lookup_local(params, "assistant")
        if local is not None:
            return local
        self.budget.reserve()
        try:
            with httpx.Client(timeout=self.timeout) as http:
                body = self._handle(http.get(SERPAPI_URL, params=self._query(params)))
        except Exception as exc:
            self.budget.refund()
            raise SerpError(redact(str(exc), self._api_key)) from None
        self._store(params, body, start, "assistant")
        return body

    def search_tools_client(self) -> Any:
        client = self

        class _Adapter:
            def search(self, params: dict[str, Any]) -> dict[str, Any]:
                return client.search_sync({k: v for k, v in params.items() if k != "api_key"})

        return _Adapter()


async def fetch_account(api_key: str, timeout: float = 15.0) -> dict[str, Any]:
    """SerpApi Account API: plan and remaining searches. Free; does not consume a search."""
    async with httpx.AsyncClient(timeout=timeout) as http:
        resp = await http.get(ACCOUNT_URL, params={"api_key": api_key})
    if resp.status_code == 401:
        raise SerpError("Invalid SerpApi key")
    if resp.status_code >= 400:
        raise SerpError(f"SerpApi account lookup failed ({resp.status_code})")
    data = resp.json()
    if "error" in data:
        raise SerpError(redact(str(data["error"]), api_key))
    return {
        "account_email": data.get("account_email"),
        "plan_name": data.get("plan_name"),
        "searches_per_month": data.get("searches_per_month"),
        "plan_searches_left": data.get("plan_searches_left"),
        "total_searches_left": data.get("total_searches_left"),
        "this_month_usage": data.get("this_month_usage"),
        "rate_limit_per_hour": data.get("account_rate_limit_per_hour"),
        "last_hour_searches": data.get("last_hour_searches"),
    }
