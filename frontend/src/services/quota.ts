/**
 * Local, per-model daily quota tracking (IndexedDB).
 *
 * The free Gemini tier caps requests-per-DAY (RPD) per model. Because this
 * desktop app is the only consumer of that quota, we can simulate the remaining
 * daily budget entirely client-side: every analyzer run spends N requests
 * (`metadata.total_runs`) against the model it used, and the counter resets when
 * the calendar day rolls over.
 *
 * State is a single IndexedDB record (via idb-keyval). All operations are
 * best-effort — a storage failure only loses the simulation for the session, it
 * must never crash the app.
 */

import { get, set } from "idb-keyval";

/** Single key holding the quota usage for the current day. */
const QUOTA_KEY = "rurumin:quota";

/** Per-model usage for one calendar day. */
export interface QuotaState {
  /** Local calendar day (YYYY-MM-DD) the counters belong to. */
  date: string;
  /** requests already spent today, keyed by model id. */
  used: Record<string, number>;
}

/** Local calendar day as YYYY-MM-DD (drives the daily reset). */
function today(): string {
  const d = new Date();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** A fresh, empty state for today. */
function emptyState(): QuotaState {
  return { date: today(), used: {} };
}

/**
 * Load today's quota usage, resetting automatically when the stored record is
 * from a previous day (or when nothing/invalid is stored). Best-effort.
 */
export async function loadQuota(): Promise<QuotaState> {
  try {
    const stored = await get<QuotaState>(QUOTA_KEY);
    if (stored && stored.date === today() && stored.used) return stored;
  } catch (err) {
    console.warn("No se pudo leer la cuota desde IndexedDB:", err);
  }
  const fresh = emptyState();
  try {
    await set(QUOTA_KEY, fresh);
  } catch {
    /* ignore: persistence unavailable */
  }
  return fresh;
}

/**
 * Spend `requests` against `model` for today and persist. Returns the updated
 * state so the caller can refresh the UI without another read.
 */
export async function consumeQuota(
  model: string,
  requests: number,
): Promise<QuotaState> {
  const state = await loadQuota();
  state.used[model] = (state.used[model] ?? 0) + Math.max(0, requests);
  try {
    await set(QUOTA_KEY, state);
  } catch (err) {
    console.warn("No se pudo guardar la cuota en IndexedDB:", err);
  }
  return state;
}

/** Remaining daily uses for `model` given its `dailyQuota`. Never negative. */
export function remainingFor(
  model: string,
  dailyQuota: number,
  state: QuotaState,
): number {
  return Math.max(0, dailyQuota - (state.used[model] ?? 0));
}
