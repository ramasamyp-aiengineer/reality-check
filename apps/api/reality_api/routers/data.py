"""Evidence explorer, usage and receipts, ad compliance checks."""

from __future__ import annotations

from collections import defaultdict
from datetime import UTC, datetime
from typing import Any

from evidence_agents.llm.ad_writer import DESCRIPTION_MAX, HEADLINE_MAX, check_text
from evidence_agents.signals import BusinessProfile, PriceBand
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from reality_api import db
from reality_api.deps import Principal, current_principal

router = APIRouter(prefix="/api", tags=["data"])


@router.get("/evidence")
def evidence(q: str | None = None, engine: str | None = None, kind: str | None = None, run_id: str | None = None,
             limit: int = 200, p: Principal = Depends(current_principal)) -> dict[str, Any]:
    sql = ("SELECT e.*, r.workflow_name FROM evidence e JOIN runs r ON r.id = e.run_id WHERE e.workspace_id = ?")
    params: list[Any] = [p.workspace_id]
    if q:
        sql += " AND (e.title LIKE ? OR e.snippet LIKE ? OR e.source LIKE ?)"
        params += [f"%{q}%"] * 3
    if engine:
        sql += " AND e.engine = ?"
        params.append(engine)
    if kind:
        sql += " AND e.kind = ?"
        params.append(kind)
    if run_id:
        sql += " AND e.run_id = ?"
        params.append(run_id)
    sql += " ORDER BY e.created_at DESC LIMIT ?"
    params.append(max(1, min(limit, 1000)))
    rows = db.many(sql, tuple(params))
    facets = db.many("SELECT engine, kind, COUNT(*) AS n FROM evidence WHERE workspace_id = ? GROUP BY engine, kind",
                     (p.workspace_id,))
    return {"items": rows, "facets": facets}


@router.get("/usage")
def usage(days: int = 30, p: Principal = Depends(current_principal)) -> dict[str, Any]:
    since = datetime.now(UTC).timestamp() - max(1, min(days, 365)) * 86400
    rows = db.many("SELECT id, workflow_name, created_at, paid_searches, cache_hits, total_calls, engines, mode, status, "
                   "estimate, verdict_status FROM runs WHERE workspace_id = ? AND created_at >= ? ORDER BY created_at",
                   (p.workspace_id, since))
    by_day: dict[str, dict[str, int]] = defaultdict(lambda: {"paid": 0, "cached": 0, "runs": 0})
    by_workflow: dict[str, dict[str, int]] = defaultdict(lambda: {"paid": 0, "calls": 0, "runs": 0})
    by_engine: dict[str, int] = defaultdict(int)
    for r in rows:
        day = datetime.fromtimestamp(r["created_at"], UTC).strftime("%Y-%m-%d")
        by_day[day]["paid"] += r["paid_searches"] or 0
        by_day[day]["cached"] += r["cache_hits"] or 0
        by_day[day]["runs"] += 1
        wf = by_workflow[r["workflow_name"] or "?"]
        wf["paid"] += r["paid_searches"] or 0
        wf["calls"] += r["total_calls"] or 0
        wf["runs"] += 1
        for eng, n in (db.loads(r["engines"], {}) or {}).items():
            by_engine[eng] += n
    total_calls = sum(r["total_calls"] or 0 for r in rows)
    paid = sum(r["paid_searches"] or 0 for r in rows)
    return {
        "totals": {"runs": len(rows), "calls": total_calls, "paid": paid, "saved": total_calls - paid},
        "by_day": [{"day": d, **v} for d, v in sorted(by_day.items())],
        "by_workflow": [{"workflow": k, **v} for k, v in sorted(by_workflow.items(), key=lambda kv: -kv[1]["calls"])],
        "by_engine": [{"engine": k, "calls": v} for k, v in sorted(by_engine.items(), key=lambda kv: -kv[1])],
        "recent": [{k: r[k] for k in ("id", "workflow_name", "created_at", "paid_searches", "cache_hits", "total_calls",
                                      "mode", "status", "estimate", "verdict_status")} for r in rows[-25:][::-1]],
    }


class AdCheckIn(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    field: str = Field(default="body", pattern="^(headline|description|body)$")
    run_id: str | None = None


@router.post("/ads/check")
def ads_check(body: AdCheckIn, p: Principal = Depends(current_principal)) -> dict[str, Any]:
    profile = band = None
    if body.run_id:
        row = db.one("SELECT result FROM runs WHERE id = ? AND workspace_id = ?", (body.run_id, p.workspace_id))
        if not row:
            raise HTTPException(404, "Run not found")
        for s in (db.loads(row["result"], {}) or {}).get("signals", []):
            if s["type"] == "BusinessProfile":
                profile = BusinessProfile.model_validate(s)
            elif s["type"] == "PriceBand":
                band = PriceBand.model_validate(s)
    limit = {"headline": HEADLINE_MAX, "description": DESCRIPTION_MAX}.get(body.field)
    flags = check_text(body.text, limit=limit, profile=profile, band=band)
    return {"flags": flags, "length": len(body.text), "limit": limit}
