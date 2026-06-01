"""Schema tolerance for the raw Gemini output (key drift)."""

from __future__ import annotations

import json

from app.llm_schema import LayerLLMOutput


def _payload(discarded: dict) -> str:
    return json.dumps(
        {
            "layer_level": 0,
            "conceptos_ganadores": [],
            "conceptos_descartados": [discarded],
        }
    )


def test_accepts_drifted_discard_keys():
    """`idea_descarte` (model near-miss) maps onto `idea_descartada`."""
    raw = _payload(
        {
            "idea_descarte": "ruido",
            "motivo_descarte": "redundante",
            "frases_origen": ["x"],
            "analisis_descarte": "irrelevante",
        }
    )
    out = LayerLLMOutput.parse_model_text(raw)
    assert out.conceptos_descartados[0].idea_descartada == "ruido"


def test_accepts_canonical_discard_keys():
    """The canonical spelling still validates after adding the aliases."""
    raw = _payload(
        {
            "idea_descartada": "ruido",
            "motivo_descarte": "redundante",
            "frases_origen": ["x"],
            "analisis_descarte": "irrelevante",
        }
    )
    out = LayerLLMOutput.parse_model_text(raw)
    assert out.conceptos_descartados[0].idea_descartada == "ruido"
