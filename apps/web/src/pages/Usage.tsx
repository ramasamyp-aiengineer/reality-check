import { Link } from "@tanstack/react-router";
import { Coins, Gauge, PiggyBank, Receipt as ReceiptIcon, Search, Workflow as WorkflowIcon } from "lucide-react";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ModeBadge, PageHeader, RunStatusBadge } from "@/components/domain";
import { Select } from "@/components/ui/overlays";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Progress, Skeleton, Stat } from "@/components/ui/primitives";
import { engineMeta } from "@/lib/icons";
import { useKeyStatus, useMe, useUsage } from "@/lib/queries";
import { formatNumber, timeAgo } from "@/lib/utils";

const tooltip = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12 };
const tick = { fill: "var(--subtle)", fontSize: 11 };

export function UsagePage() {
  const [days, setDays] = useState("30");
  const usage = useUsage(Number(days));
  const me = useMe();
  const key = useKeyStatus();
  const u = usage.data;
  const monthly = me.data?.workspace.monthly_budget ?? 0;
  const acct = key.data?.account;
  const savedPct = u && u.totals.calls ? Math.round((u.totals.saved / u.totals.calls) * 100) : 0;

  return (
    <div>
      <PageHeader
        title="Usage & receipts"
        description="Every search is counted before and after it runs. Cache hits and replays are free; only paid SerpApi calls count against your plan."
        actions={<Select value={days} onValueChange={setDays} className="w-36" options={[{ value: "7", label: "Last 7 days" }, { value: "30", label: "Last 30 days" }, { value: "90", label: "Last 90 days" }]} />}
      />
      {usage.isLoading || !u ? (
        <Skeleton className="h-96 w-full rounded-xl" />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Stat label="Runs" value={formatNumber(u.totals.runs)} icon={<WorkflowIcon />} />
            <Stat label="Engine calls" value={formatNumber(u.totals.calls)} icon={<Search />} />
            <Stat label="Paid searches" value={formatNumber(u.totals.paid)} tone="brand" icon={<Coins />} />
            <Stat label="Saved by cache" value={formatNumber(u.totals.saved)} tone="ok" sub={`${savedPct}% of calls were free`} icon={<PiggyBank />} />
            <Stat label="Avg per run" value={u.totals.runs ? (u.totals.paid / u.totals.runs).toFixed(1) : "-"} sub="paid searches" icon={<Gauge />} />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <div>
                  <CardTitle>Searches per day</CardTitle>
                  <CardDescription>Paid SerpApi searches versus free cache and replay hits.</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={u.by_day} margin={{ left: -20, right: 8, top: 8 }}>
                    <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="day" tick={tick} tickLine={false} axisLine={false} tickFormatter={(d: string) => d.slice(5)} />
                    <YAxis tick={tick} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={tooltip} cursor={{ fill: "var(--surface-2)" }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="paid" name="Paid" stackId="a" fill="var(--brand)" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="cached" name="Cached / replayed" stackId="a" fill="var(--ok)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Budget</CardTitle>
                  <CardDescription>Workspace guardrails and your SerpApi plan.</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                <div>
                  <div className="mb-1.5 flex justify-between text-xs">
                    <span className="text-muted">Workspace monthly budget</span>
                    <span className="tabular">
                      {formatNumber(u.totals.paid)} / {formatNumber(monthly)}
                    </span>
                  </div>
                  <Progress value={monthly ? Math.min(100, (u.totals.paid / monthly) * 100) : 0} tone={monthly && u.totals.paid / monthly > 0.8 ? "warn" : "brand"} />
                </div>
                <div>
                  <div className="mb-1.5 flex justify-between text-xs">
                    <span className="text-muted">Per-run cap</span>
                    <span className="tabular">{me.data?.workspace.run_budget ?? "-"} searches</span>
                  </div>
                </div>
                {acct ? (
                  <div className="space-y-2 rounded-xl border border-border bg-surface-2 p-3 text-xs">
                    <div className="font-medium">{acct.plan_name ?? "SerpApi plan"}</div>
                    <div className="flex justify-between">
                      <span className="text-muted">Searches left</span>
                      <span className="tabular">{formatNumber(acct.total_searches_left)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted">Used this month</span>
                      <span className="tabular">
                        {formatNumber(acct.this_month_usage)} / {formatNumber(acct.searches_per_month)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted">Last hour</span>
                      <span className="tabular">
                        {formatNumber(acct.last_hour_searches)} / {formatNumber(acct.rate_limit_per_hour)}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted">
                    {key.data?.mode === "demo" ? "Demo mode replays recorded responses and spends nothing." : "Connect a key to see your plan."}{" "}
                    <Link to="/connect" className="text-brand hover:underline">
                      Key settings
                    </Link>
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>By engine</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {u.by_engine.length === 0 && <p className="text-sm text-subtle">No engine calls yet.</p>}
                {u.by_engine.map((e) => {
                  const m = engineMeta(e.engine);
                  const Icon = m.icon;
                  const max = u.by_engine[0]?.calls || 1;
                  return (
                    <div key={e.engine} className="flex items-center gap-3 text-[13px]">
                      <Icon className="size-4 shrink-0" style={{ color: m.color }} />
                      <span className="w-40 truncate">{m.label}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                        <div className="h-full rounded-full" style={{ width: `${(e.calls / max) * 100}%`, background: m.color }} />
                      </div>
                      <span className="w-10 text-right tabular text-muted">{e.calls}</span>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>By workflow</CardTitle>
              </CardHeader>
              <CardContent>
                <table className="w-full text-left text-[13px]">
                  <thead className="text-[11px] uppercase tracking-wider text-subtle">
                    <tr className="border-b border-border">
                      <th className="py-2 font-semibold">Workflow</th>
                      <th className="py-2 text-right font-semibold">Runs</th>
                      <th className="py-2 text-right font-semibold">Calls</th>
                      <th className="py-2 text-right font-semibold">Paid</th>
                      <th className="py-2 text-right font-semibold">Paid / run</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {u.by_workflow.map((w) => (
                      <tr key={w.workflow}>
                        <td className="max-w-[220px] truncate py-2">{w.workflow}</td>
                        <td className="py-2 text-right tabular">{w.runs}</td>
                        <td className="py-2 text-right tabular">{w.calls}</td>
                        <td className="py-2 text-right tabular">{w.paid}</td>
                        <td className="py-2 text-right tabular text-muted">{(w.paid / Math.max(1, w.runs)).toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <ReceiptIcon className="size-4 text-brand" /> Recent receipts
                </CardTitle>
                <CardDescription>Estimated before approval versus what the run actually spent.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead className="text-[11px] uppercase tracking-wider text-subtle">
                  <tr className="border-b border-border">
                    <th className="py-2 font-semibold">Run</th>
                    <th className="py-2 font-semibold">Result</th>
                    <th className="py-2 text-right font-semibold">Estimate</th>
                    <th className="py-2 text-right font-semibold">Calls</th>
                    <th className="py-2 text-right font-semibold">Paid</th>
                    <th className="py-2 text-right font-semibold">Cached</th>
                    <th className="py-2 pl-4 font-semibold">Mode</th>
                    <th className="py-2 text-right font-semibold">When</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {u.recent.map((r) => (
                    <tr key={r.id} className="hover:bg-surface-2/50">
                      <td className="py-2">
                        <Link to="/runs/$runId" params={{ runId: r.id }} search={{ tab: "receipt" }} className="font-medium hover:text-brand">
                          {r.workflow_name}
                        </Link>
                      </td>
                      <td className="py-2">
                        <RunStatusBadge run={r} />
                      </td>
                      <td className="py-2 text-right tabular text-muted">~{r.estimate ?? "-"}</td>
                      <td className="py-2 text-right tabular">{r.total_calls ?? 0}</td>
                      <td className="py-2 text-right tabular">{r.paid_searches ?? 0}</td>
                      <td className="py-2 text-right tabular text-ok">{r.cache_hits ?? 0}</td>
                      <td className="py-2 pl-4">
                        <ModeBadge mode={r.mode} />
                      </td>
                      <td className="py-2 text-right text-xs text-muted">{timeAgo(r.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
