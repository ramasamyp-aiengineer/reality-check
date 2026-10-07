from evidence_agents.agents.base import Agent, AgentContext, AgentOutput, AgentSpec, ParamSpec
from evidence_agents.engine.verdict import compute_verdict
from evidence_agents.llm.explainer import explain_verdict


class VerdictAgent(Agent):
    spec = AgentSpec(
        id="verdict", title="Verdict", category="core", icon="scale",
        description="Runs every contradiction rule that applies to the collected signals, computes confidence from "
                    "measurable factors and issues a two-part verdict with actions.",
        consumes=["*"], produces=["Verdict"],
        params={"language": ParamSpec(type="select", default="en", label="Explanation language", options=["en", "hi", "ta"])},
        proves="A decision you can audit: rules decide, the LLM only explains.",
    )

    async def run(self, ctx: AgentContext) -> AgentOutput:
        verdict = compute_verdict(ctx.bag)
        claim = ctx.claim
        subject = (claim.app_name or claim.company_name or claim.product or claim.topic) if claim else None
        text = await explain_verdict(verdict, subject or "this claim", ctx.llm, ctx.param("language", "en"))
        if text:
            verdict.explanation = text
            verdict.explained_by = ctx.llm.model if ctx.llm else "llm"
        contra = sum(1 for f in verdict.findings if f.kind == "contradiction")
        return AgentOutput(signals=[verdict],
                           summary=f"{verdict.evidence_status.replace('_', ' ')} · {contra} contradictions",
                           metrics={"confidence": verdict.confidence, "findings": len(verdict.findings)})


AGENT = VerdictAgent()
