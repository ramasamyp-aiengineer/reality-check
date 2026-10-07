import { ArrowDownRight, ArrowUpRight, ExternalLink, Flame, Lightbulb, Megaphone, MessagesSquare, Minus, Newspaper, Quote, TrendingUp } from "lucide-react";
import { motion } from "motion/react";
import { useMemo } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Evidence, MarketBrief, RunDetail, Signal } from "@/lib/types";
import { cn, formatINR, formatPct, hostOf, safeUrl } from "@/lib/utils";
import { EngineChip } from "../domain";
import { Tip } from "../ui/overlays";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, Stat } from "../ui/primitives";

type Obs = { store: string; price: number; title?: string; url?: string; evidence_id?: string };

const LINE_COLORS = ["var(--brand)", "#f59e0b", "#14b8a6", "#ec4899", "#8b5cf6"];

function sig<T = Signal>(signals: Signal[], type: string): T | undefined {
  return signals.find((s) => s.type === type) as T | undefined;
}

function EvidenceRefs({ ids, evidence }: { ids: string[]; evidence: Record<string, Evidence> }) {
  const items = ids.map((id) => evidence[id]).filter(Boolean);
  if (!items.length) return null;
  return (
    <span className="ml-1 inline-flex gap-1 align-middle">
      {items.slice(0, 3).map((ev, i) => (
        <Tip key={ev.id} content={<span><b>{ev.source || hostOf(ev.url)}</b>: {ev.title}</span>}>
          <a href={safeUrl(ev.url)} target="_blank" rel="noopener noreferrer nofollow" className="inline-grid size-4 place-items-center rounded bg-brand-soft text-[9px] font-semibold text-brand hover:bg-brand hover:text-white">
            {i + 1}
          </a>
        </Tip>
      ))}
    </span>
  );
}

function PriceStrip({ obs, min, max, median, yours }: { obs: Obs[]; min: number; max: number; median?: number | null; yours?: number | null }) {
  const lo = Math.min(min, yours ?? min) * 0.97;
  const hi = Math.max(max, yours ?? max) * 1.03;
  const x = (v: number) => `${((v - lo) / (hi - lo || 1)) * 100}%`;
  return (
    <div className="relative mt-8 mb-10 h-2 rounded-full bg-surface-3">
      {median != null && (
        <div className="absolute -top-3 h-8 w-px bg-subtle" style={{ left: x(median) }}>
          <span className="absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] text-subtle">median {formatINR(median)}</span>
        </div>
      )}
      {obs.map((o, i) => (
        <Tip key={`${o.store}-${i}`} content={`${o.store}: ${formatINR(o.price)}`}>
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: i * 0.04 }}
            className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-brand"
            style={{ left: x(o.price) }}
          />
        </Tip>
      ))}
      {yours != null && (
        <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: x(yours) }}>
          <div className="size-4 rotate-45 border-2 border-surface bg-warn" />
          <span className="absolute top-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-semibold text-warn">you {formatINR(yours)}</span>
        </div>
      )}
      <span className="absolute -bottom-6 left-0 text-[10px] text-subtle">{formatINR(min)}</span>
      <span className="absolute -bottom-6 right-0 text-[10px] text-subtle">{formatINR(max)}</span>
    </div>
  );
}

