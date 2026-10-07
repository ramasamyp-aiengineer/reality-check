import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Library, Play, Plus, Search, Sparkles, Star, Trash2, Workflow as WorkflowIcon } from "lucide-react";
import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { EngineChip, PageHeader } from "@/components/domain";
import { agentMap, WorkflowCanvas } from "@/components/flow/WorkflowCanvas";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, Tip } from "@/components/ui/overlays";
import { Badge, EmptyState, Input, Skeleton } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { agentIcon } from "@/lib/icons";
import { keys, useAgents, useWorkflows } from "@/lib/queries";
import type { AgentSpec, Workflow } from "@/lib/types";
import { humanize } from "@/lib/utils";

function WorkflowCard({ wf, agents, index }: { wf: Workflow; agents: Record<string, AgentSpec>; index: number }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const engines = Object.entries(wf.estimate?.engines ?? {});
  const remove = async () => {
    await api.del(`/workflows/${wf.id}`);
    toast.success("Workflow deleted");
    await qc.invalidateQueries({ queryKey: keys.workflows });
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 10) * 0.035 }}
      className="group flex flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-card transition-colors hover:border-border-strong"
    >
      <div className="relative h-36 border-b border-border bg-surface-2/50">
        <WorkflowCanvas workflow={wf} agents={agents} variant="mini" />
        <div className="absolute left-3 top-3 flex gap-1.5">
          {wf.featured && (
            <Badge tone="brand">
              <Star /> Featured
            </Badge>
          )}
          {wf.source === "saved" && <Badge>Saved</Badge>}
        </div>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-[15px] font-semibold tracking-tight">{wf.name}</h3>
          <Badge className="shrink-0 capitalize">{humanize(wf.category)}</Badge>
        </div>
        <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-muted">{wf.description}</p>
        <div className="mt-3 flex flex-wrap gap-1">
          {wf.nodes
            .filter((n) => !["intent"].includes(n.agent))
            .map((n) => {
              const spec = agents[n.agent];
              const Icon = agentIcon(spec?.icon);
              return (
                <Tip key={n.id} content={spec?.description}>
                  <span className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted">
                    <Icon className="size-3" /> {spec?.title ?? n.agent}
                  </span>
                </Tip>
              );
            })}
        </div>
        <div className="mt-3 flex flex-wrap gap-1">
          {engines.slice(0, 4).map(([e, n]) => (
            <EngineChip key={e} engine={e} count={n} />
          ))}
          {engines.length > 4 && <span className="text-[11px] text-subtle">+{engines.length - 4}</span>}
        </div>
        <div className="mt-auto flex items-center gap-2 pt-4">
          <div className="mr-auto text-xs text-muted">
            <span className="text-base font-semibold tabular text-foreground">~{wf.estimate?.total ?? 0}</span> searches
          </div>
          {wf.source === "saved" && (
            <Button variant="ghost" size="icon-sm" onClick={remove} aria-label="Delete workflow">
              <Trash2 />
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={() => navigate({ to: "/studio", search: { template: wf.id } })}>
            <WorkflowIcon /> Open
          </Button>
          <Button size="sm" onClick={() => navigate({ to: "/studio", search: { template: wf.id, sample: 1 } })}>
            <Play /> Sample
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

export function LibraryPage() {
  const workflows = useWorkflows();
  const agentsQ = useAgents();
  const navigate = useNavigate();
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");
  const agents = useMemo(() => agentMap(agentsQ.data), [agentsQ.data]);
  const list = useMemo(() => {
    const all = [...(workflows.data?.saved ?? []), ...(workflows.data?.templates ?? [])];
    return all.filter((w) => {
      if (tab === "saved" && w.source !== "saved") return false;
      if (tab !== "all" && tab !== "saved" && w.category !== tab) return false;
      if (q && !`${w.name} ${w.description} ${w.tags.join(" ")}`.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [workflows.data, tab, q]);
  const categories = Array.from(new Set((workflows.data?.templates ?? []).map((w) => w.category)));

  return (
    <div>
      <PageHeader
        title="Workflow library"
        description="Ready-made agent graphs for trust checks and market intelligence. Open one to inspect and customise it, or run it on sample input."
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate({ to: "/studio", search: { ai: 1 } })}>
              <Sparkles /> Build with AI
            </Button>
            <Button onClick={() => navigate({ to: "/studio" })}>
              <Plus /> New workflow
            </Button>
          </>
        }
      />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            {categories.map((c) => (
              <TabsTrigger key={c} value={c} className="capitalize">
                {humanize(c)}
              </TabsTrigger>
            ))}
            <TabsTrigger value="saved">Saved</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative ml-auto w-full max-w-xs">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter workflows" className="pl-9" />
        </div>
      </div>
      {workflows.isLoading ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-80 rounded-xl" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <EmptyState icon={<Library />} title="No workflows match" body="Try another filter, or build a new workflow in the Studio." />
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {list.map((wf, i) => (
            <WorkflowCard key={`${wf.source}-${wf.id}`} wf={wf} agents={agents} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
