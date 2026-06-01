"""
Business-logic layer for thematic analysis.

Pipeline per layer:
    1. render the Gemini prompt          -> app.prompts.build_layer_prompt
    2. call the model                     -> _call_gemini   (real Gemini SDK)
    3. validate the raw JSON output       -> app.llm_schema.LayerLLMOutput
    4. map onto the transport contract    -> app.services.mapping
    5. recurse on the winners up to max_layers

Step 2 calls the Google Gen AI SDK (`google-genai`); it requires GEMINI_API_KEY
in the environment and returns JSON (response_mime_type="application/json") so
the parse/validate/map path consumes it directly. The call is wrapped with a
timeout and retries; unrecoverable failures surface as HTTP 502 so the frontend
toast can show a clear message.
"""

from __future__ import annotations

import asyncio
import logging
import uuid

from fastapi import HTTPException, status
from google import genai
from google.genai import errors as genai_errors
from google.genai import types as genai_types
from pydantic import ValidationError

from app.config import get_gemini_api_key
from app.llm_schema import LayerLLMOutput
from app.models import (
    AnalysisLayer,
    AnalysisMetadata,
    AnalysisRequest,
    AnalysisResponse,
    AnalysisStatus,
)
from app.prompts import build_layer_prompt
from app.services.mapping import llm_output_to_layer

logger = logging.getLogger("rurumin.analyzer")

# --- Resilience tuning ----------------------------------------------------- #
GEMINI_TIMEOUT_SECONDS = 60.0
MAX_ATTEMPTS = 3  # per model: 1 initial try + 2 retries
RETRY_BACKOFF_SECONDS = 1.5  # multiplied by the attempt number
RETRYABLE_STATUS = {429, 503}  # rate-limited / service unavailable

# Model fallback cascade, in free-tier priority order. When a model exhausts its
# quota (429) or keeps failing, the next one is tried before giving up. All four
# are covered by the Gemini free tier. Exact google-genai model strings.
MODEL_CASCADE: tuple[str, ...] = (
    "gemini-2.5-flash",  # priority 1: fast, large context
    "gemini-3.5-flash",  # priority 2
    "gemini-3.1-flash-lite",  # priority 3
    "gemini-2.5-flash-lite",  # priority 4: ultralight emergency fallback
)

# The SDK client is created once per process, lazily, so importing this module
# does not require the key to be present (e.g. during unrelated imports/tests).
_client: genai.Client | None = None


def _get_client() -> genai.Client:
    global _client
    if _client is None:
        _client = genai.Client(api_key=get_gemini_api_key())
    return _client


def _is_retryable(exc: genai_errors.APIError) -> bool:
    """True for transient Google API errors worth retrying (429/503)."""
    return getattr(exc, "code", None) in RETRYABLE_STATUS


async def run_thematic_analysis(request: AnalysisRequest) -> AnalysisResponse:
    """
    Orchestrate the full multi-layer thematic analysis and return the
    contract-valid response.
    """
    root_layer = await _analyze_layer(
        request=request,
        text_chunk=request.transcript_text,
        level=0,
    )

    total_layers = _count_layers(root_layer)
    return AnalysisResponse(
        request_id=str(uuid.uuid4()),
        status=AnalysisStatus.COMPLETED,
        root_layer=root_layer,
        metadata=AnalysisMetadata(
            total_layers=total_layers,
            total_runs=total_layers,  # one Gemini run per layer
            model=request.options.model,
            language=request.language,
            source_filename=request.source_filename,
        ),
    )


async def _analyze_layer(
    request: AnalysisRequest,
    text_chunk: str,
    level: int,
) -> AnalysisLayer:
    """
    Run one layer (prompt -> model -> validate -> map) and recurse on winners.
    """
    k = request.options.k_top

    # 1. build the prompt for this layer in the requested language
    prompt = build_layer_prompt(
        current_layer=level,
        interview_text_chunk=text_chunk,
        k_top=k,
        language=request.language,
    )

    # 2. call the model cascade -> raw JSON string in the prompt's schema
    raw_output = await _call_gemini(
        prompt=prompt,
        language=request.language,
    )

    # 3. validate the raw JSON against the LLM schema. A model that ignores the
    #    schema (despite JSON mode) is an upstream failure -> 502 Bad Gateway.
    try:
        llm_output = LayerLLMOutput.parse_model_text(raw_output)
    except (ValidationError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=(
                "El modelo devolvió una respuesta que no cumple el esquema "
                "esperado. Intenta nuevamente."
            ),
        ) from exc

    # 4. map onto the transport contract
    layer = llm_output_to_layer(llm_output, layer_id=f"layer-{level}", k=k)

    # 5. recurse on the winners until max_layers is reached
    if level + 1 < request.options.max_layers and layer.winning_concepts:
        # Feed the winners' justifications forward as the next chunk. The real
        # implementation will re-chunk the source text around the winners.
        next_chunk = "\n".join(c.grouping_justification for c in layer.winning_concepts)
        layer.sub_layers = [
            await _analyze_layer(request=request, text_chunk=next_chunk, level=level + 1)
        ]

    return layer


