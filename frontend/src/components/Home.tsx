/**
 * Home view — visual repository of processed/active documents.
 *
 * Includes a language selector (es/en/zh) that drives both the UI text and the
 * analysis language. On import: extract .docx text -> POST (with language) ->
 * build a DocumentRecord -> hand it up. Blocking loader + disabled control
 * prevent duplicate submissions; errors surface as localized toasts.
 */

import { useRef, useState } from "react";
import type { AnalysisRecord, DocumentRecord } from "../data/mockData";
import { analyzeTranscriptStream, ApiError } from "../services/apiClient";
import {
  DocxExtractionError,
  extractDocxText,
} from "../services/docxExtractor";
import type { Language } from "../types";
import { LANGUAGE_LABELS, LANGUAGE_OPTIONS, tr, type UIKey } from "../utils/i18n";
import {
  AnalysisProgressOverlay,
  useAnalysisProgress,
} from "./AnalysisProgress";
import { Spinner } from "./Spinner";
import type { ToastState } from "./Toast";

interface Props {
  documents: DocumentRecord[];
  busyIds: string[];
  language: Language;
  onLanguageChange: (language: Language) => void;
  onOpen: (doc: DocumentRecord) => void;
  onAnalyzed: (doc: DocumentRecord) => void;
  onDelete: (id: string) => void;
  onReanalyze: (doc: DocumentRecord, maxLayers: number) => void;
  notify: (toast: ToastState) => void;
}

/** Smallest tree the backend accepts. Mirrors AnalysisOptions.max_layers ge=2. */
const MIN_LAYERS = 2;
const DEFAULT_LAYERS = 5;

const STATUS_KEY: Record<DocumentRecord["status"], UIKey> = {
  processed: "status.processed",
  processing: "status.processing",
  failed: "status.failed",
};

export function Home({
  documents,
  busyIds,
  language,
  onLanguageChange,
  onOpen,
  onAnalyzed,
  onDelete,
  onReanalyze,
  notify,
}: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [isAnalyzing, setAnalyzing] = useState(false);
  /** Layer depth the user wants for the next run (import or new analysis). */
  const [layers, setLayers] = useState(DEFAULT_LAYERS);
  const { state: progress, onProgress, reset: resetProgress } =
    useAnalysisProgress();

  /** Clamp a layers value to the backend-valid range (>= 2, integer). */
  const clampLayers = (raw: number) =>
    Number.isFinite(raw) ? Math.max(MIN_LAYERS, Math.floor(raw)) : DEFAULT_LAYERS;
  const commitLayers = (raw: number) => setLayers(clampLayers(raw));
  /** The value actually sent to the backend (input may hold a transient NaN). */
  const safeLayers = clampLayers(layers);

  async function handleFile(file: File | undefined) {
    if (fileInput.current) fileInput.current.value = "";
    if (!file || isAnalyzing) return;

    resetProgress();
    setAnalyzing(true);
    try {
      // 1. Extract clean text from the .docx (rejects non-Word files).
      const extracted = await extractDocxText(file, language);

      // 2. Stream the analysis so the overlay shows live progress.
      const analysis = await analyzeTranscriptStream(
        extracted.text,
        language,
        onProgress,
        { max_layers: safeLayers },
        extracted.filename,
      );

      // 3. Build the repository record from the response. The document starts
      //    with this single analysis run; more can be appended later.
      const record: AnalysisRecord = {
        id: analysis.request_id,
        timestamp: analysis.metadata.created_at,
        max_layers: safeLayers,
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

  return (
    <div className="view">
      {isAnalyzing && (
        <AnalysisProgressOverlay state={progress} language={language} />
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
          <label className="layers-select">
            {tr(language, "home.layers")}
            <input
              type="number"
              min={MIN_LAYERS}
              step={1}
              value={layers}
              disabled={isAnalyzing}
              onChange={(e) => setLayers(e.target.valueAsNumber)}
              onBlur={(e) => commitLayers(e.target.valueAsNumber)}
            />
          </label>
          <input
            ref={fileInput}
            type="file"
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            style={{ display: "none" }}
            disabled={isAnalyzing}
            onChange={(e) => handleFile(e.target.files?.[0])}
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
        </div>
      </header>

      <ul className="doc-list">
        {documents.map((doc) => (
          <li key={doc.id} className={`doc-card status-${doc.status}`}>
            <div className="doc-main">
              <span className="doc-name">{doc.filename}</span>
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
                onClick={() => onReanalyze(doc, safeLayers)}
                title={tr(language, "action.newAnalysisHint", { layers: safeLayers })}
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
