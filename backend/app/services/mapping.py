"""
Mapping between the raw Gemini output (`app.llm_schema`) and the public
transport contract (`app.models`).

Why a mapping layer exists:
  * The prompt asks the model for Spanish, human-named keys. The frontend
    contract uses stable English keys.
  * Keeping translation in one place means the prompt can evolve independently
    of the wire format.

Numeric/category fields now come straight from the model (no synthetic
derivations):
  * `k_top_score` <- `k_top_score`        (the model's k-top metric)
  * `score`       <- `k_top_score`        (single source of truth for relevance)
  * `discard_reason` <- `motivo_descarte` (the model's discard category)

`rank` is the 1-based position in `conceptos_ganadores`. The prompt instructs
the model to return winners already ordered by k-top strength, so this reflects
the model's ranking rather than a fabricated score.
"""

from __future__ import annotations

from app.llm_schema import DescartadoLLM, GanadorLLM, LayerLLMOutput
from app.models import AnalysisLayer, Concept, DiscardedConcept


def _map_winner(ganador: GanadorLLM, layer_level: int, rank: int) -> Concept:
    return Concept(
        id=f"l{layer_level}-w{rank}",
        label=ganador.nombre_concepto,
        description="",
        supporting_quotes=ganador.frases_origen,
        score=ganador.k_top_score,
        rank=rank,
        k_top_score=ganador.k_top_score,
        grouping_justification=ganador.justificacion_agrupacion,
        merged_from=[],
    )


def _map_discard(descartado: DescartadoLLM, layer_level: int, index: int) -> DiscardedConcept:
    return DiscardedConcept(
        id=f"l{layer_level}-d{index}",
        label=descartado.idea_descartada,
        description="",
        supporting_quotes=descartado.frases_origen,
        score=0.0,
        discard_reason=descartado.motivo_descarte,
        discard_justification=descartado.analisis_descarte,
    )


def llm_output_to_layer(
    llm_output: LayerLLMOutput,
    layer_id: str,
    k: int,
) -> AnalysisLayer:
    """
    Convert one validated `LayerLLMOutput` into a contract `AnalysisLayer`.

    `sub_layers` is left empty here; the orchestrator attaches children.
    """
    winners = [
        _map_winner(g, llm_output.layer_level, rank=i + 1)
        for i, g in enumerate(llm_output.conceptos_ganadores)
    ]
    discards = [
        _map_discard(d, llm_output.layer_level, index=i + 1)
        for i, d in enumerate(llm_output.conceptos_descartados)
    ]
    return AnalysisLayer(
        layer_id=layer_id,
        level=llm_output.layer_level,
        title=f"Layer {llm_output.layer_level}",
        k=k,
        winning_concepts=winners,
        discarded_concepts=discards,
        grouping_justification="",
        sub_layers=[],
    )
