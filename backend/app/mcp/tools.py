import json
import logging
import time
from datetime import datetime
from typing import Optional, Dict, Any, List, Union
from enum import Enum
from concurrent.futures import ThreadPoolExecutor

from pydantic import BaseModel, Field, ConfigDict, IPvAnyAddress, field_validator
from mcp.server.fastmcp import FastMCP

from app.mcp.server import mcp, get_db_threadpool, get_firewall_threadpool, get_rl_threadpool
from app.engine.firewall import firewall_manager
from app.core.dependencies import SessionLocal
from app.db.models import Alert
from app.api.endpoints.ai import _ai_service
from app.services.alert_manager import alert_manager
from app.mcp.audit import mcp_audit_logger
from app.mcp.security import (
    SCOPE_READ,
    SCOPE_WRITE,
    get_current_principal,
    require_scope,
)

logger = logging.getLogger("ids_ips.mcp.tools")

# ==========================================
# Modèles de validation Pydantic (Inputs)
# ==========================================

class SecurityStatsInput(BaseModel):
    """Schéma d'entrée pour la récupération des métriques et alertes."""
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    limit: int = Field(
        default=20,
        ge=1,
        le=100,
        description="Nombre maximal d'alertes récentes à retourner (entre 1 et 100)."
    )


class ExplainDecisionInput(BaseModel):
    """Schéma d'entrée pour la demande d'explication d'une décision RL."""
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    ip_address: IPvAnyAddress = Field(
        ...,
        description="Adresse IP source pour laquelle interroger l'historique d'inférence et les 20 caractéristiques (features)."
    )


class ActionType(str, Enum):
    BLOCK = "block"
    UNBAN = "unban"


class ManualActionInput(BaseModel):
    """Schéma d'entrée pour l'exécution d'une action corrective sur le pare-feu."""
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    ip_address: IPvAnyAddress = Field(
        ...,
        description="Adresse IP ciblée par l'action de sécurité."
    )
    action: ActionType = Field(
        ...,
        description="Type d'action à appliquer : 'block' pour bannir ou 'unban' pour réautoriser l'IP."
    )
    reason: str = Field(
        ...,
        min_length=5,
        max_length=500,
        description="Justification de l'Agent IA expliquant le motif de l'intervention."
    )

# ==========================================
# Modèles de sortie Pydantic (Response Schemas)
# ==========================================

class AlertSummary(BaseModel):
    """Résumé d'une alerte pour la liste."""
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: int
    timestamp: str
    source_ip: str
    destination_port: int
    protocol: str
    severity: str
    rule_triggered: str = Field(validation_alias="alert_type")

    @field_validator("timestamp", mode="before")
    @classmethod
    def convert_timestamp(cls, v):
        if isinstance(v, datetime):
            return str(v)
        return v


class SecurityStatsSummary(BaseModel):
    """Métriques globales de sécurité."""
    banned_hosts_count: int
    banned_hosts: List[str]
    anomaly_rate: float
    total_alerts_count: int


class SecurityStatsResponse(BaseModel):
    """Réponse complète pour get_security_stats_and_alerts."""
    summary: SecurityStatsSummary
    recent_alerts: List[AlertSummary]


class RLDecisionFeature(BaseModel):
    """Une feature individuelle du vecteur RL."""
    name: str
    value: float
    description: Optional[str] = None


class RLDecisionResponse(BaseModel):
    """Réponse pour explain_rl_decision."""
    ip_address: str
    decision_code: int
    decision_label: str
    confidence_score: float
    low_confidence_flag: bool
    extracted_features_count: int
    features_20_vector: Dict[str, float]
    evaluated_at: str
    model_version: Optional[str] = None
    reason: Optional[str] = None


class FirewallActionResult(BaseModel):
    """Résultat d'une action firewall."""
    success: bool
    message: Optional[str] = None


class RLFeedbackResult(BaseModel):
    """Résultat de l'enregistrement du feedback RL."""
    status: str
    ip: Optional[str] = None
    action: Optional[int] = None
    reward: Optional[float] = None
    buffer_size: Optional[int] = None
    reason: Optional[str] = None


class RLDecisionNotFoundResponse(BaseModel):
    """Réponse quand aucune décision n'est trouvée."""
    status: str = "not_found"
    message: str
    ip_address: str


