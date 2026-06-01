/**
 * Dynamic loading screen for a streamed analysis run.
 *
 * `useAnalysisProgress` folds the NDJSON progress events from
 * `analyzeTranscriptStream` into a small state object; `AnalysisProgressOverlay`
 * renders it as a full-screen blocking overlay that shows, live: the current
 * phase (calling a model, sleeping for the RPM limit, validating, updating
 * views), a Gemini-request counter, a layer counter, and a progress bar. The
 * bar is derived from completed layers over the (event-provided) max, so it
 * moves backward if a run reports more layers than first expected.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { Language, ProgressEvent, ProgressPhase } from "../types";
import { tr } from "../utils/i18n";
import { Spinner } from "./Spinner";

export interface AnalysisProgressState {
  active: boolean;
  phase: ProgressPhase | "idle";
  model?: string;
  nextModel?: string;
  attempt: number;
  /** 0-based index of the layer currently being worked on. */
  layer: number;
  maxLayers: number;
  layersDone: number;
  requestCount: number;
  /** 1-based forced-run index within the current layer. */
  run: number;
  /** Total forced runs per layer. */
  runs: number;
  /** Seconds the backend reported it will sleep (rate_limit_wait). */
  sleepSeconds?: number;
  /** The waiting model's requests-per-minute ceiling (rate_limit_wait). */
  rpm?: number;
  /** Bumped on every rate_limit_wait so the countdown can restart. */
  sleepNonce: number;
}

const IDLE: AnalysisProgressState = {
  active: false,
  phase: "idle",
  attempt: 1,
  layer: 0,
  maxLayers: 0,
  layersDone: 0,
  requestCount: 0,
  run: 1,
  runs: 1,
  sleepNonce: 0,
};

function reduce(
  state: AnalysisProgressState,
  ev: ProgressEvent,
): AnalysisProgressState {
  const next = { ...state, active: true, phase: ev.phase };
  if (ev.max_layers != null) next.maxLayers = ev.max_layers;
  if (ev.layer != null) next.layer = ev.layer;
  if (ev.run != null) next.run = ev.run;
  if (ev.runs != null) next.runs = ev.runs;

  switch (ev.phase) {
    case "starting":
      return { ...IDLE, active: true, phase: "starting", maxLayers: next.maxLayers };
    case "calling_model":
      return {
        ...next,
        model: ev.model,
        attempt: ev.attempt ?? 1,
        requestCount: state.requestCount + 1,
        sleepSeconds: undefined,
      };
    case "rate_limit_wait":
      return {
        ...next,
        model: ev.model,
        sleepSeconds: ev.sleep_seconds,
        rpm: ev.rpm,
        sleepNonce: state.sleepNonce + 1,
      };
    case "model_fallback":
      return { ...next, model: ev.model, nextModel: ev.next_model };
    case "layer_done":
      return {
        ...next,
        layersDone: Math.max(state.layersDone, (ev.layer ?? 0) + 1),
        sleepSeconds: undefined,
      };
    default:
      return next;
  }
}

/** State container + event sink for a streamed analysis. */
export function useAnalysisProgress() {
  const [state, setState] = useState<AnalysisProgressState>(IDLE);
  const onProgress = useCallback((ev: ProgressEvent) => {
    setState((prev) => reduce(prev, ev));
  }, []);
  const reset = useCallback(() => setState(IDLE), []);
  return { state, onProgress, reset };
}

/** Build the localized headline for the current phase. */
function phaseMessage(
  state: AnalysisProgressState,
  language: Language,
  remaining: number | undefined,
): string {
  const layer1 = state.layer + 1; // display 1-based
  switch (state.phase) {
    case "layer_start":
      return tr(language, "progress.layer_start", {
        layer: layer1,
        max: state.maxLayers || layer1,
      });
    case "calling_model":
      return tr(language, "progress.calling_model", {
        model: state.model ?? "Gemini",
        attempt: state.attempt,
        run: state.run,
        runs: state.runs,
      });
    case "rate_limit_wait":
      return tr(language, "progress.rate_limit_wait", {
        rpm: state.rpm ?? "",
        model: state.model ?? "Gemini",
        seconds: remaining ?? Math.ceil(state.sleepSeconds ?? 0),
      });
    case "model_fallback":
      return tr(language, "progress.model_fallback", {
        model: state.model ?? "",
        next: state.nextModel ?? "",
      });
    case "validating":
      return tr(language, "progress.validating", { layer: layer1 });
    case "layer_done":
      return tr(language, "progress.layer_done", { layer: layer1 });
    case "finalizing":
      return tr(language, "progress.finalizing");
    case "starting":
    default:
      return tr(language, "progress.starting");
  }
}

interface OverlayProps {
  state: AnalysisProgressState;
  language: Language;
}

export function AnalysisProgressOverlay({ state, language }: OverlayProps) {
  // Live countdown for the rate-limit sleep: seeded by the backend's
  // sleep_seconds, ticked down locally so the user sees the clock move.
  const [remaining, setRemaining] = useState<number | undefined>(undefined);
  const tick = useRef<number | undefined>(undefined);

  useEffect(() => {
    window.clearInterval(tick.current);
    if (state.phase !== "rate_limit_wait" || state.sleepSeconds == null) {
      setRemaining(undefined);
      return;
    }
    setRemaining(Math.ceil(state.sleepSeconds));
    tick.current = window.setInterval(() => {
      setRemaining((r) => (r != null && r > 0 ? r - 1 : 0));
    }, 1000);
    return () => window.clearInterval(tick.current);
    // Restart whenever a new sleep is announced.
  }, [state.phase, state.sleepNonce, state.sleepSeconds]);

  const percent =
    state.maxLayers > 0
      ? Math.min(100, Math.round((state.layersDone / state.maxLayers) * 100))
      : 0;

  return (
    <div className="loading-overlay" role="alert" aria-busy="true">
      <Spinner size={40} />
      <p className="progress-headline">{phaseMessage(state, language, remaining)}</p>

      <div
        className="progress-bar"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="progress-bar-fill" style={{ width: `${percent}%` }} />
      </div>

      <p className="progress-meta">
        {state.maxLayers > 0 &&
          tr(language, "progress.layerCounter", {
            layer: Math.min(state.layer + 1, state.maxLayers),
            max: state.maxLayers,
          })}
        {state.requestCount > 0 && (
          <>
            {" · "}
            {tr(language, "progress.requests", { count: state.requestCount })}
          </>
        )}
      </p>
    </div>
  );
}
