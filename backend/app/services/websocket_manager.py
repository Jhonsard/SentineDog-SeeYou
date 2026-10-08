import asyncio
import logging
from typing import List, Dict, Any
from fastapi import WebSocket

logger = logging.getLogger("ids_ips.websocket")

class WebSocketManager:
    """
    Gestionnaire de sockets applicatifs concurrents.
    Assure la distribution non bloquante des alertes de sécurité vers les clients.
    """
    def __init__(self) -> None:
        self.active_connections: List[WebSocket] = []
        self._lock: asyncio.Lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket) -> None:
        """
        Enregistre une session client WebSocket déjà acceptée de manière atomique.
        """
        async with self._lock:
            self.active_connections.append(websocket)
        logger.info(f"Nouvelle connexion WebSocket établie. Total actif: {len(self.active_connections)}")

    async def disconnect(self, websocket: WebSocket) -> None:
        """
        Révoque une session client et nettoie les structures de tracking.
        """
        async with self._lock:
            if websocket in self.active_connections:
                self.active_connections.remove(websocket)
        logger.info(f"Connexion WebSocket révoquée. Total restant: {len(self.active_connections)}")

    async def send_personal_message(self, message: str, websocket: WebSocket) -> None:
        """
        Transmet un payload textuel brut à un canal unique et isolé.
        """
        try:
            await websocket.send_text(message)
        except Exception as e:
            logger.error(f"Échec de l'envoi du message privé: {str(e)}")
            await self.disconnect(websocket)

    async def broadcast(self, message: Dict[str, Any]) -> None:
        """
        Diffuse un payload JSON à l'intégralité des clients connectés en parallèle.
        Copie la structure de données sous verrou pour éviter les corruptions de mémoire.
        """
        async with self._lock:
            # Duplication de la liste pour immuniser l'itération contre les déconnexions concurrentes
            targets = list(self.active_connections)

        if not targets:
            return

        # Distribution asynchrone simultanée vers tous les clients
        async def _safe_send(ws: WebSocket) -> None:
            try:
                await ws.send_json(message)
            except Exception:
                # Retrait immédiat en cas de coupure socket ou timeout
                await self.disconnect(ws)

        await asyncio.gather(*[_safe_send(target) for target in targets], return_exceptions=True)

# Instance unique du gestionnaire pour l'ensemble du cycle de vie applicatif
websocket_manager = WebSocketManager()
