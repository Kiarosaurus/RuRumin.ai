"""Shared pytest fixtures/helpers for the analyzer resilience tests."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from google.genai import errors as genai_errors

import app.services.analyzer as analyzer


@pytest.fixture(autouse=True)
def fast_retries(monkeypatch):
    """Remove real backoff sleeps so retry tests run instantly."""
    monkeypatch.setattr(analyzer, "RETRY_BACKOFF_SECONDS", 0)
    yield


def make_api_error(code: int) -> genai_errors.APIError:
    """Build a google-genai APIError carrying a given HTTP status code."""
    err = genai_errors.APIError.__new__(genai_errors.APIError)
    err.code = code
    err.message = f"http {code}"
    return err


def install_fake_client(monkeypatch, *, side_effect=None, return_value=None):
    """
    Replace the analyzer's genai client with a fake whose
    `aio.models.generate_content` is an AsyncMock.

    Returns the AsyncMock so tests can assert call counts.
    """
    gen = AsyncMock()
    if side_effect is not None:
        gen.side_effect = side_effect
    else:
        gen.return_value = return_value
    fake_client = SimpleNamespace(aio=SimpleNamespace(models=SimpleNamespace(generate_content=gen)))
    monkeypatch.setattr(analyzer, "_client", fake_client)
    return gen


def gemini_response(text: str) -> SimpleNamespace:
    """Mimic the SDK's response object (only `.text` is used)."""
    return SimpleNamespace(text=text)
