/**
 * Fusion view — the result of merging several projects' accepted concepts.
 *
 * Split 50/50: the left half shows the fused concept DAG (TreeView), the right
 * half the FILTERABLE STACKED reader (FusionReader) — one text block per source
 * document so highlight overlap math stays local and never breaks across docs.
 *
 * A selected macro-concept is shared state between the two panes: clicking a
 * concept node in the DAG (or a card in the reader) filters the stacked
 * highlights to that concept's supporting phrases.
 */

import { useState } from "react";
import type { AnalysisResponse, Language, MergeSource } from "../types";
import { FusionReader } from "./FusionReader";
import { TreeView } from "./TreeView";

interface Props {
  /** Per-document corpus blocks the fusion was built from (for highlighting). */
  sources: MergeSource[];
  analysis: AnalysisResponse;
  language: Language;
}

export function FusionView({ sources, analysis, language }: Props) {
  const [selectedConceptId, setSelectedConceptId] = useState<string | null>(null);

  // Concept selection is a toggle: clicking the active one clears the filter.
  const selectConcept = (id: string) =>
    setSelectedConceptId((prev) => (prev === id ? null : id));

  return (
    <div className="fusion-view">
      <div className="fusion-pane fusion-pane-tree">
        <TreeView
          analysis={analysis}
          language={language}
          onConceptClick={selectConcept}
          selectedConceptId={selectedConceptId}
        />
      </div>
      <div className="fusion-pane fusion-pane-summary">
        <FusionReader
          sources={sources}
          analysis={analysis}
          language={language}
          selectedConceptId={selectedConceptId}
          onSelectConcept={selectConcept}
        />
      </div>
    </div>
  );
}
