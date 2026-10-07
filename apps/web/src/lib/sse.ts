import { useEffect, useReducer } from "react";
import type { Evidence, Receipt, RunEvent, Verdict } from "./types";

export type NodeState = "waiting" | "running" | "done" | "failed";

export interface NodeLive {
  state: NodeState;
  message?: string;
  summary?: string;
  error?: string;
  searches: number;
  evidence: number;
  ms?: number;
  engines: string[];
}

export interface LiveRun {
  connected: boolean;
  finished: boolean;
  failed?: string;
  events: RunEvent[];
  nodes: Record<string, NodeLive>;
  evidence: Evidence[];
  searches: { engine: string; node_id: string; message: string; ts: number }[];
  receipt?: Receipt;
  verdict?: Verdict | null;
  hasBrief?: boolean;
  hasAds?: boolean;
  startedAt?: number;
  endedAt?: number;
}

const initial: LiveRun = { connected: false, finished: false, events: [], nodes: {}, evidence: [], searches: [] };

function node(state: LiveRun, id: string): NodeLive {
  return state.nodes[id] ?? { state: "waiting", searches: 0, evidence: 0, engines: [] };
}

type Action = { type: "reset" } | { type: "open" } | { type: "event"; event: RunEvent };

function reducer(state: LiveRun, action: Action): LiveRun {
  if (action.type === "reset") return initial;
  if (action.type === "open") return { ...state, connected: true };
  const e = action.event;
  if (state.events.some((x) => x.seq === e.seq)) return state;
  const s: LiveRun = { ...state, events: [...state.events, e] };
  switch (e.type) {
    case "run_started": {
      const nodes: Record<string, NodeLive> = {};
      e.order.forEach((id) => (nodes[id] = { state: "waiting", searches: 0, evidence: 0, engines: [] }));
      return { ...s, nodes, startedAt: e.ts };
    }
    case "node_started":
      return { ...s, nodes: { ...s.nodes, [e.node_id]: { ...node(s, e.node_id), state: "running", message: "Starting" } } };
    case "node_progress":
      return { ...s, nodes: { ...s.nodes, [e.node_id]: { ...node(s, e.node_id), message: e.message } } };
    case "search": {
      const n = node(s, e.node_id);
      return {
        ...s,
        searches: [...s.searches, { engine: e.engine, node_id: e.node_id, message: e.message, ts: e.ts }],
        nodes: {
          ...s.nodes,
          [e.node_id]: { ...n, message: e.message, searches: n.searches + 1, engines: Array.from(new Set([...n.engines, e.engine])) },
        },
      };
    }
    case "evidence":
      return { ...s, evidence: [...e.items, ...s.evidence].slice(0, 400) };
    case "node_completed":
      return {
        ...s,
        nodes: {
          ...s.nodes,
          [e.node_id]: { ...node(s, e.node_id), state: "done", summary: e.summary, evidence: e.evidence_count, ms: e.ms, searches: e.searches },
        },
      };
    case "node_failed":
      return { ...s, nodes: { ...s.nodes, [e.node_id]: { ...node(s, e.node_id), state: "failed", error: e.error } } };
    case "run_completed":
      return { ...s, finished: true, receipt: e.receipt, verdict: e.verdict, hasBrief: e.has_brief, hasAds: e.has_ads, endedAt: e.ts };
    case "run_failed":
      return { ...s, finished: true, failed: e.error, endedAt: e.ts };
  }
  return s;
}

export function useRunStream(runId: string | undefined): LiveRun {
  const [state, dispatch] = useReducer(reducer, initial);
  useEffect(() => {
    if (!runId) return;
    dispatch({ type: "reset" });
    const source = new EventSource(`/api/runs/${runId}/events`, { withCredentials: true });
    source.onopen = () => dispatch({ type: "open" });
    source.onmessage = (msg) => {
      try {
        const event = JSON.parse(msg.data) as RunEvent;
        dispatch({ type: "event", event });
        if (event.type === "run_completed" || event.type === "run_failed") source.close();
      } catch {
        /* ignore malformed frames */
      }
    };
    source.onerror = () => {
      if (source.readyState === EventSource.CLOSED) return;
    };
    return () => source.close();
  }, [runId]);
  return state;
}
