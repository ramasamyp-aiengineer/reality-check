import { Link, useNavigate } from "@tanstack/react-router";
import { Activity, ArrowRight, BellRing, Briefcase, CandlestickChart, Database, Image, Landmark, PhoneCall, Radar, ShieldAlert, ShoppingBag, Sparkles, Wallet } from "lucide-react";
import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BannerSlider } from "@/components/BannerSlider";
import { DecisionBadge, RunStatusBadge } from "@/components/domain";
import type { Slide } from "@/components/slides";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, Kbd, Skeleton, Stat, Textarea } from "@/components/ui/primitives";
import { useMe, useRuns, useUsage, useWatches } from "@/lib/queries";
import { cn, formatNumber, timeAgo } from "@/lib/utils";

const SAMPLES = [
  {
    label: "Loan forward",
    icon: Wallet,
    text: "Instant Personal Loan Rs 50,000 in 5 minutes! No CIBIL check, only Aadhaar & PAN. 100% approval. Download QuickRupee app now: https://bit.ly/quickrupee-loan Limited time offer! Call 9876543210",
  },
  {
    label: "Too-good deal",
    icon: ShoppingBag,
    text: "Mega Diwali sale! Apple iPhone 16 Pro 256GB at Rs 19,999 only. Order on https://iphone-sale-deals.shop before stock ends!",
  },
  {
    label: "Stock tip",
    icon: CandlestickChart,
    text: "Join Profit Kings Advisory for guaranteed returns of 30% a month! Today's multibagger: buy RELIANCE now. Pay Rs 4,999 to join our VIP group.",
  },
  {
    label: "Job offer",
    icon: Briefcase,
    text: "Work from home and earn Rs 3,000 daily! Part time data entry job with Zylo Global Solutions Pvt Ltd. Pay Rs 1,500 registration fee to start.",
  },
  {
    label: "Customer care",
    icon: PhoneCall,
    text: "NimbusPay Bank customer care toll free 1800-000-0000 for refund and KYC update. Share OTP with our executive to verify.",
  },
];

const DETECT: { re: RegExp; label: string; icon: React.ElementType }[] = [
  { re: /loan|cibil|emi|credit|lend/i, label: "Loan offer", icon: Landmark },
  { re: /stock|share|nse|bse|return|sebi|trading|crypto/i, label: "Investment tip", icon: CandlestickChart },
  { re: /job|hiring|salary|work from home|vacancy|registration fee/i, label: "Job offer", icon: Briefcase },
  { re: /rs\.?\s?\d|₹|price|offer|deal|sale/i, label: "Deal or price", icon: ShoppingBag },
  { re: /customer care|helpline|support number|refund/i, label: "Customer care", icon: PhoneCall },
  { re: /\.(png|jpe?g|webp)(\?|$)/i, label: "Image", icon: Image },
];

