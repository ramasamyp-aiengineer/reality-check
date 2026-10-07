"""AI workflow planner: a plain-language request becomes a runnable, costed workflow DAG.

The LLM only chooses agents and parameters from the catalog; the DAG wiring, validation and
search budget are enforced in code. Without an LLM, keyword matching picks a template.
"""

from __future__ import annotations

import re
from typing import Any

from pydantic import BaseModel, Field

from evidence_agents.agents import all_agents, get_agent, has_agent
from evidence_agents.engine.workflow import (
    EdgeSpec,
    NodeSpec,
    Workflow,
    estimate_searches,
    load_templates,
    validate_workflow,
)
from evidence_agents.llm.base import LLMConfig, run_structured, untrusted

_KEYWORDS: list[tuple[str, tuple[str, ...]]] = [
    ("loan_forward_check", ("loan", "lending", "cibil", "emi")),
    ("investment_tip_check", ("stock tip", "investment tip", "trading tip", "adviser", "advisor", "sebi", "share tip")),
    ("job_offer_check", ("job", "hiring", "offer letter", "recruit")),
    ("customer_care_check", ("customer care", "helpline", "support number")),
    ("competitor_watch", ("competitor", "rival", "watch my", "monitor")),
    ("market_pulse_ads", ("market", "campaign", "ad ", "ads", "launch", "marketing", "demand", "business")),
    ("trip_timing", ("trip", "travel", "hotel", "flight", "visit", "holiday")),
    ("local_service_check", ("clinic", "shop", "near me", "service centre", "service center", "local", "restaurant")),
    ("image_check", ("image", "photo", "screenshot", "picture")),
    ("buy_decision", ("buy", "deal", "price", "discount", "offer", "sale", "iphone")),
]


class PlanLLM(BaseModel):
    name: str = Field(description="Short workflow name, max 5 words")
    description: str = Field(description="One sentence")
    agents: list[str] = Field(description="Agent ids from the catalog, excluding intent and verdict/market_brief/ad_agent")
    synthesis: str = Field(description="'verdict' for trust checks, 'market_brief' for market research, "
                                       "'market_brief+ad_agent' when ads are wanted")
    params: dict[str, dict[str, Any]] = Field(default_factory=dict, description="Optional params per agent id")
    rationale: str = Field(description="Why these agents, in one or two sentences")


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_")[:40] or "custom"


def build_dag(agent_ids: list[str], synthesis: str, params: dict[str, dict[str, Any]], name: str,
              description: str) -> Workflow:
    evidence = [a for a in dict.fromkeys(agent_ids)
                if has_agent(a) and a not in ("intent", "verdict", "market_brief", "ad_agent")]
    nodes = [NodeSpec(id="intent", agent="intent")]
    edges: list[EdgeSpec] = []
    for a in evidence:
        nodes.append(NodeSpec(id=a, agent=a, params=params.get(a, {})))
    ids = {n.id for n in nodes}
    for a in evidence:
        if a == "review_voice" and params.get(a, {}).get("source", "play") == "play" and "app_identity" in ids:
            edges.append(EdgeSpec(source="app_identity", target=a))
        elif a == "review_voice" and "place_reality" in ids:
            edges.append(EdgeSpec(source="place_reality", target=a))
        elif a == "registry" and "app_identity" in ids:
            edges.append(EdgeSpec(source="app_identity", target=a))
        else:
            edges.append(EdgeSpec(source="intent", target=a))
    has_children = {e.source for e in edges}
    leaves = [a for a in evidence if a not in has_children] or ["intent"]
    if synthesis.startswith("market_brief"):
        nodes.append(NodeSpec(id="market_brief", agent="market_brief"))
        edges += [EdgeSpec(source=leaf, target="market_brief") for leaf in leaves]
        if "ad_agent" in synthesis:
            nodes.append(NodeSpec(id="ad_agent", agent="ad_agent"))
            edges.append(EdgeSpec(source="market_brief", target="ad_agent"))
    else:
        nodes.append(NodeSpec(id="verdict", agent="verdict"))
        edges += [EdgeSpec(source=leaf, target="verdict") for leaf in leaves]
    return Workflow(id=f"custom_{_slug(name)}", name=name, description=description, category="custom", nodes=nodes,
                    edges=edges)


def heuristic_plan(prompt: str) -> tuple[Workflow, str]:
    low = f" {prompt.lower()} "
    templates = {t.id: t for t in load_templates()}
    for tid, words in _KEYWORDS:
        if any(w in low for w in words) and tid in templates:
            wf = templates[tid].model_copy(deep=True)
            wf.id = f"custom_{tid}"
            wf.featured = False
            return wf, f"Matched your request to the '{templates[tid].name}' pattern by keywords."
    wf = build_dag(["web_reputation", "news_timeline"], "verdict", {}, "Quick Check",
                   "Web reputation and news timeline, then a verdict.")
    return wf, "No specific pattern matched, so this runs a general web and news check."


def _catalog_text() -> str:
    lines = []
    for a in all_agents():
        s = a.spec
        if s.id in ("intent", "verdict", "market_brief", "ad_agent"):
            continue
        params = ", ".join(f"{k} ({p.type}{': ' + '/'.join(p.options) if p.options else ''})" for k, p in s.params.items())
        lines.append(f"- {s.id}: {s.description} Engines: {', '.join(s.engines) or 'none'}. "
                     f"Searches: {s.est_searches}. Params: {params or 'none'}")
    return "\n".join(lines)


async def plan_workflow(prompt: str, llm: LLMConfig | None, max_searches: int = 12) -> dict[str, Any]:
    source = "rules"
    out = await run_structured(
        llm, PlanLLM,
        "You design evidence workflows for an Indian verification and market-intelligence platform. Choose the "
        f"smallest set of agents that answers the request within {max_searches} SerpApi searches.\n"
        f"Catalog:\n{_catalog_text()}",
        untrusted(prompt, 1500),
    )
    if out:
        agents = [a for a in out.agents if has_agent(a)]
        wf = build_dag(agents, out.synthesis, out.params, out.name, out.description)
        rationale = out.rationale
        source = llm.model if llm and llm.model else "llm"
        if validate_workflow(wf):
            wf, rationale = heuristic_plan(prompt)
            source = "rules"
    else:
        wf, rationale = heuristic_plan(prompt)

    est = estimate_searches(wf)
    while est["total"] > max_searches:
        removable = [n for n in wf.nodes if n.agent not in ("intent", "verdict", "market_brief", "ad_agent")
                     and not any(e.source == n.id for e in wf.edges)]
        if not removable:
            break
        drop = max(removable, key=lambda n: get_agent(n.agent).estimate(n.params))
        wf.nodes = [n for n in wf.nodes if n.id != drop.id]
        wf.edges = [e for e in wf.edges if drop.id not in (e.source, e.target)]
        rationale += f" Dropped {drop.agent} to stay within {max_searches} searches."
        est = estimate_searches(wf)
    return {"workflow": wf.model_dump(), "rationale": rationale, "planned_by": source, "estimate": est,
            "problems": validate_workflow(wf)}
