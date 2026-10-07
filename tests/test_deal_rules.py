from evidence_agents.rules import evaluate
from evidence_agents.signals import ClaimSet, ComplaintMentions, PriceBand, PriceObservation, SignalBag

PRICES = [41999, 49998, 55999, 56999, 61449, 62999, 70999]


def _bag(text: str, claimed: float, *, domains: list[str] | None = None, kind: str = "product", hits: int = 4) -> SignalBag:
    bag = SignalBag()
    obs = [PriceObservation(store=f"Store {i}", price=p) for i, p in enumerate(PRICES)]
    bag.add([
        ClaimSet(agent="intent", raw_text=text, claim_type="deal_price", product="Galaxy S24", claimed_price=claimed,
                 domains=domains or []),
        PriceBand(agent="price_reality", product="Galaxy S24", observations=obs, min_price=min(PRICES),
                  median_price=56999, max_price=max(PRICES), store_count=len(PRICES), claimed_price=claimed),
        ComplaintMentions(agent="web_reputation", query="q", subject="Galaxy S24", subject_kind=kind,  # type: ignore[arg-type]
                          results_scanned=10, complaint_hits=hits),
    ], [])
    return bag


def _by_rule(bag: SignalBag) -> dict[str, str]:
    return {f.rule: f.kind for f in evaluate(bag)}


def test_bank_offer_slightly_below_market_is_a_signal_not_support():
    found = _by_rule(_bag("Galaxy S24 at Rs 39,999 with bank offer discount", 39999))
    assert found["price.below_market"] == "signal"
    assert "price.within_band" not in found
    assert found["price.no_seller"] == "gap"
    assert found["web.complaints"] == "signal"
    assert "contradiction" not in found.values()


def test_well_below_market_contradicts():
    found = _by_rule(_bag("Galaxy S24 for Rs 33,000", 33000))
    assert found["price.below_market"] == "contradiction"


def test_too_good_is_high_contradiction_and_seller_complaints_count():
    findings = evaluate(_bag("S24 Rs 19,999 at s24-sale.shop", 19999, domains=["s24-sale.shop"], kind="seller"))
    kinds = {f.rule: (f.kind, f.severity) for f in findings}
    assert kinds["price.too_good"] == ("contradiction", "high")
    assert kinds["web.complaints"] == ("contradiction", "medium")
    assert "price.no_seller" not in kinds


def test_in_range_price_supports():
    found = _by_rule(_bag("Galaxy S24 at Rs 55,999 on Flipkart", 55999, domains=["flipkart.com"], kind="seller", hits=0))
    assert found["price.within_band"] == "support"
