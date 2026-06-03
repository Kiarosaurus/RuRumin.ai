"""The output JSON keys must stay Spanish in every language."""

from __future__ import annotations

import pytest

from app.prompts import build_layer_prompt, build_merge_prompt, build_structural_prompt

# Keys that Pydantic (app.llm_schema) depends on — must never be localized.
SPANISH_KEYS = [
    "conceptos_ganadores",
    "nombre_concepto",
    "k_top_score",
    "frases_origen",
    "justificacion_agrupacion",
    "conceptos_descartados",
    "idea_descartada",
    "motivo_descarte",
    "analisis_descarte",
    "layer_level",
]


@pytest.mark.parametrize("language", ["es", "en", "zh"])
def test_schema_keys_stay_spanish(language):
    prompt = build_layer_prompt(
        current_layer=0,
        interview_text_chunk="texto",
        k_top=3,
        language=language,
    )
    for key in SPANISH_KEYS:
        assert key in prompt, f"missing Spanish key {key!r} for language {language}"
    # Placeholders fully substituted.
    assert "{current_layer}" not in prompt
    assert "{k_top}" not in prompt
    assert "{interview_text_chunk}" not in prompt


def test_localized_directive_differs_per_language():
    en = build_layer_prompt(0, "t", 3, "en")
    zh = build_layer_prompt(0, "t", 3, "zh")
    assert "ENGLISH" in en
    assert "中文" in zh


@pytest.mark.parametrize("language", ["es", "en", "zh"])
def test_merge_prompt_keeps_spanish_keys(language):
    prompt = build_merge_prompt(
        current_layer=0,
        interview_text_chunk="[a.docx]\nCosto. importa",
        k_top=3,
        language=language,
    )
    for key in SPANISH_KEYS:
        assert key in prompt, f"missing Spanish key {key!r} for language {language}"
    assert "{current_layer}" not in prompt
    assert "{k_top}" not in prompt


def test_structural_prompt_emits_spanish_key():
    prompt = build_structural_prompt("una entrevista", "es")
    assert "temas_estructurales" in prompt


def test_layer_prompt_injects_structural_context_only_when_present():
    without = build_layer_prompt(0, "t", 3, "es")
    with_ctx = build_layer_prompt(
        0, "t", 3, "es", structural_themes=["(一）pasado"]
    )
    assert "(一）pasado" in with_ctx
    assert "(一）pasado" not in without
