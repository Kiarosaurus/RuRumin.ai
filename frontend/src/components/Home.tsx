/**
 * Home view — visual repository of processed/active documents.
 *
 * Includes a language selector (es/en/zh) and an AI quota manager. Importing or
 * re-analyzing a document no longer uses an inline layers field: it opens the
 * analysis-configuration popup (Automatic vs Manual pyramid) and runs with the
 * chosen structure and the active model. Blocking loader + disabled controls
 * prevent duplicate submissions; errors surface as localized toasts.
 */

import { useRef, useState } from "react";
import type { AnalysisRecord, DocumentRecord } from "../data/mockData";
import { MODELS } from "../data/models";
import { analyzeTranscriptStream, ApiError } from "../services/apiClient";
import {
  DocxExtractionError,
  extractDocxText,
} from "../services/docxExtractor";
import type { QuotaState } from "../services/quota";
import type { AnalysisOptions, Language } from "../types";
import { LANGUAGE_LABELS, LANGUAGE_OPTIONS, tr, type UIKey } from "../utils/i18n";
import {
  AnalysisConfigModal,
  type AnalysisConfigResult,
} from "./AnalysisConfigModal";
import {
  AnalysisProgressOverlay,
  useAnalysisProgress,
} from "./AnalysisProgress";
import { ModelQuotaModal } from "./ModelQuotaModal";
import { Spinner } from "./Spinner";
import type { ToastState } from "./Toast";

interface Props {
  documents: DocumentRecord[];
  busyIds: string[];
  language: Language;
  /** Active Gemini model id (drives AnalysisOptions.model + quota debit). */
  selectedModel: string;
  /** Local daily-quota state, for the AI manager display. */
  quota: QuotaState;
  onLanguageChange: (language: Language) => void;
  onSelectModel: (modelId: string) => void;
  /** Debit `requests` from `model` after a finished analysis. */
  onConsumeQuota: (model: string, requests: number) => void;
  onOpen: (doc: DocumentRecord) => void;
  onAnalyzed: (doc: DocumentRecord) => void;
  onDelete: (id: string) => void;
  onReanalyze: (doc: DocumentRecord, options: AnalysisConfigResult) => void;
  onMerge: (docs: DocumentRecord[], options: AnalysisConfigResult) => void;
  notify: (toast: ToastState) => void;
}

const STATUS_KEY: Record<DocumentRecord["status"], UIKey> = {
  processed: "status.processed",
  processing: "status.processing",
  failed: "status.failed",
};

/** Which action is waiting for the configuration popup to be confirmed. */
type PendingAction =
  | { type: "import"; file: File }
  | { type: "reanalyze"; doc: DocumentRecord }
  | { type: "merge"; docs: DocumentRecord[] };

