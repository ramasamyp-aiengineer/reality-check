import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Decision, EvidenceStatus } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const num = new Intl.NumberFormat("en-IN");

export function formatINR(value: number | null | undefined): string {
  return value == null || Number.isNaN(value) ? "-" : inr.format(value);
}

export function formatNumber(value: number | null | undefined): string {
  return value == null ? "-" : num.format(value);
}

export function formatPct(value: number | null | undefined, digits = 0): string {
  if (value == null) return "-";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}

export function timeAgo(ts: number | null | undefined): string {
  if (!ts) return "-";
  const diff = Date.now() / 1000 - ts;
  if (diff < 45) return "just now";
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  if (diff < 86400 * 30) return `${Math.round(diff / 86400)}d ago`;
  return new Date(ts * 1000).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function timeUntil(ts: number | null | undefined): string {
  if (!ts) return "-";
  const diff = ts - Date.now() / 1000;
  if (diff <= 60) return "within a minute";
  if (diff < 3600) return `in ${Math.round(diff / 60)}m`;
  if (diff < 86400) return `in ${Math.round(diff / 3600)}h`;
  return `in ${Math.round(diff / 86400)}d`;
}

export function formatDateTime(ts: number | null | undefined): string {
  if (!ts) return "-";
  return new Date(ts * 1000).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function formatMs(ms: number | null | undefined): string {
  if (ms == null) return "-";
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

export function humanize(value: string | null | undefined): string {
  if (!value) return "";
  return value.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

export type Tone = "ok" | "bad" | "warn" | "na" | "brand";

export const STATUS_TONE: Record<EvidenceStatus, Tone> = {
  CORROBORATED: "ok",
  CONTRADICTED: "bad",
  UNVERIFIED: "warn",
  INSUFFICIENT_EVIDENCE: "na",
};

export const DECISION_TONE: Record<Decision, Tone> = {
  SAFE_TO_PROCEED: "ok",
  PROCEED_WITH_CAUTION: "warn",
  WAIT_VERIFY_MORE: "warn",
  DO_NOT_PROCEED: "bad",
};

export const TONE_CLASSES: Record<Tone, { text: string; bg: string; border: string; solid: string }> = {
  ok: { text: "text-ok", bg: "bg-ok-soft", border: "border-ok-line", solid: "bg-ok" },
  bad: { text: "text-bad", bg: "bg-bad-soft", border: "border-bad-line", solid: "bg-bad" },
  warn: { text: "text-warn", bg: "bg-warn-soft", border: "border-warn-line", solid: "bg-warn" },
  na: { text: "text-na", bg: "bg-na-soft", border: "border-na-line", solid: "bg-na" },
  brand: { text: "text-brand", bg: "bg-brand-soft", border: "border-brand-line", solid: "bg-brand" },
};

export function safeUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function hostOf(url: string | null | undefined): string {
  try {
    return url ? new URL(url).hostname.replace(/^www\./, "") : "";
  } catch {
    return "";
  }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
