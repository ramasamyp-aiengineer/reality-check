"""Small, transparent DAG executor.

Nodes start as soon as all their parents finish, so independent agents run in parallel.
Every state change is emitted as an event (streamed to the UI over SSE). A failing node
never aborts the run: downstream agents simply see less evidence, and the verdict reports
INSUFFICIENT EVIDENCE instead of guessing.
"""

from __future__ import annotations

import asyncio
import time
from typing import Any

from evidence_agents.agents import get_agent
from evidence_agents.agents.base import AgentContext, AgentOutput, Emit, RunInput
from evidence_agents.engine.evidence_graph import build_graph
from evidence_agents.engine.workflow import (
    Workflow,
    WorkflowError,
    ancestors,
    estimate_searches,
    topo_order,
    validate_workflow,
)
from evidence_agents.serp.client import BudgetExceeded, SerpClient, redact
from evidence_agents.signals import AdPack, BusinessProfile, MarketBrief, Signal, SignalBag, Verdict

NODE_TIMEOUT_SECONDS = 120


def _seed_signals(run_input: RunInput) -> list[Signal]:
    if run_input.profile and run_input.profile.get("topic"):
        p = run_input.profile
        return [BusinessProfile(
            agent="input",
            business_name=p.get("business_name") or "",
            topic=p["topic"],
            city=p.get("city"),
            price=float(p["price"]) if p.get("price") not in (None, "") else None,
            usp=p.get("usp"),
            audience=p.get("audience"),
            competitors=[c.strip() for c in (p.get("competitors") or []) if c and c.strip()],
        )]
    return []


async def execute_workflow(
    wf: Workflow,
    run_input: RunInput,
    serp: SerpClient,
    emit: Emit,
    llm: Any = None,
    secret: str | None = None,
) -> dict[str, Any]:
    problems = validate_workflow(wf)
    if problems:
        raise WorkflowError("; ".join(problems))

    started = time.perf_counter()
    order = topo_order(wf)
    anc = ancestors(wf)
    nodes = {n.id: n for n in wf.nodes}
    parents = {n.id: [e.source for e in wf.edges if e.target == n.id] for n in wf.nodes}
    seed = _seed_signals(run_input)
    outputs: dict[str, AgentOutput] = {}
    status: dict[str, str] = {nid: "waiting" for nid in order}
    done = {nid: asyncio.Event() for nid in order}

    await emit({"type": "run_started", "workflow_id": wf.id, "order": order,
                "estimate": estimate_searches(wf), "mode": serp.mode})

    async def run_node(node_id: str) -> None:
        for p in parents[node_id]:
            await done[p].wait()
        node = nodes[node_id]
        agent = get_agent(node.agent)
        bag = SignalBag()
        bag.add(seed, [])
        for prior in order:
            if prior in anc[node_id] and prior in outputs:
                bag.add(outputs[prior].signals, outputs[prior].evidence)
        status[node_id] = "running"
        await emit({"type": "node_started", "node_id": node_id, "agent": node.agent})
        t0 = time.perf_counter()
        ctx = AgentContext(node_id=node_id, params=node.params, bag=bag, serp=serp,
                           run_input=run_input, emit=emit, llm=llm)
        try:
            out = await asyncio.wait_for(agent.run(ctx), timeout=NODE_TIMEOUT_SECONDS)
            outputs[node_id] = out
            status[node_id] = "done"
            if out.evidence:
                await emit({"type": "evidence", "node_id": node_id,
                            "items": [e.model_dump() for e in out.evidence[:40]]})
            await emit({
                "type": "node_completed", "node_id": node_id, "agent": node.agent,
                "summary": out.summary, "metrics": out.metrics,
                "signals": [s.type for s in out.signals], "evidence_count": len(out.evidence),
                "searches": sum(1 for r in serp.records if r.node_id == node_id),
                "ms": int((time.perf_counter() - t0) * 1000),
            })
        except Exception as exc:  # noqa: BLE001 - a failing agent must never abort the run
            outputs[node_id] = AgentOutput()
            status[node_id] = "failed"
            reason = "Search budget reached" if isinstance(exc, BudgetExceeded) else redact(str(exc), secret)
            if isinstance(exc, TimeoutError):
                reason = f"Timed out after {NODE_TIMEOUT_SECONDS}s"
            await emit({"type": "node_failed", "node_id": node_id, "agent": node.agent, "error": reason[:300]})
        finally:
            done[node_id].set()

    async with asyncio.TaskGroup() as tg:
        for nid in order:
            tg.create_task(run_node(nid))

    bag = SignalBag()
    bag.add(seed, [])
    for nid in order:
        if nid in outputs:
            bag.add(outputs[nid].signals, outputs[nid].evidence)

    verdict = bag.first(Verdict)
    brief = bag.first(MarketBrief)
    ad_pack = bag.first(AdPack)
    receipt = serp.receipt()
    receipt["duration_ms"] = int((time.perf_counter() - started) * 1000)
    result = {
        "workflow_id": wf.id,
        "status": "completed" if all(s == "done" for s in status.values()) else "completed_with_gaps",
        "node_status": status,
        "node_summaries": {nid: {"summary": o.summary, "metrics": o.metrics} for nid, o in outputs.items()},
        "signals": [s.model_dump() for s in bag.signals],
        "evidence": [e.model_dump() for e in bag.evidence.values()],
        "verdict": verdict.model_dump() if verdict else None,
        "market_brief": brief.model_dump() if brief else None,
        "ad_pack": ad_pack.model_dump() if ad_pack else None,
        "graph": build_graph(bag, verdict),
        "receipt": receipt,
    }
    await emit({"type": "run_completed", "status": result["status"], "receipt": receipt,
                "verdict": result["verdict"], "has_brief": brief is not None, "has_ads": ad_pack is not None})
    return result
