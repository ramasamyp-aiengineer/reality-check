from evidence_agents.rules import rule
from evidence_agents.signals import AppProfile, ClaimSet, Finding, RegistryStatus, SignalBag
from evidence_agents.text import name_similarity


@rule("app.not_found", "App not found on Google Play", ("ClaimSet",),
      "The message promotes an app that Google Play search does not return.")
def not_found(bag: SignalBag) -> list[Finding]:
    claim: ClaimSet = bag.first(ClaimSet)
    if not claim.app_name or "AppProfile" in bag.types():
        return []
    if not any(e.engine == "google_play" for e in bag.evidence.values()):
        return []
    return [Finding(id="app_not_found", rule="", kind="gap", severity="medium",
                    title=f"No Google Play app closely matches '{claim.app_name}'",
                    detail="Apps pushed through forwards are often sideloaded APKs outside the Play Store.")]


@rule("app.developer_mismatch", "Developer does not match the claimed or registered company",
      ("AppProfile",), "The Play Store developer name is compared with the company in the message and in the registry.")
def developer_mismatch(bag: SignalBag) -> list[Finding]:
    app: AppProfile = bag.first(AppProfile)
    claim: ClaimSet | None = bag.first(ClaimSet)
    reg: RegistryStatus | None = next((r for r in bag.all(RegistryStatus) if r.matched), None)
    out = []
    if not app.developer:
        return out
    if claim and claim.company_name:
        score = name_similarity(app.developer, claim.company_name)
        if score < 80:
            out.append(Finding(id="dev_vs_claim", rule="", kind="contradiction", severity="medium",
                               title=f"Play developer '{app.developer}' is not '{claim.company_name}'",
                               detail=f"Name similarity {score:.0f}/100.", evidence_ids=app.evidence_ids[:1]))
    if reg and (reg.match_owner or reg.regulated_entity):
        best = max(name_similarity(app.developer, reg.match_owner), name_similarity(app.developer, reg.regulated_entity))
        if best < 60:
            out.append(Finding(id="dev_vs_registry", rule="", kind="contradiction", severity="medium",
                               title=f"Play developer '{app.developer}' differs from the registered owner",
                               detail=f"Registry owner: {reg.match_owner or reg.regulated_entity}. Similarity {best:.0f}/100.",
                               evidence_ids=app.evidence_ids[:1] + reg.evidence_ids[:1]))
    return out


@rule("app.low_rating", "Low Play Store rating", ("AppProfile",), "An overall rating under 3.0 is a warning sign.")
def low_rating(bag: SignalBag) -> list[Finding]:
    app: AppProfile = bag.first(AppProfile)
    if app.rating is not None and app.rating < 3.0:
        return [Finding(id="app_low_rating", rule="", kind="contradiction", severity="low",
                        title=f"Overall Play rating is {app.rating:.1f}", evidence_ids=app.evidence_ids[:1])]
    return []
