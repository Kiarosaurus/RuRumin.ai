"""Cross-run concept aggregation: lexical + semantic de-duplication."""

from __future__ import annotations

from app.models import AnalysisLayer, Concept, DiscardedConcept
from app.services.aggregation import aggregate_layer


def _win(label: str, score: float, quotes: list[str]) -> Concept:
    return Concept(
        id=f"x-{label}",
        label=label,
        description="",
        supporting_quotes=quotes,
        score=score,
        rank=1,
        k_top_score=score,
        grouping_justification=f"just-{label}",
        merged_from=[],
    )


def _layer(winners: list[Concept], discards: list[DiscardedConcept] | None = None) -> AnalysisLayer:
    return AnalysisLayer(
        layer_id="layer-0",
        level=0,
        title="Layer 0",
        k=2,
        winning_concepts=winners,
        discarded_concepts=discards or [],
        grouping_justification="",
        sub_layers=[],
    )


# --------------------------------------------------------------------------- #
# Lexical (embedder=None)
# --------------------------------------------------------------------------- #
async def test_near_duplicates_merge_across_runs():
    run_a = _layer([_win("Costo", 0.9, ["el costo", "precio"]), _win("Atención", 0.5, ["rápido"])])
    run_b = _layer([_win("Costos", 0.8, ["El Costo", "rapidez"]), _win("Otro", 0.4, ["z"])])

    layer = await aggregate_layer([run_a, run_b], k=2, layer_id="layer-0", embedder=None)

    assert layer.winning_concepts[0].label == "Costo"
    assert "Costos" in layer.winning_concepts[0].merged_from
    assert layer.winning_concepts[0].supporting_quotes == ["el costo", "precio", "rapidez"]
    assert layer.winning_concepts[1].label == "Atención"
    assert len(layer.winning_concepts) == 2


async def test_top_k_caps_winners():
    run = _layer([_win("A", 0.9, []), _win("B", 0.8, []), _win("C", 0.7, [])])
    layer = await aggregate_layer([run], k=2, layer_id="layer-0", embedder=None)
    assert [c.label for c in layer.winning_concepts] == ["A", "B"]


async def test_discards_deduped_by_label():
    d = DiscardedConcept(
        id="d1",
        label="ruido",
        description="",
        supporting_quotes=["x"],
        score=0.0,
        discard_reason="redundante",
        discard_justification="irrelevante",
    )
    layer = await aggregate_layer([_layer([], [d]), _layer([], [d])], k=2, layer_id="layer-0")
    assert len(layer.discarded_concepts) == 1
    assert layer.discarded_concepts[0].discard_reason == "redundante"


# --------------------------------------------------------------------------- #
# Semantic (embedder provided)
# --------------------------------------------------------------------------- #
async def _fake_embed(texts: list[str]) -> list[list[float]]:
    """Synonyms 'costo'/'precio' share a vector; 'atenc' another; else orthogonal."""

    def vec(t: str) -> list[float]:
        low = t.lower()
        if "costo" in low or "precio" in low:
            return [1.0, 0.0, 0.0]
        if "atenc" in low:
            return [0.0, 1.0, 0.0]
        return [0.0, 0.0, 1.0]

    return [vec(t) for t in texts]


async def test_semantic_merges_synonyms_lexical_cannot():
    # "Costo" and "Precio justo" are NOT lexically similar, but are synonyms.
    run_a = _layer([_win("Costo", 0.9, ["q1"])])
    run_b = _layer([_win("Precio justo", 0.7, ["q2"])])

    layer = await aggregate_layer([run_a, run_b], k=5, layer_id="layer-0", embedder=_fake_embed)

    assert len(layer.winning_concepts) == 1
    assert layer.winning_concepts[0].label == "Costo"  # higher score wins rep
    assert "Precio justo" in layer.winning_concepts[0].merged_from


async def test_falls_back_to_lexical_when_embedder_returns_none():
    async def none_embed(_texts: list[str]) -> None:
        return None

    run = _layer([_win("Costo", 0.9, []), _win("Costos", 0.8, [])])
    layer = await aggregate_layer([run], k=5, layer_id="layer-0", embedder=none_embed)
    assert len(layer.winning_concepts) == 1  # lexical heuristic still merged
