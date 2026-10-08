"""
Moteur de corrélation et scoring.
Agrège les faibles signaux en incidents de haut niveau avec scoring adaptatif.
"""
import time
import uuid
import logging
from typing import Dict, Any, List, Optional, Tuple
from collections import defaultdict, deque
from dataclasses import dataclass, field

from .interfaces import ICorrelationEngine, DetectionResult, CorrelatedIncident, Severity, ResponseAction
from .state_store import state_store

logger = logging.getLogger("ids_ips.correlation")


@dataclass
class Signal:
    """Signal faible à corréler."""
    detection: DetectionResult
    timestamp: float
    source_ip: str
    weight: float = 1.0


@dataclass
class CorrelationPattern:
    """Pattern de corrélation pour détecter des attaques multi-étapes."""
    pattern_id: str
    name: str
    required_signals: List[str]  # Types de signaux requis
    time_window: float  # Fenêtre de temps en secondes
    min_confidence: float
    severity: Severity
    risk_score: float
    recommended_actions: List[ResponseAction]


class CorrelationEngine(ICorrelationEngine):
    """
    Moteur de corrélation qui agrège les détections en incidents.
    Utilise un scoring adaptatif pondéré par la confiance et le contexte.
    """
    
    def __init__(self, correlation_window: float = 300.0, min_confidence: float = 0.7):
        self._correlation_window = correlation_window
        self._min_confidence = min_confidence
        self._signal_buffer: Dict[str, deque] = defaultdict(lambda: deque(maxlen=1000))
        self._patterns: List[CorrelationPattern] = []
        self._incident_history: List[CorrelatedIncident] = []
        self._max_history = 100
        self._load_default_patterns()
    
    def _load_default_patterns(self) -> None:
        """Charge les patterns de corrélation par défaut."""
        self._patterns = [
            CorrelationPattern(
                pattern_id="PATTERN-SSH-BRUTEFORCE",
                name="SSH Brute Force Attack",
                required_signals=["port_scan", "auth_failure"],
                time_window=300.0,
                min_confidence=0.75,
                severity=Severity.CRITICAL,
                risk_score=90.0,
                recommended_actions=[ResponseAction.BLOCK, ResponseAction.ALERT]
            ),
            CorrelationPattern(
                pattern_id="PATTERN-DDOS-SYN",
                name="DDOS SYN Flood Attack",
                required_signals=["syn_flood"],
                time_window=60.0,
                min_confidence=0.80,
                severity=Severity.CRITICAL,
                risk_score=95.0,
                recommended_actions=[ResponseAction.BLOCK, ResponseAction.QUARANTINE]
            ),
            CorrelationPattern(
                pattern_id="PATTERN-RECONNAISSANCE",
                name="Network Reconnaissance",
                required_signals=["port_scan", "behavioral_anomaly"],
                time_window=600.0,
                min_confidence=0.65,
                severity=Severity.HIGH,
                risk_score=70.0,
                recommended_actions=[ResponseAction.ALERT, ResponseAction.LOG]
            ),
            CorrelationPattern(
                pattern_id="PATTERN-MULTI-VECTOR",
                name="Multi-Vector Attack",
                required_signals=["port_scan", "auth_failure", "syn_flood"],
                time_window=600.0,
                min_confidence=0.85,
                severity=Severity.CRITICAL,
                risk_score=98.0,
                recommended_actions=[ResponseAction.BLOCK, ResponseAction.QUARANTINE, ResponseAction.ALERT]
            )
        ]
        logger.info(f"{len(self._patterns)} patterns de corrélation chargés")
    
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
        if not detections:
            return None
        
        # Grouper les détections par IP source
        detections_by_ip: Dict[str, List[DetectionResult]] = defaultdict(list)
        for detection in detections:
            source_ip = detection.evidence.get("source_ip") or detection.evidence.get("ip")
            if source_ip:
                detections_by_ip[source_ip].append(detection)
        
        # Essayer de corréler pour chaque IP
        for source_ip, ip_detections in detections_by_ip.items():
            incident = self._correlate_for_ip(source_ip, ip_detections, state_store)
            if incident:
                self._add_to_history(incident)
                return incident
        
        return None
    
    def _correlate_for_ip(self, source_ip: str, 
                         detections: List[DetectionResult],
                         state_store: Dict[str, Dict[str, Any]]) -> Optional[CorrelatedIncident]:
        """
        Corrèle les détections pour une IP spécifique.
        
        Args:
            source_ip: Adresse IP source
            detections: Détections pour cette IP
            state_store: Store d'état
            
        Returns:
            CorrelatedIncident si corrélation réussie, None sinon
        """
        current_time = time.time()
        
        # Ajouter les signaux au buffer
        for detection in detections:
            signal = Signal(
                detection=detection,
                timestamp=current_time,
                source_ip=source_ip,
                weight=self._calculate_signal_weight(detection)
            )
            self._signal_buffer[source_ip].append(signal)
        
        # Nettoyer les signaux anciens
        self._cleanup_old_signals(source_ip, current_time)
        
        # Essayer chaque pattern de corrélation
        for pattern in self._patterns:
            if self._matches_pattern(source_ip, pattern, current_time):
                return self._create_incident(source_ip, pattern, current_time)
        
        return None
    
    def _matches_pattern(self, source_ip: str, pattern: CorrelationPattern, 
                        current_time: float) -> bool:
        """
        Vérifie si les signaux correspondent au pattern.
        
        Args:
            source_ip: Adresse IP source
            pattern: Pattern de corrélation
            current_time: Timestamp actuel
            
        Returns:
            True si le pattern correspond, False sinon
        """
        signals = self._signal_buffer[source_ip]
        
        # Vérifier la fenêtre de temps
        if not signals:
            return False
        
        oldest_signal = signals[0]
        if current_time - oldest_signal.timestamp > pattern.time_window:
            return False
        
        # Vérifier les types de signaux requis
        signal_types = set()
        for signal in signals:
            signal_type = self._get_signal_type(signal.detection)
            signal_types.add(signal_type)
        
        # Vérifier si tous les types requis sont présents
        required_types = set(pattern.required_signals)
        if not required_types.issubset(signal_types):
            return False
        
        # Vérifier la confiance minimale
        avg_confidence = sum(s.detection.confidence for s in signals) / len(signals)
        if avg_confidence < pattern.min_confidence:
            return False
        
        return True
    
    def _create_incident(self, source_ip: str, pattern: CorrelationPattern, 
                        current_time: float) -> CorrelatedIncident:
        """
        Crée un incident corrélé.
        
        Args:
            source_ip: Adresse IP source
            pattern: Pattern de corrélation correspondant
            current_time: Timestamp actuel
            
        Returns:
            CorrelatedIncident créé
        """
        signals = self._signal_buffer[source_ip]
        
        # Calculer le score composite
        composite_score = self._calculate_composite_score(signals, pattern)
        
        # Ajuster la sévérité selon le score
        severity = pattern.severity
        if composite_score >= 95:
            severity = Severity.CRITICAL
        elif composite_score >= 75:
            severity = Severity.HIGH
        elif composite_score >= 50:
            severity = Severity.MEDIUM
        else:
            severity = Severity.LOW
        
        # Créer l'incident
        incident = CorrelatedIncident(
            incident_id=str(uuid.uuid4()),
            source_ip=source_ip,
            start_time=min(s.timestamp for s in signals),
            end_time=current_time,
            severity=severity,
            composite_score=composite_score,
            contributing_detections=[s.detection for s in signals],
            attack_pattern=pattern.name,
            recommended_actions=pattern.recommended_actions
        )
        
        logger.warning(
            f"Incident corrélé créé: {incident.incident_id} "
            f"(IP: {source_ip}, Pattern: {pattern.name}, Score: {composite_score:.2f})"
        )
        
        return incident
    
    def _calculate_composite_score(self, signals: List[Signal], 
                                   pattern: CorrelationPattern) -> float:
        """
        Calcule le score composite pour l'incident.
        
        Args:
            signals: Signaux à corréler
            pattern: Pattern de corrélation
            
        Returns:
            Score composite (0-100)
        """
        if not signals:
            return 0.0
        
        # Facteurs de scoring
        max_risk_score = max(s.detection.risk_score for s in signals)
        avg_risk_score = sum(s.detection.risk_score for s in signals) / len(signals)
        avg_confidence = sum(s.detection.confidence for s in signals) / len(signals)
        signal_count = len(signals)
        
        # Pondération adaptative selon le contexte historique
        ip_state = state_store.get_state(signals[0].source_ip)
        context_multiplier = 1.0
        
        if ip_state:
            auth_failures = ip_state.get("auth_failures", 0)
            scan_indicators = ip_state.get("scan_indicators", 0)
            flood_indicators = ip_state.get("flood_indicators", 0)
            
            # Augmenter le score si l'IP a un historique suspect
            if auth_failures > 5:
                context_multiplier += 0.2
            if scan_indicators > 3:
                context_multiplier += 0.15
            if flood_indicators > 2:
                context_multiplier += 0.25
        
        # Calcul du score composite
        composite_score = (
            max_risk_score * 0.4 +
            avg_risk_score * 0.2 +
            avg_confidence * 10 * 0.15 +
            min(signal_count * 5, 20) * 0.1 +
            pattern.risk_score * 0.15
        ) * context_multiplier
        
        return min(composite_score, 100.0)
    
    def _calculate_signal_weight(self, detection: DetectionResult) -> float:
        """
        Calcule le poids d'un signal selon sa confiance et sévérité.
        
        Args:
            detection: Détection
            
        Returns:
            Poids du signal
        """
        base_weight = detection.confidence
        
        # Ajuster selon la sévérité
        severity_multiplier = {
            Severity.LOW: 1.0,
            Severity.MEDIUM: 1.2,
            Severity.HIGH: 1.5,
            Severity.CRITICAL: 2.0
        }
        
        return base_weight * severity_multiplier.get(detection.severity, 1.0)
    
    def _get_signal_type(self, detection: DetectionResult) -> str:
        """
        Extrait le type de signal depuis la détection.
        
        Args:
            detection: Détection
            
        Returns:
            Type de signal
        """
        detection_type = detection.metadata.get("detection_type", "unknown")
        
        # Normaliser les types
        type_mapping = {
            "horizontal_scan": "port_scan",
            "syn_flood": "syn_flood",
            "auth_failure": "auth_failure",
            "behavioral_anomaly": "behavioral_anomaly",
            "fsm_state": "fsm_state",
            "statistical_deviation": "behavioral_anomaly"
        }
        
        return type_mapping.get(detection_type, detection_type)
    
    def _cleanup_old_signals(self, source_ip: str, current_time: float) -> None:
        """
        Nettoie les signaux anciens du buffer.
        
        Args:
            source_ip: Adresse IP source
            current_time: Timestamp actuel
        """
        buffer = self._signal_buffer[source_ip]
        
        while buffer and current_time - buffer[0].timestamp > self._correlation_window:
            buffer.popleft()
    
    def _add_to_history(self, incident: CorrelatedIncident) -> None:
        """
        Ajoute un incident à l'historique.
        
        Args:
            incident: Incident à ajouter
        """
        self._incident_history.append(incident)
        
        # Maintenir la taille de l'historique
        if len(self._incident_history) > self._max_history:
            self._incident_history.pop(0)
    
    def get_correlation_window(self) -> float:
        """Retourne la fenêtre de temps de corrélation en secondes."""
        return self._correlation_window
    
    def get_min_confidence(self) -> float:
        """Retourne le niveau de confiance minimum pour la corrélation."""
        return self._min_confidence
    
    def get_incident_history(self, limit: int = 50) -> List[CorrelatedIncident]:
        """
        Récupère l'historique des incidents.
        
        Args:
            limit: Nombre maximum d'incidents à retourner
            
        Returns:
            Liste des incidents récents
        """
        return self._incident_history[-limit:]
    
    def add_pattern(self, pattern: CorrelationPattern) -> None:
        """
        Ajoute un pattern de corrélation personnalisé.
        
        Args:
            pattern: Pattern à ajouter
        """
        self._patterns.append(pattern)
        logger.info(f"Pattern de corrélation ajouté: {pattern.pattern_id}")
    
    def get_patterns(self) -> List[CorrelationPattern]:
        """Retourne tous les patterns de corrélation."""
        return self._patterns.copy()
    
    def clear_signal_buffer(self, source_ip: Optional[str] = None) -> None:
        """
        Nettoie le buffer de signaux.
        
        Args:
            source_ip: IP spécifique ou None pour tout nettoyer
        """
        if source_ip:
            if source_ip in self._signal_buffer:
                del self._signal_buffer[source_ip]
        else:
            self._signal_buffer.clear()
        
        logger.info("Buffer de signaux nettoyé")


# Singleton global
correlation_engine = CorrelationEngine()
