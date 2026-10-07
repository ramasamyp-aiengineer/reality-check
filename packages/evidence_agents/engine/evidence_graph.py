"""Evidence graph: claim -> signals -> evidence, with findings drawn as supporting or contradicting edges."""

from __future__ import annotations

from typing import Any

from evidence_agents.signals import ClaimSet, Signal, SignalBag, Verdict

SIGNAL_LABELS = {
    "RegistryStatus": "Regulator registry",
    "AppProfile": "Play Store identity",
    "ReviewWindow": "Newest reviews",
    "ComplaintMentions": "Web reputation",
    "NewsEvents": "News timeline",
    "AdvertiserProfile": "Ad transparency",
    "PriceBand": "Store prices",
    "TrendSeries": "Search demand",
    "RegionInterest": "Demand by state",
    "RisingQueries": "Rising searches",
    "PlaceProfile": "Maps listing",
    "ImageMatches": "Image provenance",
    "FareInsight": "Fare insight",
    "HotelBand": "Hotel prices",
    "Quote": "Market quote",
    "JobPostings": "Job postings",
    "MarketBrief": "Market brief",
    "AdPack": "Ad pack",
    "BusinessProfile": "Business profile",
}

_EVIDENCE_PER_SIGNAL = 3


def _signal_label(sig: Signal) -> tuple[str, str]:
    label = SIGNAL_LABELS.get(sig.type, sig.type)
    detail = ""
    d = sig.model_dump()
    if sig.type == "RegistryStatus":
        detail = "Listed" if d["matched"] else "Not found in snapshot"
    elif sig.type == "AppProfile":
        detail = f"{d.get('developer') or 'unknown developer'}"
    elif sig.type == "ReviewWindow":
        detail = f"{d.get('newest_count', 0)} newest, avg {d.get('newest_avg') or '-'}"
    elif sig.type == "PriceBand":
        detail = f"{d.get('store_count', 0)} stores, from {d.get('min_price') or '-'}"
    elif sig.type == "NewsEvents":
        detail = f"{len(d.get('items', []))} articles"
    elif sig.type == "AdvertiserProfile":
        detail = f"{len(d.get('advertisers', []))} advertisers"
    elif sig.type == "ComplaintMentions":
        detail = f"{d.get('complaint_hits', 0)} complaint hits"
    return label, detail


def build_graph(bag: SignalBag, verdict: Verdict | None) -> dict[str, Any]:
    nodes: list[dict[str, Any]] = []
    edges: list[dict[str, Any]] = []
    seen: set[str] = set()

    def add_node(node: dict[str, Any]) -> None:
        if node["id"] not in seen:
            seen.add(node["id"])
            nodes.append(node)

    claim = bag.first(ClaimSet)
    root_label = (claim.summary or claim.raw_text[:80]) if claim else "Input"
    add_node({"id": "claim", "kind": "claim", "label": "Claim", "detail": root_label})

    for i, sig in enumerate(bag.signals):
        if sig.type in ("ClaimSet", "Verdict"):
            continue
        sid = f"sig_{i}"
        label, detail = _signal_label(sig)
        add_node({"id": sid, "kind": "signal", "label": label, "detail": detail, "signal_type": sig.type,
                  "agent": sig.agent})
        edges.append({"id": f"e_claim_{sid}", "source": "claim", "target": sid, "kind": "investigates"})
        for ev_id in sig.evidence_ids[:_EVIDENCE_PER_SIGNAL]:
            ev = bag.evidence.get(ev_id)
            if not ev:
                continue
            add_node({"id": ev.id, "kind": "evidence", "label": ev.title[:60], "detail": ev.source or "",
                      "engine": ev.engine, "url": ev.url})
            edges.append({"id": f"e_{sid}_{ev.id}", "source": sid, "target": ev.id, "kind": "backed_by"})

    if verdict:
        add_node({"id": "verdict", "kind": "verdict", "label": verdict.evidence_status.replace("_", " "),
                  "detail": verdict.decision.replace("_", " "), "status": verdict.evidence_status})
        for f in verdict.findings:
            if f.kind == "signal":
                continue
            fid = f"finding_{f.id}"
            add_node({"id": fid, "kind": "finding", "label": f.title[:70], "detail": f.severity,
                      "finding_kind": f.kind})
            edges.append({"id": f"e_{fid}_verdict", "source": fid, "target": "verdict", "kind": f.kind})
            for ev_id in f.evidence_ids[:2]:
                ev = bag.evidence.get(ev_id)
                if not ev:
                    continue
                add_node({"id": ev.id, "kind": "evidence", "label": ev.title[:60], "detail": ev.source or "",
                          "engine": ev.engine, "url": ev.url})
                edges.append({"id": f"e_{ev.id}_{fid}", "source": ev.id, "target": fid, "kind": f.kind})
    return {"nodes": nodes, "edges": edges}
