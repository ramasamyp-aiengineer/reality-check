from evidence_agents.rules import rule
from evidence_agents.signals import Finding, ReviewWindow, SignalBag

MOMENTUM_GAP = 1.5
COMPLAINT_SHARE = 0.20

_TOPIC_NAMES = {"harassment": "harassment or threats", "hidden_charges": "hidden charges",
                "fraud_terms": "fraud or scam", "data_privacy": "contact or data access"}


@rule("reviews.momentum_drop", "Review momentum has turned", ("ReviewWindow",),
      f"Newest-review average more than {MOMENTUM_GAP} stars below the overall rating.")
def momentum_drop(bag: SignalBag) -> list[Finding]:
    out = []
    for w in bag.all(ReviewWindow):
        if w.overall_rating and w.newest_avg is not None and w.newest_count >= 10:
            gap = w.overall_rating - w.newest_avg
            if gap > MOMENTUM_GAP:
                out.append(Finding(
                    id=f"momentum_{w.source}", rule="", kind="contradiction", severity="medium",
                    title=f"Newest {w.newest_count} reviews average {w.newest_avg:.1f} vs {w.overall_rating:.1f} overall",
                    detail="The overall rating hides a recent decline.",
                    evidence_ids=[q.evidence_id for q in w.quotes[:2] if q.evidence_id]))
    return out


@rule("reviews.complaint_share", "Recent reviews report harm", ("ReviewWindow",),
      f"Harassment, hidden-charge, fraud or data-access topics in more than {int(COMPLAINT_SHARE * 100)}% of newest reviews.")
def complaint_share(bag: SignalBag) -> list[Finding]:
    out = []
    for w in bag.all(ReviewWindow):
        if w.newest_count >= 10 and w.complaint_share > COMPLAINT_SHARE:
            top = sorted(((k, v) for k, v in w.topic_shares.items() if k in _TOPIC_NAMES), key=lambda kv: -kv[1])[:3]
            topics = ", ".join(f"{_TOPIC_NAMES[k]} {v:.0%}" for k, v in top)
            quotes = [q.evidence_id for q in w.quotes if q.evidence_id and set(q.topics) & set(_TOPIC_NAMES)][:3]
            out.append(Finding(
                id=f"complaints_{w.source}", rule="", kind="contradiction", severity="high",
                title=f"{w.complaint_share:.0%} of the newest {w.newest_count} reviews report harm",
                detail=f"Top topics: {topics}.", evidence_ids=quotes))
    return out


@rule("reviews.healthy", "Recent reviews are healthy", ("ReviewWindow",),
      "Newest reviews average 4+ with almost no complaint topics (stronger with 20+ reviews).")
def healthy(bag: SignalBag) -> list[Finding]:
    return [
        Finding(id=f"healthy_{w.source}", rule="", kind="support", severity="medium" if w.newest_count >= 20 else "low",
                title=f"Newest {w.newest_count} reviews average {w.newest_avg:.1f} with few complaints",
                evidence_ids=[q.evidence_id for q in w.quotes[:2] if q.evidence_id])
        for w in bag.all(ReviewWindow)
        if w.newest_avg is not None and w.newest_avg >= 4.0 and w.complaint_share < 0.05 and w.newest_count >= 5
    ]
