from __future__ import annotations

from typing import Any

from evidence_agents.signals import Evidence, evidence_id
from evidence_agents.text import registered_domain

INDIA = {"gl": "in", "hl": "en"}


def ev(agent: str, engine: str | None, kind: str, title: str, *, snippet: str = "", url: str | None = None,
       source: str | None = None, published_at: str | None = None, key: Any = None, **data: Any) -> Evidence:
    return Evidence(
        id=evidence_id(agent, engine, kind, key if key is not None else (title, url)),
        agent=agent, engine=engine, kind=kind, title=title or "(untitled)", snippet=(snippet or "")[:400],
        url=url, source=source or (registered_domain(url) if url else None), published_at=published_at, data=data,
    )


def api_error(resp: dict[str, Any]) -> str | None:
    err = resp.get("error")
    if not err:
        return None
    if "hasn't returned any results" in str(err) or "no results" in str(err).lower():
        return None
    return str(err)
