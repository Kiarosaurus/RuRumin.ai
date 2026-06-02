/**
 * Helpers for the manual pyramidal layer configuration.
 *
 * A pyramid is the per-layer winning-concept count, index 0 being the widest
 * base layer and the last entry the apex. The backend (`AnalysisOptions
 * .k_per_layer`) requires the list to be strictly decreasing and end in 1; these
 * helpers keep the UI's editable values inside that invariant.
 */

/** A sensible strictly-decreasing default for `n` layers, e.g. n=5 -> [5,4,3,2,1]. */
export function defaultPyramid(n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(Math.max(1, n - i));
  if (n > 0) out[n - 1] = 1; // apex is always a single concept
  return out;
}

/**
 * Coerce an edited pyramid back into the backend invariant: integers >= 1,
 * strictly decreasing toward the apex, last entry pinned to 1. Upper layers are
 * bumped up (never silently shrunk) so the user's intent is preserved as a floor.
 */
export function normalizePyramid(counts: number[]): number[] {
  const out = counts.map((c) =>
    Number.isFinite(c) ? Math.max(1, Math.floor(c)) : 1,
  );
  const n = out.length;
  if (n === 0) return out;
  out[n - 1] = 1; // apex fixed at 1, not editable
  for (let i = n - 2; i >= 0; i--) {
    if (out[i] <= out[i + 1]) out[i] = out[i + 1] + 1;
  }
  return out;
}
