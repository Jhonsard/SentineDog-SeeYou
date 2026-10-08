import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from starlette.testclient import TestClient
from starlette.datastructures import Headers

from app.mcp.auth import MCPAuthMiddleware
from app.mcp.server import (
    create_mcp_app,
    get_db_threadpool,
    get_firewall_threadpool,
    get_rl_threadpool,
    shutdown_threadpools,
)
from app.core.config import settings

VALID_HOST = f"localhost:{settings.API_PORT}".encode()


class TestMCPAuthMiddleware:
    """Tests pour le middleware d'authentification MCP."""

    @pytest.fixture
    def app_with_middleware(self):
        async def simple_app(scope, receive, send):
            await send({"type": "http.response.start", "status": 200, "headers": []})
            await send({"type": "http.response.body", "body": b"OK"})

        return MCPAuthMiddleware(simple_app)

    @pytest.fixture
    def app_with_mtls(self):
        async def simple_app(scope, receive, send):
            await send({"type": "http.response.start", "status": 200, "headers": []})
            await send({"type": "http.response.body", "body": b"OK"})

        with patch.object(settings, 'MCP_MTLS_ENABLED', True), \
             patch.object(settings, 'MCP_MTLS_CA_CERT_PATH', '/fake/ca.pem'), \
             patch('ssl.create_default_context') as mock_ssl:
            mock_context = MagicMock()
            mock_ssl.return_value = mock_context
            middleware = MCPAuthMiddleware(simple_app)
            yield middleware

    @pytest.mark.asyncio
    async def test_valid_api_key(self, app_with_middleware):
        scope = {
            "type": "http",
            "headers": [
                (b"host", VALID_HOST),
                (b"x-mcp-api-key", settings.MCP_API_KEY.encode()),
            ],
            "client": ("127.0.0.1", 8000),
        }
        receive = AsyncMock()
        send = AsyncMock()

        await app_with_middleware(scope, receive, send)

        send.assert_called()

    @pytest.mark.asyncio
    async def test_missing_api_key(self, app_with_middleware):
        scope = {
            "type": "http",
            "headers": [
                (b"host", VALID_HOST),
            ],
            "client": ("127.0.0.1", 8000),
        }
        receive = AsyncMock()
        send = AsyncMock()

        await app_with_middleware(scope, receive, send)

        # Should send 401 response
        calls = send.call_args_list
        assert any("401" in str(c) or "Accès non autorisé" in str(c) for c in calls)

    @pytest.mark.asyncio
    async def test_invalid_api_key(self, app_with_middleware):
        scope = {
            "type": "http",
            "headers": [
                (b"host", VALID_HOST),
                (b"x-mcp-api-key", b"wrong-key"),
                (b"origin", b"http://localhost:3000"),
            ],
            "client": ("127.0.0.1", 8000),
        }
        receive = AsyncMock()
        send = AsyncMock()

        await app_with_middleware(scope, receive, send)

        calls = send.call_args_list
        assert any("403" in str(c) or "Accès refusé" in str(c) for c in calls)

    @pytest.mark.asyncio
    async def test_origin_validation_allowed(self, app_with_middleware):
        scope = {
            "type": "http",
            "headers": [
                (b"host", VALID_HOST),
                (b"x-mcp-api-key", settings.MCP_API_KEY.encode()),
                (b"origin", b"http://localhost:3000"),
            ],
            "client": ("127.0.0.1", 8000),
        }
        receive = AsyncMock()
        send = AsyncMock()

        await app_with_middleware(scope, receive, send)

        send.assert_called()

    @pytest.mark.asyncio
    async def test_origin_validation_rejected(self, app_with_middleware):
        scope = {
            "type": "http",
            "headers": [
                (b"host", VALID_HOST),
                (b"x-mcp-api-key", settings.MCP_API_KEY.encode()),
                (b"origin", b"http://evil.com"),
            ],
            "client": ("127.0.0.1", 8000),
        }
        receive = AsyncMock()
        send = AsyncMock()

        await app_with_middleware(scope, receive, send)

        calls = send.call_args_list
        assert any("403" in str(c) or "Origine non autorisée" in str(c) for c in calls)

    @pytest.mark.asyncio
    async def test_origin_absent_accepted_for_non_browser_clients(self, app_with_middleware):
        """Origin absent = client non-navigateur (Claude Desktop, CLI, agents) : ACCEPTE.

        Rejeter ce cas rendait le plan MCP totalement inutilisable (403 systematique).
        """
        scope = {
            "type": "http",
            "headers": [
                (b"host", VALID_HOST),
                (b"x-mcp-api-key", settings.MCP_API_KEY.encode()),
            ],
            "client": ("127.0.0.1", 8000),
        }
        receive = AsyncMock()
        send = AsyncMock()

        await app_with_middleware(scope, receive, send)

        calls = send.call_args_list
        assert not any("403" in str(c) or "Origine" in str(c) for c in calls)

    @pytest.mark.asyncio
    async def test_origin_present_rejected_when_allowlist_empty(self, app_with_middleware):
        """Origin present + liste MCP_ALLOWED_ORIGINS vide = fail-closed navigateur."""
        middleware = MCPAuthMiddleware.__new__(MCPAuthMiddleware)
        middleware.app = AsyncMock()
        middleware.allowed_origins = set()
        middleware.allowed_hosts = set(settings.MCP_ALLOWED_HOSTS)
        middleware.mtls_enabled = False
        middleware.mtls_ca_cert_path = None
        middleware._ssl_context = None

        scope = {
            "type": "http",
            "headers": [
                (b"host", VALID_HOST),
                (b"x-mcp-api-key", settings.MCP_API_KEY.encode()),
                (b"origin", b"http://localhost:3000"),
            ],
            "client": ("127.0.0.1", 8000),
        }
        receive = AsyncMock()
        send = AsyncMock()

        await middleware(scope, receive, send)

        calls = send.call_args_list
        assert any("403" in str(c) for c in calls)

    @pytest.mark.asyncio
    async def test_invalid_host_rejected_421(self, app_with_middleware):
        """Host inconnu (rebinding DNS) -> 421, y compris sur POST /messages."""
        scope = {
            "type": "http",
            "method": "POST",
            "headers": [
                (b"host", b"rebinding.evil.local"),
                (b"x-mcp-api-key", settings.MCP_API_KEY.encode()),
            ],
            "client": ("127.0.0.1", 8000),
        }
        receive = AsyncMock()
        send = AsyncMock()

        await app_with_middleware(scope, receive, send)

        calls = send.call_args_list
        assert any("421" in str(c) for c in calls)

    @pytest.mark.asyncio
    async def test_websocket_passes_through(self, app_with_middleware):
        scope = {"type": "websocket", "headers": [(b"host", VALID_HOST)]}
        receive = AsyncMock()
        send = AsyncMock()

        await app_with_middleware(scope, receive, send)

        send.assert_called()

    @pytest.mark.asyncio
    async def test_mtls_rejects_without_cert(self, app_with_mtls):
        """mTLS activé sans certificat client = rejet."""
        scope = {
            "type": "http",
            "headers": [
                (b"host", VALID_HOST),
                (b"x-mcp-api-key", settings.MCP_API_KEY.encode()),
                (b"origin", b"http://localhost:3000"),
            ],
            "client": ("127.0.0.1", 8000),
            # Pas de client_cert
        }
        receive = AsyncMock()
        send = AsyncMock()

        await app_with_mtls(scope, receive, send)

        calls = send.call_args_list
        assert any("403" in str(c) or "Certificat client invalide" in str(c) for c in calls)

    @pytest.mark.asyncio
    async def test_mtls_accepts_valid_cert(self, app_with_mtls):
        """mTLS activé avec certificat valide = accept."""
        import datetime
        future_date = datetime.datetime.utcnow() + datetime.timedelta(days=30)
        
        scope = {
            "type": "http",
            "headers": [
                (b"host", VALID_HOST),
                (b"x-mcp-api-key", settings.MCP_API_KEY.encode()),
                (b"origin", b"http://localhost:3000"),
            ],
            "client": ("127.0.0.1", 8000),
            "client_cert": {
                "subject": [("CN", "test-client")],
                "notAfter": future_date.strftime("%b %d %H:%M:%S %Y %Z"),
            },
        }
        receive = AsyncMock()
        send = AsyncMock()

        await app_with_mtls(scope, receive, send)

        send.assert_called()

    @pytest.mark.asyncio
    async def test_mtls_rejects_expired_cert(self, app_with_mtls):
        """mTLS activé avec certificat expiré = rejet."""
        import datetime
        past_date = datetime.datetime.utcnow() - datetime.timedelta(days=30)
        
        scope = {
            "type": "http",
            "headers": [
                (b"host", VALID_HOST),
                (b"x-mcp-api-key", settings.MCP_API_KEY.encode()),
                (b"origin", b"http://localhost:3000"),
            ],
            "client": ("127.0.0.1", 8000),
            "client_cert": {
                "subject": [("CN", "test-client")],
                "notAfter": past_date.strftime("%b %d %H:%M:%S %Y %Z"),
            },
        }
        receive = AsyncMock()
        send = AsyncMock()

        await app_with_mtls(scope, receive, send)

        calls = send.call_args_list
        assert any("403" in str(c) or "Certificat client invalide" in str(c) for c in calls)


