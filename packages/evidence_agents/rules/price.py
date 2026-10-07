from evidence_agents.rules import rule
from evidence_agents.signals import ClaimSet, Finding, PriceBand, SignalBag

TOO_GOOD = 0.40
SUSPICIOUS = 0.15
_OFFER_WORDS = ("bank offer", "cashback", "exchange", "coupon", "card offer", "emi offer", "discount")


def _cheapest(p: PriceBand) -> list[str]:
    return [o.evidence_id for o in sorted(p.observations, key=lambda o: o.price)[:2] if o.evidence_id]


@rule("price.too_good", "Price too good to be true", ("PriceBand",),
      f"Claimed price more than {int(TOO_GOOD * 100)}% below the lowest observed store price.")
def too_good(bag: SignalBag) -> list[Finding]:
    out = []
    for p in bag.all(PriceBand):
        if p.claimed_price and p.min_price and p.store_count >= 2 and p.claimed_price < p.min_price * (1 - TOO_GOOD):
            pct = 1 - p.claimed_price / p.min_price
            lowest = min(p.observations, key=lambda o: o.price)
            out.append(Finding(
                id="price_too_good", rule="", kind="contradiction", severity="high",
                title=f"Claimed Rs {p.claimed_price:,.0f} is {pct:.0%} below the lowest of {p.store_count} stores",
                detail=f"Lowest observed: Rs {lowest.price:,.0f} at {lowest.store}; median Rs {p.median_price:,.0f}.",
                evidence_ids=_cheapest(p)))
    return out


@rule("price.below_market", "Cheaper than every store", ("PriceBand",),
      f"Claimed price is below the cheapest store but by less than {int(TOO_GOOD * 100)}%. Up to "
      f"{int(SUSPICIOUS * 100)}% is a caution signal (often a bank or exchange offer); more is a contradiction.")
def below_market(bag: SignalBag) -> list[Finding]:
    claim = bag.first(ClaimSet)
    offer = bool(claim and any(w in claim.raw_text.lower() for w in _OFFER_WORDS))
    out = []
    for p in bag.all(PriceBand):
        if not (p.claimed_price and p.min_price and p.store_count >= 2):
            continue
        if not (p.min_price * (1 - TOO_GOOD) <= p.claimed_price < p.min_price):
            continue
        pct = 1 - p.claimed_price / p.min_price
        lowest = min(p.observations, key=lambda o: o.price)
        mild = pct <= SUSPICIOUS
        hint = ("The message mentions a bank or exchange offer, which can explain a gap this size; "
                "confirm the final price at checkout." if offer and mild else
                "Confirm the price on the seller's own checkout page before paying.")
        out.append(Finding(
            id="price_below_market", rule="", kind="signal" if mild else "contradiction", severity="medium",
            title=f"Rs {p.claimed_price:,.0f} is {pct:.0%} below the cheapest of {p.store_count} stores",
            detail=f"Cheapest listing: Rs {lowest.price:,.0f} at {lowest.store}; typical price Rs {p.median_price:,.0f}. "
                   + hint,
            evidence_ids=_cheapest(p)))
    return out


@rule("price.within_band", "Price is within the market band", ("PriceBand",),
      "The claimed price sits between the cheapest and the most expensive observed store prices.")
def within_band(bag: SignalBag) -> list[Finding]:
    out = []
    for p in bag.all(PriceBand):
        if p.claimed_price and p.min_price and p.max_price and p.min_price <= p.claimed_price <= p.max_price:
            out.append(Finding(id="price_in_band", rule="", kind="support", severity="medium",
                               title=f"Rs {p.claimed_price:,.0f} is within the observed range of {p.store_count} stores",
                               detail=f"Range Rs {p.min_price:,.0f} to Rs {p.max_price:,.0f}; typical "
                                      f"Rs {p.median_price:,.0f}." if p.median_price else None,
                               evidence_ids=_cheapest(p)))
    return out


@rule("price.above_market", "Pricier than every store", ("PriceBand",),
      "The claimed price is higher than every observed store price.")
def above_market(bag: SignalBag) -> list[Finding]:
    return [Finding(id="price_above_market", rule="", kind="signal", severity="low",
                    title=f"Rs {p.claimed_price:,.0f} is more than every one of {p.store_count} stores charge",
                    detail=f"Highest listing: Rs {p.max_price:,.0f}.", evidence_ids=_cheapest(p))
            for p in bag.all(PriceBand)
            if p.claimed_price and p.max_price and p.store_count >= 2 and p.claimed_price > p.max_price]


@rule("price.no_seller", "Offer names no store", ("PriceBand", "ClaimSet"),
      "A deal without a store name or link can be compared with the market, but the seller cannot be checked.")
def no_seller(bag: SignalBag) -> list[Finding]:
    claim = bag.first(ClaimSet)
    if not claim or claim.claim_type != "deal_price" or claim.urls or claim.domains or claim.company_name:
        return []
    return [Finding(id="price_no_seller", rule="", kind="gap", severity="medium",
                    title="The message names no store or link, so the seller cannot be checked",
                    detail="Paste the store link or seller name to check who is selling it.")]


@rule("price.thin_market", "Few stores found", ("PriceBand",), "Fewer than three stores list the product.")
def thin_market(bag: SignalBag) -> list[Finding]:
    return [Finding(id="price_thin", rule="", kind="gap", severity="low",
                    title=f"Only {p.store_count} store(s) list '{p.product}'")
            for p in bag.all(PriceBand) if p.store_count < 3]
