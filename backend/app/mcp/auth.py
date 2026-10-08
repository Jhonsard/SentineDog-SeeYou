import asyncio
import logging
import ssl
from typing import Optional
from starlette.types import ASGIApp, Scope, Receive, Send
from starlette.responses import JSONResponse
from app.core.config import settings
from app.core.thread_pools import get_db_threadpool
from app.mcp.audit import mcp_audit_logger, AuditEventType
from app.mcp.security import (
    MCPPrincipal,
    reset_current_principal,
    set_current_principal,
)
from app.services.mcp_key_service import verify_key

logger = logging.getLogger("ids_ips.mcp.auth")


class MCPAuthMiddleware:
    """
    Middleware ASGI authentifiant les connexions MCP SSE via l'en-tête X-MCP-API-KEY.

    Caracteristiques :
      - résolution de la clé dans le REGISTRE haché (app/services/mcp_key_service.py) :
        SHA-256 + hmac.compare_digest, scopes read/write, expiration, révocation ;
      - la clé de secours statique (MCP_API_KEY) n'est acceptée que si
        MCP_LEGACY_API_KEY_ENABLED est vrai (fail-closed par défaut) ;
      - le secret n'est JAMAIS journalisé : seul un condensat tronqué est écrit ;
      - contrôle de l'en-tête Host (protection DNS rebinding) et de l'Origin
        lorsqu'il est présent (protection navigateur) ;
      - mTLS délégué au reverse proxy (cf. _validate_client_cert).
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app
        self.allowed_origins = set(settings.MCP_ALLOWED_ORIGINS)
        self.allowed_hosts = set(settings.MCP_ALLOWED_HOSTS)
        self.mtls_enabled = settings.MCP_MTLS_ENABLED
        self.mtls_ca_cert_path = settings.MCP_MTLS_CA_CERT_PATH
        self._ssl_context: Optional[ssl.SSLContext] = None
        
        if self.mtls_enabled and self.mtls_ca_cert_path:
            self._init_ssl_context()

    def _init_ssl_context(self) -> None:
        """Initialise le contexte SSL pour validation certificats clients."""
        try:
            self._ssl_context = ssl.create_default_context(ssl.Purpose.CLIENT_AUTH)
            self._ssl_context.load_verify_locations(self.mtls_ca_cert_path)
            self._ssl_context.verify_mode = ssl.CERT_REQUIRED
            logger.info("mTLS MCP activé avec CA: %s", self.mtls_ca_cert_path)
        except Exception as e:
            logger.error("Échec initialisation mTLS MCP: %s", e)
            self.mtls_enabled = False

    def _validate_client_cert(self, scope: Scope) -> bool:
        """
        Valide le certificat client si mTLS est activé.
        
        Note: Dans Starlette/ASGI, les infos de certificat client sont généralement
        disponibles via `scope.get("client_cert")` ou les variables d'environnement
        du serveur (ex: uvicorn avec ssl_ca_certs).
        """
        if not self.mtls_enabled:
            return True
        
        # Vérifier la présence d'un certificat client
        client_cert = scope.get("client_cert")
        if not client_cert:
            mcp_audit_logger.log_mtls_rejected(scope, "No client certificate presented")
            return False
        
        try:
            if isinstance(client_cert, dict):
                not_after = client_cert.get("notAfter")
                if not_after:
                    import datetime
                    expiry = datetime.datetime.strptime(not_after, "%b %d %H:%M:%S %Y %Z")
                    if expiry < datetime.datetime.utcnow():
                        mcp_audit_logger.log_mtls_rejected(scope, "Client certificate expired")
                        return False
            return True
        except Exception as e:
            logger.error("Erreur validation certificat client: %s", e)
            mcp_audit_logger.log_mtls_rejected(scope, f"Certificate validation error: {e}")
            return False

    def _validate_host(self, scope: Scope) -> bool:
        """
        Valide l'en-tete Host contre MCP_ALLOWED_HOSTS (protection DNS rebinding).

        Le SDK MCP ne controle le Host que sur le flux SSE (GET /sse) ; ce controle
        couvre aussi POST /mcp/messages/ et fonctionne meme si la configuration
        transport_security du SDK est modifiee par erreur.
        """
        headers = dict(scope.get("headers", []))
        host_bytes = headers.get(b"host", b"")
        if not host_bytes:
            mcp_audit_logger.log_host_rejected(scope, "absent")
            return False

        host = host_bytes.decode("latin-1", errors="ignore").strip().lower()
        allowed = {h.strip().lower() for h in self.allowed_hosts}

        if host in allowed:
            return True
        for pattern in allowed:
            if pattern.endswith(":*") and host.startswith(pattern[:-1]):
                return True

        mcp_audit_logger.log_host_rejected(scope, host)
        return False

    def _validate_origin(self, scope: Scope) -> bool:
        """
        Valide l'en-tete Origin pour les connexions SSE.

        Regle (identique a la semantique du SDK MCP, fail-closed) :
        - Origin ABSENT  -> ACCEPTE : les clients MCP non-navigateur
          (Claude Desktop, CLI MCP, scripts, agents) n'envoient jamais d'Origin.
          Les rejeter rendait le plan MCP inutilisable (403 systematique).
        - Origin PRESENT -> doit figurer dans MCP_ALLOWED_ORIGINS, liste non vide.
          Liste vide => aucun navigateur autorise (defaut recommande pour un
          endpoint executant iptables).
        La protection DNS rebinding / CSRF navigateur est assuree par
        _validate_host() et par allowed_origins du SDK.
        """
        headers = dict(scope.get("headers", []))
        origin_bytes = headers.get(b"origin", b"")

        if not origin_bytes:
            return True

        origin = origin_bytes.decode("utf-8", errors="ignore").strip()
        if self.allowed_origins and origin in self.allowed_origins:
            return True

        mcp_audit_logger.log_origin_rejected(scope, origin or "vide")
        return False

    async def _verify_key(self, raw_key: str) -> Optional[MCPPrincipal]:
        """
        Résout la clé présentée via le registre (execution dans le thread pool DB
        pour ne jamais bloquer la boucle evenementielle).

        Retourne None si la clé est inconnue, expirée ou révoquée.
        """
        loop = asyncio.get_running_loop()

        def _verify() -> Optional[MCPPrincipal]:
            from app.core.dependencies import SessionLocal
            db = SessionLocal()
            try:
                return verify_key(db, raw_key)
            finally:
                db.close()

        return await loop.run_in_executor(get_db_threadpool(), _verify)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] in ("http", "websocket"):
            # 0. Validation mTLS (si activé) - PREMIER rempart
            if not self._validate_client_cert(scope):
                response = JSONResponse(
                    status_code=403,
                    content={"detail": "Certificat client invalide ou absent (mTLS requis)."},
                )
                await response(scope, receive, send)
                return

            # 1. Validation Host (DNS rebinding) - couvre /sse ET /messages
            if not self._validate_host(scope):
                logger.warning(
                    "Host MCP refuse: %s depuis %s",
                    dict(scope.get("headers", [])).get(b"host", b"absent"),
                    scope.get("client", ("unknown", 0))[0],
                )
                response = JSONResponse(
                    status_code=421,
                    content={"detail": "Hote non autorise pour le plan MCP."},
                )
                await response(scope, receive, send)
                return

            # 2. Validation Origin (CORS navigateur)
            if not self._validate_origin(scope):
                headers = dict(scope.get("headers", []))
                origin = headers.get(b"origin", b"").decode("utf-8", errors="ignore") or "absent"
                logger.warning("Origine MCP refusée: %s depuis %s", origin, scope.get("client", ("unknown", 0))[0])
                response = JSONResponse(
                    status_code=403,
                    content={"detail": "Origine non autorisée pour MCP SSE."},
                )
                await response(scope, receive, send)
                return

            # 3. Authentification : registre de clés à scopes (+ clé de secours
            #    statique désactivée par défaut). La vérification DB/scope est
            #    exécutée dans un thread pour ne pas bloquer la boucle.
            headers = dict(scope.get("headers", []))
            api_key_bytes = headers.get(b"x-mcp-api-key", b"")

            if not api_key_bytes:
                mcp_audit_logger.log_auth_failure(scope, "Missing API key")
                response = JSONResponse(
                    status_code=401,
                    content={"detail": "Accès non autorisé : Clé API MCP absente."},
                )
                await response(scope, receive, send)
                return

            # decode(errors="replace") : un en-tête non ASCII ne doit plus
            # provoquer de TypeError dans compare_digest (500 pré-auth).
            raw_key = api_key_bytes.decode("utf-8", errors="replace")

            principal = await self._verify_key(raw_key)
            if principal is None:
                mcp_audit_logger.log_auth_failure(scope, "Invalid API key")
                logger.warning(
                    "Tentative d'accès MCP non autorisée depuis %s",
                    scope.get("client", ("unknown", 0))[0],
                )
                response = JSONResponse(
                    status_code=403,
                    content={"detail": "Accès refusé : Clé API MCP invalide, expirée ou révoquée."},
                )
                await response(scope, receive, send)
                return

            # Le principal est attaché au contexte de la session SSE : les
            # permissions d'outils seront évaluées sur cette identité.
            token = set_current_principal(principal)
            mcp_audit_logger.log_auth_success(scope, principal)
            try:
                await self.app(scope, receive, send)
            finally:
                reset_current_principal(token)
            return

        await self.app(scope, receive, send)
