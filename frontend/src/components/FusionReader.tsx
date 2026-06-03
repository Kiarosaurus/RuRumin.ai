/**
 * Fusion reader — filterable STACKED transcript view.
 *
 * A fusion has no single transcript: it is built from several source documents'
 * accepted concepts. Concatenating them into one string would break the absolute
 * [start, end] indices `buildOverlapSegments` relies on, so instead each source
 * document is rendered as its OWN text block, stacked vertically. Every block
 * computes its overlap math against its own local text + local highlights, so the
 * indices can never collide across documents.
 *
 * A row of toggle chips at the top shows/hides individual source documents. When
 * a macro-concept is selected (via the DAG or a concept card) the highlights are
 * filtered to that concept's supporting phrases and routed to whichever document
 * blocks actually contain them.
 */

import { useEffect, useMemo, useState } from "react";
import type { AnalysisResponse, Language, MergeSource } from "../types";
import { pastelFor } from "../utils/colors";
import { flattenLayers } from "../utils/layers";
import { tr } from "../utils/i18n";
import { HighlightedText, type HighlightConcept } from "./HighlightedText";

interface Props {
  sources: MergeSource[];
  analysis: AnalysisResponse;
  language: Language;
  /** Concept selected in the DAG/cards; filters the highlighted phrases. */
  selectedConceptId: string | null;
  onSelectConcept: (conceptId: string) => void;
}

type Mode = "accepted" | "rejected";

export function FusionReader({
  sources,
  analysis,
  language,
  selectedConceptId,
  onSelectConcept,
}: Props) {
  const layers = useMemo(() => flattenLayers(analysis.root_layer), [analysis]);
  const [activeLevel, setActiveLevel] = useState<number>(layers[0]?.level ?? 0);
  const [mode, setMode] = useState<Mode>("accepted");
  /** Which source documents are currently shown (all on by default). */
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  // When a concept is selected elsewhere (DAG), jump to the layer that owns it so
  // its phrases are in scope, and switch to the accepted side where it lives.
  useEffect(() => {
    if (!selectedConceptId) return;
    const owner = layers.find((l) =>
      l.winning_concepts.some((c) => c.id === selectedConceptId),
    );
    if (owner) {
      setActiveLevel(owner.level);
      setMode("accepted");
    }
  }, [selectedConceptId, layers]);

  const activeLayer = layers.find((l) => l.level === activeLevel) ?? layers[0];

  // Concepts driving the highlights: the active layer's winning/discarded set,
  // narrowed to the selected concept when one is active.
  const concepts: HighlightConcept[] = useMemo(() => {
    const source =
      mode === "accepted"
        ? activeLayer?.winning_concepts ?? []
        : activeLayer?.discarded_concepts ?? [];
    return source
      .map((c, i) => ({ id: c.id, phrases: c.supporting_quotes, colorIndex: i }))
      .filter((c) => !selectedConceptId || c.id === selectedConceptId);
  }, [activeLayer, mode, selectedConceptId]);

  const sourceKey = (s: MergeSource, i: number) =>
    s.source_filename ?? `doc-${i}`;
  const visible = sources.filter((s, i) => !hidden.has(sourceKey(s, i)));

  const toggleSource = (key: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const winners = activeLayer?.winning_concepts ?? [];
  const discards = activeLayer?.discarded_concepts ?? [];

  return (
    <div className="reader fusion-reader">
      <section className="reader-text">
        <div className="fusion-doc-toggles" role="group" aria-label={tr(language, "fusion.sources")}>
          {sources.map((s, i) => {
            const key = sourceKey(s, i);
            const on = !hidden.has(key);
            return (
              <button
                key={key}
                className={`doc-chip${on ? " on" : ""}`}
                aria-pressed={on}
                onClick={() => toggleSource(key)}
              >
                {s.source_filename ?? tr(language, "fusion.doc", { n: i + 1 })}
              </button>
            );
          })}
        </div>

        <h2>
          {tr(
            language,
            mode === "accepted" ? "reader.summaryTitle" : "reader.detailsTitle",
          )}
        </h2>

        {visible.length === 0 ? (
          <p className="notice">{tr(language, "fusion.noDocs")}</p>
        ) : (
          <div className="fusion-stack">
            {visible.map((s, i) => (
              <article key={sourceKey(s, i)} className="fusion-doc-block">
                <h3 className="fusion-doc-title">
                  {s.source_filename ?? tr(language, "fusion.doc", { n: i + 1 })}
                </h3>
                {/* Each block computes overlap math on its OWN local text. */}
                <HighlightedText text={s.text} concepts={concepts} />
              </article>
            ))}
          </div>
        )}
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

        {selectedConceptId && (
          <button className="ghost fusion-clear" onClick={() => onSelectConcept(selectedConceptId)}>
            {tr(language, "fusion.clearSelection")}
          </button>
        )}

        {mode === "accepted" ? (
          <>
            <h3>{tr(language, "reader.winners")}</h3>
            <ul className="concept-list">
              {winners.map((c, i) => {
                const p = pastelFor(i);
                const selected = selectedConceptId === c.id;
                return (
                  <li
                    key={c.id}
                    className={`concept-item${selected ? " selected" : ""}`}
                    style={{ background: p.bg, borderColor: p.border, color: p.text }}
                    onClick={() => onSelectConcept(c.id)}
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
                const selected = selectedConceptId === c.id;
                return (
                  <li
                    key={c.id}
                    className={`concept-item${selected ? " selected" : ""}`}
                    style={{ background: p.bg, borderColor: p.border, color: p.text }}
                    onClick={() => onSelectConcept(c.id)}
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
