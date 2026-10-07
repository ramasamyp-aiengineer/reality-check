from evidence_agents.agents.base import Agent, AgentContext, AgentOutput, AgentSpec
from evidence_agents.llm.intent import extract_intent, profile_intent
from evidence_agents.netguard import UnsafeURL, check_public_url


class IntentAgent(Agent):
    spec = AgentSpec(
        id="intent", title="Intent", category="core", icon="scan-text",
        description="Reads the forward, link or business profile and extracts the claim, entities, prices and red flags.",
        produces=["ClaimSet"], proves="What exactly is being claimed, and about whom.",
    )

    async def run(self, ctx: AgentContext) -> AgentOutput:
        if ctx.profile:
            claim = profile_intent(ctx.profile)
        else:
            if not ctx.run_input.text.strip():
                raise ValueError("Nothing to analyse: paste a message, link or claim")
            claim = await extract_intent(ctx.run_input.text, ctx.llm)
        safe_urls = []
        for url in claim.urls:
            try:
                safe_urls.append(check_public_url(url, resolve=False))
            except UnsafeURL:
                continue
        claim.urls = safe_urls
        bits = [claim.claim_type.replace("_", " ")]
        if claim.app_name or claim.company_name or claim.product or claim.topic:
            bits.append(claim.app_name or claim.company_name or claim.product or claim.topic or "")
        if claim.red_flags:
            bits.append(f"{len(claim.red_flags)} red flags")
        return AgentOutput(signals=[claim], summary=" · ".join(bits),
                           metrics={"entities": len(claim.entities), "red_flags": len(claim.red_flags)})


AGENT = IntentAgent()
