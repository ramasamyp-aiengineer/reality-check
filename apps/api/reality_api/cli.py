"""`reality-check` command: start the server (UI + API) with one command."""

from __future__ import annotations

import argparse
import os


def main() -> None:
    parser = argparse.ArgumentParser(description="Reality Check: SerpApi evidence agents and workflow studio")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--demo", action="store_true",
                        help="Offer the demo workspace (recorded fixtures, no key). Real workspaces still run live.")
    parser.add_argument("--demo-only", action="store_true",
                        help="Replay recorded fixtures in every workspace; no SerpApi searches are ever made")
    parser.add_argument("--reload", action="store_true")
    args = parser.parse_args()
    if args.demo or args.demo_only:
        os.environ["ALLOW_DEMO_LOGIN"] = "1"
    if args.demo_only:
        os.environ["RC_FORCE_DEMO"] = "1"
    import uvicorn

    note = ("  (demo only: every workspace replays recordings)" if args.demo_only else
            "  (demo workspace on; your own workspace runs live)" if args.demo else "")
    print(f"Reality Check running at http://{args.host}:{args.port}{note}")
    uvicorn.run("reality_api.main:app", host=args.host, port=args.port, reload=args.reload, proxy_headers=False)


if __name__ == "__main__":
    main()
