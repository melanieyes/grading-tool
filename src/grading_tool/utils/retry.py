from __future__ import annotations

import asyncio
import random
from collections.abc import Awaitable, Callable


def is_retryable_exception(exc: BaseException) -> bool:
    """Best-effort classifier for transient failures.

    We avoid importing provider-specific exception types here to keep this helper
    lightweight.
    """
    name = exc.__class__.__name__.lower()
    message = str(exc).lower()

    transient_markers = (
        "429",
        "too many requests",
        "rate limit",
        "resourceexhausted",
        "temporarily unavailable",
        "timeout",
        "timed out",
        "connection reset",
        "connection aborted",
        "connection error",
        "service unavailable",
        "internal error",
    )

    if any(marker in name for marker in ("timeout", "connection", "ratelimit")):
        return True

    return any(marker in message for marker in transient_markers)


async def retry_async(
    fn: Callable[[], Awaitable[object]],
    *,
    max_retries: int = 5,
    base_delay: float = 1.0,
    max_delay: float = 30.0,
    should_retry: Callable[[BaseException], bool] = is_retryable_exception,
) -> object:
    """Retry an async operation with exponential backoff + jitter.

    Attempts = 1 + max_retries.
    """
    if max_retries < 0:
        raise ValueError("max_retries must be >= 0")

    attempt = 0
    while True:
        try:
            return await fn()
        except Exception as exc:
            if attempt >= max_retries or not should_retry(exc):
                raise

            delay = min(max_delay, base_delay * (2**attempt))
            delay *= random.uniform(0.8, 1.2)
            await asyncio.sleep(delay)
            attempt += 1
