/**
 * Catalogue of the Gemini models the backend cascade can use, with their daily
 * request quota (RPD) and trilingual strengths/weaknesses shown in the AI quota
 * manager. The order mirrors the backend `MODEL_CASCADE` (highest daily quota
 * first). Daily quotas reflect the free-tier RPD the analyzer comments document.
 */

import type { Language } from "../types";

export interface ModelInfo {
  /** Exact google-genai model id (sent as AnalysisOptions.model). */
  id: string;
  /** Brand label shown in the UI (language-neutral). */
  label: string;
  /** Free-tier requests-per-day used to compute remaining local quota. */
  dailyQuota: number;
  /** Localized strengths copy. */
  strengths: Record<Language, string>;
  /** Localized weaknesses copy. */
  weaknesses: Record<Language, string>;
}

export const MODELS: ModelInfo[] = [
  {
    id: "gemini-3.1-flash-lite",
    label: "Gemini 3.1 Flash-Lite",
    dailyQuota: 500,
    strengths: {
      es: "La mayor cuota diaria (500), rápido y muy económico.",
      en: "Highest daily quota (500), fast and very cheap.",
      zh: "每日配額最高（500），快速且非常經濟。",
    },
    weaknesses: {
      es: "Menor profundidad de razonamiento que los modelos grandes.",
      en: "Shallower reasoning than the larger models.",
      zh: "推理深度不及大型模型。",
    },
  },
  {
    id: "gemini-3.5-flash-lite",
    label: "Gemini 3.5 Flash-Lite",
    dailyQuota: 250,
    strengths: {
      es: "Buen equilibrio entre calidad y velocidad.",
      en: "Good balance of quality and speed.",
      zh: "品質與速度兼顧，平衡良好。",
    },
    weaknesses: {
      es: "Cuota diaria media; se agota antes que el 3.1.",
      en: "Mid daily quota; runs out before the 3.1.",
      zh: "每日配額中等，比 3.1 更早用盡。",
    },
  },
  {
    id: "gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    dailyQuota: 50,
    strengths: {
      es: "Razonamiento más profundo y matices más finos.",
      en: "Deeper reasoning and finer nuance.",
      zh: "推理更深入，細節更細膩。",
    },
    weaknesses: {
      es: "Cuota diaria muy baja; resérvalo para casos difíciles.",
      en: "Very low daily quota; save it for hard cases.",
      zh: "每日配額很低，請保留給困難案例。",
    },
  },
  {
    id: "gemini-2.5-flash-lite",
    label: "Gemini 2.5 Flash-Lite",
    dailyQuota: 100,
    strengths: {
      es: "Ligero respaldo de emergencia cuando los demás se agotan.",
      en: "Light emergency fallback when the others are exhausted.",
      zh: "當其他模型用盡時的輕量緊急後備。",
    },
    weaknesses: {
      es: "Cuota baja y menor matiz en el análisis.",
      en: "Low quota and less nuanced analysis.",
      zh: "配額偏低，分析細膩度較差。",
    },
  },
];

/** Default/active model: the first in the cascade (highest daily quota). */
export const DEFAULT_MODEL = MODELS[0].id;