# System instruction sent with every call: reinforces the hard rule that JSON
# keys stay Spanish while values are written in the analysis language.
_SYSTEM_INSTRUCTION: dict[str, str] = {
    "es": (
        "Eres un analista cualitativo. Devuelve solo JSON válido. Las claves del "
        "JSON van en español; los valores en español."
    ),
    "en": (
        "You are a qualitative analyst. Return valid JSON only. JSON keys stay in "
        "Spanish; values are written in English."
    ),
    "zh": (
        "你是定性分析师。只返回有效的 JSON。JSON 的键保持西班牙语；值用中文书写。"
    ),
}


class _ModelExhausted(Exception):
    """One model gave up (retries exhausted or non-retryable error)."""

    def __init__(self, cause: Exception | None):
        super().__init__(str(cause))
        self.cause = cause


async def _attempt_model(
    client: genai.Client,
    prompt: str,
    config: genai_types.GenerateContentConfig,
    model: str,
) -> str:
    """
    Try a single model with timeout + bounded retries.

    Retries transient failures (timeout, 429/503) up to MAX_ATTEMPTS with linear
    backoff. Raises `_ModelExhausted` when the model gives up — either after
    exhausting retries or on the first non-retryable API error — so the caller
    can fall back to the next model.
    """
    last_error: Exception | None = None
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            response = await asyncio.wait_for(
                client.aio.models.generate_content(
                    model=model,
                    contents=prompt,
                    config=config,
                ),
                timeout=GEMINI_TIMEOUT_SECONDS,
            )
            return response.text or ""
        except asyncio.TimeoutError as exc:
            last_error = exc  # timeouts are always retryable
        except genai_errors.APIError as exc:
            last_error = exc
            if not _is_retryable(exc):
                # Non-retryable (e.g. 400): stop this model, let caller fall back.
                raise _ModelExhausted(exc) from exc

        if attempt < MAX_ATTEMPTS:
            await asyncio.sleep(RETRY_BACKOFF_SECONDS * attempt)

    raise _ModelExhausted(last_error)


async def _call_gemini(prompt: str, language: str = "es") -> str:
    """
    Call the model cascade and return the first successful raw JSON response.

    Iterates `MODEL_CASCADE` in priority order. Each model gets the full
    timeout + retry budget (`_attempt_model`); if it is exhausted (quota/429,
    repeated 503/timeouts, or a non-retryable error) a warning is logged and the
    next, lighter model is tried. HTTP 502 is raised only when every model fails.

    The model is asked for JSON (`response_mime_type="application/json"`), so the
    return value is ready for `LayerLLMOutput.parse_model_text`.

    @raises app.config.ConfigError if GEMINI_API_KEY is missing.
    @raises fastapi.HTTPException(502) when the whole cascade is exhausted.
    """
    client = _get_client()
    config = genai_types.GenerateContentConfig(
        response_mime_type="application/json",
        system_instruction=_SYSTEM_INSTRUCTION.get(language, _SYSTEM_INSTRUCTION["es"]),
    )

    last_error: Exception | None = None
    for index, model in enumerate(MODEL_CASCADE):
        try:
            return await _attempt_model(client, prompt, config, model)
        except _ModelExhausted as exc:
            last_error = exc.cause
            has_fallback = index < len(MODEL_CASCADE) - 1
            if has_fallback:
                next_model = MODEL_CASCADE[index + 1]
                code = getattr(exc.cause, "code", type(exc.cause).__name__)
                logger.warning(
                    "Modelo '%s' agotado/falló (%s). Fallback a '%s'.",
                    model,
                    code,
                    next_model,
                )

    raise HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail=(
            "Ningún modelo de Gemini respondió correctamente tras agotar la "
            "cascada de respaldo (cuota/timeout/servicio). Intenta nuevamente."
        ),
    ) from last_error


def _count_layers(layer: AnalysisLayer) -> int:
    """Count this layer plus all of its descendants."""
    return 1 + sum(_count_layers(child) for child in layer.sub_layers)
