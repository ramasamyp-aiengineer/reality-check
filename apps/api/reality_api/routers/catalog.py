from __future__ import annotations

from typing import Any

from evidence_agents.agents import all_agents
from evidence_agents.engines import atlas
from evidence_agents.rules import catalog as rules_catalog
from fastapi import APIRouter, Depends

from reality_api.deps import Principal, current_principal

router = APIRouter(prefix="/api", tags=["catalog"])

WATCH_CAPABILITY = {
    "id": "watch", "title": "Watch", "category": "core", "icon": "bell-ring", "engines": [], "consumes": ["*"],
    "produces": ["WatchDiff"], "est_searches": 0, "params": {},
    "description": "Re-runs any workflow on a schedule and alerts on what changed (price, reviews, ads, verdict).",
    "proves": "That the evidence is still true tomorrow.",
}


@router.get("/agents")
def agents(_: Principal = Depends(current_principal)) -> dict[str, Any]:
    return {"agents": [a.spec.model_dump() for a in all_agents()] + [WATCH_CAPABILITY]}


@router.get("/engines")
def engines(_: Principal = Depends(current_principal)) -> dict[str, Any]:
    return {"engines": atlas()}


@router.get("/rules")
def rules(_: Principal = Depends(current_principal)) -> dict[str, Any]:
    return {"rules": rules_catalog()}
