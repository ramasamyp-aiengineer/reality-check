from typing import Any

from evidence_agents.agents._util import api_error, ev
from evidence_agents.agents.base import Agent, AgentContext, AgentOutput, AgentSpec, ParamSpec
from evidence_agents.signals import (
    QueryValue,
    RegionInterest,
    RegionValue,
    RisingQueries,
    TrendPoint,
    TrendSeries,
)


def momentum(values: list[float], window: int = 4) -> float | None:
    if len(values) < window * 2:
        return None
    recent = sum(values[-window:]) / window
    prior = sum(values[-2 * window:-window]) / window
    if prior == 0:
        return None
    return round((recent - prior) / prior * 100, 1)


class DemandTrendAgent(Agent):
    spec = AgentSpec(
        id="demand_trend", title="Demand Trend", category="evidence", icon="trending-up",
        description="Reads Google Trends for India: interest over time (with competitors), interest by state, and "
                    "rising related searches.",
        engines=["google_trends"], consumes=["ClaimSet"], produces=["TrendSeries", "RegionInterest", "RisingQueries"],
        est_searches=3,
        params={"query": ParamSpec(label="Topic override"),
                "date": ParamSpec(type="select", default="today 12-m", label="Period",
                                  options=["now 7-d", "today 1-m", "today 3-m", "today 12-m", "today 5-y"]),
                "compare_competitors": ParamSpec(type="boolean", default=True, label="Compare competitors"),
                "regions": ParamSpec(type="boolean", default=True, label="Interest by state"),
                "related": ParamSpec(type="boolean", default=True, label="Rising searches")},
        proves="Whether demand is rising, where in India, and what people search for next.",
    )

    def estimate(self, params: dict[str, Any]) -> int:
        return 1 + (params.get("regions", True) is not False) + (params.get("related", True) is not False)

    async def run(self, ctx: AgentContext) -> AgentOutput:
        topic = ctx.param("query") or ctx.subject()
        if not topic:
            return AgentOutput(summary="No topic for trends")
        keywords = [topic]
        if ctx.param("compare_competitors", True) and ctx.profile:
            keywords += ctx.profile.competitors[:4]
        date = ctx.param("date", "today 12-m")
        signals: list[Any] = []
        evidence = []

        await ctx.progress("Google Trends: interest over time")
        ts = await ctx.search({"engine": "google_trends", "q": ",".join(keywords), "geo": "IN", "date": date,
                               "data_type": "TIMESERIES"}, f"Trends over time: {', '.join(keywords)}")
        if err := api_error(ts):
            raise RuntimeError(err)
        points = []
        for row in (ts.get("interest_over_time") or {}).get("timeline_data", []) or []:
            vals = {v.get("query", ""): float(v.get("extracted_value") or 0) for v in row.get("values", [])}
            points.append(TrendPoint(date=row.get("date", ""), values=vals))
        mom = {k: m for k in keywords if (m := momentum([p.values.get(k, 0) for p in points])) is not None}
        peak = max(points, key=lambda p: p.values.get(topic, 0)).date if points else None
        e_ts = ev("demand_trend", "google_trends", "trend", f"Google Trends India: '{topic}' over {date}",
                  source="Google Trends", snippet=f"{len(points)} points; momentum {mom.get(topic, 'n/a')}%",
                  key=("ts", tuple(keywords), date))
        evidence.append(e_ts)
        signals.append(TrendSeries(agent="demand_trend", keywords=keywords, points=points, momentum_pct=mom,
                                   peak_date=peak, evidence_ids=[e_ts.id]))

        if ctx.param("regions", True) is not False:
            await ctx.progress("Google Trends: interest by state")
            geo = await ctx.search({"engine": "google_trends", "q": topic, "geo": "IN", "date": date,
                                    "data_type": "GEO_MAP_0", "region": "REGION"}, f"Trends by state: {topic}")
            regions = [RegionValue(name=r.get("location", ""), value=float(r.get("extracted_value") or 0))
                       for r in geo.get("interest_by_region", []) or [] if r.get("location")]
            regions.sort(key=lambda r: -r.value)
            e_geo = ev("demand_trend", "google_trends", "trend", f"Interest by state for '{topic}'",
                       source="Google Trends", snippet=", ".join(f"{r.name} {r.value:.0f}" for r in regions[:5]),
                       key=("geo", topic, date))
            evidence.append(e_geo)
            signals.append(RegionInterest(agent="demand_trend", keyword=topic, regions=regions, evidence_ids=[e_geo.id]))

        if ctx.param("related", True) is not False:
            await ctx.progress("Google Trends: rising searches")
            rel = await ctx.search({"engine": "google_trends", "q": topic, "geo": "IN", "date": date,
                                    "data_type": "RELATED_QUERIES"}, f"Rising searches: {topic}")
            rq = rel.get("related_queries") or {}

            def conv(items: list[dict[str, Any]]) -> list[QueryValue]:
                return [QueryValue(query=i.get("query", ""), value=str(i.get("value") or i.get("extracted_value") or ""))
                        for i in items[:12] if i.get("query")]

            e_rel = ev("demand_trend", "google_trends", "trend", f"Rising searches around '{topic}'",
                       source="Google Trends", snippet=", ".join(i.get("query", "") for i in (rq.get("rising") or [])[:5]),
                       key=("rel", topic, date))
            evidence.append(e_rel)
            signals.append(RisingQueries(agent="demand_trend", keyword=topic, rising=conv(rq.get("rising") or []),
                                         top=conv(rq.get("top") or []), evidence_ids=[e_rel.id]))
        m = mom.get(topic)
        return AgentOutput(signals=signals, evidence=evidence,
                           summary=f"Momentum {m:+.0f}%" if m is not None else f"{len(points)} trend points",
                           metrics={"momentum_pct": m, "points": len(points)})


AGENT = DemandTrendAgent()
