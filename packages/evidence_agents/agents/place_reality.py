from evidence_agents.agents._util import api_error, ev
from evidence_agents.agents.base import Agent, AgentContext, AgentOutput, AgentSpec, ParamSpec
from evidence_agents.signals import PlaceProfile
from evidence_agents.text import name_similarity


class PlaceRealityAgent(Agent):
    spec = AgentSpec(
        id="place_reality", title="Place Reality", category="evidence", icon="map-pin",
        description="Confirms a business exists on Google Maps and reads its address, phone, website and rating.",
        engines=["google_maps"], consumes=["ClaimSet"], produces=["PlaceProfile"], est_searches=1,
        params={"query": ParamSpec(label="Business name"), "city": ParamSpec(label="City")},
        proves="That the shop, clinic or office physically exists where it says.",
    )

    async def run(self, ctx: AgentContext) -> AgentOutput:
        claim = ctx.claim
        name = ctx.param("query") or ctx.subject()
        city = ctx.param("city") or (claim.city if claim else None) or (ctx.profile.city if ctx.profile else None)
        if not name:
            return AgentOutput(summary="No business to look up")
        q = f"{name} {city}" if city else name
        await ctx.progress(f"Google Maps: '{q}'")
        resp = await ctx.search({"engine": "google_maps", "type": "search", "q": q, "hl": "en"}, f"Google Maps: {q}")
        if err := api_error(resp):
            raise RuntimeError(err)
        results = resp.get("local_results") or ([resp["place_results"]] if resp.get("place_results") else [])
        if not results:
            e = ev("place_reality", "google_maps", "place", f"No Google Maps listing for '{q}'", source="Google Maps",
                   snippet="The search returned no matching business.", key=("missing", q))
            missing = PlaceProfile(agent="place_reality", name=name, match_score=0.0, evidence_ids=[e.id])
            return AgentOutput(signals=[missing], evidence=[e], summary="Not found on Google Maps",
                               metrics={"match": 0, "results": 0})
        top = max(results[:10], key=lambda r: (round(name_similarity(name, r.get("title"))), r.get("reviews") or 0))
        score = name_similarity(name, top.get("title"))
        e = ev("place_reality", "google_maps", "place", top.get("title", name), source="Google Maps",
               url=top.get("website"), snippet=f"{top.get('address', '')} · {top.get('rating', '-')}★ "
               f"({top.get('reviews', 0)} reviews) · {top.get('phone', '')}", key=top.get("data_id") or top.get("title"))
        place = PlaceProfile(agent="place_reality", name=top.get("title", name), address=top.get("address"),
                             rating=top.get("rating"), reviews_count=top.get("reviews"), phone=top.get("phone"),
                             website=top.get("website"), place_type=top.get("type"), data_id=top.get("data_id"),
                             match_score=round(score, 1), evidence_ids=[e.id])
        return AgentOutput(signals=[place], evidence=[e], summary=f"{place.name} · {place.rating or '-'}★",
                           metrics={"match": round(score), "results": len(results)})


AGENT = PlaceRealityAgent()
