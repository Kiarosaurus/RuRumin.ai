"""
Project fusion: merge the accepted concepts of several analyses into the
macro-themes they share.

To prevent the LLM context exhaustion + JSON schema failures (502) seen when
fusing many documents, the synthetic corpus is intentionally LEAN: it carries
ONLY each project's accepted-concept names and grouping justifications, plus the
project's structural sections — never the raw transcripts or the (potentially
huge) supporting quotes. That corpus is fed through the multi-layer analysis with
the strict cross-project `build_merge_prompt` and extra forced passes per layer
(`MERGE_RUNS_PER_LAYER`) so the model converges on the patterns common to all
projects rather than per-document noise.

The same corpus is returned to the caller so the frontend can use it as the
"transcript" the fusion's highlights point into (the model's frases_origen are
substrings of this corpus).
"""

from __future__ import annotations

from app.models import AnalysisRequest, AnalysisResponse, MergeProject, MergeRequest
from app.prompts import build_merge_prompt
from app.rate_limiter import Emit, _noop
from app.services.analyzer import run_thematic_analysis

# Forced passes per layer for a fusion. Deliberately high ("10 pasadas") so the
# shared macro-themes surface robustly across the combined concept set.
MERGE_RUNS_PER_LAYER = 10


def _project_block(project: MergeProject) -> str:
    """
    Render one project's lean corpus block: a ``[source_filename]`` header, an
    optional structural sections line, then one ``label. justification`` line per
    accepted concept. Quotes are omitted (token-heavy — the 502 cause).
    """
    lines: list[str] = []
    if project.source_filename:
        lines.append(f"[{project.source_filename}]")
    sections = [t.strip() for t in project.structural_themes if t.strip()]
    if sections:
        lines.append("Secciones: " + " | ".join(sections))
    for concept in project.concepts:
        parts = [concept.label.strip()]
        if concept.justification.strip():
            parts.append(concept.justification.strip())
        line = ". ".join(p for p in parts if p)
        if line:
            lines.append(line)
    return "\n".join(lines)


def build_merge_corpus(request: MergeRequest) -> str:
    """
    Assemble the full LEAN corpus fed to the analyzer: every project's block
    (see `_project_block`) concatenated. Because each verbatim concept line lives
    entirely inside one project block, the model's frases_origen are always a
    substring of exactly one block — which is what lets the stacked fusion view
    highlight each source document independently.
    """
    return "\n".join(
        block for block in (_project_block(p) for p in request.projects) if block
    )


def build_merge_sources(request: MergeRequest) -> list[dict[str, str | None]]:
    """
    Per-source corpus blocks for the frontend's filterable stacked view.

    One entry per project — ``{"source_filename", "text"}`` — where ``text`` is
    that project's own block. Each block is rendered as its OWN text component on
    the frontend, so `buildOverlapSegments` computes highlight indices against a
    local string and the absolute-index math never breaks across documents.
    """
    sources: list[dict[str, str | None]] = []
    for project in request.projects:
        block = _project_block(project)
        if block.strip():
            sources.append({"source_filename": project.source_filename, "text": block})
    return sources


async def run_project_merge(
    request: MergeRequest,
    emit: Emit = _noop,
) -> tuple[AnalysisResponse, str, list[dict[str, str | None]]]:
    """
    Run the fusion and return ``(analysis, corpus, sources)``.

    Builds the lean corpus, runs the thematic analysis over it with the strict
    cross-project `build_merge_prompt` and `MERGE_RUNS_PER_LAYER` forced passes,
    and labels the result as a fusion via its source filename. The full corpus is
    returned for backward compatibility; ``sources`` carries the per-document
    blocks the frontend stacks and highlights independently.
    """
    corpus = build_merge_corpus(request)
    sources = build_merge_sources(request)
    analysis_request = AnalysisRequest(
        transcript_text=corpus,
        language=request.language,
        source_filename="Fusión",
        options=request.options,
    )
    response = await run_thematic_analysis(
        analysis_request,
        emit=emit,
        runs=MERGE_RUNS_PER_LAYER,
        prompt_builder=build_merge_prompt,
    )
    return response, corpus, sources
