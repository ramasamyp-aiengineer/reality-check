from evidence_agents.agents._util import api_error, ev
from evidence_agents.agents.base import Agent, AgentContext, AgentOutput, AgentSpec, ParamSpec
from evidence_agents.netguard import check_public_url
from evidence_agents.signals import ImageMatches


class VisualProvenanceAgent(Agent):
    spec = AgentSpec(
        id="visual_provenance", title="Visual Provenance", category="evidence", icon="image",
        description="Runs the image through Google Lens exact matches to see where else it appears online.",
        engines=["google_lens"], consumes=["ClaimSet"], produces=["ImageMatches"], est_searches=1,
        params={"image_url": ParamSpec(label="Public image URL")},
        proves="Whether a 'proof' screenshot or product photo is reused from elsewhere.",
    )

    async def run(self, ctx: AgentContext) -> AgentOutput:
        url = ctx.param("image_url") or ctx.run_input.image_url
        if not url:
            return AgentOutput(summary="No image provided")
        url = check_public_url(url)
        await ctx.progress("Google Lens: exact matches")
        resp = await ctx.search({"engine": "google_lens", "url": url, "type": "exact_matches", "hl": "en",
                                 "country": "in"}, "Google Lens exact matches")
        if err := api_error(resp):
            raise RuntimeError(err)
        matches = resp.get("exact_matches") or resp.get("visual_matches") or []
        evidence = [ev("visual_provenance", "google_lens", "image_match", m.get("title", ""), url=m.get("link"),
                       source=m.get("source"), published_at=m.get("date")) for m in matches[:15]]
        sig = ImageMatches(agent="visual_provenance", image_url=url, match_count=len(matches),
                           sources=[m.get("source") or "" for m in matches[:10]],
                           earliest_source=matches[0].get("source") if matches else None,
                           evidence_ids=[e.id for e in evidence[:5]])
        return AgentOutput(signals=[sig], evidence=evidence, summary=f"{len(matches)} exact matches",
                           metrics={"matches": len(matches)})


AGENT = VisualProvenanceAgent()
