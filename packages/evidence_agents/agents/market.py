from evidence_agents.agents._util import api_error, ev
from evidence_agents.agents.base import Agent, AgentContext, AgentOutput, AgentSpec, ParamSpec
from evidence_agents.signals import Quote
from evidence_agents.text import parse_price


class MarketAgent(Agent):
    spec = AgentSpec(
        id="market", title="Market", category="evidence", icon="candlestick-chart",
        description="Reads the live NSE quote and market news for a listed company from Google Finance.",
        engines=["google_finance"], consumes=["ClaimSet"], produces=["Quote"], est_searches=1,
        params={"symbol": ParamSpec(label="NSE symbol", description="e.g. RELIANCE")},
        proves="The real price and movement behind a stock tip.",
    )

    async def run(self, ctx: AgentContext) -> AgentOutput:
        symbol = ctx.param("symbol")
        if not symbol:
            return AgentOutput(summary="No NSE symbol given")
        q = symbol if ":" in symbol else f"{symbol.upper()}:NSE"
        await ctx.progress(f"Google Finance: {q}")
        resp = await ctx.search({"engine": "google_finance", "q": q, "hl": "en"}, f"Google Finance: {q}")
        if err := api_error(resp):
            raise RuntimeError(err)
        summary = resp.get("summary") or {}
        move = summary.get("price_movement") or {}
        pct = move.get("percentage")
        if pct is not None and move.get("movement") == "Down":
            pct = -abs(float(pct))
        e = ev("market", "google_finance", "quote", f"{summary.get('title', q)}: {summary.get('price', '-')}",
               source="Google Finance", snippet=f"Change {pct}%", key=q)
        quote = Quote(agent="market", symbol=q, name=summary.get("title"),
                      price=parse_price(summary.get("extracted_price") or summary.get("price")),
                      change_pct=float(pct) if pct is not None else None, evidence_ids=[e.id])
        return AgentOutput(signals=[quote], evidence=[e], summary=f"{q} {summary.get('price', '-')}",
                           metrics={"price": quote.price, "change_pct": quote.change_pct})


AGENT = MarketAgent()
