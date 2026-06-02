/**
 * AI quota manager popup.
 *
 * Lists the four Gemini models the backend cascade can use, each with its
 * strengths/weaknesses and the number of daily uses remaining (tracked locally
 * in IndexedDB, reset every calendar day). The user can pick the active model;
 * its id is sent as AnalysisOptions.model on the next analysis, and that model's
 * remaining quota is what gets debited.
 */

import type { Language } from "../types";
import { MODELS } from "../data/models";
import { tr } from "../utils/i18n";
import { remainingFor, type QuotaState } from "../services/quota";
import { pastelFor } from "../utils/colors";

interface Props {
  language: Language;
  quota: QuotaState;
  activeModel: string;
  onSelect: (modelId: string) => void;
  onClose: () => void;
}

export function ModelQuotaModal({
  language,
  quota,
  activeModel,
  onSelect,
  onClose,
}: Props) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal quota-modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h2>{tr(language, "quota.title")}</h2>
          <button className="modal-close" aria-label={tr(language, "quota.close")} onClick={onClose}>
            ×
          </button>
        </header>
        <div className="modal-body">
          <p className="modal-intro">{tr(language, "quota.intro")}</p>

          <ul className="quota-list">
            {MODELS.map((model, i) => {
              const left = remainingFor(model.id, model.dailyQuota, quota);
              const isActive = model.id === activeModel;
              const p = pastelFor(i);
              const pct = Math.round((left / model.dailyQuota) * 100);
              return (
                <li
                  key={model.id}
                  className={`quota-card${isActive ? " active" : ""}`}
                  style={{ borderColor: p.border }}
                >
                  <div className="quota-card-head">
                    <span className="quota-model-name">{model.label}</span>
                    {isActive && (
                      <span className="quota-active-badge" style={{ background: p.bg, color: p.text }}>
                        {tr(language, "quota.active")}
                      </span>
                    )}
                  </div>

                  <div className="quota-usage">
                    <span className="quota-usage-label">{tr(language, "quota.remaining")}</span>
                    <span className="quota-usage-value">
                      {tr(language, "quota.usesLeft", { left, total: model.dailyQuota })}
                    </span>
                  </div>
                  <div className="quota-bar">
                    <div
                      className="quota-bar-fill"
                      style={{ width: `${pct}%`, background: p.border }}
                    />
                  </div>

                  <dl className="quota-traits">
                    <dt>{tr(language, "quota.strengths")}</dt>
                    <dd>{model.strengths[language]}</dd>
                    <dt>{tr(language, "quota.weaknesses")}</dt>
                    <dd>{model.weaknesses[language]}</dd>
                  </dl>

                  <button
                    className="quota-use"
                    disabled={isActive}
                    onClick={() => onSelect(model.id)}
                  >
                    {isActive ? tr(language, "quota.active") : tr(language, "quota.use")}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
