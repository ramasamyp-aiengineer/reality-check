"""Two-part verdict: what the evidence says, and what the user should do. Rules decide; the LLM may only rephrase."""

from __future__ import annotations

from evidence_agents.engine.confidence import compute_confidence
from evidence_agents.rules import evaluate
from evidence_agents.signals import Action, ClaimSet, Finding, SignalBag, Verdict

RISKY = {"loan_offer", "investment_tip", "job_offer", "customer_care"}
EVIDENCE_SIGNALS = {"RegistryStatus", "AppProfile", "ReviewWindow", "ComplaintMentions", "NewsEvents",
                    "AdvertiserProfile", "PriceBand", "PlaceProfile", "ImageMatches", "FareInsight", "HotelBand",
                    "Quote", "JobPostings", "TrendSeries"}

ACTIONS: dict[str, list[Action]] = {
    "loan_offer": [
        Action(label="Check the app in RBI's DLA directory (Citizen's Corner)", url="https://www.rbi.org.in/", kind="verify"),
        Action(label="Check the lender on RBI's Sachet portal", url="https://sachet.rbi.org.in/", kind="verify"),
        Action(label="Never grant contacts, gallery or SMS access to a loan app", kind="protect"),
        Action(label="Lost money or being harassed? Call 1930 or report at cybercrime.gov.in",
               url="https://cybercrime.gov.in/", kind="report"),
        Action(label="Report the forward on Chakshu (Sanchar Saathi)", url="https://sancharsaathi.gov.in/", kind="report"),
    ],
    "investment_tip": [
        Action(label="Verify the adviser on SEBI's intermediary lists", url="https://www.sebi.gov.in/", kind="verify"),
        Action(label="Never pay into personal UPI IDs for 'tips'", kind="protect"),
        Action(label="File a complaint on SEBI SCORES", url="https://scores.sebi.gov.in/", kind="report"),
    ],
    "job_offer": [
        Action(label="Apply only through the company's official careers page", kind="verify"),
        Action(label="Never pay a registration or training fee for a job", kind="protect"),
        Action(label="Report at cybercrime.gov.in or call 1930", url="https://cybercrime.gov.in/", kind="report"),
    ],
    "customer_care": [
        Action(label="Use only the number on the official app or website", kind="verify"),
        Action(label="Never share OTPs or install screen-sharing apps on a call", kind="protect"),
    ],
    "deal_price": [
        Action(label="Buy only from the stores listed in the evidence", kind="verify"),
        Action(label="Watch this product and get alerted on real price drops", kind="watch"),
    ],
}


def _status(bag: SignalBag, findings: list[Finding]) -> str:
    evidence_signals = bag.types() & EVIDENCE_SIGNALS
    contra = [f for f in findings if f.kind == "contradiction"]
    high_contra = any(f.severity == "high" for f in contra)
    high_gap = any(f.kind == "gap" and f.severity == "high" for f in findings)
    supports = [f for f in findings if f.kind == "support"]
    if not evidence_signals or len(bag.evidence) < 3:
        return "INSUFFICIENT_EVIDENCE"
    if high_contra or len(contra) >= 2:
        return "CONTRADICTED"
    if contra or high_gap:
        return "UNVERIFIED"
    if len(supports) >= 2:
        return "CORROBORATED"
    open_questions = any(f.kind == "gap" or (f.kind == "signal" and f.severity != "low") for f in findings)
    return "UNVERIFIED" if supports or open_questions else "INSUFFICIENT_EVIDENCE"


def _decision(status: str, claim_type: str, findings: list[Finding]) -> str:
    risky = claim_type in RISKY
    high_gap = any(f.kind == "gap" and f.severity == "high" for f in findings)
    warnings = any(f.kind in ("signal", "contradiction") and f.severity != "low" for f in findings)
    if status == "CONTRADICTED":
        return "DO_NOT_PROCEED" if risky or any(f.severity == "high" for f in findings if f.kind == "contradiction") \
            else "PROCEED_WITH_CAUTION"
    if status == "UNVERIFIED":
        return "DO_NOT_PROCEED" if risky and high_gap else "WAIT_VERIFY_MORE"
    if status == "INSUFFICIENT_EVIDENCE":
        return "WAIT_VERIFY_MORE"
    return "PROCEED_WITH_CAUTION" if warnings else "SAFE_TO_PROCEED"


_HEADLINES = {
    "CONTRADICTED": "The evidence contradicts this claim",
    "UNVERIFIED": "This claim could not be verified",
    "CORROBORATED": "Independent sources back this claim",
    "INSUFFICIENT_EVIDENCE": "Not enough evidence to judge yet",
}


def explain(status: str, decision: str, findings: list[Finding], subject: str) -> str:
    contra = [f.title for f in findings if f.kind == "contradiction"][:3]
    gaps = [f.title for f in findings if f.kind == "gap"][:2]
    signals = [f.title for f in findings if f.kind == "signal"][:2]
    support = [f.title for f in findings if f.kind == "support"][:2]
    parts = [f"{_HEADLINES[status]} for {subject}."]
    if contra:
        parts.append("Contradictions: " + "; ".join(contra) + ".")
    if gaps:
        parts.append("Gaps: " + "; ".join(gaps) + ".")
    if signals:
        parts.append("Worth knowing: " + "; ".join(signals) + ".")
    if support:
        parts.append("Supporting: " + "; ".join(support) + ".")
    parts.append("Guidance: " + decision.replace("_", " ").lower() + ".")
    return " ".join(parts)


def compute_verdict(bag: SignalBag) -> Verdict:
    findings = evaluate(bag)
    claim: ClaimSet | None = bag.first(ClaimSet)
    claim_type = claim.claim_type if claim else "generic"
    status = _status(bag, findings)
    decision = _decision(status, claim_type, findings)
    confidence, factors = compute_confidence(bag, findings)
    subject = (claim.app_name or claim.company_name or claim.product or claim.topic or "this message") if claim else "this input"
    actions = list(ACTIONS.get(claim_type, []))
    actions.append(Action(label="Watch this and get alerted when the evidence changes", kind="watch"))
    return Verdict(
        agent="verdict",
        evidence_status=status,  # type: ignore[arg-type]
        decision=decision,  # type: ignore[arg-type]
        confidence=confidence,
        confidence_factors=factors,
        findings=findings,
        actions=actions,
        headline=_HEADLINES[status],
        explanation=explain(status, decision, findings, subject),
        evidence_ids=[e for f in findings for e in f.evidence_ids][:20],
    )
