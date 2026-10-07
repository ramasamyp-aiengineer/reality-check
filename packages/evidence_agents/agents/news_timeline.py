from evidence_agents.agents._util import INDIA, api_error, ev
from evidence_agents.agents.base import Agent, AgentContext, AgentOutput, AgentSpec, ParamSpec
from evidence_agents.signals import NewsEvents, NewsItem
from evidence_agents.text import days_ago, mentions, news_category


class NewsTimelineAgent(Agent):
    spec = AgentSpec(
        id="news_timeline", title="News Timeline", category="evidence", icon="newspaper",
        description="Builds a dated timeline from Google News and tags enforcement, complaints, launches, funding and pricing.",
        engines=["google_news"], consumes=["ClaimSet"], produces=["NewsEvents"], est_searches=1,
        params={"query": ParamSpec(label="Topic override"),
                "suffix": ParamSpec(label="Query suffix", description="e.g. 'loan app' or 'India'")},
        proves="What happened recently: crackdowns, launches, price changes.",
    )

    async def run(self, ctx: AgentContext) -> AgentOutput:
        subject = ctx.subject()
        if not subject:
            return AgentOutput(summary="No topic to search news for")
        claim = ctx.claim
        suffix = ctx.param("suffix") or ("loan app" if claim and claim.claim_type == "loan_offer" else "")
        q = f"{subject} {suffix}".strip()
        await ctx.progress(f"Searching Google News for '{q}'")
        resp = await ctx.search({"engine": "google_news", "q": q, **INDIA}, f"Google News: {q}")
        if err := api_error(resp):
            raise RuntimeError(err)
        raw = []
        for r in resp.get("news_results", []) or []:
            raw.append(r)
            raw.extend((r.get("stories") or [])[:2])
        entity_check = bool(claim and claim.claim_type not in ("market_research", "travel") and not ctx.param("query"))
        items, evidence = [], []
        for r in raw[:25]:
            title = r.get("title")
            if not title:
                continue
            source = (r.get("source") or {}).get("name") if isinstance(r.get("source"), dict) else r.get("source")
            named = mentions(subject, f"{title} {r.get('snippet', '')}") if entity_check else True
            e = ev("news_timeline", "google_news", "news", title, url=r.get("link"), source=source,
                   published_at=r.get("iso_date") or r.get("date"), mentions_subject=named)
            evidence.append(e)
            items.append(NewsItem(title=title, source=source, date=r.get("iso_date") or r.get("date"),
                                  category=news_category(title), mentions_subject=named,  # type: ignore[arg-type]
                                  evidence_id=e.id))
        items.sort(key=lambda i: not i.mentions_subject)
        named_items = [i for i in items if i.mentions_subject]
        evidence.sort(key=lambda e: not e.data.get("mentions_subject", True))
        enforcement = [i for i in named_items if i.category == "enforcement"]
        recent = [i for i in enforcement if (d := days_ago(i.date)) is not None and d <= 180]
        sig = NewsEvents(agent="news_timeline", query=q, items=items, enforcement_count=len(enforcement),
                         recent_enforcement_count=len(recent), evidence_ids=[e.id for e in evidence[:6]])
        cats: dict[str, int] = {}
        for i in items:
            cats[i.category] = cats.get(i.category, 0) + 1
        summary = f"{len(items)} articles · {len(enforcement)} enforcement"
        if entity_check:
            summary = f"{len(named_items)}/{len(items)} articles name '{subject}' · {len(enforcement)} enforcement"
        return AgentOutput(signals=[sig], evidence=evidence, summary=summary, metrics=cats)


AGENT = NewsTimelineAgent()
