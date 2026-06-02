"""
Project fusion: merge the accepted concepts of several analyses into the
macro-themes they share.

The accepted (winning) concepts of every selected project are flattened into a
synthetic corpus — one line per concept (name + grouping rationale + supporting
phrases). That corpus is fed through the normal multi-layer thematic analysis,
but with extra forced passes per layer (`MERGE_RUNS_PER_LAYER`) so the model
converges on the themes common to all projects rather than per-document noise.

The same corpus is returned to the caller so the frontend can use it as the
"transcript" the fusion's highlights point into (the model's frases_origen are
substrings of this corpus).
"""

from __future__ import annotations

from app.models import AnalysisRequest, AnalysisResponse, MergeRequest
from app.rate_limiter import Emit, _noop
from app.services.analyzer import run_thematic_analysis

# Forced passes per layer for a fusion. Deliberately high ("10 pasadas") so the
# shared macro-themes surface robustly across the combined concept set.
MERGE_RUNS_PER_LAYER = 10


def build_merge_corpus(request: MergeRequest) -> str:
    """
    Assemble the synthetic corpus fed to the analyzer from the projects'
    accepted concepts. One line per concept: ``label. justification quotes``.
    A bracketed source filename precedes each project's block for traceability.
    """
    lines: list[str] = []
    for project in request.projects:
        if project.source_filename:
            lines.append(f"[{project.source_filename}]")
        for concept in project.concepts:
            parts = [concept.label.strip()]
            if concept.justification.strip():
                parts.append(concept.justification.strip())
            quotes = " ".join(q.strip() for q in concept.quotes if q.strip())
            if quotes:
                parts.append(quotes)
            line = ". ".join(p for p in parts if p)
            if line:
                lines.append(line)
    return "\n".join(lines)


async def run_project_merge(
    request: MergeRequest,
    emit: Emit = _noop,
) -> tuple[AnalysisResponse, str]:
    """
    Run the fusion and return ``(analysis, corpus)``.

    Builds the corpus, runs the thematic analysis over it with
    `MERGE_RUNS_PER_LAYER` forced passes, and labels the result as a fusion via
    its source filename. The corpus is returned alongside so the UI can render
    the fused tree's highlights against the exact text the model analyzed.
    """
    corpus = build_merge_corpus(request)
    analysis_request = AnalysisRequest(
        transcript_text=corpus,
        language=request.language,
        source_filename="Fusión",
        options=request.options,
    )
    response = await run_thematic_analysis(
        analysis_request, emit=emit, runs=MERGE_RUNS_PER_LAYER
    )
    return response, corpus
