"""
Contexte d'autorisation du plan MCP.

Le principal authentifié est attaché au CONTEXTE de la connexion SSE (ContextVar),
pas à la requête HTTP : en transport SSE, l'exécution d'un outil se fait dans la
tâche de la connexion GET /sse (les messages sont ensuite relayés via
POST /messages). Les permissions sont donc évaluées sur l'identité de la session,
ce qui est le seul point de contrôle fiable - et fail-closed si la session a été
ouverte avec une clé de lecture seule.
"""
import logging
from contextvars import ContextVar, Token
from typing import Optional

from app.services.mcp_key_service import MCPPrincipal, SCOPE_READ, SCOPE_WRITE

logger = logging.getLogger("ids_ips.mcp.security")

_current_principal: ContextVar[Optional[MCPPrincipal]] = ContextVar(
    "mcp_principal", default=None
)


class MCPAuthorizationError(PermissionError):
    """Le client authentifié ne dispose pas du scope requis."""

    def __init__(self, scope: str, principal: Optional[MCPPrincipal] = None):
        self.scope = scope
        self.principal_name = principal.name if principal else "anonyme"
        super().__init__(
            f"Scope '{scope}' requis pour cette operation (client: {self.principal_name})."
        )


def set_current_principal(principal: MCPPrincipal) -> Token:
    return _current_principal.set(principal)


def reset_current_principal(token: Token) -> None:
    try:
        _current_principal.reset(token)
    except ValueError:  # pragma: no cover - jeton issu d'un autre contexte
        _current_principal.set(None)


def get_current_principal() -> Optional[MCPPrincipal]:
    return _current_principal.get()


def require_scope(scope: str) -> MCPPrincipal:
    """Lève MCPAuthorizationError si le scope est absent. Fail-closed."""
    principal = _current_principal.get()
    if principal is None:
        logger.error("Appel d'outil MCP sans principal authentifié (session non authentifiée ?)")
        raise MCPAuthorizationError(scope, None)
    if not principal.has_scope(scope):
        logger.warning(
            "Scope refusé: '%s' demandé par la clé '%s' (scopes: %s)",
            scope, principal.name, ",".join(sorted(principal.scopes)),
        )
        raise MCPAuthorizationError(scope, principal)
    return principal


__all__ = [
    "MCPPrincipal",
    "MCPAuthorizationError",
    "SCOPE_READ",
    "SCOPE_WRITE",
    "set_current_principal",
    "reset_current_principal",
    "get_current_principal",
    "require_scope",
]
