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
        options={"max_layers": 1, "k_top": 1},
    )


# --------------------------------------------------------------------------- #
# 1. Successful return of valid JSON
# --------------------------------------------------------------------------- #
async def test_call_gemini_returns_text(monkeypatch):
    gen = install_fake_client(monkeypatch, return_value=gemini_response(VALID_JSON))
    out = await analyzer._call_gemini(prompt="p", model="gemini-2.5-pro")
    assert out == VALID_JSON
    assert gen.call_count == 1


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
    out = await analyzer._call_gemini(prompt="p", model="m")
    assert out == VALID_JSON
    assert gen.call_count == 2  # first timed out, second succeeded


# --------------------------------------------------------------------------- #
# 4. Always 503 -> retries exhausted -> 502
# --------------------------------------------------------------------------- #
async def test_always_503_exhausts_to_502(monkeypatch):
    gen = install_fake_client(monkeypatch, side_effect=make_api_error(503))
    with pytest.raises(HTTPException) as exc:
        await analyzer._call_gemini(prompt="p", model="m")
    assert exc.value.status_code == 502
    assert gen.call_count == analyzer.MAX_ATTEMPTS  # all attempts used


async def test_always_429_also_retries(monkeypatch):
    gen = install_fake_client(monkeypatch, side_effect=make_api_error(429))
    with pytest.raises(HTTPException) as exc:
        await analyzer._call_gemini(prompt="p", model="m")
    assert exc.value.status_code == 502
    assert gen.call_count == analyzer.MAX_ATTEMPTS


# --------------------------------------------------------------------------- #
# 5. Non-retryable 400 -> immediate 502, no retry
# --------------------------------------------------------------------------- #
async def test_non_retryable_400_immediate_502(monkeypatch):
    gen = install_fake_client(monkeypatch, side_effect=make_api_error(400))
    with pytest.raises(HTTPException) as exc:
        await analyzer._call_gemini(prompt="p", model="m")
    assert exc.value.status_code == 502
    assert gen.call_count == 1  # failed fast, no retry