function CheckAnything() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const detected = useMemo(() => DETECT.filter((d) => d.re.test(text)).slice(0, 3), [text]);
  const isImage = /^https?:\/\/\S+\.(png|jpe?g|webp)(\?\S*)?$/i.test(text.trim());
  const plan = () => {
    const value = text.trim();
    if (!value) return;
    if (isImage) navigate({ to: "/studio", search: { template: "image_check", text: value } });
    else navigate({ to: "/studio", search: { ai: 1, prompt: value, text: value } });
  };
  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldAlert className="size-4 text-brand" /> {t("home.checkTitle")}
          </CardTitle>
          <CardDescription>{t("home.checkHint")}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="relative">
          <Textarea
            rows={4}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) plan();
            }}
            placeholder={t("home.checkPlaceholder")}
            className="pb-10 text-[14px]"
            aria-label="Message, link or image URL to check"
          />
          <div className="pointer-events-none absolute bottom-2.5 left-3 flex flex-wrap gap-1.5">
            {detected.map((d) => (
              <motion.span key={d.label} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
                <Badge tone="brand">
                  <d.icon /> {d.label}
                </Badge>
              </motion.span>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {SAMPLES.map((s) => (
            <button
              key={s.label}
              onClick={() => setText(s.text)}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-xs text-muted transition-colors hover:border-brand-line hover:text-foreground"
            >
              <s.icon className="size-3.5" /> {s.label}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-xs text-subtle sm:inline">
              <Kbd>Ctrl</Kbd> <Kbd>Enter</Kbd>
            </span>
            <Button onClick={plan} disabled={!text.trim()}>
              <Sparkles /> {t("home.planIt")}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function UsageChart() {
  const usage = useUsage(30);
  const data = usage.data?.by_day ?? [];
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Searches, last 30 days</CardTitle>
          <CardDescription>Paid SerpApi searches versus cache and replay hits.</CardDescription>
        </div>
        <Link to="/usage" className="text-xs text-brand hover:underline">
          Receipts
        </Link>
      </CardHeader>
      <CardContent className="h-56 pt-2">
        {usage.isLoading ? (
          <Skeleton className="h-full w-full" />
        ) : data.length === 0 ? (
          <div className="grid h-full place-items-center text-sm text-subtle">No runs yet</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ left: -20, right: 8, top: 8 }}>
              <defs>
                <linearGradient id="paid" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--brand)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--brand)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="day" tick={{ fill: "var(--subtle)", fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(d: string) => d.slice(5)} />
              <YAxis tick={{ fill: "var(--subtle)", fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12 }} />
              <Area type="monotone" dataKey="cached" name="Cached / replayed" stroke="var(--ok)" fill="transparent" strokeWidth={2} />
              <Area type="monotone" dataKey="paid" name="Paid searches" stroke="var(--brand)" fill="url(#paid)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

export function HomePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const me = useMe();
  const runs = useRuns(8);
  const usage = useUsage(30);
  const watches = useWatches();
  const contradictions = (runs.data ?? []).filter((r) => r.verdict_status === "CONTRADICTED").length;
  const alerts = (watches.data ?? [])
    .flatMap((w) => w.history.filter((h) => h.changes.length).map((h) => ({ ...h, watch: w })))
    .sort((a, b) => b.created_at - a.created_at)
    .slice(0, 5);

  const onRun = (slide: Slide) =>
    slide.templateId ? navigate({ to: "/studio", search: { template: slide.templateId, sample: 1 } }) : navigate({ to: "/studio", search: { ai: 1 } });
  const onOpen = (slide: Slide) => navigate({ to: "/studio", search: { template: slide.templateId } });
  const first = me.data?.user.name?.split(" ")[0];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{first ? `Good to see you, ${first}` : "Welcome"}</h1>
        <p className="mt-1 text-sm text-muted">Pick a featured workflow, or paste anything suspicious below.</p>
      </div>
      <BannerSlider onRun={onRun} onOpen={onOpen} />

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr] [&>*]:min-w-0">
        <CheckAnything />
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Runs (30d)" value={formatNumber(usage.data?.totals.runs ?? 0)} icon={<Activity />} />
          <Stat label="Paid searches" value={formatNumber(usage.data?.totals.paid ?? 0)} icon={<Database />} sub={`${formatNumber(usage.data?.totals.calls ?? 0)} engine calls`} />
          <Stat label="Saved by cache" value={formatNumber(usage.data?.totals.saved ?? 0)} tone="ok" icon={<Sparkles />} sub="Never paid twice for the same query" />
          <Stat label="Contradicted" value={contradictions} tone={contradictions ? "bad" : undefined} icon={<ShieldAlert />} sub="In recent verdicts" />
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-3 [&>*]:min-w-0">
        <Card className="xl:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>{t("home.recent")}</CardTitle>
              <CardDescription>Every verdict links back to its evidence and search receipt.</CardDescription>
            </div>
            <Link to="/runs" className="text-xs text-brand hover:underline">
              {t("common.viewAll")}
            </Link>
          </CardHeader>
          <CardContent className="pt-3">
            {runs.isLoading ? (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : (runs.data ?? []).length === 0 ? (
              <EmptyState icon={<Activity />} title="No runs yet" body="Run a featured workflow from the slider to see your first verdict." />
            ) : (
              <div className="divide-y divide-border">
                {runs.data!.map((r, i) => (
                  <motion.div key={r.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                    <Link to="/runs/$runId" params={{ runId: r.id }} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-surface-2">
                      <div className={cn("h-9 w-1 rounded-full", r.verdict_status === "CONTRADICTED" ? "bg-bad" : r.verdict_status === "CORROBORATED" ? "bg-ok" : r.verdict_status ? "bg-warn" : "bg-brand")} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13.5px] font-medium">{r.workflow_name}</div>
                        <div className="truncate text-xs text-subtle">
                          {r.input?.text?.slice(0, 90) || (r.input?.profile?.business_name as string) || "-"}
                        </div>
                      </div>
                      <div className="hidden flex-col items-end gap-1 sm:flex">
                        <RunStatusBadge run={r} />
                        {r.decision && <DecisionBadge decision={r.decision} />}
                      </div>
                      <div className="w-16 text-right text-xs text-subtle">{timeAgo(r.created_at)}</div>
                      <ArrowRight className="size-4 text-subtle" />
                    </Link>
                  </motion.div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <BellRing className="size-4 text-brand" /> {t("home.alerts")}
              </CardTitle>
              <CardDescription>What changed since the last scheduled run.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="pt-3">
            {alerts.length === 0 ? (
              <EmptyState
                icon={<Radar />}
                title="No changes detected"
                body="Create a watch from any run to get alerts when prices, ads or reviews move."
                action={
                  <Button size="sm" variant="secondary" onClick={() => navigate({ to: "/watches" })}>
                    Open watches
                  </Button>
                }
              />
            ) : (
              <div className="space-y-3">
                {alerts.map((a) => (
                  <Link key={a.id} to="/runs/$runId" params={{ runId: a.run_id }} className="block rounded-lg border border-border p-3 hover:border-border-strong">
                    <div className="flex items-center justify-between text-[13px] font-medium">
                      {a.watch.name}
                      <span className="text-xs font-normal text-subtle">{timeAgo(a.created_at)}</span>
                    </div>
                    <ul className="mt-1.5 space-y-0.5 text-xs text-muted">
                      {a.changes.slice(0, 3).map((c) => (
                        <li key={c.key}>
                          {c.label}: {c.added ? c.added.join(", ") : `${String(c.before)} → ${String(c.after)}`}
                        </li>
                      ))}
                    </ul>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <UsageChart />
    </div>
  );
}
