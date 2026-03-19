"""Production middleware — rate limiting and audit logging."""

from __future__ import annotations

import logging
import time
from collections import defaultdict

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

logger = logging.getLogger(__name__)
audit_logger = logging.getLogger("openags.audit")


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Simple in-memory rate limiter.

    Limits requests per client IP within a sliding window.
    Not suitable for multi-process deployments — use Redis-based
    solutions for production clusters.
    """

    def __init__(
        self,
        app: object,
        max_requests: int = 60,
        window_seconds: int = 60,
    ) -> None:
        super().__init__(app)  # type: ignore[arg-type]
        self._max = max_requests
        self._window = window_seconds
        self._requests: dict[str, list[float]] = defaultdict(list)

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        client_ip = request.client.host if request.client else "unknown"
        now = time.monotonic()

        # Clean old entries
        cutoff = now - self._window
        self._requests[client_ip] = [t for t in self._requests[client_ip] if t > cutoff]

        if len(self._requests[client_ip]) >= self._max:
            return JSONResponse(
                status_code=429,
                content={"detail": "Rate limit exceeded. Try again later."},
            )

        self._requests[client_ip].append(now)
        return await call_next(request)


class AuditLogMiddleware(BaseHTTPMiddleware):
    """Log all API requests for audit trail.

    Writes to the ``openags.audit`` logger with request method,
    path, status code, and duration.
    """

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        start = time.monotonic()
        client_ip = request.client.host if request.client else "unknown"

        response = await call_next(request)

        duration_ms = (time.monotonic() - start) * 1000
        audit_logger.info(
            "%s %s %s %d %.0fms",
            client_ip,
            request.method,
            request.url.path,
            response.status_code,
            duration_ms,
        )

        return response
