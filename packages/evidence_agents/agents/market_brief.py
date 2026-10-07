from evidence_agents.agents.base import Agent, AgentContext, AgentOutput, AgentSpec
from evidence_agents.llm.base import run_structured, untrusted
from evidence_agents.signals import (
    AdvertiserProfile,
    MarketBrief,
    NewsEvents,
    Opportunity,
    PriceBand,
    RegionInterest,
    ReviewWindow,
    RisingQueries,
    TrendSeries,
)

PAIN_LABELS = {"battery_range": "battery and range", "service": "service and spares", "price_value": "price and value",
               "quality": "build quality", "delivery": "delivery delays", "support": "customer support",
               "hidden_charges": "hidden charges", "harassment": "harassment", "data_privacy": "data access"}


def build_brief(ctx: AgentContext) -> MarketBrief:
    bag = ctx.bag
    topic = ctx.subject() or "this market"
    profile = ctx.profile
    trend: TrendSeries | None = bag.first(TrendSeries)
    regions: RegionInterest | None = bag.first(RegionInterest)
    rising: RisingQueries | None = bag.first(RisingQueries)
    price: PriceBand | None = bag.first(PriceBand)
    ads: AdvertiserProfile | None = bag.first(AdvertiserProfile)
    reviews: list[ReviewWindow] = bag.all(ReviewWindow)
    news: NewsEvents | None = bag.first(NewsEvents)

    mom = trend.momentum_pct.get(trend.keywords[0]) if trend and trend.keywords else None
    label = "unknown" if mom is None else "rising" if mom >= 10 else "cooling" if mom <= -10 else "steady"
    top_regions = regions.regions[:5] if regions else []
    rising_q = [q.query for q in (rising.rising if rising else [])][:8]
    pains: list[tuple[str, float, list[str]]] = []
    for w in reviews:
        for k, share in sorted(w.topic_shares.items(), key=lambda kv: -kv[1]):
            if k in PAIN_LABELS and share >= 0.08:
                pains.append((PAIN_LABELS[k], share, [q.evidence_id for q in w.quotes if k in q.topics and q.evidence_id][:2]))
    pains = pains[:4]

    opps: list[Opportunity] = []
    if mom is not None:
        opps.append(Opportunity(text=f"Search interest for '{topic}' is {label} ({mom:+.0f}% vs the previous 4 periods)"
                                + (": launch the campaign now." if label == "rising" else "."),
                                evidence_ids=trend.evidence_ids if trend else []))
    if top_regions:
        opps.append(Opportunity(text="Concentrate spend in " + ", ".join(r.name for r in top_regions[:3])
                                + " where interest is highest.", evidence_ids=regions.evidence_ids if regions else []))
    if rising_q:
        opps.append(Opportunity(text="Bid on rising searches: " + ", ".join(rising_q[:4]) + ".",
                                evidence_ids=rising.evidence_ids if rising else []))
    if pains:
        usp = profile.usp if profile and profile.usp else "your strongest feature"
        opps.append(Opportunity(text=f"Competitor customers complain about {pains[0][0]} ({pains[0][1]:.0%} of newest "
                                f"reviews): lead with {usp}.", evidence_ids=pains[0][2]))
    if price and price.median_price and profile and profile.price:
        diff = (profile.price - price.median_price) / price.median_price
        pos = "below" if diff < 0 else "above"
        opps.append(Opportunity(text=f"Your price Rs {profile.price:,.0f} is {abs(diff):.0%} {pos} the market median "
                                f"Rs {price.median_price:,.0f} across {price.store_count} stores.",
                                evidence_ids=price.evidence_ids[:2]))
    if ads and ads.advertisers:
        opps.append(Opportunity(text=f"{len(ads.advertisers)} advertisers are active in India for this space, led by "
                                + ", ".join(a.name for a in ads.advertisers[:3]) + ".", evidence_ids=ads.evidence_ids[:2]))
    if news:
        launches = [i for i in news.items if i.category in ("launch", "pricing")][:1]
        for i in launches:
            opps.append(Opportunity(text=f"In the news: {i.title}", evidence_ids=[i.evidence_id] if i.evidence_id else []))

    summary = " ".join(o.text for o in opps[:3]) or f"Not enough market evidence for '{topic}' yet."
    return MarketBrief(
        agent="market_brief", topic=topic, momentum_pct=mom, momentum_label=label, top_regions=top_regions,
        rising_queries=rising_q, price_floor=price.min_price if price else None,
        price_median=price.median_price if price else None,
        competitor_advertisers=[a.name for a in (ads.advertisers if ads else [])][:6],
        pain_points=[f"{p[0]} ({p[1]:.0%})" for p in pains], opportunities=opps, summary=summary,
        evidence_ids=[e for o in opps for e in o.evidence_ids][:12],
    )


class MarketBriefAgent(Agent):
    spec = AgentSpec(
        id="market_brief", title="Market Brief", category="synthesis", icon="presentation",
        description="Turns trends, regions, rising searches, prices, competitor ads and reviews into a sourced market brief.",
        consumes=["TrendSeries", "RegionInterest", "RisingQueries", "PriceBand", "AdvertiserProfile", "ReviewWindow",
                  "NewsEvents"],
        produces=["MarketBrief"], proves="Where demand is, what competitors do, and the gap to attack.",
    )

    async def run(self, ctx: AgentContext) -> AgentOutput:
        brief = build_brief(ctx)
        from pydantic import BaseModel

        class Summary(BaseModel):
            summary: str

        llm_out = await run_structured(
            ctx.llm, Summary,
            "Write a 3-sentence market brief for an Indian business owner using only these computed opportunities.",
            untrusted("\n".join(o.text for o in brief.opportunities)))
        if llm_out:
            brief.summary = llm_out.summary
        return AgentOutput(signals=[brief], summary=f"{len(brief.opportunities)} opportunities · demand {brief.momentum_label}",
                           metrics={"opportunities": len(brief.opportunities), "momentum": brief.momentum_pct})


AGENT = MarketBriefAgent()
