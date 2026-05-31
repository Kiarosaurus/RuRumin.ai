/**
 * Reader — Mode 1 (Resumen).
 *
 * Transcript viewer that highlights the WINNING phrases. A side panel lists one
 * button per analyzed layer; selecting a layer shows its winning concepts and
 * their grouping justifications, and drives which phrases are highlighted.
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

export function ReaderSummary({ transcriptText, analysis, language }: Props) {
  const layers = useMemo(
    () => flattenLayers(analysis.root_layer),
    [analysis],
  );
  const [activeLevel, setActiveLevel] = useState<number>(layers[0]?.level ?? 0);

  const activeLayer =
    layers.find((l) => l.level === activeLevel) ?? layers[0];

  const phrases = activeLayer
    ? activeLayer.winning_concepts.flatMap((c) => c.supporting_quotes)
    : [];

  return (
    <div className="reader">
      <section className="reader-text">
        <h2>{tr(language, "reader.summaryTitle")}</h2>
        <HighlightedText
          text={transcriptText}
          phrases={phrases}
          markClassName="mark-win"
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
              Layer {l.level}
            </button>
          ))}
        </div>

        <h3>{tr(language, "reader.winners")}</h3>
        <ul className="concept-list">
          {activeLayer?.winning_concepts.map((c) => (
            <li key={c.id} className="concept-item win">
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
          ))}
        </ul>
      </aside>
    </div>
  );
}
