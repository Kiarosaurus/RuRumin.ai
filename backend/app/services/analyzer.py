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

# --- Resilience tuning ----------------------------------------------------- #
GEMINI_TIMEOUT_SECONDS = 60.0
MAX_ATTEMPTS = 3  # 1 initial try + 2 retries
RETRY_BACKOFF_SECONDS = 1.5  # multiplied by the attempt number
RETRYABLE_STATUS = {429, 503}  # rate-limited / service unavailable

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

    # 2. call the model -> raw JSON string in the prompt's schema
    raw_output = await _call_gemini(
        prompt=prompt,
        model=request.options.model,
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


async def _call_gemini(prompt: str, model: str, language: str = "es") -> str:
    """
    Call the Gemini model and return its raw text response.

    Resilience:
      * each attempt is bounded by GEMINI_TIMEOUT_SECONDS;
      * transient failures (timeout, HTTP 429/503) are retried up to
        MAX_ATTEMPTS with linear backoff;
      * any other API error, or exhausting the retries, raises HTTP 502 so the
        frontend can surface it in a toast.

    The model is asked for JSON (`response_mime_type="application/json"`), so the
    return value is a JSON string ready for `LayerLLMOutput.parse_model_text`.

    @raises app.config.ConfigError if GEMINI_API_KEY is missing.
    @raises fastapi.HTTPException(502) on unrecoverable upstream failure.
    """
    client = _get_client()
    config = genai_types.GenerateContentConfig(
        response_mime_type="application/json",
        system_instruction=_SYSTEM_INSTRUCTION.get(language, _SYSTEM_INSTRUCTION["es"]),
    )

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
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=f"Error de Gemini ({getattr(exc, 'code', 'desconocido')}): {exc}",
                ) from exc

        # Reached only on a retryable failure: back off before the next attempt.
        if attempt < MAX_ATTEMPTS:
            await asyncio.sleep(RETRY_BACKOFF_SECONDS * attempt)

    raise HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail=(
            f"Gemini no respondió correctamente tras {MAX_ATTEMPTS} intentos "
            "(timeout o servicio sobrecargado). Intenta nuevamente."
        ),
    ) from last_error


def _count_layers(layer: AnalysisLayer) -> int:
    """Count this layer plus all of its descendants."""
    return 1 + sum(_count_layers(child) for child in layer.sub_layers)
