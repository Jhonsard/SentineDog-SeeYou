"""
Implémentation du pattern Observer pour le système d'alerting.
Les observateurs s'abonnent aux événements d'alerte et réagissent de manière découplée.
"""
import asyncio
import logging
import time
from typing import List, Dict, Any, Optional
from abc import ABC, abstractmethod

from .interfaces import IAlertObserver, DetectionResult, CorrelatedIncident, ResponseAction

logger = logging.getLogger("ids_ips.alerting")


class AlertManager:
    """
    Subject du pattern Observer.
    Gère les observateurs et notifie les alertes.
    """
    
    def __init__(self):
        self._observers: List[IAlertObserver] = []
        self._alert_history: List[Dict[str, Any]] = []
        self._max_history = 1000
        self._lock = asyncio.Lock()
    
    def attach(self, observer: IAlertObserver) -> None:
        """
        Attache un observateur au sujet.
        
        Args:
            observer: Observateur à attacher
        """
        self._observers.append(observer)
        logger.info(f"Observateur attaché: {observer.get_observer_name()}")
    
    def detach(self, observer: IAlertObserver) -> None:
        """
        Détache un observateur du sujet.
        
        Args:
            observer: Observateur à détacher
        """
        if observer in self._observers:
            self._observers.remove(observer)
            logger.info(f"Observateur détaché: {observer.get_observer_name()}")
    
    async def notify_alert(self, detection: DetectionResult) -> None:
        """
        Notifie tous les observateurs d'une alerte.
        
        Args:
            detection: Résultat de la détection
        """
        async with self._lock:
            # Enregistrer dans l'historique
            alert_record = {
                "type": "alert",
                "timestamp": time.time(),
                "detection": detection.to_dict()
            }
            self._alert_history.append(alert_record)
            
            # Maintenir la taille de l'historique
            if len(self._alert_history) > self._max_history:
                self._alert_history.pop(0)
        
        # Notifier tous les observateurs de manière asynchrone
        tasks = [observer.on_alert(detection) for observer in self._observers]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Logger les erreurs
        for observer, result in zip(self._observers, results):
            if isinstance(result, Exception):
                logger.error(
                    f"Erreur observateur {observer.get_observer_name()}: {result}"
                )
    
    async def notify_incident(self, incident: CorrelatedIncident) -> None:
        """
        Notifie tous les observateurs d'un incident corrélé.
        
        Args:
            incident: Incident corrélé
        """
        async with self._lock:
            # Enregistrer dans l'historique
            incident_record = {
                "type": "incident",
                "timestamp": time.time(),
                "incident": incident.to_dict()
            }
            self._alert_history.append(incident_record)
            
            # Maintenir la taille de l'historique
            if len(self._alert_history) > self._max_history:
                self._alert_history.pop(0)
        
        # Notifier tous les observateurs de manière asynchrone
        tasks = [observer.on_incident(incident) for observer in self._observers]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Logger les erreurs
        for observer, result in zip(self._observers, results):
            if isinstance(result, Exception):
                logger.error(
                    f"Erreur observateur {observer.get_observer_name()}: {result}"
                )
    
    def get_alert_history(self, limit: int = 100) -> List[Dict[str, Any]]:
        """
        Récupère l'historique des alertes.
        
        Args:
            limit: Nombre maximum d'alertes à retourner
            
        Returns:
            Liste des alertes récentes
        """
        return self._alert_history[-limit:]
    
    def get_observer_count(self) -> int:
        """Retourne le nombre d'observateurs attachés."""
        return len(self._observers)


class DatabaseObserver(IAlertObserver):
    """
    Observateur qui log les alertes en base de données.
    """
    
    def __init__(self, db_session_factory=None):
        self._name = "DatabaseObserver"
        self._db_session_factory = db_session_factory
    
    async def on_alert(self, detection: DetectionResult) -> None:
        """Log l'alerte en base de données."""
        try:
            # Simulation d'insertion en base
            logger.info(
                f"[{self._name}] Alert logged: {detection.rule_name} "
                f"(score: {detection.risk_score}, severity: {detection.severity.value})"
            )
            
            # TODO: Implémenter l'insertion réelle en base de données
            # if self._db_session_factory:
            #     db = self._db_session_factory()
            #     alert = Alert(
            #         rule_id=detection.rule_id,
            #         rule_name=detection.rule_name,
            #         severity=detection.severity.value,
            #         risk_score=detection.risk_score,
            #         confidence=detection.confidence,
            #         evidence=detection.evidence,
            #         created_at=datetime.now(timezone.utc)
            #     )
            #     db.add(alert)
            #     db.commit()
            
        except Exception as e:
            logger.error(f"[{self._name}] Erreur logging alert: {e}")
    
    async def on_incident(self, incident: CorrelatedIncident) -> None:
        """Log l'incident corrélé en base de données."""
        try:
            logger.info(
                f"[{self._name}] Incident logged: {incident.incident_id} "
                f"(score: {incident.composite_score}, pattern: {incident.attack_pattern})"
            )
            
            # TODO: Implémenter l'insertion réelle en base de données
            
        except Exception as e:
            logger.error(f"[{self._name}] Erreur logging incident: {e}")
    
    def get_observer_name(self) -> str:
        return self._name


