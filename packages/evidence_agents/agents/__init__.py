"""Agent registry. Modules are imported lazily so the engine and agents can reference each other."""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from evidence_agents.agents.base import Agent

_REGISTRY: dict[str, Agent] = {}
_MODULES = (
    "intent", "registry_check", "web_reputation", "app_identity", "review_voice", "price_reality", "news_timeline",
    "advertiser_identity", "demand_trend", "place_reality", "visual_provenance", "travel_price", "market",
    "jobs_demand", "market_brief", "ad_agent", "verdict_agent",
)


def _load() -> None:
    if _REGISTRY:
        return
    import importlib

    for name in _MODULES:
        module = importlib.import_module(f"evidence_agents.agents.{name}")
        agent = module.AGENT
        _REGISTRY[agent.spec.id] = agent


def get_agent(agent_id: str) -> Agent:
    _load()
    if agent_id not in _REGISTRY:
        raise KeyError(f"Unknown agent '{agent_id}'")
    return _REGISTRY[agent_id]


def has_agent(agent_id: str) -> bool:
    _load()
    return agent_id in _REGISTRY


def all_agents() -> list[Agent]:
    _load()
    return list(_REGISTRY.values())
