"""
Implémentation du pattern Strategy pour les moteurs de détection.
Chaque détecteur implémente IDetectionStrategy avec son algorithme spécifique.
"""
import time
from typing import Dict, Any, Optional, List
from collections import defaultdict, deque

from .interfaces import (
    IDetectionStrategy, PacketContext, DetectionResult, 
    Severity, ResponseAction
)
from .state_store import state_store, FSMState


class PortScanDetectionStrategy(IDetectionStrategy):
    """
    Stratégie de détection de scan de ports.
    Détecte les scans horizontaux et verticaux.
    """
    
    def __init__(self, threshold: int = 10, window_seconds: float = 60.0):
        self._threshold = threshold
        self._window_seconds = window_seconds
        self._rule_id = "DETECT-PORT-SCAN-001"
        self._rule_name = "Port Scan Detection"
    
    def detect(self, context: PacketContext, state: Dict[str, Any]) -> Optional[DetectionResult]:
        """Détecte un scan de ports."""
        current_time = context.timestamp
        
        # Récupérer les ports scannés depuis l'état
        unique_ports = state.get("unique_ports", 0)
        scan_indicators = state.get("scan_indicators", 0)
        
        # Vérifier si le seuil est dépassé
        if unique_ports >= self._threshold:
            evidence = {
                "unique_ports": unique_ports,
                "window_seconds": self._window_seconds,
                "scanned_ports": list(state.get("port_access_counts", {}).keys())[:20],
                "timestamp": current_time
            }
            
            return DetectionResult(
                rule_id=self._rule_id,
                rule_name=self._rule_name,
                detected=True,
                confidence=0.85,
                risk_score=70.0,
                severity=Severity.HIGH,
                evidence=evidence,
                suggested_action=ResponseAction.BLOCK,
                metadata={
                    "detection_type": "horizontal_scan",
                    "threshold": self._threshold
                }
            )
        
        return None
    
    def get_rule_id(self) -> str:
        return self._rule_id
    
    def get_rule_name(self) -> str:
        return self._rule_name
    
    def get_required_state_fields(self) -> List[str]:
        return ["unique_ports", "scan_indicators", "port_access_counts"]


class SYNFloodDetectionStrategy(IDetectionStrategy):
    """
    Stratégie de détection de SYN Flood.
    Détecte les inondations de paquets SYN.
    """
    
    def __init__(self, threshold: int = 100, window_seconds: float = 1.0):
        self._threshold = threshold
        self._window_seconds = window_seconds
        self._rule_id = "DETECT-SYN-FLOOD-001"
        self._rule_name = "SYN Flood Detection"
        self._syn_tracker: Dict[str, deque] = defaultdict(lambda: deque(maxlen=500))
    
    def detect(self, context: PacketContext, state: Dict[str, Any]) -> Optional[DetectionResult]:
        """Détecte un SYN Flood."""
        # Vérifier si c'est un paquet SYN
        if not (context.flags & 0x02):  # SYN flag
            return None
        
        current_time = context.timestamp
        key = f"{context.source_ip}->{context.destination_ip}"
        timestamps = self._syn_tracker[key]
        
        # Nettoyer les timestamps anciens
        while timestamps and timestamps[0] < current_time - self._window_seconds:
            timestamps.popleft()
        
        timestamps.append(current_time)
        
        # Vérifier si le seuil est dépassé
        if len(timestamps) > self._threshold:
            evidence = {
                "syn_count": len(timestamps),
                "window_seconds": self._window_seconds,
                "syn_rate": len(timestamps) / self._window_seconds,
                "timestamp": current_time
            }
            
            return DetectionResult(
                rule_id=self._rule_id,
                rule_name=self._rule_name,
                detected=True,
                confidence=0.90,
                risk_score=85.0,
                severity=Severity.CRITICAL,
                evidence=evidence,
                suggested_action=ResponseAction.BLOCK,
                metadata={
                    "detection_type": "syn_flood",
                    "threshold": self._threshold
                }
            )
        
        return None
    
    def get_rule_id(self) -> str:
        return self._rule_id
    
    def get_rule_name(self) -> str:
        return self._rule_name
    
    def get_required_state_fields(self) -> List[str]:
        return ["packets_per_second", "flood_indicators"]


