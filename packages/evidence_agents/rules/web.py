from evidence_agents.rules import rule
from evidence_agents.signals import ComplaintMentions, Finding, SignalBag


@rule("web.complaints", "Complaints across the web", ("ComplaintMentions",),
      "Independent complaint sites and forums mention the seller or entity alongside fraud or scam terms. "
      "Complaints about a product itself are reported as a signal, not as evidence against an offer.")
def complaints(bag: SignalBag) -> list[Finding]:
    out = []
    for c in bag.all(ComplaintMentions):
        domains = "Domains: " + ", ".join(c.complaint_domains[:5])
        if c.subject_kind == "product" and c.complaint_hits:
            out.append(Finding(
                id="web_product_complaints", rule="", kind="signal", severity="low",
                title=f"Owners report problems with the {c.subject or 'product'} itself ({c.complaint_hits} of "
                      f"{c.results_scanned} results)",
                detail=f"These are product reviews, not evidence about this offer or seller. {domains}",
                evidence_ids=c.evidence_ids[:3]))
        elif c.complaint_hits >= 3:
            out.append(Finding(id="web_complaints", rule="", kind="contradiction", severity="medium",
                               title=f"{c.complaint_hits} of {c.results_scanned} web results carry complaint or scam terms",
                               detail=domains, evidence_ids=c.evidence_ids[:3]))
        elif c.complaint_hits:
            out.append(Finding(id="web_some_complaints", rule="", kind="signal", severity="low",
                               title=f"{c.complaint_hits} web result(s) mention complaints", evidence_ids=c.evidence_ids[:2]))
    return out


@rule("web.official_site", "Official website found", ("ComplaintMentions",),
      "An official domain for the entity appears in organic results.")
def official_site(bag: SignalBag) -> list[Finding]:
    return [Finding(id="web_official", rule="", kind="support", severity="low",
                    title=f"Official site found: {c.official_domain}", evidence_ids=c.evidence_ids[:1])
            for c in bag.all(ComplaintMentions) if c.official_site_found and c.official_domain]
