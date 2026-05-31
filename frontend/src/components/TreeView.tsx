/**
 * Mode 3 — Hierarchical tree (zoomable).
 *
 * Uses reactflow to render the analysis as a tree: each layer expands into its
 * winning concepts (macro -> base ideas as you go deeper). reactflow provides
 * pan + zoom (mouse wheel / Controls) out of the box.
 *
 * Layout: a simple deterministic placement — depth maps to X (columns), and
 * nodes stack on Y within their column. Good enough for a Phase-3 placeholder;
 * swap for dagre/elk later if the trees grow large.
 */

import { useMemo } from "react";
import ReactFlow, {
  Background,
  Controls,
  type Edge,
  type Node,
} from "reactflow";
import "reactflow/dist/style.css";
import type { AnalysisLayer, AnalysisResponse, Language } from "../types";
import { tr } from "../utils/i18n";

interface Props {
  analysis: AnalysisResponse;
  language: Language;
}

const COL_WIDTH = 280;
const ROW_HEIGHT = 90;

interface Built {
  nodes: Node[];
  edges: Edge[];
}

/** Walk the tree and emit reactflow nodes/edges with a column-per-depth layout. */
function buildGraph(root: AnalysisLayer, language: Language): Built {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  // Running Y cursor per depth column so siblings don't overlap.
  const yByDepth: Record<number, number> = {};

  const nextY = (depth: number): number => {
    const y = yByDepth[depth] ?? 0;
    yByDepth[depth] = y + ROW_HEIGHT;
    return y;
  };

  const walk = (layer: AnalysisLayer, parentId: string | null) => {
    const layerId = `layer-${layer.level}`;
    nodes.push({
      id: layerId,
      position: { x: layer.level * COL_WIDTH, y: nextY(layer.level) },
      data: { label: `${tr(language, "tree.legendLayer")} ${layer.level}` },
      style: { background: "#1f2937", color: "#fff", borderRadius: 8, fontWeight: 600 },
    });
    if (parentId) {
      edges.push({ id: `${parentId}->${layerId}`, source: parentId, target: layerId });
    }

    // Concept nodes sit in a half-column to the right of their layer node.
    layer.winning_concepts.forEach((c) => {
      nodes.push({
        id: c.id,
        position: {
          x: layer.level * COL_WIDTH + COL_WIDTH / 2,
          y: nextY(layer.level),
        },
        data: {
          label: `${c.label}\n(${tr(language, "reader.ktop")} ${c.k_top_score.toFixed(2)})`,
        },
        style: {
          background: "#dcfce7",
          border: "1px solid #16a34a",
          borderRadius: 6,
          whiteSpace: "pre-line",
          fontSize: 12,
        },
      });
      edges.push({ id: `${layerId}->${c.id}`, source: layerId, target: c.id });
    });

    layer.sub_layers.forEach((child) => walk(child, layerId));
  };

  walk(root, null);
  return { nodes, edges };
}

export function TreeView({ analysis, language }: Props) {
  const { nodes, edges } = useMemo(
    () => buildGraph(analysis.root_layer, language),
    [analysis, language],
  );

  if (nodes.length === 0) {
    return (
      <div className="tree-view tree-empty">
        <p>{tr(language, "tree.empty")}</p>
      </div>
    );
  }

  return (
    <div className="tree-view">
      <div className="tree-legend">
        <span className="legend-item legend-layer">{tr(language, "tree.legendLayer")}</span>
        <span className="legend-item legend-concept">{tr(language, "tree.legendConcept")}</span>
      </div>
      <ReactFlow nodes={nodes} edges={edges} fitView minZoom={0.2} maxZoom={2}>
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}
