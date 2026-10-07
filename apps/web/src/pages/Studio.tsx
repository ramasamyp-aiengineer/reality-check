import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import {
  addEdge,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
} from "@xyflow/react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  GripVertical,
  KeyRound,
  LayoutGrid,
  Loader2,
  Play,
  Radar,
  Save,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { EngineChip, ModeBadge } from "@/components/domain";
import { CATEGORY_STYLE, NODE_SIZE, nodeTypes, type AgentFlowNode } from "@/components/flow/AgentNode";
import { agentMap } from "@/components/flow/WorkflowCanvas";
import { inputIsEmpty, normalizeInput, RunInputForm } from "@/components/RunInputForm";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger, Select, Tip } from "@/components/ui/overlays";
import { Badge, Field, Input, Progress, Switch, Textarea } from "@/components/ui/primitives";
import { WatchDialog } from "@/components/WatchDialog";
import { api, ApiError } from "@/lib/api";
import { agentIcon } from "@/lib/icons";
import { layoutGraph } from "@/lib/layout";
import { keys, useAgents, useKeyStatus, useMe, useWorkflows } from "@/lib/queries";
import type { AgentSpec, Estimate, PlanResult, RunInput, Workflow } from "@/lib/types";
import { cn, formatNumber, humanize } from "@/lib/utils";

type Meta = Omit<Workflow, "nodes" | "edges">;

const BLANK: Meta = {
  id: "custom_new",
  name: "Untitled workflow",
  description: "",
  category: "custom",
  tags: [],
  input_kind: "text",
  input_placeholder: "",
  sample_input: {},
  featured: false,
};

const AI_EXAMPLES = [
  "Watch my competitors' ads and news weekly",
  "Is this loan app on WhatsApp legit?",
  "Compare iPhone prices before I buy",
  "Check a work-from-home job offer",
  "Read the electric scooter market in Bengaluru and write ads",
];

function makeNode(spec: AgentSpec, id: string, position: { x: number; y: number }, params: Record<string, unknown> = {}): AgentFlowNode {
  return {
    id,
    type: "agent",
    position,
    data: {
      agent: spec.id,
      params,
      title: spec.title,
      icon: spec.icon,
      category: spec.category,
      engines: spec.engines,
      est: spec.est_searches,
    },
  };
}

