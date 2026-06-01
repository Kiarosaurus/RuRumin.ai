"""
HTTP router for the thematic analysis endpoints.

Kept modular so additional resources (jobs, status polling, exports) can be
mounted under their own routers without bloating `main.py`.
"""

from __future__ import annotations

import asyncio
import json
import logging

from fastapi import APIRouter, HTTPException, status
from fastapi.encoders import jsonable_encoder
from fastapi.responses import StreamingResponse

from app.models import AnalysisRequest, AnalysisResponse
from app.services import analyzer

logger = logging.getLogger("rurumin.analysis")

router = APIRouter(prefix="/api", tags=["analysis"])


def _require_text(request: AnalysisRequest) -> None:
    """Shared 400 guard: reject an empty/whitespace transcript."""
    if not request.transcript_text or not request.transcript_text.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="transcript_text must not be empty.",
        )


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
    _require_text(request)
    return await analyzer.run_thematic_analysis(request)


@router.post(
    "/analyze-transcript/stream",
    summary="Stream multi-layer thematic analysis with live progress (NDJSON).",
)
async def analyze_transcript_stream(request: AnalysisRequest) -> StreamingResponse:
    """
    Same analysis as `/analyze-transcript`, but streams newline-delimited JSON
    (NDJSON) so the client can render a live loading screen.

    Event shapes (one JSON object per line):
      {"type": "progress", "phase": "...", ...}  -- progress updates
      {"type": "result",   "data": {AnalysisResponse}}  -- terminal success
      {"type": "error",    "status": int, "detail": str}  -- terminal failure

    The analysis runs as a background task pushing events onto a queue; the
    response generator drains the queue to the wire until a sentinel is seen.
    """
    _require_text(request)

    queue: asyncio.Queue[dict | None] = asyncio.Queue()

    async def emit(event: dict) -> None:
        await queue.put(event)

    async def run() -> None:
        try:
            result = await analyzer.run_thematic_analysis(request, emit=emit)
            await queue.put({"type": "result", "data": jsonable_encoder(result)})
        except HTTPException as exc:
            await queue.put(
                {"type": "error", "status": exc.status_code, "detail": exc.detail}
            )
        except Exception:  # noqa: BLE001 - last line of defense for the stream
            logger.exception("Unhandled error during streamed analysis")
            await queue.put(
                {"type": "error", "status": 500, "detail": "Internal server error."}
            )
        finally:
            await queue.put(None)  # sentinel: end of stream

    async def streamer():
        task = asyncio.create_task(run())
        try:
            while True:
                event = await queue.get()
                if event is None:
                    break
                yield json.dumps(event, ensure_ascii=False) + "\n"
        finally:
            if not task.done():
                task.cancel()

    return StreamingResponse(streamer(), media_type="application/x-ndjson")
