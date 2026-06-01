/**
 * Home view — visual repository of processed/active documents.
 *
 * Includes a language selector (es/en/zh) that drives both the UI text and the
 * analysis language. On import: extract .docx text -> POST (with language) ->
 * build a DocumentRecord -> hand it up. Blocking loader + disabled control
 * prevent duplicate submissions; errors surface as localized toasts.
 */

import { useRef, useState } from "react";
import type { DocumentRecord } from "../data/mockData";
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
  onReanalyze: (doc: DocumentRecord) => void;
  notify: (toast: ToastState) => void;
}

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
  const { state: progress, onProgress, reset: resetProgress } =
    useAnalysisProgress();

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
        undefined,
        extracted.filename,
      );

      // 3. Build the repository record from the response.
      const doc: DocumentRecord = {
        id: analysis.request_id,
        filename: extracted.filename,
        status: "processed",
        created_at: analysis.metadata.created_at,
        language,
        transcript_text: extracted.text,
        analysis,
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
                disabled={doc.status !== "processed" || !doc.analysis}
                onClick={() => onOpen(doc)}
              >
                {tr(language, "action.open")}
              </button>
              <button
                className="ghost"
                disabled={!doc.transcript_text.trim() || busyIds.includes(doc.id)}
                onClick={() => onReanalyze(doc)}
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
