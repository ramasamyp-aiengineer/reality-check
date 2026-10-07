import { Link, useNavigate } from "@tanstack/react-router";
import { Activity, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { DecisionBadge, ModeBadge, PageHeader, RunStatusBadge } from "@/components/domain";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/overlays";
import { Card, EmptyState, Input, Skeleton } from "@/components/ui/primitives";
import { useRuns } from "@/lib/queries";
import { cn, formatDateTime, timeAgo } from "@/lib/utils";

export function RunsPage() {
  const runs = useRuns(200);
  const navigate = useNavigate();
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const list = useMemo(
    () =>
      (runs.data ?? []).filter((r) => {
        if (filter === "contradicted" && r.verdict_status !== "CONTRADICTED") return false;
        if (filter === "corroborated" && r.verdict_status !== "CORROBORATED") return false;
        if (filter === "watch" && !r.watch_id) return false;
        if (filter === "failed" && r.status !== "failed") return false;
        const hay = `${r.workflow_name} ${r.input?.text ?? ""} ${JSON.stringify(r.input?.profile ?? {})}`.toLowerCase();
        return !q || hay.includes(q.toLowerCase());
      }),
    [runs.data, filter, q],
  );

  return (
    <div>
      <PageHeader
        title="Runs"
        description="Every approved run, with its verdict, the searches it spent and a link to the full evidence."
        actions={
          <Button onClick={() => navigate({ to: "/studio" })}>
            <Plus /> New run
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Tabs value={filter} onValueChange={setFilter}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="contradicted">Contradicted</TabsTrigger>
            <TabsTrigger value="corroborated">Corroborated</TabsTrigger>
            <TabsTrigger value="watch">From watches</TabsTrigger>
            <TabsTrigger value="failed">Failed</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative ml-auto w-full max-w-xs">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search runs" className="pl-9" />
        </div>
      </div>
      {runs.isLoading ? (
        <Skeleton className="h-96 w-full rounded-xl" />
      ) : list.length === 0 ? (
        <EmptyState icon={<Activity />} title="No runs here yet" body="Approve a workflow in the Studio to create your first run." />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead className="border-b border-border bg-surface-2/50 text-[11px] uppercase tracking-wider text-subtle">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Workflow</th>
                  <th className="px-4 py-2.5 font-semibold">Result</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Confidence</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Searches</th>
                  <th className="px-4 py-2.5 font-semibold">Mode</th>
                  <th className="px-4 py-2.5 text-right font-semibold">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {list.map((r) => (
                  <tr key={r.id} className="cursor-pointer transition-colors hover:bg-surface-2/60" onClick={() => navigate({ to: "/runs/$runId", params: { runId: r.id } })}>
                    <td className="max-w-md px-4 py-3">
                      <Link to="/runs/$runId" params={{ runId: r.id }} className="font-medium hover:text-brand" onClick={(e) => e.stopPropagation()}>
                        {r.workflow_name}
                      </Link>
                      <div className="truncate text-xs text-subtle">{r.input?.text || [r.input?.profile?.business_name, r.input?.profile?.topic].filter(Boolean).join(" · ")}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        <RunStatusBadge run={r} />
                        {r.decision && <DecisionBadge decision={r.decision} />}
                      </div>
                    </td>
                    <td className={cn("px-4 py-3 text-right tabular", r.confidence == null && "text-subtle")}>{r.confidence ?? "-"}</td>
                    <td className="px-4 py-3 text-right tabular">
                      {r.paid_searches ?? 0}
                      <span className="text-subtle"> / {r.total_calls ?? 0}</span>
                    </td>
                    <td className="px-4 py-3">
                      <ModeBadge mode={r.mode} />
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-muted" title={formatDateTime(r.created_at)}>
                      {timeAgo(r.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
