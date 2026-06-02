/**
 * Shared data contracts for the thematic analysis tool.
 *
 * These interfaces mirror the Pydantic models in `backend/app/models.py`
 * field-for-field. Both sides use snake_case so the serialized JSON is
 * identical and no key transformation is needed on the wire.
 *
 * Keep this file in sync with the Python models whenever the contract changes.
 */

/** Supported analysis languages. Mirrors backend `Language`. */
export type Language = "es" | "en" | "zh";

/** Lifecycle status of an analysis job. Mirrors `AnalysisStatus`. */
export enum AnalysisStatus {
  Pending = "pending",
  Running = "running",
  Completed = "completed",
  Failed = "failed",
}

/** Fields common to winning and discarded concepts. Mirrors `ConceptBase`. */
export interface ConceptBase {
  /** Stable identifier for this concept. */
  id: string;
  /** Short human-readable name of the concept. */
  label: string;
  /** Longer explanation of what the concept captures. */
  description: string;
  /** Verbatim excerpts from the transcript that support the concept. */
  supporting_quotes: string[];
  /** Raw relevance/frequency score assigned by the model. */
  score: number;
}

/** A "winning" concept that survived k-top selection. Mirrors `Concept`. */
export interface Concept extends ConceptBase {
  /** 1-based position in the k-top ranking for this layer. */
  rank: number;
  /** Score from the k-top metric used to select winners. */
  k_top_score: number;
  /** AI rationale for why the observations were grouped into this concept. */
  grouping_justification: string;
  /** IDs of finer-grained concepts merged into this one. */
  merged_from: string[];
}

/** A concept explicitly dropped during selection. Mirrors `DiscardedConcept`. */
export interface DiscardedConcept extends ConceptBase {
  /** Category/short reason the concept was discarded. */
  discard_reason: string;
  /** AI rationale for why discarding this concept was the correct decision. */
  discard_justification: string;
}

/** One iteration of thematic analysis. Recursive. Mirrors `AnalysisLayer`. */
export interface AnalysisLayer {
  /** Stable identifier for this layer. */
  layer_id: string;
  /** Depth of this layer in the tree (0 = root layer). */
  level: number;
  /** Optional human-readable title summarizing the layer. */
  title: string;
  /** The "k" used by the k-top metric to pick winners here. */
  k: number;
  /** Concepts selected by the k-top metric for this layer. */
  winning_concepts: Concept[];
  /** Concepts explicitly rejected during this layer. */
  discarded_concepts: DiscardedConcept[];
  /** AI rationale for the overall grouping strategy applied in this layer. */
  grouping_justification: string;
  /** Child layers produced by analyzing the winners deeper. Recursive. */
  sub_layers: AnalysisLayer[];
}

/** Tunable parameters for an analysis run. Mirrors `AnalysisOptions`. */
export interface AnalysisOptions {
  /** Maximum recursion depth of the analysis tree. */
  max_layers: number;
  /** Number of winning concepts to keep per layer (base width of the pyramid). */
  k_top: number;
  /** Identifier of the Gemini model to invoke. */
  model: string;
  /**
   * Explicit per-layer winner counts for the pyramidal synthesis (manual mode).
   * When set, overrides the auto sequence: length must equal `max_layers`, be
   * strictly decreasing, and end in 1. Index 0 is the widest base layer.
   */
  k_per_layer?: number[];
}

/** Request payload: clean text extracted from the .docx. Mirrors `AnalysisRequest`. */
export interface AnalysisRequest {
  /** Cleaned plain text extracted from the interview .docx. */
  transcript_text: string;
  /** Analysis language (required): 'es', 'en' or 'zh'. */
  language: Language;
  /** Original .docx filename, for traceability. */
  source_filename?: string | null;
  /** Optional tuning parameters; backend applies defaults when omitted. */
  options?: AnalysisOptions;
}

/** Bookkeeping returned alongside the tree. Mirrors `AnalysisMetadata`. */
export interface AnalysisMetadata {
  /** Count of layers produced. */
  total_layers: number;
  /** Number of Gemini iterations executed. */
  total_runs: number;
  /** Gemini model actually used. */
  model: string;
  /** Analysis language used. */
  language: Language;
  /** Original .docx filename, if provided. */
  source_filename?: string | null;
  /** ISO-8601 UTC timestamp when the response was generated. */
  created_at: string;
}

/**
 * Live progress phases streamed by POST /api/analyze-transcript/stream.
 * Mirrors the `phase` values emitted by the backend analyzer.
 */
export type ProgressPhase =
  | "starting"
  | "layer_start"
  | "calling_model"
  | "rate_limit_wait"
  | "model_fallback"
  | "validating"
  | "layer_done"
  | "finalizing";

/** One NDJSON progress line from the streaming endpoint. */
export interface ProgressEvent {
  type: "progress";
  phase: ProgressPhase;
  /** Model being called / that was exhausted. */
  model?: string;
  /** Next model in the cascade (model_fallback). */
  next_model?: string;
  /** Why the current model was abandoned (model_fallback). */
  reason?: string;
  /** Retry attempt number for this model (calling_model). */
  attempt?: number;
  /** 1-based forced-run index within the layer. */
  run?: number;
  /** Total forced runs per layer. */
  runs?: number;
  /** 0-based layer index this event refers to. */
  layer?: number;
  /** Maximum recursion depth for this run. */
  max_layers?: number;
  /** Seconds the backend will sleep to respect the RPM (rate_limit_wait). */
  sleep_seconds?: number;
  /** The model's requests-per-minute ceiling (rate_limit_wait). */
  rpm?: number;
}

/** Top-level response from POST /api/analyze-transcript. Mirrors `AnalysisResponse`. */
export interface AnalysisResponse {
  /** Identifier for this analysis job. */
  request_id: string;
  /** Lifecycle status of the job. */
  status: AnalysisStatus;
  /** Root of the recursive analysis tree (level 0). */
  root_layer: AnalysisLayer;
  /** Bookkeeping metadata. */
  metadata: AnalysisMetadata;
}

// --------------------------------------------------------------------------- //
// Project fusion (merge several analyses). Mirrors backend `app.models`.
// --------------------------------------------------------------------------- //

/** One accepted concept contributed by a source project. Mirrors `MergeConcept`. */
export interface MergeConcept {
  label: string;
  justification: string;
  quotes: string[];
}

/** The accepted concepts of one project feeding a fusion. Mirrors `MergeProject`. */
export interface MergeProject {
  source_filename?: string | null;
  concepts: MergeConcept[];
}

/** Payload for POST /api/merge-projects. Mirrors `MergeRequest`. */
export interface MergeRequest {
  projects: MergeProject[];
  language: Language;
  options?: AnalysisOptions;
}
