/**
 * App shell: top navigation + global state.
 *
 * Owns the document list, the active document and which of its analyses is on
 * screen, per-document busy state, the selected language (drives both the UI
 * text via i18n and the analysis language sent to the backend), and the toast
 * queue. The document list is mirrored to IndexedDB so the repository survives
 * a reload (see services/storage).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import { Home } from "./components/Home";
import { FusionView } from "./components/FusionView";
import { ReaderSummary } from "./components/ReaderSummary";
import { Toast, type ToastState } from "./components/Toast";
import { TreeView } from "./components/TreeView";
import {
  AnalysisProgressOverlay,
  useAnalysisProgress,
} from "./components/AnalysisProgress";
import {
  MOCK_DOCUMENTS,
  type AnalysisRecord,
  type DocumentRecord,
} from "./data/mockData";
import {
  analyzeTranscriptStream,
  ApiError,
  mergeProjectsStream,
} from "./services/apiClient";
import { loadDocuments, saveDocuments } from "./services/storage";
import { consumeQuota, loadQuota, type QuotaState } from "./services/quota";
import { DEFAULT_MODEL } from "./data/models";
import type { AnalysisConfigResult } from "./components/AnalysisConfigModal";
import type { AnalysisOptions, Language, MergeProject } from "./types";
import { tr } from "./utils/i18n";

type View = "home" | "summary" | "tree" | "fusion";

export default function App() {
  const [view, setView] = useState<View>("home");
  const [documents, setDocuments] = useState<DocumentRecord[]>(MOCK_DOCUMENTS);
  const [active, setActive] = useState<DocumentRecord | null>(null);
  /** Which analysis run of the active document is currently displayed. */
  const [activeAnalysisId, setActiveAnalysisId] = useState<string | null>(null);
  const [busyIds, setBusyIds] = useState<string[]>([]);
  const [language, setLanguage] = useState<Language>("es");
  /** Active Gemini model id; sent with each analysis and debited from quota. */
  const [selectedModel, setSelectedModel] = useState<string>(DEFAULT_MODEL);
  /** Local per-model daily quota (IndexedDB-backed), shown in the AI manager. */
  const [quota, setQuota] = useState<QuotaState>({ date: "", used: {} });
  const [toast, setToast] = useState<ToastState | null>(null);
  /** Becomes true once IndexedDB has been read, gating the save-back effect. */
  const [hydrated, setHydrated] = useState(false);
  const toastTimer = useRef<number | undefined>(undefined);
  const { state: progress, onProgress, reset: resetProgress } =
    useAnalysisProgress();

  // Hydrate the repository from IndexedDB on first mount. Seed the mocks the
  // very first time (nothing persisted yet) so the UI is never empty in dev.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stored = await loadDocuments();
      if (cancelled) return;
      if (stored) {
        setDocuments(stored);
      } else {
        void saveDocuments(MOCK_DOCUMENTS);
      }
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Mirror every change to IndexedDB once hydration is done (so we never
  // overwrite stored data with the initial mocks before it has loaded).
  useEffect(() => {
    if (!hydrated) return;
    void saveDocuments(documents);
  }, [documents, hydrated]);

  // Load today's local quota usage on mount (resets automatically per day).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const state = await loadQuota();
      if (!cancelled) setQuota(state);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const notify = useCallback((next: ToastState) => {
    window.clearTimeout(toastTimer.current);
    setToast(next);
    const ttl = next.kind === "error" ? 6000 : 3500;
    toastTimer.current = window.setTimeout(() => setToast(null), ttl);
  }, []);

  /** Debit `requests` from `model`'s daily budget and refresh the UI state. */
  const handleConsumeQuota = useCallback((model: string, requests: number) => {
    void (async () => {
      const state = await consumeQuota(model, requests);
      setQuota(state);
    })();
  }, []);

  const openDoc = useCallback((doc: DocumentRecord) => {
    setActive(doc);
    // Default to the newest analysis run (analyses are stored newest-first).
    setActiveAnalysisId(doc.analyses[0]?.id ?? null);
    // Match the UI language to the document's analysis language.
    setLanguage(doc.language);
    // Fusions open in the dedicated split view; documents in the reader.
    setView(doc.kind === "fusion" ? "fusion" : "summary");
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

  /**
   * Run a NEW analysis over an existing document and append it as another
   * `AnalysisRecord` (the document keeps its previous runs). `config` is the
   * structure the user picked in the configuration popup (auto or manual pyramid).
   */
  const handleReanalyze = useCallback(
    async (doc: DocumentRecord, config: AnalysisConfigResult) => {
      if (!doc.transcript_text.trim()) {
        notify({ kind: "error", message: tr(doc.language, "toast.noText") });
        return;
      }
      if (busyIds.includes(doc.id)) return;

      setBusyIds((prev) => [...prev, doc.id]);
      resetProgress();
      try {
        const options: Partial<AnalysisOptions> = {
          max_layers: config.max_layers,
          model: selectedModel,
          ...(config.structural_pass ? { structural_pass: true } : {}),
          ...(config.k_per_layer ? { k_per_layer: config.k_per_layer } : {}),
        };
        const result = await analyzeTranscriptStream(
          doc.transcript_text,
          doc.language,
          onProgress,
          options,
          doc.filename,
        );
        const record: AnalysisRecord = {
          id: result.request_id,
          timestamp: result.metadata.created_at,
          max_layers: config.max_layers,
          structural_themes: result.metadata.structural_themes ?? [],
          result,
        };
        const updated: DocumentRecord = {
          ...doc,
          status: "processed",
          analyses: [record, ...doc.analyses],
        };
        setDocuments((prev) => prev.map((d) => (d.id === doc.id ? updated : d)));
        setActive((prev) => (prev?.id === doc.id ? updated : prev));
        setActiveAnalysisId((prev) =>
          active?.id === doc.id ? record.id : prev,
        );
        notify({
          kind: "success",
          message: tr(doc.language, "toast.reanalyzed", { name: doc.filename }),
        });
        handleConsumeQuota(selectedModel, result.metadata.total_runs);
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
    [active, busyIds, notify, onProgress, resetProgress, selectedModel, handleConsumeQuota],
  );

  /**
   * Fuse >= 2 documents into shared macro-themes. Builds a merge payload from
   * each document's newest analysis (its base/accepted concepts), runs the
   * fusion with the chosen pyramid + active model, then stores the result as a
   * new "fusion" document and opens it.
   */
  const handleMerge = useCallback(
    async (docs: DocumentRecord[], config: AnalysisConfigResult) => {
      const projects: MergeProject[] = docs.map((d) => {
        const latest = d.analyses[0];
        const base = latest?.result.root_layer.winning_concepts ?? [];
        return {
          source_filename: d.filename,
          // Quotes are intentionally omitted: the fusion runs over concept names
          // + justifications only, to keep the LLM payload lean (502 fix).
          concepts: base.map((c) => ({
            label: c.label,
            justification: c.grouping_justification,
            quotes: [],
          })),
          structural_themes:
            latest?.structural_themes ??
            latest?.result.metadata.structural_themes ??
            [],
        };
      });

      // A synthetic busy key drives the global progress overlay for the fusion.
      const busyKey = `fusion-${Date.now()}`;
      setBusyIds((prev) => [...prev, busyKey]);
      resetProgress();
      try {
        const options: Partial<AnalysisOptions> = {
          max_layers: config.max_layers,
          model: selectedModel,
          ...(config.structural_pass ? { structural_pass: true } : {}),
          ...(config.k_per_layer ? { k_per_layer: config.k_per_layer } : {}),
        };
        const { analysis, transcript_text } = await mergeProjectsStream(
          projects,
          language,
          onProgress,
          options,
        );
        const record: AnalysisRecord = {
          id: analysis.request_id,
          timestamp: analysis.metadata.created_at,
          max_layers: config.max_layers,
          structural_themes: analysis.metadata.structural_themes ?? [],
          result: analysis,
        };
        const name = tr(language, "fusion.name", { count: docs.length });
        const doc: DocumentRecord = {
          id: analysis.request_id,
          filename: name,
          status: "processed",
          created_at: analysis.metadata.created_at,
          language,
          transcript_text,
          analyses: [record],
          kind: "fusion",
          source_filenames: docs.map((d) => d.filename),
        };
        setDocuments((prev) => [doc, ...prev]);
        openDoc(doc);
        notify({ kind: "success", message: tr(language, "fusion.created", { name }) });
        handleConsumeQuota(selectedModel, analysis.metadata.total_runs);
      } catch (err) {
        if (err instanceof ApiError) {
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
        setBusyIds((prev) => prev.filter((id) => id !== busyKey));
      }
    },
    [language, selectedModel, notify, onProgress, resetProgress, openDoc, handleConsumeQuota],
  );

  /** The analysis run currently displayed for the active document. */
  const activeAnalysis = useMemo<AnalysisRecord | null>(() => {
    if (!active || active.analyses.length === 0) return null;
    return (
      active.analyses.find((a) => a.id === activeAnalysisId) ??
      active.analyses[0]
    );
  }, [active, activeAnalysisId]);

  const hasAnalysis = activeAnalysis != null;
  const isReader = view === "summary" || view === "tree" || view === "fusion";

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
          className={view === "tree" ? "active" : ""}
          disabled={!hasAnalysis}
          onClick={() => setView("tree")}
        >
          {tr(language, "nav.tree")}
        </button>
        {active?.kind === "fusion" && (
          <button
            className={view === "fusion" ? "active" : ""}
            disabled={!hasAnalysis}
            onClick={() => setView("fusion")}
          >
            {tr(language, "fusion.tag")}
          </button>
        )}
        {active && <span className="active-doc">{active.filename}</span>}
        {isReader && active && active.analyses.length > 0 && (
          <label className="analysis-switcher">
            {tr(language, "reader.analysis")}
            <select
              value={activeAnalysis?.id ?? ""}
              onChange={(e) => setActiveAnalysisId(e.target.value)}
            >
              {active.analyses.map((a, i) => (
                <option key={a.id} value={a.id}>
                  {tr(language, "reader.analysisOption", {
                    // Number runs chronologically: analyses are newest-first.
                    n: active.analyses.length - i,
                    layers: a.max_layers,
                  })}
                </option>
              ))}
            </select>
          </label>
        )}
      </nav>

      <main className="content">
        {view === "home" && (
          <Home
            documents={documents}
            busyIds={busyIds}
            language={language}
            selectedModel={selectedModel}
            quota={quota}
            onLanguageChange={setLanguage}
            onSelectModel={setSelectedModel}
            onConsumeQuota={handleConsumeQuota}
            onOpen={openDoc}
            onAnalyzed={handleAnalyzed}
            onDelete={handleDelete}
            onReanalyze={handleReanalyze}
            onMerge={handleMerge}
            notify={notify}
          />
        )}
        {view === "summary" && activeAnalysis && active && (
          <ReaderSummary
            transcriptText={active.transcript_text}
            analysis={activeAnalysis.result}
            language={language}
          />
        )}
        {view === "tree" && activeAnalysis && (
          <TreeView analysis={activeAnalysis.result} language={language} />
        )}
        {view === "fusion" && activeAnalysis && active && (
          <FusionView
            transcriptText={active.transcript_text}
            analysis={activeAnalysis.result}
            language={language}
          />
        )}
      </main>

      {busyIds.length > 0 && (
        <AnalysisProgressOverlay state={progress} language={language} />
      )}

      <Toast toast={toast} language={language} onClose={() => setToast(null)} />
    </div>
  );
}
