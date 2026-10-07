from evidence_agents.agents.base import Agent, AgentContext, AgentOutput, AgentSpec
from evidence_agents.llm.ad_writer import write_ads
from evidence_agents.signals import MarketBrief, PriceBand


class AdAgent(Agent):
    spec = AgentSpec(
        id="ad_agent", title="Ad Studio", category="synthesis", icon="sparkles",
        description="Writes Google Search, Instagram, LinkedIn and WhatsApp ads from the market brief. Every claim is "
                    "linked to evidence; unsupported superlatives and prices are flagged.",
        consumes=["MarketBrief", "BusinessProfile", "PriceBand"], produces=["AdPack"],
        proves="Ads that say only what the evidence can back.",
    )

    async def run(self, ctx: AgentContext) -> AgentOutput:
        brief: MarketBrief | None = ctx.bag.first(MarketBrief)
        if not brief:
            return AgentOutput(summary="Needs a Market Brief upstream")
        pack = await write_ads(brief, ctx.profile, ctx.bag.first(PriceBand), set(ctx.bag.evidence), ctx.llm)
        return AgentOutput(signals=[pack],
                           summary=f"{len(pack.variants)} channels · {len(pack.compliance_flags)} compliance flags",
                           metrics={"variants": len(pack.variants), "flags": len(pack.compliance_flags)})


AGENT = AdAgent()
