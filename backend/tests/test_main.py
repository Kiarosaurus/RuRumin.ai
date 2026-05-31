"""Startup readiness check + basic endpoint guards."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app


def test_startup_aborts_without_key(monkeypatch):
    """Lifespan must refuse to start when GEMINI_API_KEY is absent."""
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    with pytest.raises(RuntimeError):
        # Entering the context triggers the lifespan startup hook.
        with TestClient(app):
            pass


def test_startup_ok_and_health(monkeypatch):
    """With a key present the app starts and /health responds."""
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    with TestClient(app) as client:
        assert client.get("/health").json() == {"status": "ok"}


def test_empty_transcript_returns_400(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    with TestClient(app) as client:
        resp = client.post(
            "/api/analyze-transcript",
            json={"transcript_text": "   ", "language": "es"},
        )
        assert resp.status_code == 400


def test_missing_language_returns_422(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    with TestClient(app) as client:
        resp = client.post("/api/analyze-transcript", json={"transcript_text": "hola"})
        assert resp.status_code == 422
