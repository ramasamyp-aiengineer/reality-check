import dagre from "@dagrejs/dagre";

export interface LayoutOptions {
  direction?: "LR" | "TB";
  nodeWidth?: number;
  nodeHeight?: number;
  rankSep?: number;
  nodeSep?: number;
}

export function layoutGraph<N extends { id: string }, E extends { source: string; target: string }>(
  nodes: N[],
  edges: E[],
  { direction = "LR", nodeWidth = 220, nodeHeight = 76, rankSep = 70, nodeSep = 26 }: LayoutOptions = {},
  sizeOf?: (n: N) => { width: number; height: number },
): Record<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: direction, ranksep: rankSep, nodesep: nodeSep, marginx: 10, marginy: 10 });
  g.setDefaultEdgeLabel(() => ({}));
  nodes.forEach((n) => g.setNode(n.id, sizeOf ? sizeOf(n) : { width: nodeWidth, height: nodeHeight }));
  edges.forEach((e) => {
    if (g.hasNode(e.source) && g.hasNode(e.target)) g.setEdge(e.source, e.target);
  });
  dagre.layout(g);
  const out: Record<string, { x: number; y: number }> = {};
  nodes.forEach((n) => {
    const p = g.node(n.id);
    const size = sizeOf ? sizeOf(n) : { width: nodeWidth, height: nodeHeight };
    if (p) out[n.id] = { x: p.x - size.width / 2, y: p.y - size.height / 2 };
  });
  return out;
}
