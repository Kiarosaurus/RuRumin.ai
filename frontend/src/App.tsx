/**
 * App shell: top navigation + global state.
 *
 * Owns the document list, the active document, per-document busy state, the
 * selected language (drives both the UI text via i18n and the analysis
 * language sent to the backend), and the toast queue.
 */

import { useCallback, useRef, useState } from "react";
import "./App.css";
import { Home } from "./components/Home";
import { ReaderDetails } from "./components/ReaderDetails";
import { ReaderSummary } from "./components/ReaderSummary";
import { Toast, type ToastState } from "./components/Toast";
import { TreeView } from "./components/TreeView";
import {
  AnalysisProgressOverlay,
  useAnalysisProgress,
} from "./components/AnalysisProgress";
import { MOCK_DOCUMENTS, type DocumentRecord } from "./data/mockData";
import { analyzeTranscriptStream, ApiError } from "./services/apiClient";
import type { Language } from "./types";
import { tr } from "./utils/i18n";

type View = "home" | "summary" | "details" | "tree";

export default function App() {
  const [view, setView] = useState<View>("home");
  const [documents, setDocuments] = useState<DocumentRecord[]>(MOCK_DOCUMENTS);
  const [active, setActive] = useState<DocumentRecord | null>(null);
  const [busyIds, setBusyIds] = useState<string[]>([]);
  const [language, setLanguage] = useState<Language>("es");
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const { state: progress, onProgress, reset: resetProgress } =
    useAnalysisProgress();

  const notify = useCallback((next: ToastState) => {
    window.clearTimeout(toastTimer.current);
    setToast(next);
    const ttl = next.kind === "error" ? 6000 : 3500;
    toastTimer.current = window.setTimeout(() => setToast(null), ttl);
  }, []);

  const openDoc = useCallback((doc: DocumentRecord) => {
    setActive(doc);
    // Match the UI language to the document's analysis language.
    setLanguage(doc.language);
    setView("summary");
  }, []);

  /** Add a freshly analyzed document to the repository and open it. */
  const handleAnalyzed = useCallback(
    (doc: DocumentRecord) => {
      setDocuments((prev) => [doc, ...prev]);
      openDoc(doc);
    },
    [openDoc],
  );

  /** Remove a document; if it was open, return to Home. */
  const handleDelete = useCallback(
    (id: string) => {
      if (!window.confirm(tr(language, "confirm.delete"))) return;
      setDocuments((prev) => prev.filter((d) => d.id !== id));
      setActive((prev) => {
        if (prev?.id === id) {
          setView("home");
          return null;
        }
        return prev;
      });
      notify({ kind: "info", message: tr(language, "toast.deleted") });
    },
    [language, notify],
  );

  /** Re-run the analysis for a document in its own language. */
  const handleReanalyze = useCallback(
    async (doc: DocumentRecord) => {
      if (!doc.transcript_text.trim()) {
        notify({ kind: "error", message: tr(doc.language, "toast.noText") });
        return;
      }
      if (busyIds.includes(doc.id)) return;

      setBusyIds((prev) => [...prev, doc.id]);
      resetProgress();
      try {
        const analysis = await analyzeTranscriptStream(
          doc.transcript_text,
          doc.language,
          onProgress,
          undefined,
          doc.filename,
        );
        const updated: DocumentRecord = {
          ...doc,
          status: "processed",
          created_at: analysis.metadata.created_at,
          analysis,
        };
        setDocuments((prev) => prev.map((d) => (d.id === doc.id ? updated : d)));
        setActive((prev) => (prev?.id === doc.id ? updated : prev));
        notify({
          kind: "success",
          message: tr(doc.language, "toast.reanalyzed", { name: doc.filename }),
        });
      } catch (err) {
        if (err instanceof ApiError) {
          const prefix =
            err.status === 0
              ? tr(doc.language, "toast.noConnection")
              : tr(doc.language, "toast.error", { status: err.status });
          notify({ kind: "error", message: `${prefix}: ${err.message}` });
        } else {
          notify({
            kind: "error",
            message: `${tr(doc.language, "toast.unexpected")}: ${String(err)}`,
          });
        }
      } finally {
        setBusyIds((prev) => prev.filter((id) => id !== doc.id));
      }
    },
    [busyIds, notify, onProgress, resetProgress],
  );

  const hasAnalysis = active?.analysis != null;

  return (
    <div className="app">
      <nav className="top-nav">
        <span className="brand">RuRumin</span>
        <button className={view === "home" ? "active" : ""} onClick={() => setView("home")}>
          {tr(language, "nav.home")}
        </button>
        <button
          className={view === "summary" ? "active" : ""}
          disabled={!hasAnalysis}
          onClick={() => setView("summary")}
        >
          {tr(language, "nav.summary")}
        </button>
        <button
          className={view === "details" ? "active" : ""}
          disabled={!hasAnalysis}
          onClick={() => setView("details")}
        >
          {tr(language, "nav.details")}
        </button>
        <button
          className={view === "tree" ? "active" : ""}
          disabled={!hasAnalysis}
          onClick={() => setView("tree")}
        >
          {tr(language, "nav.tree")}
        </button>
        {active && <span className="active-doc">{active.filename}</span>}
      </nav>

      <main className="content">
        {view === "home" && (
          <Home
            documents={documents}
            busyIds={busyIds}
            language={language}
            onLanguageChange={setLanguage}
            onOpen={openDoc}
            onAnalyzed={handleAnalyzed}
            onDelete={handleDelete}
            onReanalyze={handleReanalyze}
            notify={notify}
          />
        )}
        {view === "summary" && active?.analysis && (
          <ReaderSummary
            transcriptText={active.transcript_text}
            analysis={active.analysis}
            language={language}
          />
        )}
        {view === "details" && active?.analysis && (
          <ReaderDetails
            transcriptText={active.transcript_text}
            analysis={active.analysis}
            language={language}
          />
        )}
        {view === "tree" && active?.analysis && (
          <TreeView analysis={active.analysis} language={language} />
        )}
      </main>

      {busyIds.length > 0 && (
        <AnalysisProgressOverlay state={progress} language={language} />
      )}

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
