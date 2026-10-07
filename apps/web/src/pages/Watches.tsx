import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, BellRing, Clock, Mail, MoreHorizontal, Play, Plus, Radar, Send, Trash2 } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/domain";
import { Button } from "@/components/ui/button";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger, Select } from "@/components/ui/overlays";
import { Badge, Card, EmptyState, Skeleton, Switch } from "@/components/ui/primitives";
import { api, ApiError } from "@/lib/api";
import { keys, useWatches } from "@/lib/queries";
import type { Watch, WatchChange } from "@/lib/types";
import { cn, formatDateTime, timeAgo, timeUntil } from "@/lib/utils";

const INTERVALS = [
  { value: "60", label: "Hourly" },
  { value: "360", label: "Every 6 hours" },
  { value: "1440", label: "Daily" },
  { value: "10080", label: "Weekly" },
];

function fmt(v: unknown): string {
  if (v == null) return "none";
  if (typeof v === "number") return Number.isInteger(v) ? v.toLocaleString("en-IN") : v.toFixed(2);
  return String(v).replace(/_/g, " ");
}

function ChangeLine({ c }: { c: WatchChange }) {
  if (c.added?.length) {
    return (
      <div className="text-[12.5px]">
        <span className="font-medium">{c.label}:</span> <span className="text-ok">+{c.added.length} new</span>
        <span className="text-muted"> · {c.added.slice(0, 3).join(", ")}{c.added.length > 3 ? "…" : ""}</span>
      </div>
    );
  }
  const up = typeof c.before === "number" && typeof c.after === "number" ? c.after > c.before : null;
  return (
    <div className="text-[12.5px]">
      <span className="font-medium">{c.label}:</span> <span className="text-muted line-through decoration-subtle">{fmt(c.before)}</span>{" "}
      <ArrowRight className="inline size-3 text-subtle" /> <span className={cn("font-medium", up === true && "text-ok", up === false && "text-bad")}>{fmt(c.after)}</span>
    </div>
  );
}

