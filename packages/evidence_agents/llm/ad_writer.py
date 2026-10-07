"""Grounded ad generation and compliance checking.

Ads may only state facts that exist as evidence (or the advertiser's own profile). Every claim
carries evidence ids, Google Ads character limits are enforced in code, and superlatives or price
claims without support are flagged (ASCI requires claims to be substantiated).
"""

from __future__ import annotations

import re

from pydantic import BaseModel, Field

from evidence_agents.llm.base import LLMConfig, run_structured, untrusted
from evidence_agents.signals import AdClaim, AdPack, AdVariant, BusinessProfile, MarketBrief, PriceBand

HEADLINE_MAX = 30
DESCRIPTION_MAX = 90
_SUPERLATIVE = re.compile(r"\b(best|cheapest|lowest|no\.?\s?1|number one|#1|fastest|guaranteed|100%|top[- ]rated|"
                          r"unbeatable|india'?s (?:first|largest|biggest))\b", re.I)
_PRICE = re.compile(r"(?:₹|rs\.?\s?)([0-9][0-9,]*)", re.I)


def _fits(text: str, limit: int) -> str:
    """Trim to whole words within the platform limit (ad platforms reject ellipses and cut-off words)."""
    if len(text) <= limit:
        return text
    out = ""
    for word in text.split():
        candidate = f"{out} {word}".strip()
        if len(candidate) > limit:
            break
        out = candidate
    return out.rstrip(" ,.;:-|") or text[:limit]


def _title(text: str) -> str:
    return " ".join(w if any(c.isupper() for c in w) else w.capitalize() for w in text.split())


def _price_facts(profile: BusinessProfile | None, band: PriceBand | None) -> set[int]:
    facts = set()
    if profile and profile.price:
        facts.add(int(profile.price))
    if band:
        facts |= {int(o.price) for o in band.observations}
        for v in (band.min_price, band.median_price, band.max_price):
            if v:
                facts.add(int(v))
    return facts


def check_text(text: str, *, limit: int | None, profile: BusinessProfile | None, band: PriceBand | None) -> list[str]:
    flags = []
    if limit and len(text) > limit:
        flags.append(f"Over {limit} characters ({len(text)}): '{text[:40]}…'")
    for m in _SUPERLATIVE.finditer(text):
        word = m.group(0).lower()
        supported = word in ("cheapest", "lowest") and profile and profile.price and band and band.min_price \
            and profile.price <= band.min_price
        if not supported:
            flags.append(f"Unsupported claim '{m.group(0)}' in '{text[:60]}': needs evidence (ASCI substantiation)")
    facts = _price_facts(profile, band)
    for m in _PRICE.finditer(text):
        value = int(m.group(1).replace(",", ""))
        if value not in facts:
            flags.append(f"Price Rs {value:,} is not backed by evidence or your profile")
    return flags


def check_variant(v: AdVariant, profile: BusinessProfile | None, band: PriceBand | None,
                  known_evidence: set[str]) -> AdVariant:
    flags: list[str] = []
    for h in v.headlines:
        flags += check_text(h, limit=HEADLINE_MAX, profile=profile, band=band)
    for d in v.descriptions:
        flags += check_text(d, limit=DESCRIPTION_MAX, profile=profile, band=band)
    if v.body:
        flags += check_text(v.body, limit=None, profile=profile, band=band)
    for c in v.claims:
        unknown = [e for e in c.evidence_ids if e not in known_evidence and e != "profile"]
        if unknown or not c.evidence_ids:
            c.supported = False
            flags.append(f"Claim without evidence: '{c.text[:60]}'")
    v.flags = list(dict.fromkeys(flags))
    return v


def _hashtag(text: str) -> str:
    return "#" + re.sub(r"[^a-z0-9]", "", text.lower())


