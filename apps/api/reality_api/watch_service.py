"""Watch mode: re-run a workflow on a schedule, diff the evidence against the last run, alert on change."""

from __future__ import annotations

import logging
from typing import Any

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from evidence_agents.agents.base import RunInput
from evidence_agents.engine import Workflow

from reality_api import db
from reality_api.deps import Principal
from reality_api.notify import send_email, send_telegram
from reality_api.runs_service import manager

log = logging.getLogger(__name__)
scheduler = AsyncIOScheduler()


def extract_metrics(result: dict[str, Any] | None) -> dict[str, Any]:
    if not result:
        return {}
    m: dict[str, Any] = {}
    v = result.get("verdict")
    if v:
        m.update(verdict=v["evidence_status"], decision=v["decision"], confidence=v["confidence"])
    for s in result.get("signals", []):
        t = s["type"]
        if t == "PriceBand":
            m.update(price_min=s.get("min_price"), store_count=s.get("store_count"))
        elif t == "ReviewWindow" and "newest_avg" not in m:
            m.update(newest_avg=s.get("newest_avg"), complaint_share=s.get("complaint_share"))
        elif t == "AdvertiserProfile":
            m.update(advertisers=sorted(a["name"] for a in s.get("advertisers", [])), creatives=s.get("total_creatives"))
        elif t == "TrendSeries":
            kw = (s.get("keywords") or [None])[0]
            m["momentum_pct"] = (s.get("momentum_pct") or {}).get(kw)
        elif t == "NewsEvents":
            m["news"] = [i["title"] for i in s.get("items", [])[:10]]
        elif t == "AppProfile":
            m["app_rating"] = s.get("rating")
        elif t == "RegistryStatus":
            m["registry_listed"] = s.get("matched")
    return m


LABELS = {"verdict": "Verdict", "decision": "Decision", "confidence": "Confidence", "price_min": "Lowest price",
          "store_count": "Stores", "newest_avg": "Newest review average", "complaint_share": "Complaint share",
          "creatives": "Ad creatives", "momentum_pct": "Search momentum %", "app_rating": "Play rating",
          "registry_listed": "Registry listed"}


def diff_metrics(before: dict[str, Any], after: dict[str, Any]) -> list[dict[str, Any]]:
    changes = []
    for key, label in LABELS.items():
        if key in after and before.get(key) != after.get(key) and key in before:
            changes.append({"key": key, "label": label, "before": before.get(key), "after": after.get(key)})
    for key, label in (("advertisers", "New advertisers"), ("news", "New headlines")):
        added = [x for x in after.get(key, []) if x not in set(before.get(key, []))]
        if added and key in before:
            changes.append({"key": key, "label": label, "added": added[:5]})
    return changes


def _principal_for(watch: dict[str, Any]) -> Principal | None:
    row = db.one("SELECT u.id, u.email, u.name, u.is_demo, m.role FROM users u JOIN memberships m ON m.user_id = u.id "
                 "WHERE u.id = ? AND m.workspace_id = ?", (watch["created_by"], watch["workspace_id"]))
    if not row:
        return None
    return Principal(row["id"], row["email"], row["name"], row["role"], watch["workspace_id"], bool(row["is_demo"]), None)


async def run_watch(watch_id: str) -> str | None:
    from reality_api.routers.runs import start_run

    watch = db.one("SELECT * FROM watches WHERE id = ?", (watch_id,))
    if not watch:
        return None
    p = _principal_for(watch)
    if not p:
        return None
    now = db.now()
    db.run("UPDATE watches SET next_run_at = ? WHERE id = ?", (now + watch["interval_minutes"] * 60, watch_id))
    try:
        out = await start_run(p, Workflow.model_validate(db.loads(watch["workflow_doc"])),
                              RunInput.model_validate(db.loads(watch["input"])), watch_id=watch_id)
    except Exception as exc:  # noqa: BLE001
        log.warning("Watch %s could not start: %s", watch_id, getattr(exc, "detail", exc))
        return None
    db.run("UPDATE watches SET last_run_id = ?, last_run_at = ? WHERE id = ?", (out["id"], now, watch_id))
    return out["id"]


async def on_run_complete(run_id: str, result: dict[str, Any] | None) -> None:
    run = db.one("SELECT watch_id, workspace_id FROM runs WHERE id = ?", (run_id,))
    if not run or not run["watch_id"] or result is None:
        return
    watch = db.one("SELECT * FROM watches WHERE id = ?", (run["watch_id"],))
    if not watch:
        return
    metrics = extract_metrics(result)
    prev = db.one("SELECT metrics FROM watch_snapshots WHERE watch_id = ? ORDER BY created_at DESC LIMIT 1", (watch["id"],))
    changes = diff_metrics(db.loads(prev["metrics"], {}), metrics) if prev else []
    db.run("INSERT INTO watch_snapshots (id, watch_id, run_id, created_at, metrics, diff) VALUES (?,?,?,?,?,?)",
           (db.new_id("snap"), watch["id"], run_id, db.now(), db.dumps(metrics), db.dumps(changes)))
    if changes:
        ws = db.one("SELECT * FROM workspaces WHERE id = ?", (watch["workspace_id"],)) or {}
        lines = [f"Reality Check watch '{watch['name']}' changed:"]
        for c in changes:
            lines.append(f"- {c['label']}: " + (", ".join(map(str, c["added"])) if "added" in c
                                               else f"{c['before']} -> {c['after']}"))
        text = "\n".join(lines)
        channels = db.loads(watch["channels"], [])
        if "telegram" in channels and ws.get("alert_telegram_chat"):
            await send_telegram(ws["alert_telegram_chat"], text)
        if "email" in channels and ws.get("alert_email"):
            await send_email(ws["alert_email"], f"Watch changed: {watch['name']}", text)


async def tick() -> None:
    due = db.many("SELECT id FROM watches WHERE active = 1 AND next_run_at <= ?", (db.now(),))
    for w in due:
        await run_watch(w["id"])


def purge_old_runs() -> None:
    for ws in db.many("SELECT id, retention_days FROM workspaces"):
        cutoff = db.now() - ws["retention_days"] * 86400
        old = [r["id"] for r in db.many("SELECT id FROM runs WHERE workspace_id = ? AND created_at < ?", (ws["id"], cutoff))]
        for rid in old:
            for table in ("run_events", "evidence", "verdicts", "ad_packs"):
                db.run(f"DELETE FROM {table} WHERE run_id = ?", (rid,))  # noqa: S608 - fixed table names
            db.run("DELETE FROM runs WHERE id = ?", (rid,))


def start_scheduler() -> None:
    manager.hooks.append(on_run_complete)
    if not scheduler.running:
        scheduler.add_job(tick, "interval", minutes=1, id="watch_tick", replace_existing=True, max_instances=1)
        scheduler.add_job(purge_old_runs, "interval", hours=24, id="retention", replace_existing=True)
        scheduler.start()


def stop_scheduler() -> None:
    if scheduler.running:
        scheduler.shutdown(wait=False)