class RLDecisionErrorResponse(BaseModel):
    """Réponse en cas d'erreur."""
    status: str = "error"
    message: str
    ip_address: str


class ManualActionResponse(BaseModel):
    """Réponse complète pour execute_manual_action."""
    status: str
    action_executed: str
    target_ip: str
    firewall_updated: bool
    rl_feedback_recorded: RLFeedbackResult
    reason: str


RLDecisionResponseUnion = Union[RLDecisionResponse, RLDecisionNotFoundResponse, RLDecisionErrorResponse]


# ==========================================
# Helpers d'exécution thread-safe
# ==========================================

def _session_fingerprint() -> Optional[str]:
    """Empreinte de la clé de la session SSE courante (jamais le secret)."""
    principal = get_current_principal()
    return principal.fingerprint if principal is not None else None


async def run_in_db_pool(func, *args, **kwargs):
    """Exécute une fonction synchrone DB dans le thread pool dédié DB."""
    loop = __import__("asyncio").get_running_loop()
    pool: ThreadPoolExecutor = get_db_threadpool()
    return await loop.run_in_executor(pool, lambda: func(*args, **kwargs))


async def run_in_firewall_pool(func, *args, **kwargs):
    """Exécute une fonction synchrone Firewall dans le thread pool dédié."""
    loop = __import__("asyncio").get_running_loop()
    pool: ThreadPoolExecutor = get_firewall_threadpool()
    return await loop.run_in_executor(pool, lambda: func(*args, **kwargs))


async def run_in_rl_pool(func, *args, **kwargs):
    """Exécute une fonction synchrone RL dans le thread pool dédié."""
    loop = __import__("asyncio").get_running_loop()
    pool: ThreadPoolExecutor = get_rl_threadpool()
    return await loop.run_in_executor(pool, lambda: func(*args, **kwargs))


# ==========================================
# Opérations DB synchrones (pour thread pool)
# ==========================================

def _sync_get_security_stats(limit: int) -> SecurityStatsResponse:
    """Opération DB synchrone - exécutée dans thread pool DB."""
    db = SessionLocal()
    try:
        alerts_query = db.query(Alert).order_by(Alert.timestamp.desc()).limit(limit).all()
        alerts_list = [
            AlertSummary(
                id=alert.id,
                timestamp=str(alert.timestamp),
                source_ip=alert.source_ip,
                destination_port=alert.destination_port or 0,
                protocol=alert.protocol,
                severity=alert.severity,
                rule_triggered=alert.alert_type,
            )
            for alert in alerts_query
        ]

        banned_hosts = firewall_manager.get_banned_hosts()
        global_stats = alert_manager.get_global_stats()

        summary = SecurityStatsSummary(
            banned_hosts_count=len(banned_hosts),
            banned_hosts=list(banned_hosts),
            anomaly_rate=global_stats.get("anomaly_rate", 0.0),
            total_alerts_count=global_stats.get("total_alerts", len(alerts_list)),
        )

        return SecurityStatsResponse(summary=summary, recent_alerts=alerts_list)

    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def _sync_explain_rl_decision(ip_address: str) -> Optional[RLDecisionResponse]:
    """Opération RL synchrone - exécutée dans thread pool RL."""
    decision_log = _ai_service.get_latest_decision_for_ip(ip_address)

    if not decision_log:
        return None

    confidence = decision_log.get("confidence", 0.0)
    features = decision_log.get("features", {})

    return RLDecisionResponse(
        ip_address=ip_address,
        decision_code=decision_log.get("decision_code", 3),
        decision_label=decision_log.get("decision_label", "manual"),
        confidence_score=confidence,
        low_confidence_flag=confidence < 0.85,
        extracted_features_count=len(features),
        features_20_vector=features,
        evaluated_at=str(decision_log.get("timestamp", "")),
        model_version=decision_log.get("model_version"),
        reason=decision_log.get("reason"),
    )


# ==========================================
# Déclaration des Tools MCP
# ==========================================

