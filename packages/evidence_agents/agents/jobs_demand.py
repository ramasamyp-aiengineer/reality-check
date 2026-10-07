from evidence_agents.agents._util import INDIA, api_error, ev
from evidence_agents.agents.base import Agent, AgentContext, AgentOutput, AgentSpec, ParamSpec
from evidence_agents.signals import JobPostings
from evidence_agents.text import name_similarity


class JobsDemandAgent(Agent):
    spec = AgentSpec(
        id="jobs_demand", title="Jobs Demand", category="evidence", icon="briefcase",
        description="Searches Google Jobs to see whether the employer is really hiring for this role, and how much "
                    "demand the skill has.",
        engines=["google_jobs"], consumes=["ClaimSet"], produces=["JobPostings"], est_searches=1,
        params={"query": ParamSpec(label="Role or skill"), "location": ParamSpec(label="Location", default="India")},
        proves="Whether the job exists on real job boards.",
    )

    async def run(self, ctx: AgentContext) -> AgentOutput:
        claim = ctx.claim
        role = ctx.param("query") or ctx.subject()
        if not role:
            return AgentOutput(summary="No role to search")
        location = ctx.param("location", "India")
        await ctx.progress(f"Google Jobs: '{role}' in {location}")
        resp = await ctx.search({"engine": "google_jobs", "q": role, "location": location, **INDIA},
                                f"Google Jobs: {role}")
        if err := api_error(resp):
            raise RuntimeError(err)
        jobs = resp.get("jobs_results") or []
        employers = list(dict.fromkeys(j.get("company_name", "") for j in jobs if j.get("company_name")))
        company = claim.company_name if claim else None
        found = any(name_similarity(company, e) >= 80 for e in employers) if company else None
        evidence = [ev("jobs_demand", "google_jobs", "job", f"{j.get('title', '')} at {j.get('company_name', '')}",
                       source=j.get("via"), snippet=j.get("location", "")) for j in jobs[:10]]
        sig = JobPostings(agent="jobs_demand", query=role, count=len(jobs), employers=employers[:15],
                          employer_found=found, evidence_ids=[e.id for e in evidence[:5]])
        return AgentOutput(signals=[sig], evidence=evidence, summary=f"{len(jobs)} postings · {len(employers)} employers",
                           metrics={"postings": len(jobs)})


AGENT = JobsDemandAgent()
