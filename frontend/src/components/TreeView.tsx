/**
 * Mode 3 — Concept DAG (Directed Acyclic Graph).
 *
 * The analysis is no longer a strict tree: a phrase can feed several concepts,
 * and granular concepts roll up into macro ones. We render a bottom-up DAG with
 * reactflow, laid out by dagre:
 *   - Granular concepts (lower layers) sit at the BOTTOM.
 *   - Macro concepts (deeper layers, more general) rise to the TOP.
 *   - Each concept of a layer feeds every concept of the next, more-general
 *     layer (multiple connections per node).
 *
 * Nodes are small, clean rectangles showing only the concept name, painted with
 * the same pastel color the readers use. Long justifications are NOT shown here.
 */

import { useMemo } from "react";
import ReactFlow, {
  Background,
  Controls,
  MarkerType,
  Position,
  type Edge,
  type Node,
} from "reactflow";
import "reactflow/dist/style.css";
import dagre from "dagre";
import type { AnalysisResponse, Language } from "../types";
import { pastelFor } from "../utils/colors";
import { flattenLayers } from "../utils/layers";
import { tr } from "../utils/i18n";

interface Props {
  analysis: AnalysisResponse;
  language: Language;
}

const NODE_W = 184;
const NODE_H = 46;

/** Build pastel concept nodes + cross-layer edges, positioned by dagre (BT). */
function buildDag(analysis: AnalysisResponse): { nodes: Node[]; edges: Edge[] } {
  const layers = flattenLayers(analysis.root_layer); // index 0 = most granular
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  layers.forEach((layer) => {
    layer.winning_concepts.forEach((c, i) => {
      const p = pastelFor(i);
      nodes.push({
        id: c.id,
        data: { label: c.label },
        position: { x: 0, y: 0 }, // overwritten by dagre below
        sourcePosition: Position.Top,
        targetPosition: Position.Bottom,
        style: {
          width: NODE_W,
          height: NODE_H,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: "0 10px",
          background: p.bg,
          border: `1.5px solid ${p.border}`,
          color: p.text,
          borderRadius: 10,
          fontSize: 12,
          fontWeight: 600,
          overflow: "hidden",
          whiteSpace: "nowrap",
          textOverflow: "ellipsis",
        },
      });
    });
  });

  // Granular layer (L) feeds the more-general layer (L+1): full bipartite.
  for (let li = 0; li < layers.length - 1; li++) {
    const lower = layers[li].winning_concepts;
    const upper = layers[li + 1].winning_concepts;
    for (const s of lower) {
      for (const t of upper) {
        edges.push({
          id: `${s.id}->${t.id}`,
          source: s.id,
          target: t.id,
          type: "smoothstep",
          markerEnd: { type: MarkerType.ArrowClosed, color: "#94a3b8" },
          style: { stroke: "#94a3b8", strokeWidth: 1 },
        });
      }
    }
  }

  // dagre layout: bottom-to-top so macro concepts end up on top.
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "BT", nodesep: 28, ranksep: 70, marginx: 20, marginy: 20 });
  g.setDefaultEdgeLabel(() => ({}));
  nodes.forEach((n) => g.setNode(n.id, { width: NODE_W, height: NODE_H }));
  edges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);
  nodes.forEach((n) => {
    const pos = g.node(n.id);
    // dagre gives the node center; reactflow wants the top-left corner.
    n.position = { x: pos.x - NODE_W / 2, y: pos.y - NODE_H / 2 };
  });

  return { nodes, edges };
}

export function TreeView({ analysis, language }: Props) {
  const { nodes, edges } = useMemo(() => buildDag(analysis), [analysis]);

  if (nodes.length === 0) {
    return (
      <div className="tree-view tree-empty">
        <p>{tr(language, "tree.empty")}</p>
      </div>
    );
  }

  return (
    <div className="tree-view">
      <ReactFlow nodes={nodes} edges={edges} fitView minZoom={0.2} maxZoom={2}>
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}
