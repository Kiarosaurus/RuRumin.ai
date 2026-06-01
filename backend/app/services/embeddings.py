"""
Semantic text embeddings for concept de-duplication (Gemini embedding API).

Used by `app.services.aggregation` to merge concepts that mean the same thing
even when worded differently (e.g. "precio" vs "costo") — something the lexical
character-bigram heuristic cannot catch.

Design notes:
  * Best-effort: any failure (missing key, quota, network, SDK error) returns
    None so the caller transparently falls back to lexical de-dup. Semantic
    dedup must never break an analysis.
  * One batched call per layer (all concept texts at once), paced by the shared
    rate limiter under the embedding model's own (generous) budget.
  * A dedicated client instance, lazily created, so importing this module never
    requires the API key.
"""

from __future__ import annotations

import logging

from google import genai

from app.config import get_embedding_model, get_embeddings_enabled, get_gemini_api_key
from app.rate_limiter import LIMITER

logger = logging.getLogger("rurumin.embeddings")

_client: genai.Client | None = None


def _get_client() -> genai.Client:
    global _client
    if _client is None:
        _client = genai.Client(api_key=get_gemini_api_key())
    return _client


async def embed_texts(texts: list[str]) -> list[list[float]] | None:
    """
    Return one embedding vector per input text, or None on any failure / when
    embeddings are disabled. The caller treats None as "use lexical dedup".
    """
    if not texts or not get_embeddings_enabled():
        return None

    model = get_embedding_model()
    try:
        await LIMITER.acquire(model)
        response = await _get_client().aio.models.embed_content(
            model=model,
            contents=texts,
        )
        if not response.embeddings:
            return None
        vectors = [list(e.values or []) for e in response.embeddings]
        if len(vectors) != len(texts):
            logger.warning(
                "Embeddings devolvió %d vectores para %d textos; fallback léxico.",
                len(vectors),
                len(texts),
            )
            return None
        return vectors
    except Exception as exc:  # noqa: BLE001 - best-effort, never fatal
        logger.warning("Embeddings no disponibles (%s); usando dedup léxico.", exc)
        return None
