from evidence_agents.rules import rule
from evidence_agents.signals import ClaimSet, Finding, RegistryStatus, SignalBag
from evidence_agents.text import name_similarity

_REGISTRY_NAMES = {"rbi_dla": "RBI's directory of digital lending apps", "sebi_ia_ra": "SEBI's registered adviser lists"}


@rule("registry.not_listed", "Not found in the regulator registry", ("RegistryStatus", "ClaimSet"),
      "A lender or adviser that cannot be found in the official registry snapshot is unverified.")
def not_listed(bag: SignalBag) -> list[Finding]:
    claim: ClaimSet = bag.first(ClaimSet)
    out = []
    for reg in bag.all(RegistryStatus):
        relevant = (reg.registry == "rbi_dla" and claim.claim_type == "loan_offer") or (
            reg.registry == "sebi_ia_ra" and claim.claim_type == "investment_tip")
        if relevant and not reg.matched:
            out.append(Finding(
                id=f"not_listed_{reg.registry}", rule="", kind="gap", severity="high",
                title=f"'{reg.query}' was not found in {_REGISTRY_NAMES[reg.registry]}",
                detail=(f"Checked {reg.snapshot_size} entries (snapshot {reg.checked_at[:10]}). Not being listed "
                        "does not prove wrongdoing, but legitimate lenders must report their apps to RBI."),
                evidence_ids=reg.evidence_ids,
            ))
    return out


@rule("registry.listed", "Listed in the regulator registry", ("RegistryStatus",),
      "A registry match is strong ground truth for the claimed association.")
def listed(bag: SignalBag) -> list[Finding]:
    return [
        Finding(id=f"listed_{r.registry}", rule="", kind="support", severity="high",
                title=f"'{r.query}' is listed in {_REGISTRY_NAMES[r.registry]}",
                detail=f"Matched '{r.match_name}' ({r.match_method.replace('_', ' ')}, score {r.match_score:.0f}). "
                       f"Regulated entity: {r.regulated_entity or 'n/a'}.",
                evidence_ids=r.evidence_ids)
        for r in bag.all(RegistryStatus) if r.matched
    ]


@rule("registry.lender_mismatch", "Claimed lender differs from the registered one", ("RegistryStatus", "ClaimSet"),
      "The forward names a company that is not the regulated entity behind the listed app.")
def lender_mismatch(bag: SignalBag) -> list[Finding]:
    claim: ClaimSet = bag.first(ClaimSet)
    out = []
    for r in bag.all(RegistryStatus):
        if r.matched and claim.company_name and r.regulated_entity:
            score = name_similarity(claim.company_name, r.regulated_entity)
            if score < 60:
                out.append(Finding(
                    id=f"lender_mismatch_{r.registry}", rule="", kind="contradiction", severity="medium",
                    title=f"Message names '{claim.company_name}', registry lists '{r.regulated_entity}'",
                    detail=f"Name similarity {score:.0f}/100.", evidence_ids=r.evidence_ids))
    return out