class AuthFailureDetectionStrategy(IDetectionStrategy):
    """
    Stratégie de détection d'échecs d'authentification.
    Détecte les tentatives de brute force.
    """
    
    def __init__(self, threshold: int = 5, window_seconds: float = 300.0):
        self._threshold = threshold
        self._window_seconds = window_seconds
        self._rule_id = "DETECT-AUTH-FAIL-001"
        self._rule_name = "Authentication Failure Detection"
    
    def detect(self, context: PacketContext, state: Dict[str, Any]) -> Optional[DetectionResult]:
        """Détecte des échecs d'authentification."""
        auth_failures = state.get("auth_failures", 0)
        
        # Vérifier si le seuil est dépassé
        if auth_failures >= self._threshold:
            evidence = {
                "auth_failure_count": auth_failures,
                "window_seconds": self._window_seconds,
                "destination_port": context.destination_port,
                "timestamp": context.timestamp
            }
            
            severity = Severity.HIGH if auth_failures < 10 else Severity.CRITICAL
            risk_score = 75.0 if auth_failures < 10 else 90.0
            
            return DetectionResult(
                rule_id=self._rule_id,
                rule_name=self._rule_name,
                detected=True,
                confidence=0.80,
                risk_score=risk_score,
                severity=severity,
                evidence=evidence,
                suggested_action=ResponseAction.BLOCK,
                metadata={
                    "detection_type": "auth_failure",
                    "threshold": self._threshold
                }
            )
        
        return None
    
    def get_rule_id(self) -> str:
        return self._rule_id
    
    def get_rule_name(self) -> str:
        return self._rule_name
    
    def get_required_state_fields(self) -> List[str]:
        return ["auth_failures", "success_failure_ratio"]


class BehavioralAnomalyDetectionStrategy(IDetectionStrategy):
    """
    Stratégie de détection d'anomalies comportementales.
    Utilise le Baseline Profiler pour détecter les écarts statistiques.
    """
    
    def __init__(self):
        self._rule_id = "DETECT-BEHAVIOR-001"
        self._rule_name = "Behavioral Anomaly Detection"
        from .baseline_profiler import baseline_profiler
        self._profiler = baseline_profiler
    
    def detect(self, context: PacketContext, state: Dict[str, Any]) -> Optional[DetectionResult]:
        """Détecte des anomalies comportementales."""
        current_time = context.timestamp
        
        # Mettre à jour les baselines avec les métriques actuelles
        self._profiler.update_baseline(
            context.source_ip, 
            "packet_rate", 
            state.get("packets_per_second", 0.0)
        )
        self._profiler.update_baseline(
            context.source_ip, 
            "port_entropy", 
            state.get("port_entropy", 0.0)
        )
        
        # Vérifier les anomalies
        packet_rate = state.get("packets_per_second", 0.0)
        port_entropy = state.get("port_entropy", 0.0)
        
        is_packet_anomaly = self._profiler.is_anomaly(
            context.source_ip, "packet_rate", packet_rate, z_score_threshold=3.0
        )
        is_entropy_anomaly = self._profiler.is_anomaly(
            context.source_ip, "port_entropy", port_entropy, z_score_threshold=2.5
        )
        
        if is_packet_anomaly or is_entropy_anomaly:
            evidence = {
                "packet_rate": packet_rate,
                "port_entropy": port_entropy,
                "is_packet_anomaly": is_packet_anomaly,
                "is_entropy_anomaly": is_entropy_anomaly,
                "baseline_stats": self._profiler.get_baseline_stats(
                    context.source_ip, "packet_rate"
                ),
                "timestamp": current_time
            }
            
            return DetectionResult(
                rule_id=self._rule_id,
                rule_name=self._rule_name,
                detected=True,
                confidence=0.70,
                risk_score=60.0,
                severity=Severity.MEDIUM,
                evidence=evidence,
                suggested_action=ResponseAction.ALERT,
                metadata={
                    "detection_type": "behavioral_anomaly",
                    "anomaly_type": "statistical_deviation"
                }
            )
        
        return None
    
    def get_rule_id(self) -> str:
        return self._rule_id
    
    def get_rule_name(self) -> str:
        return self._rule_name
    
    def get_required_state_fields(self) -> List[str]:
        return ["packets_per_second", "port_entropy"]


