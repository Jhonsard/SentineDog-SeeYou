"""
Baseline Profiler pour la réduction des faux positifs.
Apprend le comportement normal par IP et utilise des seuils adaptatifs.
"""
import time
import threading
import math
from collections import defaultdict, deque
from typing import Dict, Any, Optional, List
from dataclasses import dataclass, field

from .interfaces import IBaselineProfiler


@dataclass
class MetricBaseline:
    """Baseline pour une métrique spécifique."""
    metric_name: str
    ip: str
    values: deque = field(default_factory=lambda: deque(maxlen=1000))
    mean: float = 0.0
    std: float = 0.0
    min_value: float = float('inf')
    max_value: float = float('-inf')
    last_updated: float = 0.0
    sample_count: int = 0
    
    def update_statistics(self) -> None:
        """Recalcule les statistiques de la baseline."""
        if not self.values:
            return
        
        values_list = list(self.values)
        self.mean = sum(values_list) / len(values_list)
        
        if len(values_list) > 1:
            variance = sum((x - self.mean) ** 2 for x in values_list) / len(values_list)
            self.std = math.sqrt(variance)
        else:
            self.std = 0.0
        
        self.min_value = min(values_list)
        self.max_value = max(values_list)
        self.sample_count = len(values_list)
        self.last_updated = time.time()
    
    def get_z_score(self, value: float) -> float:
        """
        Calcule le Z-score pour une valeur.
        
        Args:
            value: Valeur à tester
            
        Returns:
            Z-score (nombre d'écarts-types par rapport à la moyenne)
        """
        if self.std == 0:
            return 0.0
        return abs(value - self.mean) / self.std


class BaselineProfiler(IBaselineProfiler):
    """
    Implémentation du profilage de baseline avec seuils adaptatifs.
    Utilise le Z-score pour détecter les anomalies statistiques.
    """
    
    def __init__(self, min_samples: int = 30, max_age_hours: float = 24.0):
        self._baselines: Dict[str, Dict[str, MetricBaseline]] = defaultdict(dict)
        self._lock = threading.RLock()
        self._min_samples = min_samples  # Nombre minimum d'échantillons pour établir une baseline
        self._max_age = max_age_hours * 3600.0  # Âge maximum en secondes
        self._cleanup_interval = 3600.0  # 1 heure
        self._last_cleanup = time.time()
    
    def update_baseline(self, ip: str, metric: str, value: float) -> None:
        """
        Met à jour la baseline pour une métrique.
        
        Args:
            ip: Adresse IP
            metric: Nom de la métrique
            value: Valeur actuelle
        """
        with self._lock:
            # Créer ou récupérer la baseline
            if metric not in self._baselines[ip]:
                self._baselines[ip][metric] = MetricBaseline(
                    metric_name=metric,
                    ip=ip
                )
            
            baseline = self._baselines[ip][metric]
            baseline.values.append(value)
            baseline.update_statistics()
            
            # Nettoyage périodique
            current_time = time.time()
            if current_time - self._last_cleanup > self._cleanup_interval:
                self._cleanup_expired_baselines()
                self._last_cleanup = current_time
    
    def is_anomaly(self, ip: str, metric: str, value: float, 
                   z_score_threshold: float = 3.0) -> bool:
        """
        Détermine si une valeur est anormale par rapport à la baseline.
        
        Args:
            ip: Adresse IP
            metric: Nom de la métrique
            value: Valeur à tester
            z_score_threshold: Seuil de Z-score (défaut: 3.0 = 3 écarts-types)
            
        Returns:
            True si anomalie, False sinon
        """
        with self._lock:
            # Vérifier si la baseline existe et a suffisamment d'échantillons
            if ip not in self._baselines or metric not in self._baselines[ip]:
                return False  # Pas de baseline, pas de détection d'anomalie
            
            baseline = self._baselines[ip][metric]
            
            # Besoin d'un minimum d'échantillons pour une baseline fiable
            if baseline.sample_count < self._min_samples:
                return False
            
            # Calculer le Z-score
            z_score = baseline.get_z_score(value)
            
            # Anomalie si le Z-score dépasse le seuil
            return z_score > z_score_threshold
    
    def get_baseline_stats(self, ip: str, metric: str) -> Optional[Dict[str, float]]:
        """
        Récupère les statistiques de baseline.
        
        Args:
            ip: Adresse IP
            metric: Nom de la métrique
            
        Returns:
            Dictionnaire avec mean, std, min, max ou None
        """
        with self._lock:
            if ip not in self._baselines or metric not in self._baselines[ip]:
                return None
            
            baseline = self._baselines[ip][metric]
            return {
                "mean": baseline.mean,
                "std": baseline.std,
                "min": baseline.min_value,
                "max": baseline.max_value,
                "sample_count": baseline.sample_count,
                "last_updated": baseline.last_updated
            }
    
    def get_adaptive_threshold(self, ip: str, metric: str, 
                              multiplier: float = 3.0) -> Optional[float]:
        """
        Calcule un seuil adaptatif basé sur la baseline.
        
        Args:
            ip: Adresse IP
            metric: Nom de la métrique
            multiplier: Multiplicateur de l'écart-type (défaut: 3.0)
            
        Returns:
            Seuil adaptatif ou None si baseline indisponible
        """
        stats = self.get_baseline_stats(ip, metric)
        if not stats:
            return None
        
        return stats["mean"] + (multiplier * stats["std"])
    
    def get_all_baselines(self, ip: str) -> Dict[str, Dict[str, float]]:
        """
        Récupère toutes les baselines pour une IP.
        
        Args:
            ip: Adresse IP
            
        Returns:
            Dictionnaire des baselines par métrique
        """
        with self._lock:
            if ip not in self._baselines:
                return {}
            
            return {
                metric: self.get_baseline_stats(ip, metric)
                for metric in self._baselines[ip]
            }
    
    def reset_baseline(self, ip: str, metric: str) -> bool:
        """
        Réinitialise la baseline pour une métrique.
        
        Args:
            ip: Adresse IP
            metric: Nom de la métrique
            
        Returns:
            True si réinitialisé, False sinon
        """
        with self._lock:
            if ip not in self._baselines or metric not in self._baselines[ip]:
                return False
            
            del self._baselines[ip][metric]
            return True
    
    def reset_all_baselines(self, ip: str) -> int:
        """
        Réinitialise toutes les baselines pour une IP.
        
        Args:
            ip: Adresse IP
            
        Returns:
            Nombre de baselines réinitialisées
        """
        with self._lock:
            if ip not in self._baselines:
                return 0
            
            count = len(self._baselines[ip])
            del self._baselines[ip]
            return count
    
    def _cleanup_expired_baselines(self) -> int:
        """
        Nettoie les baselines expirées.
        
        Returns:
            Nombre de baselines supprimées
        """
        current_time = time.time()
        removed_count = 0
        
        for ip in list(self._baselines.keys()):
            for metric in list(self._baselines[ip].keys()):
                baseline = self._baselines[ip][metric]
                if current_time - baseline.last_updated > self._max_age:
                    del self._baselines[ip][metric]
                    removed_count += 1
            
            # Supprimer l'IP si elle n'a plus de baselines
            if not self._baselines[ip]:
                del self._baselines[ip]
        
        return removed_count
    
    def get_baseline_count(self) -> int:
        """Retourne le nombre total de baselines."""
        with self._lock:
            return sum(len(metrics) for metrics in self._baselines.values())
    
    def get_ip_count(self) -> int:
        """Retourne le nombre d'IPs avec des baselines."""
        with self._lock:
            return len(self._baselines)


# Singleton global
baseline_profiler = BaselineProfiler()
