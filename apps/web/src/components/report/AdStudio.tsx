import { AlertTriangle, Briefcase, Check, CheckCircle2, Copy, Download, Hash, Loader2, MessageCircle, Search, ShieldCheck, Sparkles } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { AdPack, AdVariant, Evidence, RunDetail } from "@/lib/types";
import { cn, copyText, hostOf, safeUrl } from "@/lib/utils";
import { Button } from "../ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger, Tip } from "../ui/overlays";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Textarea } from "../ui/primitives";

const CHANNEL: Record<AdVariant["channel"], { label: string; icon: React.ElementType }> = {
  google_search: { label: "Google Search", icon: Search },
  instagram: { label: "Instagram", icon: Hash },
  linkedin: { label: "LinkedIn", icon: Briefcase },
  whatsapp: { label: "WhatsApp", icon: MessageCircle },
};

function Flags({ flags }: { flags: string[] }) {
  if (!flags.length)
    return (
      <Badge tone="ok">
        <ShieldCheck /> No compliance issues
      </Badge>
    );
  return (
    <div className="flex flex-wrap gap-1.5">
      {flags.map((f) => (
        <Badge key={f} tone="bad">
          <AlertTriangle /> {f}
        </Badge>
      ))}
    </div>
  );
}

function LiveCheck({ runId, initial, field, limit }: { runId: string; initial: string; field: "headline" | "description" | "body"; limit?: number }) {
  const [text, setText] = useState(initial);
  const [flags, setFlags] = useState<string[] | null>(null);
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    if (!text.trim()) return;
    setChecking(true);
    const h = window.setTimeout(async () => {
      try {
        const r = await api.post<{ flags: string[] }>("/ads/check", { text, field, run_id: runId });
        setFlags(r.flags);
      } finally {
        setChecking(false);
      }
    }, 400);
    return () => window.clearTimeout(h);
  }, [text, field, runId]);
  const over = limit != null && text.length > limit;
  return (
    <div className="space-y-2">
      <Textarea rows={field === "body" ? 5 : 2} value={text} onChange={(e) => setText(e.target.value)} className={cn(over && "border-bad")} />
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {limit != null && <span className={cn("tabular", over ? "text-bad" : "text-subtle")}>{text.length}/{limit}</span>}
        {checking ? (
          <span className="inline-flex items-center gap-1 text-subtle">
            <Loader2 className="size-3 animate-spin" /> Checking
          </span>
        ) : (
          flags && <Flags flags={flags} />
        )}
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto h-7"
          onClick={async () => {
            if (await copyText(text)) toast.success("Copied");
          }}
        >
          <Copy /> Copy
        </Button>
      </div>
    </div>
  );
}

function Claims({ variant, evidence }: { variant: AdVariant; evidence: Record<string, Evidence> }) {
  if (!variant.claims.length) return null;
  return (
    <div className="space-y-1.5">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-subtle">Claims and their evidence</div>
      {variant.claims.map((c, i) => (
        <div key={i} className="flex items-start gap-2 text-[12.5px]">
          {c.supported ? <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-ok" /> : <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-bad" />}
          <span className="flex-1">
            {c.text}
            {c.evidence_ids.map((id, j) => {
              const ev = evidence[id];
              if (!ev) return null;
              return (
                <Tip key={id} content={<span><b>{ev.source || hostOf(ev.url)}</b>: {ev.title}</span>}>
                  <a href={safeUrl(ev.url)} target="_blank" rel="noopener noreferrer nofollow" className="ml-1 inline-grid size-4 place-items-center rounded bg-brand-soft align-middle text-[9px] font-semibold text-brand">
                    {j + 1}
                  </a>
                </Tip>
              );
            })}
            {!c.supported && <span className="ml-1 text-bad">(no supporting evidence)</span>}
          </span>
        </div>
      ))}
    </div>
  );
}

function SearchPreview({ v, business }: { v: AdVariant; business: string }) {
  return (
    <div className="rounded-xl border border-border bg-white p-4 text-[#202124] shadow-sm">
      <div className="flex items-center gap-2 text-[12px]">
        <span className="font-semibold">Sponsored</span>
        <span className="text-[#5f6368]">· {business.toLowerCase().replace(/\s+/g, "")}.in</span>
      </div>
      <div className="mt-1 text-[18px] leading-snug text-[#1a0dab]">{v.headlines.slice(0, 3).join(" | ")}</div>
      <div className="mt-1 text-[13px] leading-relaxed text-[#4d5156]">{v.descriptions[0]}</div>
    </div>
  );
}

