"""
State Store dynamique par IP avec time-series aggregations et Finite State Machine.
Optimisé pour la performance avec structures de données en mémoire.
"""
import time
import threading
from collections import defaultdict, deque
from typing import Dict, Any, List, Optional
from dataclasses import dataclass, field
from enum import Enum
import math

from .interfaces import IStateStore, PacketContext


class FSMState(Enum):
    """États de la Finite State Machine pour le comportement des IPs."""
    NORMAL = "normal"
    SUSPICIOUS = "suspicious"
    MALICIOUS = "malicious"
    BLOCKED = "blocked"


@dataclass
class IPState:
    """État d'une IP avec time-series aggregations."""
    ip: str
    first_seen: float
    last_seen: float
    packet_count: int = 0
    byte_count: int = 0
    
    # Time-series aggregations (sliding windows)
    packet_timestamps: deque = field(default_factory=lambda: deque(maxlen=10000))
    port_access_counts: Dict[int, int] = field(default_factory=dict)
    protocol_counts: Dict[str, int] = field(default_factory=dict)
    flag_counts: Dict[int, int] = field(default_factory=dict)
    
    # Metrics calculés
    packets_per_second: float = 0.0
    bytes_per_second: float = 0.0
    port_entropy: float = 0.0
    success_failure_ratio: float = 1.0
    
    # Finite State Machine
    fsm_state: FSMState = FSMState.NORMAL
    fsm_transitions: List[tuple] = field(default_factory=list)
    
    # Contexte comportemental
    auth_failures: int = 0
    scan_indicators: int = 0
    flood_indicators: int = 0
    
    def update_metrics(self, current_time: float) -> None:
        """Met à jour les métriques calculées."""
        window_seconds = 60.0
        
        # Calcul du débit de paquets
        recent_packets = [ts for ts in self.packet_timestamps 
                         if current_time - ts <= window_seconds]
        self.packets_per_second = len(recent_packets) / window_seconds if window_seconds > 0 else 0.0
        
        # Calcul du débit en octets
        self.bytes_per_second = self.byte_count / window_seconds if window_seconds > 0 else 0.0
        
        # Calcul de l'entropie des ports
        if self.port_access_counts:
            total = sum(self.port_access_counts.values())
            if total > 0:
                entropy = 0.0
                for count in self.port_access_counts.values():
                    if count > 0:
                        p = count / total
                        entropy -= p * math.log2(p)
                self.port_entropy = entropy
        
        # Calcul du ratio succès/échec
        total_attempts = self.auth_failures + 1  # +1 pour éviter division par 0
        self.success_failure_ratio = max(0.0, 1.0 - (self.auth_failures / total_attempts))
    
    def transition_fsm(self, new_state: FSMState, reason: str) -> None:
        """
        Effectue une transition dans la FSM.
        
        Args:
            new_state: Nouvel état
            reason: Raison de la transition
        """
        if new_state != self.fsm_state:
            old_state = self.fsm_state
            self.fsm_state = new_state
            self.fsm_transitions.append((time.time(), old_state, new_state, reason))
            
            # Garder seulement les 100 dernières transitions
            if len(self.fsm_transitions) > 100:
                self.fsm_transitions.pop(0)


