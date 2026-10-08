import hashlib
import json
import logging
import time
from typing import Dict, Any, Optional
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from enum import Enum

logger = logging.getLogger("ids_ips.mcp.audit")


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class AuditEventType(str, Enum):
    """Types d'événements d'audit MCP."""
    CONNECTION_OPEN = "mcp_connection_open"
    CONNECTION_CLOSE = "mcp_connection_close"
    AUTH_SUCCESS = "mcp_auth_success"
    AUTH_FAILURE = "mcp_auth_failure"
    ORIGIN_REJECTED = "mcp_origin_rejected"
    HOST_REJECTED = "mcp_host_rejected"
    MTLS_REJECTED = "mcp_mtls_rejected"
    TOOL_INVOKED = "mcp_tool_invoked"
    TOOL_SUCCESS = "mcp_tool_success"
    TOOL_ERROR = "mcp_tool_error"
    RATE_LIMITED = "mcp_rate_limited"
    FIREWALL_ACTION = "mcp_firewall_action"
    RL_FEEDBACK = "mcp_rl_feedback"


@dataclass
class MCPAuditEvent:
    """Événement d'audit structuré."""
    timestamp: str
    event_type: AuditEventType
    client_ip: str
    key_fingerprint: str
    user_agent: Optional[str] = None
    origin: Optional[str] = None
    tool_name: Optional[str] = None
    tool_params: Optional[Dict[str, Any]] = None
    result_status: Optional[str] = None
    error_message: Optional[str] = None
    duration_ms: Optional[float] = None
    metadata: Optional[Dict[str, Any]] = None

    def to_json(self) -> str:
        return json.dumps(asdict(self), ensure_ascii=False)

    def log(self) -> None:
        logger.info(self.to_json())


