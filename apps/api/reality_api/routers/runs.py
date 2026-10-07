from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any

from evidence_agents.agents import get_agent, has_agent
from evidence_agents.agents.base import RunInput
from evidence_agents.engine import Workflow, estimate_searches, load_templates, validate_workflow
from evidence_agents.engine.workflow import EdgeSpec, NodeSpec
from evidence_agents.llm.explainer import ask_with_search, explain_verdict, llm_alone
from evidence_agents.netguard import UnsafeURL, check_public_url
from evidence_agents.serp.client import SearchBudget, SerpClient
from evidence_agents.signals import Verdict
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field, field_validator
from sse_starlette.sse import EventSourceResponse

from reality_api import db
from reality_api.config import get_settings
from reality_api.deps import Principal, current_principal, require
from reality_api.keys import resolve_key
from reality_api.limiter import limiter
from reality_api.report import render_pdf
from reality_api.runs_service import manager, run_mode, workspace_llm

router = APIRouter(prefix="/api", tags=["runs"])


class InputIn(BaseModel):
    text: str = Field(default="", max_length=5000)
    image_url: str | None = Field(default=None, max_length=2000)
    profile: dict[str, Any] | None = None

    @field_validator("image_url")
    @classmethod
    def _safe_url(cls, v: str | None) -> str | None:
        if not v:
            return None
        try:
            return check_public_url(v, resolve=False)
        except UnsafeURL as exc:
            raise ValueError(str(exc)) from None

    @field_validator("profile")
    @classmethod
    def _profile(cls, v: dict[str, Any] | None) -> dict[str, Any] | None:
        if v is None:
            return None
        if len(json.dumps(v)) > 4000:
            raise ValueError("Profile is too large")
        comps = v.get("competitors") or []
        if isinstance(comps, str):
            comps = [c.strip() for c in comps.split(",")]
        v["competitors"] = [str(c)[:60] for c in comps if c][:5]
        return v


class RunIn(BaseModel):
    workflow: Workflow | None = None
    workflow_id: str | None = None
    input: InputIn
    approved: bool = False


def _month_start() -> float:
    now = datetime.now(UTC)
    return datetime(now.year, now.month, 1, tzinfo=UTC).timestamp()


def _resolve_workflow(body: RunIn, workspace_id: str) -> Workflow:
    if body.workflow:
        return body.workflow
    if body.workflow_id:
        row = db.one("SELECT doc FROM workflows WHERE id = ? AND workspace_id = ?", (body.workflow_id, workspace_id))
        if row:
            return Workflow.model_validate(db.loads(row["doc"]))
        for t in load_templates():
            if t.id == body.workflow_id:
                return t
    raise HTTPException(404, "Workflow not found")


async def start_run(p: Principal, wf: Workflow, run_input: RunInput, watch_id: str | None = None,
                    session_hash: str | None = None) -> dict[str, Any]:
    ws = p.workspace()
    problems = validate_workflow(wf)
    if problems:
        raise HTTPException(422, "; ".join(problems))
    est = estimate_searches(wf)
    if est["total"] > ws["run_budget"]:
        raise HTTPException(422, f"Workflow needs about {est['total']} searches; the per-run budget is {ws['run_budget']}")
    mode = run_mode(ws)
    key = None
    if mode == "live":
        key, _ = resolve_key(p.workspace_id, session_hash)
        if not key:
            raise HTTPException(412, "Connect your SerpApi key first")
        if ws["monthly_budget"]:
            used = db.one("SELECT COALESCE(SUM(paid_searches), 0) AS n FROM runs WHERE workspace_id = ? AND created_at >= ?",
                          (p.workspace_id, _month_start()))
            if used and used["n"] + est["total"] > ws["monthly_budget"]:
                raise HTTPException(429, f"Monthly search budget reached ({used['n']}/{ws['monthly_budget']})")
    run_id = await manager.start(ws=ws, user_id=p.user_id, wf=wf, run_input=run_input, api_key=key,
                                 estimate=est["total"], watch_id=watch_id)
    db.audit("run_started", workspace_id=p.workspace_id, user=p.user, target=run_id,
             detail={"workflow": wf.id, "estimate": est["total"], "mode": mode})
    return {"id": run_id, "mode": mode, "estimate": est}


@router.post("/runs")
@limiter.limit("30/minute")
async def create_run(request: Request, body: RunIn, p: Principal = Depends(require("analyst"))) -> dict[str, Any]:
    if not body.approved:
        raise HTTPException(400, "Review the plan and approve the run first")
    wf = _resolve_workflow(body, p.workspace_id)
    return await start_run(p, wf, RunInput(**body.input.model_dump()), session_hash=p.session_hash)


class TryIn(BaseModel):
    input: InputIn
    approved: bool = False


@router.post("/agents/{agent_id}/try")
@limiter.limit("30/minute")
async def try_agent(agent_id: str, request: Request, body: TryIn, p: Principal = Depends(require("analyst"))) -> dict[str, Any]:
    if not has_agent(agent_id) or agent_id in ("intent", "verdict"):
        raise HTTPException(404, "Agent not found")
    if not body.approved:
        raise HTTPException(400, "Approve the run first")
    agent = get_agent(agent_id)
    nodes = [NodeSpec(id="intent", agent="intent"), NodeSpec(id=agent_id, agent=agent_id)]
    edges = [EdgeSpec(source="intent", target=agent_id)]
    if agent.spec.category == "evidence":
        nodes.append(NodeSpec(id="verdict", agent="verdict"))
        edges.append(EdgeSpec(source=agent_id, target="verdict"))
    wf = Workflow(id=f"try_{agent_id}", name=f"Try: {agent.spec.title}", nodes=nodes, edges=edges, category="custom")
    return await start_run(p, wf, RunInput(**body.input.model_dump()), session_hash=p.session_hash)