function WatchCard({ w }: { w: Watch }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: keys.watches });

  const patch = async (body: Partial<{ active: boolean; interval_minutes: number; channels: string[] }>) => {
    try {
      await api.patch(`/watches/${w.id}`, body);
      await refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not update the watch");
    }
  };
  const runNow = async () => {
    setBusy(true);
    try {
      const r = await api.post<{ run_id: string }>(`/watches/${w.id}/run`);
      await refresh();
      toast.success("Watch run started");
      navigate({ to: "/runs/$runId", params: { runId: r.run_id } });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not start the run");
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    try {
      await api.del(`/watches/${w.id}`);
      await refresh();
      toast.success("Watch deleted");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not delete the watch");
    }
  };
  const toggleChannel = (ch: string) => patch({ channels: w.channels.includes(ch) ? w.channels.filter((c) => c !== ch) : [...w.channels, ch] });
  const changed = w.history.filter((h) => h.changes.length > 0);

  return (
    <Card className={cn("overflow-hidden transition-opacity", !w.active && "opacity-70")}>
      <div className="flex flex-wrap items-start gap-4 border-b border-border p-5">
        <div className={cn("grid size-10 place-items-center rounded-xl", w.active ? "bg-brand-soft text-brand" : "bg-surface-2 text-subtle")}>
          <Radar className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-semibold">{w.name}</h3>
            {w.active ? <Badge tone="ok">Active</Badge> : <Badge>Paused</Badge>}
          </div>
          <div className="mt-0.5 truncate text-xs text-muted">
            {w.workflow_name} · {w.input?.text?.slice(0, 80) || [w.input?.profile?.business_name, w.input?.profile?.topic].filter(Boolean).join(" · ")}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-subtle">
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3" /> Last {timeAgo(w.last_run_at)}
            </span>
            <span>Next {w.active ? timeUntil(w.next_run_at) : "paused"}</span>
            {w.last_run_id && (
              <Link to="/runs/$runId" params={{ runId: w.last_run_id }} className="text-brand hover:underline">
                Latest run
              </Link>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(w.interval_minutes)} onValueChange={(v) => patch({ interval_minutes: Number(v) })} className="w-36" options={INTERVALS.some((i) => i.value === String(w.interval_minutes)) ? INTERVALS : [...INTERVALS, { value: String(w.interval_minutes), label: `Every ${w.interval_minutes} min` }]} />
          <Switch checked={w.active} onCheckedChange={(v) => patch({ active: v })} aria-label="Active" />
          <Button variant="secondary" size="sm" onClick={runNow} loading={busy}>
            <Play /> Run now
          </Button>
          <Menu>
            <MenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="More">
                <MoreHorizontal />
              </Button>
            </MenuTrigger>
            <MenuContent>
              <MenuItem onSelect={() => toggleChannel("telegram")}>
                <Send /> {w.channels.includes("telegram") ? "Turn off Telegram" : "Alert on Telegram"}
              </MenuItem>
              <MenuItem onSelect={() => toggleChannel("email")}>
                <Mail /> {w.channels.includes("email") ? "Turn off email" : "Alert by email"}
              </MenuItem>
              <MenuSeparator />
              <MenuItem onSelect={remove} className="text-bad">
                <Trash2 /> Delete watch
              </MenuItem>
            </MenuContent>
          </Menu>
        </div>
      </div>
      <div className="grid gap-6 p-5 md:grid-cols-[220px_1fr]">
        <div className="space-y-3 text-xs">
          <div>
            <div className="mb-1 font-semibold uppercase tracking-wider text-subtle">Alerts</div>
            <div className="flex flex-wrap gap-1.5">
              {w.channels.length === 0 && <span className="text-muted">In-app only</span>}
              {w.channels.includes("telegram") && (
                <Badge tone="brand">
                  <Send /> Telegram
                </Badge>
              )}
              {w.channels.includes("email") && (
                <Badge tone="brand">
                  <Mail /> Email
                </Badge>
              )}
            </div>
          </div>
          <div>
            <div className="mb-1 font-semibold uppercase tracking-wider text-subtle">History</div>
            <div className="text-muted">
              {w.history.length} snapshots · {changed.length} with changes
            </div>
            <div className="mt-2 flex h-6 items-end gap-0.5">
              {w.history
                .slice(0, 30)
                .reverse()
                .map((h) => (
                  <div key={h.id} title={formatDateTime(h.created_at)} className={cn("w-1.5 rounded-sm", h.changes.length ? "bg-warn" : "bg-surface-3")} style={{ height: `${Math.min(100, 30 + h.changes.length * 25)}%` }} />
                ))}
            </div>
          </div>
        </div>
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-subtle">What changed</div>
          {changed.length === 0 ? (
            <p className="text-[13px] text-muted">{w.history.length ? "No changes since the first snapshot. We'll alert you when something moves." : "The first run sets the baseline."}</p>
          ) : (
            <ol className="relative space-y-4 border-l border-border pl-5">
              {changed.slice(0, 6).map((h, i) => (
                <motion.li key={h.id} initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }} className="relative">
                  <span className="absolute -left-[25px] top-1 size-2.5 rounded-full border-2 border-surface bg-warn" />
                  <div className="mb-1 flex items-center gap-2 text-xs text-subtle">
                    {formatDateTime(h.created_at)}
                    <Link to="/runs/$runId" params={{ runId: h.run_id }} className="text-brand hover:underline">
                      view run
                    </Link>
                  </div>
                  <div className="space-y-0.5">
                    {h.changes.map((c) => (
                      <ChangeLine key={c.key} c={c} />
                    ))}
                  </div>
                </motion.li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </Card>
  );
}

export function WatchesPage() {
  const watches = useWatches();
  const navigate = useNavigate();
  return (
    <div>
      <PageHeader
        title="Watches"
        description="Re-run any workflow on a schedule and get alerted only when the evidence changes: new advertisers, price drops, fresh complaints, a verdict flip."
        actions={
          <Button onClick={() => navigate({ to: "/workflows" })}>
            <Plus /> New watch
          </Button>
        }
      />
      {watches.isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-48 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      ) : !watches.data?.length ? (
        <EmptyState
          icon={<BellRing />}
          title="No watches yet"
          body="Open any completed run and choose Watch this, or start one from a workflow in the Studio."
          action={
            <Button onClick={() => navigate({ to: "/studio", search: { template: "competitor_watch" } })}>
              <Radar /> Watch a market
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          {watches.data.map((w) => (
            <WatchCard key={w.id} w={w} />
          ))}
        </div>
      )}
    </div>
  );
}
