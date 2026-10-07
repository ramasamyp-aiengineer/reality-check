import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  CircleDot,
  Database,
  Download,
  FileSearch,
  Loader2,
  Network,
  Play,
  Presentation,
  Radar,
  Receipt as ReceiptIcon,
  RotateCcw,
  Scale,
  Search,
  Sparkles,
  Timer,
  XCircle,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { DecisionBadge, EngineChip, EvidenceCard, ModeBadge, RunStatusBadge } from "@/components/domain";
import { agentMap, WorkflowCanvas } from "@/components/flow/WorkflowCanvas";
import { AdStudio } from "@/components/report/AdStudio";
import { EvidenceGraph } from "@/components/report/EvidenceGraph";
import { MarketBriefView } from "@/components/report/MarketBriefView";
import { ReceiptView } from "@/components/report/ReceiptView";
import { VerdictReport } from "@/components/report/VerdictReport";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/overlays";
import { Badge, EmptyState, Skeleton } from "@/components/ui/primitives";
import { WatchDialog } from "@/components/WatchDialog";
import { engineMeta } from "@/lib/icons";
import { keys, useAgents, useRun } from "@/lib/queries";
import { useRunStream, type NodeLive } from "@/lib/sse";
import type { RunEvent } from "@/lib/types";
import { cn, formatMs } from "@/lib/utils";

function Elapsed({ start, end }: { start?: number; end?: number }) {
  const [now, setNow] = useState(Date.now() / 1000);
  useEffect(() => {
    if (end) return;
    const id = window.setInterval(() => setNow(Date.now() / 1000), 200);
    return () => window.clearInterval(id);
  }, [end]);
  if (!start) return <span className="tabular">0.0s</span>;
  return <span className="tabular">{((end ?? now) - start).toFixed(1)}s</span>;
}

function eventLine(e: RunEvent, titles: Record<string, string>): { icon: React.ReactNode; text: React.ReactNode; tone?: string } | null {
  const t = (id: string) => titles[id] ?? id;
  switch (e.type) {
    case "run_started":
      return { icon: <Play className="size-3.5 text-brand" />, text: <>Run approved · {e.order.length} agents · ~{e.estimate.total} searches</> };
    case "node_started":
      return { icon: <CircleDot className="size-3.5 text-brand" />, text: <><b>{t(e.node_id)}</b> started</> };
    case "search": {
      const m = engineMeta(e.engine);
      const Icon = m.icon;
      return { icon: <Icon className="size-3.5" style={{ color: m.color }} />, text: <><span className="text-muted">{t(e.node_id)}:</span> {e.message}</> };
    }
    case "node_progress":
      return { icon: <Loader2 className="size-3.5 text-subtle" />, text: <><span className="text-muted">{t(e.node_id)}:</span> {e.message}</> };
    case "evidence":
      return { icon: <Database className="size-3.5 text-ok" />, text: <><b>{e.items.length}</b> evidence items from {t(e.node_id)}</> };
    case "node_completed":
      return { icon: <CheckCircle2 className="size-3.5 text-ok" />, text: <><b>{t(e.node_id)}</b> · {e.summary} <span className="text-subtle">({formatMs(e.ms)})</span></>, tone: "ok" };
    case "node_failed":
      return { icon: <XCircle className="size-3.5 text-bad" />, text: <><b>{t(e.node_id)}</b> failed: {e.error}</>, tone: "bad" };
    case "run_completed":
      return { icon: <Sparkles className="size-3.5 text-brand" />, text: <>Run complete · {e.receipt.total_calls} calls, {e.receipt.paid_searches} paid</>, tone: "brand" };
    case "run_failed":
      return { icon: <AlertTriangle className="size-3.5 text-bad" />, text: <>Run failed: {e.error}</>, tone: "bad" };
  }
}

