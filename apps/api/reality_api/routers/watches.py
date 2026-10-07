from __future__ import annotations

from typing import Any

from evidence_agents.engine import Workflow, load_templates, validate_workflow
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from reality_api import db
from reality_api.deps import Principal, client_ip, current_principal, require
from reality_api.routers.runs import InputIn
from reality_api.watch_service import run_watch

router = APIRouter(prefix="/api/watches", tags=["watches"])


class WatchIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    workflow: Workflow | None = None
    workflow_id: str | None = None
    input: InputIn
    interval_minutes: int = Field(default=1440, ge=15, le=43200)
    channels: list[str] = Field(default_factory=list)
    run_now: bool = True


class WatchPatch(BaseModel):
    active: bool | None = None
    interval_minutes: int | None = Field(default=None, ge=15, le=43200)
    channels: list[str] | None = None


def _public(w: dict[str, Any]) -> dict[str, Any]:
    wf = db.loads(w["workflow_doc"], {})
    snaps = db.many("SELECT id, run_id, created_at, diff FROM watch_snapshots WHERE watch_id = ? ORDER BY created_at DESC "
                    "LIMIT 30", (w["id"],))
    return {
        "id": w["id"], "name": w["name"], "workflow_name": wf.get("name"), "workflow_id": wf.get("id"),
        "input": db.loads(w["input"], {}), "interval_minutes": w["interval_minutes"], "channels": db.loads(w["channels"], []),
        "active": bool(w["active"]), "last_run_id": w["last_run_id"], "last_run_at": w["last_run_at"],
        "next_run_at": w["next_run_at"], "created_at": w["created_at"],
        "history": [{"id": s["id"], "run_id": s["run_id"], "created_at": s["created_at"], "changes": db.loads(s["diff"], [])}
                    for s in snaps],
    }


@router.get("")
def list_watches(p: Principal = Depends(current_principal)) -> dict[str, Any]:
    rows = db.many("SELECT * FROM watches WHERE workspace_id = ? ORDER BY created_at DESC", (p.workspace_id,))
    return {"watches": [_public(w) for w in rows]}


@router.post("")
async def create_watch(body: WatchIn, request: Request, p: Principal = Depends(require("analyst"))) -> dict[str, Any]:
    wf = body.workflow
    if not wf and body.workflow_id:
        row = db.one("SELECT doc FROM workflows WHERE id = ? AND workspace_id = ?", (body.workflow_id, p.workspace_id))
        wf = Workflow.model_validate(db.loads(row["doc"])) if row else next(
            (t for t in load_templates() if t.id == body.workflow_id), None)
    if not wf:
        raise HTTPException(404, "Workflow not found")
    problems = validate_workflow(wf)
    if problems:
        raise HTTPException(422, "; ".join(problems))
    channels = [c for c in body.channels if c in ("telegram", "email")]
    wid = db.new_id("watch")
    now = db.now()
    db.run("INSERT INTO watches (id, workspace_id, name, workflow_doc, input, interval_minutes, channels, active, "
           "next_run_at, created_by, created_at) VALUES (?,?,?,?,?,?,?,1,?,?,?)",
           (wid, p.workspace_id, body.name, wf.model_dump_json(), body.input.model_dump_json(), body.interval_minutes,
            db.dumps(channels), now + body.interval_minutes * 60, p.user_id, now))
    db.audit("watch_created", workspace_id=p.workspace_id, user=p.user, target=wid, ip=client_ip(request))
    run_id = await run_watch(wid) if body.run_now else None
    w = db.one("SELECT * FROM watches WHERE id = ?", (wid,))
    return {**_public(w or {}), "started_run_id": run_id}


@router.patch("/{watch_id}")
def patch_watch(watch_id: str, body: WatchPatch, p: Principal = Depends(require("analyst"))) -> dict[str, Any]:
    w = db.one("SELECT * FROM watches WHERE id = ? AND workspace_id = ?", (watch_id, p.workspace_id))
    if not w:
        raise HTTPException(404, "Watch not found")
    if body.active is not None:
        db.run("UPDATE watches SET active = ? WHERE id = ?", (int(body.active), watch_id))
    if body.interval_minutes is not None:
        db.run("UPDATE watches SET interval_minutes = ?, next_run_at = ? WHERE id = ?",
               (body.interval_minutes, db.now() + body.interval_minutes * 60, watch_id))
    if body.channels is not None:
        db.run("UPDATE watches SET channels = ? WHERE id = ?",
               (db.dumps([c for c in body.channels if c in ("telegram", "email")]), watch_id))
    return _public(db.one("SELECT * FROM watches WHERE id = ?", (watch_id,)) or w)


@router.post("/{watch_id}/run")
async def run_now(watch_id: str, p: Principal = Depends(require("analyst"))) -> dict[str, Any]:
    if not db.one("SELECT id FROM watches WHERE id = ? AND workspace_id = ?", (watch_id, p.workspace_id)):
        raise HTTPException(404, "Watch not found")
    run_id = await run_watch(watch_id)
    if not run_id:
        raise HTTPException(412, "Watch could not start. Background runs need a remembered workspace key or SERPAPI_API_KEY.")
    return {"run_id": run_id}


@router.delete("/{watch_id}")
def delete_watch(watch_id: str, request: Request, p: Principal = Depends(require("analyst"))) -> dict[str, Any]:
    db.run("DELETE FROM watches WHERE id = ? AND workspace_id = ?", (watch_id, p.workspace_id))
    db.run("DELETE FROM watch_snapshots WHERE watch_id = ?", (watch_id,))
    db.audit("watch_deleted", workspace_id=p.workspace_id, user=p.user, target=watch_id, ip=client_ip(request))
    return {"ok": True}
