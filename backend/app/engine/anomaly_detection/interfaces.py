"""
Interfaces principales pour le moteur de détection d'anomalies comportementales.
Définit les contrats pour les détecteurs, le moteur de corrélation et les observateurs.
"""
from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional
from dataclasses import dataclass
from enum import Enum
import time


class Severity(Enum):
    """Niveaux de sévérité des alertes."""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class ResponseAction(Enum):
    """Types d'actions de réponse."""
    LOG = "log"
    ALERT = "alert"
    BLOCK = "block"
    QUARANTINE = "quarantine"


@dataclass
class PacketContext:
    """Contexte d'un paquet réseau."""
    timestamp: float
    source_ip: str
    destination_ip: str
    source_port: Optional[int]
    destination_port: Optional[int]
    protocol: str
    flags: int
    payload_size: int
    payload_hash: Optional[str]
    
    def to_dict(self) -> Dict[str, Any]:
        """Convertit le contexte en dictionnaire."""
        return {
            "timestamp": self.timestamp,
            "source_ip": self.source_ip,
            "destination_ip": self.destination_ip,
            "source_port": self.source_port,
            "destination_port": self.destination_port,
            "protocol": self.protocol,
            "flags": self.flags,
            "payload_size": self.payload_size,
            "payload_hash": self.payload_hash
        }


@dataclass
class DetectionResult:
    """Résultat d'une détection."""
    rule_id: str
    rule_name: str
    detected: bool
    confidence: float
    risk_score: float
    severity: Severity
    evidence: Dict[str, Any]
    suggested_action: ResponseAction
    metadata: Dict[str, Any]
    
    def to_dict(self) -> Dict[str, Any]:
        """Convertit le résultat en dictionnaire."""
        return {
            "rule_id": self.rule_id,
            "rule_name": self.rule_name,
            "detected": self.detected,
            "confidence": self.confidence,
            "risk_score": self.risk_score,
            "severity": self.severity.value,
            "evidence": self.evidence,
            "suggested_action": self.suggested_action.value,
            "metadata": self.metadata
        }


@dataclass
class CorrelatedIncident:
    """Incident corrélé agrégeant plusieurs détections."""
    incident_id: str
    source_ip: str
    start_time: float
    end_time: float
    severity: Severity
    composite_score: float
    contributing_detections: List[DetectionResult]
    attack_pattern: str
    recommended_actions: List[ResponseAction]
    
    def to_dict(self) -> Dict[str, Any]:
        """Convertit l'incident en dictionnaire."""
        return {
            "incident_id": self.incident_id,
            "source_ip": self.source_ip,
            "start_time": self.start_time,
            "end_time": self.end_time,
            "severity": self.severity.value,
            "composite_score": self.composite_score,
            "contributing_detections": [d.to_dict() for d in self.contributing_detections],
            "attack_pattern": self.attack_pattern,
            "recommended_actions": [a.value for a in self.recommended_actions]
        }


class IDetectionStrategy(ABC):
    """
    Interface Strategy pour les moteurs de détection.
    Chaque détecteur implémente cette interface pour fournir son algorithme.
    """
    
    @abstractmethod
    def detect(self, context: PacketContext, state: Dict[str, Any]) -> Optional[DetectionResult]:
        """
        Détecte une anomalie dans le contexte du paquet.
        
        Args:
            context: Contexte du paquet réseau
            state: État actuel de l'IP source
            
        Returns:
            DetectionResult si anomalie détectée, None sinon
        """
        pass
    
    @abstractmethod
    def get_rule_id(self) -> str:
        """Retourne l'identifiant de la règle."""
        pass
    
    @abstractmethod
    def get_rule_name(self) -> str:
        """Retourne le nom de la règle."""
        pass
    
    @abstractmethod
    def get_required_state_fields(self) -> List[str]:
        """Retourne la liste des champs d'état requis pour cette détection."""
        pass


class ICorrelationEngine(ABC):
    """
    Interface pour le moteur de corrélation.
    Agrège les détections en incidents de haut niveau.
    """
    
    @abstractmethod
    async def correlate(self, detections: List[DetectionResult], 
                        state_store: Dict[str, Dict[str, Any]]) -> Optional[CorrelatedIncident]:
        """
        Corrèle les détections en un incident.
        
        Args:
            detections: Liste des détections à corréler
            state_store: Store d'état pour le contexte
            
        Returns:
            CorrelatedIncident si corrélation réussie, None sinon
        """
        pass
    
    @abstractmethod
    def get_correlation_window(self) -> float:
        """Retourne la fenêtre de temps de corrélation en secondes."""
        pass
    
    @abstractmethod
    def get_min_confidence(self) -> float:
        """Retourne le niveau de confiance minimum pour la corrélation."""
        pass


