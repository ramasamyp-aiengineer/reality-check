from evidence_agents.agents._util import ev
from evidence_agents.agents.base import Agent, AgentContext, AgentOutput, AgentSpec, ParamSpec
from evidence_agents.registry import load_snapshot, match_entry
from evidence_agents.registry.loader import package_from_link
from evidence_agents.signals import AppProfile, RegistryStatus


class RegistryAgent(Agent):
    spec = AgentSpec(
        id="registry", title="Registry", category="ground_truth", icon="landmark",
        description="Checks the app or adviser against official regulator lists (RBI digital lending apps, SEBI advisers).",
        consumes=["ClaimSet", "AppProfile"], produces=["RegistryStatus"],
        params={"list": ParamSpec(type="select", default="rbi_dla", label="Registry", options=["rbi_dla", "sebi_ia_ra"])},
        proves="Whether a regulated entity has reported this app or adviser. Not SerpApi: official ground truth.",
    )

    async def run(self, ctx: AgentContext) -> AgentOutput:
        registry = ctx.param("list", "rbi_dla")
        snap = load_snapshot(registry)
        claim = ctx.claim
        app: AppProfile | None = ctx.bag.first(AppProfile)
        package_id = app.product_id if app else None
        if not package_id and claim:
            package_id = next((p for p in (package_from_link(u) for u in claim.urls) if p), None)
        names = [n for n in ([app.title] if app else []) + ([claim.app_name, claim.company_name] if claim else []) if n]
        query = (app.title if app else None) or (claim.app_name or claim.company_name if claim else None) or "unknown"
        entry, score, method = match_entry(snap, package_id=package_id, names=names)
        title = (f"{snap.title}: '{entry.name}' reported by {entry.regulated_entity or entry.owner}" if entry
                 else f"{snap.title}: no entry for '{query}'")
        evidence = ev("registry", None, "registry", title, source="RBI" if registry == "rbi_dla" else "SEBI",
                      snippet=f"{len(snap.entries)} entries checked; snapshot dated {snap.checked_at[:10]}."
                              + (" Sample snapshot." if snap.is_sample else ""),
                      url=entry.link if entry else None, key=(registry, query, package_id),
                      matched=bool(entry), method=method, score=score)
        status = RegistryStatus(
            agent="registry", registry=registry, query=query, matched=bool(entry),
            match_name=entry.name if entry else None, match_owner=entry.owner if entry else None,
            regulated_entity=entry.regulated_entity if entry else None, match_score=round(score, 1),
            match_method=method, checked_at=snap.checked_at, source_url=snap.source_url,  # type: ignore[arg-type]
            snapshot_size=len(snap.entries), is_sample=snap.is_sample, evidence_ids=[evidence.id],
        )
        summary = f"Listed ({method.replace('_', ' ')})" if entry else f"Not in {len(snap.entries)} entries"
        return AgentOutput(signals=[status], evidence=[evidence], summary=summary,
                           metrics={"entries_checked": len(snap.entries), "matched": bool(entry)})


AGENT = RegistryAgent()