class StateStore(IStateStore):
    """
    Implémentation du State Store avec optimisations performance.
    Utilise des structures de données en mémoire pour minimiser la latence.
    """
    
    def __init__(self):
        self._states: Dict[str, IPState] = {}
        self._lock = threading.RLock()
        self._max_state_age = 3600.0  # 1 heure par défaut
        self._cleanup_interval = 300.0  # 5 minutes
        self._last_cleanup = time.time()
    
    def update_state(self, ip: str, context: PacketContext) -> Dict[str, Any]:
        """
        Met à jour l'état pour une IP donnée.
        
        Args:
            ip: Adresse IP
            context: Contexte du paquet
            
        Returns:
            État mis à jour
        """
        with self._lock:
            current_time = context.timestamp
            
            # Créer ou récupérer l'état
            if ip not in self._states:
                self._states[ip] = IPState(
                    ip=ip,
                    first_seen=current_time,
                    last_seen=current_time
                )
            
            state = self._states[ip]
            state.last_seen = current_time
            state.packet_count += 1
            state.byte_count += context.payload_size
            
            # Mettre à jour les time-series
            state.packet_timestamps.append(current_time)
            
            # Mettre à jour les compteurs de ports
            if context.destination_port:
                state.port_access_counts[context.destination_port] = \
                    state.port_access_counts.get(context.destination_port, 0) + 1
            
            # Mettre à jour les compteurs de protocoles
            state.protocol_counts[context.protocol] = \
                state.protocol_counts.get(context.protocol, 0) + 1
            
            # Mettre à jour les compteurs de flags
            state.flag_counts[context.flags] = \
                state.flag_counts.get(context.flags, 0) + 1
            
            # Mettre à jour les métriques calculées
            state.update_metrics(current_time)
            
            # Nettoyage périodique
            if current_time - self._last_cleanup > self._cleanup_interval:
                self.cleanup_expired_states(self._max_state_age)
                self._last_cleanup = current_time
            
            return self._state_to_dict(state)
    
    def get_state(self, ip: str) -> Optional[Dict[str, Any]]:
        """
        Récupère l'état actuel pour une IP.
        
        Args:
            ip: Adresse IP
            
        Returns:
            État actuel ou None si inexistant
        """
        with self._lock:
            if ip not in self._states:
                return None
            return self._state_to_dict(self._states[ip])
    
    def get_time_series(self, ip: str, metric: str, 
                       window_seconds: float) -> List[float]:
        """
        Récupère les time-series pour une métrique donnée.
        
        Args:
            ip: Adresse IP
            metric: Nom de la métrique (packet_rate, byte_rate, port_entropy)
            window_seconds: Fenêtre de temps en secondes
            
        Returns:
            Liste des valeurs de la métrique
        """
        with self._lock:
            if ip not in self._states:
                return []
            
            state = self._states[ip]
            current_time = time.time()
            
            if metric == "packet_rate":
                # Calculer le taux de paquets sur la fenêtre
                timestamps = [ts for ts in state.packet_timestamps 
                            if current_time - ts <= window_seconds]
                return [len(timestamps) / window_seconds] if window_seconds > 0 else [0.0]
            
            elif metric == "byte_rate":
                # Calculer le taux d'octets sur la fenêtre
                return [state.bytes_per_second]
            
            elif metric == "port_entropy":
                # Retourner l'entropie actuelle
                return [state.port_entropy]
            
            else:
                return []
    
    def cleanup_expired_states(self, max_age_seconds: float) -> int:
        """
        Nettoie les états expirés.
        
        Args:
            max_age_seconds: Âge maximum en secondes
            
        Returns:
            Nombre d'états supprimés
        """
        with self._lock:
            current_time = time.time()
            expired_ips = [
                ip for ip, state in self._states.items()
                if current_time - state.last_seen > max_age_seconds
            ]
            
            for ip in expired_ips:
                del self._states[ip]
            
            return len(expired_ips)
    
    def transition_state(self, ip: str, new_state: FSMState, reason: str) -> bool:
        """
        Effectue une transition FSM pour une IP.
        
        Args:
            ip: Adresse IP
            new_state: Nouvel état
            reason: Raison de la transition
            
        Returns:
            True si transition réussie, False sinon
        """
        with self._lock:
            if ip not in self._states:
                return False
            
            self._states[ip].transition_fsm(new_state, reason)
            return True
    
    def get_fsm_state(self, ip: str) -> Optional[FSMState]:
        """
        Récupère l'état FSM actuel pour une IP.
        
        Args:
            ip: Adresse IP
            
        Returns:
            État FSM actuel ou None si inexistant
        """
        with self._lock:
            if ip not in self._states:
                return None
            return self._states[ip].fsm_state
    
    def increment_counter(self, ip: str, counter_name: str) -> None:
        """
        Incrémente un compteur comportemental pour une IP.
        
        Args:
            ip: Adresse IP
            counter_name: Nom du compteur (auth_failures, scan_indicators, flood_indicators)
        """
        with self._lock:
            if ip not in self._states:
                return
            
            state = self._states[ip]
            if counter_name == "auth_failures":
                state.auth_failures += 1
            elif counter_name == "scan_indicators":
                state.scan_indicators += 1
            elif counter_name == "flood_indicators":
                state.flood_indicators += 1
    
    def _state_to_dict(self, state: IPState) -> Dict[str, Any]:
        """Convertit un IPState en dictionnaire."""
        return {
            "ip": state.ip,
            "first_seen": state.first_seen,
            "last_seen": state.last_seen,
            "packet_count": state.packet_count,
            "byte_count": state.byte_count,
            "packets_per_second": state.packets_per_second,
            "bytes_per_second": state.bytes_per_second,
            "port_entropy": state.port_entropy,
            "success_failure_ratio": state.success_failure_ratio,
            "fsm_state": state.fsm_state.value,
            "auth_failures": state.auth_failures,
            "scan_indicators": state.scan_indicators,
            "flood_indicators": state.flood_indicators,
            "unique_ports": len(state.port_access_counts),
            "unique_protocols": len(state.protocol_counts)
        }
    
    def get_all_states(self) -> Dict[str, Dict[str, Any]]:
        """Récupère tous les états."""
        with self._lock:
            return {ip: self._state_to_dict(state) 
                   for ip, state in self._states.items()}
    
    def get_state_count(self) -> int:
        """Retourne le nombre d'états stockés."""
        with self._lock:
            return len(self._states)


# Singleton global
state_store = StateStore()
