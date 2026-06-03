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

from app.models import AnalysisRequest, AnalysisResponse, MergeRequest
from app.prompts import build_merge_prompt
from app.rate_limiter import Emit, _noop
from app.services.analyzer import run_thematic_analysis

# Forced passes per layer for a fusion. Deliberately high ("10 pasadas") so the
# shared macro-themes surface robustly across the combined concept set.
MERGE_RUNS_PER_LAYER = 10


def build_merge_corpus(request: MergeRequest) -> str:
    """
    Assemble the LEAN synthetic corpus fed to the analyzer from the projects'
    accepted concepts.

    Per project: a bracketed ``[source_filename]`` header, an optional structural
    sections line, then one line per accepted concept as ``label. justification``.
    Supporting quotes are deliberately omitted — they are the bulk of the tokens
    and caused the 502 — so the fusion reasons over concept names + rationales
    only.
    """
    lines: list[str] = []
    for project in request.projects:
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


async def run_project_merge(
    request: MergeRequest,
    emit: Emit = _noop,
) -> tuple[AnalysisResponse, str]:
    """
    Run the fusion and return ``(analysis, corpus)``.

    Builds the lean corpus, runs the thematic analysis over it with the strict
    cross-project `build_merge_prompt` and `MERGE_RUNS_PER_LAYER` forced passes,
    and labels the result as a fusion via its source filename. The corpus is
    returned alongside so the UI can render the fused tree's highlights against
    the exact text the model analyzed.
    """
    corpus = build_merge_corpus(request)
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
    return response, corpus
