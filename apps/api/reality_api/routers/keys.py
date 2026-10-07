from __future__ import annotations

from typing import Any

from evidence_agents.serp.client import SerpError
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from reality_api import db
from reality_api.deps import Principal, client_ip, current_principal, not_demo, require
from reality_api.keys import account_status, drop_session_key, resolve_key, set_session_key
from reality_api.runs_service import run_mode
from reality_api.security import mask

router = APIRouter(prefix="/api/keys", tags=["keys"])


class KeyIn(BaseModel):
    api_key: str = Field(min_length=20, max_length=128, pattern=r"^[A-Za-z0-9]+$")
    remember: bool = False


@router.put("/serpapi")
async def save_key(body: KeyIn, request: Request, p: Principal = Depends(require("analyst")),
                   _: Principal = Depends(not_demo)) -> dict[str, Any]:
    try:
        account = await account_status(body.api_key, force=True)
    except SerpError as exc:
        raise HTTPException(400, str(exc)) from None
    if body.remember:
        if p.role != "admin":
            raise HTTPException(403, "Only admins can store a key for the workspace")
        from reality_api.security import encrypt_secret

        encrypt_secret(p.workspace_id, "serpapi", body.api_key)
    elif p.session_hash:
        set_session_key(p.session_hash, body.api_key)
    else:
        raise HTTPException(400, "API-token clients must use remember=true or SERPAPI_API_KEY")
    db.audit("serpapi_key_saved", workspace_id=p.workspace_id, user=p.user, ip=client_ip(request),
             detail={"scope": "workspace" if body.remember else "session", "key": mask(body.api_key)})
    return {"ok": True, "masked": mask(body.api_key), "scope": "workspace" if body.remember else "session",
            "account": account}


@router.delete("/serpapi")
def delete_key(request: Request, p: Principal = Depends(require("analyst"))) -> dict[str, Any]:
    drop_session_key(p.session_hash)
    if p.role == "admin":
        db.run("DELETE FROM secrets WHERE workspace_id = ? AND name = 'serpapi'", (p.workspace_id,))
    db.audit("serpapi_key_removed", workspace_id=p.workspace_id, user=p.user, ip=client_ip(request))
    return {"ok": True}


@router.get("/serpapi/status")
async def key_status(refresh: bool = False, p: Principal = Depends(current_principal)) -> dict[str, Any]:
    ws = p.workspace()
    mode = run_mode(ws)
    key, scope = resolve_key(p.workspace_id, p.session_hash)
    out: dict[str, Any] = {"mode": mode, "connected": bool(key), "scope": scope, "masked": mask(key), "account": None,
                           "error": None}
    if key and mode == "live":
        try:
            out["account"] = await account_status(key, force=refresh)
        except SerpError as exc:
            out["error"] = str(exc)
    return out