def _run_row(run_id: str, workspace_id: str) -> dict[str, Any]:
    row = db.one("SELECT * FROM runs WHERE id = ? AND workspace_id = ?", (run_id, workspace_id))
    if not row:
        raise HTTPException(404, "Run not found")
    return row


def _public(row: dict[str, Any], full: bool) -> dict[str, Any]:
    out = {k: row[k] for k in ("id", "workflow_id", "workflow_name", "status", "mode", "created_at", "finished_at",
                               "verdict_status", "decision", "confidence", "paid_searches", "cache_hits", "total_calls",
                               "error", "watch_id", "estimate")}
    out["engines"] = db.loads(row["engines"], {})
    out["input"] = db.loads(row["input"], {})
    if full:
        out["workflow"] = db.loads(row["workflow_doc"])
        out["result"] = db.loads(row["result"])
    return out


@router.get("/runs")
def list_runs(limit: int = 50, workflow_id: str | None = None, p: Principal = Depends(current_principal)) -> dict[str, Any]:
    limit = max(1, min(limit, 200))
    if workflow_id:
        rows = db.many("SELECT * FROM runs WHERE workspace_id = ? AND workflow_id = ? ORDER BY created_at DESC LIMIT ?",
                       (p.workspace_id, workflow_id, limit))
    else:
        rows = db.many("SELECT * FROM runs WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ?", (p.workspace_id, limit))
    return {"runs": [_public(r, False) for r in rows]}


@router.get("/runs/{run_id}")
def get_run(run_id: str, p: Principal = Depends(current_principal)) -> dict[str, Any]:
    return _public(_run_row(run_id, p.workspace_id), True)


@router.get("/runs/{run_id}/events")
async def run_events(run_id: str, request: Request, p: Principal = Depends(current_principal)) -> EventSourceResponse:
    _run_row(run_id, p.workspace_id)
    after = int(request.headers.get("last-event-id") or 0)

    async def gen():  # noqa: ANN202
        async for event in manager.stream(run_id, after):
            if await request.is_disconnected():
                break
            if event["type"] == "ping":
                yield {"event": "ping", "data": "{}"}
                continue
            yield {"event": "message", "id": str(event["seq"]), "data": json.dumps(event, default=str)}

    return EventSourceResponse(gen(), ping=20)


@router.get("/runs/{run_id}/report.pdf")
def report_pdf(run_id: str, p: Principal = Depends(current_principal)) -> Response:
    row = _run_row(run_id, p.workspace_id)
    if not row["result"]:
        raise HTTPException(409, "Run has not finished")
    pdf = render_pdf(_public(row, True))
    return Response(pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="reality-check-{run_id}.pdf"'})


@router.post("/runs/{run_id}/llm-alone")
@limiter.limit("10/minute")
async def compare_llm_alone(run_id: str, request: Request, p: Principal = Depends(require("analyst"))) -> dict[str, Any]:
    row = _run_row(run_id, p.workspace_id)
    text = db.loads(row["input"], {}).get("text") or json.dumps(db.loads(row["input"], {}).get("profile") or {})
    llm = workspace_llm(p.workspace())
    if not llm.enabled:
        return {"available": False, "reason": "Configure an LLM (LLM_MODEL) to compare a model without live evidence."}
    answer = await llm_alone(text, llm)
    if not answer:
        return {"available": False, "reason": "The model call failed."}
    return {"available": True, "model": llm.model, **answer}


class AskIn(BaseModel):
    question: str = Field(min_length=3, max_length=500)


@router.post("/runs/{run_id}/ask")
@limiter.limit("10/minute")
async def ask(run_id: str, request: Request, body: AskIn, p: Principal = Depends(require("analyst"))) -> dict[str, Any]:
    row = _run_row(run_id, p.workspace_id)
    ws = p.workspace()
    llm = workspace_llm(ws)
    if not llm.enabled:
        raise HTTPException(412, "Configure an LLM (LLM_MODEL) to ask follow-up questions")
    mode = run_mode(ws)
    key, _ = resolve_key(p.workspace_id, p.session_hash)
    s = get_settings()
    serp = SerpClient(api_key=key if mode == "live" else None, mode=mode,  # type: ignore[arg-type]
                      cache_path=s.data_dir / "serp_cache.sqlite", fixtures_dir=s.fixtures_dir,
                      sample_fixtures_dir=s.sample_fixtures_dir, budget=SearchBudget(max_searches=2))
    result = db.loads(row["result"], {})
    context = json.dumps({"verdict": (result.get("verdict") or {}).get("explanation"),
                          "brief": (result.get("market_brief") or {}).get("summary")})
    answer = await ask_with_search(body.question, context, llm, serp.search_tools_client())
    return {"answer": answer or "No answer available.", "receipt": serp.receipt()}


class ExplainIn(BaseModel):
    language: str = Field(default="en", pattern="^(en|hi|ta)$")


@router.post("/runs/{run_id}/explain")
async def explain(run_id: str, body: ExplainIn, p: Principal = Depends(current_principal)) -> dict[str, Any]:
    row = _run_row(run_id, p.workspace_id)
    verdict = (db.loads(row["result"], {}) or {}).get("verdict")
    if not verdict:
        raise HTTPException(409, "This run has no verdict")
    text = await explain_verdict(Verdict.model_validate(verdict), row["workflow_name"] or "this claim",
                                 workspace_llm(p.workspace()), body.language)
    return {"explanation": text or verdict["explanation"], "by_llm": bool(text)}
