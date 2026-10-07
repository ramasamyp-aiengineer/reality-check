"""MCP server: exposes the evidence agents and workflows to any MCP client (Cursor, Claude Desktop, ...).

Environment:
  SERPAPI_API_KEY  key for live searches (never logged, never returned)
  RC_MODE          live | demo (default: live when a key is set, else demo)
  RC_MAX_SEARCHES  per-call search budget (default 10)
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from evidence_agents.agents import all_agents, has_agent
from evidence_agents.agents.base import RunInput
from evidence_agents.engine import Workflow, estimate_searches, execute_workflow, load_templates, validate_workflow
from evidence_agents.llm.base import llm_from_env
from evidence_agents.llm.planner import build_dag
from evidence_agents.serp import SearchBudget, SerpClient
from mcp.server.mcpserver import MCPServer

ROOT = Path(__file__).resolve().parents[3]
load_dotenv(ROOT / ".env")

server = MCPServer(
    name="reality-check",
    title="Reality Check evidence agents",
    instructions=("Verify claims and research markets with live Google evidence via SerpApi. Every result carries "
                  "evidence links and a search receipt. Verdicts describe evidence status, never accusations."),
)


def _mode() -> str:
    mode = os.environ.get("RC_MODE", "").lower()
    if mode in ("live", "demo"):
        return mode
    return "live" if os.environ.get("SERPAPI_API_KEY") else "demo"


def _client() -> SerpClient:
    mode = _mode()
    key = os.environ.get("SERPAPI_API_KEY") if mode == "live" else None
    if mode == "live" and not key:
        raise ValueError("SERPAPI_API_KEY is not set. Set it, or use RC_MODE=demo.")
    return SerpClient(api_key=key, mode=mode,  # type: ignore[arg-type]
                      cache_path=ROOT / "data" / "serp_cache.sqlite", fixtures_dir=ROOT / "fixtures" / "serp",
                      sample_fixtures_dir=ROOT / "fixtures" / "sample",
                      budget=SearchBudget(max_searches=int(os.environ.get("RC_MAX_SEARCHES", "10"))))


def _compact(result: dict[str, Any]) -> dict[str, Any]:
    v = result.get("verdict")
    out: dict[str, Any] = {
        "status": result["status"],
        "nodes": result["node_summaries"],
        "evidence": [{"id": e["id"], "engine": e["engine"], "title": e["title"], "url": e.get("url"), "source": e.get("source")}
                     for e in result["evidence"][:20]],
        "receipt": {k: result["receipt"].get(k) for k in ("mode", "total_calls", "paid_searches", "cache_hits", "engines")},
    }
    if v:
        out["verdict"] = {k: v.get(k) for k in ("evidence_status", "decision", "confidence", "headline", "explanation",
                                                 "findings", "actions")}
    if result.get("market_brief"):
        b = result["market_brief"]
        out["market_brief"] = {k: b.get(k) for k in ("summary", "opportunities", "price_band", "rising_queries")}
    if result.get("ad_pack"):
        out["ad_pack"] = result["ad_pack"]
    return out


async def _execute(wf: Workflow, run_input: RunInput) -> dict[str, Any]:
    problems = validate_workflow(wf)
    if problems:
        raise ValueError("; ".join(problems))
    serp = _client()

    async def emit(_: dict[str, Any]) -> None:
        return None

    result = await execute_workflow(wf, run_input, serp, emit, llm=llm_from_env(),
                                    secret=os.environ.get("SERPAPI_API_KEY"))
    return _compact(result)


@server.tool(description="List the reusable evidence agents, the SerpApi engines each uses, and what each proves.")
def list_agents() -> list[dict[str, Any]]:
    return [{"id": a.spec.id, "title": a.spec.title, "category": a.spec.category, "engines": a.spec.engines,
             "produces": a.spec.produces, "proves": a.spec.proves, "est_searches": a.spec.est_searches}
            for a in all_agents()]


@server.tool(description="List ready-made workflows (agent graphs) with their estimated SerpApi search cost.")
def list_workflows() -> list[dict[str, Any]]:
    return [{"id": t.id, "name": t.name, "description": t.description, "input_kind": t.input_kind,
             "agents": [n.agent for n in t.nodes], "est_searches": estimate_searches(t)["total"]}
            for t in load_templates()]


@server.tool(description="Run one evidence agent (plus claim parsing and a verdict) against a text claim.")
async def run_agent(agent_id: str, text: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
    if not has_agent(agent_id):
        raise ValueError(f"Unknown agent '{agent_id}'. Call list_agents first.")
    agents = ["app_identity", agent_id] if agent_id in ("registry", "review_voice") else [agent_id]
    wf = build_dag(agents, "verdict", {agent_id: params or {}}, f"MCP {agent_id}", "Single-agent run from MCP")
    return await _execute(wf, RunInput(text=text))


@server.tool(description=("Check a forwarded message, offer, tip, or ad (loan apps, investment tips, job offers, "
                          "deals, customer-care numbers). Returns evidence status, decision, confidence, findings "
                          "with evidence links, and official next steps."))
async def verify_claim(text: str) -> dict[str, Any]:
    from evidence_agents.llm.intent import heuristic_intent

    claim = heuristic_intent(text)
    template = {"loan_offer": "loan_forward_check", "investment_tip": "investment_tip_check",
                "job_offer": "job_offer_check", "deal_price": "buy_decision",
                "customer_care": "customer_care_check"}.get(claim.claim_type, "loan_forward_check")
    wf = next(t for t in load_templates() if t.id == template)
    return await _execute(wf, RunInput(text=text))


@server.tool(description=("Market Pulse for a business: demand trend, rising queries, regional interest, competitor "
                          "ads, price band and review pain points, then evidence-grounded ad variants."))
async def market_pulse(business: str, product: str, city: str = "India", price: float | None = None, usp: str = "",
                       competitors: list[str] | None = None) -> dict[str, Any]:
    wf = next(t for t in load_templates() if t.id == "market_pulse_ads")
    profile = {"business_name": business, "topic": product, "city": city, "price": price, "usp": usp,
               "competitors": (competitors or [])[:5]}
    return await _execute(wf, RunInput(text=f"{business} {product}", profile=profile))


@server.tool(description="Run any workflow by id (see list_workflows) with a text input and optional business profile.")
async def run_workflow(workflow_id: str, text: str = "", profile: dict[str, Any] | None = None) -> dict[str, Any]:
    wf = next((t for t in load_templates() if t.id == workflow_id), None)
    if not wf:
        raise ValueError(f"Unknown workflow '{workflow_id}'. Call list_workflows first.")
    run_input = RunInput(text=text, profile=profile) if (text or profile) else RunInput(**wf.sample_input)
    return await _execute(wf, run_input)


def main() -> None:
    server.run("stdio")


if __name__ == "__main__":
    main()
