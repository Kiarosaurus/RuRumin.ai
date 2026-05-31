"""
HTTP router for the thematic analysis endpoints.

Kept modular so additional resources (jobs, status polling, exports) can be
mounted under their own routers without bloating `main.py`.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app.models import AnalysisRequest, AnalysisResponse
from app.services import analyzer

router = APIRouter(prefix="/api", tags=["analysis"])


@router.post(
    "/analyze-transcript",
    response_model=AnalysisResponse,
    status_code=status.HTTP_200_OK,
    summary="Run multi-layer thematic analysis on an interview transcript.",
)
async def analyze_transcript(request: AnalysisRequest) -> AnalysisResponse:
    """
    Accept clean text extracted from a .docx interview and return the
    recursive thematic analysis tree.

    Returns 400 if the transcript is empty or whitespace-only. Pydantic already
    rejects a missing `transcript_text` field with 422.
    """
    if not request.transcript_text or not request.transcript_text.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="transcript_text must not be empty.",
        )

    return await analyzer.run_thematic_analysis(request)
