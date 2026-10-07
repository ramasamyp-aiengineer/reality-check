from typing import Any

from evidence_agents.agents._util import INDIA, api_error, ev
from evidence_agents.agents.base import Agent, AgentContext, AgentOutput, AgentSpec, ParamSpec
from evidence_agents.registry.loader import package_from_link
from evidence_agents.signals import AppProfile
from evidence_agents.text import name_similarity


def _candidates(resp: dict[str, Any]) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    if isinstance(resp.get("app_highlight"), dict):
        items.append(resp["app_highlight"])
    for section in resp.get("organic_results", []) or []:
        items.extend(section.get("items", []) or [])
    return [i for i in items if i.get("product_id") or i.get("link")]


def _num(value: Any) -> int | None:
    if value is None:
        return None
    digits = "".join(ch for ch in str(value) if ch.isdigit())
    return int(digits) if digits else None


class AppIdentityAgent(Agent):
    spec = AgentSpec(
        id="app_identity", title="App Identity", category="evidence", icon="smartphone",
        description="Finds the app on Google Play and reads its developer, installs, rating and last update.",
        engines=["google_play", "google_play_product"], consumes=["ClaimSet"], produces=["AppProfile"], est_searches=2,
        params={"query": ParamSpec(label="App name override", description="Defaults to the app named in the claim")},
        proves="Who really publishes the app, and whether it is on the Play Store at all.",
    )

    async def run(self, ctx: AgentContext) -> AgentOutput:
        claim = ctx.claim
        name = ctx.param("query") or (claim.app_name if claim else None)
        package_id = next((p for p in (package_from_link(u) for u in (claim.urls if claim else [])) if p), None)
        if not name and not package_id:
            return AgentOutput(summary="No app named in the claim")
        evidence = []
        best: dict[str, Any] | None = None
        score = 100.0 if package_id else 0.0
        if not package_id:
            await ctx.progress(f"Searching Google Play for '{name}'")
            resp = await ctx.search({"engine": "google_play", "q": name, "store": "apps", **INDIA},
                                    f"Google Play search: {name}")
            if err := api_error(resp):
                raise RuntimeError(err)
            ranked = sorted(((c, name_similarity(name, c.get("title"))) for c in _candidates(resp)),
                            key=lambda t: -t[1])
            for cand, s in ranked[:5]:
                evidence.append(ev("app_identity", "google_play", "app", cand.get("title", ""), url=cand.get("link"),
                                   source="Google Play", snippet=f"by {cand.get('author') or 'unknown'}; "
                                   f"rating {cand.get('rating', '-')}", product_id=cand.get("product_id"), score=s))
            if ranked and ranked[0][1] >= 70:
                best, score = ranked[0]
                package_id = best.get("product_id")
        if not package_id:
            return AgentOutput(evidence=evidence, summary=f"No close match on Google Play ({len(evidence)} candidates)",
                               metrics={"candidates": len(evidence)})
        await ctx.progress("Reading the Play Store listing")
        detail = await ctx.search({"engine": "google_play_product", "product_id": package_id, "store": "apps", **INDIA},
                                  f"Play listing: {package_id}")
        info = detail.get("product_info", {}) or {}
        authors = info.get("authors") or []
        developer = (authors[0].get("name") if authors else None) or (best or {}).get("author")
        about = detail.get("about_this_app", {}) or {}
        updated = (about.get("info") or {}).get("updated_on") if isinstance(about.get("info"), dict) else None
        title = info.get("title") or (best or {}).get("title") or name or package_id
        link = f"https://play.google.com/store/apps/details?id={package_id}"
        listing = ev("app_identity", "google_play_product", "app", f"{title} on Google Play", url=link,
                     source="Google Play", snippet=f"Developer: {developer or 'unknown'} · Installs: "
                     f"{info.get('downloads', '-')} · Rating: {info.get('rating', '-')}", key=package_id,
                     developer=developer, downloads=info.get("downloads"))
        evidence.insert(0, listing)
        profile = AppProfile(
            agent="app_identity", title=title, product_id=package_id, developer=developer,
            rating=float(info["rating"]) if info.get("rating") else None, reviews_count=_num(info.get("reviews")),
            installs=info.get("downloads"), updated=updated, link=link, category=(info.get("category") or None),
            match_score=round(score, 1), evidence_ids=[listing.id],
        )
        return AgentOutput(signals=[profile], evidence=evidence, summary=f"{title} by {developer or 'unknown'}",
                           metrics={"rating": profile.rating, "installs": profile.installs})


AGENT = AppIdentityAgent()
