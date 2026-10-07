from evidence_agents.rules import rule
from evidence_agents.signals import ClaimSet, Finding, SignalBag

_HIGH_RISK = ("upfront fee", "advance fee", "pay to unlock", "registration fee", "guaranteed returns",
              "double your money", "share otp", "processing fee before")


@rule("claim.red_flags", "Pressure and red-flag phrases", ("ClaimSet",),
      "Phrases regulators and police repeatedly link to scams (no credit check, upfront fee, guaranteed returns).")
def red_flags(bag: SignalBag) -> list[Finding]:
    claim: ClaimSet = bag.first(ClaimSet)
    if not claim.red_flags or claim.claim_type == "market_research":
        return []
    high = [f for f in claim.red_flags if any(h in f.lower() for h in _HIGH_RISK)]
    return [Finding(
        id="red_flags", rule="", kind="contradiction" if high else "signal",
        severity="high" if high else "medium",
        title="Message uses red-flag phrases: " + ", ".join(f"'{f}'" for f in claim.red_flags[:4]),
        detail="These phrases match patterns in RBI and cyber-police advisories. They are a warning, not proof.")]
