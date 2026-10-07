import { Bot, CircleCheck, CircleHelp, CircleX, Download, ExternalLink, Languages, Loader2, Radar, Radio, ShieldAlert, ShieldCheck, Siren, Sparkles } from "lucide-react";
import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import type { Action, Evidence, Finding, RunDetail, Verdict } from "@/lib/types";
import { cn, DECISION_TONE, safeUrl, STATUS_TONE, TONE_CLASSES } from "@/lib/utils";
import { ConfidenceRing, DecisionBadge, EvidenceCard, StatusBadge } from "../domain";
import { Button } from "../ui/button";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Progress, Switch } from "../ui/primitives";

const ACTION_ICON: Record<Action["kind"], React.ElementType> = {
  verify: ShieldCheck,
  report: Siren,
  protect: ShieldAlert,
  proceed: CircleCheck,
  watch: Radar,
};

const SEVERITY_RANK: Record<Finding["severity"], number> = { high: 0, medium: 1, low: 2 };

function FindingCard({ f, evidence }: { f: Finding; evidence: Record<string, Evidence> }) {
  const tone = f.kind === "contradiction" ? "bad" : f.kind === "support" ? "ok" : f.kind === "gap" ? "warn" : "na";
  const Icon = tone === "bad" ? CircleX : tone === "ok" ? CircleCheck : CircleHelp;
  const items = f.evidence_ids.map((id) => evidence[id]).filter(Boolean);
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={cn("rounded-xl border bg-surface p-4", TONE_CLASSES[tone].border)}>
      <div className="flex items-start gap-2.5">
        <Icon className={cn("mt-0.5 size-4 shrink-0", TONE_CLASSES[tone].text)} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13.5px] font-semibold">{f.title}</span>
            <Badge tone={f.severity === "high" ? tone : "neutral"} className="capitalize">
              {f.severity}
            </Badge>
          </div>
          {f.detail && <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{f.detail}</p>}
          <div className="mt-1 font-mono text-[10.5px] text-subtle">rule: {f.rule}</div>
        </div>
      </div>
      {items.length > 0 && (
        <div className="mt-3 space-y-2">
          {items.slice(0, 3).map((ev) => (
            <EvidenceCard key={ev.id} ev={ev} compact />
          ))}
        </div>
      )}
    </motion.div>
  );
}

