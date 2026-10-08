import asyncio
import logging
import scapy.all as scapy
from scapy.error import Scapy_Exception
from typing import Callable, Optional
from app.core.config import settings
from app.engine.queue_manager import PacketQueueManager

logger = logging.getLogger("ids_ips.sniffer")

class NetworkSniffer:
    """
    Composant d'acquisition de paquets en mode promiscuité.
    Isole les appels bloquants de Scapy dans un threadpool managé
    et alimente une file d'attente asynchrone thread-safe pour le traitement.
    """
    def __init__(self, packet_queue: PacketQueueManager, interface: Optional[str] = None) -> None:
        self.packet_queue: PacketQueueManager = packet_queue
        self.interface: str = interface or getattr(settings, "NETWORK_INTERFACE", "wlan0")
        self._loop: asyncio.AbstractEventLoop = asyncio.get_running_loop()
        self._keep_running: bool = False
        self._sniff_task: Optional[asyncio.Task] = None

    def _scapy_packet_callback(self, packet: scapy.Packet) -> None:
        """
        Intercepte les paquets depuis le thread Scapy et les injecte
        dans la boucle d'événements principale de manière thread-safe.
        """
        if not self._keep_running:
            return
        try:
            inserted = self.packet_queue.put_nowait_with_metrics(packet)
            if not inserted:
                pass  # drop déjà compté et loggé dans PacketQueueManager
        except Exception as e:
            logger.error(f"Erreur d'injection du paquet dans la queue: {str(e)}")

    def _run_sniff(self) -> None:
        """
        Exécute la boucle synchrone de sniffing de Scapy.
        Cette méthode doit impérativement tourner dans un thread distinct.
        """
        try:
            scapy.sniff(
                iface=self.interface,
                prn=self._scapy_packet_callback,
                store=0,
                stop_filter=lambda p: not self._keep_running,
                timeout = 1
            )
        except (OSError, Scapy_Exception) as e:
            logger.error(f"Incident matériel ou permission insuffisante sur l'interface {self.interface}: {str(e)}")
            raise

    async def start_capture(self) -> None:
        """
        Démarre la capture réseau de manière asynchrone avec mécanisme 
        de tolérance aux pannes et reconnexion automatique.
        """
        if self._keep_running:
            logger.warning("Le sniffer est déjà actif.")
            return

        self._keep_running = True
        logger.info(f"Initialisation de la capture réseau sur l'interface: {self.interface}")
        
        while self._keep_running:
            try:
                # Déportation du sniffing bloquant dans le ThreadPoolExecutor par défaut
                await asyncio.to_thread(self._run_sniff)
            except (OSError, Scapy_Exception):
                if not self._keep_running:
                    break
                logger.error("Défaillance de l'adaptateur réseau détectée. Tentative de reconnexion dans 5 secondes...")
                await asyncio.sleep(5)
            except Exception as e:
                logger.critical(f"Erreur non gérée dans le thread de sniffing: {str(e)}")
                await asyncio.sleep(5)

    async def stop_capture(self) -> None:
        """
        Arrête proprement la capture réseau et libère les ressources associées.
        """
        logger.info("Arrêt du sniffer réseau demandé.")
        self._keep_running = False
        # Injecter un paquet vide ou forcer l'arrêt si nécessaire, l'évaluation du stop_filter se fera au prochain paquet.
        logger.info("Moteur de capture arrêté avec succès.")
