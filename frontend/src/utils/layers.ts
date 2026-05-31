/**
 * Helpers for traversing the recursive analysis tree and for building
 * highlight ranges over the transcript.
 */

import type { AnalysisLayer } from "../types";

/** Flatten the recursive layer tree into a depth-first ordered list. */
export function flattenLayers(root: AnalysisLayer): AnalysisLayer[] {
  const out: AnalysisLayer[] = [];
  const walk = (layer: AnalysisLayer) => {
    out.push(layer);
    layer.sub_layers.forEach(walk);
  };
  walk(root);
  return out;
}

/** A contiguous span of text to highlight. */
export interface HighlightSegment {
  text: string;
  highlighted: boolean;
}

/**
 * Split `text` into highlighted / plain segments for the given phrases.
 *
 * Case-insensitive, longest-phrase-first so overlapping quotes don't break.
 * Returns segments in document order, ready to render as <mark> / plain spans.
 */
export function buildHighlightSegments(
  text: string,
  phrases: string[],
): HighlightSegment[] {
  const cleaned = phrases.map((p) => p.trim()).filter(Boolean);
  if (cleaned.length === 0) return [{ text, highlighted: false }];

  // Find every match range.
  const ranges: Array<{ start: number; end: number }> = [];
  const lowerText = text.toLowerCase();
  for (const phrase of cleaned) {
    const needle = phrase.toLowerCase();
    let from = 0;
    for (;;) {
      const idx = lowerText.indexOf(needle, from);
      if (idx === -1) break;
      ranges.push({ start: idx, end: idx + needle.length });
      from = idx + needle.length;
    }
  }
  if (ranges.length === 0) return [{ text, highlighted: false }];

  // Merge overlapping ranges.
  ranges.sort((a, b) => a.start - b.start);
  const merged: Array<{ start: number; end: number }> = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end) {
      last.end = Math.max(last.end, r.end);
    } else {
      merged.push({ ...r });
    }
  }

  // Emit segments.
  const segments: HighlightSegment[] = [];
  let cursor = 0;
  for (const r of merged) {
    if (r.start > cursor) {
      segments.push({ text: text.slice(cursor, r.start), highlighted: false });
    }
    segments.push({ text: text.slice(r.start, r.end), highlighted: true });
    cursor = r.end;
  }
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), highlighted: false });
  }
  return segments;
}
