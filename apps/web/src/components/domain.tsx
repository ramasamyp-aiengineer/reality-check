import { motion } from "motion/react";
import { CircleCheck, CircleDashed, CircleHelp, CircleX, ExternalLink, FlaskConical, Radio, ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";
import type * as React from "react";
import { useTranslation } from "react-i18next";
import { engineMeta } from "@/lib/icons";
import type { Decision, Evidence, EvidenceStatus, Mode, RunSummary } from "@/lib/types";
import { cn, DECISION_TONE, hostOf, safeUrl, STATUS_TONE, TONE_CLASSES, type Tone } from "@/lib/utils";
import { Badge } from "./ui/primitives";
import { Tip } from "./ui/overlays";

export function PageHeader({ title, description, actions, eyebrow }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; eyebrow?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1.5 text-xs font-medium text-brand">{eyebrow}</div>}
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EngineChip({ engine, count, className }: { engine: string | null | undefined; count?: number; className?: string }) {
  const meta = engineMeta(engine);
  const Icon = meta.icon;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-muted", className)}>
      <Icon className="size-3" style={{ color: meta.color }} />
      {meta.label}
      {count != null && <span className="tabular text-foreground">×{count}</span>}
    </span>
  );
}

const STATUS_ICON: Record<EvidenceStatus, React.ElementType> = {
  CORROBORATED: CircleCheck,
  CONTRADICTED: CircleX,
  UNVERIFIED: CircleHelp,
  INSUFFICIENT_EVIDENCE: CircleDashed,
};

export function StatusBadge({ status, className }: { status: EvidenceStatus | null | undefined; className?: string }) {
  const { t } = useTranslation();
  if (!status) return null;
  const Icon = STATUS_ICON[status];
  return (
    <Badge tone={STATUS_TONE[status]} className={className}>
      <Icon />
      {t(`status.${status}`)}
    </Badge>
  );
}

const DECISION_ICON: Record<Decision, React.ElementType> = {
  SAFE_TO_PROCEED: ShieldCheck,
  PROCEED_WITH_CAUTION: ShieldQuestion,
  WAIT_VERIFY_MORE: ShieldQuestion,
  DO_NOT_PROCEED: ShieldAlert,
};

export function DecisionBadge({ decision, className }: { decision: Decision | null | undefined; className?: string }) {
  const { t } = useTranslation();
  if (!decision) return null;
  const Icon = DECISION_ICON[decision];
  return (
    <Badge tone={DECISION_TONE[decision]} className={className}>
      <Icon />
      {t(`decision.${decision}`)}
    </Badge>
  );
}

export function ConfidenceRing({ value, size = 96, tone = "brand", label = true }: { value: number; size?: number; tone?: Tone; label?: boolean }) {
  const stroke = Math.max(6, size / 12);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const color = { ok: "var(--ok)", bad: "var(--bad)", warn: "var(--warn)", na: "var(--na)", brand: "var(--brand)" }[tone];
  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--surface-3)" strokeWidth={stroke} fill="none" />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c - (c * Math.max(0, Math.min(100, value))) / 100 }}
          transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      {label && (
        <div className="absolute text-center">
          <div className="tabular font-semibold tracking-tight" style={{ fontSize: size / 3.6 }}>
            {Math.round(value)}
          </div>
          {size >= 80 && <div className="text-[10px] uppercase tracking-wider text-subtle">confidence</div>}
        </div>
      )}
    </div>
  );
}

export function ModeBadge({ mode, className }: { mode: Mode | string | undefined; className?: string }) {
  const { t } = useTranslation();
  if (mode === "demo")
    return (
      <Tip content="Runs replay recorded SerpApi responses. No key needed, no searches spent.">
        <Badge tone="warn" className={className}>
          <FlaskConical />
          {t("common.demoMode")}
        </Badge>
      </Tip>
    );
  return (
    <Badge tone="ok" className={className}>
      <Radio />
      {t("common.liveMode")}
    </Badge>
  );
}

export function RunStatusBadge({ run }: { run: Pick<RunSummary, "status" | "verdict_status"> }) {
  if (run.verdict_status) return <StatusBadge status={run.verdict_status} />;
  const map: Record<string, { tone: Tone | "neutral"; label: string }> = {
    queued: { tone: "neutral", label: "Queued" },
    running: { tone: "brand", label: "Running" },
    completed: { tone: "ok", label: "Completed" },
    completed_with_gaps: { tone: "warn", label: "Completed with gaps" },
    failed: { tone: "bad", label: "Failed" },
  };
  const m = map[run.status] ?? { tone: "neutral", label: run.status };
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

export function EvidenceCard({ ev, compact, highlight }: { ev: Evidence; compact?: boolean; highlight?: Tone }) {
  const url = safeUrl(ev.url);
  return (
    <div
      className={cn(
        "group rounded-lg border bg-surface-2/60 p-3 transition-colors hover:border-border-strong",
        highlight ? `${TONE_CLASSES[highlight].border}` : "border-border",
      )}
    >
      <div className="flex items-center gap-2">
        <EngineChip engine={ev.engine} />
        <span className="truncate text-[11px] text-subtle">{ev.source || hostOf(ev.url)}</span>
        {ev.published_at && <span className="ml-auto shrink-0 text-[11px] text-subtle">{ev.published_at}</span>}
      </div>
      <div className="mt-2 text-[13px] font-medium leading-snug">
        {url ? (
          <a href={url} target="_blank" rel="noopener noreferrer nofollow" className="hover:text-brand">
            {ev.title}
            <ExternalLink className="ml-1 inline size-3 opacity-0 transition-opacity group-hover:opacity-70" />
          </a>
        ) : (
          ev.title
        )}
      </div>
      {!compact && ev.snippet && <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-muted">{ev.snippet}</p>}
    </div>
  );
}