class WebSocketObserver(IAlertObserver):
    """
    Observateur qui diffuse les alertes via WebSocket.
    """
    
    def __init__(self):
        self._name = "WebSocketObserver"
        self._connected_clients: List[Any] = []
    
    def add_client(self, client: Any) -> None:
        """Ajoute un client WebSocket."""
        self._connected_clients.append(client)
        logger.info(f"[{self._name}] Client WebSocket ajouté")
    
    def remove_client(self, client: Any) -> None:
        """Retire un client WebSocket."""
        if client in self._connected_clients:
            self._connected_clients.remove(client)
            logger.info(f"[{self._name}] Client WebSocket retiré")
    
    async def on_alert(self, detection: DetectionResult) -> None:
        """Diffuse l'alerte via WebSocket."""
        try:
            message = {
                "type": "alert",
                "data": detection.to_dict(),
                "timestamp": time.time()
            }
            
            # Simulation d'envoi WebSocket
            logger.info(
                f"[{self._name}] Alert broadcasted to {len(self._connected_clients)} clients"
            )
            
            # TODO: Implémenter l'envoi réel WebSocket
            # for client in self._connected_clients:
            #     await client.send_json(message)
            
        except Exception as e:
            logger.error(f"[{self._name}] Erreur broadcast alert: {e}")
    
    async def on_incident(self, incident: CorrelatedIncident) -> None:
        """Diffuse l'incident via WebSocket."""
        try:
            message = {
                "type": "incident",
                "data": incident.to_dict(),
                "timestamp": time.time()
            }
            
            logger.info(
                f"[{self._name}] Incident broadcasted to {len(self._connected_clients)} clients"
            )
            
            # TODO: Implémenter l'envoi réel WebSocket
            
        except Exception as e:
            logger.error(f"[{self._name}] Erreur broadcast incident: {e}")
    
    def get_observer_name(self) -> str:
        return self._name


class FirewallObserver(IAlertObserver):
    """
    Observateur qui exécute les actions de firewall.
    """
    
    def __init__(self, firewall_manager=None):
        self._name = "FirewallObserver"
        self._firewall_manager = firewall_manager
    
    async def on_alert(self, detection: DetectionResult) -> None:
        """Exécute l'action de firewall selon la détection."""
        try:
            action = detection.suggested_action
            evidence = detection.evidence
            
            if action == ResponseAction.BLOCK:
                ip_address = evidence.get("source_ip") or evidence.get("ip")
                if ip_address:
                    logger.warning(
                        f"[{self._name}] Blocking IP {ip_address} "
                        f"for {detection.rule_name}"
                    )
                    
                    # TODO: Implémenter le blocage réel
                    # if self._firewall_manager:
                    #     await self._firewall_manager.block_ip(
                    #         ip_address,
                    #         detection.rule_name
                    #     )
            
            elif action == ResponseAction.QUARANTINE:
                logger.warning(
                    f"[{self._name}] Quarantining for {detection.rule_name}"
                )
                # TODO: Implémenter la quarantaine
            
            elif action == ResponseAction.ALERT:
                logger.info(
                    f"[{self._name}] Alert only for {detection.rule_name}"
                )
            
            elif action == ResponseAction.LOG:
                logger.debug(
                    f"[{self._name}] Log only for {detection.rule_name}"
                )
            
        except Exception as e:
            logger.error(f"[{self._name}] Erreur execution firewall action: {e}")
    
    async def on_incident(self, incident: CorrelatedIncident) -> None:
        """Exécute les actions de firewall pour l'incident."""
        try:
            logger.warning(
                f"[{self._name}] Incident {incident.incident_id} "
                f"requires actions: {[a.value for a in incident.recommended_actions]}"
            )
            
            # Exécuter les actions recommandées
            for action in incident.recommended_actions:
                if action == ResponseAction.BLOCK:
                    logger.warning(
                        f"[{self._name}] Blocking IP {incident.source_ip} "
                        f"for incident {incident.incident_id}"
                    )
                    # TODO: Implémenter le blocage réel
            
        except Exception as e:
            logger.error(f"[{self._name}] Erreur execution incident actions: {e}")
    
    def get_observer_name(self) -> str:
        return self._name


