"""
Runtime configuration read from environment variables.

Centralizes the few settings the service needs so the rest of the code never
touches `os.environ` directly. Values are read lazily (at call time) so the app
can import cleanly in environments where secrets are not yet injected.
"""

from __future__ import annotations

import os

from dotenv import load_dotenv

# Load backend/.env once on import so local dev picks up GEMINI_API_KEY etc.
# In production (Cloud Run) there is no .env file; real env vars take priority.
load_dotenv()

# Default origins allowed when ALLOWED_ORIGINS is unset:
#   * the Vite dev server, and
#   * the schemes a packaged Tauri webview uses in production.
# Windows (WebView2) serves the app from http://tauri.localhost; macOS/Linux
# (WebKit) use tauri://localhost. https://tauri.localhost covers the custom
# protocol on some configs. All three are needed for a cross-platform build.
DEFAULT_ALLOWED_ORIGINS = [
    "http://localhost:1420",
    "tauri://localhost",
    "https://tauri.localhost",
    "http://tauri.localhost",
]


class ConfigError(RuntimeError):
    """Raised when a required configuration value is missing."""


def get_gemini_api_key() -> str:
    """
    Return the Gemini API key, strictly from the GEMINI_API_KEY env var.

    @raises ConfigError if it is unset or empty.
    """
    key = os.getenv("GEMINI_API_KEY", "").strip()
    if not key:
        raise ConfigError(
            "GEMINI_API_KEY no está definido. Expórtalo en el entorno "
            "(o en backend/.env) antes de ejecutar el análisis.",
        )
    return key


def get_allowed_origins() -> list[str]:
    """
    Return the CORS allow-list.

    Reads a comma-separated ALLOWED_ORIGINS; falls back to the dev + Tauri
    defaults when unset. Never returns "*".
    """
    raw = os.getenv("ALLOWED_ORIGINS", "").strip()
    if raw:
        origins = [o.strip() for o in raw.split(",") if o.strip()]
        if origins:
            return origins
    return list(DEFAULT_ALLOWED_ORIGINS)
