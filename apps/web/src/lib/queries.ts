import { QueryCache, QueryClient, useQuery } from "@tanstack/react-query";
import { api, ApiError } from "./api";
import type {
  AgentSpec,
  AuthState,
  EngineInfo,
  Evidence,
  KeyStatus,
  Me,
  RunDetail,
  RunSummary,
  Watch,
  Workflow,
} from "./types";

export const onQueryError: { current: (err: unknown) => void } = { current: () => {} };

export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: (err) => onQueryError.current(err) }),
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
      refetchOnWindowFocus: false,
    },
  },
});

export const keys = {
  me: ["me"] as const,
  authState: ["auth-state"] as const,
  keyStatus: ["key-status"] as const,
  workflows: ["workflows"] as const,
  workflow: (id: string) => ["workflow", id] as const,
  agents: ["agents"] as const,
  engines: ["engines"] as const,
  rules: ["rules"] as const,
  runs: ["runs"] as const,
  run: (id: string) => ["run", id] as const,
  evidence: (params: string) => ["evidence", params] as const,
  usage: (days: number) => ["usage", days] as const,
  watches: ["watches"] as const,
  settings: ["settings"] as const,
  members: ["members"] as const,
  audit: ["audit"] as const,
  tokens: ["tokens"] as const,
  mcp: ["mcp"] as const,
};

export const useMe = () => useQuery({ queryKey: keys.me, queryFn: () => api.get<Me>("/auth/me"), staleTime: 60_000 });
export const useAuthState = () => useQuery({ queryKey: keys.authState, queryFn: () => api.get<AuthState>("/auth/state") });
export const useKeyStatus = () =>
  useQuery({ queryKey: keys.keyStatus, queryFn: () => api.get<KeyStatus>("/keys/serpapi/status"), staleTime: 60_000 });
export const useWorkflows = () =>
  useQuery({ queryKey: keys.workflows, queryFn: () => api.get<{ templates: Workflow[]; saved: Workflow[] }>("/workflows") });
export const useAgents = () =>
  useQuery({ queryKey: keys.agents, queryFn: () => api.get<{ agents: AgentSpec[] }>("/agents"), staleTime: 300_000, select: (d) => d.agents });
export const useEngines = () =>
  useQuery({ queryKey: keys.engines, queryFn: () => api.get<{ engines: EngineInfo[] }>("/engines"), staleTime: 300_000, select: (d) => d.engines });
export const useRuns = (limit = 50) =>
  useQuery({ queryKey: [...keys.runs, limit], queryFn: () => api.get<{ runs: RunSummary[] }>(`/runs?limit=${limit}`), select: (d) => d.runs });
export const useRun = (id: string) =>
  useQuery({
    queryKey: keys.run(id),
    queryFn: () => api.get<RunDetail>(`/runs/${id}`),
    refetchInterval: (q) => (q.state.data && ["queued", "running"].includes(q.state.data.status) ? 4000 : false),
  });
export const useWatches = () =>
  useQuery({ queryKey: keys.watches, queryFn: () => api.get<{ watches: Watch[] }>("/watches"), select: (d) => d.watches });

export interface UsageData {
  totals: { runs: number; calls: number; paid: number; saved: number };
  by_day: { day: string; paid: number; cached: number; runs: number }[];
  by_workflow: { workflow: string; paid: number; calls: number; runs: number }[];
  by_engine: { engine: string; calls: number }[];
  recent: (Pick<RunSummary, "id" | "workflow_name" | "created_at" | "paid_searches" | "cache_hits" | "total_calls" | "mode" | "status" | "estimate" | "verdict_status">)[];
}
export const useUsage = (days = 30) => useQuery({ queryKey: keys.usage(days), queryFn: () => api.get<UsageData>(`/usage?days=${days}`) });

export interface EvidenceResponse {
  items: Evidence[];
  facets: { engine: string | null; kind: string; n: number }[];
}
export const useEvidence = (params: URLSearchParams) =>
  useQuery({ queryKey: keys.evidence(params.toString()), queryFn: () => api.get<EvidenceResponse>(`/evidence?${params}`) });
