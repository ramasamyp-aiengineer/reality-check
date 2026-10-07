"""Plain-language explanation of a computed verdict, the 'LLM alone' comparison, and the evidence assistant."""

from __future__ import annotations

import json
from typing import Any

from pydantic import BaseModel, Field

from evidence_agents.llm.base import LLMConfig, run_structured, untrusted
from evidence_agents.signals import Verdict

LANGS = {"en": "English", "hi": "Hindi", "ta": "Tamil"}


class Explanation(BaseModel):
    text: str = Field(description="At most 90 words, plain language, no new facts")


async def explain_verdict(verdict: Verdict, subject: str, llm: LLMConfig | None, lang: str = "en") -> str | None:
    facts = [{"kind": f.kind, "severity": f.severity, "title": f.title, "detail": f.detail} for f in verdict.findings]
    prompt = (
        f"Subject: {subject}\nEvidence status (fixed, do not change): {verdict.evidence_status}\n"
        f"Decision guidance (fixed, do not change): {verdict.decision}\nFindings:\n{untrusted(json.dumps(facts))}"
    )
    instructions = (
        f"Explain this verdict to an everyday Indian user in {LANGS.get(lang, 'English')}. Use only the findings given. "
        "Never call anyone a fraud or criminal; describe what the evidence shows. Do not alter the status or guidance."
    )
    out = await run_structured(llm, Explanation, instructions, prompt)
    return out.text if out else None


class LLMAloneAnswer(BaseModel):
    answer: str
    stated_confidence: str = Field(description="How sure the model claims to be: low, medium or high")


async def llm_alone(text: str, llm: LLMConfig | None) -> dict[str, Any] | None:
    """What a model says with no live evidence. Shown next to the SerpApi-backed verdict; never fabricated."""
    out = await run_structured(
        llm, LLMAloneAnswer,
        "A user asks whether they can trust this message. Answer from your own knowledge only, in under 80 words.",
        untrusted(text),
    )
    return out.model_dump() if out else None


async def ask_with_search(question: str, context: str, llm: LLMConfig | None, search_client: Any) -> str | None:
    """Follow-up questions answered by the LLM with serpapi-search-tools web and news tools."""
    if not llm or not llm.enabled:
        return None
    from serpapi_search_tools import news_search, web_search

    tools = [
        web_search(provider="pydantic-ai", client=search_client, result_limit=8),
        news_search(provider="pydantic-ai", client=search_client, result_limit=8),
    ]

    class Answer(BaseModel):
        answer: str
        sources: list[str] = Field(default_factory=list)

    out = await run_structured(
        llm, Answer,
        "Answer the user's follow-up question about a verification report. Use the search tools at most twice. "
        "Cite source URLs. Never label anyone a fraud.",
        f"Report context:\n{untrusted(context, 3000)}\n\nQuestion: {question}",
        tools=tools,
    )
    if not out:
        return None
    return out.answer + ("\n\nSources: " + ", ".join(out.sources[:5]) if out.sources else "")
