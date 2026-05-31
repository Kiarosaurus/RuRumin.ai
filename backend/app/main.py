"""
FastAPI application entry point for the thematic analysis microservice.

Run locally with:
    uvicorn app.main:app --reload --port 8000
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import ConfigError, get_allowed_origins, get_gemini_api_key
from app.routers import analysis

logger = logging.getLogger("rurumin")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """
    Startup readiness check.

    Fail fast if GEMINI_API_KEY is missing/empty so a misconfigured container
    never reports healthy on Cloud Run (the revision aborts instead of serving
    requests that would all 500 on the first analysis).
    """
    try:
        get_gemini_api_key()
    except ConfigError as exc:
        logger.critical("Arranque abortado: %s", exc)
        raise RuntimeError(f"Configuración inválida al arrancar: {exc}") from exc
    logger.info("Readiness check OK: GEMINI_API_KEY presente.")
    yield


app = FastAPI(
    title="Thematic Analysis Service",
    version="0.1.0",
    description=(
        "Microservice that performs exhaustive multi-layer thematic analysis "
        "of interview transcripts using the Gemini API."
    ),
    lifespan=lifespan,
)

# The desktop client (Tauri/React) calls this service directly. Origins are
# read from ALLOWED_ORIGINS (comma-separated); defaults cover the Vite dev
# server and the Tauri webview schemes. Never "*".
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_allowed_origins(),
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

app.include_router(analysis.router)


@app.get("/health", tags=["meta"], summary="Liveness probe.")
async def health() -> dict[str, str]:
    """Simple health check for orchestration/monitoring."""
    return {"status": "ok"}


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """
    Catch-all so unexpected failures return a clean JSON envelope instead of a
    bare stack trace. Domain errors should still raise `HTTPException` directly.
    """
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Internal server error."},
    )
