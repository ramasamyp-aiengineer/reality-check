"""Ground-truth registry snapshots (not SerpApi).

`rbi_dla`    : RBI public directory of Digital Lending Apps (rbi.org.in home -> "DLAs deployed by Regulated Entities",
               exported from data.rbi.org.in)
`sebi_ia_ra` : SEBI registered investment advisers and research analysts

Snapshots are JSON files with a `checked_at` date so every verdict states how fresh its
ground truth is. Import the official export with `python -m evidence_agents.tools.import_registry`.
Override locations with RBI_DLA_SNAPSHOT / SEBI_SNAPSHOT environment variables.
"""

from __future__ import annotations

import json
import os
import re
from functools import lru_cache
from pathlib import Path

from pydantic import BaseModel, Field
from rapidfuzz import fuzz

from evidence_agents.text import normalize_name

DATA_DIR = Path(__file__).parent / "data"
_ENV = {"rbi_dla": "RBI_DLA_SNAPSHOT", "sebi_ia_ra": "SEBI_SNAPSHOT"}
_PKG_RE = re.compile(r"[?&]id=([A-Za-z0-9_.]+)")
# Words shared by hundreds of lending apps; matching on them alone would mark look-alike apps as registered.
_GENERIC = frozenset(
    "loan loans instant app apps cash credit credits finance financial fin finserv fincorp fintech money rupee rupees "
    "personal quick easy fast lending lend lender pay emi mobile online india indian services service capital "
    "investment investments advisory advisor advisors adviser research analyst wealth advance insta salary smart "
    "by the and of for".split())


def _distinctive(name: str) -> str:
    return " ".join(w for w in normalize_name(name).split() if w not in _GENERIC)


def registry_similarity(query: str | None, candidate: str | None) -> float:
    """Name similarity that only counts distinctive words; generic-only names must match almost exactly."""
    if not query or not candidate:
        return 0.0
    qa, ca = _distinctive(query), _distinctive(candidate)
    if not qa or not ca:
        exact = fuzz.ratio(normalize_name(query).replace(" ", ""), normalize_name(candidate).replace(" ", ""))
        return float(exact) if exact >= 95 else 0.0
    score = max(fuzz.ratio(qa, ca), fuzz.token_sort_ratio(qa, ca))
    q_words = set(qa.split())
    if q_words <= set(ca.split()) and sum(len(w) for w in q_words) >= 4:
        score = max(score, fuzz.token_set_ratio(qa, ca))
    return float(score)


class RegistryEntry(BaseModel):
    name: str
    owner: str | None = None
    regulated_entity: str | None = None
    platform: str | None = None
    link: str | None = None
    package_id: str | None = None
    registration_no: str | None = None
    website: str | None = None


class RegistrySnapshot(BaseModel):
    registry: str
    title: str
    source_url: str
    checked_at: str
    is_sample: bool = False
    note: str = ""
    entries: list[RegistryEntry] = Field(default_factory=list)


def package_from_link(link: str | None) -> str | None:
    if not link:
        return None
    m = _PKG_RE.search(link)
    return m.group(1) if m else None


@lru_cache(maxsize=4)
def load_snapshot(registry: str) -> RegistrySnapshot:
    override = os.environ.get(_ENV.get(registry, ""), "")
    path = Path(override) if override else DATA_DIR / f"{registry}.json"
    snap = RegistrySnapshot.model_validate(json.loads(path.read_text(encoding="utf-8")))
    for e in snap.entries:
        e.package_id = e.package_id or package_from_link(e.link)
    return snap


def match_entry(snap: RegistrySnapshot, *, package_id: str | None, names: list[str],
                threshold: float = 86) -> tuple[RegistryEntry | None, float, str]:
    if package_id:
        for e in snap.entries:
            if e.package_id and e.package_id.lower() == package_id.lower():
                return e, 100.0, "package_id"
    best: tuple[RegistryEntry | None, float] = (None, 0.0)
    for e in snap.entries:
        for n in names:
            score = max(registry_similarity(n, e.name), registry_similarity(n, e.owner) * 0.95)
            if score > best[1]:
                best = (e, score)
    if best[0] and best[1] >= threshold:
        return best[0], best[1], "fuzzy_name"
    return None, best[1], "none"
