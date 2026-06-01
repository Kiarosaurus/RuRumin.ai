"""
Resilience matrix for the Gemini call.

Covers `_call_gemini` (network behavior) and the parse step in
`run_thematic_analysis` that turns a malformed model response into a 502.
The genai client is fully mocked — no real network calls.
"""

from __future__ import annotations

import asyncio
import json

import pytest
from fastapi import HTTPException

import app.services.analyzer as analyzer
from app.models import AnalysisRequest
from tests.conftest import gemini_response, install_fake_client, make_api_error

# A model response that satisfies the prompt's JSON schema.
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
        "conceptos_descartados": [
            {
                "idea_descartada": "ruido",
                "motivo_descarte": "redundante",
                "frases_origen": ["x"],
                "analisis_descarte": "irrelevante",
            }
        ],
    }
)


def _request(language: str = "es") -> AnalysisRequest:
    return AnalysisRequest(
        transcript_text="el costo importa",
        language=language,
        options={"max_layers": 2, "k_top": 1},
    )


# --------------------------------------------------------------------------- #
# 1. Successful return of valid JSON
# --------------------------------------------------------------------------- #
async def test_call_gemini_returns_text(monkeypatch):
    gen = install_fake_client(monkeypatch, return_value=gemini_response(VALID_JSON))
    out = await analyzer._call_gemini(prompt="p")
    assert out == VALID_JSON
    assert gen.call_count == 1  # first model succeeds, no fallback


async def test_valid_json_flows_through_to_contract(monkeypatch):
    install_fake_client(monkeypatch, return_value=gemini_response(VALID_JSON))
    resp = await analyzer.run_thematic_analysis(_request())
    winner = resp.root_layer.winning_concepts[0]
    assert winner.label == "Costo"
    assert winner.k_top_score == 0.9  # mapped straight from the model
    assert resp.root_layer.discarded_concepts[0].discard_reason == "redundante"


# --------------------------------------------------------------------------- #
# 2. Malformed JSON -> 502
# --------------------------------------------------------------------------- #
async def test_malformed_json_raises_502(monkeypatch):
    install_fake_client(monkeypatch, return_value=gemini_response("no soy json {"))
    with pytest.raises(HTTPException) as exc:
        await analyzer.run_thematic_analysis(_request())
    assert exc.value.status_code == 502
    assert "esquema" in exc.value.detail.lower()


# --------------------------------------------------------------------------- #
# 3. Timeout then success (retry recovers)
# --------------------------------------------------------------------------- #
async def test_timeout_then_success(monkeypatch):
    gen = install_fake_client(
        monkeypatch,
        side_effect=[asyncio.TimeoutError(), gemini_response(VALID_JSON)],
    )
    out = await analyzer._call_gemini(prompt="p")
    assert out == VALID_JSON
    assert gen.call_count == 2  # first timed out, second (same model) succeeded


# --------------------------------------------------------------------------- #
# 4. Always 503 -> retries + full cascade exhausted -> 502
# --------------------------------------------------------------------------- #
async def test_always_503_exhausts_cascade_to_502(monkeypatch):
    gen = install_fake_client(monkeypatch, side_effect=make_api_error(503))
    with pytest.raises(HTTPException) as exc:
        await analyzer._call_gemini(prompt="p")
    assert exc.value.status_code == 502
    # Every model retried fully before giving up.
    assert gen.call_count == analyzer.MAX_ATTEMPTS * len(analyzer.MODEL_CASCADE)


async def test_always_429_exhausts_cascade(monkeypatch):
    gen = install_fake_client(monkeypatch, side_effect=make_api_error(429))
    with pytest.raises(HTTPException) as exc:
        await analyzer._call_gemini(prompt="p")
    assert exc.value.status_code == 502
    assert gen.call_count == analyzer.MAX_ATTEMPTS * len(analyzer.MODEL_CASCADE)


# --------------------------------------------------------------------------- #
# 5. Non-retryable 400 -> no per-model retry, but still falls back -> 502
# --------------------------------------------------------------------------- #
async def test_non_retryable_400_no_retry_per_model(monkeypatch):
    gen = install_fake_client(monkeypatch, side_effect=make_api_error(400))
    with pytest.raises(HTTPException) as exc:
        await analyzer._call_gemini(prompt="p")
    assert exc.value.status_code == 502
    # One attempt per model (no retries), across the whole cascade.
    assert gen.call_count == len(analyzer.MODEL_CASCADE)


# --------------------------------------------------------------------------- #
# 6. Model fallback: primary 429-exhausts, secondary succeeds
# --------------------------------------------------------------------------- #
async def test_fallback_to_second_model_on_429(monkeypatch):
    primary, secondary = analyzer.MODEL_CASCADE[0], analyzer.MODEL_CASCADE[1]

    def behavior(*_args, model, contents, config):
        if model == primary:
            raise make_api_error(429)  # primary always rate-limited
        return gemini_response(VALID_JSON)  # fallback model works

    gen = install_fake_client(monkeypatch, side_effect=behavior)
    out = await analyzer._call_gemini(prompt="p")

    assert out == VALID_JSON
    # primary exhausts its retries, then secondary succeeds on first try.
    assert gen.call_count == analyzer.MAX_ATTEMPTS + 1
    used_models = [c.kwargs["model"] for c in gen.call_args_list]
    assert used_models[-1] == secondary
    assert used_models.count(primary) == analyzer.MAX_ATTEMPTS


# --------------------------------------------------------------------------- #
# 7. Forced N runs per layer (best-of-N) — quota maximization
# --------------------------------------------------------------------------- #
async def test_forced_runs_per_layer(monkeypatch):
    monkeypatch.setattr(analyzer, "RUNS_PER_LAYER", 5)
    gen = install_fake_client(monkeypatch, return_value=gemini_response(VALID_JSON))

    resp = await analyzer.run_thematic_analysis(_request())  # max_layers=2

    # Two layers x 5 forced runs = 10 model calls, all reported in metadata.
    assert gen.call_count == 10
    assert resp.metadata.total_runs == 10


async def test_malformed_run_tolerated_if_another_run_is_valid(monkeypatch):
    monkeypatch.setattr(analyzer, "RUNS_PER_LAYER", 3)
    # Layer 0: first run malformed, next two valid -> layer still succeeds.
    # With max_layers=2 the winners recurse into layer 1 (3 more valid runs).
    gen = install_fake_client(
        monkeypatch,
        side_effect=[
            gemini_response("no soy json {"),
            gemini_response(VALID_JSON),
            gemini_response(VALID_JSON),
            gemini_response(VALID_JSON),
            gemini_response(VALID_JSON),
            gemini_response(VALID_JSON),
        ],
    )

    resp = await analyzer.run_thematic_analysis(_request())

    assert gen.call_count == 6
    assert resp.root_layer.winning_concepts[0].label == "Costo"
