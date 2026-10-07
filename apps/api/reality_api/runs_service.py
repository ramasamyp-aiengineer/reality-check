"""Run lifecycle: start a workflow in the background, persist every event, fan events out to SSE subscribers."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator, Awaitable, Callable
from typing import Any

from evidence_agents.agents.base import RunInput
from evidence_agents.engine import Workflow, execute_workflow
from evidence_agents.llm.base import LLMConfig, llm_from_env
from evidence_agents.serp.client import SearchBudget, SerpClient, redact

from reality_api import db
from reality_api.config import get_settings

log = logging.getLogger(__name__)
TERMINAL = {"run_completed", "run_failed"}
CompletionHook = Callable[[str, dict[str, Any] | None], Awaitable[None]]


def workspace_llm(ws: dict[str, Any]) -> LLMConfig:
    if ws.get("llm_model"):
        return LLMConfig(model=ws["llm_model"], enabled=True)
    return llm_from_env()


def run_mode(ws: dict[str, Any]) -> str:
    from reality_api.bootstrap import DEMO_WORKSPACE

    demo = get_settings().force_demo or ws["id"] == DEMO_WORKSPACE or ws["mode"] == "demo"
    return "demo" if demo else "live"


class RunManager:
    def __init__(self) -> None:
        self._subscribers: dict[str, set[asyncio.Queue[dict[str, Any]]]] = {}
        self._seq: dict[str, int] = {}
        self._tasks: dict[str, asyncio.Task[None]] = {}
        self.hooks: list[CompletionHook] = []

    def is_active(self, run_id: str) -> bool:
        task = self._tasks.get(run_id)
        return bool(task and not task.done())

    async def start(self, *, ws: dict[str, Any], user_id: str | None, wf: Workflow, run_input: RunInput,
                    api_key: str | None, estimate: int, watch_id: str | None = None) -> str:
        mode = run_mode(ws)
        run_id = db.new_id("run")
        db.run("INSERT INTO runs (id, workspace_id, workflow_id, workflow_name, workflow_doc, input, status, mode, created_by, "
               "created_at, watch_id, estimate) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
               (run_id, ws["id"], wf.id, wf.name, wf.model_dump_json(), run_input.model_dump_json(), "running", mode,
                user_id, db.now(), watch_id, estimate))
        self._seq[run_id] = 0
        self._tasks[run_id] = asyncio.create_task(self._execute(run_id, ws, wf, run_input, api_key, mode))
        return run_id

    async def _emit(self, run_id: str, event: dict[str, Any]) -> None:
        self._seq[run_id] = self._seq.get(run_id, 0) + 1
        seq = self._seq[run_id]
        event = {**event, "seq": seq, "ts": db.now()}
        db.run("INSERT INTO run_events (run_id, seq, ts, event) VALUES (?,?,?,?)", (run_id, seq, event["ts"], db.dumps(event)))
        for q in list(self._subscribers.get(run_id, ())):
            q.put_nowait(event)

    async def _execute(self, run_id: str, ws: dict[str, Any], wf: Workflow, run_input: RunInput, api_key: str | None,
                       mode: str) -> None:
        settings = get_settings()
        result: dict[str, Any] | None = None
        try:
            serp = SerpClient(api_key=api_key if mode == "live" else None, mode=mode,  # type: ignore[arg-type]
                              cache_path=settings.data_dir / "serp_cache.sqlite", fixtures_dir=settings.fixtures_dir,
                              sample_fixtures_dir=settings.sample_fixtures_dir,
                              budget=SearchBudget(max_searches=int(ws["run_budget"])),
                              replay_pacing=settings.replay_pacing)

            async def emit(event: dict[str, Any]) -> None:
                await self._emit(run_id, event)

            result = await execute_workflow(wf, run_input, serp, emit, llm=workspace_llm(ws), secret=api_key)
            self._persist(run_id, ws["id"], result)
        except Exception as exc:  # noqa: BLE001 - surface the failure to the UI, never crash the server
            message = redact(str(exc), api_key)[:400]
            log.warning("Run %s failed: %s", run_id, message)
            db.run("UPDATE runs SET status = 'failed', error = ?, finished_at = ? WHERE id = ?", (message, db.now(), run_id))
            await self._emit(run_id, {"type": "run_failed", "error": message})
        finally:
            for hook in self.hooks:
                try:
                    await hook(run_id, result)
                except Exception:  # noqa: BLE001
                    log.exception("Run completion hook failed")

    def _persist(self, run_id: str, workspace_id: str, result: dict[str, Any]) -> None:
        receipt = result["receipt"]
        verdict = result.get("verdict")
        now = db.now()
        with db.tx() as c:
            c.execute(
                "UPDATE runs SET status = ?, finished_at = ?, verdict_status = ?, decision = ?, confidence = ?, "
                "paid_searches = ?, cache_hits = ?, total_calls = ?, engines = ?, result = ? WHERE id = ?",
                (result["status"], now, verdict["evidence_status"] if verdict else None,
                 verdict["decision"] if verdict else None, verdict["confidence"] if verdict else None,
                 receipt["paid_searches"], receipt["cache_hits"] + receipt.get("fixture_hits", 0), receipt["total_calls"],
                 db.dumps(receipt["engines"]), db.dumps(result), run_id))
            c.executemany(
                "INSERT OR REPLACE INTO evidence (run_id, id, workspace_id, agent, engine, kind, title, snippet, url, source, "
                "published_at, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                [(run_id, e["id"], workspace_id, e["agent"], e["engine"], e["kind"], e["title"], e["snippet"], e["url"],
                  e["source"], e["published_at"], now) for e in result["evidence"]])
            if verdict:
                c.execute("INSERT OR REPLACE INTO verdicts (run_id, workspace_id, status, decision, confidence, headline, "
                          "doc, created_at) VALUES (?,?,?,?,?,?,?,?)",
                          (run_id, workspace_id, verdict["evidence_status"], verdict["decision"], verdict["confidence"],
                           verdict["headline"], db.dumps(verdict), now))
            if result.get("ad_pack"):
                c.execute("INSERT OR REPLACE INTO ad_packs (run_id, workspace_id, topic, doc, created_at) VALUES (?,?,?,?,?)",
                          (run_id, workspace_id, result["ad_pack"]["topic"], db.dumps(result["ad_pack"]), now))

    async def stream(self, run_id: str, after_seq: int = 0) -> AsyncIterator[dict[str, Any]]:
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
        self._subscribers.setdefault(run_id, set()).add(queue)
        try:
            last = after_seq
            for row in db.many("SELECT event FROM run_events WHERE run_id = ? AND seq > ? ORDER BY seq", (run_id, after_seq)):
                event = db.loads(row["event"])
                last = event["seq"]
                yield event
                if event["type"] in TERMINAL:
                    return
            if not self.is_active(run_id):
                return
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=15)
                except TimeoutError:
                    if not self.is_active(run_id):
                        return
                    yield {"type": "ping"}
                    continue
                if event["seq"] <= last:
                    continue
                yield event
                if event["type"] in TERMINAL:
                    return
        finally:
            self._subscribers.get(run_id, set()).discard(queue)


manager = RunManager()
