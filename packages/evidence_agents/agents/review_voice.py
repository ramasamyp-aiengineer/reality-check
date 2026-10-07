from typing import Any

from evidence_agents.agents._util import INDIA, api_error, ev
from evidence_agents.agents.base import Agent, AgentContext, AgentOutput, AgentSpec, ParamSpec
from evidence_agents.signals import AppProfile, Evidence, PlaceProfile, ReviewQuote, ReviewWindow
from evidence_agents.text import COMPLAINT_TOPICS, tag_topics

_INFRA = ("charging station", "atm", "parking", "bus stop", "petrol", "gas station", "toilet", "train station")


def _window(source: str, entity: str, reviews: list[dict[str, Any]], overall: float | None, agent: str,
            engine: str, url: str | None) -> tuple[ReviewWindow, list[Evidence]]:
    ratings = [float(r["rating"]) for r in reviews if r.get("rating") is not None]
    topic_counts: dict[str, int] = {}
    complaint = 0
    quotes: list[tuple[int, ReviewQuote]] = []
    evidence: list[Evidence] = []
    for idx, r in enumerate(reviews):
        text = r.get("snippet") or r.get("text") or r.get("description") or ""
        topics = tag_topics(text)
        for t in topics:
            topic_counts[t] = topic_counts.get(t, 0) + 1
        is_complaint = bool(set(topics) & set(COMPLAINT_TOPICS))
        complaint += is_complaint
        is_pain = bool(set(topics) - {"disbursal"})
        if text and (is_complaint or is_pain or idx < 3) and len(quotes) < 12:
            e = ev(agent, engine, "review", f"{r.get('rating', '?')}★ review", snippet=text, url=url,
                   source="Google Play" if source == "play" else "Google Maps",
                   published_at=r.get("iso_date") or r.get("date"), key=(entity, idx, text[:40]), rating=r.get("rating"))
            evidence.append(e)
            quotes.append((0 if is_complaint else 1 if is_pain else 2, ReviewQuote(
                text=text[:280], rating=r.get("rating"), date=r.get("date"), topics=topics, evidence_id=e.id)))
    n = len(reviews)
    window = ReviewWindow(
        agent=agent, source=source, entity=entity, overall_rating=overall,  # type: ignore[arg-type]
        newest_avg=round(sum(ratings) / len(ratings), 2) if ratings else None, newest_count=n,
        topic_shares={k: round(v / n, 3) for k, v in topic_counts.items()} if n else {},
        quotes=[q for _, q in sorted(quotes, key=lambda t: t[0])][:10],
        complaint_share=round(complaint / n, 3) if n else 0.0, evidence_ids=[e.id for e in evidence],
    )
    return window, evidence