export function MarketBriefView({ run, brief }: { run: RunDetail; brief: MarketBrief }) {
  const signals = run.result?.signals ?? [];
  const evidence = useMemo(() => Object.fromEntries((run.result?.evidence ?? []).map((e) => [e.id, e])), [run.result]);
  const trend = sig<Signal & { keywords: string[]; points: { date: string; values: Record<string, number> }[]; momentum_pct: Record<string, number> }>(signals, "TrendSeries");
  const regions = sig<Signal & { regions: { name: string; value: number }[] }>(signals, "RegionInterest");
  const rising = sig<Signal & { rising: { query: string; value: string }[]; top: { query: string; value: string }[] }>(signals, "RisingQueries");
  const band = sig<Signal & { observations: Obs[]; min_price: number | null; median_price: number | null; max_price: number | null; store_count: number }>(signals, "PriceBand");
  const ads = sig<Signal & { advertisers: { name: string; ad_count: number; region?: string }[]; creatives: { advertiser: string; format?: string; first_shown?: string; last_shown?: string; link?: string; image?: string }[]; total_creatives: number }>(signals, "AdvertiserProfile");
  const reviews = sig<Signal & { entity: string; topic_shares: Record<string, number>; quotes: { text: string; rating?: number; topics: string[] }[]; newest_avg?: number; complaint_share: number }>(signals, "ReviewWindow");
  const news = sig<Signal & { items: { title: string; source?: string; date?: string; category: string; evidence_id?: string }[] }>(signals, "NewsEvents");
  const profile = sig<Signal & { price?: number | null; business_name?: string; city?: string }>(signals, "BusinessProfile");

  const chartData = (trend?.points ?? []).map((p) => ({ date: p.date, ...p.values }));
  const momentum = brief.momentum_pct;
  const MomentumIcon = momentum == null ? Minus : momentum > 3 ? ArrowUpRight : momentum < -3 ? ArrowDownRight : Minus;
  const maxRegion = Math.max(1, ...(regions?.regions ?? []).map((r) => r.value));

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden">
        <div className="h-1.5 bg-brand" />
        <CardContent className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-brand">Market brief · {brief.topic}</div>
            <p className="mt-2 text-[15px] leading-relaxed">{brief.summary}</p>
            <div className="mt-5 space-y-2">
              <div className="flex items-center gap-2 text-[13px] font-semibold">
                <Lightbulb className="size-4 text-warn" /> Opportunities
              </div>
              {brief.opportunities.map((o, i) => (
                <motion.div key={i} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} className="flex gap-2 rounded-lg border border-border bg-surface-2/50 p-2.5 text-[13px] leading-snug">
                  <span className="tabular text-subtle">{i + 1}.</span>
                  <span className="flex-1">
                    {o.text}
                    <EvidenceRefs ids={o.evidence_ids} evidence={evidence} />
                  </span>
                </motion.div>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 self-start">
            <Stat
              label="Search momentum"
              value={
                <span className="inline-flex items-center gap-1">
                  <MomentumIcon className={cn("size-5", momentum != null && momentum > 3 ? "text-ok" : momentum != null && momentum < -3 ? "text-bad" : "text-muted")} />
                  {formatPct(momentum)}
                </span>
              }
              sub={`${brief.momentum_label} · last 4 vs prior 4 weeks`}
            />
            <Stat label="Price floor" value={formatINR(brief.price_floor)} sub={`Median ${formatINR(brief.price_median)}`} />
            <Stat label="Competitor advertisers" value={brief.competitor_advertisers.length} sub={brief.competitor_advertisers.slice(0, 3).join(", ") || "None found"} />
            <Stat label="Top state" value={<span className="text-lg">{brief.top_regions[0]?.name ?? "-"}</span>} sub={brief.top_regions.slice(1, 3).map((r) => r.name).join(", ")} />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="size-4 text-brand" /> Search demand, India
              </CardTitle>
              <CardDescription>Google Trends interest over time (0 to 100).</CardDescription>
            </div>
            <EngineChip engine="google_trends" />
          </CardHeader>
          <CardContent className="h-72">
            {chartData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ left: -20, right: 8, top: 8 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: "var(--subtle)", fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={28} />
                  <YAxis tick={{ fill: "var(--subtle)", fontSize: 11 }} tickLine={false} axisLine={false} domain={[0, 100]} />
                  <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {(trend?.keywords ?? []).map((k, i) => (
                    <Line key={k} type="monotone" dataKey={k} stroke={LINE_COLORS[i % LINE_COLORS.length]} strokeWidth={2.2} dot={false} isAnimationActive />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState title="No trend data" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Demand by state</CardTitle>
              <CardDescription>Relative search interest, hottest first.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {regions?.regions.length ? (
              <div className="grid grid-cols-3 gap-1.5">
                {regions.regions.slice(0, 15).map((r, i) => {
                  const intensity = r.value / maxRegion;
                  return (
                    <motion.div
                      key={r.name}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.025 }}
                      className="rounded-lg p-2"
                      style={{ background: `color-mix(in srgb, var(--brand) ${Math.round(12 + intensity * 70)}%, var(--surface-2))` }}
                    >
                      <div className={cn("truncate text-[11.5px] font-medium", intensity > 0.55 ? "text-white" : "text-foreground")}>{r.name}</div>
                      <div className={cn("tabular text-[15px] font-semibold", intensity > 0.55 ? "text-white" : "text-foreground")}>{r.value}</div>
                    </motion.div>
                  );
                })}
              </div>
            ) : (
              <EmptyState title="No regional data" />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1.4fr]">
        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <Flame className="size-4 text-warn" /> Rising searches
              </CardTitle>
              <CardDescription>Queries growing fastest around this topic.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {(rising?.rising ?? []).slice(0, 10).map((q) => (
              <div key={q.query} className="flex items-center justify-between rounded-md px-2 py-1.5 text-[13px] hover:bg-surface-2">
                <span className="truncate">{q.query}</span>
                <Badge tone={/breakout/i.test(q.value) ? "warn" : "brand"}>{q.value}</Badge>
              </div>
            ))}
            {!rising?.rising.length && <p className="text-sm text-subtle">No rising queries.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Competitor price band</CardTitle>
              <CardDescription>
                {band ? `${band.store_count} Indian stores` : "No price data"}
                {profile?.price ? " · your price marked" : ""}
              </CardDescription>
            </div>
            <EngineChip engine="google_shopping" />
          </CardHeader>
          <CardContent>
            {band && band.min_price != null && band.max_price != null ? (
              <>
                <PriceStrip obs={band.observations} min={band.min_price} max={band.max_price} median={band.median_price} yours={profile?.price ?? null} />
                <div className="divide-y divide-border">
                  {band.observations.slice(0, 6).map((o, i) => (
                    <div key={`${o.store}-${i}`} className="flex items-center gap-3 py-2 text-[13px]">
                      <span className="w-32 truncate font-medium">{o.store}</span>
                      <span className="flex-1 truncate text-xs text-muted">{o.title}</span>
                      <span className="tabular font-semibold">{formatINR(o.price)}</span>
                      {safeUrl(o.url) && (
                        <a href={safeUrl(o.url)} target="_blank" rel="noopener noreferrer nofollow" className="text-subtle hover:text-brand" aria-label="Open listing">
                          <ExternalLink className="size-3.5" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <EmptyState title="No price band" body="Price Reality did not find comparable listings." />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2">
              <Megaphone className="size-4 text-brand" /> Competitor ad gallery
            </CardTitle>
            <CardDescription>Verified advertisers and their creatives from the Google Ads Transparency Center (India).</CardDescription>
          </div>
          <EngineChip engine="google_ads_transparency_center" />
        </CardHeader>
        <CardContent>
          {ads?.advertisers.length ? (
            <>
              <div className="mb-4 flex flex-wrap gap-2">
                {ads.advertisers.map((a) => (
                  <Badge key={a.name} tone="brand">
                    {a.name} · {a.ad_count} ads
                  </Badge>
                ))}
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {ads.creatives.slice(0, 8).map((c, i) => (
                  <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} className="overflow-hidden rounded-xl border border-border bg-surface-2/50">
                    <div className="grid aspect-[16/10] place-items-center bg-surface-3">
                      {safeUrl(c.image) ? (
                        <img src={safeUrl(c.image)} alt={`Ad creative by ${c.advertiser}`} loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                      ) : (
                        <Megaphone className="size-6 text-subtle" />
                      )}
                    </div>
                    <div className="p-2.5">
                      <div className="truncate text-[12.5px] font-semibold">{c.advertiser}</div>
                      <div className="mt-0.5 text-[11px] text-subtle">
                        {c.format ?? "ad"} · {c.first_shown ?? "?"} → {c.last_shown ?? "now"}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </>
          ) : (
            <EmptyState icon={<Megaphone />} title="No competitor ads found" body="No verified advertiser is running ads for these names in India right now." />
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <MessagesSquare className="size-4 text-brand" /> Review pain points
              </CardTitle>
              <CardDescription>{reviews ? `${reviews.entity} · newest reviews` : "What customers complain about"}</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {reviews ? (
              <>
                <div className="space-y-2">
                  {Object.entries(reviews.topic_shares)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 6)
                    .map(([topic, share]) => (
                      <div key={topic}>
                        <div className="mb-1 flex justify-between text-[12.5px]">
                          <span className="capitalize">{topic}</span>
                          <span className="tabular text-muted">{Math.round(share * 100)}%</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
                          <motion.div initial={{ width: 0 }} animate={{ width: `${share * 100}%` }} transition={{ duration: 0.8 }} className="h-full rounded-full bg-warn" />
                        </div>
                      </div>
                    ))}
                </div>
                <div className="space-y-2">
                  {reviews.quotes.slice(0, 3).map((q, i) => (
                    <blockquote key={i} className="flex gap-2 rounded-lg border border-border bg-surface-2/50 p-3 text-[12.5px] leading-relaxed text-muted">
                      <Quote className="size-3.5 shrink-0 text-subtle" />
                      <span>
                        {q.text}
                        {q.rating != null && <span className="ml-1 text-warn">{"★".repeat(Math.round(q.rating))}</span>}
                      </span>
                    </blockquote>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-subtle">No review data.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <Newspaper className="size-4 text-brand" /> In the news
              </CardTitle>
              <CardDescription>Dated events that shape the market.</CardDescription>
            </div>
            <EngineChip engine="google_news" />
          </CardHeader>
          <CardContent className="space-y-1">
            {(news?.items ?? []).slice(0, 7).map((n, i) => {
              const ev = n.evidence_id ? evidence[n.evidence_id] : undefined;
              return (
                <a key={i} href={safeUrl(ev?.url)} target="_blank" rel="noopener noreferrer nofollow" className="flex items-start gap-3 rounded-md px-2 py-2 hover:bg-surface-2">
                  <Badge className="mt-0.5 w-20 justify-center capitalize" tone={n.category === "enforcement" ? "bad" : n.category === "launch" || n.category === "funding" ? "ok" : "neutral"}>
                    {n.category}
                  </Badge>
                  <span className="flex-1">
                    <span className="block text-[13px] leading-snug">{n.title}</span>
                    <span className="text-[11px] text-subtle">
                      {n.source} {n.date && `· ${n.date}`}
                    </span>
                  </span>
                </a>
              );
            })}
            {!news?.items.length && <p className="text-sm text-subtle">No news found.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
