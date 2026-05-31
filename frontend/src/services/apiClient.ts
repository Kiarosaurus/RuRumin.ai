/**
 * API client for the FastAPI thematic-analysis backend.
 *
 * Types are imported from `../types`, which mirrors the Pydantic contract
 * 1:1, so the response is fully typed end-to-end.
 */

import type {
  AnalysisOptions,
  AnalysisRequest,
  AnalysisResponse,
  Language,
} from "../types";

/**
 * Base URL of the FastAPI service.
 *
 * Driven strictly by `VITE_API_BASE_URL`, injected at build time. In the
 * packaged .exe this must point at the real Cloud Run URL. A localhost
 * fallback is used ONLY in dev (`vite dev`); in a production build a missing
 * value is a configuration error and is surfaced loudly.
 */
function resolveBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_API_BASE_URL;
  if (fromEnv) return fromEnv;
  if (import.meta.env.DEV) return "http://localhost:8000";
  console.error(
    "VITE_API_BASE_URL no está definido en el build de producción. " +
      "Inyéctalo al compilar (ej. Cloud Run URL).",
  );
  return "";
}

const API_BASE_URL: string = resolveBaseUrl();

/** Error carrying the HTTP status and the backend `detail` message. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Send clean transcript text to the backend and return the analysis tree.
 *
 * @param transcriptText Clean text extracted from a .docx (see docxExtractor).
 * @param language       Analysis language ('es' | 'en' | 'zh'), required.
 * @param options        Optional tuning (max_layers, k_top, model).
 * @param sourceFilename Original filename, forwarded for traceability.
 */
export async function analyzeTranscript(
  transcriptText: string,
  language: Language,
  options?: Partial<AnalysisOptions>,
  sourceFilename?: string,
): Promise<AnalysisResponse> {
  if (!transcriptText.trim()) {
    throw new ApiError(400, "El texto de la transcripción está vacío.");
  }

  const body: AnalysisRequest = {
    transcript_text: transcriptText,
    language,
    source_filename: sourceFilename ?? null,
    ...(options ? { options: options as AnalysisOptions } : {}),
  };

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/analyze-transcript`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (cause) {
    throw new ApiError(0, `No se pudo conectar con el backend: ${String(cause)}`);
  }

  if (!response.ok) {
    let detail = `La solicitud falló con estado ${response.status}.`;
    try {
      const payload = (await response.json()) as { detail?: string };
      if (payload.detail) detail = payload.detail;
    } catch {
      /* response had no JSON body; keep the default detail */
    }
    throw new ApiError(response.status, detail);
  }

  return (await response.json()) as AnalysisResponse;
}
