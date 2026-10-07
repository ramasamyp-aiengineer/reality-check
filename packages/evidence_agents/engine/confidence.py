"""Confidence is computed from measurable factors, never invented by a model."""

from __future__ import annotations

from evidence_agents.signals import (
    AppProfile,
    ConfidenceFactor,
    Finding,
    PlaceProfile,
    RegistryStatus,
    SignalBag,
)
from evidence_agents.text import days_ago, registered_domain

WEIGHTS = {"independence": 0.25, "recency": 0.15, "entity_match": 0.20, "ground_truth": 0.20, "agreement": 0.20}


def compute_confidence(bag: SignalBag, findings: list[Finding]) -> tuple[float, list[ConfidenceFactor]]:
    evidence = list(bag.evidence.values())
    engines = {e.engine for e in evidence if e.engine}
    domains = {registered_domain(e.url) for e in evidence if e.url}
    domains.discard(None)
    independence = min(1.0, (len(engines) / 4) * 0.6 + (min(len(domains), 10) / 10) * 0.4)

    dated = [d for d in (days_ago(e.published_at) for e in evidence) if d is not None]
    recency = (sum(1 for d in dated if d <= 90) / len(dated)) if dated else 0.5

    scores = [s.match_score for s in bag.all(AppProfile) + bag.all(PlaceProfile) if s.match_score]
    scores += [r.match_score for r in bag.all(RegistryStatus) if r.matched]
    entity = (sum(scores) / len(scores) / 100) if scores else 0.5

    regs = bag.all(RegistryStatus)
    if regs:
        ground = 0.6 if all(r.is_sample for r in regs) else 1.0
    else:
        ground = 0.4

    contra = sum(1 for f in findings if f.kind == "contradiction")
    support = sum(1 for f in findings if f.kind == "support")
    total = contra + support
    agreement = 1.0 - (min(contra, support) / total) if total else 0.5

    factors = [
        ConfidenceFactor(name="Source independence", score=round(independence, 2), weight=WEIGHTS["independence"],
                         detail=f"{len(engines)} SerpApi engines, {len(domains)} distinct domains"),
        ConfidenceFactor(name="Recency", score=round(recency, 2), weight=WEIGHTS["recency"],
                         detail=f"{sum(1 for d in dated if d <= 90)} of {len(dated)} dated items from the last 90 days"
                         if dated else "No dated evidence"),
        ConfidenceFactor(name="Entity match", score=round(entity, 2), weight=WEIGHTS["entity_match"],
                         detail=f"Average match score {entity * 100:.0f}/100" if scores else "No entity matching needed"),
        ConfidenceFactor(name="Ground truth", score=round(ground, 2), weight=WEIGHTS["ground_truth"],
                         detail=("Checked against official registry" if regs and ground == 1.0 else
                                 "Checked against a sample registry snapshot" if regs else "No registry applies")),
        ConfidenceFactor(name="Agreement", score=round(agreement, 2), weight=WEIGHTS["agreement"],
                         detail=f"{contra} contradicting vs {support} supporting findings"),
    ]
    value = sum(f.score * f.weight for f in factors) * 100
    if len(evidence) < 3:
        value = min(value, 35)
    return round(value), factors
