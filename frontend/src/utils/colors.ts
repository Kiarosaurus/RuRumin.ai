/**
 * Pastel palette for concept highlighting.
 *
 * Each entry is a trio: a soft pastel `bg` for fills, plus a darker `border`
 * and `text` of the same hue for outlines and legible labels. Concepts are
 * assigned a color by index (wrapping), so the side panel, the highlighted
 * phrases and the DAG nodes all share one consistent color per concept.
 */

export interface Pastel {
  /** Soft fill (highlight background, card background). */
  bg: string;
  /** Stronger same-hue tone for borders. */
  border: string;
  /** Dark same-hue tone for legible text on the pastel fill. */
  text: string;
}

export const PASTELS: Pastel[] = [
  { bg: "#ffe4e6", border: "#fb7185", text: "#9f1239" }, // rose
  { bg: "#ffedd5", border: "#fb923c", text: "#9a3412" }, // orange
  { bg: "#fef3c7", border: "#f59e0b", text: "#92400e" }, // amber
  { bg: "#ecfccb", border: "#84cc16", text: "#3f6212" }, // lime
  { bg: "#d1fae5", border: "#10b981", text: "#065f46" }, // emerald
  { bg: "#ccfbf1", border: "#14b8a6", text: "#115e59" }, // teal
  { bg: "#cffafe", border: "#22d3ee", text: "#155e75" }, // cyan
  { bg: "#e0f2fe", border: "#38bdf8", text: "#075985" }, // sky
  { bg: "#e0e7ff", border: "#818cf8", text: "#3730a3" }, // indigo
  { bg: "#ede9fe", border: "#a78bfa", text: "#5b21b6" }, // violet
  { bg: "#fae8ff", border: "#e879f9", text: "#86198f" }, // fuchsia
  { bg: "#fce7f3", border: "#f472b6", text: "#9d174d" }, // pink
];

export const PASTEL_COUNT = PASTELS.length;

/** Stable pastel for a concept at `index` (wraps around, handles negatives). */
export function pastelFor(index: number): Pastel {
  const i = ((index % PASTEL_COUNT) + PASTEL_COUNT) % PASTEL_COUNT;
  return PASTELS[i];
}
