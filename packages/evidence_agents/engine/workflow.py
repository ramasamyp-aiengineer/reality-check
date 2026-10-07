"""Workflow documents: the same JSON is edited on the canvas, produced by the planner and run by the engine."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field, field_validator

from evidence_agents.agents import get_agent, has_agent


class NodeSpec(BaseModel):
    id: str
    agent: str
    params: dict[str, Any] = Field(default_factory=dict)
    label: str | None = None
    position: dict[str, float] | None = None


class EdgeSpec(BaseModel):
    source: str
    target: str


class Workflow(BaseModel):
    id: str
    name: str
    description: str = ""
    category: str = "trust"
    tags: list[str] = Field(default_factory=list)
    input_kind: str = "text"
    input_placeholder: str = ""
    sample_input: dict[str, Any] = Field(default_factory=dict)
    nodes: list[NodeSpec]
    edges: list[EdgeSpec] = Field(default_factory=list)
    featured: bool = False

    @field_validator("edges", mode="before")
    @classmethod
    def _pairs_to_edges(cls, value: Any) -> Any:
        if isinstance(value, list):
            return [{"source": e[0], "target": e[1]} if isinstance(e, list | tuple) else e for e in value]
        return value


class WorkflowError(ValueError):
    pass


def validate_workflow(wf: Workflow) -> list[str]:
    """Return a list of problems; empty means the workflow can run."""
    problems: list[str] = []
    ids = [n.id for n in wf.nodes]
    if not wf.nodes:
        problems.append("Workflow has no agents")
    if len(ids) != len(set(ids)):
        problems.append("Duplicate node ids")
    for n in wf.nodes:
        if not has_agent(n.agent):
            problems.append(f"Unknown agent '{n.agent}'")
    for e in wf.edges:
        if e.source not in ids or e.target not in ids:
            problems.append(f"Edge {e.source} -> {e.target} references a missing node")
    if not problems:
        try:
            topo_order(wf)
        except WorkflowError as exc:
            problems.append(str(exc))
    agents = {n.agent for n in wf.nodes}
    needs_claim = any(has_agent(a) and "ClaimSet" in get_agent(a).spec.consumes for a in agents)
    if needs_claim and "intent" not in agents:
        problems.append("Add the Intent agent: other agents need the extracted claim")
    return problems


def parents_of(wf: Workflow) -> dict[str, list[str]]:
    parents: dict[str, list[str]] = {n.id: [] for n in wf.nodes}
    for e in wf.edges:
        parents.setdefault(e.target, []).append(e.source)
    return parents


def topo_order(wf: Workflow) -> list[str]:
    parents = parents_of(wf)
    order: list[str] = []
    state: dict[str, int] = {}

    def visit(node: str) -> None:
        if state.get(node) == 1:
            raise WorkflowError("Workflow contains a cycle")
        if state.get(node) == 2:
            return
        state[node] = 1
        for p in parents.get(node, []):
            visit(p)
        state[node] = 2
        order.append(node)

    for n in wf.nodes:
        visit(n.id)
    return order


def ancestors(wf: Workflow) -> dict[str, set[str]]:
    parents = parents_of(wf)
    memo: dict[str, set[str]] = {}

    def walk(node: str) -> set[str]:
        if node in memo:
            return memo[node]
        result: set[str] = set()
        for p in parents.get(node, []):
            result.add(p)
            result |= walk(p)
        memo[node] = result
        return result

    for n in wf.nodes:
        walk(n.id)
    return memo


def estimate_searches(wf: Workflow) -> dict[str, Any]:
    per_node = {}
    for n in wf.nodes:
        if has_agent(n.agent):
            per_node[n.id] = get_agent(n.agent).estimate(n.params)
    engines: dict[str, int] = {}
    for n in wf.nodes:
        if has_agent(n.agent):
            for eng in get_agent(n.agent).spec.engines:
                engines[eng] = engines.get(eng, 0) + 1
    return {"total": sum(per_node.values()), "per_node": per_node, "engines": engines}


TEMPLATES_DIR = Path(__file__).resolve().parents[3] / "workflows"


def load_templates(directory: Path = TEMPLATES_DIR) -> list[Workflow]:
    items = []
    for path in sorted(directory.glob("*.json")):
        items.append(Workflow.model_validate(json.loads(path.read_text(encoding="utf-8"))))
    items.sort(key=lambda w: (not w.featured, "hero" not in w.tags, w.category != "trust", w.name))
    return items