function Timeline({ events, titles }: { events: RunEvent[]; titles: Record<string, string> }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: "smooth" });
  }, [events.length]);
  const start = events[0]?.ts ?? 0;
  return (
    <div ref={ref} className="h-full space-y-0.5 overflow-y-auto p-3">
      <AnimatePresence initial={false}>
        {events.map((e) => {
          const line = eventLine(e, titles);
          if (!line) return null;
          return (
            <motion.div key={e.seq} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} className="flex items-start gap-2 rounded-md px-2 py-1 text-[12px] leading-snug hover:bg-surface-2">
              <span className="mt-0.5 shrink-0">{line.icon}</span>
              <span className="flex-1">{line.text}</span>
              <span className="shrink-0 tabular text-[10px] text-subtle">+{(e.ts - start).toFixed(1)}s</span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

export function RunPage() {
  const { runId } = useParams({ strict: false }) as { runId: string };
  const search = useSearch({ strict: false }) as { tab?: string };
  const navigate = useNavigate();
  const qc = useQueryClient();
  const run = useRun(runId);
  const live = useRunStream(runId);
  const agentsQ = useAgents();
  const agents = useMemo(() => agentMap(agentsQ.data), [agentsQ.data]);
  const [side, setSide] = useState<"timeline" | "evidence">("timeline");
  const [watchOpen, setWatchOpen] = useState(false);
  const [tab, setTab] = useState<string | undefined>(search.tab);
  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (live.finished) void qc.invalidateQueries({ queryKey: keys.run(runId) });
  }, [live.finished, qc, runId]);

  const detail = run.data;
  const result = detail?.result;
  const wf = detail?.workflow;

  const nodeLive: Record<string, NodeLive> | undefined = useMemo(() => {
    if (Object.keys(live.nodes).length) return live.nodes;
    if (!result) return undefined;
    const out: Record<string, NodeLive> = {};
    Object.entries(result.node_status).forEach(([id, st]) => {
      out[id] = { state: st as NodeLive["state"], summary: result.node_summaries[id]?.summary, searches: 0, evidence: 0, engines: [] };
    });
    return out;
  }, [live.nodes, result]);

  const titles = useMemo(() => {
    const out: Record<string, string> = {};
    wf?.nodes.forEach((n) => (out[n.id] = n.label || agents[n.agent]?.title || n.agent));
    return out;
  }, [wf, agents]);

  const tabs = useMemo(() => {
    const t: { id: string; label: string; icon: React.ElementType }[] = [];
    if (result?.verdict) t.push({ id: "verdict", label: "Verdict", icon: Scale });
    if (result?.market_brief) t.push({ id: "brief", label: "Market brief", icon: Presentation });
    if (result?.ad_pack) t.push({ id: "ads", label: "Ad studio", icon: Sparkles });
    if (result) {
      t.push({ id: "graph", label: "Evidence graph", icon: Network });
      t.push({ id: "evidence", label: `Evidence (${result.evidence.length})`, icon: FileSearch });
      t.push({ id: "receipt", label: "Receipt", icon: ReceiptIcon });
    }
    return t;
  }, [result]);

  const justFinished = useRef(false);
  const watchedLive = useRef(false);
  if (!live.finished && live.events.length > 0) watchedLive.current = true;
  useEffect(() => {
    if (live.finished && result && !justFinished.current) {
      justFinished.current = true;
      if (!tab && tabs[0]) setTab(tabs[0].id);
      const recent = live.endedAt != null && Date.now() / 1000 - live.endedAt < 5;
      if (live.events.length > 3 && (watchedLive.current || recent) && window.scrollY < 80) {
        window.setTimeout(() => reportRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 700);
      }
    }
  }, [live.finished, result, tab, tabs, live.events.length, live.endedAt]);

  if (run.isLoading || !detail || !wf) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-10 w-80" />
        <Skeleton className="h-[420px] w-full rounded-xl" />
      </div>
    );
  }

  const status = live.finished || !live.connected ? detail.status : "running";
  const running = !live.finished && ["queued", "running"].includes(detail.status);
  const searches = live.searches.length || result?.receipt.total_calls || 0;
  const evidenceCount = live.evidence.length || result?.evidence.length || 0;
  const doneNodes = Object.values(nodeLive ?? {}).filter((n) => n.state === "done" || n.state === "failed").length;
  const totalNodes = wf.nodes.length;
  const currentTab = tab ?? tabs[0]?.id;

  return (
    <div className="pb-12">
      <div className="z-10 flex flex-wrap lg:sticky lg:top-14 items-center gap-3 border-b border-border bg-background/90 px-4 py-3 backdrop-blur md:px-6">
        <Button variant="ghost" size="icon-sm" asChild>
          <Link to="/runs" aria-label="Back to runs">
            <ArrowLeft />
          </Link>
        </Button>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-[17px] font-semibold tracking-tight">{detail.workflow_name}</h1>
            {running ? (
              <Badge tone="brand">
                <Loader2 className="animate-spin" /> Running
              </Badge>
            ) : (
              <RunStatusBadge run={{ status: status as typeof detail.status, verdict_status: detail.verdict_status }} />
            )}
            {detail.decision && <DecisionBadge decision={detail.decision} />}
            <ModeBadge mode={detail.mode} />
          </div>
          <div className="mt-0.5 truncate text-xs text-subtle">
            {detail.input?.text?.slice(0, 140) || [detail.input?.profile?.business_name, detail.input?.profile?.topic, detail.input?.profile?.city].filter(Boolean).join(" · ")}
          </div>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-4 text-xs text-muted">
          <span className="inline-flex items-center gap-1.5">
            <Timer className="size-3.5" /> <Elapsed start={live.startedAt ?? detail.created_at} end={live.endedAt ?? detail.finished_at ?? undefined} />
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Activity className="size-3.5" /> <span className="tabular text-foreground">{doneNodes}/{totalNodes}</span> agents
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Search className="size-3.5" /> <span className="tabular text-foreground">{searches}</span>/{detail.estimate ?? "?"} searches
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Database className="size-3.5" /> <span className="tabular text-foreground">{evidenceCount}</span> evidence
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setWatchOpen(true)} disabled={!result}>
              <Radar /> Watch
            </Button>
            <Button variant="secondary" size="sm" asChild disabled={!result}>
              <a href={result ? `/api/runs/${runId}/report.pdf` : undefined} aria-disabled={!result}>
                <Download /> PDF
              </a>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/studio", search: { template: wf.id.startsWith("try_") ? undefined : wf.id } })}>
              <RotateCcw /> Re-run
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-0 border-b border-border lg:grid-cols-[1fr_380px]">
        <div className="relative h-[440px] bg-surface-2/30">
          <div className="absolute left-4 top-3 z-10 text-[11px] font-semibold uppercase tracking-wider text-subtle">{running ? "Live run" : "Workflow"}</div>
          <WorkflowCanvas workflow={wf} agents={agents} live={nodeLive} />
          {running && (
            <div className="absolute bottom-0 left-0 right-0 h-1 overflow-hidden bg-surface-3">
              <motion.div className="h-full bg-brand" animate={{ width: `${(doneNodes / Math.max(1, totalNodes)) * 100}%` }} transition={{ duration: 0.5 }} />
            </div>
          )}
        </div>
        <div className="flex h-[440px] flex-col border-l border-border bg-surface">
          <div className="flex items-center gap-1 border-b border-border p-2">
            {(["timeline", "evidence"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSide(s)}
                className={cn("rounded-md px-3 py-1.5 text-[12.5px] font-medium capitalize", side === s ? "bg-surface-2 text-foreground" : "text-muted hover:text-foreground")}
              >
                {s === "timeline" ? "Event timeline" : `Evidence stream (${evidenceCount})`}
              </button>
            ))}
            {running && <span className="ml-auto mr-2 size-2 animate-pulse rounded-full bg-brand" />}
          </div>
          <div className="min-h-0 flex-1">
            {side === "timeline" ? (
              <Timeline events={live.events} titles={titles} />
            ) : (
              <div className="h-full space-y-2 overflow-y-auto p-3">
                <AnimatePresence initial={false}>
                  {(live.evidence.length ? live.evidence : result?.evidence ?? []).slice(0, 80).map((ev) => (
                    <motion.div key={ev.id} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
                      <EvidenceCard ev={ev} compact />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>
          {(live.receipt || result?.receipt) && (
            <div className="flex flex-wrap gap-1 border-t border-border p-2.5">
              {Object.entries((live.receipt ?? result?.receipt)!.engines).map(([e, n]) => (
                <EngineChip key={e} engine={e} count={n} />
              ))}
            </div>
          )}
        </div>
      </div>

      <div ref={reportRef} className="mx-auto max-w-[1400px] scroll-mt-28 px-4 pt-6 md:px-8">
        {detail.status === "failed" || live.failed ? (
          <EmptyState icon={<AlertTriangle />} title="The run failed" body={live.failed || detail.error || "Unknown error"} />
        ) : !result ? (
          <div className="grid place-items-center py-16 text-center">
            <Loader2 className="size-6 animate-spin text-brand" />
            <div className="mt-3 text-sm font-medium">Agents are gathering evidence</div>
            <div className="mt-1 text-xs text-muted">Independent agents run in parallel. The report appears here when the run completes.</div>
          </div>
        ) : (
          <Tabs value={currentTab} onValueChange={setTab}>
            <TabsList className="mb-5">
              {tabs.map((t) => (
                <TabsTrigger key={t.id} value={t.id}>
                  <t.icon /> {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
            {result.verdict && (
              <TabsContent value="verdict">
                <VerdictReport run={detail} verdict={result.verdict} onWatch={() => setWatchOpen(true)} />
              </TabsContent>
            )}
            {result.market_brief && (
              <TabsContent value="brief">
                <MarketBriefView run={detail} brief={result.market_brief} />
              </TabsContent>
            )}
            {result.ad_pack && (
              <TabsContent value="ads">
                <AdStudio run={detail} pack={result.ad_pack} />
              </TabsContent>
            )}
            <TabsContent value="graph">
              <EvidenceGraph nodes={result.graph.nodes} edges={result.graph.edges} />
            </TabsContent>
            <TabsContent value="evidence">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {result.evidence.map((ev) => (
                  <EvidenceCard key={ev.id} ev={ev} />
                ))}
              </div>
              <div className="mt-4">
                <Button variant="secondary" size="sm" onClick={() => navigate({ to: "/evidence", search: { run: runId } })}>
                  <FileSearch /> Open in evidence explorer
                </Button>
              </div>
            </TabsContent>
            <TabsContent value="receipt">
              <ReceiptView receipt={result.receipt} />
            </TabsContent>
          </Tabs>
        )}
      </div>

      <WatchDialog open={watchOpen} onOpenChange={setWatchOpen} workflow={wf} input={detail.input} defaultName={`${detail.workflow_name} watch`} />
    </div>
  );
}
