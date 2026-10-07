"""Run a workflow from the command line in demo mode (fixtures only) and print the outcome."""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path
from typing import Any

from evidence_agents.agents.base import RunInput
from evidence_agents.engine import execute_workflow, load_templates
from evidence_agents.serp.client import SerpClient

ROOT = Path(__file__).resolve().parents[1]


async def main(workflow_id: str) -> None:
    wf = next(t for t in load_templates() if t.id == workflow_id)
    serp = SerpClient(api_key=None, mode="demo", fixtures_dir=ROOT / "fixtures" / "serp",
                      sample_fixtures_dir=ROOT / "fixtures" / "sample")

    async def emit(event: dict[str, Any]) -> None:
        if event["type"] in ("node_completed", "node_failed"):
            print(f"  {event['type']:15} {event['node_id']:20} {event.get('summary') or event.get('error', '')}")

    result = await execute_workflow(wf, RunInput(**wf.sample_input), serp, emit)
    v = result["verdict"]
    if v:
        print(f"  VERDICT {v['evidence_status']} / {v['decision']} (confidence {v['confidence']})")
        for f in v["findings"]:
            print(f"    [{f['kind']}:{f['severity']}] {f['title']}")
    if result["market_brief"]:
        print("  BRIEF", json.dumps([o["text"] for o in result["market_brief"]["opportunities"]], indent=1))
    if result["ad_pack"]:
        print("  ADS flags:", result["ad_pack"]["compliance_flags"])
    r = result["receipt"]
    print(f"  receipt: calls={r['total_calls']} fixtures={r['fixture_hits']} missing={r['missing']} engines={r['engines']}")


if __name__ == "__main__":
    for wid in sys.argv[1:] or ["loan_forward_check"]:
        print(wid)
        asyncio.run(main(wid))