@mcp.tool(
    name="get_security_stats_and_alerts",
    annotations={
        "title": "Obtenir les statistiques de sécurité et les dernières alertes",
        "readOnlyHint": True,
        "destructiveHint": False,
        "idempotentHint": True,
        "openWorldHint": False,
    },
)
async def get_security_stats_and_alerts(params: SecurityStatsInput) -> SecurityStatsResponse:
    """
    Interroge la base de données et les services de sécurité pour restituer le
    journal récent des alertes IDS/IPS, ainsi que les métriques globales du
    système (hôtes bannis, taux d'anomalies global).

    Args:
        params (SecurityStatsInput): Paramètres contenant la limite d'alertes à extraire.

    Returns:
        SecurityStatsResponse: Métriques globales et liste des dernières alertes (typé).
    """
    start_time = time.time()
    mcp_audit_logger.log_tool_invoked({}, "get_security_stats_and_alerts", {"limit": params.limit}, _session_fingerprint())

    # Autorisation fail-closed : l'exception est remontée au client MCP sous la
    # forme d'un résultat en erreur (isError), jamais d'un faux jeu de données vide.
    require_scope(SCOPE_READ)

    try:
        result = await run_in_db_pool(_sync_get_security_stats, params.limit)
        mcp_audit_logger.log_tool_result({}, "get_security_stats_and_alerts", True, (time.time() - start_time) * 1000, key_fingerprint=_session_fingerprint())
        return result
    except Exception as e:
        logger.error("Erreur get_security_stats_and_alerts: %s", e, exc_info=True)
        mcp_audit_logger.log_tool_result({}, "get_security_stats_and_alerts", False, (time.time() - start_time) * 1000, str(e), key_fingerprint=_session_fingerprint())
        return SecurityStatsResponse(
            summary=SecurityStatsSummary(
                banned_hosts_count=0,
                banned_hosts=[],
                anomaly_rate=0.0,
                total_alerts_count=0,
            ),
            recent_alerts=[],
        )


@mcp.tool(
    name="explain_rl_decision",
    annotations={
        "title": "Expliquer la décision d'inférence du modèle RL",
        "readOnlyHint": True,
        "destructiveHint": False,
        "idempotentHint": True,
        "openWorldHint": False,
    },
)
async def explain_rl_decision(params: ExplainDecisionInput) -> RLDecisionResponseUnion:
    """
    Consulte l'historique d'inférence de AIDecisionService / RLInference pour une
    adresse IP donnée. Restitue les 20 caractéristiques (features) du paquet, la
    décision attribuée par le modèle SeeYou.keras (0=allow, 1=alert, 2=block,
    3=manual) ainsi que le score de confiance (flagué si < 0.85).

    Args:
        params (ExplainDecisionInput): Objet contenant l'adresse IP à inspecter.

    Returns:
        RLDecisionResponseUnion: Explication détaillée de la décision au format JSON typé.
    """
    start_time = time.time()
    ip_str = str(params.ip_address)
    mcp_audit_logger.log_tool_invoked({}, "explain_rl_decision", {"ip_address": ip_str}, _session_fingerprint())

    require_scope(SCOPE_READ)

    try:
        result = await run_in_rl_pool(_sync_explain_rl_decision, ip_str)

        if result is None:
            mcp_audit_logger.log_tool_result({}, "explain_rl_decision", True, (time.time() - start_time) * 1000, key_fingerprint=_session_fingerprint())
            return RLDecisionNotFoundResponse(
                message=f"Aucun historique de décision récent n'a été trouvé pour l'IP {ip_str}.",
                ip_address=ip_str,
            )

        mcp_audit_logger.log_tool_result({}, "explain_rl_decision", True, (time.time() - start_time) * 1000, key_fingerprint=_session_fingerprint())
        return result

    except Exception as e:
        logger.error("Erreur explain_rl_decision pour %s: %s", ip_str, e, exc_info=True)
        mcp_audit_logger.log_tool_result({}, "explain_rl_decision", False, (time.time() - start_time) * 1000, str(e), key_fingerprint=_session_fingerprint())
        return RLDecisionErrorResponse(
            message=f"Erreur lors de l'extraction de l'explication RL : {str(e)}",
            ip_address=ip_str,
        )


# Mapping des actions du tool vers les codes RL
_ACTION_TO_CODE = {
    ActionType.BLOCK: 2,    # ACTION_BLOCK
    ActionType.UNBAN: 0,    # ACTION_ALLOW
}