class IAlertObserver(ABC):
    """
    Interface Observer pour le système d'alerting.
    Les composants s'abonnent aux événements d'alerte.
    """
    
    @abstractmethod
    async def on_alert(self, detection: DetectionResult) -> None:
        """
        Appelé lorsqu'une détection génère une alerte.
        
        Args:
            detection: Résultat de la détection
        """
        pass
    
    @abstractmethod
    async def on_incident(self, incident: CorrelatedIncident) -> None:
        """
        Appelé lorsqu'un incident corrélé est généré.
        
        Args:
            incident: Incident corrélé
        """
        pass
    
    @abstractmethod
    def get_observer_name(self) -> str:
        """Retourne le nom de l'observateur."""
        pass


class IStateStore(ABC):
    """
    Interface pour le stockage d'état dynamique par IP.
    Gère les time-series aggregations et la FSM.
    """
    
    @abstractmethod
    def update_state(self, ip: str, context: PacketContext) -> Dict[str, Any]:
        """
        Met à jour l'état pour une IP donnée.
        
        Args:
            ip: Adresse IP
            context: Contexte du paquet
            
        Returns:
            État mis à jour
        """
        pass
    
    @abstractmethod
    def get_state(self, ip: str) -> Optional[Dict[str, Any]]:
        """
        Récupère l'état actuel pour une IP.
        
        Args:
            ip: Adresse IP
            
        Returns:
            État actuel ou None si inexistant
        """
        pass
    
    @abstractmethod
    def get_time_series(self, ip: str, metric: str, 
                       window_seconds: float) -> List[float]:
        """
        Récupère les time-series pour une métrique donnée.
        
        Args:
            ip: Adresse IP
            metric: Nom de la métrique
            window_seconds: Fenêtre de temps en secondes
            
        Returns:
            Liste des valeurs de la métrique
        """
        pass
    
    @abstractmethod
    def cleanup_expired_states(self, max_age_seconds: float) -> int:
        """
        Nettoie les états expirés.
        
        Args:
            max_age_seconds: Âge maximum en secondes
            
        Returns:
            Nombre d'états supprimés
        """
        pass


class IBaselineProfiler(ABC):
    """
    Interface pour le profilage de baseline.
    Apprend le comportement normal pour réduire les faux positifs.
    """
    
    @abstractmethod
    def update_baseline(self, ip: str, metric: str, value: float) ->	None:
        """
        Met à jour la baseline pour une métrique.
        
        Args:
            ip: Adresse IP
            metric: Nom de la métrique
            value: Valeur actuelle
        """
        pass
    
    @abstractmethod
    def is_anomaly(self, ip: str, metric: str, value: float, 
                   z_score_threshold: float = 3.0) -> bool:
        """
        Détermine si une valeur est anormale par rapport à la baseline.
        
        Args:
            ip: Adresse IP
            metric: Nom de la métrique
            value: Valeur à tester
            z_score_threshold: Seuil de Z-score
            
        Returns:
            True si anomalie, False sinon
        """
        pass
    
    @abstractmethod
    def get_baseline_stats(self, ip: str, metric: str) -> Optional[Dict[str, float]]:
        """
        Récupère les statistiques de baseline.
        
        Args:
            ip: Adresse IP
            metric: Nom de la métrique
            
        Returns:
            Dictionnaire avec mean, std, min, max ou None
        """
        pass


class IRuleFactory(ABC):
    """
    Interface Factory pour l'instanciation des règles.
    Crée des détecteurs à partir de configurations JSON/YAML.
    """
    
    @abstractmethod
    def create_detector(self, rule_config: Dict[str, Any]) -> IDetectionStrategy:
        """
        Crée un détecteur à partir d'une configuration.
        
        Args:
            rule_config: Configuration de la règle
            
        Returns:
            Instance du détecteur
        """
        pass
    
    @abstractmethod
    def load_rules(self, rules_path: str) -> List[Dict[str, Any]]:
        """
        Charge les règles depuis un fichier.
        
        Args:
            rules_path: Chemin vers le fichier de règles
            
        Returns:
            Liste des configurations de règles
        """
        pass
    
    @abstractmethod
    def validate_rule(self, rule_config: Dict[str, Any]) -> bool:
        """
        Valide une configuration de règle.
        
        Args:
            rule_config: Configuration à valider
            
        Returns:
            True si valide, False sinon
        """
        pass