class TestMCPThreadPools:
    """Tests pour les thread pools dédiés MCP."""

    def test_get_db_threadpool_singleton(self):
        pool1 = get_db_threadpool()
        pool2 = get_db_threadpool()
        assert pool1 is pool2
        assert pool1._max_workers == settings.MCP_THREADPOOL_DB_WORKERS

    def test_get_firewall_threadpool_singleton(self):
        pool1 = get_firewall_threadpool()
        pool2 = get_firewall_threadpool()
        assert pool1 is pool2
        assert pool1._max_workers == settings.MCP_THREADPOOL_FIREWALL_WORKERS

    def test_get_rl_threadpool_singleton(self):
        pool1 = get_rl_threadpool()
        pool2 = get_rl_threadpool()
        assert pool1 is pool2
        assert pool1._max_workers == settings.MCP_THREADPOOL_RL_WORKERS

    @pytest.mark.asyncio
    async def test_shutdown_threadpools(self):
        # Ensure pools are created
        get_db_threadpool()
        get_firewall_threadpool()
        get_rl_threadpool()

        await shutdown_threadpools()

        # After shutdown, pools should be None (lazy recreation)
        import app.mcp.server as server_module
        assert server_module._db_threadpool is None
        assert server_module._firewall_threadpool is None
        assert server_module._rl_threadpool is None


class TestMCPAppCreation:
    """Tests pour la création de l'application MCP Starlette."""

    def test_create_mcp_app_has_routes(self):
        app = create_mcp_app()
        assert app is not None
        assert app.router.lifespan_context is not None

    def test_create_mcp_app_has_middleware(self):
        app = create_mcp_app()
        # The route should be a Mount with MCPRateLimitMiddleware (outer) -> MCPAuthMiddleware (inner)
        routes = app.routes
        assert len(routes) == 1
        mount = routes[0]
        assert hasattr(mount, 'app')
        assert mount.app.__class__.__name__ == "MCPRateLimitMiddleware"
        assert mount.app.app.__class__.__name__ == "MCPAuthMiddleware"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])