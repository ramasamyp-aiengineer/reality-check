from __future__ import annotations

from typing import Any

from evidence_agents.engine import Workflow, estimate_searches, load_templates, validate_workflow
from evidence_agents.llm.planner import plan_workflow
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from reality_api import db
from reality_api.deps import Principal, client_ip, current_principal, require
from reality_api.limiter import limiter
from reality_api.runs_service import workspace_llm

router = APIRouter(prefix="/api/workflows", tags=["workflows"])


class PlanIn(BaseModel):
    prompt: str = Field(min_length=3, max_length=1500)


def _summary(wf: Workflow, source: str) -> dict[str, Any]:
    return {**wf.model_dump(), "source": source, "estimate": estimate_searches(wf)}


@router.get("")
def list_workflows(p: Principal = Depends(current_principal)) -> dict[str, Any]:
    templates = [_summary(t, "template") for t in load_templates()]
    saved = []
    for row in db.many("SELECT doc FROM workflows WHERE workspace_id = ? ORDER BY updated_at DESC", (p.workspace_id,)):
        saved.append(_summary(Workflow.model_validate(db.loads(row["doc"])), "saved"))
    return {"templates": templates, "saved": saved}


@router.get("/{workflow_id}")
def get_workflow(workflow_id: str, p: Principal = Depends(current_principal)) -> dict[str, Any]:
    row = db.one("SELECT doc FROM workflows WHERE id = ? AND workspace_id = ?", (workflow_id, p.workspace_id))
    if row:
        return _summary(Workflow.model_validate(db.loads(row["doc"])), "saved")
    for t in load_templates():
        if t.id == workflow_id:
            return _summary(t, "template")
    raise HTTPException(404, "Workflow not found")


@router.post("")
def save_workflow(wf: Workflow, request: Request, p: Principal = Depends(require("analyst"))) -> dict[str, Any]:
    problems = validate_workflow(wf)
    if problems:
        raise HTTPException(422, "; ".join(problems))
    if any(t.id == wf.id for t in load_templates()) or not wf.id.startswith(("custom_", "wf_")):
        wf.id = db.new_id("wf")
    now = db.now()
    existing = db.one("SELECT id FROM workflows WHERE id = ? AND workspace_id = ?", (wf.id, p.workspace_id))
    if existing:
        db.run("UPDATE workflows SET name = ?, description = ?, doc = ?, updated_at = ? WHERE id = ?",
               (wf.name, wf.description, wf.model_dump_json(), now, wf.id))
    else:
        db.run("INSERT INTO workflows (id, workspace_id, name, description, doc, created_by, created_at, updated_at) "
               "VALUES (?,?,?,?,?,?,?,?)", (wf.id, p.workspace_id, wf.name, wf.description, wf.model_dump_json(),
                                            p.user_id, now, now))
    db.audit("workflow_saved", workspace_id=p.workspace_id, user=p.user, target=wf.id, ip=client_ip(request))
    return _summary(wf, "saved")


@router.delete("/{workflow_id}")
def delete_workflow(workflow_id: str, request: Request, p: Principal = Depends(require("analyst"))) -> dict[str, Any]:
    db.run("DELETE FROM workflows WHERE id = ? AND workspace_id = ?", (workflow_id, p.workspace_id))
    db.audit("workflow_deleted", workspace_id=p.workspace_id, user=p.user, target=workflow_id, ip=client_ip(request))
    return {"ok": True}


@router.post("/validate")
def validate(wf: Workflow, _: Principal = Depends(current_principal)) -> dict[str, Any]:
    return {"problems": validate_workflow(wf), "estimate": estimate_searches(wf)}


@router.post("/plan")
@limiter.limit("20/minute")
async def plan(request: Request, body: PlanIn, p: Principal = Depends(require("analyst"))) -> dict[str, Any]:
    ws = p.workspace()
    return await plan_workflow(body.prompt, workspace_llm(ws), max_searches=int(ws["run_budget"]))
