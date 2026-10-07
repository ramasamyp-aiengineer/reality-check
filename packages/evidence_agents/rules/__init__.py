"""Contradiction rule library.

A rule declares the signal types it needs. The engine runs every rule whose requirements are
present in the run, so a workflow assembled on the canvas or by the planner always gets a
verdict that is computed, testable and explainable. The LLM never decides a verdict.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

from evidence_agents.signals import Finding, SignalBag

RuleFn = Callable[[SignalBag], list[Finding]]


@dataclass(frozen=True)
class RuleSpec:
    id: str
    title: str
    requires: tuple[str, ...]
    description: str
    fn: RuleFn


RULES: list[RuleSpec] = []


def rule(rule_id: str, title: str, requires: tuple[str, ...], description: str) -> Callable[[RuleFn], RuleFn]:
    def wrap(fn: RuleFn) -> RuleFn:
        RULES.append(RuleSpec(rule_id, title, requires, description, fn))
        return fn

    return wrap


def evaluate(bag: SignalBag) -> list[Finding]:
    _load()
    present = bag.types()
    findings: list[Finding] = []
    for spec in RULES:
        if set(spec.requires) <= present:
            for f in spec.fn(bag):
                f.rule = spec.id
                f.signal_types = list(spec.requires)
                findings.append(f)
    order = {"contradiction": 0, "gap": 1, "signal": 2, "support": 3}
    sev = {"high": 0, "medium": 1, "low": 2}
    findings.sort(key=lambda f: (order[f.kind], sev[f.severity]))
    return findings


def catalog() -> list[dict[str, object]]:
    _load()
    return [{"id": r.id, "title": r.title, "requires": list(r.requires), "description": r.description} for r in RULES]


_loaded = False


def _load() -> None:
    global _loaded
    if _loaded:
        return
    _loaded = True
    from evidence_agents.rules import (  # noqa: F401
        ads,
        app,
        claims,
        news,
        places,
        price,
        registry,
        reviews,
        web,
    )
