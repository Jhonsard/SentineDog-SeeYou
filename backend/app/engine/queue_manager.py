"""
Gestionnaire de file d'attente de paquets avec métriques de saturation.
Remplace la file aveugle Queue(maxsize=5000) par un backpressure explicite
et un compteur de paquets perdus pour la supervision.
"""
import asyncio
import logging
from typing import Optional

logger = logging.getLogger("ids_ips.queue")

class PacketQueueManager:
    """
    Wrapper autour de asyncio.Queue avec :
    - Compteur de paquets perdus par saturation
    - Exposition des métriques de taille et de drop
    - Backpressure contrôlé
    """
    def __init__(self, maxsize: int = 5000) -> None:
        self._queue: asyncio.Queue = asyncio.Queue(maxsize=maxsize)
        self._maxsize: int = maxsize
        self._dropped_packets: int = 0
        self._total_put: int = 0

    @property
    def queue(self) -> asyncio.Queue:
        """Accès à la queue sous-jacente pour les consommateurs."""
        return self._queue

    def put_nowait_with_metrics(self, item) -> bool:
        """
        Tente d'insérer un paquet dans la queue sans attendre.
        Retourne True si inséré, False si la queue est pleine (drop).
        """
        try:
            self._queue.put_nowait(item)
            self._total_put += 1
            return True
        except asyncio.QueueFull:
            self._dropped_packets += 1
            logger.warning(
                f"File d'attente saturée ({self._queue.qsize()}/{self._maxsize}). "
                f"Paquet rejeté. Total perdu: {self._dropped_packets}"
            )
            return False

    def get_nowait(self):
        """Récupère un élément de la queue sans attendre."""
        return self._queue.get_nowait()

    def task_done(self) -> None:
        """Marque une tâche comme terminée."""
        self._queue.task_done()

    def qsize(self) -> int:
        """Retourne la taille actuelle de la queue."""
        return self._queue.qsize()

    @property
    def dropped_packets(self) -> int:
        """Retourne le nombre total de paquets perdus par saturation."""
        return self._dropped_packets

    @property
    def maxsize(self) -> int:
        """Retourne la taille maximale configurée."""
        return self._maxsize

    def get_metrics(self) -> dict:
        """Retourne un dictionnaire de métriques pour la supervision."""
        return {
            "queue_size": self._queue.qsize(),
            "queue_maxsize": self._maxsize,
            "dropped_packets": self._dropped_packets,
            "total_processed": self._total_put - self._queue.qsize(),
            "utilization_pct": round((self._queue.qsize() / self._maxsize) * 100, 2) if self._maxsize > 0 else 0.0
        }
