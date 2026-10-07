import pytest
from evidence_agents.registry.loader import RegistryEntry, RegistrySnapshot, match_entry, registry_similarity

SNAP = RegistrySnapshot(
    registry="rbi_dla", title="t", source_url="s", checked_at="2026-10-07", entries=[
        RegistryEntry(name="Kredit Rupee", regulated_entity="Alpha Finance"),
        RegistryEntry(name="Navi Finserv Limited", regulated_entity="Beta Finance"),
        RegistryEntry(name="NIRA Instant Personal Loan App", regulated_entity="Gamma Finance"),
        RegistryEntry(name="Right Rupee", regulated_entity="Delta Finance"),
        RegistryEntry(name="SN Insta Personal Advance Loan", regulated_entity="Eps Finance"),
        RegistryEntry(name="Kreditbee", regulated_entity="Zeta Finance", package_id="com.kreditbee.android"),
    ])


@pytest.mark.parametrize("query", ["Instant Loan App", "Rupee Loan", "Cash Advance", "QuickRupee - Instant Loan App"])
def test_generic_lending_words_do_not_match(query):
    entry, _, how = match_entry(SNAP, package_id=None, names=[query])
    assert entry is None and how == "none"


@pytest.mark.parametrize(("query", "expected"), [
    ("Navi Loan App", "Navi Finserv Limited"),
    ("Kredit Bee Instant Personal Loan", "Kreditbee"),
    ("KreditBee", "Kreditbee"),
])
def test_distinctive_names_match(query, expected):
    entry, _, _ = match_entry(SNAP, package_id=None, names=[query])
    assert entry is not None and entry.name == expected


def test_package_id_wins():
    entry, score, how = match_entry(SNAP, package_id="com.kreditbee.android", names=["anything"])
    assert entry is not None and entry.name == "Kreditbee" and how == "package_id" and score == 100


def test_partial_overlap_is_not_a_match():
    assert registry_similarity("Kredit Bee", "Kredit Rupee") < 86
