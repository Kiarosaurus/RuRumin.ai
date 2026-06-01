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

import { useMemo, useState } from "react";
import ReactFlow, {
  Background,
  Controls,
  MarkerType,
  Panel,
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

// Phrase (leaf) nodes hold long sentences, so they are wider and wrap.
const PHRASE_W = 300;
const PHRASE_LINE_H = 18;
// Conservative chars-per-line (under the true fit) so the estimate never falls
// short and the whole sentence is guaranteed to fit inside the box.
const PHRASE_CHARS_PER_LINE = 38;
const NEUTRAL_BORDER = "#94a3b8";

/**
 * Height a phrase node needs to fit its full text — grows with length, no cap.
 * dagre reserves this so long sentences expand downward without overlapping.
 */
function phraseHeight(text: string): number {
  const lines = Math.max(1, Math.ceil(text.length / PHRASE_CHARS_PER_LINE));
  return lines * PHRASE_LINE_H + 18; // + vertical padding
}

/** Build pastel concept nodes + cross-layer edges, positioned by dagre (BT). */
function buildDag(
  analysis: AnalysisResponse,
  showPhrases: boolean,
): { nodes: Node[]; edges: Edge[] } {
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

  // Phrase leaf nodes: the unique frases_origen of the LOWEST concept layer
  // (index 0). Each phrase points UP to every layer-0 concept that contains it
  // (a phrase may feed several concepts — the overlap rule), so they land at the
  // absolute bottom rank under dagre's bottom-to-top layout.
  const base = layers[0];
  if (showPhrases && base) {
    const byText = new Map<
      string,
      { text: string; conceptIds: string[]; firstColor: number }
    >();
    base.winning_concepts.forEach((c, ci) => {
      for (const raw of c.supporting_quotes) {
        const text = raw.trim();
        if (!text) continue;
        const key = text.toLowerCase();
        let entry = byText.get(key);
        if (!entry) {
          entry = { text, conceptIds: [], firstColor: ci };
          byText.set(key, entry);
        }
        if (!entry.conceptIds.includes(c.id)) entry.conceptIds.push(c.id);
      }
    });

    let pi = 0;
    for (const entry of byText.values()) {
      const phraseId = `phrase-${pi++}`;
      // Border = the concept's pastel when it feeds one concept; neutral when it
      // feeds several (overlap).
      const borderColor =
        entry.conceptIds.length > 1
          ? NEUTRAL_BORDER
          : pastelFor(entry.firstColor).border;
      const h = phraseHeight(entry.text);
      nodes.push({
        id: phraseId,
        data: { label: entry.text },
        position: { x: 0, y: 0 },
        sourcePosition: Position.Top,
        targetPosition: Position.Bottom,
        style: {
          width: PHRASE_W,
          height: h,
          padding: "6px 10px",
          background: "#f8fafc",
          border: `1.5px solid ${borderColor}`,
          color: "#1f2937",
          borderRadius: 8,
          fontSize: 11,
          fontWeight: 400,
          textAlign: "left",
          lineHeight: `${PHRASE_LINE_H}px`,
          display: "block",
          overflow: "visible",
          whiteSpace: "normal",
          wordBreak: "break-word",
        },
      });
      for (const cid of entry.conceptIds) {
        edges.push({
          id: `${phraseId}->${cid}`,
          source: phraseId,
          target: cid,
          type: "smoothstep",
          markerEnd: { type: MarkerType.ArrowClosed, color: "#cbd5e1" },
          style: { stroke: "#cbd5e1", strokeWidth: 1 },
        });
      }
    }
  }

  // dagre layout: bottom-to-top so macro concepts end up on top and phrase leaf
  // nodes sink to the absolute bottom. Sizes are read per-node (phrases differ).
  const sizeOf = (n: Node) => ({
    width: typeof n.style?.width === "number" ? n.style.width : NODE_W,
    height: typeof n.style?.height === "number" ? n.style.height : NODE_H,
  });

  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "BT", nodesep: 28, ranksep: 70, marginx: 20, marginy: 20 });
  g.setDefaultEdgeLabel(() => ({}));
  nodes.forEach((n) => g.setNode(n.id, sizeOf(n)));
  edges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);
  nodes.forEach((n) => {
    const pos = g.node(n.id);
    const { width, height } = sizeOf(n);
    // dagre gives the node center; reactflow wants the top-left corner.
    n.position = { x: pos.x - width / 2, y: pos.y - height / 2 };
  });

  return { nodes, edges };
}

export function TreeView({ analysis, language }: Props) {
  const [showPhrases, setShowPhrases] = useState(true);
  const { nodes, edges } = useMemo(
    () => buildDag(analysis, showPhrases),
    [analysis, showPhrases],
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
      <ReactFlow nodes={nodes} edges={edges} fitView minZoom={0.2} maxZoom={2}>
        <Panel position="top-left">
          <button className="tree-toggle" onClick={() => setShowPhrases((v) => !v)}>
            {tr(language, showPhrases ? "tree.hidePhrases" : "tree.showPhrases")}
          </button>
        </Panel>
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}
