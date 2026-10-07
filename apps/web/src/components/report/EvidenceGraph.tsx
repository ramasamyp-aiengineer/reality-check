import { Background, BackgroundVariant, Controls, Handle, Position, ReactFlow, ReactFlowProvider, type Edge, type Node, type NodeProps } from "@xyflow/react";
import { CircleCheck, CircleHelp, CircleX, FileSearch, Layers, MessageSquareQuote, Scale } from "lucide-react";
import { memo, useMemo } from "react";
import { engineMeta } from "@/lib/icons";
import { layoutGraph } from "@/lib/layout";
import type { GraphEdge, GraphNode } from "@/lib/types";
import { cn, safeUrl, STATUS_TONE, TONE_CLASSES } from "@/lib/utils";

type GNode = Node<GraphNode & Record<string, unknown>, "g">;

const SIZE: Record<GraphNode["kind"], { width: number; height: number }> = {
  claim: { width: 240, height: 64 },
  signal: { width: 200, height: 56 },
  evidence: { width: 230, height: 56 },
  finding: { width: 230, height: 56 },
  verdict: { width: 220, height: 70 },
};

function GraphNodeImpl({ data }: NodeProps<GNode>) {
  const k = data.kind;
  const base = "rounded-xl border bg-surface px-3 py-2 shadow-card text-left";
  if (k === "claim")
    return (
      <div className={cn(base, "w-[240px] border-brand-line")}>
        <Handle type="source" position={Position.Right} />
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-brand">
          <MessageSquareQuote className="size-3" /> Claim
        </div>
        <div className="mt-0.5 line-clamp-2 text-[12px] leading-snug">{data.detail}</div>
      </div>
    );
  if (k === "signal")
    return (
      <div className={cn(base, "w-[200px]")}>
        <Handle type="target" position={Position.Left} />
        <Handle type="source" position={Position.Right} />
        <div className="flex items-center gap-1.5 text-[12px] font-semibold">
          <Layers className="size-3.5 text-brand" /> {data.label}
        </div>
        <div className="truncate text-[11px] text-muted">{data.detail}</div>
      </div>
    );
  if (k === "evidence") {
    const m = engineMeta(data.engine);
    const Icon = m.icon;
    const url = safeUrl(data.url);
    return (
      <div className={cn(base, "w-[230px]")}>
        <Handle type="target" position={Position.Left} />
        <Handle type="source" position={Position.Right} />
        <div className="flex items-center gap-1.5 text-[10px] text-subtle">
          <Icon className="size-3" style={{ color: m.color }} /> {m.label}
          {data.detail && <span className="truncate">· {data.detail}</span>}
        </div>
        {url ? (
          <a href={url} target="_blank" rel="noopener noreferrer nofollow" className="nodrag line-clamp-2 text-[11.5px] font-medium leading-snug hover:text-brand">
            {data.label}
          </a>
        ) : (
          <div className="line-clamp-2 text-[11.5px] font-medium leading-snug">{data.label}</div>
        )}
      </div>
    );
  }
  if (k === "finding") {
    const tone = data.finding_kind === "contradiction" ? "bad" : data.finding_kind === "support" ? "ok" : "warn";
    const Icon = tone === "bad" ? CircleX : tone === "ok" ? CircleCheck : CircleHelp;
    return (
      <div className={cn(base, "w-[230px]", TONE_CLASSES[tone].border, TONE_CLASSES[tone].bg)}>
        <Handle type="target" position={Position.Left} />
        <Handle type="source" position={Position.Right} />
        <div className={cn("flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider", TONE_CLASSES[tone].text)}>
          <Icon className="size-3" /> {data.finding_kind} · {data.detail}
        </div>
        <div className="line-clamp-2 text-[11.5px] font-medium leading-snug">{data.label}</div>
      </div>
    );
  }
  const tone = data.status ? STATUS_TONE[data.status] : "na";
  return (
    <div className={cn("w-[220px] rounded-xl border-2 px-3 py-2.5 shadow-card", TONE_CLASSES[tone].border, TONE_CLASSES[tone].bg)}>
      <Handle type="target" position={Position.Left} />
      <div className={cn("flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider", TONE_CLASSES[tone].text)}>
        <Scale className="size-3" /> Verdict
      </div>
      <div className={cn("text-[14px] font-bold", TONE_CLASSES[tone].text)}>{data.label}</div>
      <div className="text-[11px] text-muted">{data.detail}</div>
    </div>
  );
}

const types = { g: memo(GraphNodeImpl) };

export function EvidenceGraph({ nodes, edges, className }: { nodes: GraphNode[]; edges: GraphEdge[]; className?: string }) {
  const { rfNodes, rfEdges } = useMemo(() => {
    const pos = layoutGraph(nodes, edges, { rankSep: 90, nodeSep: 14 }, (n) => SIZE[n.kind]);
    const rfNodes: GNode[] = nodes.map((n) => ({ id: n.id, type: "g", position: pos[n.id] ?? { x: 0, y: 0 }, data: { ...n }, draggable: true }));
    const rfEdges: Edge[] = edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: "smoothstep",
      className: ["contradiction", "support", "gap"].includes(e.kind) ? `rc-edge-${e.kind}` : undefined,
      animated: e.kind === "contradiction",
    }));
    return { rfNodes, rfEdges };
  }, [nodes, edges]);
  if (!nodes.length)
    return (
      <div className="grid h-64 place-items-center text-sm text-subtle">
        <span className="flex items-center gap-2">
          <FileSearch className="size-4" /> No evidence graph for this run
        </span>
      </div>
    );
  return (
    <div className={cn("h-[560px] rounded-xl border border-border bg-surface-2/30", className)}>
      <ReactFlowProvider>
        <ReactFlow nodes={rfNodes} edges={rfEdges} nodeTypes={types} fitView fitViewOptions={{ padding: 0.12 }} proOptions={{ hideAttribution: true }} minZoom={0.15} nodesConnectable={false}>
          <Background variant={BackgroundVariant.Dots} gap={18} size={1.2} color="var(--canvas-dot)" />
          <Controls position="bottom-left" showInteractive={false} />
        </ReactFlow>
      </ReactFlowProvider>
      <div className="pointer-events-none relative -mt-10 flex justify-end gap-3 px-4 pb-3 text-[11px] text-muted">
        <span className="inline-flex items-center gap-1"><span className="h-0.5 w-4 bg-bad" /> contradicts</span>
        <span className="inline-flex items-center gap-1"><span className="h-0.5 w-4 bg-ok" /> supports</span>
        <span className="inline-flex items-center gap-1"><span className="h-0.5 w-4 bg-warn" /> gap</span>
      </div>
    </div>
  );
}
