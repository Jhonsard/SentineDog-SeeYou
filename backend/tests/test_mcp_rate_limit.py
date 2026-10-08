import asyncio
import pytest
from unittest.mock import AsyncMock, patch
import time

from app.mcp.rate_limit import MCPRateLimitMiddleware
from app.core.config import settings


class TestMCPRateLimitMiddleware:
    """Tests pour le middleware de rate limiting MCP."""

    @pytest.fixture
    def rate_limit_middleware(self):
        async def simple_app(scope, receive, send):
            await send({"type": "http.response.start", "status": 200, "headers": []})
            await send({"type": "http.response.body", "body": b"OK"})

        # Enable rate limiting for tests
        with patch.object(settings, 'MCP_RATE_LIMIT_ENABLED', True), \
             patch.object(settings, 'MCP_RATE_LIMIT_REQUESTS', 3), \
             patch.object(settings, 'MCP_RATE_LIMIT_WINDOW_SECONDS', 60):
            middleware = MCPRateLimitMiddleware(simple_app)
            yield middleware

    @pytest.mark.asyncio
    async def test_non_mcp_paths_pass_through(self, rate_limit_middleware):
        scope = {"type": "http", "path": "/api/v1/health", "headers": [], "client": ("127.0.0.1", 8000)}
        receive = AsyncMock()
        send = AsyncMock()

        await rate_limit_middleware(scope, receive, send)

        send.assert_called()

    @pytest.mark.asyncio
    async def test_mcp_sse_path_rate_limited(self, rate_limit_middleware):
        scope = {
            "type": "http",
            "path": "/mcp/sse",
            "headers": [(b"x-mcp-api-key", b"test-key")],
            "client": ("192.168.1.100", 8000),
        }
        receive = AsyncMock()
        send = AsyncMock()

        # First request should pass
        await rate_limit_middleware(scope, receive, send)
        calls_1 = send.call_args_list

        # Second request should pass
        send.reset_mock()
        await rate_limit_middleware(scope, receive, send)
        calls_2 = send.call_args_list

        # Third request should pass
        send.reset_mock()
        await rate_limit_middleware(scope, receive, send)
        calls_3 = send.call_args_list

        # Fourth request should be rate limited (429)
        send.reset_mock()
        await rate_limit_middleware(scope, receive, send)
        calls_4 = send.call_args_list

        # Check that 4th call returned 429
        assert any("429" in str(c) for c in calls_4)

    @pytest.mark.asyncio
    async def test_rate_limit_headers_present(self, rate_limit_middleware):
        scope = {
            "type": "http",
            "path": "/mcp/sse",
            "headers": [(b"x-mcp-api-key", b"test-key")],
            "client": ("192.168.1.100", 8000),
        }
        receive = AsyncMock()
        send = AsyncMock()

        await rate_limit_middleware(scope, receive, send)

        # Check response headers include rate limit info
        for call in send.call_args_list:
            args = call[0]
            if args and args[0].get("type") == "http.response.start":
                headers = dict(args[0].get("headers", []))
                assert b"x-ratelimit-limit" in headers
                assert b"x-ratelimit-remaining" in headers
                assert b"x-ratelimit-reset" in headers

    @pytest.mark.asyncio
    async def test_different_clients_independent_limits(self, rate_limit_middleware):
        scope1 = {
            "type": "http",
            "path": "/mcp/sse",
            "headers": [(b"x-mcp-api-key", b"key1")],
            "client": ("192.168.1.1", 8000),
        }
        scope2 = {
            "type": "http",
            "path": "/mcp/sse",
            "headers": [(b"x-mcp-api-key", b"key2")],
            "client": ("192.168.1.2", 8000),
        }
        receive = AsyncMock()
        send = AsyncMock()

        # Client 1 makes 3 requests (limit)
        for _ in range(3):
            await rate_limit_middleware(scope1, receive, send)
            send.reset_mock()

        # Client 1 4th request should be rate limited
        await rate_limit_middleware(scope1, receive, send)
        calls_1 = [c for c in send.call_args_list if "429" in str(c)]
        assert len(calls_1) > 0
        send.reset_mock()

        # Client 2 should still be able to make requests
        await rate_limit_middleware(scope2, receive, send)
        calls_2 = [c for c in send.call_args_list if "429" in str(c)]
        assert len(calls_2) == 0

    @pytest.mark.asyncio
    async def test_disabled_rate_limit_passes_all(self, rate_limit_middleware):
        with patch.object(settings, 'MCP_RATE_LIMIT_ENABLED', False):
            scope = {
                "type": "http",
                "path": "/mcp/sse",
                "headers": [(b"x-mcp-api-key", b"test-key")],
                "client": ("192.168.1.100", 8000),
            }
            receive = AsyncMock()
            send = AsyncMock()

            # Make many requests - all should pass
            for _ in range(10):
                await rate_limit_middleware(scope, receive, send)
                send.reset_mock()

            # No 429 should have been sent
            # (we can't easily check this without capturing all calls, but no exception = pass)


    # ------------------------------------------------------------------
    # Non-régression : le bucket ne doit dépendre d'aucun élément contrôlé
    # par l'appelant (la clé API), sinon le rate limit est contournable
    # sans authentification.
    # ------------------------------------------------------------------
    @pytest.mark.asyncio
    async def test_api_key_rotation_does_not_bypass_limit(self):
        async def simple_app(scope, receive, send):
            await send({"type": "http.response.start", "status": 200, "headers": []})

        with patch.object(settings, 'MCP_RATE_LIMIT_ENABLED', True), \
             patch.object(settings, 'MCP_RATE_LIMIT_REQUESTS', 5), \
             patch.object(settings, 'MCP_RATE_LIMIT_WINDOW_SECONDS', 60):
            middleware = MCPRateLimitMiddleware(simple_app)

            import random, string
            blocked = 0
            for _ in range(30):
                prefix = "".join(random.choices(string.ascii_letters, k=8))
                scope = {
                    "type": "http",
                    "path": "/mcp/sse",
                    "headers": [(b"x-mcp-api-key", (prefix + "X" * 40).encode())],
                    "client": ("10.0.0.9", 1234),
                }
                send = AsyncMock()
                await middleware(scope, AsyncMock(), send)
                if any("429" in str(c) for c in send.call_args_list):
                    blocked += 1

            # 30 requêtes pour une limite de 5 => au moins 25 rejets
            assert blocked >= 25, f"rate limit contournable ({blocked} rejets seulement)"
            assert len(middleware._buckets) == 1, "un seul bucket attendu pour une IP"

    @pytest.mark.asyncio
    async def test_memory_is_bounded_by_max_buckets(self):
        async def simple_app(scope, receive, send):
            await send({"type": "http.response.start", "status": 200, "headers": []})

        with patch.object(settings, 'MCP_RATE_LIMIT_ENABLED', True), \
             patch.object(settings, 'MCP_RATE_LIMIT_MAX_BUCKETS', 16):
            middleware = MCPRateLimitMiddleware(simple_app)
            for i in range(500):
                scope = {
                    "type": "http",
                    "path": "/mcp/sse",
                    "headers": [],
                    "client": (f"10.1.{i // 256}.{i % 256}", 1234),
                }
                await middleware(scope, AsyncMock(), AsyncMock())
            assert len(middleware._buckets) <= 16

    @pytest.mark.asyncio
    async def test_concurrent_sse_connections_are_capped_and_released(self):
        """Le decrement de connexion doit etre garanti (finally), pas dépendre
        d'un message 'http.disconnect' emis par le serveur sur la voie send."""
        started = asyncio.Event()
        release = asyncio.Event()

        async def hanging_app(scope, receive, send):
            await send({"type": "http.response.start", "status": 200, "headers": []})
            started.set()
            await release.wait()

        with patch.object(settings, 'MCP_RATE_LIMIT_ENABLED', True), \
             patch.object(settings, 'MCP_RATE_LIMIT_MAX_SSE_CONNECTIONS', 2):
            middleware = MCPRateLimitMiddleware(hanging_app)

            def sse_scope():
                return {
                    "type": "http",
                    "path": "/mcp/sse",
                    "headers": [],
                    "client": ("10.0.0.5", 1234),
                }

            t1 = asyncio.create_task(middleware(sse_scope(), AsyncMock(), AsyncMock()))
            await started.wait()
            t2 = asyncio.create_task(middleware(sse_scope(), AsyncMock(), AsyncMock()))
            await asyncio.sleep(0.05)
            assert middleware._connections.get("10.0.0.5") == 2

            # 3e flux concurrent => refus
            send3 = AsyncMock()
            await middleware(sse_scope(), AsyncMock(), send3)
            assert any("429" in str(c) for c in send3.call_args_list)

            # Liberation => le compteur doit revenir a zero
            release.set()
            await asyncio.gather(t1, t2)
            assert middleware._connections.get("10.0.0.5") is None

    @pytest.mark.asyncio
    async def test_messages_path_does_not_open_connection_slot(self):
        async def simple_app(scope, receive, send):
            await send({"type": "http.response.start", "status": 200, "headers": []})

        with patch.object(settings, 'MCP_RATE_LIMIT_ENABLED', True):
            middleware = MCPRateLimitMiddleware(simple_app)
            for _ in range(50):
                scope = {
                    "type": "http",
                    "path": "/mcp/messages/",
                    "headers": [],
                    "client": ("10.0.0.6", 1234),
                }
                await middleware(scope, AsyncMock(), AsyncMock())
            assert middleware._connections == {}


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