function LlmAloneCompare({ run, verdict }: { run: RunDetail; verdict: Verdict }) {
  const [on, setOn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<{ available: boolean; reason?: string; model?: string; answer?: string; stated_confidence?: string } | null>(null);
  const toggle = async (v: boolean) => {
    setOn(v);
    if (v && !data) {
      setLoading(true);
      try {
        setData(await api.post(`/runs/${run.id}/llm-alone`));
      } catch (err) {
        setData({ available: false, reason: err instanceof ApiError ? err.message : "Comparison failed" });
      } finally {
        setLoading(false);
      }
    }
  };
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">
            <Bot className="size-4 text-brand" /> LLM alone vs with SerpApi
          </CardTitle>
          <CardDescription>What a model says from memory, next to the verdict built from live evidence.</CardDescription>
        </div>
        <Switch checked={on} onCheckedChange={toggle} aria-label="Compare with LLM alone" />
      </CardHeader>
      {on && (
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-border bg-surface-2/50 p-4">
            <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-subtle">
              <Bot className="size-3.5" /> LLM alone {data?.model && <span className="font-mono normal-case">({data.model})</span>}
            </div>
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted">
                <Loader2 className="size-4 animate-spin" /> Asking the model without evidence...
              </div>
            ) : data?.available ? (
              <>
                <p className="text-[13px] leading-relaxed">{data.answer}</p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted">
                  <Badge>Claims {data.stated_confidence} confidence</Badge>
                  <Badge tone="warn">0 sources</Badge>
                  <Badge tone="warn">No dates</Badge>
                </div>
              </>
            ) : (
              <p className="text-[13px] text-muted">{data?.reason}</p>
            )}
          </div>
          <div className={cn("rounded-xl border p-4", TONE_CLASSES[STATUS_TONE[verdict.evidence_status]].border)}>
            <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-subtle">
              <Radio className="size-3.5" /> With live SerpApi evidence
            </div>
            <p className="text-[13px] font-medium leading-relaxed">{verdict.headline}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <StatusBadge status={verdict.evidence_status} />
              <Badge tone="brand">{run.result?.evidence.length ?? 0} sources</Badge>
              <Badge tone="brand">{Object.keys(run.result?.receipt.engines ?? {}).length} engines</Badge>
              <Badge tone="brand">{verdict.findings.filter((f) => f.kind !== "signal").length} findings</Badge>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

export function VerdictReport({ run, verdict, onWatch }: { run: RunDetail; verdict: Verdict; onWatch: () => void }) {
  const { t } = useTranslation();
  const [lang, setLang] = useState("en");
  const [explanation, setExplanation] = useState<{ text: string; byLlm: boolean } | null>(null);
  const [explaining, setExplaining] = useState(false);
  const evidence = useMemo(() => Object.fromEntries((run.result?.evidence ?? []).map((e) => [e.id, e])), [run.result]);
  const tone = STATUS_TONE[verdict.evidence_status];
  const dTone = DECISION_TONE[verdict.decision];
  const contradictions = verdict.findings.filter((f) => f.kind === "contradiction");
  const supports = verdict.findings.filter((f) => f.kind === "support");
  const gaps = verdict.findings
    .filter((f) => f.kind === "gap" || f.kind === "signal")
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);

  const explain = async (code: string) => {
    setLang(code);
    if (code === "en" && verdict.explained_by === "rules") {
      setExplanation(null);
      return;
    }
    setExplaining(true);
    try {
      const r = await api.post<{ explanation: string; by_llm: boolean }>(`/runs/${run.id}/explain`, { language: code });
      setExplanation({ text: r.explanation, byLlm: r.by_llm });
      if (!r.by_llm && code !== "en") toast.info("Translation needs an LLM", { description: "Configure LLM_MODEL to explain verdicts in Hindi or Tamil." });
    } finally {
      setExplaining(false);
    }
  };

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={cn("overflow-hidden rounded-2xl border-2 bg-surface", TONE_CLASSES[tone].border)}>
        <div className={cn("h-1.5", TONE_CLASSES[tone].solid)} />
        <div className="grid gap-6 p-6 md:grid-cols-[1fr_auto]">
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={verdict.evidence_status} className="px-2.5 py-1 text-[13px]" />
              <DecisionBadge decision={verdict.decision} className="px-2.5 py-1 text-[13px]" />
            </div>
            <div className={cn("text-3xl font-bold tracking-tight", TONE_CLASSES[dTone].text)}>{t(`decision.${verdict.decision}`)}</div>
            <p className="text-[15px] font-medium leading-snug">{verdict.headline}</p>
            <p className="max-w-3xl whitespace-pre-line text-[13.5px] leading-relaxed text-muted">{explanation?.text ?? verdict.explanation}</p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="inline-flex items-center gap-1 text-xs text-subtle">
                <Languages className="size-3.5" /> Explain in
              </span>
              {[
                ["en", "English"],
                ["hi", "हिन्दी"],
                ["ta", "தமிழ்"],
              ].map(([code, label]) => (
                <button
                  key={code}
                  onClick={() => explain(code)}
                  className={cn("rounded-md border px-2 py-0.5 text-xs", lang === code ? "border-brand bg-brand-soft text-foreground" : "border-border text-muted hover:border-border-strong")}
                >
                  {label}
                </button>
              ))}
              {explaining && <Loader2 className="size-3.5 animate-spin text-brand" />}
              <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-subtle">
                <Sparkles className="size-3" /> Decided by rules · explained by {explanation?.byLlm || verdict.explained_by !== "rules" ? "LLM" : "rules"}
              </span>
            </div>
          </div>
          <div className="flex flex-col items-center justify-center gap-3">
            <ConfidenceRing value={verdict.confidence} size={132} tone={tone} />
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={onWatch}>
                <Radar /> Watch this
              </Button>
              <Button variant="secondary" size="sm" asChild>
                <a href={`/api/runs/${run.id}/report.pdf`}>
                  <Download /> PDF
                </a>
              </Button>
            </div>
          </div>
        </div>
      </motion.div>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-[13px] font-semibold text-bad">
                <CircleX className="size-4" /> Contradicts the claim <span className="tabular text-subtle">({contradictions.length})</span>
              </div>
              {contradictions.length ? contradictions.map((f) => <FindingCard key={f.id} f={f} evidence={evidence} />) : <p className="rounded-xl border border-dashed border-border p-4 text-xs text-subtle">No contradicting evidence found.</p>}
            </div>
            <div className="space-y-6">
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-[13px] font-semibold text-ok">
                  <CircleCheck className="size-4" /> Supports the claim <span className="tabular text-subtle">({supports.length})</span>
                </div>
                {supports.length ? supports.map((f) => <FindingCard key={f.id} f={f} evidence={evidence} />) : <p className="rounded-xl border border-dashed border-border p-4 text-xs text-subtle">No supporting evidence found.</p>}
              </div>
              {gaps.length > 0 && (
                <div className="space-y-3" data-testid="verdict-gaps">
                  <div className="flex items-center gap-2 text-[13px] font-semibold text-warn">
                    <CircleHelp className="size-4" /> Gaps and signals <span className="tabular text-subtle">({gaps.length})</span>
                  </div>
                  {gaps.map((f) => (
                    <FindingCard key={f.id} f={f} evidence={evidence} />
                  ))}
                </div>
              )}
            </div>
          </div>
          <LlmAloneCompare run={run} verdict={verdict} />
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Confidence breakdown</CardTitle>
                <CardDescription>How much the evidence can be trusted, factor by factor.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {verdict.confidence_factors.map((f) => (
                <div key={f.name}>
                  <div className="mb-1 flex items-center justify-between text-[13px]">
                    <span className="font-medium capitalize">{f.name.replace(/_/g, " ")}</span>
                    <span className="tabular text-xs text-muted">
                      {Math.round(f.score * 100)} <span className="text-subtle">× {Math.round(f.weight * 100)}%</span>
                    </span>
                  </div>
                  <Progress value={f.score * 100} tone={f.score >= 0.7 ? "ok" : f.score >= 0.4 ? "warn" : "bad"} />
                  <div className="mt-1 text-[11.5px] text-subtle">{f.detail}</div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>What to do next</CardTitle>
                <CardDescription>Official channels to verify, report or protect yourself.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {verdict.actions.map((a) => {
                const Icon = ACTION_ICON[a.kind] ?? ShieldCheck;
                const url = safeUrl(a.url);
                const inner = (
                  <>
                    <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", a.kind === "report" ? "bg-bad-soft text-bad" : a.kind === "protect" ? "bg-warn-soft text-warn" : "bg-brand-soft text-brand")}>
                      <Icon className="size-4" />
                    </span>
                    <span className="flex-1 text-[13px] font-medium leading-snug">{a.label}</span>
                    {url && <ExternalLink className="size-3.5 text-subtle" />}
                  </>
                );
                return url ? (
                  <a key={a.label} href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-lg border border-border p-2.5 transition-colors hover:border-border-strong hover:bg-surface-2">
                    {inner}
                  </a>
                ) : (
                  <div key={a.label} className="flex items-center gap-3 rounded-lg border border-border p-2.5">
                    {inner}
                  </div>
                );
              })}
            </CardContent>
          </Card>
          <p className="px-1 text-[11px] leading-relaxed text-subtle">
            Reality Check reports what public evidence shows at the time of the run. It is not legal or financial advice and does not accuse anyone of wrongdoing.
          </p>
        </div>
      </div>
    </div>
  );
}
