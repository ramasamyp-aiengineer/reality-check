import { Background, BackgroundVariant, Controls, ReactFlow, ReactFlowProvider, useNodesInitialized, useReactFlow, type Edge } from "@xyflow/react";
import { useEffect, useMemo, useRef } from "react";
import { layoutGraph } from "@/lib/layout";
import type { NodeLive } from "@/lib/sse";
import type { AgentSpec, Workflow } from "@/lib/types";
import { cn } from "@/lib/utils";
import { NODE_SIZE, nodeTypes, type AgentFlowNode } from "./AgentNode";

export function workflowToFlow(
  wf: Pick<Workflow, "nodes" | "edges">,
  agents: Record<string, AgentSpec>,
  opts: { variant?: "full" | "mini"; live?: Record<string, NodeLive>; estimate?: Record<string, number> } = {},
): { nodes: AgentFlowNode[]; edges: Edge[] } {
  const variant = opts.variant ?? "full";
  const size = NODE_SIZE[variant];
  const pos = layoutGraph(wf.nodes, wf.edges, {
    nodeWidth: size.width,
    nodeHeight: size.height,
    rankSep: variant === "mini" ? 34 : 70,
    nodeSep: variant === "mini" ? 10 : 22,
  });
  const nodes: AgentFlowNode[] = wf.nodes.map((n) => {
    const spec = agents[n.agent];
    const live = opts.live?.[n.id];
    return {
      id: n.id,
      type: "agent",
      position: pos[n.id] ?? { x: 0, y: 0 },
      draggable: false,
      data: {
        title: n.label || spec?.title || n.agent,
        icon: spec?.icon ?? "bot",
        category: spec?.category ?? "evidence",
        engines: spec?.engines ?? [],
        est: opts.estimate?.[n.id] ?? spec?.est_searches ?? 0,
        variant,
        state: live?.state,
        message: live?.message,
        summary: live?.summary,
        searches: live?.searches,
        evidence: live?.evidence,
        error: live?.error,
      },
    };
  });
  const edges: Edge[] = wf.edges.map((e) => {
    const s = opts.live?.[e.source]?.state;
    const t = opts.live?.[e.target]?.state;
    const className = s === "done" && t === "running" ? "rc-edge-live" : s === "done" && t === "done" ? "rc-edge-done" : undefined;
    return {
      id: `${e.source}->${e.target}`,
      source: e.source,
      target: e.target,
      type: "smoothstep",
      animated: variant === "mini",
      className,
    };
  });
  return { nodes, edges };
}

// The built-in `fitView` fits once on mount. If that happens before the container has a size or the nodes are
// measured (a burst of live events on a busy machine), the viewport becomes NaN and the canvas renders blank.
function AutoFit({ padding, signature, container }: { padding: number; signature: string; container: React.RefObject<HTMLDivElement | null> }) {
  const rf = useReactFlow();
  const initialized = useNodesInitialized();
  useEffect(() => {
    if (!initialized) return;
    const fit = () => {
      const el = container.current;
      if (el && el.clientWidth > 0 && el.clientHeight > 0) void rf.fitView({ padding });
    };
    fit();
    const timer = window.setTimeout(fit, 250);
    const observer = new ResizeObserver(fit);
    if (container.current) observer.observe(container.current);
    const guard = window.setInterval(() => {
      const { x, y, zoom } = rf.getViewport();
      if (![x, y, zoom].every(Number.isFinite)) fit();
    }, 500);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(guard);
      observer.disconnect();
    };
  }, [initialized, signature, padding, rf, container]);
  return null;
}

export function WorkflowCanvas({
  workflow,
  agents,
  live,
  variant = "full",
  estimate,
  className,
  controls = true,
  onNodeClick,
}: {
  workflow: Pick<Workflow, "nodes" | "edges">;
  agents: Record<string, AgentSpec>;
  live?: Record<string, NodeLive>;
  variant?: "full" | "mini";
  estimate?: Record<string, number>;
  className?: string;
  controls?: boolean;
  onNodeClick?: (id: string) => void;
}) {
  const { nodes, edges } = useMemo(() => workflowToFlow(workflow, agents, { variant, live, estimate }), [workflow, agents, variant, live, estimate]);
  const mini = variant === "mini";
  const container = useRef<HTMLDivElement>(null);
  const signature = useMemo(() => workflow.nodes.map((n) => n.id).join("|"), [workflow.nodes]);
  return (
    <div ref={container} className={cn("h-full w-full", className)}>
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: mini ? 0.12 : 0.18 }}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={!mini}
          panOnDrag={!mini}
          zoomOnScroll={false}
          zoomOnPinch={!mini}
          zoomOnDoubleClick={false}
          preventScrolling={false}
          proOptions={{ hideAttribution: true }}
          onNodeClick={(_, n) => onNodeClick?.(n.id)}
          minZoom={0.2}
        >
          {!mini && <Background variant={BackgroundVariant.Dots} gap={18} size={1.2} color="var(--canvas-dot)" />}
          {!mini && controls && <Controls showInteractive={false} position="bottom-left" />}
          <AutoFit padding={mini ? 0.12 : 0.18} signature={signature} container={container} />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
}

export function agentMap(list: AgentSpec[] | undefined): Record<string, AgentSpec> {
  const out: Record<string, AgentSpec> = {};
  (list ?? []).forEach((a) => (out[a.id] = a));
  return out;
}