class MCPAuditLogger:
    """Logger d'audit pour les événements MCP."""

    def __init__(self):
        self._enabled = True

    def set_enabled(self, enabled: bool) -> None:
        self._enabled = enabled

    def log_connection_open(self, scope: Dict[str, Any]) -> None:
        if not self._enabled:
            return
        event = MCPAuditEvent(
            timestamp=_utc_now_iso(),
            event_type=AuditEventType.CONNECTION_OPEN,
            client_ip=scope.get("client", ("unknown", 0))[0],
            key_fingerprint=self._extract_key_fingerprint(scope),
            user_agent=self._extract_user_agent(scope),
            origin=self._extract_origin(scope),
        )
        event.log()

    def log_connection_close(self, scope: Dict[str, Any], duration_ms: Optional[float] = None) -> None:
        if not self._enabled:
            return
        event = MCPAuditEvent(
            timestamp=_utc_now_iso(),
            event_type=AuditEventType.CONNECTION_CLOSE,
            client_ip=scope.get("client", ("unknown", 0))[0],
            key_fingerprint=self._extract_key_fingerprint(scope),
            duration_ms=duration_ms,
        )
        event.log()

    def log_auth_success(self, scope: Dict[str, Any], principal: Any = None) -> None:
        """
        Trace une authentification reussie. L'identite provient du principal
        resolu (nom de cle du registre + empreinte), jamais du secret presente.
        """
        if not self._enabled:
            return
        event = MCPAuditEvent(
            timestamp=_utc_now_iso(),
            event_type=AuditEventType.AUTH_SUCCESS,
            client_ip=scope.get("client", ("unknown", 0))[0],
            key_fingerprint=(
                principal.fingerprint if principal is not None
                else self._extract_key_fingerprint(scope)
            ),
            origin=self._extract_origin(scope),
            metadata=(
                {"client": principal.name, "scopes": sorted(principal.scopes),
                 "source": principal.source}
                if principal is not None else None
            ),
        )
        event.log()

    def log_auth_failure(self, scope: Dict[str, Any], reason: str) -> None:
        if not self._enabled:
            return
        event = MCPAuditEvent(
            timestamp=_utc_now_iso(),
            event_type=AuditEventType.AUTH_FAILURE,
            client_ip=scope.get("client", ("unknown", 0))[0],
            key_fingerprint=self._extract_key_fingerprint(scope),
            origin=self._extract_origin(scope),
            error_message=reason,
        )
        event.log()

    def log_origin_rejected(self, scope: Dict[str, Any], origin: str) -> None:
        if not self._enabled:
            return
        event = MCPAuditEvent(
            timestamp=_utc_now_iso(),
            event_type=AuditEventType.ORIGIN_REJECTED,
            client_ip=scope.get("client", ("unknown", 0))[0],
            key_fingerprint=self._extract_key_fingerprint(scope),
            origin=origin,
            error_message="Origin not in allowed list",
        )
        event.log()

    def log_host_rejected(self, scope: Dict[str, Any], host: str) -> None:
        if not self._enabled:
            return
        event = MCPAuditEvent(
            timestamp=_utc_now_iso(),
            event_type=AuditEventType.HOST_REJECTED,
            client_ip=scope.get("client", ("unknown", 0))[0],
            key_fingerprint=self._extract_key_fingerprint(scope),
            error_message=f"Host not in allowed list: {host}",
        )
        event.log()

    def log_mtls_rejected(self, scope: Dict[str, Any], reason: str) -> None:
        if not self._enabled:
            return
        event = MCPAuditEvent(
            timestamp=_utc_now_iso(),
            event_type=AuditEventType.MTLS_REJECTED,
            client_ip=scope.get("client", ("unknown", 0))[0],
            key_fingerprint=self._extract_key_fingerprint(scope),
            error_message=reason,
        )
        event.log()

    def log_tool_invoked(
        self,
        scope: Dict[str, Any],
        tool_name: str,
        params: Dict[str, Any],
        key_fingerprint: Optional[str] = None,
    ) -> None:
        if not self._enabled:
            return
        event = MCPAuditEvent(
            timestamp=_utc_now_iso(),
            event_type=AuditEventType.TOOL_INVOKED,
            client_ip=scope.get("client", ("unknown", 0))[0],
            key_fingerprint=key_fingerprint or self._extract_key_fingerprint(scope),
            tool_name=tool_name,
            tool_params=self._sanitize_params(params),
        )
        event.log()

    def log_tool_result(
        self,
        scope: Dict[str, Any],
        tool_name: str,
        success: bool,
        duration_ms: float,
        error: Optional[str] = None,
        key_fingerprint: Optional[str] = None,
    ) -> None:
        if not self._enabled:
            return
        event = MCPAuditEvent(
            timestamp=_utc_now_iso(),
            event_type=AuditEventType.TOOL_SUCCESS if success else AuditEventType.TOOL_ERROR,
            client_ip=scope.get("client", ("unknown", 0))[0],
            key_fingerprint=key_fingerprint or self._extract_key_fingerprint(scope),
            tool_name=tool_name,
            result_status="success" if success else "error",
            error_message=error,
            duration_ms=duration_ms,
        )
        event.log()

    def log_rate_limited(self, scope: Dict[str, Any]) -> None:
        if not self._enabled:
            return
        event = MCPAuditEvent(
            timestamp=_utc_now_iso(),
            event_type=AuditEventType.RATE_LIMITED,
            client_ip=scope.get("client", ("unknown", 0))[0],
            key_fingerprint=self._extract_key_fingerprint(scope),
        )
        event.log()

    def log_firewall_action(
        self,
        scope: Dict[str, Any],
        action: str,
        target_ip: str,
        success: bool,
        key_fingerprint: Optional[str] = None,
    ) -> None:
        if not self._enabled:
            return
        event = MCPAuditEvent(
            timestamp=_utc_now_iso(),
            event_type=AuditEventType.FIREWALL_ACTION,
            client_ip=scope.get("client", ("unknown", 0))[0],
            key_fingerprint=key_fingerprint or self._extract_key_fingerprint(scope),
            tool_name="execute_manual_action",
            result_status="success" if success else "failed",
            metadata={"action": action, "target_ip": target_ip},
        )
        event.log()

    def log_rl_feedback(
        self,
        scope: Dict[str, Any],
        ip: str,
        action: int,
        recorded: bool,
        key_fingerprint: Optional[str] = None,
    ) -> None:
        if not self._enabled:
            return
        event = MCPAuditEvent(
            timestamp=_utc_now_iso(),
            event_type=AuditEventType.RL_FEEDBACK,
            client_ip=scope.get("client", ("unknown", 0))[0],
            key_fingerprint=key_fingerprint or self._extract_key_fingerprint(scope),
            tool_name="execute_manual_action",
            result_status="recorded" if recorded else "skipped",
            metadata={"target_ip": ip, "rl_action_code": action},
        )
        event.log()

    def _extract_key_fingerprint(self, scope: Dict[str, Any]) -> str:
        """
        Empreinte non reversible de la clé presentee (12 premiers caracteres du
        SHA-256). Le secret, ni meme son prefixe, ne doit jamais atterrir dans
        les journaux : une fuite de log = fuite de credential.
        """
        headers = scope.get("headers", [])
        for k, v in headers:
            if k == b"x-mcp-api-key":
                return hashlib.sha256(v).hexdigest()[:12]
        return "none"

    def _extract_origin(self, scope: Dict[str, Any]) -> Optional[str]:
        headers = scope.get("headers", [])
        for k, v in headers:
            if k == b"origin":
                return v.decode("latin-1", errors="ignore")
        return None

    def _extract_user_agent(self, scope: Dict[str, Any]) -> Optional[str]:
        headers = scope.get("headers", [])
        for k, v in headers:
            if k == b"user-agent":
                return v.decode("latin-1", errors="ignore")
        return None

    def _sanitize_params(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Supprime les données sensibles des paramètres pour l'audit."""
        sanitized = {}
        sensitive_keys = {"reason", "api_key", "password", "token", "secret"}
        for k, v in params.items():
            if k.lower() in sensitive_keys:
                sanitized[k] = "***REDACTED***"
            else:
                sanitized[k] = v
        return sanitized


# Instance globale
mcp_audit_logger = MCPAuditLogger()