export function Home({
  documents,
  busyIds,
  language,
  selectedModel,
  quota,
  onLanguageChange,
  onSelectModel,
  onConsumeQuota,
  onOpen,
  onAnalyzed,
  onDelete,
  onReanalyze,
  onMerge,
  notify,
}: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [isAnalyzing, setAnalyzing] = useState(false);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [quotaOpen, setQuotaOpen] = useState(false);
  /** Ids of documents checked for a fusion (none selected by default). */
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const { state: progress, onProgress, reset: resetProgress } =
    useAnalysisProgress();

  const activeModelLabel =
    MODELS.find((m) => m.id === selectedModel)?.label ?? selectedModel;

  /** Selecting a .docx opens the config popup; analysis runs once confirmed. */
  function pickFile(file: File | undefined) {
    if (fileInput.current) fileInput.current.value = "";
    if (!file || isAnalyzing) return;
    setPending({ type: "import", file });
  }

  /** Run the import after the popup resolves the analysis structure. */
  async function runImport(file: File, config: AnalysisConfigResult) {
    resetProgress();
    setAnalyzing(true);
    try {
      // 1. Extract clean text from the .docx (rejects non-Word files).
      const extracted = await extractDocxText(file, language);

      // 2. Stream the analysis with the chosen structure + active model.
      const options: Partial<AnalysisOptions> = {
        max_layers: config.max_layers,
        model: selectedModel,
        ...(config.k_per_layer ? { k_per_layer: config.k_per_layer } : {}),
      };
      const analysis = await analyzeTranscriptStream(
        extracted.text,
        language,
        onProgress,
        options,
        extracted.filename,
      );

      // 3. Build the repository record from the response.
      const record: AnalysisRecord = {
        id: analysis.request_id,
        timestamp: analysis.metadata.created_at,
        max_layers: config.max_layers,
        result: analysis,
      };
      const doc: DocumentRecord = {
        id: analysis.request_id,
        filename: extracted.filename,
        status: "processed",
        created_at: analysis.metadata.created_at,
        language,
        transcript_text: extracted.text,
        analyses: [record],
      };

      notify({
        kind: "success",
        message: tr(language, "toast.analyzed", { name: extracted.filename }),
      });
      onAnalyzed(doc);
      // 4. Debit the simulated daily quota for the model that ran.
      onConsumeQuota(selectedModel, analysis.metadata.total_runs);
    } catch (err) {
      if (err instanceof DocxExtractionError) {
        // Message is already localized by the extractor.
        notify({ kind: "error", message: err.message });
      } else if (err instanceof ApiError) {
        const prefix =
          err.status === 0
            ? tr(language, "toast.noConnection")
            : tr(language, "toast.error", { status: err.status });
        notify({ kind: "error", message: `${prefix}: ${err.message}` });
      } else {
        notify({
          kind: "error",
          message: `${tr(language, "toast.unexpected")}: ${String(err)}`,
        });
      }
    } finally {
      setAnalyzing(false);
    }
  }

  /** Resolve the configuration popup: dispatch the pending import/reanalyze/merge. */
  function confirmConfig(config: AnalysisConfigResult) {
    const action = pending;
    setPending(null);
    if (!action) return;
    if (action.type === "import") {
      void runImport(action.file, config);
    } else if (action.type === "reanalyze") {
      onReanalyze(action.doc, config);
    } else {
      onMerge(action.docs, config);
      setSelectedIds(new Set());
    }
  }

  /** Toggle a document's membership in the fusion selection. */
  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** Start a fusion: needs >= 2 selected, else a toast; valid -> config popup. */
  function startMerge() {
    const docs = documents.filter((d) => selectedIds.has(d.id));
    if (docs.length < 2) {
      notify({ kind: "error", message: tr(language, "fusion.needTwo") });
      return;
    }
    setPending({ type: "merge", docs });
  }

  const pendingName =
    pending?.type === "import"
      ? pending.file.name
      : pending?.type === "reanalyze"
        ? pending.doc.filename
        : pending?.type === "merge"
          ? tr(language, "fusion.name", { count: pending.docs.length })
          : "";

  return (
    <div className="view">
      {isAnalyzing && (
        <AnalysisProgressOverlay state={progress} language={language} />
      )}

      {pending && (
        <AnalysisConfigModal
          name={pendingName}
          language={language}
          onCancel={() => setPending(null)}
          onConfirm={confirmConfig}
        />
      )}

      {quotaOpen && (
        <ModelQuotaModal
          language={language}
          quota={quota}
          activeModel={selectedModel}
          onSelect={(id) => {
            onSelectModel(id);
            setQuotaOpen(false);
          }}
          onClose={() => setQuotaOpen(false)}
        />
      )}

      <header className="view-header">
        <h1>{tr(language, "home.title")}</h1>
        <div className="home-controls">
          <label className="lang-select">
            {tr(language, "home.language")}
            <select
              value={language}
              disabled={isAnalyzing}
              onChange={(e) => onLanguageChange(e.target.value as Language)}
            >
              {LANGUAGE_OPTIONS.map((code) => (
                <option key={code} value={code}>
                  {LANGUAGE_LABELS[code]}
                </option>
              ))}
            </select>
          </label>
          <button
            className="ai-quota-btn"
            onClick={() => setQuotaOpen(true)}
            title={tr(language, "quota.activeModel", { name: activeModelLabel })}
          >
            <span aria-hidden="true">✨</span> {tr(language, "quota.button")}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            style={{ display: "none" }}
            disabled={isAnalyzing}
            onChange={(e) => pickFile(e.target.files?.[0])}
          />
          <button onClick={() => fileInput.current?.click()} disabled={isAnalyzing}>
            {isAnalyzing ? (
              <>
                <Spinner label={tr(language, "a11y.loading")} /> {tr(language, "home.analyzing")}
              </>
            ) : (
              tr(language, "home.import")
            )}
          </button>
          <button
            className={`fusion-btn${selectedIds.size >= 2 ? " ready" : ""}`}
            onClick={startMerge}
            disabled={isAnalyzing}
            title={tr(language, "fusion.button")}
          >
            {tr(language, "fusion.button")}
            {selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}
          </button>
        </div>
      </header>

      <ul className="doc-list">
        {documents.map((doc) => (
          <li key={doc.id} className={`doc-card status-${doc.status}`}>
            <input
              type="checkbox"
              className="doc-select"
              aria-label={tr(language, "fusion.select")}
              checked={selectedIds.has(doc.id)}
              disabled={doc.analyses.length === 0}
              onChange={() => toggleSelect(doc.id)}
            />
            <div className="doc-main">
              <span className="doc-name">
                {doc.kind === "fusion" && (
                  <span className="fusion-chip">{tr(language, "fusion.tag")}</span>
                )}
                {doc.filename}
              </span>
              <span className="doc-date">
                {new Date(doc.created_at).toLocaleString()} ·{" "}
                {tr(language, `lang.${doc.language}` as UIKey)}
              </span>
            </div>
            <span className={`badge badge-${doc.status}`}>
              {busyIds.includes(doc.id)
                ? tr(language, "status.reanalyzing")
                : tr(language, STATUS_KEY[doc.status])}
            </span>
            <div className="doc-actions">
              <button
                disabled={doc.status !== "processed" || doc.analyses.length === 0}
                onClick={() => onOpen(doc)}
              >
                {tr(language, "action.open")}
              </button>
              <button
                className="ghost"
                disabled={!doc.transcript_text.trim() || busyIds.includes(doc.id)}
                onClick={() => setPending({ type: "reanalyze", doc })}
                title={tr(language, "action.reanalyze")}
              >
                {busyIds.includes(doc.id) ? <Spinner label={tr(language, "a11y.loading")} /> : tr(language, "action.reanalyze")}
              </button>
              <button
                className="danger"
                disabled={busyIds.includes(doc.id)}
                onClick={() => onDelete(doc.id)}
              >
                {tr(language, "action.delete")}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
