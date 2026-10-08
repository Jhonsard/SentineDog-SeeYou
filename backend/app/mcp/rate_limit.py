import time
import logging
import threading
from collections import OrderedDict, deque
from typing import Deque, Dict, Optional, Tuple
from starlette.types import ASGIApp, Scope, Receive, Send
from starlette.responses import JSONResponse

from app.core.config import settings
from app.mcp.audit import mcp_audit_logger

logger = logging.getLogger("ids_ips.mcp.rate_limit")

# Fenêtre glissante : le coût par requête est amorti O(1) (on ne parcourt que
# les horodatages expirés du bucket concerné), le nombre de buckets est plafonné
# et l'éviction est LRU. L'ancien code Cle(ait) sur "IP + 8 premiers caractères de
# la clé API" : la clé étantattaquable avant authentification, ce bucket était
# contournable sans limite (200 requêtes, 0 rejet mesuré) et faisait croître un
# dictionnaire non borné.


class MCPRateLimitMiddleware:
    """
    Rate limiting du plan MCP (fenêtre glissante, in-process, borné en mémoire).

    Clé de bucket : l'IP cliente uniquement, jamais un élément contrôlé par
    l'appelant. La clé API n'intervient qu'après authentification, pour
    l'identification du client dans les logs d'audit.

    Limites appliquées :
      - MCP_RATE_LIMIT_REQUESTS requêtes par MCP_RATE_LIMIT_WINDOW_SECONDS et par IP ;
      - MCP_RATE_LIMIT_MAX_SSE_CONNECTIONS flux SSE simultanés par IP ;
      - MCP_RATE_LIMIT_MAX_BUCKETS entrées mémoire maximum (éviction LRU).
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app
        self.enabled = settings.MCP_RATE_LIMIT_ENABLED
        self.max_requests = settings.MCP_RATE_LIMIT_REQUESTS
        self.window_seconds = settings.MCP_RATE_LIMIT_WINDOW_SECONDS
        self.max_buckets = settings.MCP_RATE_LIMIT_MAX_BUCKETS
        self.max_sse_connections = settings.MCP_RATE_LIMIT_MAX_SSE_CONNECTIONS
        self._buckets: "OrderedDict[str, Deque[float]]" = OrderedDict()
        self._connections: Dict[str, int] = {}
        self._lock = threading.Lock()
        self._last_sweep: float = 0.0

    def _get_client_key(self, scope: Scope) -> str:
        """IP cliente. Aucun élément de la requête ne participe à la clé."""
        return scope.get("client", ("unknown", 0))[0] or "unknown"

    def _sweep_expired(self, now: float) -> None:
        """Purge les buckets inactifs. Amorti : au plus une fois par fenêtre."""
        if now - self._last_sweep < self.window_seconds:
            return
        self._last_sweep = now
        cutoff = now - self.window_seconds
        stale = [k for k, hits in self._buckets.items() if not hits or hits[-1] <= cutoff]
        for key in stale:
            del self._buckets[key]

    def _check_rate_limit(self, key: str, now: float) -> Tuple[bool, int, int]:
        """
        Consomme un jeton pour cette IP.

        Returns:
            (allowed, current_count, remaining)
        """
        if not self.enabled:
            return True, 0, self.max_requests

        with self._lock:
            self._sweep_expired(now)

            bucket = self._buckets.get(key)
            if bucket is None:
                bucket = deque()
                self._buckets[key] = bucket
            else:
                self._buckets.move_to_end(key)

            cutoff = now - self.window_seconds
            while bucket and bucket[0] <= cutoff:
                bucket.popleft()

            if len(bucket) >= self.max_requests:
                return False, len(bucket), 0

            bucket.append(now)
            while len(self._buckets) > self.max_buckets:
                self._buckets.popitem(last=False)
            return True, len(bucket), self.max_requests - len(bucket)

    def _track_connection(self, key: str, delta: int) -> int:
        """Compte les flux SSE actifs par IP (incrément borné par le plafond)."""
        with self._lock:
            current = self._connections.get(key, 0) + delta
            if current <= 0:
                self._connections.pop(key, None)
                return 0
            self._connections[key] = current
            return current

    def _too_many_connections(self, key: str) -> bool:
        with self._lock:
            return self._connections.get(key, 0) >= self.max_sse_connections

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path = scope.get("path", "")
        if not (path.startswith("/mcp/sse") or path.startswith("/mcp/messages")):
            await self.app(scope, receive, send)
            return

        key = self._get_client_key(scope)
        now = time.time()
        is_sse = path.startswith("/mcp/sse")

        allowed, current, remaining = self._check_rate_limit(key, now)

        if not allowed:
            mcp_audit_logger.log_rate_limited(scope)
            logger.warning("Rate limit MCP dépassé pour %s (count=%d)", key, current)
            response = JSONResponse(
                status_code=429,
                content={
                    "detail": "Trop de requêtes MCP. Réessayez plus tard.",
                    "retry_after": self.window_seconds,
                },
                headers={
                    "Retry-After": str(self.window_seconds),
                    "X-RateLimit-Limit": str(self.max_requests),
                    "X-RateLimit-Remaining": "0",
                    "X-RateLimit-Reset": str(int(now + self.window_seconds)),
                },
            )
            await response(scope, receive, send)
            return

        if is_sse and self._too_many_connections(key):
            mcp_audit_logger.log_rate_limited(scope)
            logger.warning("Trop de flux SSE simultanés pour %s", key)
            response = JSONResponse(
                status_code=429,
                content={"detail": "Trop de flux MCP ouverts. Fermez les sessions inutiles."},
                headers={
                    "Retry-After": "5",
                    "X-RateLimit-Limit": str(self.max_sse_connections),
                    "X-RateLimit-Remaining": "0",
                },
            )
            await response(scope, receive, send)
            return

        if not is_sse:
            await self.app(scope, receive, send)
            return

        # --- Flux SSE : decrement de connexion garanti par le finally.
        self._track_connection(key, 1)
        logger.debug("Connexion MCP SSE ouverte pour %s", key)
        mcp_audit_logger.log_connection_open(scope)
        disconnect_seen: Optional[bool] = None

        async def wrapped_send(message):
            if message.get("type") == "http.response.start":
                headers = list(message.get("headers", []))
                headers.extend([
                    (b"cache-control", b"no-store"),
                    (b"x-ratelimit-limit", str(self.max_requests).encode()),
                    (b"x-ratelimit-remaining", str(remaining).encode()),
                    (b"x-ratelimit-reset", str(int(now + self.window_seconds)).encode()),
                ])
                message["headers"] = headers
            await send(message)

        async def wrapped_receive():
            nonlocal disconnect_seen
            message = await receive()
            if message.get("type") == "http.disconnect":
                disconnect_seen = True
            return message

        started_at = time.time()
        try:
            await self.app(scope, wrapped_receive, wrapped_send)
        finally:
            active = self._track_connection(key, -1)
            duration_ms = (time.time() - started_at) * 1000
            logger.debug(
                "Connexion MCP SSE fermée pour %s (actives=%d, disconnect=%s)",
                key, active, disconnect_seen,
            )
            mcp_audit_logger.log_connection_close(scope, duration_ms=duration_ms)
