export type Role = "viewer" | "analyst" | "admin";
export type Mode = "live" | "demo";
export type EvidenceStatus = "CORROBORATED" | "CONTRADICTED" | "UNVERIFIED" | "INSUFFICIENT_EVIDENCE";
export type Decision = "SAFE_TO_PROCEED" | "PROCEED_WITH_CAUTION" | "WAIT_VERIFY_MORE" | "DO_NOT_PROCEED";

export interface Me {
  user: { id: string; email: string; name: string; role: Role; is_demo: boolean };
  workspace: { id: string; name: string; mode: Mode; run_budget: number; monthly_budget: number; language: string; llm: string };
  can_return: boolean;
  allow_demo: boolean;
  force_demo: boolean;
}

export interface AuthState {
  needs_setup: boolean;
  allow_demo: boolean;
  providers: string[];
  signed_in: boolean;
}

export interface Account {
  account_email?: string | null;
  plan_name?: string | null;
  searches_per_month?: number | null;
  plan_searches_left?: number | null;
  total_searches_left?: number | null;
  this_month_usage?: number | null;
  rate_limit_per_hour?: number | null;
  last_hour_searches?: number | null;
}

export interface KeyStatus {
  mode: Mode;
  connected: boolean;
  scope: "session" | "workspace" | "env" | null;
  masked: string | null;
  account: Account | null;
  error: string | null;
}

export interface ParamSpec {
  type: "string" | "number" | "boolean" | "select";
  default: unknown;
  label: string;
  description: string;
  options: string[];
}

export interface AgentSpec {
  id: string;
  title: string;
  description: string;
  category: "core" | "ground_truth" | "evidence" | "synthesis";
  icon: string;
  engines: string[];
  consumes: string[];
  produces: string[];
  est_searches: number;
  params: Record<string, ParamSpec>;
  proves: string;
}

export interface EngineInfo {
  engine: string;
  title: string;
  docs: string;
  proves: string;
  agents: string[];
}

export interface NodeSpec {
  id: string;
  agent: string;
  params: Record<string, unknown>;
  label?: string | null;
  position?: { x: number; y: number } | null;
}

export interface EdgeSpec {
  source: string;
  target: string;
}

export interface Estimate {
  total: number;
  per_node: Record<string, number>;
  engines: Record<string, number>;
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  input_kind: "text" | "profile" | "image" | "route" | "symbol";
  input_placeholder: string;
  sample_input: RunInput;
  nodes: NodeSpec[];
  edges: EdgeSpec[];
  featured: boolean;
  source?: "template" | "saved";
  estimate?: Estimate;
}

export interface Profile {
  business_name?: string;
  topic?: string;
  city?: string;
  price?: number | string | null;
  usp?: string;
  audience?: string;
  competitors?: string[] | string;
  [key: string]: unknown;
}

export interface RunInput {
  text?: string;
  image_url?: string | null;
  profile?: Profile | null;
}

export interface Evidence {
  id: string;
  agent: string;
  engine: string | null;
  kind: string;
  title: string;
  snippet: string;
  url: string | null;
  source: string | null;
  published_at: string | null;
  data: Record<string, unknown>;
  run_id?: string;
  workflow_name?: string;
  created_at?: number;
}

export interface Finding {
  id: string;
  rule: string;
  kind: "contradiction" | "support" | "gap" | "signal";
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
  evidence_ids: string[];
  signal_types: string[];
}

export interface ConfidenceFactor {
  name: string;
  score: number;
  weight: number;
  detail: string;
}

export interface Action {
  label: string;
  url: string | null;
  kind: "verify" | "report" | "protect" | "proceed" | "watch";
}

export interface Verdict {
  type: "Verdict";
  evidence_status: EvidenceStatus;
  decision: Decision;
  confidence: number;
  confidence_factors: ConfidenceFactor[];
  findings: Finding[];
  actions: Action[];
  headline: string;
  explanation: string;
  explained_by: string;
}

export interface Signal {
  type: string;
  agent: string;
  evidence_ids: string[];
  [key: string]: unknown;
}

export interface Opportunity {
  text: string;
  evidence_ids: string[];
}

export interface MarketBrief {
  topic: string;
  momentum_pct: number | null;
  momentum_label: string;
  top_regions: { name: string; value: number }[];
  rising_queries: string[];
  price_floor: number | null;
  price_median: number | null;
  competitor_advertisers: string[];
  pain_points: string[];
  opportunities: Opportunity[];
  summary: string;
}