@mcp.tool(
    name="execute_manual_action",
    annotations={
        "title": "Exécuter une action manuelle de pare-feu et mettre à jour le feedback RL",
        "readOnlyHint": False,
        "destructiveHint": True,
        "idempotentHint": False,
        "openWorldHint": True,
    },
)
async def execute_manual_action(params: ManualActionInput) -> ManualActionResponse:
    """
    Permet à l'Agent LLM d'exécuter un blocage ou déblocage immédiat d'une IP via
    le firewall_manager, et enregistre le retour d'expérience dans la boucle de
    feedback de AIDecisionService pour le réentraînement continu du modèle RL.

    Args:
        params (ManualActionInput): Adresse IP, action ('block' ou 'unban') et justification.

    Returns:
        ManualActionResponse: Résultat de l'exécution réseau et confirmation d'enregistrement du feedback IA.
    """
    ip_str = str(params.ip_address)
    action_code = _ACTION_TO_CODE.get(params.action, 3)
    start_time = time.time()
    
    mcp_audit_logger.log_tool_invoked(
        {},
        "execute_manual_action",
        {
            "ip_address": ip_str,
            "action": params.action.value,
            "reason": params.reason,
        },
        _session_fingerprint(),
    )

    # Action destructive : scope 'write' obligatoire. Contrôle effectué avant
    # toute operation, sur l'identité de la session SSE (cf. app.mcp.security).
    require_scope(SCOPE_WRITE)

    try:
        # Firewall operations déjà async (utilisent asyncio.to_thread internement)
        if params.action == ActionType.BLOCK:
            firewall_success = await firewall_manager.block_ip(ip_str, reason=f"MCP_MANUAL_BLOCK: {params.reason}")
            action_performed = "blocked"
        else:
            firewall_success = await firewall_manager.unblock_ip(ip_str, admin_username="mcp_agent")
            action_performed = "unbanned"

        if not firewall_success:
            mcp_audit_logger.log_tool_result({}, "execute_manual_action", False, (time.time() - start_time) * 1000, "Firewall operation failed", key_fingerprint=_session_fingerprint())
            mcp_audit_logger.log_firewall_action({}, action_performed, ip_str, False, key_fingerprint=_session_fingerprint())
            return ManualActionResponse(
                status="failed",
                action_executed=action_performed,
                target_ip=ip_str,
                firewall_updated=False,
                rl_feedback_recorded=RLFeedbackResult(status="skipped", reason="firewall_failed"),
                reason=params.reason,
            )

        # Feedback RL - opération mémoire/calcul rapide, mais on isole dans thread pool RL par cohérence
        def _record_feedback():
            return _ai_service.record_manual_feedback(
                ip=ip_str,
                human_action=action_code,
                context={"reason": params.reason, "source": "mcp_agent", "event_type": "manual_mcp"},
            )

        feedback_data = await run_in_rl_pool(_record_feedback)
        feedback_result = RLFeedbackResult(**feedback_data)

        mcp_audit_logger.log_tool_result({}, "execute_manual_action", True, (time.time() - start_time) * 1000, key_fingerprint=_session_fingerprint())
        mcp_audit_logger.log_firewall_action({}, action_performed, ip_str, True, key_fingerprint=_session_fingerprint())
        mcp_audit_logger.log_rl_feedback({}, ip_str, action_code, feedback_result.status == "recorded", key_fingerprint=_session_fingerprint())

        return ManualActionResponse(
            status="success",
            action_executed=action_performed,
            target_ip=ip_str,
            firewall_updated=True,
            rl_feedback_recorded=feedback_result,
            reason=params.reason,
        )

    except Exception as e:
        logger.error("Erreur critique execute_manual_action pour %s: %s", ip_str, e, exc_info=True)
        mcp_audit_logger.log_tool_result({}, "execute_manual_action", False, (time.time() - start_time) * 1000, str(e), key_fingerprint=_session_fingerprint())
        return ManualActionResponse(
            status="error",
            action_executed="none",
            target_ip=ip_str,
            firewall_updated=False,
            rl_feedback_recorded=RLFeedbackResult(status="error", reason=str(e)),
            reason=params.reason,
        )