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

from app.config import get_gemini_api_key, get_runs_per_layer
from app.llm_schema import LayerLLMOutput
from app.models import (
    AnalysisLayer,
    AnalysisMetadata,
    AnalysisRequest,
    AnalysisResponse,
    AnalysisStatus,
)
from app.prompts import build_layer_prompt
from app.rate_limiter import LIMITER, Emit, _noop
from app.services.aggregation import aggregate_layer
from app.services.embeddings import embed_texts
from app.services.mapping import llm_output_to_layer

logger = logging.getLogger("rurumin.analyzer")

# --- Resilience tuning ----------------------------------------------------- #
GEMINI_TIMEOUT_SECONDS = 120.0
MAX_ATTEMPTS = 3  # per model: 1 initial try + 2 retries
RETRY_BACKOFF_SECONDS = 1.5  # multiplied by the attempt number
RETRYABLE_STATUS = {429, 503}  # rate-limited / service unavailable

# Forced runs per layer. The real bottleneck is the per-DAY quota (RPD), not RPM:
# repeating each layer N times deliberately spends RPD and lets us keep the
# richest result (best-of-N). Override with the RUNS_PER_LAYER env var.
RUNS_PER_LAYER = get_runs_per_layer()

# Model fallback cascade, ordered by DAILY quota (RPD) so testing burns the most
# generous bucket first. gemini-3.1-flash-lite grants 500 RPD on the free tier,
# by far the highest; the 2.5 family (tiny RPD) is kept as last-resort backup.
# Exact google-genai model strings.
MODEL_CASCADE: tuple[str, ...] = (
    "gemini-3.1-flash-lite",  # priority 1: 500 RPD — highest daily quota
    "gemini-3.5-flash-lite",  # priority 2
    "gemini-2.5-flash",  # priority 3: 2.5 family, low RPD — backup
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


def pyramidal_k_sequence(max_layers: int, base_k: int) -> list[int]:
    """
    Per-layer winner counts for the pyramidal synthesis.

    The base (level 0) is the widest layer; every deeper layer keeps STRICTLY
    fewer winners than the layer below it (at least one less), and the apex
    (level ``max_layers - 1``) converges to exactly 1 central concept.

    ``base_k`` is bumped up to at least ``max_layers`` when needed so there is
    room to drop by >=1 on every step and still land on 1 at the apex. The
    returned list has length ``max_layers``, is strictly decreasing, and ends in
    1, e.g. ``pyramidal_k_sequence(5, 5) == [5, 4, 3, 2, 1]``.
    """
    if max_layers <= 1:
        return [1]
    base = max(base_k, max_layers)
    steps = max_layers - 1
    span = base - 1
    seq = [round(base - span * level / steps) for level in range(max_layers)]
    # Defensive: rounding ties could break strict monotonicity; force it and
    # pin the apex to exactly 1.
    for i in range(1, max_layers):
        if seq[i] >= seq[i - 1]:
            seq[i] = seq[i - 1] - 1
    seq[-1] = 1
    return [max(1, v) for v in seq]


async def run_thematic_analysis(
    request: AnalysisRequest,
    emit: Emit = _noop,
    runs: int | None = None,
) -> AnalysisResponse:
    """
    Orchestrate the full multi-layer thematic analysis and return the
    contract-valid response.

    `emit` is an async progress sink (see app.rate_limiter.Emit). It receives
    plain dict events describing each phase — layer start, model call, rate-limit
    waits, validation, finalizing — so a streaming endpoint can relay live
    progress to the UI. Defaults to a no-op for the plain (non-streaming) path.
    """
    max_layers = request.options.max_layers
    # Resolve the pyramid widths once: an explicit manual override if the client
    # sent one, otherwise the auto strictly-decreasing sequence derived from k_top.
    k_per_layer = request.options.k_per_layer or pyramidal_k_sequence(
        max_layers, request.options.k_top
    )
    # Forced passes per layer (best-of-N). Defaults to RUNS_PER_LAYER; callers
    # such as the project-fusion path raise it to spend more quota per layer.
    effective_runs = runs if runs and runs > 0 else RUNS_PER_LAYER
    await emit({"type": "progress", "phase": "starting", "max_layers": max_layers})

    root_layer = await _analyze_layer(
        request=request,
        text_chunk=request.transcript_text,
        level=0,
        k_per_layer=k_per_layer,
        runs=effective_runs,
        emit=emit,
    )

    await emit({"type": "progress", "phase": "finalizing"})
    total_layers = _count_layers(root_layer)
    return AnalysisResponse(
        request_id=str(uuid.uuid4()),
        status=AnalysisStatus.COMPLETED,
        root_layer=root_layer,
        metadata=AnalysisMetadata(
            total_layers=total_layers,
            total_runs=total_layers * effective_runs,  # forced runs per layer
            model=request.options.model,
            language=request.language,
            source_filename=request.source_filename,
        ),
    )


async def _analyze_layer(
    request: AnalysisRequest,
    text_chunk: str,
    level: int,
    k_per_layer: list[int],
    runs: int,
    emit: Emit = _noop,
) -> AnalysisLayer:
    """
    Run one layer (prompt -> model -> validate -> map) and recurse on winners.

    ``k_per_layer`` is the precomputed pyramid: ``k_per_layer[level]`` winners are
    kept at this depth, strictly fewer than the layer below, converging to 1 at
    the apex (see ``pyramidal_k_sequence``).
    """
    max_layers = request.options.max_layers
    # Pyramidal width for this layer (apex converges to 1).
    k = k_per_layer[level] if level < len(k_per_layer) else 1

    await emit(
        {
            "type": "progress",
            "phase": "layer_start",
            "layer": level,
            "max_layers": max_layers,
            "runs": runs,
        }
    )

    # 1. build the prompt for this layer in the requested language
    prompt = build_layer_prompt(
        current_layer=level,
        interview_text_chunk=text_chunk,
        k_top=k,
        language=request.language,
        max_layers=max_layers,
    )

    # 2. forced repetition: run the cascade `runs` times CONCURRENTLY. Sequential
    #    runs blew past Cloud Run's request timeout; firing them in parallel cuts
    #    wall-time ~Nx (they fit within the model's RPM). Each run returns a parsed
    #    LayerLLMOutput or raises (schema error / cascade-exhausted 502). A single
    #    bad run must not sink the layer; we keep every valid one.
    async def _run_once(run: int) -> LayerLLMOutput:
        logger.info("Layer %d - Run %d/%d: solicitando análisis.", level, run, runs)
        raw_output = await _call_gemini(
            prompt=prompt,
            language=request.language,
            emit=emit,
            level=level,
            run=run,
            runs=runs,
        )
        await emit(
            {"type": "progress", "phase": "validating", "layer": level, "run": run, "runs": runs}
        )
        return LayerLLMOutput.parse_model_text(raw_output)

    results = await asyncio.gather(
        *(_run_once(run) for run in range(1, runs + 1)),
        return_exceptions=True,
    )

    candidates: list[AnalysisLayer] = []
    cascade_error: BaseException | None = None
    for run, result in enumerate(results, start=1):
        if isinstance(result, LayerLLMOutput):
            candidates.append(llm_output_to_layer(result, layer_id=f"layer-{level}", k=k))
        elif isinstance(result, (ValidationError, ValueError)):
            logger.warning(
                "Layer %d - Run %d/%d: respuesta no cumple el esquema (%s). Run descartado.",
                level,
                run,
                runs,
                result,
            )
        elif isinstance(result, BaseException):
            # cascade exhausted (502) / unexpected: remember it for the all-fail case.
            cascade_error = result

    # Every run failed. Surface the cascade error (quota/timeout) if that was the
    # cause; otherwise it was a pure schema failure.
    if not candidates:
        if isinstance(cascade_error, HTTPException):
            raise cascade_error
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=(
                "El modelo devolvió respuestas que no cumplen el esquema esperado "
                "en ninguna de las repeticiones. Intenta nuevamente."
            ),
        )

    # 4. aggregate ALL valid runs: merge near-duplicate concepts, dedup quotes,
    #    rank by merge-frequency x score, keep top k. Uses the repetition instead
    #    of discarding it; no extra Gemini calls.
    layer = await aggregate_layer(
        candidates, k=k, layer_id=f"layer-{level}", embedder=embed_texts
    )
    logger.info(
        "Layer %d: %d/%d runs válidos agregados -> %d conceptos ganadores (dedup).",
        level,
        len(candidates),
        runs,
        len(layer.winning_concepts),
    )
    await emit({"type": "progress", "phase": "layer_done", "layer": level})

    # 5. recurse on the winners until max_layers is reached
    if level + 1 < max_layers and layer.winning_concepts:
        # Feed the winners' justifications forward as the next chunk. The real
        # implementation will re-chunk the source text around the winners.
        next_chunk = "\n".join(c.grouping_justification for c in layer.winning_concepts)
        layer.sub_layers = [
            await _analyze_layer(
                request=request,
                text_chunk=next_chunk,
                level=level + 1,
                k_per_layer=k_per_layer,
                runs=runs,
                emit=emit,
            )
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
        "你是定性分析師。只返回有效的 JSON。JSON 的鍵保持西班牙語；值用繁體中文書寫。"
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
    emit: Emit = _noop,
    level: int | None = None,
    run: int | None = None,
    runs: int | None = None,
) -> str:
    """
    Try a single model with timeout + bounded retries.

    Retries transient failures (timeout, 429/503) up to MAX_ATTEMPTS with linear
    backoff. Raises `_ModelExhausted` when the model gives up — either after
    exhausting retries or on the first non-retryable API error — so the caller
    can fall back to the next model.

    Each attempt first passes through the per-model rate limiter, which sleeps
    when the model's free-tier RPM window is full (proactively avoiding 429s).
    """
    last_error: Exception | None = None
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            # Pace against the model's RPM before spending an attempt. Emits a
            # `rate_limit_wait` event (with countdown) if it has to sleep.
            await LIMITER.acquire(model, emit, layer=level, run=run, runs=runs)
            logger.info(
                "Layer %s - Run %s/%s - Modelo '%s' intento %d/%d: enviando petición.",
                level,
                run,
                runs,
                model,
                attempt,
                MAX_ATTEMPTS,
            )
            await emit(
                {
                    "type": "progress",
                    "phase": "calling_model",
                    "model": model,
                    "attempt": attempt,
                    "layer": level,
                    "run": run,
                    "runs": runs,
                }
            )
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
            logger.warning(
                "Layer %s - Run %s/%s - Modelo '%s' intento %d/%d: TIMEOUT tras %.0fs.",
                level,
                run,
                runs,
                model,
                attempt,
                MAX_ATTEMPTS,
                GEMINI_TIMEOUT_SECONDS,
            )
        except genai_errors.APIError as exc:
            last_error = exc
            # Log the VERBATIM Google message so GCP Logs Explorer can tell apart
            # "Resource exhausted per minute" (RPM) vs "per day" (RPD).
            api_message = getattr(exc, "message", None) or str(exc)
            logger.warning(
                "Layer %s - Run %s/%s - Modelo '%s' intento %d/%d falló HTTP %s. "
                "Mensaje exacto de Google: %s",
                level,
                run,
                runs,
                model,
                attempt,
                MAX_ATTEMPTS,
                getattr(exc, "code", None),
                api_message,
            )
            if not _is_retryable(exc):
                # Non-retryable (e.g. 400): stop this model, let caller fall back.
                raise _ModelExhausted(exc) from exc

        if attempt < MAX_ATTEMPTS:
            await asyncio.sleep(RETRY_BACKOFF_SECONDS * attempt)

    raise _ModelExhausted(last_error)


async def _call_gemini(
    prompt: str,
    language: str = "es",
    emit: Emit = _noop,
    level: int | None = None,
    run: int | None = None,
    runs: int | None = None,
) -> str:
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
            return await _attempt_model(
                client, prompt, config, model, emit, level, run, runs
            )
        except _ModelExhausted as exc:
            last_error = exc.cause
            has_fallback = index < len(MODEL_CASCADE) - 1
            if has_fallback:
                next_model = MODEL_CASCADE[index + 1]
                code = getattr(exc.cause, "code", type(exc.cause).__name__)
                api_message = getattr(exc.cause, "message", None) or str(exc.cause)
                logger.warning(
                    "Layer %s - Run %s/%s - Modelo '%s' agotado (HTTP %s). "
                    "Fallback a '%s'. Mensaje de Google: %s",
                    level,
                    run,
                    runs,
                    model,
                    code,
                    next_model,
                    api_message,
                )
                await emit(
                    {
                        "type": "progress",
                        "phase": "model_fallback",
                        "model": model,
                        "next_model": next_model,
                        "reason": str(code),
                        "layer": level,
                        "run": run,
                        "runs": runs,
                    }
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
