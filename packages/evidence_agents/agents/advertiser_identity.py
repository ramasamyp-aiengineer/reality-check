from datetime import UTC, datetime
from typing import Any

from evidence_agents.agents._util import INDIA, api_error, ev
from evidence_agents.agents.base import Agent, AgentContext, AgentOutput, AgentSpec, ParamSpec
from evidence_agents.signals import AdCreative, Advertiser, AdvertiserProfile, ComplaintMentions, PlaceProfile
from evidence_agents.text import brand_token, registered_domain

INDIA_REGION = "2356"
_PLATFORMS = {"facebook.com", "instagram.com", "linkedin.com", "youtube.com", "twitter.com", "x.com", "wikipedia.org",
              "google.com", "amazon.in", "flipkart.com", "justdial.com", "indiamart.com", "quora.com", "reddit.com"}


def _owns(domain: str | None, brand: str) -> bool:
    token = brand_token(brand)[:6]
    return bool(domain and len(token) >= 3 and domain not in _PLATFORMS
                and token in domain.replace("-", "").replace(".", ""))


def _known_domain(ctx: AgentContext, brand: str) -> str | None:
    b = brand.strip().lower()
    if "." in b and " " not in b:
        return registered_domain(b) or b
    candidates = [c.official_domain for c in ctx.bag.all(ComplaintMentions)]
    candidates += [registered_domain(p.website) for p in ctx.bag.all(PlaceProfile) if p.website]
    return next((d for d in candidates if _owns(d, brand)), None)


def _date(ts: Any) -> str | None:
    if isinstance(ts, int | float) and ts > 0:
        return datetime.fromtimestamp(ts, UTC).date().isoformat()
    return str(ts) if ts else None


class AdvertiserIdentityAgent(Agent):
    spec = AgentSpec(
        id="advertiser_identity", title="Advertiser Identity", category="evidence", icon="megaphone",
        description="Looks up who pays for ads under this name in Google's Ads Transparency Center (India) and collects "
                    "their creatives. Falls back to the brand's official domain when a name search finds nothing.",
        engines=["google_ads_transparency_center", "google_light"], consumes=["ClaimSet"],
        produces=["AdvertiserProfile"], est_searches=2,
        params={"query": ParamSpec(label="Advertiser or brand"),
                "competitors": ParamSpec(type="boolean", default=False, label="Use competitors from the business profile")},
        proves="Which verified company is actually behind the ads.",
    )

    def estimate(self, params: dict[str, Any]) -> int:
        return 4 if params.get("competitors") else 2

    async def _creatives(self, ctx: AgentContext, brand: str) -> tuple[list[dict[str, Any]], str]:
        text = _known_domain(ctx, brand) or brand
        resp = await self._lookup(ctx, text)
        creatives = resp.get("ad_creatives", []) or []
        if creatives or text != brand:
            return creatives, text
        await ctx.progress(f"No ads under the name '{brand}': finding its official domain")
        found = await ctx.search({"engine": "google_light", "q": f"{brand} official website", **INDIA},
                                 f"Official site: {brand}")
        domain = next((d for d in (registered_domain(r.get("link") or "") for r in (found.get("organic_results") or [])[:8])
                       if _owns(d, brand)), None)
        if not domain:
            guess = brand_token(brand)
            if len(guess) < 4:
                return [], brand
            domain = f"{guess}.com"
        resp = await self._lookup(ctx, domain)
        return resp.get("ad_creatives", []) or [], domain

    @staticmethod
    async def _lookup(ctx: AgentContext, text: str) -> dict[str, Any]:
        await ctx.progress(f"Ads Transparency Center: '{text}' in India")
        resp = await ctx.search({"engine": "google_ads_transparency_center", "text": text, "region": INDIA_REGION,
                                 "num": "40"}, f"Ads Transparency: {text}")
        if err := api_error(resp):
            raise RuntimeError(err)
        return resp

    async def run(self, ctx: AgentContext) -> AgentOutput:
        queries = []
        if ctx.param("competitors") and ctx.profile and ctx.profile.competitors:
            queries = ctx.profile.competitors[:2]
        else:
            subject = ctx.param("query") or ctx.subject()
            if subject:
                queries = [subject]
        if not queries:
            return AgentOutput(summary="No advertiser to look up")
        advertisers: dict[str, Advertiser] = {}
        creatives: list[AdCreative] = []
        evidence = []
        for q in queries:
            found, searched = await self._creatives(ctx, q)
            for c in found:
                name = c.get("advertiser") or "Unknown advertiser"
                adv = advertisers.get(name)
                if not adv:
                    via = f" · found via {searched}" if searched != q else ""
                    e = ev("advertiser_identity", "google_ads_transparency_center", "advertiser", name,
                           source="Ads Transparency Center", url=c.get("details_link"),
                           snippet=f"Advertiser id {c.get('advertiser_id', '-')} · region India{via}", key=(name, q))
                    evidence.append(e)
                    adv = advertisers[name] = Advertiser(name=name, advertiser_id=c.get("advertiser_id"),
                                                         region="India", evidence_id=e.id)
                adv.ad_count += 1
                if len(creatives) < 24:
                    creatives.append(AdCreative(advertiser=name, format=c.get("format"),
                                                first_shown=_date(c.get("first_shown")),
                                                last_shown=_date(c.get("last_shown")),
                                                link=c.get("details_link"), image=c.get("image"),
                                                evidence_id=adv.evidence_id))
        ranked = sorted(advertisers.values(), key=lambda a: -a.ad_count)
        sig = AdvertiserProfile(agent="advertiser_identity", query=", ".join(queries), advertisers=ranked[:10],
                                creatives=creatives, total_creatives=sum(a.ad_count for a in ranked),
                                evidence_ids=[a.evidence_id for a in ranked[:5] if a.evidence_id])
        return AgentOutput(signals=[sig], evidence=evidence,
                           summary=f"{len(ranked)} advertisers · {sig.total_creatives} creatives",
                           metrics={"advertisers": len(ranked), "creatives": sig.total_creatives})


AGENT = AdvertiserIdentityAgent()