class ReviewVoiceAgent(Agent):
    spec = AgentSpec(
        id="review_voice", title="Review Voice", category="evidence", icon="messages-square",
        description="Reads the newest reviews (Play Store or Google Maps), tags harm and pain-point topics, and compares "
                    "recent sentiment with the overall rating.",
        engines=["google_play_product", "google_maps", "google_maps_reviews"],
        consumes=["ClaimSet", "AppProfile", "PlaceProfile"], produces=["ReviewWindow"], est_searches=1,
        params={
            "source": ParamSpec(type="select", default="play", label="Review source", options=["play", "maps"]),
            "query": ParamSpec(label="Place or brand (maps)", description="e.g. a competitor showroom; defaults to the claim"),
        },
        proves="What customers are saying right now, not two years ago.",
    )

    def estimate(self, params: dict[str, Any]) -> int:
        return 2 if params.get("source") == "maps" else 1

    async def run(self, ctx: AgentContext) -> AgentOutput:
        if ctx.param("source", "play") == "maps":
            return await self._maps(ctx)
        app: AppProfile | None = ctx.bag.first(AppProfile)
        if not app or not app.product_id:
            return AgentOutput(summary="No Play Store app to read reviews for")
        await ctx.progress("Reading the newest Play Store reviews")
        resp = await ctx.search({"engine": "google_play_product", "product_id": app.product_id, "store": "apps",
                                 "all_reviews": "true", "sort_by": "2", "num": "199", **INDIA},
                                f"Newest reviews: {app.title}")
        if err := api_error(resp):
            raise RuntimeError(err)
        window, evidence = _window("play", app.title, resp.get("reviews", []) or [], app.rating, "review_voice",
                                   "google_play_product", app.link)
        return AgentOutput(signals=[window], evidence=evidence,
                           summary=f"{window.newest_count} newest · avg {window.newest_avg or '-'} · "
                                   f"{window.complaint_share:.0%} complaints",
                           metrics={"reviews": window.newest_count, "complaint_share": window.complaint_share})

    @staticmethod
    async def _find_place(ctx: AgentContext, query: str) -> dict[str, Any] | None:
        """Most-reviewed customer-facing result; skips infrastructure such as charging stations or ATMs."""
        await ctx.progress(f"Finding '{query}' on Google Maps")
        found = await ctx.search({"engine": "google_maps", "type": "search", "q": query, "hl": "en"},
                                 f"Google Maps: {query}")
        results = found.get("local_results") or ([found["place_results"]] if found.get("place_results") else [])
        usable = [r for r in results[:10] if not any(w in str(r.get("type") or "").lower() for w in _INFRA)]
        return max(usable, key=lambda r: r.get("reviews") or 0) if usable else None

    async def _maps(self, ctx: AgentContext) -> AgentOutput:
        place: PlaceProfile | None = ctx.bag.first(PlaceProfile)
        evidence: list[Evidence] = []
        if not place or not place.data_id:
            query = ctx.param("query")
            p = ctx.profile
            name = (p.competitors[0] if p and p.competitors else None) or ctx.subject()
            city = (p.city if p else None) or ""
            if not query:
                query = f"{name or ''} {city}".strip()
            if not query:
                return AgentOutput(summary="No place to read reviews for")
            top = await self._find_place(ctx, query)
            if not top and not ctx.param("query") and name:
                category = (p.topic if p else None) or "store"
                top = await self._find_place(ctx, f"{name} {category} {city}".strip())
            if not top:
                return AgentOutput(summary=f"'{query}' not found on Google Maps")
            place = PlaceProfile(agent="review_voice", name=top.get("title", query), data_id=top.get("data_id"),
                                 rating=top.get("rating"), reviews_count=top.get("reviews"), address=top.get("address"))
            evidence.append(ev("review_voice", "google_maps", "place", place.name, source="Google Maps",
                               snippet=f"{place.rating or '-'}★ · {place.reviews_count or 0} reviews · {place.address or ''}",
                               key=place.data_id))
        if not place.data_id:
            return AgentOutput(evidence=evidence, summary="Place has no review id")
        await ctx.progress(f"Reading newest Google Maps reviews for {place.name}")
        resp = await ctx.search({"engine": "google_maps_reviews", "data_id": place.data_id, "sort_by": "newestFirst",
                                 "hl": "en"}, f"Newest Maps reviews: {place.name}")
        if err := api_error(resp):
            raise RuntimeError(err)
        overall = (resp.get("place_info") or {}).get("rating") or place.rating
        window, more = _window("maps", place.name, resp.get("reviews", []) or [], overall, "review_voice",
                               "google_maps_reviews", None)
        for topic in (resp.get("topics") or [])[:8]:
            if topic.get("keyword"):
                window.topic_shares.setdefault(f"maps:{topic['keyword']}", float(topic.get("mentions") or 0))
        return AgentOutput(signals=[window], evidence=evidence + more,
                           summary=f"{place.name}: {window.newest_count} newest · avg {window.newest_avg or '-'}",
                           metrics={"reviews": window.newest_count})


AGENT = ReviewVoiceAgent()
