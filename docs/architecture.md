# Architecture

```
            ┌───────────────────────── apps/web (React 19 + Vite) ─────────────────────────┐
            │ Home · Studio (React Flow) · Live Run · Verdict / Brief / Ad Studio · Watches │
            └───────────────▲───────────────────────────────▲──────────────────────────────┘
                    REST + CSRF                       SSE /api/runs/{id}/events
            ┌───────────────┴───────────────────────────────┴──────────────────────────────┐
            │ apps/api (FastAPI)  auth · roles · keys (AES-GCM) · runs · watches · PDF · audit │
            └───────────────▲──────────────────────────────────────────────────────────────┘
                            │ execute_workflow(wf, input, serp, emit)
 apps/mcp (MCP stdio) ──────┤
                            ▼
            ┌──────────────────────────── packages/evidence_agents ─────────────────────────┐
            │ engine/  DAG executor · evidence graph · confidence · verdict                  │
            │ agents/  17 agents (Intent → evidence agents → synthesis → Verdict)            │
            │ rules/   30 deterministic rules → Findings (support/contradiction/gap/signal)  │
            │ serp/    SerpClient: live · record · demo, cache, budget, redaction, receipts  │
            │ llm/     Pydantic AI: intent, planner, explainer, ad copy (all optional)       │
            │ registry/ RBI digital-lending and SEBI adviser snapshots                       │
            └───────────────────────────────────────────────────────────────────────────────┘
```

## Execution model

A **workflow** is a JSON DAG of nodes, where each node is an agent with parameters, joined by edges. `validate_workflow`
rejects workflows with:

- cycles;
- unknown agents;
- duplicate node ids;
- dangling edges;
- a missing Intent agent when other agents need the extracted claim.

`estimate_searches` prices a workflow before it runs, and the run is refused if it exceeds the workspace budget.

The executor runs nodes in topological waves, and nodes whose inputs are ready run in parallel. Each agent receives an
`AgentContext` with:

- `ctx.search(params, label)`: the only path to SerpApi. It goes through cache, budget and redaction, and emits a
  `search` event.
- `ctx.bag`: a typed `SignalBag` holding everything upstream agents produced, such as `ClaimSet`, `AppProfile`,
  `ReviewWindow`, `PriceBand` and `PlaceProfile`.
- `ctx.progress(text)`: live progress lines for the canvas.

Agents return `AgentOutput(signals, evidence, summary, metrics)`. Evidence items are deduplicated by a stable id and
form the **evidence graph**, which links the claim to agents, agents to evidence, and evidence to findings.

Events (`run_started`, `node_started`, `search`, `evidence`, `node_completed`, `node_failed`, `verdict`,
`run_completed`) are persisted, then streamed over SSE. The UI replays them on reconnect.

## Verdicts: rules decide, the LLM explains

Each rule declares the signal types it needs and returns `Finding`s with a kind (support, contradiction, gap or
signal), a severity, and the evidence ids behind it. The verdict engine then works in three steps.

1. **Evidence status**, checked in this order:

   | Status | Condition |
   |---|---|
   | INSUFFICIENT_EVIDENCE | fewer than 3 evidence items |
   | CONTRADICTED | a high-severity contradiction, or 2 or more contradictions |
   | UNVERIFIED | any contradiction, or a high-severity gap |
   | CORROBORATED | 2 or more supports |

2. **Decision.** This depends on the status and on whether the claim type is risky (loan, investment, job or customer
   care).
3. **Confidence.** This is a weighted mix of source independence (distinct engines and domains), recency of dated
   evidence, the entity-match score, ground truth (registry snapshots), and agreement between findings. Each factor is
   shown in the report.

The LLM, when configured, writes the plain-language explanation from the findings only. The *LLM alone vs with
SerpApi* toggle on the verdict report shows what a model says from memory next to the evidence-built verdict.

## SerpApi client

The client has three modes:

| Mode | Behaviour |
|---|---|
| `live` | Real calls, with a SQLite response cache keyed by a params hash that excludes the key |
| `record` | Live calls, and each response is written to `fixtures/serp/` with the key scrubbed |
| `demo` | Replays fixtures, matched by exact params hash first, then by engine plus primary query. It never touches the network |

Other behaviour:

- **Budgets**: `SearchBudget` enforces per-run limits, and the API also enforces a monthly budget per workspace.
- **Receipts**: every call creates a receipt with engine, query, agent, source (paid, cache or replay), status and
  duration. Receipts appear on the run's *Receipt* tab and the *Usage* page.

## Data

SQLite (stdlib `sqlite3`, WAL mode) stores the following:

- workspaces, users, memberships and sessions;
- API tokens, stored hashed;
- encrypted secrets;
- workflows, runs and run events;
- evidence;
- watches and their history;
- the audit log.

Data lives in `data/`, which is gitignored.

## Watches

APScheduler ticks every minute and starts runs for watches that are due. When a run finishes, the service extracts
tracked metrics and diffs them against the previous run. The metrics are verdict, decision, confidence, lowest price,
store count, newest-review average, complaint share, search momentum, Play rating, registry status, new advertisers and
new headlines. It then stores the change set (shown as "What changed" on the Watches page) and sends a Telegram or email
alert when something changed.
