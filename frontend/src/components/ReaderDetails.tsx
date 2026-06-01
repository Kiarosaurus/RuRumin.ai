/**
 * Reader — Mode 2 (Detalles).
 *
 * Transcript viewer focused on the DISCARDED phrases, color-coded per discarded
 * concept. The side panel shows one pastel card per discarded idea with its
 * category and the AI's extensive critical analysis.
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

export function ReaderDetails({ transcriptText, analysis, language }: Props) {
  const layers = useMemo(() => flattenLayers(analysis.root_layer), [analysis]);
  const [activeLevel, setActiveLevel] = useState<number>(layers[0]?.level ?? 0);

  const activeLayer = layers.find((l) => l.level === activeLevel) ?? layers[0];

  const concepts: HighlightConcept[] = useMemo(
    () =>
      (activeLayer?.discarded_concepts ?? []).map((c, i) => ({
        id: c.id,
        phrases: c.supporting_quotes,
        colorIndex: i,
      })),
    [activeLayer],
  );

  return (
    <div className="reader">
      <section className="reader-text">
        <h2>{tr(language, "reader.detailsTitle")}</h2>
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

        <h3>{tr(language, "reader.discards")}</h3>
        {activeLayer && activeLayer.discarded_concepts.length === 0 && (
          <p className="notice">{tr(language, "reader.noDiscards")}</p>
        )}
        <ul className="concept-list">
          {activeLayer?.discarded_concepts.map((c, i) => {
            const p = pastelFor(i);
            return (
              <li
                key={c.id}
                className="concept-item"
                style={{ background: p.bg, borderColor: p.border, color: p.text }}
              >
                <div className="concept-head">
                  <span className="concept-label">{c.label}</span>
                  <span className="concept-reason">{c.discard_reason}</span>
                </div>
                <p className="concept-just">{c.discard_justification}</p>
              </li>
            );
          })}
        </ul>
      </aside>
    </div>
  );
}
