"""
Process-wide async rate limiter for the Gemini API, keyed per model.

The free tier enforces a requests-per-minute (RPM) ceiling per model. Hammering
past it returns HTTP 429. Instead of reacting to 429s, this limiter paces calls
proactively: before each request it checks a 60-second sliding window of recent
calls for that model and, if the window is full, sleeps until the oldest call
ages out. A progress callback is invoked when a wait is required so the UI can
show a live "sleeping N s" countdown.

One limiter instance is shared by the whole process (`LIMITER`), so concurrent
requests on the same Cloud Run instance share the per-model budget.
"""

from __future__ import annotations

import asyncio
import logging
import time
from collections import defaultdict, deque
from typing import Awaitable, Callable

logger = logging.getLogger("rurumin.rate_limiter")

# Free-tier requests-per-minute per model. Keep in sync with MODEL_CASCADE.
# NOTE: this limiter only enforces RPM. The free tier ALSO caps requests-per-day
# (RPD) — which this cannot prevent. The cascade order (highest-RPD model first)
# is what addresses RPD; an RPD 429 surfaces in logs with Google's exact message.
RPM_LIMITS: dict[str, int] = {
    "gemini-3.1-flash-lite": 15,
    "gemini-3.5-flash-lite": 15,
    "gemini-2.5-flash": 5,
    "gemini-2.5-flash-lite": 10,
    # Embedding model used for semantic concept dedup (separate, higher budget).
    "text-embedding-004": 100,
}

# Conservative default for any model not listed above.
DEFAULT_RPM = 5

WINDOW_SECONDS = 60.0
# Small cushion added to every computed wait so we never land exactly on the
# boundary and trip a 429 due to clock skew between us and Google.
WAIT_BUFFER_SECONDS = 0.5

# An async progress sink: receives a plain dict event. Defaults to a no-op.
Emit = Callable[[dict], Awaitable[None]]


async def _noop(_event: dict) -> None:  # pragma: no cover - trivial
    return None


class RateLimiter:
    """Per-model 60-second sliding-window limiter."""

    def __init__(self, limits: dict[str, int] | None = None) -> None:
        self._limits = dict(limits or RPM_LIMITS)
        self._calls: dict[str, deque[float]] = defaultdict(deque)
        self._locks: dict[str, asyncio.Lock] = defaultdict(asyncio.Lock)

    def limit_for(self, model: str) -> int:
        return self._limits.get(model, DEFAULT_RPM)

    def reset(self) -> None:
        """Clear all recorded calls. Used by tests for isolation."""
        self._calls.clear()

    def _purge(self, window: deque[float], now: float) -> None:
        while window and now - window[0] >= WINDOW_SECONDS:
            window.popleft()

    async def acquire(
        self,
        model: str,
        emit: Emit = _noop,
        *,
        layer: int | None = None,
        run: int | None = None,
        runs: int | None = None,
    ) -> None:
        """
        Reserve a slot for `model`, sleeping if the RPM window is full.

        Serializes callers of the same model (per-model lock) so the window is
        consistent under concurrency. Emits a `rate_limit_wait` progress event,
        carrying the sleep duration, when a wait is required.
        """
        limit = self.limit_for(model)
        async with self._locks[model]:
            window = self._calls[model]
            now = time.monotonic()
            self._purge(window, now)

            if len(window) >= limit:
                wait = WINDOW_SECONDS - (now - window[0]) + WAIT_BUFFER_SECONDS
                if wait > 0:
                    logger.info(
                        "Layer %s - Run %s/%s - RPM %d alcanzado en '%s'. "
                        "Durmiendo %.1fs antes de la petición.",
                        layer,
                        run,
                        runs,
                        limit,
                        model,
                        wait,
                    )
                    await emit(
                        {
                            "type": "progress",
                            "phase": "rate_limit_wait",
                            "model": model,
                            "sleep_seconds": round(wait, 1),
                            "rpm": limit,
                            "layer": layer,
                            "run": run,
                            "runs": runs,
                        }
                    )
                    await asyncio.sleep(wait)
                    now = time.monotonic()
                    self._purge(window, now)

            window.append(time.monotonic())


# Shared process-wide instance.
LIMITER = RateLimiter()
