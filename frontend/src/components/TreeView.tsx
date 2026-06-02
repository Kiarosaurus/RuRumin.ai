/**
 * Mode 3 — Concept DAG (Directed Acyclic Graph).
 *
 * The analysis is no longer a strict tree: a phrase can feed several concepts,
 * and granular concepts roll up into macro ones. We render a top-down DAG with
 * reactflow, laid out by dagre:
 *   - The single macro concept (apex layer, more general) sits at the TOP.
 *   - It branches DOWN into the more granular concepts of the layers below.
 *   - The base layer's supporting phrases (frases_origen) sit at the very BOTTOM
 *     as leaf nodes.
 *
 * Edges are STRAIGHT (no "Manhattan"/step routing) and flow downward: every node
 * exposes its source handle at the bottom and its target handle at the top, so a
 * parent connects from its bottom edge straight to the child's top edge.
 *
 * Concept nodes are small, clean rectangles showing only the concept name,
 * painted with the same pastel color the readers use. Phrase leaf nodes are
 * narrower and auto-size their height so the full sentence wraps inside the box.
 */

import { useEffect, useMemo, useState } from "react";
import ReactFlow, {
  Background,
  Controls,
  MarkerType,
  Panel,
  Position,
  ReactFlowProvider,
  useReactFlow,
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

// Phrase (leaf) nodes are deliberately narrow; their height grows to fit the
// wrapped sentence (see phraseHeight) so text never spills outside the box.
const PHRASE_W = 210;
const PHRASE_LINE_H = 18;
// Conservative chars-per-line for the narrow box (under the true fit) so the
// reserved height never falls short of the wrapped text.
const PHRASE_CHARS_PER_LINE = 26;
const NEUTRAL_BORDER = "#94a3b8";

/**
 * Height a phrase node needs to fit its full wrapped text — grows with length,
 * no cap. dagre reserves this so long sentences expand without overlapping; the
 * box itself uses `height: auto` + this as `minHeight` so it can only grow.
 */
function phraseHeight(text: string): number {
  const lines = Math.max(1, Math.ceil(text.length / PHRASE_CHARS_PER_LINE));
  return lines * PHRASE_LINE_H + 18; // + vertical padding
}

/** Build pastel concept nodes + cross-layer edges, positioned by dagre (TB). */
function buildDag(
  analysis: AnalysisResponse,
  showPhrases: boolean,
): { nodes: Node[]; edges: Edge[] } {
  const layers = flattenLayers(analysis.root_layer); // index 0 = base (widest)
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  layers.forEach((layer) => {
    layer.winning_concepts.forEach((c, i) => {
      const p = pastelFor(i);
      nodes.push({
        id: c.id,
        data: { label: c.label },
        position: { x: 0, y: 0 }, // overwritten by dagre below
        // Top-down flow: connect from a node's bottom to its child's top.
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top,
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

  // The macro layer (L+1, more general) feeds DOWN into the granular layer (L):
  // full bipartite, source = macro concept, target = granular concept, so the
  // apex ends up on top and edges point downward.
  for (let li = 0; li < layers.length - 1; li++) {
    const lower = layers[li].winning_concepts; // granular (below)
    const upper = layers[li + 1].winning_concepts; // macro (above)
    for (const macro of upper) {
      for (const granular of lower) {
        edges.push({
          id: `${macro.id}->${granular.id}`,
          source: macro.id,
          target: granular.id,
          type: "straight",
          markerEnd: { type: MarkerType.ArrowClosed, color: "#94a3b8" },
          style: { stroke: "#94a3b8", strokeWidth: 1 },
        });
      }
    }
  }

  // Phrase leaf nodes: the unique frases_origen of the BASE concept layer
  // (index 0). Each base concept points DOWN to every phrase that supports it
  // (a phrase may be fed by several concepts — the overlap rule), so they land
  // at the absolute bottom rank under dagre's top-to-bottom layout.
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
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top,
        style: {
          width: PHRASE_W,
          // Auto height + minHeight: the box can only grow to fit the wrapped
          // text, never clip it. dagre reads `minHeight` for spacing (see sizeOf).
          height: "auto",
          minHeight: h,
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
          id: `${cid}->${phraseId}`,
          source: cid,
          target: phraseId,
          type: "straight",
          markerEnd: { type: MarkerType.ArrowClosed, color: "#cbd5e1" },
          style: { stroke: "#cbd5e1", strokeWidth: 1 },
        });
      }
    }
  }

  // dagre layout: top-to-bottom so the macro apex ends up on top and phrase leaf
  // nodes sink to the absolute bottom. Sizes are read per-node (phrases differ);
  // phrase boxes report their reserved height via `minHeight`.
  const sizeOf = (n: Node) => {
    const width = typeof n.style?.width === "number" ? n.style.width : NODE_W;
    const height =
      typeof n.style?.height === "number"
        ? n.style.height
        : typeof n.style?.minHeight === "number"
          ? n.style.minHeight
          : NODE_H;
    return { width, height };
  };

  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "TB", nodesep: 28, ranksep: 70, marginx: 20, marginy: 20 });
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

/** Inner flow: lives inside ReactFlowProvider so it can drive the viewport. */
function TreeFlow({ analysis, language }: Props) {
  const [showPhrases, setShowPhrases] = useState(true);
  const { fitView } = useReactFlow();
  const { nodes, edges } = useMemo(
    () => buildDag(analysis, showPhrases),
    [analysis, showPhrases],
  );

  // Re-center the tree whenever the phrase leaves are toggled. Deferred a frame
  // so reactflow has ingested the new node set before we fit to it.
  useEffect(() => {
    const id = requestAnimationFrame(() => fitView({ duration: 800 }));
    return () => cancelAnimationFrame(id);
  }, [showPhrases, fitView]);

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

export function TreeView(props: Props) {
  // Provider gives TreeFlow access to the reactflow instance (fitView).
  return (
    <ReactFlowProvider>
      <TreeFlow {...props} />
    </ReactFlowProvider>
  );
}
