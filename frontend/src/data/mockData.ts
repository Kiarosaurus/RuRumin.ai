/**
 * Mocked data for building the UI before the backend is wired in.
 *
 * Quotes in the analysis are deliberately exact substrings of `transcriptText`
 * so the highlighting in the reader views works against real positions.
 */

import type { AnalysisResponse, Language } from "../types";
import { AnalysisStatus } from "../types";

/** A document shown in the Home repository view. */
export interface DocumentRecord {
  id: string;
  filename: string;
  status: "processed" | "processing" | "failed";
  /** ISO-8601 timestamp. */
  created_at: string;
  /** Language the document was analyzed in. */
  language: Language;
  /** Clean text extracted from the .docx. */
  transcript_text: string;
  /** Analysis result, present once processed. */
  analysis: AnalysisResponse | null;
}

const SAMPLE_TRANSCRIPT = [
  "Entrevistador: ¿Qué valoras al elegir el servicio?",
  "Entrevistado: Para mí el costo es lo más importante, no puedo pagar de más.",
  "Tambien me importa mucho la calidad de la atención, que me respondan rápido.",
  "A veces la app se cae, pero eso es algo menor y no me preocupa tanto.",
  "Al final lo que busco es confianza y un precio justo por lo que recibo.",
].join("\n");

const MOCK_ANALYSIS: AnalysisResponse = {
  request_id: "mock-0001",
  status: AnalysisStatus.Completed,
  root_layer: {
    layer_id: "layer-0",
    level: 0,
    title: "Layer 0",
    k: 2,
    grouping_justification: "",
    winning_concepts: [
      {
        id: "l0-w1",
        label: "Sensibilidad al costo",
        description: "",
        supporting_quotes: [
          "el costo es lo más importante",
          "un precio justo por lo que recibo",
        ],
        score: 0.95,
        rank: 1,
        k_top_score: 0.95,
        grouping_justification:
          "El precio aparece de forma recurrente y con alta carga argumentativa; el entrevistado lo prioriza explícitamente sobre otros factores.",
        merged_from: [],
      },
      {
        id: "l0-w2",
        label: "Calidad de la atención",
        description: "",
        supporting_quotes: [
          "la calidad de la atención",
          "lo que busco es confianza",
        ],
        score: 0.78,
        rank: 2,
        k_top_score: 0.78,
        grouping_justification:
          "La atención rápida y la confianza se mencionan como un eje fuerte de la decisión, justo después del costo.",
        merged_from: [],
      },
    ],
    discarded_concepts: [
      {
        id: "l0-d1",
        label: "Fallas técnicas de la app",
        description: "",
        supporting_quotes: ["la app se cae"],
        score: 0.0,
        discard_reason: "baja_relevancia",
        discard_justification:
          "El propio entrevistado lo califica como 'algo menor'; aparece una sola vez y no influye en su decisión, por lo que descartarlo es correcto.",
      },
    ],
    sub_layers: [
      {
        layer_id: "layer-1",
        level: 1,
        title: "Layer 1",
        k: 2,
        grouping_justification: "",
        winning_concepts: [
          {
            id: "l1-w1",
            label: "Valor percibido",
            description: "",
            supporting_quotes: ["un precio justo por lo que recibo"],
            score: 0.9,
            rank: 1,
            k_top_score: 0.9,
            grouping_justification:
              "Al profundizar, costo y calidad convergen en una idea macro: la relación valor/precio.",
            merged_from: ["l0-w1", "l0-w2"],
          },
        ],
        discarded_concepts: [],
        sub_layers: [],
      },
    ],
  },
  metadata: {
    total_layers: 2,
    total_runs: 2,
    model: "gemini-2.5-pro",
    language: "es",
    source_filename: "entrevista-01.docx",
    created_at: "2026-05-31T10:00:00Z",
  },
};

export const MOCK_DOCUMENTS: DocumentRecord[] = [
  {
    id: "doc-1",
    filename: "entrevista-01.docx",
    status: "processed",
    created_at: "2026-05-31T10:00:00Z",
    language: "es",
    transcript_text: SAMPLE_TRANSCRIPT,
    analysis: MOCK_ANALYSIS,
  },
  {
    id: "doc-2",
    filename: "entrevista-02.docx",
    status: "processing",
    created_at: "2026-05-31T11:30:00Z",
    language: "es",
    transcript_text: "",
    analysis: null,
  },
  {
    id: "doc-3",
    filename: "focus-group-pilot.docx",
    status: "failed",
    created_at: "2026-05-30T16:45:00Z",
    language: "en",
    transcript_text: "",
    analysis: null,
  },
];
