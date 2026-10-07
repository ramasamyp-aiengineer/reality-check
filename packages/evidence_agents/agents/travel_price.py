from datetime import date, timedelta
from typing import Any

from evidence_agents.agents._util import INDIA, api_error, ev
from evidence_agents.agents.base import Agent, AgentContext, AgentOutput, AgentSpec, ParamSpec
from evidence_agents.signals import FareInsight, HotelBand
from evidence_agents.text import median, parse_price


class TravelPriceAgent(Agent):
    spec = AgentSpec(
        id="travel_price", title="Travel Price", category="evidence", icon="plane",
        description="Checks real fares (Google Flights price insights) or hotel rates (Google Hotels) for a route or "
                    "destination and date.",
        engines=["google_flights", "google_hotels"], consumes=["ClaimSet"], produces=["FareInsight", "HotelBand"],
        est_searches=1,
        params={"mode": ParamSpec(type="select", default="hotels", label="Mode", options=["hotels", "flights"]),
                "location": ParamSpec(label="Destination (hotels)"),
                "departure_id": ParamSpec(label="From airport code", default="DEL"),
                "arrival_id": ParamSpec(label="To airport code", default="GOI"),
                "date": ParamSpec(label="Date (YYYY-MM-DD)")},
        proves="Whether a travel 'deal' beats what anyone can book today.",
    )

    async def run(self, ctx: AgentContext) -> AgentOutput:
        when = ctx.param("date") or (date.today() + timedelta(days=30)).isoformat()
        claim = ctx.claim
        claimed = claim.claimed_price if claim else None
        if ctx.param("mode", "hotels") == "flights":
            dep, arr = ctx.param("departure_id", "DEL"), ctx.param("arrival_id", "GOI")
            await ctx.progress(f"Google Flights {dep} to {arr} on {when}")
            resp = await ctx.search({"engine": "google_flights", "departure_id": dep, "arrival_id": arr,
                                     "outbound_date": when, "type": "2", "currency": "INR", **INDIA},
                                    f"Google Flights {dep}-{arr}")
            if err := api_error(resp):
                raise RuntimeError(err)
            pi: dict[str, Any] = resp.get("price_insights") or {}
            rng = pi.get("typical_price_range") or [None, None]
            e = ev("travel_price", "google_flights", "fare", f"{dep} to {arr} on {when}: lowest Rs {pi.get('lowest_price', '-')}",
                   source="Google Flights", snippet=f"Price level {pi.get('price_level', '-')}; typical {rng}",
                   key=(dep, arr, when))
            sig = FareInsight(agent="travel_price", route=f"{dep}-{arr}", lowest_price=pi.get("lowest_price"),
                              typical_low=rng[0], typical_high=rng[1], price_level=pi.get("price_level"),
                              claimed_price=claimed, evidence_ids=[e.id])
            return AgentOutput(signals=[sig], evidence=[e], summary=f"Lowest Rs {pi.get('lowest_price', '-')}",
                               metrics={"lowest": pi.get("lowest_price")})
        location = ctx.param("location") or ctx.subject()
        if not location:
            return AgentOutput(summary="No destination")
        check_out = (date.fromisoformat(when) + timedelta(days=1)).isoformat()
        await ctx.progress(f"Google Hotels: {location} on {when}")
        resp = await ctx.search({"engine": "google_hotels", "q": location, "check_in_date": when,
                                 "check_out_date": check_out, "currency": "INR", **INDIA}, f"Google Hotels: {location}")
        if err := api_error(resp):
            raise RuntimeError(err)
        props = resp.get("properties") or []
        priced = [(pr, parse_price((pr.get("rate_per_night") or {}).get("extracted_lowest"))) for pr in props]
        prices = sorted(p for _, p in priced if p)
        rated = [p for pr, p in priced if p and pr.get("hotel_class")]
        evidence = [ev("travel_price", "google_hotels", "hotel", pr.get("name", ""), source="Google Hotels",
                       url=pr.get("link"), snippet=f"Rs {(pr.get('rate_per_night') or {}).get('extracted_lowest', '-')}/night")
                    for pr in props[:8]]
        sig = HotelBand(agent="travel_price", location=location, check_in=when, median_price=median(prices),
                        min_price=prices[0] if prices else None,
                        p75_price=prices[min(len(prices) - 1, (3 * len(prices)) // 4)] if prices else None,
                        rated_median=median(rated), rated_count=len(rated), property_count=len(prices),
                        evidence_ids=[e.id for e in evidence[:4]])
        return AgentOutput(signals=[sig], evidence=evidence,
                           summary=f"{len(prices)} hotels · median Rs {sig.median_price:,.0f}" if prices else "No priced hotels",
                           metrics={"hotels": len(prices), "median": sig.median_price})


AGENT = TravelPriceAgent()