def deterministic_pack(brief: MarketBrief, profile: BusinessProfile | None, band: PriceBand | None) -> AdPack:
    name = (profile.business_name if profile and profile.business_name else "Your brand")
    topic = brief.topic
    city = profile.city if profile and profile.city else None
    usp = profile.usp if profile and profile.usp else None
    price = profile.price if profile else None
    trend_ids = next((o.evidence_ids for o in brief.opportunities if "Search interest" in o.text), [])
    region_ids = next((o.evidence_ids for o in brief.opportunities if "Concentrate" in o.text), [])
    pain_ids = next((o.evidence_ids for o in brief.opportunities if "complain" in o.text), [])
    price_ids = band.evidence_ids[:2] if band else []

    branded = _title(f"{name} {topic}")
    headlines = [branded if len(branded) <= HEADLINE_MAX else _fits(name, HEADLINE_MAX)]
    if city:
        headlines.append(_fits(f"{_title(topic)} in {city}", HEADLINE_MAX))
    if price:
        headlines.append(_fits(f"{_title(topic)} from ₹{price:,.0f}", HEADLINE_MAX))
    if usp:
        headlines.append(_fits(usp, HEADLINE_MAX))
    vehicle = re.search(r"scooter|bike|motorcycle|\bcar\b|vehicle|\bev\b", topic, re.I)
    headlines.append("Book A Test Ride Today" if vehicle else "Enquire Today")
    headlines += [q.title() for q in brief.rising_queries[:3] if len(q) <= HEADLINE_MAX]

    claims: list[AdClaim] = []
    descriptions = []
    if usp:
        d = f"{usp}." + (f" Visit us in {city}." if city else "")
        descriptions.append(_fits(d, DESCRIPTION_MAX))
        claims.append(AdClaim(text=usp, evidence_ids=["profile"]))
    if brief.pain_points and usp:
        pain = brief.pain_points[0].split(" (")[0]
        descriptions.append(_fits(f"Tired of {pain} issues? {usp}.", DESCRIPTION_MAX))
        claims.append(AdClaim(text=f"Customers of other brands report {pain} problems", evidence_ids=pain_ids))
    if price and band and band.median_price and price < band.median_price:
        descriptions.append(_fits(f"Priced below the market median of ₹{band.median_price:,.0f} across "
                                  f"{band.store_count} stores.", DESCRIPTION_MAX))
        claims.append(AdClaim(text=f"Below the market median of Rs {band.median_price:,.0f}", evidence_ids=price_ids))

    momentum = brief.momentum_pct
    regions = [r.name for r in brief.top_regions[:3]]
    insta_body = (f"{topic.title()} interest in India is {brief.momentum_label}"
                  + (f" ({momentum:+.0f}%)" if momentum is not None else "") + ". "
                  + (f"{usp}. " if usp else "") + (f"Now in {city}. " if city else "") + "DM us to book a test ride.")
    public_opps = [o for o in brief.opportunities if not o.text.startswith(("Bid on", "In the news"))]
    linkedin_body = (
        f"What Indian search data says about {topic} right now:\n"
        + "\n".join(f"- {o.text}" for o in public_opps[:4])
        + f"\n\nAt {name}, we are building for exactly this demand." + (f" {usp}." if usp else "")
        + "\n\nSource: Google Trends, Google Shopping and Ads Transparency data via SerpApi."
    )
    wa_body = (f"Hi! {name} here." + (f" {usp}." if usp else "") + (f" Prices from ₹{price:,.0f}." if price else "")
               + (f" Visit our {city} showroom" if city else " Visit us") + " this week. Reply YES for a free test ride.")
    variants = [
        AdVariant(channel="google_search", headlines=headlines[:10], descriptions=descriptions[:4], claims=claims),
        AdVariant(channel="instagram", body=insta_body, hashtags=[_hashtag(topic)] + [_hashtag(q) for q in brief.rising_queries[:4]],
                  claims=[AdClaim(text=f"Interest is {brief.momentum_label}", evidence_ids=trend_ids)] if momentum is not None else []),
        AdVariant(channel="linkedin", body=linkedin_body,
                  claims=[AdClaim(text=o.text, evidence_ids=o.evidence_ids) for o in public_opps[:4]]),
        AdVariant(channel="whatsapp", body=wa_body, claims=[AdClaim(text=usp, evidence_ids=["profile"])] if usp else []),
    ]
    return AdPack(agent="ad_agent", topic=topic, business_name=name, variants=variants, target_regions=regions,
                  target_keywords=[topic] + brief.rising_queries[:6], evidence_ids=trend_ids + region_ids + price_ids)


class _LLMVariant(BaseModel):
    channel: str
    headlines: list[str] = Field(default_factory=list)
    descriptions: list[str] = Field(default_factory=list)
    body: str = ""
    hashtags: list[str] = Field(default_factory=list)
    claims: list[AdClaim] = Field(default_factory=list)


class _LLMPack(BaseModel):
    variants: list[_LLMVariant]


async def write_ads(brief: MarketBrief, profile: BusinessProfile | None, band: PriceBand | None,
                    known_evidence: set[str], llm: LLMConfig | None) -> AdPack:
    pack = deterministic_pack(brief, profile, band)
    facts = [{"evidence_ids": o.evidence_ids, "fact": o.text} for o in brief.opportunities]
    if profile:
        facts.append({"evidence_ids": ["profile"], "fact": profile.model_dump_json(exclude={"type", "agent", "evidence_ids"})})
    out = await run_structured(
        llm, _LLMPack,
        "Write ads for an Indian business: one google_search variant (up to 10 headlines of max 30 characters, up to "
        "4 descriptions of max 90 characters), one instagram, one linkedin and one whatsapp variant. Use ONLY the "
        "facts provided and list every factual claim with the evidence_ids of the facts it uses. No superlatives "
        "(best, cheapest, #1) unless a fact proves them.",
        untrusted(str(facts)),
    )
    if out:
        variants = []
        for v in out.variants:
            if v.channel in ("google_search", "instagram", "linkedin", "whatsapp"):
                variants.append(AdVariant(**v.model_dump()))
        if variants:
            pack.variants = variants
            pack.generated_by = llm.model if llm and llm.model else "llm"
    known = known_evidence | {"profile"}
    pack.variants = [check_variant(v, profile, band, known) for v in pack.variants]
    pack.compliance_flags = [f for v in pack.variants for f in v.flags]
    return pack
