from typing import Any

from evidence_agents.agents._util import INDIA, api_error, ev
from evidence_agents.agents.base import Agent, AgentContext, AgentOutput, AgentSpec, ParamSpec
from evidence_agents.signals import Evidence, PriceBand, PriceObservation
from evidence_agents.text import SECOND_HAND_RE, comparable_listing, median, name_similarity, parse_price


class PriceRealityAgent(Agent):
    spec = AgentSpec(
        id="price_reality", title="Price Reality", category="evidence", icon="indian-rupee",
        description="Collects live prices from Google Shopping India, the product's store list and Amazon.in, then "
                    "computes the real market band.",
        engines=["google_shopping", "google_immersive_product", "amazon"], consumes=["ClaimSet"],
        produces=["PriceBand"], est_searches=3,
        params={"query": ParamSpec(label="Product override"),
                "include_amazon": ParamSpec(type="boolean", default=True, label="Include Amazon.in"),
                "more_stores": ParamSpec(type="boolean", default=True, label="Expand store list (Immersive Product)")},
        proves="What the product really costs across stores today.",
    )

    def estimate(self, params: dict[str, Any]) -> int:
        return 1 + (params.get("include_amazon", True) is not False) + (params.get("more_stores", True) is not False)

    async def run(self, ctx: AgentContext) -> AgentOutput:
        claim = ctx.claim
        product = ctx.param("query") or (claim.product if claim else None) or ctx.subject()
        if not product:
            return AgentOutput(summary="No product to price")
        obs: list[PriceObservation] = []
        evidence: list[Evidence] = []

        def add(store: str, price: Any, title: str | None, url: str | None, engine: str, rating: Any = None) -> None:
            value = parse_price(price)
            if not value or value <= 0:
                return
            e = ev("price_reality", engine, "price", f"{store}: Rs {value:,.0f}", snippet=title or "", url=url,
                   source=store, key=(engine, store, value, title), price=value)
            evidence.append(e)
            obs.append(PriceObservation(store=store, price=value, title=title, url=url,
                                        rating=float(rating) if rating else None, evidence_id=e.id))

        await ctx.progress(f"Google Shopping India: '{product}'")
        resp = await ctx.search({"engine": "google_shopping", "q": product, "google_domain": "google.co.in",
                                 "location": "India", **INDIA}, f"Google Shopping: {product}")
        if err := api_error(resp):
            raise RuntimeError(err)
        shopping = resp.get("shopping_results", []) or []
        token, token_score = None, 0.0
        for r in shopping[:40]:
            score = name_similarity(product, r.get("title"))
            if score < 55:
                continue
            # The product page groups every store, so its token is worth taking even from a second-hand listing.
            if r.get("immersive_product_page_token") and score > token_score:
                token, token_score = r["immersive_product_page_token"], score
            if comparable_listing(product, r.get("title"), r.get("second_hand_condition")):
                add(r.get("source") or "Store", r.get("extracted_price") or r.get("price"), r.get("title"),
                    r.get("product_link") or r.get("link"), "google_shopping", r.get("rating"))
        if token and ctx.param("more_stores", True) is not False:
            await ctx.progress("Expanding the store list")
            detail = await ctx.search({"engine": "google_immersive_product", "page_token": token, "more_stores": "true"},
                                      "Immersive product: all stores")
            for s in ((detail.get("product_results") or {}).get("stores") or [])[:20]:
                offers = " ".join(str(x) for x in (s.get("details_and_offers") or []))
                if not comparable_listing(product, s.get("title") or product, "used" if SECOND_HAND_RE.search(offers) else None):
                    continue
                add(s.get("name") or "Store", s.get("extracted_price") or s.get("price"), s.get("title"), s.get("link"),
                    "google_immersive_product", s.get("rating"))
        if ctx.param("include_amazon", True) is not False:
            await ctx.progress(f"Amazon.in: '{product}'")
            amz = await ctx.search({"engine": "amazon", "k": product, "amazon_domain": "amazon.in"}, f"Amazon.in: {product}")
            for r in (amz.get("organic_results") or [])[:10]:
                if name_similarity(product, r.get("title")) >= 70 and comparable_listing(product, r.get("title")):
                    add("Amazon.in", r.get("extracted_price") or r.get("price"), r.get("title"), r.get("link"), "amazon",
                        r.get("rating"))
                    break

        mid = median([o.price for o in obs])
        if mid:
            obs = [o for o in obs if o.price >= mid * 0.35]
        anchor = ctx.profile.price if ctx.profile and ctx.profile.price else None
        if anchor:
            near = [o for o in obs if 0.4 * anchor <= o.price <= 2.5 * anchor]
            if len(near) >= 3:
                obs = near
        best_by_store: dict[str, PriceObservation] = {}
        for o in obs:
            if o.store not in best_by_store or o.price < best_by_store[o.store].price:
                best_by_store[o.store] = o
        obs = sorted(best_by_store.values(), key=lambda o: o.price)
        prices = [o.price for o in obs]
        claimed = claim.claimed_price if claim else None
        if claimed is None and ctx.profile and ctx.profile.price:
            claimed = ctx.profile.price
        band = PriceBand(agent="price_reality", product=product, observations=obs,
                         min_price=min(prices) if prices else None, median_price=median(prices),
                         max_price=max(prices) if prices else None, store_count=len(obs), claimed_price=claimed,
                         evidence_ids=[o.evidence_id for o in obs[:6] if o.evidence_id])
        keep = {o.evidence_id for o in obs}
        return AgentOutput(signals=[band], evidence=[e for e in evidence if e.id in keep],
                           summary=f"{len(obs)} stores · from Rs {band.min_price:,.0f}" if obs else "No priced stores found",
                           metrics={"stores": len(obs), "min": band.min_price, "median": band.median_price})


AGENT = PriceRealityAgent()
