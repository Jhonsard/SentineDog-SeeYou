"""
Contrôleur de cycle de vie du moteur d'acquisition/analyse.

Centralise le pilotage du sniffer Scapy et du processeur de paquets afin que
l'API (POST /engine/sniffer/start|stop) puisse réellement armer/désarmer la
capture réseau, au lieu de la démarrer systématiquement au lancement.
"""
import asyncio
import contextlib
import logging
from typing import Any, Dict, Optional

from app.core.config import settings
from app.engine.processor import PacketProcessor
from app.engine.queue_manager import PacketQueueManager
from app.engine.sniffer import NetworkSniffer

logger = logging.getLogger("ids_ips.engine")


class EngineController:
    """Pilote le sniffer et le processeur comme des tâches asyncio annulables."""

    def __init__(
        self,
        packet_queue: PacketQueueManager,
        processor: PacketProcessor,
        sniffer: NetworkSniffer,
    ) -> None:
        self.packet_queue = packet_queue
        self.processor = processor
        self.sniffer = sniffer
        self._sniffer_task: Optional[asyncio.Task] = None
        self._processor_task: Optional[asyncio.Task] = None

    @staticmethod
    def _is_task_running(task: Optional[asyncio.Task]) -> bool:
        return task is not None and not task.done()

    @property
    def sniffer_running(self) -> bool:
        return self._is_task_running(self._sniffer_task)

    @property
    def processor_running(self) -> bool:
        return self._is_task_running(self._processor_task)

    @property
    def running(self) -> bool:
        return self.sniffer_running

    def status(self) -> Dict[str, Any]:
        return {
            "running": self.running,
            "sniffer_running": self.sniffer_running,
            "processor_running": self.processor_running,
            "interface": self.sniffer.interface,
            "autostart": bool(getattr(settings, "SNIFFER_AUTOSTART", False)),
            "queue": self.packet_queue.get_metrics(),
        }

    async def start_processor(self) -> None:
        """Démarre le consommateur de la file (nécessaire pour traiter les paquets capturés)."""
        if self.processor_running:
            return
        self.processor._is_running = True
        self._processor_task = asyncio.create_task(
            self.processor.start_processing(self.packet_queue)
        )
        logger.info("Processeur de paquets démarré.")

    async def start_sniffer(self) -> Dict[str, Any]:
        """Arme la capture réseau. Idempotent : ne fait rien si déjà actif."""
        await self.start_processor()
        if self.sniffer_running:
            return {"started": False, "reason": "already_running", **self.status()}

        # NB: ne pas pré-armer sniffer._keep_running : start_capture() le
        # considère comme "déjà actif" et retournerait immédiatement.
        self._sniffer_task = asyncio.create_task(self.sniffer.start_capture())
        # Laisser la tâche remonter un éventuel échec immédiat (permissions/interface).
        await asyncio.sleep(0)
        logger.info("Capture réseau armée sur l'interface %s.", self.sniffer.interface)
        return {"started": True, **self.status()}

    async def stop_sniffer(self) -> Dict[str, Any]:
        """Désarme la capture réseau sans arrêter le processeur."""
        if not self.sniffer_running:
            return {"stopped": False, "reason": "not_running", **self.status()}

        with contextlib.suppress(Exception):
            await self.sniffer.stop_capture()

        task = self._sniffer_task
        self._sniffer_task = None
        if task is not None:
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await task
        logger.info("Capture réseau désarmée.")
        return {"stopped": True, **self.status()}

    async def shutdown(self) -> None:
        """Arrêt propre de toutes les tâches du moteur (appelé au lifespan shutdown)."""
        if self.sniffer_running:
            with contextlib.suppress(Exception):
                await self.stop_sniffer()

        if self.processor_running:
            self.processor.stop_processing()
            task = self._processor_task
            self._processor_task = None
            if task is not None:
                task.cancel()
                with contextlib.suppress(asyncio.CancelledError, Exception):
                    await task