export interface AdClaim {
  text: string;
  evidence_ids: string[];
  supported: boolean;
}

export interface AdVariant {
  channel: "google_search" | "instagram" | "linkedin" | "whatsapp";
  headlines: string[];
  descriptions: string[];
  body: string;
  hashtags: string[];
  claims: AdClaim[];
  flags: string[];
}

export interface AdPack {
  topic: string;
  business_name: string;
  variants: AdVariant[];
  target_regions: string[];
  target_keywords: string[];
  compliance_flags: string[];
  generated_by: string;
}

export interface GraphNode {
  id: string;
  kind: "claim" | "signal" | "evidence" | "verdict" | "finding";
  label: string;
  detail: string;
  engine?: string | null;
  url?: string | null;
  status?: EvidenceStatus;
  finding_kind?: Finding["kind"];
  signal_type?: string;
  agent?: string;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  kind: string;
}

export interface SearchRecord {
  engine: string;
  query: string;
  cached: boolean;
  source: "serpapi" | "cache" | "fixture" | "missing";
  status: string;
  ms: number;
  node_id: string | null;
}

export interface Receipt {
  mode: string;
  total_calls: number;
  paid_searches: number;
  cache_hits: number;
  fixture_hits: number;
  synthetic_hits: number;
  missing: number;
  engines: Record<string, number>;
  records: SearchRecord[];
  duration_ms?: number;
}

export interface RunResult {
  workflow_id: string;
  status: string;
  node_status: Record<string, string>;
  node_summaries: Record<string, { summary: string; metrics: Record<string, unknown> }>;
  signals: Signal[];
  evidence: Evidence[];
  verdict: Verdict | null;
  market_brief: MarketBrief | null;
  ad_pack: AdPack | null;
  graph: { nodes: GraphNode[]; edges: GraphEdge[] };
  receipt: Receipt;
}

export interface RunSummary {
  id: string;
  workflow_id: string;
  workflow_name: string;
  status: "queued" | "running" | "completed" | "completed_with_gaps" | "failed";
  mode: Mode;
  created_at: number;
  finished_at: number | null;
  verdict_status: EvidenceStatus | null;
  decision: Decision | null;
  confidence: number | null;
  paid_searches: number | null;
  cache_hits: number | null;
  total_calls: number | null;
  error: string | null;
  watch_id: string | null;
  estimate: number | null;
  engines: Record<string, number>;
  input: RunInput;
}

export interface RunDetail extends RunSummary {
  workflow: Workflow;
  result: RunResult | null;
}

export type RunEvent =
  | { type: "run_started"; seq: number; ts: number; workflow_id: string; order: string[]; estimate: Estimate; mode: string }
  | { type: "node_started"; seq: number; ts: number; node_id: string; agent: string }
  | { type: "node_progress"; seq: number; ts: number; node_id: string; message: string; metrics?: Record<string, unknown> }
  | { type: "search"; seq: number; ts: number; node_id: string; engine: string; message: string }
  | { type: "evidence"; seq: number; ts: number; node_id: string; items: Evidence[] }
  | {
      type: "node_completed";
      seq: number;
      ts: number;
      node_id: string;
      agent: string;
      summary: string;
      metrics: Record<string, unknown>;
      signals: string[];
      evidence_count: number;
      searches: number;
      ms: number;
    }
  | { type: "node_failed"; seq: number; ts: number; node_id: string; agent: string; error: string }
  | { type: "run_completed"; seq: number; ts: number; status: string; receipt: Receipt; verdict: Verdict | null; has_brief: boolean; has_ads: boolean }
  | { type: "run_failed"; seq: number; ts: number; error: string };

export interface WatchChange {
  key: string;
  label: string;
  before?: unknown;
  after?: unknown;
  added?: string[];
}

export interface Watch {
  id: string;
  name: string;
  workflow_name: string;
  workflow_id: string;
  input: RunInput;
  interval_minutes: number;
  channels: string[];
  active: boolean;
  last_run_id: string | null;
  last_run_at: number | null;
  next_run_at: number | null;
  created_at: number;
  history: { id: string; run_id: string; created_at: number; changes: WatchChange[] }[];
}

export interface PlanResult {
  workflow: Workflow;
  rationale: string;
  planned_by: string;
  estimate: Estimate;
  problems: string[];
}
