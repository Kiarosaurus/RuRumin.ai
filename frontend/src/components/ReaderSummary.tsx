/**
 * Reader — Mode 1 (Resumen).
 *
 * Transcript viewer that highlights the WINNING phrases, color-coded per
 * concept. A side panel lists one card per winning concept (in its pastel
 * color); the highlighted phrases use the matching colors, with striped
 * gradients where phrases overlap between concepts.
 */

import { useMemo, useState } from "react";
import type { AnalysisResponse, Language } from "../types";
import { pastelFor } from "../utils/colors";
import { flattenLayers } from "../utils/layers";
import { tr } from "../utils/i18n";
import { HighlightedText, type HighlightConcept } from "./HighlightedText";

interface Props {
  transcriptText: string;
  analysis: AnalysisResponse;
  language: Language;
}

export function ReaderSummary({ transcriptText, analysis, language }: Props) {
  const layers = useMemo(() => flattenLayers(analysis.root_layer), [analysis]);
  const [activeLevel, setActiveLevel] = useState<number>(layers[0]?.level ?? 0);

  const activeLayer = layers.find((l) => l.level === activeLevel) ?? layers[0];

  const concepts: HighlightConcept[] = useMemo(
    () =>
      (activeLayer?.winning_concepts ?? []).map((c, i) => ({
        id: c.id,
        phrases: c.supporting_quotes,
        colorIndex: i,
      })),
    [activeLayer],
  );

  return (
    <div className="reader">
      <section className="reader-text">
        <h2>{tr(language, "reader.summaryTitle")}</h2>
        <HighlightedText text={transcriptText} concepts={concepts} />
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

        <h3>{tr(language, "reader.winners")}</h3>
        <ul className="concept-list">
          {activeLayer?.winning_concepts.map((c, i) => {
            const p = pastelFor(i);
            return (
              <li
                key={c.id}
                className="concept-item"
                style={{ background: p.bg, borderColor: p.border, color: p.text }}
              >
                <div className="concept-head">
                  <span className="concept-label">
                    #{c.rank} {c.label}
                  </span>
                  <span className="concept-score">
                    {tr(language, "reader.ktop")} {c.k_top_score.toFixed(2)}
                  </span>
                </div>
                <p className="concept-just">{c.grouping_justification}</p>
              </li>
            );
          })}
        </ul>
      </aside>
    </div>
  );
}
