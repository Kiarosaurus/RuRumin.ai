/**
 * Analysis configuration popup, shown right before an analysis (import or new
 * run). The user chooses:
 *   - Automatic: Gemini decides the structure (a fixed 5 layers, >= 3); the
 *     backend derives the strictly-decreasing pyramidal widths from k_top.
 *   - Manual: pick the number of layers and how many concepts each layer keeps.
 *     The pyramid invariant is enforced live — strictly decreasing toward the
 *     apex, whose single concept is fixed and not editable.
 */

import { useState } from "react";
import type { Language } from "../types";
import { tr } from "../utils/i18n";
import { defaultPyramid, normalizePyramid } from "../utils/pyramid";

/** What the popup resolves to; maps onto AnalysisOptions (model added later). */
export interface AnalysisConfigResult {
  max_layers: number;
  /** Run the Pass 0 structural pre-pass (one extra AI call) before the layers. */
  structural_pass: boolean;
  /** Manual pyramid; omitted in automatic mode (backend computes it). */
  k_per_layer?: number[];
}

interface Props {
  /** Filename being configured, shown in the intro line. */
  name: string;
  language: Language;
  onCancel: () => void;
  onConfirm: (result: AnalysisConfigResult) => void;
}

/** Automatic mode: a fixed depth that satisfies the "minimum 3 layers" rule. */
const AUTO_LAYERS = 5;
const MIN_MANUAL_LAYERS = 2;
const MAX_MANUAL_LAYERS = 8;

export function AnalysisConfigModal({ name, language, onCancel, onConfirm }: Props) {
  const [mode, setMode] = useState<"auto" | "manual">("auto");
  const [layerCount, setLayerCount] = useState(AUTO_LAYERS);
  const [counts, setCounts] = useState<number[]>(() => defaultPyramid(AUTO_LAYERS));
  /** Pass 0 structural pre-pass opt-in (off by default; one extra AI call). */
  const [structural, setStructural] = useState(false);

  const changeLayerCount = (raw: number) => {
    const n = Math.min(
      MAX_MANUAL_LAYERS,
      Math.max(MIN_MANUAL_LAYERS, Number.isFinite(raw) ? Math.floor(raw) : AUTO_LAYERS),
    );
    setLayerCount(n);
    setCounts(defaultPyramid(n));
  };

  const editCount = (index: number, raw: number) => {
    setCounts((prev) => {
      const next = [...prev];
      next[index] = raw;
      return next;
    });
  };

  const confirm = () => {
    if (mode === "auto") {
      onConfirm({ max_layers: AUTO_LAYERS, structural_pass: structural });
    } else {
      const k_per_layer = normalizePyramid(counts);
      onConfirm({
        max_layers: k_per_layer.length,
        k_per_layer,
        structural_pass: structural,
      });
    }
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div
        className="modal config-modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h2>{tr(language, "config.title")}</h2>
        </header>
        <div className="modal-body">
          <p className="modal-intro">{tr(language, "config.intro", { name })}</p>

          <div className="config-options">
            <label className={`config-option${mode === "auto" ? " selected" : ""}`}>
              <input
                type="radio"
                name="config-mode"
                checked={mode === "auto"}
                onChange={() => setMode("auto")}
              />
              <span className="config-option-title">{tr(language, "config.auto")}</span>
              <span className="config-option-desc">{tr(language, "config.autoDesc")}</span>
            </label>

            <label className={`config-option${mode === "manual" ? " selected" : ""}`}>
              <input
                type="radio"
                name="config-mode"
                checked={mode === "manual"}
                onChange={() => setMode("manual")}
              />
              <span className="config-option-title">{tr(language, "config.manual")}</span>
              <span className="config-option-desc">{tr(language, "config.manualDesc")}</span>
            </label>
          </div>

          {mode === "manual" && (
            <div className="config-manual">
              <label className="config-layers-count">
                {tr(language, "config.layersCount")}
                <input
                  type="number"
                  min={MIN_MANUAL_LAYERS}
                  max={MAX_MANUAL_LAYERS}
                  step={1}
                  value={layerCount}
                  onChange={(e) => changeLayerCount(e.target.valueAsNumber)}
                />
              </label>

              <ul className="pyramid-rows">
                {counts.map((value, i) => {
                  const isApex = i === counts.length - 1;
                  const tag =
                    i === 0
                      ? tr(language, "config.base")
                      : isApex
                        ? tr(language, "config.apex")
                        : "";
                  return (
                    <li key={i} className="pyramid-row">
                      <span className="pyramid-row-label">
                        {tr(language, "config.layer", { n: i + 1 })}
                        {tag && <span className="pyramid-row-tag"> · {tag}</span>}
                      </span>
                      {isApex ? (
                        <span className="pyramid-apex">{tr(language, "config.apexFixed")}</span>
                      ) : (
                        <input
                          type="number"
                          min={2}
                          step={1}
                          value={Number.isFinite(value) ? value : ""}
                          onChange={(e) => editCount(i, e.target.valueAsNumber)}
                          onBlur={() => setCounts((prev) => normalizePyramid(prev))}
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
              <p className="modal-hint">{tr(language, "config.pyramidHint")}</p>
            </div>
          )}

          <label className="config-structural">
            <input
              type="checkbox"
              checked={structural}
              onChange={(e) => setStructural(e.target.checked)}
            />
            <span className="config-structural-text">
              {tr(language, "config.structural")}
            </span>
          </label>
        </div>

        <footer className="modal-actions">
          <button className="ghost" onClick={onCancel}>
            {tr(language, "config.cancel")}
          </button>
          <button className="primary" onClick={confirm}>
            {tr(language, "config.start")}
          </button>
        </footer>
      </div>
    </div>
  );
}
