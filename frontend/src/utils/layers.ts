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

// --------------------------------------------------------------------------- //
// Overlap-aware segmentation
//
// A single phrase may belong to several concepts (the backend now allows
// overlap). To render that, we split the transcript into ATOMIC segments at
// every match boundary, and tag each segment with the set of concepts whose
// match range fully covers it. The result tiles [0, text.length) exactly with
// no gaps and no overlaps, so React renders a flat, stable list of spans.
// --------------------------------------------------------------------------- //

/** A concept and the verbatim phrases that support it. */
export interface ConceptPhrases {
  id: string;
  phrases: string[];
}

/** A half-open match range [start, end) of one concept's phrase. */
export interface IdeaRange {
  conceptId: string;
  start: number;
  end: number;
}

/** An atomic, non-overlapping slice of the transcript. */
export interface OverlapSegment {
  text: string;
  start: number;
  end: number;
  /** Concepts covering this slice (empty = plain text). In concept order. */
  conceptIds: string[];
}

/**
 * All half-open match ranges of every concept's phrases within `text`.
 *
 * Case-insensitive. Indices are always within [0, text.length] and end > start,
 * so any consumer can `slice` safely.
 */
export function findIdeaRanges(text: string, concepts: ConceptPhrases[]): IdeaRange[] {
  const lower = text.toLowerCase();
  const ranges: IdeaRange[] = [];
  for (const concept of concepts) {
    for (const raw of concept.phrases) {
      const needle = raw.trim().toLowerCase();
      if (!needle) continue;
      let from = 0;
      for (;;) {
        const idx = lower.indexOf(needle, from);
        if (idx === -1) break;
        ranges.push({ conceptId: concept.id, start: idx, end: idx + needle.length });
        from = idx + needle.length; // never re-scans the same start -> terminates
      }
    }
  }
  ranges.sort((a, b) => a.start - b.start || a.end - b.end);
  return ranges;
}

/**
 * Split `text` into atomic segments, each tagged with the concepts covering it.
 *
 * Boundaries are the deduplicated, clamped, sorted set of every range's start
 * and end (plus 0 and length). Between two consecutive boundaries the covering
 * set is constant, so membership is computed once per slice. Empty slices are
 * skipped, guaranteeing valid, non-empty `slice` calls.
 */
export function buildOverlapSegments(
  text: string,
  concepts: ConceptPhrases[],
): OverlapSegment[] {
  const ranges = findIdeaRanges(text, concepts);
  if (ranges.length === 0) {
    return [{ text, start: 0, end: text.length, conceptIds: [] }];
  }

  const boundarySet = new Set<number>([0, text.length]);
  for (const r of ranges) {
    if (r.start >= 0 && r.start <= text.length) boundarySet.add(r.start);
    if (r.end >= 0 && r.end <= text.length) boundarySet.add(r.end);
  }
  const bounds = Array.from(boundarySet).sort((a, b) => a - b);

  // Concept render order (first appearance) keeps colors stable across slices.
  const order: string[] = [];
  for (const c of concepts) if (!order.includes(c.id)) order.push(c.id);

  const segments: OverlapSegment[] = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    const start = bounds[i];
    const end = bounds[i + 1];
    if (end <= start) continue; // guard against any zero-width interval

    const present = new Set<string>();
    for (const r of ranges) {
      if (r.start <= start && r.end >= end) present.add(r.conceptId);
    }
    const conceptIds = order.filter((id) => present.has(id));
    segments.push({ text: text.slice(start, end), start, end, conceptIds });
  }
  return segments;
}

/**
 * Ordered list of "ideas" (phrase occurrences) to navigate.
 *
 * When `conceptId` is given, only that concept's ranges; otherwise all ranges,
 * de-duplicated by span so an identical phrase shared by two concepts is one
 * navigation stop.
 */
export function navigableIdeas(
  text: string,
  concepts: ConceptPhrases[],
  conceptId?: string | null,
): IdeaRange[] {
  const all = findIdeaRanges(text, concepts);
  if (conceptId) return all.filter((r) => r.conceptId === conceptId);
  const seen = new Set<string>();
  const out: IdeaRange[] = [];
  for (const r of all) {
    const key = `${r.start}-${r.end}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}
