from typing import Any

import pytest
from evidence_agents.agents import all_agents
from evidence_agents.agents.base import RunInput
from evidence_agents.engine import execute_workflow, load_templates
from evidence_agents.engine.workflow import (
    EdgeSpec,
    NodeSpec,
    Workflow,
    estimate_searches,
    topo_order,
    validate_workflow,
)
from evidence_agents.engines import atlas
from evidence_agents.rules import catalog
from evidence_agents.serp.client import SerpClient

from .conftest import ROOT

TEMPLATES = {t.id: t for t in load_templates()}


def demo_client() -> SerpClient:
    return SerpClient(api_key=None, mode="demo", fixtures_dir=ROOT / "fixtures" / "serp",
                      sample_fixtures_dir=ROOT / "fixtures" / "sample")


async def run(workflow_id: str) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    wf = TEMPLATES[workflow_id]
    events: list[dict[str, Any]] = []

    async def emit(event: dict[str, Any]) -> None:
        events.append(event)

    result = await execute_workflow(wf, RunInput(**wf.sample_input), demo_client(), emit)
    return result, events


def test_catalog_sizes():
    assert len(all_agents()) >= 17
    engines = atlas()
    assert len(engines) >= 16
    assert all(e["proves"] and e["agents"] for e in engines)
    assert len(catalog()) >= 8


@pytest.mark.parametrize("wf", TEMPLATES.values(), ids=list(TEMPLATES))
def test_templates_are_valid_and_within_budget(wf: Workflow):
    assert validate_workflow(wf) == []
    order = topo_order(wf)
    assert order[0] == "intent"
    assert 0 < estimate_searches(wf)["total"] <= 15


def test_validation_catches_cycles_unknown_agents_and_missing_intent():
    cyc = Workflow(id="c", name="c", nodes=[NodeSpec(id="intent", agent="intent"), NodeSpec(id="a", agent="news_timeline"),
                                             NodeSpec(id="b", agent="web_reputation")],
                   edges=[EdgeSpec(source="intent", target="a"), EdgeSpec(source="a", target="b"), EdgeSpec(source="b", target="a")])
    assert any("cycle" in p for p in validate_workflow(cyc))
    unknown = Workflow(id="u", name="u", nodes=[NodeSpec(id="x", agent="does_not_exist")], edges=[])
    assert any("Unknown agent" in p for p in validate_workflow(unknown))
    no_intent = Workflow(id="n", name="n", nodes=[NodeSpec(id="a", agent="news_timeline")], edges=[])
    assert any("Intent" in p for p in validate_workflow(no_intent))


async def test_loan_forward_hero_is_contradicted():
    result, events = await run("loan_forward_check")
    v = result["verdict"]
    assert v["evidence_status"] == "CONTRADICTED"
    assert v["decision"] == "DO_NOT_PROCEED"
    assert v["confidence"] >= 70
    contradictions = [f for f in v["findings"] if f["kind"] == "contradiction"]
    assert contradictions and all(f["evidence_ids"] for f in contradictions)
    evidence_ids = {e["id"] for e in result["evidence"]}
    assert all(i in evidence_ids for f in contradictions for i in f["evidence_ids"])
    assert result["receipt"]["paid_searches"] == 0
    types = [e["type"] for e in events]
    assert types[0] == "run_started" and "node_completed" in types and "search" in types
    assert "fraud" not in (v["headline"] + v["explanation"]).lower()


async def test_verdict_is_deterministic():
    a, _ = await run("loan_forward_check")
    b, _ = await run("loan_forward_check")
    assert a["verdict"]["evidence_status"] == b["verdict"]["evidence_status"]
    assert a["verdict"]["confidence"] == b["verdict"]["confidence"]
    assert [f["rule"] for f in a["verdict"]["findings"]] == [f["rule"] for f in b["verdict"]["findings"]]


EXPECTED = {
    "customer_care_check": ("CONTRADICTED", "DO_NOT_PROCEED", "place_phone_mismatch"),
    "image_check": ("CONTRADICTED", None, "image_reused"),
    "investment_tip_check": ("CONTRADICTED", "DO_NOT_PROCEED", "not_listed_sebi_ia_ra"),
    "job_offer_check": ("CONTRADICTED", "DO_NOT_PROCEED", "jobs_employer_missing"),
    "local_service_check": ("CORROBORATED", "SAFE_TO_PROCEED", "place_listed"),
    "trip_timing": ("CORROBORATED", None, "hotel_in_band"),
    "buy_decision": ("CONTRADICTED", "DO_NOT_PROCEED", None),
}


@pytest.mark.parametrize("workflow_id", list(EXPECTED))
async def test_every_trust_template_reaches_a_grounded_verdict(workflow_id: str):
    result, _ = await run(workflow_id)
    status, decision, finding_id = EXPECTED[workflow_id]
    v = result["verdict"]
    assert v["evidence_status"] == status
    if decision:
        assert v["decision"] == decision
    ids = {f["id"] for f in v["findings"]}
    if finding_id:
        assert finding_id in ids
    assert result["receipt"]["missing"] == 0
    evidence_ids = {e["id"] for e in result["evidence"]}
    for f in v["findings"]:
        assert all(i in evidence_ids for i in f["evidence_ids"])
    assert "fraud" not in (v["headline"] + v["explanation"]).lower()


@pytest.mark.parametrize(("text", "field", "expected"), [
    ("Join Profit Kings Advisory for guaranteed returns", "company_name", "Profit Kings Advisory"),
    ("NimbusPay Bank customer care toll free 1800-000-0000", "company_name", "NimbusPay Bank"),
    ("Pearlcrest Dental Clinic Koramangala Bengaluru", "city", "Bengaluru"),
    ("Payment proof screenshot from Lucky Draw India", "company_name", "Lucky Draw India"),
    ("Download QuickRupee app now: https://bit.ly/x", "app_name", "QuickRupee"),
])
def test_heuristic_intent_entities(text: str, field: str, expected: str):
    from evidence_agents.llm.intent import heuristic_intent
    assert getattr(heuristic_intent(text), field) == expected


async def test_market_pulse_brief_and_grounded_ads():
    result, _ = await run("market_pulse_ads")
    brief = result["market_brief"]
    assert brief and brief["opportunities"]
    assert all(o["evidence_ids"] for o in brief["opportunities"])
    pack = result["ad_pack"]
    assert pack and pack["variants"]
    google = next(v for v in pack["variants"] if v["channel"] == "google_search")
    assert all(len(h) <= 30 for h in google["headlines"])
    assert all(len(d) <= 90 for d in google["descriptions"])
    claims = [c for v in pack["variants"] for c in v["claims"]]
    assert claims and all(c["evidence_ids"] for c in claims if c["supported"])
