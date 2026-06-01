/**
 * Reader — Mode 2 (Detalles).
 *
 * Transcript viewer focused on the DISCARDED phrases. The side panel shows, per
 * layer, each discarded idea with its category and the AI's critical analysis
 * explaining why discarding it was correct.
 */

import { useMemo, useState } from "react";
import type { AnalysisResponse, Language } from "../types";
import { flattenLayers } from "../utils/layers";
import { tr } from "../utils/i18n";
import { HighlightedText } from "./HighlightedText";

interface Props {
  transcriptText: string;
  analysis: AnalysisResponse;
  language: Language;
}

export function ReaderDetails({ transcriptText, analysis, language }: Props) {
  const layers = useMemo(
    () => flattenLayers(analysis.root_layer),
    [analysis],
  );
  const [activeLevel, setActiveLevel] = useState<number>(layers[0]?.level ?? 0);

  const activeLayer =
    layers.find((l) => l.level === activeLevel) ?? layers[0];

  const phrases = activeLayer
    ? activeLayer.discarded_concepts.flatMap((c) => c.supporting_quotes)
    : [];

  return (
    <div className="reader">
      <section className="reader-text">
        <h2>{tr(language, "reader.detailsTitle")}</h2>
        <HighlightedText
          text={transcriptText}
          phrases={phrases}
          markClassName="mark-discard"
        />
      </section>

      <aside className="reader-panel">
        <h3>{tr(language, "reader.layers")}</h3>
        <div className="layer-buttons">
          {layers.map((l) => (
            <button
              key={l.layer_id}
              className={l.level === activeLevel ? "active" : ""}
              onClick={() => setActiveLevel(l.level)}
            >
              {tr(language, "tree.legendLayer")} {l.level}
            </button>
          ))}
        </div>

        <h3>{tr(language, "reader.discards")}</h3>
        {activeLayer && activeLayer.discarded_concepts.length === 0 && (
          <p className="notice">{tr(language, "reader.noDiscards")}</p>
        )}
        <ul className="concept-list">
          {activeLayer?.discarded_concepts.map((c) => (
            <li key={c.id} className="concept-item discard">
              <div className="concept-head">
                <span className="concept-label">{c.label}</span>
                <span className="concept-reason">{c.discard_reason}</span>
              </div>
              <p className="concept-just">{c.discard_justification}</p>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
