"""
Service de détection des menaces et événements suspects.
Analyse les alertes et déclenche les notifications email appropriées.
"""
import logging
from typing import Dict, List, Optional
from datetime import datetime, timedelta
from collections import defaultdict
from app.services.email_service import email_service

logger = logging.getLogger(__name__)

class ThreatDetector:
    """Service de détection des menaces et déclenchement d'alertes."""
    
    def __init__(self):
        self.email_service = email_service
        self.suspicious_ips = defaultdict(int)
        self.recent_alerts = []
        self.max_recent_alerts = 1000
        self.suspicious_threshold = 3
        self.critical_severities = ["critique", "tres_critique"]
        self.suspicious_alert_types = [
            "port_scan",
            "syn_flood",
            "ddos",
            "brute_force",
            "sql_injection",
            "xss",
            "malware",
            "trojan",
            "backdoor"
        ]
        self.failed_login_attempts: Dict[tuple, int] = {}
        self.login_failure_threshold = 5
    
    def analyze_alert(self, alert: Dict) -> None:
        """
        Analyse une alerte et déclenche les notifications appropriées.
        
        Args:
            alert: Dictionnaire contenant les détails de l'alerte
        """
        try:
            # Enregistrer l'alerte
            self._record_alert(alert)
            
            # Extraire les informations clés
            source_ip = alert.get("source_ip", "unknown")
            severity = alert.get("severity", "normal").lower()
            alert_type = alert.get("alert_type", "unknown")
            timestamp = alert.get("timestamp", datetime.now().isoformat())
            
            # Vérifier si c'est une alerte critique
            if severity in self.critical_severities:
                logger.warning(f"Alerte critique détectée: {alert_type} de {source_ip}")
                self._handle_critical_alert(alert)
            
            # Vérifier si c'est un type d'alerte suspect
            if alert_type.lower() in [t.lower() for t in self.suspicious_alert_types]:
                logger.warning(f"Type d'alerte suspect détecté: {alert_type}")
                self._handle_suspicious_alert(alert)
            
            # Vérifier si l'IP source est suspecte (trop d'alertes)
            self.suspicious_ips[source_ip] += 1
            if self.suspicious_ips[source_ip] >= self.suspicious_threshold:
                logger.warning(f"IP suspecte détectée: {source_ip} ({self.suspicious_ips[source_ip]} alertes)")
                self._handle_suspicious_ip(source_ip, alert)
            
        except Exception as e:
            logger.error(f"Erreur lors de l'analyse de l'alerte: {e}")
    
    def _record_alert(self, alert: Dict) -> None:
        """Enregistre une alerte dans l'historique."""
        self.recent_alerts.append({
            **alert,
            "analyzed_at": datetime.now().isoformat()
        })
        
        # Garder seulement les N dernières alertes
        if len(self.recent_alerts) > self.max_recent_alerts:
            self.recent_alerts = self.recent_alerts[-self.max_recent_alerts:]
    
    def _handle_critical_alert(self, alert: Dict) -> None:
        """
        Gère une alerte critique en envoyant une notification email.
        
        Args:
            alert: Dictionnaire contenant les détails de l'alerte
        """
        source_ip = alert.get("source_ip", "unknown")
        alert_type = alert.get("alert_type", "unknown")
        description = alert.get("description", "Aucune description disponible")
        timestamp = alert.get("timestamp", datetime.now().isoformat())
        is_blocked = alert.get("is_blocked", False)
        
        # Envoyer l'alerte d'intrusion
        self.email_service.send_intrusion_alert(
            source_ip=source_ip,
            attack_type=alert_type,
            description=description,
            timestamp=timestamp,
            blocked=is_blocked
        )
    
    def _handle_suspicious_alert(self, alert: Dict) -> None:
        """
        Gère une alerte suspecte en envoyant une notification email.
        
        Args:
            alert: Dictionnaire contenant les détails de l'alerte
        """
        source_ip = alert.get("source_ip", "unknown")
        destination_ip = alert.get("destination_ip", "unknown")
        port = alert.get("destination_port", 0)
        protocol = alert.get("protocol", "unknown")
        alert_type = alert.get("alert_type", "unknown")
        severity = alert.get("severity", "medium")
        timestamp = alert.get("timestamp", datetime.now().isoformat())
        
        # Envoyer l'alerte de connexion suspecte
        self.email_service.send_suspicious_connection_alert(
            source_ip=source_ip,
            destination_ip=destination_ip,
            port=port,
            protocol=protocol,
            alert_type=alert_type,
            severity=severity,
            timestamp=timestamp
        )
    
    def _handle_suspicious_ip(self, source_ip: str, alert: Dict) -> None:
        """
        Gère une adresse IP suspecte en envoyant une notification email.
        
        Args:
            source_ip: Adresse IP suspecte
            alert: Dernière alerte associée à cette IP
        """
        destination_ip = alert.get("destination_ip", "unknown")
        port = alert.get("destination_port", 0)
        protocol = alert.get("protocol", "unknown")
        alert_type = alert.get("alert_type", "multiple_alerts")
        severity = "critique"
        timestamp = alert.get("timestamp", datetime.now().isoformat())
        
        # Envoyer l'alerte de connexion suspecte
        self.email_service.send_suspicious_connection_alert(
            source_ip=source_ip,
            destination_ip=destination_ip,
            port=port,
            protocol=protocol,
            alert_type=f"Multiple alertes ({self.suspicious_ips[source_ip]}) - {alert_type}",
            severity=severity,
            timestamp=timestamp
        )
    
    def analyze_login_attempt(
        self,
        username: str,
        ip_address: str,
        timestamp: str,
        location: Optional[str] = None,
        is_new_location: bool = False,
        failed_attempts: int = 0,
        is_success: bool = True
    ) -> None:
        """
        Analyse une tentative de connexion et déclenche des alertes si nécessaire.
        
        Args:
            username: Nom d'utilisateur
            ip_address: Adresse IP de connexion
            timestamp: Horodatage de la connexion
            location: Localisation géographique (optionnel)
            is_new_location: Indique si c'est une nouvelle localisation
            failed_attempts: Nombre de tentatives échouées (si succès, 0)
            is_success: True si authentification réussie, False sinon
        """
        suspicious = False
        
        key = (username, ip_address)
        
        if not is_success:
            self.failed_login_attempts[key] = self.failed_login_attempts.get(key, 0) + 1
            current_failures = self.failed_login_attempts[key]
            
            logger.warning(
                f"Tentative de connexion échouée pour {username} depuis {ip_address} "
                f"({current_failures} échecs au total)"
            )
            
            if current_failures >= self.login_failure_threshold:
                suspicious = True
                logger.critical(
                    f"SEUIL BRUTE-FORCE ATTEINT: {current_failures} échecs pour {username} depuis {ip_address}"
                )
        else:
            if key in self.failed_login_attempts:
                del self.failed_login_attempts[key]
            if is_new_location:
                suspicious = True
                logger.warning(f"Nouvelle localisation détectée pour {username}: {location}")
            if failed_attempts >= 3:
                suspicious = True
                logger.warning(f"Trop de tentatives échouées signalées pour {username}: {failed_attempts}")
        
        if not is_success and not suspicious:
            return
        
        if suspicious:
            try:
                self.email_service.send_intrusion_alert(
                    source_ip=ip_address,
                    attack_type="brute_force" if not is_success else "suspicious_location",
                    description=(
                        f"Tentatives de connexion multiples échouées pour {username}"
                        if not is_success else
                        f"Connexion réussie depuis une nouvelle localisation pour {username}"
                    ),
                    timestamp=timestamp,
                    blocked=False
                )
            except Exception as e:
                logger.error(f"Erreur lors de l'envoi de l'alerte login: {e}")
            return
        
        self.email_service.send_login_alert(
            username=username,
            ip_address=ip_address,
            timestamp=timestamp,
            location=location,
            suspicious=suspicious
        )
    
    def get_suspicious_ips(self, threshold: int = 3) -> List[Dict]:
        """
        Retourne la liste des adresses IP suspectes.
        
        Args:
            threshold: Seuil minimum d'alertes pour considérer une IP comme suspecte
            
        Returns:
            Liste des IP suspectes avec leurs statistiques
        """
        return [
            {"ip": ip, "alert_count": count}
            for ip, count in self.suspicious_ips.items()
            if count >= threshold
        ]
    
    def clear_old_alerts(self, hours: int = 24) -> None:
        """
        Nettoie les anciennes alertes de l'historique.
        
        Args:
            hours: Nombre d'heures à conserver
        """
        cutoff_time = datetime.now() - timedelta(hours=hours)
        
        self.recent_alerts = [
            alert for alert in self.recent_alerts
            if datetime.fromisoformat(alert.get("analyzed_at", "")) > cutoff_time
        ]
        
        logger.info(f"Nettoyage des anciennes alertes: {len(self.recent_alerts)} alertes conservées")
    
    def reset_suspicious_ips(self) -> None:
        """Réinitialise le compteur d'IPs suspectes."""
        self.suspicious_ips.clear()
        logger.info("Compteur d'IPs suspectes réinitialisé")

# Instance globale du détecteur de menaces
threat_detector = ThreatDetector()
