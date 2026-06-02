/**
 * Reader — unified transcript view (Resumen).
 *
 * Transcript viewer that highlights phrases color-coded per concept, with a
 * styled toggle to switch between the ACCEPTED (winning) concepts and the
 * REJECTED (discarded) ones. Switching flips both the side-panel cards and the
 * highlighted phrases in the text. This replaces the previously separate
 * "Detalles / Descartes" view.
 */

import { useMemo, useState } from "react";
import type { AnalysisResponse, Language } from "../types";
import { pastelFor } from "../utils/colors";
import { flattenLayers } from "../utils/layers";
import { tr } from "../utils/i18n";
import { HighlightedText, type HighlightConcept } from "./HighlightedText";
import { useIdeaNavigation } from "./useIdeaNavigation";

interface Props {
  transcriptText: string;
  analysis: AnalysisResponse;
  language: Language;
}

type Mode = "accepted" | "rejected";

export function ReaderSummary({ transcriptText, analysis, language }: Props) {
  const layers = useMemo(() => flattenLayers(analysis.root_layer), [analysis]);
  const [activeLevel, setActiveLevel] = useState<number>(layers[0]?.level ?? 0);
  const [mode, setMode] = useState<Mode>("accepted");

  const activeLayer = layers.find((l) => l.level === activeLevel) ?? layers[0];

  // The concepts feeding the highlight + side panel depend on the toggle.
  const concepts: HighlightConcept[] = useMemo(() => {
    const source =
      mode === "accepted"
        ? activeLayer?.winning_concepts ?? []
        : activeLayer?.discarded_concepts ?? [];
    return source.map((c, i) => ({
      id: c.id,
      phrases: c.supporting_quotes,
      colorIndex: i,
    }));
  }, [activeLayer, mode]);

  const nav = useIdeaNavigation(transcriptText, concepts);

  const winners = activeLayer?.winning_concepts ?? [];
  const discards = activeLayer?.discarded_concepts ?? [];

  return (
    <div className="reader">
      <section className="reader-text">
        {nav.ideas.length > 0 && (
          <div className="idea-counter">
            {tr(language, "reader.ideaCounter", {
              current: nav.index < 0 ? 0 : nav.index + 1,
              total: nav.ideas.length,
            })}
          </div>
        )}
        <h2>
          {tr(
            language,
            mode === "accepted" ? "reader.summaryTitle" : "reader.detailsTitle",
          )}
        </h2>
        <HighlightedText
          text={transcriptText}
          concepts={concepts}
          focusedRange={nav.focusedRange}
        />
      </section>

      <aside className="reader-panel">
        <div className="view-toggle" role="tablist" aria-label={tr(language, "reader.winners")}>
          <button
            role="tab"
            aria-selected={mode === "accepted"}
            className={mode === "accepted" ? "active" : ""}
            onClick={() => setMode("accepted")}
          >
            {tr(language, "reader.accepted")}
          </button>
          <button
            role="tab"
            aria-selected={mode === "rejected"}
            className={mode === "rejected" ? "active" : ""}
            onClick={() => setMode("rejected")}
          >
            {tr(language, "reader.rejected")}
          </button>
        </div>

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

        {mode === "accepted" ? (
          <>
            <h3>{tr(language, "reader.winners")}</h3>
            <ul className="concept-list">
              {winners.map((c, i) => {
                const p = pastelFor(i);
                const selected = nav.selectedId === c.id;
                return (
                  <li
                    key={c.id}
                    className={`concept-item${selected ? " selected" : ""}`}
                    style={{ background: p.bg, borderColor: p.border, color: p.text }}
                    onClick={() => nav.toggleSelect(c.id)}
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
          </>
        ) : (
          <>
            <h3>{tr(language, "reader.discards")}</h3>
            {discards.length === 0 && (
              <p className="notice">{tr(language, "reader.noDiscards")}</p>
            )}
            <ul className="concept-list">
              {discards.map((c, i) => {
                const p = pastelFor(i);
                const selected = nav.selectedId === c.id;
                return (
                  <li
                    key={c.id}
                    className={`concept-item${selected ? " selected" : ""}`}
                    style={{ background: p.bg, borderColor: p.border, color: p.text }}
                    onClick={() => nav.toggleSelect(c.id)}
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
          </>
        )}
      </aside>
    </div>
  );
}
