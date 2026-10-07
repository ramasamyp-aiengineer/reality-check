from evidence_agents.rules import rule
from evidence_agents.signals import AdvertiserProfile, ClaimSet, Finding, RegistryStatus, SignalBag
from evidence_agents.text import name_similarity


@rule("ads.advertiser_identity", "Who is paying for the ads", ("AdvertiserProfile", "ClaimSet"),
      "Compares verified advertiser names in Google's Ads Transparency Center with the claimed or registered company.")
def advertiser_identity(bag: SignalBag) -> list[Finding]:
    claim: ClaimSet = bag.first(ClaimSet)
    if claim.claim_type == "market_research":
        return []
    profile: AdvertiserProfile = bag.first(AdvertiserProfile)
    reg = next((r for r in bag.all(RegistryStatus) if r.matched), None)
    expected = [n for n in (claim.company_name, reg.regulated_entity if reg else None, reg.match_owner if reg else None) if n]
    if not profile.advertisers:
        return [Finding(id="ads_none", rule="", kind="gap", severity="low",
                        title=f"No verified advertiser found for '{profile.query}' in Google's Ads Transparency Center")]
    if not expected:
        return []
    best = max(((a, max(name_similarity(a.name, e) for e in expected)) for a in profile.advertisers), key=lambda t: t[1])
    if best[1] >= 75:
        return [Finding(id="ads_match", rule="", kind="support", severity="low",
                        title=f"Ads are run by verified advertiser '{best[0].name}'",
                        evidence_ids=[best[0].evidence_id] if best[0].evidence_id else [])]
    names = ", ".join(a.name for a in profile.advertisers[:3])
    return [Finding(id="ads_mismatch", rule="", kind="contradiction", severity="medium",
                    title="Ads for this name are paid for by different companies",
                    detail=f"Advertisers: {names}. Expected: {', '.join(expected)}.",
                    evidence_ids=[a.evidence_id for a in profile.advertisers[:2] if a.evidence_id])]
