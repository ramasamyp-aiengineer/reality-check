"""Agent contract. An agent is a reusable capability: it declares what it consumes, what it
produces and how many SerpApi searches it may spend, so workflows can be composed (by hand
on the canvas or by the AI planner) and costed before the user approves a run."""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any, Literal

from pydantic import BaseModel, Field

from evidence_agents.serp.client import SerpClient
from evidence_agents.signals import BusinessProfile, ClaimSet, Evidence, Signal, SignalBag

Category = Literal["core", "ground_truth", "evidence", "synthesis"]


class ParamSpec(BaseModel):
    type: Literal["string", "number", "boolean", "select"] = "string"
    default: Any = None
    label: str = ""
    description: str = ""
    options: list[str] = Field(default_factory=list)


class AgentSpec(BaseModel):
    id: str
    title: str
    description: str
    category: Category
    icon: str = "bot"
    engines: list[str] = Field(default_factory=list)
    consumes: list[str] = Field(default_factory=list)
    produces: list[str] = Field(default_factory=list)
    est_searches: int = 0
    params: dict[str, ParamSpec] = Field(default_factory=dict)
    proves: str = ""


class RunInput(BaseModel):
    text: str = ""
    image_url: str | None = None
    profile: dict[str, Any] | None = None


@dataclass
class AgentOutput:
    signals: list[Signal] = field(default_factory=list)
    evidence: list[Evidence] = field(default_factory=list)
    summary: str = ""
    metrics: dict[str, Any] = field(default_factory=dict)


Emit = Callable[[dict[str, Any]], Awaitable[None]]


@dataclass
class AgentContext:
    node_id: str
    params: dict[str, Any]
    bag: SignalBag
    serp: SerpClient
    run_input: RunInput
    emit: Emit
    llm: Any = None

    async def progress(self, message: str, **metrics: Any) -> None:
        await self.emit({"type": "node_progress", "node_id": self.node_id, "message": message, "metrics": metrics})

    async def search(self, params: dict[str, Any], label: str | None = None) -> dict[str, Any]:
        engine = params.get("engine", "google")
        await self.emit({"type": "search", "node_id": self.node_id, "engine": engine,
                         "message": label or f"Searching {engine}"})
        return await self.serp.search(params, node_id=self.node_id)

    @property
    def claim(self) -> ClaimSet | None:
        return self.bag.first(ClaimSet)

    @property
    def profile(self) -> BusinessProfile | None:
        return self.bag.first(BusinessProfile)

    def param(self, name: str, default: Any = None) -> Any:
        value = self.params.get(name)
        return default if value in (None, "") else value

    def subject(self) -> str | None:
        """Best entity name to investigate, in priority order."""
        if self.params.get("query"):
            return str(self.params["query"])
        c = self.claim
        if c and c.claim_type == "market_research" and c.topic:
            return c.topic
        if c:
            return c.app_name or c.company_name or c.product or c.topic
        p = self.profile
        return p.topic if p else None


class Agent(ABC):
    spec: AgentSpec

    def estimate(self, params: dict[str, Any]) -> int:
        return self.spec.est_searches

    @abstractmethod
    async def run(self, ctx: AgentContext) -> AgentOutput: ...