function BubblePreview({ v, channel }: { v: AdVariant; channel: AdVariant["channel"] }) {
  if (channel === "whatsapp")
    return (
      <div className="rounded-xl bg-[#0b141a] p-4">
        <div className="ml-auto max-w-[85%] whitespace-pre-line rounded-lg rounded-tr-none bg-[#005c4b] px-3 py-2 text-[13px] leading-relaxed text-[#e9edef]">{v.body}</div>
      </div>
    );
  return (
    <div className="rounded-xl border border-border bg-surface-2/50 p-4">
      <p className="whitespace-pre-line text-[13px] leading-relaxed">{v.body}</p>
      {v.hashtags.length > 0 && <p className="mt-2 text-[13px] text-brand">{v.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")}</p>}
    </div>
  );
}

export function AdStudio({ run, pack }: { run: RunDetail; pack: AdPack }) {
  const evidence = useMemo(() => Object.fromEntries((run.result?.evidence ?? []).map((e) => [e.id, e])), [run.result]);
  const [copied, setCopied] = useState<string | null>(null);
  const totalFlags = pack.variants.reduce((n, v) => n + v.flags.length, 0) + pack.compliance_flags.length;

  const exportPack = () => {
    const lines = [`Ad pack: ${pack.business_name} · ${pack.topic}`, `Target regions: ${pack.target_regions.join(", ")}`, `Keywords: ${pack.target_keywords.join(", ")}`, ""];
    pack.variants.forEach((v) => {
      lines.push(`## ${CHANNEL[v.channel].label}`);
      v.headlines.forEach((h) => lines.push(`Headline: ${h}`));
      v.descriptions.forEach((d) => lines.push(`Description: ${d}`));
      if (v.body) lines.push(v.body);
      if (v.hashtags.length) lines.push(v.hashtags.join(" "));
      if (v.flags.length) lines.push(`Flags: ${v.flags.join("; ")}`);
      lines.push("");
    });
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `ad-pack-${run.id}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const copyVariant = async (v: AdVariant) => {
    const text = [...v.headlines, ...v.descriptions, v.body, v.hashtags.join(" ")].filter(Boolean).join("\n");
    if (await copyText(text)) {
      setCopied(v.channel);
      window.setTimeout(() => setCopied(null), 1500);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden">
        <div className="h-1.5 bg-[#a855f7]" />
        <CardContent className="flex flex-wrap items-center gap-6">
          <div className="min-w-0 flex-1 basis-[360px]">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[#a855f7]">
              <Sparkles className="size-3.5" /> Ad Studio · {pack.generated_by === "rules" ? "grounded templates" : `written by ${pack.generated_by}`}
            </div>
            <h3 className="mt-1 text-xl font-semibold tracking-tight">
              {pack.business_name || "Your business"} · {pack.topic}
            </h3>
            <p className="mt-1 text-[13px] text-muted">Every claim links to the evidence it came from. Unsupported superlatives, price claims below the market floor and over-length lines are flagged before you publish.</p>
          </div>
          <div className="flex flex-wrap gap-6">
            <div>
              <div className="text-xs text-subtle">Target states</div>
              <div className="mt-1 flex max-w-xs flex-wrap gap-1">{pack.target_regions.slice(0, 4).map((r) => <Badge key={r}>{r}</Badge>)}</div>
            </div>
            <div>
              <div className="text-xs text-subtle">Compliance</div>
              <div className="mt-1">
                {totalFlags ? (
                  <Badge tone="bad">
                    <AlertTriangle /> {totalFlags} flag{totalFlags > 1 ? "s" : ""} caught
                  </Badge>
                ) : (
                  <Badge tone="ok">
                    <ShieldCheck /> Clean
                  </Badge>
                )}
              </div>
            </div>
            <Button variant="secondary" onClick={exportPack}>
              <Download /> Export
            </Button>
          </div>
        </CardContent>
      </Card>

      {pack.target_keywords.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-subtle">Bid on rising keywords:</span>
          {pack.target_keywords.map((k) => (
            <Badge key={k} tone="brand">
              {k}
            </Badge>
          ))}
        </div>
      )}

      <Tabs defaultValue={pack.variants[0]?.channel}>
        <TabsList>
          {pack.variants.map((v) => {
            const C = CHANNEL[v.channel];
            return (
              <TabsTrigger key={v.channel} value={v.channel}>
                <C.icon /> {C.label}
                {v.flags.length > 0 && <span className="ml-1 size-1.5 rounded-full bg-bad" />}
              </TabsTrigger>
            );
          })}
        </TabsList>
        {pack.variants.map((v) => (
          <TabsContent key={v.channel} value={v.channel} className="mt-4">
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="grid gap-6 xl:grid-cols-2">
              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>Preview</CardTitle>
                    <CardDescription>How it will look on {CHANNEL[v.channel].label}.</CardDescription>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => copyVariant(v)}>
                    {copied === v.channel ? <Check /> : <Copy />} Copy all
                  </Button>
                </CardHeader>
                <CardContent className="space-y-4">
                  {v.channel === "google_search" ? <SearchPreview v={v} business={pack.business_name || pack.topic} /> : <BubblePreview v={v} channel={v.channel} />}
                  <Flags flags={v.flags} />
                  <Claims variant={v} evidence={evidence} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>Edit with live compliance check</CardTitle>
                    <CardDescription>Changes are re-checked against the run's price band and evidence as you type.</CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="space-y-5">
                  {v.channel === "google_search" ? (
                    <>
                      {v.headlines.map((h, i) => (
                        <div key={`h${i}`}>
                          <div className="mb-1 text-xs font-medium text-muted">Headline {i + 1}</div>
                          <LiveCheck runId={run.id} initial={h} field="headline" limit={30} />
                        </div>
                      ))}
                      {v.descriptions.map((d, i) => (
                        <div key={`d${i}`}>
                          <div className="mb-1 text-xs font-medium text-muted">Description {i + 1}</div>
                          <LiveCheck runId={run.id} initial={d} field="description" limit={90} />
                        </div>
                      ))}
                    </>
                  ) : (
                    <LiveCheck runId={run.id} initial={v.body} field="body" />
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
