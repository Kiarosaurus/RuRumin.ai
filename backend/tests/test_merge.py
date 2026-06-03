"""
Project fusion: the accepted concepts of >= 2 projects are flattened into a
corpus and re-analyzed with extra forced passes to surface shared macro-themes.

The genai client is fully mocked — no real network calls.
"""

from __future__ import annotations

import json

import pytest
from pydantic import ValidationError

import app.services.analyzer as analyzer
import app.services.merge as merge
from app.models import MergeConcept, MergeProject, MergeRequest
from app.services.merge import (
    MERGE_RUNS_PER_LAYER,
    build_merge_corpus,
    run_project_merge,
)
from tests.conftest import gemini_response, install_fake_client

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


def _request() -> MergeRequest:
    return MergeRequest(
        projects=[
            MergeProject(
                source_filename="a.docx",
                concepts=[
                    MergeConcept(label="Costo", justification="importa", quotes=["el costo"]),
                ],
                structural_themes=["(一）precio"],
            ),
            MergeProject(
                source_filename="b.docx",
                concepts=[
                    MergeConcept(
                        label="Confianza", justification="clave", quotes=["la confianza"]
                    ),
                ],
            ),
        ],
        language="es",
        options={"max_layers": 2, "k_top": 3},
    )


def test_corpus_includes_concept_names_and_justifications():
    corpus = build_merge_corpus(_request())
    assert "[a.docx]" in corpus
    assert "[b.docx]" in corpus
    assert "Costo. importa" in corpus
    assert "Confianza. clave" in corpus


def test_corpus_omits_quotes_to_prevent_502():
    # The lean corpus must NOT carry the (token-heavy) supporting quotes.
    corpus = build_merge_corpus(_request())
    assert "el costo" not in corpus
    assert "la confianza" not in corpus


def test_corpus_includes_structural_sections():
    corpus = build_merge_corpus(_request())
    assert "Secciones: (一）precio" in corpus


def test_merge_requires_at_least_two_projects():
    with pytest.raises(ValidationError):
        MergeRequest(
            projects=[MergeProject(concepts=[MergeConcept(label="x")])],
            language="es",
        )


def test_merge_forces_ten_passes_by_default():
    assert MERGE_RUNS_PER_LAYER == 10


async def test_merge_returns_tree_and_corpus(monkeypatch):
    # Keep the run count small/fast but prove the merge override (not the normal
    # RUNS_PER_LAYER) is what drives the pass count.
    monkeypatch.setattr(merge, "MERGE_RUNS_PER_LAYER", 2)
    monkeypatch.setattr(analyzer, "RUNS_PER_LAYER", 5)
    gen = install_fake_client(monkeypatch, return_value=gemini_response(VALID_JSON))

    response, corpus = await run_project_merge(_request())  # max_layers=2

    # 2 layers x 2 forced merge passes = 4 calls (override beats RUNS_PER_LAYER=5).
    assert gen.call_count == 4
    assert response.metadata.total_runs == 4
    assert response.metadata.source_filename == "Fusión"
    assert response.root_layer.winning_concepts[0].label == "Costo"
    assert corpus.strip() != ""


async def test_merge_uses_strict_cross_project_prompt(monkeypatch):
    monkeypatch.setattr(merge, "MERGE_RUNS_PER_LAYER", 1)
    gen = install_fake_client(monkeypatch, return_value=gemini_response(VALID_JSON))

    await run_project_merge(_request())

    # Every call must carry the strict fusion prompt, not the plain layer prompt.
    prompt = gen.call_args_list[0].kwargs["contents"]
    assert "SÍNTESIS CRUZADA" in prompt
    # The lean corpus (concept names, no quotes) is what the model sees.
    assert "Costo. importa" in prompt
    assert "el costo" not in prompt
