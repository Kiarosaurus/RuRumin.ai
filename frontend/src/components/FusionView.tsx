/**
 * Fusion view — the result of merging several projects' accepted concepts.
 *
 * Split 50/50: the left half shows the fused concept DAG (TreeView), the right
 * half the unified reader (ReaderSummary) with its Accepted/Rejected toggle.
 * Both operate on the same fused AnalysisResponse and synthetic corpus.
 */

import type { AnalysisResponse, Language } from "../types";
import { ReaderSummary } from "./ReaderSummary";
import { TreeView } from "./TreeView";

interface Props {
  /** Synthetic concept corpus the fusion was analyzed over (for highlighting). */
  transcriptText: string;
  analysis: AnalysisResponse;
  language: Language;
}

export function FusionView({ transcriptText, analysis, language }: Props) {
  return (
    <div className="fusion-view">
      <div className="fusion-pane fusion-pane-tree">
        <TreeView analysis={analysis} language={language} />
      </div>
      <div className="fusion-pane fusion-pane-summary">
        <ReaderSummary
          transcriptText={transcriptText}
          analysis={analysis}
          language={language}
        />
      </div>
    </div>
  );
}
