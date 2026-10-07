import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { AlertTriangle, Check, Loader2 } from "lucide-react";
import { motion } from "motion/react";
import { memo } from "react";
import { agentIcon, engineMeta } from "@/lib/icons";
import type { NodeState } from "@/lib/sse";
import { cn } from "@/lib/utils";

export type AgentNodeData = {
  agent?: string;
  params?: Record<string, unknown>;
  title: string;
  icon: string;
  category: string;
  engines: string[];
  est: number;
  variant?: "full" | "mini";
  state?: NodeState;
  message?: string;
  summary?: string;
  searches?: number;
  evidence?: number;
  error?: string;
  invalid?: boolean;
};

export type AgentFlowNode = Node<AgentNodeData, "agent">;

export const CATEGORY_STYLE: Record<string, { accent: string; label: string }> = {
  core: { accent: "#64748b", label: "Core" },
  ground_truth: { accent: "#f59e0b", label: "Ground truth" },
  evidence: { accent: "#6366f1", label: "Evidence" },
  synthesis: { accent: "#a855f7", label: "Synthesis" },
};

export const NODE_SIZE = { full: { width: 236, height: 84 }, mini: { width: 132, height: 40 } };

function AgentNodeImpl({ data, selected }: NodeProps<AgentFlowNode>) {
  const Icon = agentIcon(data.icon);
  const accent = CATEGORY_STYLE[data.category]?.accent ?? "#6366f1";
  const state = data.state;
  const running = state === "running";

  if (data.variant === "mini") {
    return (
      <div
        className={cn(
          "flex h-10 w-[132px] items-center gap-2 rounded-lg border bg-surface px-2 shadow-sm",
          state === "done" ? "border-ok-line" : running ? "border-brand animate-pulse-ring" : "border-border",
        )}
      >
        <Handle type="target" position={Position.Left} className="!size-1.5 !border-0 !bg-transparent" />
        <span className="grid size-6 shrink-0 place-items-center rounded-md" style={{ background: `${accent}22`, color: accent }}>
          <Icon className="size-3.5" />
        </span>
        <span className="truncate text-[11px] font-medium">{data.title}</span>
        <Handle type="source" position={Position.Right} className="!size-1.5 !border-0 !bg-transparent" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: state === "waiting" ? 0.72 : 1, scale: 1 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "relative w-[236px] rounded-xl border bg-surface shadow-card transition-colors",
        state === "done" && "border-ok-line",
        state === "failed" && "border-bad-line",
        running && "border-brand animate-pulse-ring",
        !state && (data.invalid ? "border-bad-line" : "border-border"),
        state === "waiting" && "border-border",
        selected && "ring-2 ring-brand/60",
      )}
    >
      <Handle type="target" position={Position.Left} />
      <div className="absolute inset-y-2 left-0 w-[3px] rounded-r-full" style={{ background: accent }} />
      <div className="flex items-start gap-2.5 px-3 pt-2.5 pb-2">
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg" style={{ background: `${accent}1f`, color: accent }}>
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[13px] font-semibold">{data.title}</span>
            {state === "done" && (
              <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="grid size-4 place-items-center rounded-full bg-ok text-white">
                <Check className="size-3" strokeWidth={3} />
              </motion.span>
            )}
            {running && <Loader2 className="size-3.5 animate-spin text-brand" />}
            {state === "failed" && <AlertTriangle className="size-3.5 text-bad" />}
          </div>
          <div className="mt-0.5 truncate text-[11px] text-muted">
            {state === "failed"
              ? data.error
              : state === "done"
                ? data.summary || "Done"
                : running
                  ? data.message || "Working"
                  : state === "waiting"
                    ? "Waiting for inputs"
                    : CATEGORY_STYLE[data.category]?.label}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1 border-t border-border px-3 py-1.5">
        {data.engines.slice(0, 4).map((e) => {
          const m = engineMeta(e);
          const EIcon = m.icon;
          return (
            <span key={e} title={m.label} className="grid size-5 place-items-center rounded bg-surface-2">
              <EIcon className="size-3" style={{ color: m.color }} />
            </span>
          );
        })}
        {data.engines.length === 0 && <span className="text-[10px] text-subtle">No searches</span>}
        <span className="ml-auto text-[10px] tabular text-subtle">
          {state === "done" || running
            ? `${data.searches ?? 0} search${data.searches === 1 ? "" : "es"}${data.evidence ? ` · ${data.evidence} ev` : ""}`
            : data.est
              ? `~${data.est} search${data.est === 1 ? "" : "es"}`
              : "free"}
        </span>
      </div>
      <Handle type="source" position={Position.Right} />
    </motion.div>
  );
}

export const AgentNode = memo(AgentNodeImpl);
export const nodeTypes = { agent: AgentNode };
