import logging
from contextlib import asynccontextmanager
from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings
from starlette.applications import Starlette
from starlette.routing import Mount
from app.core.config import settings
from app.core.thread_pools import (
    get_db_threadpool,
    get_firewall_threadpool,
    get_rl_threadpool,
    prewarm_threadpools,
    shutdown_threadpools,
)
from app.mcp.auth import MCPAuthMiddleware
from app.mcp.rate_limit import MCPRateLimitMiddleware

logger = logging.getLogger("ids_ips.mcp.server")

# Rétrocompatibilité : les pools vivent désormais dans app.core.thread_pools
# (partagés avec le cycle de vie FastAPI, cf. main.app_lifespan).
__all__ = [
    "mcp",
    "create_mcp_app",
    "get_db_threadpool",
    "get_firewall_threadpool",
    "get_rl_threadpool",
    "shutdown_threadpools",
]


mcp = FastMCP(
    settings.MCP_SERVER_NAME,
    instructions=(
        "Passerelle d'inspection et de controle pour le systeme IDS/IPS ULPGL. "
        "Fournit des outils pour auditer les alertes de securite, expliquer les "
        "decisions du modele RL SeeYou.keras, et executer des actions correctives "
        "sur le pare-feu. Toutes les actions destructives necessite une justification."
    ),
    # Protection DNS rebinding : le SDK la refuse par defaut (allowed_hosts vide => 421
    # sur TOUTES les requetes). L'hote doit imperativement etre declare.
    transport_security=TransportSecuritySettings(
        enable_dns_rebinding_protection=True,
        allowed_hosts=list(settings.MCP_ALLOWED_HOSTS),
        allowed_origins=list(settings.MCP_ALLOWED_ORIGINS),
    ),
)



@asynccontextmanager
async def mcp_lifespan(app: Starlette):
    """
    Lif lifespan du sous-serveur MCP.

    ATTENTION : une application Starlette montée via app.mount() ne reçoit PAS
    le scope lifespan du parent (Mount.handle ne relaie que la requête). Ce
    lifespan n'est donc jamais exécuté en production ; il reste utile aux tests
    qui instancient l'application seule. L'initialisation et l'arrêt réels des
    pools sont assurés par app_lifespan (main.py).
    """
    logger.info("Initialisation des thread pools (DB=%d, Firewall=%d, RL=%d)",
                settings.MCP_THREADPOOL_DB_WORKERS,
                settings.MCP_THREADPOOL_FIREWALL_WORKERS,
                settings.MCP_THREADPOOL_RL_WORKERS)
    prewarm_threadpools()
    try:
        yield
    finally:
        await shutdown_threadpools()


def create_mcp_app() -> Starlette:
    """
    Cree et retourne l'application Starlette MCP protegee par les middlewares.
    Ordre: RateLimit -> Auth -> SSE App
    Les routes SSE (/sse, /messages) sont accessibles sous le prefixe de montage
    defini dans main.py (ex: /mcp/sse).
    """
    sse_app = mcp.sse_app()
    # Chaîne de middlewares : RateLimit (extérieur) -> Auth (intérieur) -> SSE App
    authenticated_app = MCPAuthMiddleware(sse_app)
    rate_limited_app = MCPRateLimitMiddleware(authenticated_app)
    return Starlette(
        routes=[Mount("/", app=rate_limited_app)],
        lifespan=mcp_lifespan,
    )
