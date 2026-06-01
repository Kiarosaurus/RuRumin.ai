/**
 * Transcript renderer with overlap-aware, color-coded highlighting.
 *
 * The text is split into atomic segments (see `buildOverlapSegments`); each is
 * painted with its concept's pastel color. A segment shared by several concepts
 * gets a striped gradient of all their colors. An optional `focusedRange`
 * (driven by keyboard navigation) outlines the focused idea and scrolls it into
 * view.
 */

import { useEffect, useMemo, useRef, type CSSProperties } from "react";
import { pastelFor } from "../utils/colors";
import { buildOverlapSegments, type ConceptPhrases } from "../utils/layers";

export interface HighlightConcept extends ConceptPhrases {
  /** Palette index — drives the pastel color of this concept. */
  colorIndex: number;
}

interface Props {
  text: string;
  concepts: HighlightConcept[];
  /** Currently focused idea span; its covering segments get the focus ring. */
  focusedRange?: { start: number; end: number } | null;
}

/** Striped gradient (or flat fill) for a segment covered by `ids`. */
function fillStyle(ids: string[], colorByConcept: Map<string, number>): CSSProperties {
  if (ids.length === 0) return {};
  if (ids.length === 1) {
    const p = pastelFor(colorByConcept.get(ids[0]) ?? 0);
    return { background: p.bg, color: p.text };
  }
  const stripe = 12;
  const stops = ids
    .map((id, i) => {
      const p = pastelFor(colorByConcept.get(id) ?? 0);
      return `${p.bg} ${i * stripe}px ${(i + 1) * stripe}px`;
    })
    .join(", ");
  return {
    backgroundImage: `repeating-linear-gradient(45deg, ${stops})`,
    color: "#1f2937",
  };
}

export function HighlightedText({ text, concepts, focusedRange }: Props) {
  const colorByConcept = useMemo(
    () => new Map(concepts.map((c) => [c.id, c.colorIndex])),
    [concepts],
  );
  const segments = useMemo(
    () => buildOverlapSegments(text, concepts.map((c) => ({ id: c.id, phrases: c.phrases }))),
    [text, concepts],
  );

  const focusRef = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    if (focusedRange) {
      focusRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [focusedRange?.start, focusedRange?.end]);

  let focusAssigned = false;
  return (
    <pre className="transcript">
      {segments.map((seg, i) => {
        if (seg.conceptIds.length === 0) {
          return <span key={i}>{seg.text}</span>;
        }
        const intersects =
          focusedRange != null &&
          seg.start < focusedRange.end &&
          seg.end > focusedRange.start;
        const isFirstFocus = intersects && !focusAssigned;
        if (isFirstFocus) focusAssigned = true;
        return (
          <span
            key={i}
            ref={isFirstFocus ? focusRef : undefined}
            className={`hl${intersects ? " idea-focused" : ""}`}
            style={fillStyle(seg.conceptIds, colorByConcept)}
          >
            {seg.text}
          </span>
        );
      })}
    </pre>
  );
}