class FSMTransitionDetectionStrategy(IDetectionStrategy):
    """
    Stratégie de détection basée sur les transitions FSM.
    Détecte les changements d'état suspects.
    """
    
    def __init__(self):
        self._rule_id = "DETECT-FSM-001"
        self._rule_name = "FSM State Transition Detection"
    
    def detect(self, context: PacketContext, state: Dict[str, Any]) -> Optional[DetectionResult]:
        """Détecte des transitions FSM suspectes."""
        fsm_state = state.get("fsm_state", "normal")
        
        # Si l'IP est déjà dans un état malveillant ou bloqué
        if fsm_state in ["malicious", "blocked"]:
            evidence = {
                "current_fsm_state": fsm_state,
                "auth_failures": state.get("auth_failures", 0),
                "scan_indicators": state.get("scan_indicators", 0),
                "flood_indicators": state.get("flood_indicators", 0),
                "timestamp": context.timestamp
            }
            
            severity = Severity.CRITICAL if fsm_state == "blocked" else Severity.HIGH
            
            return DetectionResult(
                rule_id=self._rule_id,
                rule_name=self._rule_name,
                detected=True,
                confidence=0.95,
                risk_score=95.0,
                severity=severity,
                evidence=evidence,
                suggested_action=ResponseAction.BLOCK,
                metadata={
                    "detection_type": "fsm_state",
                    "state": fsm_state
                }
            )
        
        return None
    
    def get_rule_id(self) -> str:
        return self._rule_id
    
    def get_rule_name(self) -> str:
        return self._rule_name
    
    def get_required_state_fields(self) -> List[str]:
        return ["fsm_state", "auth_failures", "scan_indicators", "flood_indicators"]


class DetectionStrategyFactory:
    """
    Factory pour créer les stratégies de détection.
    Centralise la création des détecteurs.
    """
    
    @staticmethod
    def create_port_scan_detector(threshold: int = 10, 
                                 window_seconds: float = 60.0) -> PortScanDetectionStrategy:
        """Crée un détecteur de scan de ports."""
        return PortScanDetectionStrategy(threshold, window_seconds)
    
    @staticmethod
    def create_syn_flood_detector(threshold: int = 100, 
                                  window_seconds: float = 1.0) -> SYNFloodDetectionStrategy:
        """Crée un détecteur de SYN Flood."""
        return SYNFloodDetectionStrategy(threshold, window_seconds)
    
    @staticmethod
    def create_auth_failure_detector(threshold: int = 5, 
                                    window_seconds: float = 300.0) -> AuthFailureDetectionStrategy:
        """Crée un détecteur d'échecs d'authentification."""
        return AuthFailureDetectionStrategy(threshold, window_seconds)
    
    @staticmethod
    def create_behavioral_detector() -> BehavioralAnomalyDetectionStrategy:
        """Crée un détecteur d'anomalies comportementales."""
        return BehavioralAnomalyDetectionStrategy()
    
    @staticmethod
    def create_fsm_detector() -> FSMTransitionDetectionStrategy:
        """Crée un détecteur basé sur FSM."""
        return FSMTransitionDetectionStrategy()
    
    @staticmethod
    def create_all_detectors() -> List[IDetectionStrategy]:
        """Crée tous les détecteurs disponibles."""
        return [
            DetectionStrategyFactory.create_port_scan_detector(),
            DetectionStrategyFactory.create_syn_flood_detector(),
            DetectionStrategyFactory.create_auth_failure_detector(),
            DetectionStrategyFactory.create_behavioral_detector(),
            DetectionStrategyFactory.create_fsm_detector()
        ]
