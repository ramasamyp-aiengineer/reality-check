"""Record real SerpApi responses for demo mode and tests.

Runs the sample input of each chosen workflow in `record` mode: every live response is cached and
written to fixtures/serp/ with the API key scrubbed. A hard budget caps paid searches.

Usage:
  record-fixtures                                   # hero workflows, budget 30
  record-fixtures loan_forward_check --budget 10
  record-fixtures market_pulse_ads --text "..."     # custom input instead of the sample
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

from evidence_agents.agents.base import RunInput
from evidence_agents.engine import execute_workflow, load_templates
from evidence_agents.llm.base import llm_from_env
from evidence_agents.serp.client import SearchBudget, SerpClient

ROOT = Path(__file__).resolve().parents[3]
HEROES = ["loan_forward_check", "market_pulse_ads", "buy_decision", "competitor_watch"]


async def _record(ids: list[str], budget: int, text: str | None, out_dir: Path) -> None:
    load_dotenv(ROOT / ".env")
    key = os.environ.get("SERPAPI_API_KEY")
    if not key:
        raise SystemExit("Set SERPAPI_API_KEY in .env first")
    templates = {t.id: t for t in load_templates()}
    shared_budget = SearchBudget(max_searches=budget)
    for wid in ids:
        wf = templates[wid]
        serp = SerpClient(api_key=key, mode="record", cache_path=ROOT / "data" / "serp_cache.sqlite",
                          fixtures_dir=out_dir, budget=shared_budget)
        run_input = RunInput(**({"text": text} if text else wf.sample_input))

        async def emit(event: dict[str, Any]) -> None:
            if event["type"] in ("node_completed", "node_failed"):
                print(f"  {event['type']:15} {event['node_id']:20} {event.get('summary') or event.get('error', '')}")

        print(f"Recording {wid} ...")
        result = await execute_workflow(wf, run_input, serp, emit, llm=llm_from_env(), secret=key)
        r = result["receipt"]
        print(f"  paid searches: {r['paid_searches']}  cache hits: {r['cache_hits']}  budget used: "
              f"{shared_budget.used}/{budget}")
    print(json.dumps({"fixtures_dir": str(out_dir), "budget_used": shared_budget.used}))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("workflows", nargs="*", default=HEROES)
    parser.add_argument("--budget", type=int, default=30)
    parser.add_argument("--text", default=None)
    parser.add_argument("--out", type=Path, default=ROOT / "fixtures" / "serp")
    args = parser.parse_args()
    asyncio.run(_record(args.workflows, args.budget, args.text, args.out))


if __name__ == "__main__":
    main()
