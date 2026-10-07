from evidence_agents.agents._util import INDIA, api_error, ev
from evidence_agents.agents.base import Agent, AgentContext, AgentOutput, AgentSpec, ParamSpec
from evidence_agents.signals import ComplaintMentions
from evidence_agents.text import COMPLAINT_DOMAINS, COMPLAINT_WORDS, brand_token, has_word, registered_domain

SHORTENERS = {"bit.ly", "tinyurl.com", "t.co", "wa.me", "goo.gl", "cutt.ly", "rb.gy", "is.gd", "t.me", "shorturl.at"}


class WebReputationAgent(Agent):
    spec = AgentSpec(
        id="web_reputation", title="Web Reputation", category="evidence", icon="globe",
        description="Searches the open web for complaints, scam warnings and the entity's official site.",
        engines=["google_light"], consumes=["ClaimSet"], produces=["ComplaintMentions"], est_searches=1,
        params={"query": ParamSpec(label="Entity override")},
        proves="Whether independent sites and forums warn about this entity.",
    )

    async def run(self, ctx: AgentContext) -> AgentOutput:
        subject = ctx.subject()
        claim = ctx.claim
        kind = "entity"
        if not ctx.param("query") and claim and claim.claim_type in ("deal_price", "job_offer", "generic"):
            seller = next((d for d in claim.domains if d not in SHORTENERS), None)
            if seller:
                subject, kind = seller, "seller"
            elif claim.claim_type == "deal_price" and claim.product and not claim.company_name:
                kind = "product"
        if not subject:
            return AgentOutput(summary="No entity to search")
        q = f"{subject} reviews complaints"
        await ctx.progress(f"Searching the web for '{q}'")
        resp = await ctx.search({"engine": "google_light", "q": q, "num": "20", **INDIA}, f"Web search: {q}")
        if err := api_error(resp):
            raise RuntimeError(err)
        results = resp.get("organic_results", []) or []
        token = brand_token(subject)
        evidence, hits, domains = [], 0, []
        official = None
        for r in results:
            url = r.get("link")
            domain = registered_domain(url) if url else None
            text = f"{r.get('title', '')} {r.get('snippet', '')}".lower()
            is_complaint = has_word(text, COMPLAINT_WORDS) or (domain in COMPLAINT_DOMAINS)
            if domain and token and len(token) >= 4 and token in domain.replace("-", "").replace(".", ""):
                official = official or domain
            e = ev("web_reputation", "google_light", "web_result", r.get("title", ""), snippet=r.get("snippet", ""),
                   url=url, published_at=r.get("date"), complaint=is_complaint)
            if is_complaint:
                hits += 1
                if domain:
                    domains.append(domain)
                evidence.insert(0, e)
            else:
                evidence.append(e)
        sig = ComplaintMentions(
            agent="web_reputation", query=q, subject=subject, subject_kind=kind,  # type: ignore[arg-type]
            results_scanned=len(results), complaint_hits=hits,
            complaint_domains=list(dict.fromkeys(domains)), official_domain=official,
            official_site_found=bool(official), evidence_ids=[e.id for e in evidence[:6]],
        )
        return AgentOutput(signals=[sig], evidence=evidence[:12],
                           summary=f"{hits}/{len(results)} results flag complaints"
                                   + (f" · official: {official}" if official else ""),
                           metrics={"results": len(results), "complaint_hits": hits})


AGENT = WebReputationAgent()