class EmailObserver(IAlertObserver):
    """
    Observateur qui envoie des emails pour les alertes critiques.
    """
    
    def __init__(self, smtp_config: Optional[Dict[str, Any]] = None):
        self._name = "EmailObserver"
        self._smtp_config = smtp_config or {}
        self._min_severity_for_email = "high"
    
    async def on_alert(self, detection: DetectionResult) -> None:
        """Envoie un email si l'alerte est critique."""
        try:
            severity = detection.severity.value
            
            # Envoyer seulement pour les alertes de haute sévérité
            if severity in ["high", "critical"]:
                logger.warning(
                    f"[{self._name}] Sending email alert for {detection.rule_name} "
                    f"(severity: {severity}, score: {detection.risk_score})"
                )
                
                # TODO: Implémenter l'envoi réel d'email
                # await self._send_email(
                #     subject=f"IDPS Alert: {detection.rule_name}",
                #     body=self._format_alert_email(detection)
                # )
            
        except Exception as e:
            logger.error(f"[{self._name}] Erreur sending email: {e}")
    
    async def on_incident(self, incident: CorrelatedIncident) -> None:
        """Envoie un email pour l'incident."""
        try:
            severity = incident.severity.value
            
            if severity in ["high", "critical"]:
                logger.warning(
                    f"[{self._name}] Sending email for incident {incident.incident_id} "
                    f"(severity: {severity}, score: {incident.composite_score})"
                )
                
                # TODO: Implémenter l'envoi réel d'email
                # await self._send_email(
                #     subject=f"IDPS Incident: {incident.attack_pattern}",
                #     body=self._format_incident_email(incident)
                # )
            
        except Exception as e:
            logger.error(f"[{self._name}] Erreur sending incident email: {e}")
    
    def _format_alert_email(self, detection: DetectionResult) -> str:
        """Formate le corps de l'email pour une alerte."""
        return f"""
        Alert: {detection.rule_name}
        Rule ID: {detection.rule_id}
        Severity: {detection.severity.value}
        Risk Score: {detection.risk_score}
        Confidence: {detection.confidence}
        
        Evidence:
        {detection.evidence}
        """
    
    def _format_incident_email(self, incident: CorrelatedIncident) -> str:
        """Formate le corps de l'email pour un incident."""
        return f"""
        Incident ID: {incident.incident_id}
        Source IP: {incident.source_ip}
        Attack Pattern: {incident.attack_pattern}
        Severity: {incident.severity.value}
        Composite Score: {incident.composite_score}
        
        Contributing Detections:
        {len(incident.contributing_detections)} detections
        
        Recommended Actions:
        {[a.value for a in incident.recommended_actions]}
        """
    
    async def _send_email(self, subject: str, body: str) -> None:
        """Envoie un email via SMTP."""
        # TODO: Implémenter l'envoi SMTP réel
        pass
    
    def get_observer_name(self) -> str:
        return self._name


class MetricsObserver(IAlertObserver):
    """
    Observateur qui collecte des métriques sur les alertes.
    """
    
    def __init__(self):
        self._name = "MetricsObserver"
        self._metrics: Dict[str, Any] = {
            "total_alerts": 0,
            "total_incidents": 0,
            "alerts_by_severity": {"low": 0, "medium": 0, "high": 0, "critical": 0},
            "alerts_by_rule": {},
            "start_time": time.time()
        }
    
    async def on_alert(self, detection: DetectionResult) -> None:
        """Met à jour les métriques pour l'alerte."""
        self._metrics["total_alerts"] += 1
        self._metrics["alerts_by_severity"][detection.severity.value] += 1
        
        rule_name = detection.rule_name
        self._metrics["alerts_by_rule"][rule_name] = \
            self._metrics["alerts_by_rule"].get(rule_name, 0) + 1
        
        logger.debug(f"[{self._name}] Metrics updated: {self._metrics['total_alerts']} alerts")
    
    async def on_incident(self, incident: CorrelatedIncident) -> None:
        """Met à jour les métriques pour l'incident."""
        self._metrics["total_incidents"] += 1
        logger.debug(f"[{self._name}] Metrics updated: {self._metrics['total_incidents']} incidents")
    
    def get_metrics(self) -> Dict[str, Any]:
        """Retourne les métriques actuelles."""
        uptime = time.time() - self._metrics["start_time"]
        self._metrics["uptime_seconds"] = uptime
        self._metrics["alerts_per_minute"] = \
            (self._metrics["total_alerts"] / uptime) * 60 if uptime > 0 else 0
        return self._metrics.copy()
    
    def reset_metrics(self) -> None:
        """Réinitialise les métriques."""
        self._metrics = {
            "total_alerts": 0,
            "total_incidents": 0,
            "alerts_by_severity": {"low": 0, "medium": 0, "high": 0, "critical": 0},
            "alerts_by_rule": {},
            "start_time": time.time()
        }
    
    def get_observer_name(self) -> str:
        return self._name


# Singleton global
alert_manager = AlertManager()

# Attacher les observateurs par défaut
alert_manager.attach(DatabaseObserver())
alert_manager.attach(WebSocketObserver())
alert_manager.attach(FirewallObserver())
alert_manager.attach(EmailObserver())
alert_manager.attach(MetricsObserver())