function Palette({ agents, onAdd }: { agents: AgentSpec[]; onAdd: (a: AgentSpec) => void }) {
  const [q, setQ] = useState("");
  const groups = useMemo(() => {
    const order = ["core", "ground_truth", "evidence", "synthesis"];
    const list = agents.filter((a) => a.id !== "watch" && `${a.title} ${a.description} ${a.engines.join(" ")}`.toLowerCase().includes(q.toLowerCase()));
    return order.map((c) => ({ c, items: list.filter((a) => a.category === c) })).filter((g) => g.items.length);
  }, [agents, q]);
  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-surface">
      <div className="border-b border-border p-3">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-subtle">Agent palette</div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-subtle" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search agents or engines" className="h-8 pl-8 text-[13px]" />
        </div>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto p-3">
        {groups.map((g) => (
          <div key={g.c}>
            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-subtle">
              <span className="size-1.5 rounded-full" style={{ background: CATEGORY_STYLE[g.c]?.accent }} />
              {CATEGORY_STYLE[g.c]?.label}
            </div>
            <div className="space-y-1.5">
              {g.items.map((a) => {
                const Icon = agentIcon(a.icon);
                return (
                  <div
                    key={a.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("application/reality-agent", a.id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDoubleClick={() => onAdd(a)}
                    className="group flex cursor-grab items-center gap-2 rounded-lg border border-border bg-surface-2/60 p-2 transition-colors hover:border-brand-line hover:bg-brand-soft active:cursor-grabbing"
                    title="Drag onto the canvas, or double-click to add"
                  >
                    <GripVertical className="size-3.5 text-subtle opacity-0 transition-opacity group-hover:opacity-100" />
                    <span className="grid size-7 shrink-0 place-items-center rounded-md" style={{ background: `${CATEGORY_STYLE[a.category]?.accent}1f`, color: CATEGORY_STYLE[a.category]?.accent }}>
                      <Icon className="size-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12.5px] font-medium">{a.title}</div>
                      <div className="truncate text-[10.5px] text-subtle">{a.est_searches ? `~${a.est_searches} search${a.est_searches > 1 ? "es" : ""}` : "No searches"}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-border p-3 text-[11px] leading-relaxed text-subtle">
        Drag agents onto the canvas and connect them. Rules attach to signals, so any combination still produces a valid verdict.
      </div>
    </aside>
  );
}

function ParamEditor({ spec, params, onChange }: { spec: AgentSpec; params: Record<string, unknown>; onChange: (p: Record<string, unknown>) => void }) {
  const entries = Object.entries(spec.params);
  if (!entries.length) return <p className="text-xs text-subtle">This agent has no settings.</p>;
  return (
    <div className="space-y-3">
      {entries.map(([key, p]) => {
        const value = params[key] ?? p.default;
        const label = p.label || humanize(key);
        if (p.type === "boolean")
          return (
            <label key={key} className="flex items-start justify-between gap-3">
              <span>
                <span className="block text-[13px] font-medium">{label}</span>
                {p.description && <span className="block text-xs text-subtle">{p.description}</span>}
              </span>
              <Switch checked={Boolean(value)} onCheckedChange={(v) => onChange({ ...params, [key]: v })} />
            </label>
          );
        if (p.type === "select")
          return (
            <Field key={key} label={label} hint={p.description}>
              <Select value={String(value ?? "")} onValueChange={(v) => onChange({ ...params, [key]: v })} options={p.options.map((o) => ({ value: o, label: humanize(o) }))} />
            </Field>
          );
        return (
          <Field key={key} label={label} hint={p.description}>
            <Input
              value={value == null ? "" : String(value)}
              inputMode={p.type === "number" ? "numeric" : undefined}
              onChange={(e) => onChange({ ...params, [key]: p.type === "number" ? Number(e.target.value) || 0 : e.target.value })}
            />
          </Field>
        );
      })}
    </div>
  );
}

function Inspector({
  node,
  spec,
  onParams,
  onRemove,
  onClose,
}: {
  node: AgentFlowNode;
  spec: AgentSpec;
  onParams: (p: Record<string, unknown>) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const Icon = agentIcon(spec.icon);
  const accent = CATEGORY_STYLE[spec.category]?.accent;
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl" style={{ background: `${accent}1f`, color: accent }}>
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{spec.title}</div>
          <div className="text-xs text-subtle">
            {CATEGORY_STYLE[spec.category]?.label} · node <span className="font-mono">{node.id}</span>
          </div>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close inspector">
          <X />
        </Button>
      </div>
      <p className="text-[13px] leading-relaxed text-muted">{spec.description}</p>
      {spec.proves && (
        <div className="rounded-lg border border-brand-line bg-brand-soft p-3 text-[12.5px]">
          <div className="mb-0.5 text-[11px] font-semibold uppercase tracking-wider text-brand">What it proves</div>
          {spec.proves}
        </div>
      )}
      <div>
        <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-subtle">SerpApi engines</div>
        <div className="flex flex-wrap gap-1">
          {spec.engines.length ? spec.engines.map((e) => <EngineChip key={e} engine={e} />) : <span className="text-xs text-subtle">None: runs on local data and rules</span>}
        </div>
        <div className="mt-2 text-xs text-muted">
          Estimated cost: <span className="font-medium text-foreground">{spec.est_searches} search{spec.est_searches === 1 ? "" : "es"}</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-subtle">Inputs</div>
          <div className="flex flex-wrap gap-1">
            {spec.consumes.length ? spec.consumes.map((c) => <Badge key={c}>{c}</Badge>) : <span className="text-xs text-subtle">Raw input</span>}
          </div>
        </div>
        <div>
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-subtle">Outputs</div>
          <div className="flex flex-wrap gap-1">
            {spec.produces.map((c) => (
              <Badge key={c} tone="brand">
                {c}
              </Badge>
            ))}
          </div>
        </div>
      </div>
      <div>
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-subtle">Settings</div>
        <ParamEditor spec={spec} params={node.data.params ?? {}} onChange={onParams} />
      </div>
      <Button variant="outline" size="sm" className="w-full text-bad" onClick={onRemove}>
        <Trash2 /> Remove from workflow
      </Button>
    </div>
  );
}

function CostMeter({ estimate, budget, left, mode }: { estimate: Estimate | null; budget: number; left: number | null | undefined; mode: string | undefined }) {
  const total = estimate?.total ?? 0;
  const over = total > budget;
  return (
    <div className="space-y-2">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-subtle">Estimated cost</div>
          <div className={cn("text-2xl font-semibold tabular", over && "text-bad")}>
            {total} <span className="text-sm font-normal text-muted">searches</span>
          </div>
        </div>
        <div className="text-right text-xs text-muted">
          Per-run budget <span className="font-medium text-foreground">{budget}</span>
          {mode === "live" && left != null && (
            <div>
              Account: <span className="font-medium text-foreground">{formatNumber(left)}</span> left
            </div>
          )}
          {mode === "demo" && <div className="text-warn">Demo: replayed, 0 spent</div>}
        </div>
      </div>
      <Progress value={budget ? (total / budget) * 100 : 0} tone={over ? "bad" : total / budget > 0.7 ? "warn" : "brand"} />
      <div className="flex flex-wrap gap-1 pt-1">
        {Object.entries(estimate?.engines ?? {}).map(([e, n]) => (
          <EngineChip key={e} engine={e} count={n} />
        ))}
      </div>
    </div>
  );
}

function AiPanel({
  open,
  onClose,
  initialPrompt,
  autoRun,
  ready,
  onPlanned,
}: {
  open: boolean;
  onClose: () => void;
  initialPrompt?: string;
  autoRun?: boolean;
  ready: boolean;
  onPlanned: (r: PlanResult) => void;
}) {
  const [prompt, setPrompt] = useState(initialPrompt ?? "");
  const [loading, setLoading] = useState(false);
  const ran = useRef(false);
  const plan = useCallback(
    async (text: string) => {
      if (text.trim().length < 3) return;
      setLoading(true);
      try {
        const r = await api.post<PlanResult>("/workflows/plan", { prompt: text.trim() });
        onPlanned(r);
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : "Planning failed");
      } finally {
        setLoading(false);
      }
    },
    [onPlanned],
  );
  useEffect(() => {
    if (autoRun && ready && initialPrompt && !ran.current) {
      ran.current = true;
      void plan(initialPrompt);
    }
  }, [autoRun, ready, initialPrompt, plan]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: -12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.98 }}
          transition={{ duration: 0.22 }}
          className="absolute left-1/2 top-4 z-20 w-[min(640px,calc(100%-2rem))] -translate-x-1/2 rounded-2xl border border-brand-line bg-surface p-4 shadow-2xl"
        >
          <div className="mb-2 flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-lg bg-brand text-white">
              <Wand2 className="size-4" />
            </span>
            <div className="flex-1">
              <div className="text-sm font-semibold">Describe it. We build the workflow.</div>
              <div className="text-xs text-subtle">The planner picks agents and wiring within your search budget. Nothing runs until you approve.</div>
            </div>
            <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close planner">
              <X />
            </Button>
          </div>
          <Textarea
            autoFocus
            rows={3}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void plan(prompt);
            }}
            placeholder="e.g. Watch my competitors weekly and alert me when their ads or prices change"
          />
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {AI_EXAMPLES.map((ex) => (
              <button key={ex} onClick={() => setPrompt(ex)} className="rounded-full border border-border px-2.5 py-1 text-[11.5px] text-muted hover:border-brand-line hover:text-foreground">
                {ex}
              </button>
            ))}
            <Button className="ml-auto" onClick={() => plan(prompt)} loading={loading} disabled={prompt.trim().length < 3}>
              <Sparkles /> Build workflow
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ApproveDialog({
  open,
  onOpenChange,
  meta,
  estimate,
  problems,
  input,
  onRun,
  running,
  agentsCount,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  meta: Meta;
  estimate: Estimate | null;
  problems: string[];
  input: RunInput;
  onRun: () => void;
  running: boolean;
  agentsCount: number;
}) {
  const { t } = useTranslation();
  const me = useMe();
  const status = useKeyStatus();
  const navigate = useNavigate();
  const [ack, setAck] = useState(false);
  useEffect(() => setAck(false), [open]);
  const mode = me.data?.workspace.mode;
  const budget = me.data?.workspace.run_budget ?? 15;
  const total = estimate?.total ?? 0;
  const needsKey = mode === "live" && !status.data?.connected;
  const over = total > budget;
  const empty = inputIsEmpty(input, meta.input_kind);
  const blocked = needsKey || over || problems.length > 0 || empty;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Review and approve" description="Agents only spend searches after you approve this plan." wide>
        <div className="grid gap-5 md:grid-cols-[1fr_1fr]">
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-surface-2/50 p-4">
              <div className="flex items-center justify-between">
                <div className="font-semibold">{meta.name}</div>
                <ModeBadge mode={mode} />
              </div>
              <div className="mt-1 text-xs text-muted">
                {agentsCount} agents · runs independent agents in parallel
              </div>
              <div className="mt-4">
                <CostMeter estimate={estimate} budget={budget} left={status.data?.account?.total_searches_left} mode={mode} />
              </div>
            </div>
            <ul className="space-y-1.5 text-xs text-muted">
              <li className="flex gap-2"><ShieldCheck className="size-3.5 shrink-0 text-ok" /> Search results are treated as data, never as instructions.</li>
              <li className="flex gap-2"><ShieldCheck className="size-3.5 shrink-0 text-ok" /> Verdicts come from transparent rules; the LLM only explains.</li>
              <li className="flex gap-2"><ShieldCheck className="size-3.5 shrink-0 text-ok" /> A hard budget stops the run at {budget} searches.</li>
            </ul>
          </div>
          <div className="space-y-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-subtle">Input</div>
            <div className="max-h-44 overflow-y-auto rounded-lg border border-border bg-surface-2/50 p-3 text-[13px] leading-relaxed">
              {meta.input_kind === "profile" ? (
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                  {Object.entries(input.profile ?? {})
                    .filter(([, v]) => v !== null && v !== "" && v !== undefined)
                    .map(([k, v]) => (
                      <div key={k} className="contents">
                        <dt className="text-subtle">{humanize(k)}</dt>
                        <dd>{Array.isArray(v) ? v.join(", ") : String(v)}</dd>
                      </div>
                    ))}
                </dl>
              ) : (
                <span className="whitespace-pre-wrap">{input.text || <span className="text-subtle">No input yet</span>}</span>
              )}
            </div>
            {(problems.length > 0 || needsKey || over || empty) && (
              <div className="space-y-1.5 rounded-lg border border-bad-line bg-bad-soft p-3 text-xs text-bad">
                {problems.map((p) => (
                  <div key={p} className="flex gap-2"><AlertTriangle className="size-3.5 shrink-0" /> {p}</div>
                ))}
                {over && <div className="flex gap-2"><AlertTriangle className="size-3.5 shrink-0" /> Estimate exceeds the per-run budget of {budget}. Remove an agent or raise the budget in Settings.</div>}
                {empty && <div className="flex gap-2"><AlertTriangle className="size-3.5 shrink-0" /> Add an input to check.</div>}
                {needsKey && (
                  <div className="flex items-center gap-2">
                    <KeyRound className="size-3.5 shrink-0" /> Connect your SerpApi key to run live.
                    <button className="ml-auto underline" onClick={() => navigate({ to: "/connect" })}>Connect</button>
                  </div>
                )}
              </div>
            )}
            {!blocked && (
              <label className="flex items-start gap-2.5 rounded-lg border border-border p-3 text-[13px]">
                <Switch checked={ack} onCheckedChange={setAck} className="mt-0.5" />
                <span>
                  I approve up to <b className="tabular">{total}</b> SerpApi searches{mode === "demo" ? " (replayed from recordings in demo mode)" : ""}.
                </span>
              </label>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
              <Button onClick={onRun} loading={running} disabled={blocked || !ack} size="lg">
                <Play /> {t("common.approveRun")}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StudioInner() {
  const search = useSearch({ strict: false }) as { template?: string; sample?: number; ai?: number; prompt?: string; text?: string };
  const navigate = useNavigate();
  const qc = useQueryClient();
  const agentsQ = useAgents();
  const workflows = useWorkflows();
  const me = useMe();
  const status = useKeyStatus();
  const agents = useMemo(() => agentMap(agentsQ.data), [agentsQ.data]);
  const rf = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState<AgentFlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [meta, setMeta] = useState<Meta>(BLANK);
  const [input, setInput] = useState<RunInput>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [validating, setValidating] = useState(false);
  const [aiOpen, setAiOpen] = useState(Boolean(search.ai));
  const [plan, setPlan] = useState<PlanResult | null>(null);
  const [approveOpen, setApproveOpen] = useState(false);
  const [watchOpen, setWatchOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const loadedKey = useRef<string | null>(null);

  const load = useCallback(
    (wf: Workflow, opts: { sample?: boolean; text?: string; keepInput?: boolean } = {}) => {
      const pos = layoutGraph(wf.nodes, wf.edges, { nodeWidth: NODE_SIZE.full.width, nodeHeight: NODE_SIZE.full.height, rankSep: 80, nodeSep: 28 });
      const flowNodes = wf.nodes
        .filter((n) => agents[n.agent])
        .map((n) => {
          const node = makeNode(agents[n.agent], n.id, n.position ?? pos[n.id] ?? { x: 0, y: 0 }, n.params);
          if (n.label) node.data.title = n.label;
          return node;
        });
      setNodes(flowNodes);
      setEdges(wf.edges.map((e) => ({ id: `${e.source}->${e.target}`, source: e.source, target: e.target, type: "smoothstep" })));
      const { nodes: _n, edges: _e, source: _s, estimate: _est, ...rest } = wf;
      void _n;
      void _e;
      void _s;
      void _est;
      setMeta({ ...BLANK, ...rest });
      setSelected(null);
      if (opts.text) setInput(wf.input_kind === "profile" ? { ...wf.sample_input } : { ...(wf.sample_input ?? {}), text: opts.text });
      else if (opts.sample) setInput({ ...wf.sample_input });
      else if (!opts.keepInput) setInput(wf.input_kind === "profile" ? { profile: { ...(wf.sample_input?.profile ?? {}) } } : {});
      window.setTimeout(() => rf.fitView({ padding: 0.2, duration: 500 }), 60);
    },
    [agents, rf, setEdges, setNodes],
  );

  useEffect(() => {
    if (!agentsQ.data || !workflows.data) return;
    const key = `${search.template}|${search.sample}|${search.text}`;
    if (loadedKey.current === key) return;
    loadedKey.current = key;
    if (search.template) {
      const wf = [...workflows.data.templates, ...workflows.data.saved].find((w) => w.id === search.template);
      if (wf) {
        load(wf, { sample: Boolean(search.sample), text: search.text });
        if (search.sample) window.setTimeout(() => setApproveOpen(true), 450);
      } else toast.error("Workflow not found");
    } else if (!search.ai && nodes.length === 0) {
      const intent = agents.intent;
      const verdict = agents.verdict;
      if (intent && verdict) {
        setNodes([makeNode(intent, "intent", { x: 0, y: 80 }), makeNode(verdict, "verdict", { x: 620, y: 80 })]);
        setEdges([]);
      }
    }
  }, [agentsQ.data, workflows.data, search.template, search.sample, search.text, search.ai, load, agents, nodes.length, setNodes, setEdges]);

  const toWorkflow = useCallback(
    (): Workflow => ({
      ...meta,
      nodes: nodes.map((n) => ({ id: n.id, agent: n.data.agent ?? n.id, params: n.data.params ?? {}, position: { x: Math.round(n.position.x), y: Math.round(n.position.y) } })),
      edges: edges.map((e) => ({ source: e.source, target: e.target })),
    }),
    [meta, nodes, edges],
  );

  const structureKey = useMemo(
    () => JSON.stringify([nodes.map((n) => [n.id, n.data.agent, n.data.params]), edges.map((e) => [e.source, e.target])]),
    [nodes, edges],
  );

  useEffect(() => {
    if (!nodes.length) {
      setEstimate(null);
      setProblems(["Add at least one agent"]);
      return;
    }
    setValidating(true);
    const handle = window.setTimeout(async () => {
      try {
        const r = await api.post<{ problems: string[]; estimate: Estimate }>("/workflows/validate", toWorkflow());
        setProblems(r.problems);
        setEstimate(r.estimate);
      } catch (err) {
        setProblems([err instanceof ApiError ? err.message : "Validation failed"]);
      } finally {
        setValidating(false);
      }
    }, 350);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structureKey]);

  const nextId = (agentId: string) => {
    const ids = new Set(nodes.map((n) => n.id));
    if (!ids.has(agentId)) return agentId;
    let i = 2;
    while (ids.has(`${agentId}_${i}`)) i++;
    return `${agentId}_${i}`;
  };

  const addAgent = (spec: AgentSpec, position?: { x: number; y: number }) => {
    const id = nextId(spec.id);
    const p = position ?? rf.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    const defaults = Object.fromEntries(Object.entries(spec.params).map(([k, v]) => [k, v.default]));
    setNodes((ns) => [...ns, makeNode(spec, id, p, defaults)]);
    if (spec.consumes.includes("ClaimSet") && nodes.some((n) => n.id === "intent") && spec.id !== "intent") {
      setEdges((es) => addEdge({ id: `intent->${id}`, source: "intent", target: id, type: "smoothstep" }, es));
    }
    setSelected(id);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("application/reality-agent");
    const spec = agents[id];
    if (!spec) return;
    const p = rf.screenToFlowPosition({ x: e.clientX - NODE_SIZE.full.width / 2, y: e.clientY - 30 });
    addAgent(spec, p);
  };

  const onConnect = (c: Connection) => {
    if (c.source === c.target) return;
    setEdges((es) => addEdge({ ...c, type: "smoothstep" }, es));
  };

  const autoLayout = () => {
    const pos = layoutGraph(
      nodes.map((n) => ({ id: n.id })),
      edges,
      { nodeWidth: NODE_SIZE.full.width, nodeHeight: NODE_SIZE.full.height, rankSep: 80, nodeSep: 28 },
    );
    setNodes((ns) => ns.map((n) => ({ ...n, position: pos[n.id] ?? n.position })));
    window.setTimeout(() => rf.fitView({ padding: 0.2, duration: 500 }), 30);
  };

  const onPlanned = useCallback(
    (r: PlanResult) => {
      setPlan(r);
      load(r.workflow, { keepInput: true, text: search.text });
      if (!search.text && r.workflow.input_kind === "profile") setInput({ ...r.workflow.sample_input });
      setAiOpen(false);
      toast.success("Workflow planned", { description: `${r.workflow.nodes.length} agents, ~${r.estimate.total} searches` });
    },
    [load, search.text],
  );

  const save = async () => {
    setSaving(true);
    try {
      const wf = toWorkflow();
      if (!wf.id.startsWith("custom_") && !wf.id.startsWith("wf_")) wf.id = `custom_${wf.id}`;
      const r = await api.post<Workflow>("/workflows", wf);
      setMeta((m) => ({ ...m, id: r.id }));
      await qc.invalidateQueries({ queryKey: keys.workflows });
      toast.success("Workflow saved", { description: "Find it in the library under Saved." });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const run = async () => {
    setRunning(true);
    try {
      const r = await api.post<{ id: string }>("/runs", { workflow: toWorkflow(), input: normalizeInput(input, meta.input_kind), approved: true });
      await qc.invalidateQueries({ queryKey: keys.runs });
      navigate({ to: "/runs/$runId", params: { runId: r.id } });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Run failed to start");
      setRunning(false);
    }
  };

  const selectedNode = nodes.find((n) => n.id === selected);
  const selectedSpec = selectedNode ? agents[selectedNode.data.agent ?? ""] : undefined;
  const budget = me.data?.workspace.run_budget ?? 15;
  const templates = workflows.data?.templates ?? [];
  const hasImage = nodes.some((n) => n.data.agent === "visual_provenance");
  const canEdit = me.data?.user.role !== "viewer";

  return (
    <div className="flex h-[calc(100vh-56px)] flex-col">
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface px-4">
        <Input value={meta.name} onChange={(e) => setMeta((m) => ({ ...m, name: e.target.value }))} className="h-8 w-64 border-transparent bg-transparent text-[15px] font-semibold hover:border-border focus:bg-surface-2" aria-label="Workflow name" />
        <Menu>
          <MenuTrigger asChild>
            <Button variant="ghost" size="sm">
              Templates <ChevronDown />
            </Button>
          </MenuTrigger>
          <MenuContent align="start" className="w-72">
            <MenuLabel>Load a template</MenuLabel>
            {templates.map((t) => (
              <MenuItem key={t.id} onSelect={() => navigate({ to: "/studio", search: { template: t.id } })}>
                <span className="flex-1 truncate">{t.name}</span>
                <span className="text-xs text-subtle">~{t.estimate?.total}</span>
              </MenuItem>
            ))}
            <MenuSeparator />
            <MenuItem onSelect={() => navigate({ to: "/studio" })}>Blank canvas</MenuItem>
          </MenuContent>
        </Menu>
        <div className="flex items-center gap-1.5 text-xs">
          {validating ? (
            <Badge>
              <Loader2 className="animate-spin" /> Checking
            </Badge>
          ) : problems.length ? (
            <Tip content={problems.join(" · ")}>
              <Badge tone="bad">
                <AlertTriangle /> {problems.length} issue{problems.length > 1 ? "s" : ""}
              </Badge>
            </Tip>
          ) : (
            <Badge tone="ok">
              <CheckCircle2 /> Valid
            </Badge>
          )}
          <Badge tone={estimate && estimate.total > budget ? "bad" : "neutral"} className="tabular">
            ~{estimate?.total ?? 0} / {budget} searches
          </Badge>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setAiOpen((v) => !v)}>
            <Sparkles /> Build with AI
          </Button>
          <Tip content="Auto-arrange">
            <Button variant="ghost" size="icon-sm" onClick={autoLayout} aria-label="Auto layout">
              <LayoutGrid />
            </Button>
          </Tip>
          <Button variant="ghost" size="sm" onClick={save} loading={saving} disabled={!canEdit || problems.length > 0}>
            <Save /> Save
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setWatchOpen(true)} disabled={!canEdit || problems.length > 0 || inputIsEmpty(input, meta.input_kind)}>
            <Radar /> Watch
          </Button>
          <Button size="sm" onClick={() => setApproveOpen(true)} disabled={!canEdit}>
            <Play /> Review & run
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <Palette agents={agentsQ.data ?? []} onAdd={(a) => addAgent(a)} />
        <div className="relative min-w-0 flex-1" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
          <AiPanel open={aiOpen} onClose={() => setAiOpen(false)} initialPrompt={search.prompt} autoRun={Boolean(search.prompt)} ready={Boolean(agentsQ.data && workflows.data)} onPlanned={onPlanned} />
          <AnimatePresence>
            {plan && !aiOpen && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="absolute left-4 right-4 top-4 z-10 mx-auto flex max-w-2xl items-start gap-3 rounded-xl border border-brand-line bg-surface/95 p-3 shadow-lg backdrop-blur"
              >
                <Wand2 className="mt-0.5 size-4 shrink-0 text-brand" />
                <div className="flex-1 text-[13px]">
                  <span className="font-medium">Planned by {plan.planned_by === "llm" ? "the LLM planner" : "keyword rules"}.</span> <span className="text-muted">{plan.rationale}</span>
                </div>
                <button onClick={() => setPlan(null)} className="text-subtle hover:text-foreground" aria-label="Dismiss">
                  <X className="size-4" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, n) => setSelected(n.id)}
            onPaneClick={() => setSelected(null)}
            onNodesDelete={(ds) => ds.some((d) => d.id === selected) && setSelected(null)}
            deleteKeyCode={["Backspace", "Delete"]}
            defaultEdgeOptions={{ type: "smoothstep" }}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            proOptions={{ hideAttribution: true }}
            minZoom={0.25}
            snapToGrid
            snapGrid={[8, 8]}
          >
            <Background variant={BackgroundVariant.Dots} gap={18} size={1.2} color="var(--canvas-dot)" />
            <Controls position="bottom-left" showInteractive={false} />
            <MiniMap position="bottom-right" pannable zoomable nodeColor={(n) => CATEGORY_STYLE[(n.data as { category?: string }).category ?? "evidence"]?.accent ?? "#6366f1"} maskColor="color-mix(in srgb, var(--background) 70%, transparent)" />
          </ReactFlow>
          {nodes.length <= 2 && !aiOpen && !search.template && (
            <div className="pointer-events-none absolute inset-x-0 bottom-24 mx-auto w-fit rounded-xl border border-dashed border-border-strong bg-surface/80 px-4 py-3 text-center text-[13px] text-muted backdrop-blur">
              Drag evidence agents from the palette between <b>Intent</b> and <b>Verdict</b>, then connect them.
            </div>
          )}
        </div>

        <aside className="w-[340px] shrink-0 overflow-y-auto border-l border-border bg-surface p-4">
          {selectedNode && selectedSpec ? (
            <Inspector
              node={selectedNode}
              spec={selectedSpec}
              onClose={() => setSelected(null)}
              onParams={(params) => setNodes((ns) => ns.map((n) => (n.id === selectedNode.id ? { ...n, data: { ...n.data, params } } : n)))}
              onRemove={() => {
                setNodes((ns) => ns.filter((n) => n.id !== selectedNode.id));
                setEdges((es) => es.filter((e) => e.source !== selectedNode.id && e.target !== selectedNode.id));
                setSelected(null);
              }}
            />
          ) : (
            <div className="space-y-6">
              <div>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-subtle">Run input</div>
                <div className="mb-3 flex gap-1 rounded-lg border border-border bg-surface-2 p-1 text-[12px]">
                  {(["text", "profile"] as const).map((k) => (
                    <button
                      key={k}
                      onClick={() => setMeta((m) => ({ ...m, input_kind: k }))}
                      className={cn("flex-1 rounded-md py-1 font-medium", meta.input_kind === k ? "bg-surface text-foreground shadow-sm" : "text-muted")}
                    >
                      {k === "text" ? "Claim or message" : "Business profile"}
                    </button>
                  ))}
                </div>
                <RunInputForm kind={meta.input_kind} value={input} onChange={setInput} placeholder={meta.input_placeholder} showImage={hasImage} compact />
                {Object.keys(meta.sample_input ?? {}).length > 0 && (
                  <button className="mt-2 text-xs text-brand hover:underline" onClick={() => setInput({ ...meta.sample_input })}>
                    Use sample input
                  </button>
                )}
              </div>
              <div className="rounded-xl border border-border p-4">
                <CostMeter estimate={estimate} budget={budget} left={status.data?.account?.total_searches_left} mode={me.data?.workspace.mode} />
              </div>
              <div>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-subtle">Cost by agent</div>
                <div className="space-y-1">
                  {nodes.map((n) => (
                    <button key={n.id} onClick={() => setSelected(n.id)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-surface-2">
                      <span className="size-1.5 rounded-full" style={{ background: CATEGORY_STYLE[n.data.category]?.accent }} />
                      <span className="flex-1 truncate">{n.data.title}</span>
                      <span className="tabular text-xs text-muted">{estimate?.per_node[n.id] ?? 0}</span>
                    </button>
                  ))}
                </div>
              </div>
              <Field label="Description">
                <Textarea rows={3} value={meta.description} onChange={(e) => setMeta((m) => ({ ...m, description: e.target.value }))} placeholder="What does this workflow check?" />
              </Field>
              {problems.length > 0 && (
                <div className="space-y-1 rounded-lg border border-bad-line bg-bad-soft p-3 text-xs text-bad">
                  {problems.map((p) => (
                    <div key={p} className="flex gap-2">
                      <AlertTriangle className="size-3.5 shrink-0" /> {p}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </aside>
      </div>

      <ApproveDialog
        open={approveOpen}
        onOpenChange={setApproveOpen}
        meta={meta}
        estimate={estimate}
        problems={problems}
        input={normalizeInput(input, meta.input_kind)}
        onRun={run}
        running={running}
        agentsCount={nodes.length}
      />
      <WatchDialog open={watchOpen} onOpenChange={setWatchOpen} workflow={watchOpen ? toWorkflow() : null} input={normalizeInput(input, meta.input_kind)} defaultName={meta.name} />
    </div>
  );
}

export function StudioPage() {
  return (
    <ReactFlowProvider>
      <StudioInner />
    </ReactFlowProvider>
  );
}
