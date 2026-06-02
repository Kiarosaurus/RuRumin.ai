"""
Pyramidal synthesis: the per-layer winner counts must strictly decrease and the
apex layer must converge to exactly one concept.

Covers the pure sequence helper, the manual `k_per_layer` override validation on
`AnalysisOptions`, and an end-to-end check that the analyzer threads the pyramid
widths into each produced layer's `k`.
"""

from __future__ import annotations

import json

import pytest
from pydantic import ValidationError

import app.services.analyzer as analyzer
from app.models import AnalysisOptions, AnalysisRequest
from app.services.analyzer import pyramidal_k_sequence
from tests.conftest import gemini_response, install_fake_client

# One winner + one discard, enough to let layers recurse to the apex.
VALID_JSON = json.dumps(
    {
        "layer_level": 0,
        "conceptos_ganadores": [
            {
                "nombre_concepto": "Costo",
                "k_top_score": 0.9,
                "frases_origen": ["el costo"],
                "justificacion_agrupacion": "recurrente",
            }
        ],
        "conceptos_descartados": [],
    }
)


# --------------------------------------------------------------------------- #
# 1. Pure sequence: strictly decreasing, length == max_layers, apex == 1
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize(
    "max_layers,base_k",
    [(2, 5), (3, 5), (5, 5), (5, 3), (5, 8), (4, 4), (2, 1), (7, 2), (10, 10)],
)
def test_sequence_is_pyramidal(max_layers: int, base_k: int):
    seq = pyramidal_k_sequence(max_layers, base_k)
    assert len(seq) == max_layers
    assert seq[-1] == 1, "apex layer must converge to exactly 1 concept"
    assert all(v >= 1 for v in seq), "no layer may keep fewer than 1 concept"
    assert all(
        seq[i] > seq[i + 1] for i in range(len(seq) - 1)
    ), f"each upper layer must keep strictly fewer concepts: {seq}"


def test_sequence_default_shape():
    assert pyramidal_k_sequence(5, 5) == [5, 4, 3, 2, 1]
    assert pyramidal_k_sequence(1, 9) == [1]


# --------------------------------------------------------------------------- #
# 2. Manual override validation on AnalysisOptions
# --------------------------------------------------------------------------- #
def test_manual_k_per_layer_accepted():
    opt = AnalysisOptions(max_layers=4, k_per_layer=[8, 5, 3, 1])
    assert opt.k_per_layer == [8, 5, 3, 1]


@pytest.mark.parametrize(
    "max_layers,widths",
    [
        (3, [5, 3, 2, 1]),  # length != max_layers
        (3, [5, 3, 2]),  # does not end in 1
        (3, [3, 3, 1]),  # not strictly decreasing
        (3, [5, 1, 1]),  # not strictly decreasing at the apex boundary
        (3, [5, 3, 0]),  # contains a value < 1 (and not ending in 1)
    ],
)
def test_manual_k_per_layer_rejected(max_layers: int, widths: list[int]):
    with pytest.raises(ValidationError):
        AnalysisOptions(max_layers=max_layers, k_per_layer=widths)


# --------------------------------------------------------------------------- #
# 3. End-to-end: analyzer applies the pyramid width to every layer's k
# --------------------------------------------------------------------------- #
async def test_analyzer_threads_pyramid_into_layer_k(monkeypatch):
    monkeypatch.setattr(analyzer, "RUNS_PER_LAYER", 1)
    install_fake_client(monkeypatch, return_value=gemini_response(VALID_JSON))

    request = AnalysisRequest(
        transcript_text="el costo importa",
        language="es",
        options={"max_layers": 3, "k_top": 5},  # auto sequence -> [5, 3, 1]
    )
    resp = await analyzer.run_thematic_analysis(request)

    root = resp.root_layer
    mid = root.sub_layers[0]
    apex = mid.sub_layers[0]
    assert [root.k, mid.k, apex.k] == [5, 3, 1]
    assert apex.sub_layers == []  # apex is the deepest layer


async def test_analyzer_respects_manual_k_per_layer(monkeypatch):
    monkeypatch.setattr(analyzer, "RUNS_PER_LAYER", 1)
    install_fake_client(monkeypatch, return_value=gemini_response(VALID_JSON))

    request = AnalysisRequest(
        transcript_text="el costo importa",
        language="es",
        options={"max_layers": 3, "k_top": 5, "k_per_layer": [7, 4, 1]},
    )
    resp = await analyzer.run_thematic_analysis(request)

    root = resp.root_layer
    assert root.k == 7
    assert root.sub_layers[0].k == 4
    assert root.sub_layers[0].sub_layers[0].k == 1
