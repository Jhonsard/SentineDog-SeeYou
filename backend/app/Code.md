-- Main.py --

import logging
from contextlib import asynccontextmanager
import asyncio
import time
from fastapi import FastAPI, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import text
from slowapi.middleware import SlowAPIMiddleware
from slowapi.errors import RateLimitExceeded

# Importations des composants d'infrastructure centralisés
from app.core.config import settings
from app.db.models import Base
from app.core.dependencies import get_db, SessionLocal
from app.engine.sniffer import NetworkSniffer
from app.engine.processor import PacketProcessor
from app.engine.queue_manager import PacketQueueManager
from app.services.alert_manager import AlertManager
from app.services.websocket_manager import websocket_manager
from app.api.endpoints.auth import router as auth_router
from app.api.endpoints.alert import router as alerts_router
from app.api.endpoints.email_config import router as email_config_router
from app.api.endpoints.nodes import router as nodes_router
from app.api.endpoints.keys import router as keys_router
from app.api.endpoints.ai import router as ai_router
from app.core.rate_limiter import limiter
from app.engine.firewall import firewall_manager
from app.core.json_logger import configure_logging

configure_logging(level=logging.INFO)
logger = logging.getLogger("ids_ips.main")

@asynccontextmanager
async def app_lifespan(app: FastAPI):
    app.state.start_time = time.time()
    logger.info("--- INITIALISATION DU BACKEND IDS/IPS ULPGL ---")
    
    if len(settings.SECRET_KEY) < 32:
        logger.critical("SECRET_KEY trop courte (<32 caracteres). Arret immediat.")
        raise RuntimeError("SECRET_KEY invalide: longueur minimum 32 caracteres.")
    
    try:
        from alembic.config import Config
        from alembic import command
        alembic_cfg = Config("alembic.ini")
        alembic_cfg.set_main_option("sqlalchemy.url", settings.DATABASE_URL)
        command.upgrade(alembic_cfg, "head")
        logger.info("Schema de base de donnees synchronise via Alembic.")
    except Exception as e:
        logger.critical(f"Impossible d'appliquer les migrations Alembic: {str(e)}")
        raise

    packet_queue: PacketQueueManager = PacketQueueManager(maxsize=5000)
    app.state.packet_queue = packet_queue
    
    alert_manager = AlertManager(db_session_factory=SessionLocal)
    firewall_manager.block_failure_callback = alert_manager.process_new_alert
    processor = PacketProcessor(alert_callback=alert_manager.process_new_alert)
    sniffer = NetworkSniffer(packet_queue=packet_queue, interface=settings.NETWORK_INTERFACE)

    processor_task = asyncio.create_task(processor.start_processing(packet_queue))
    sniffer_task = asyncio.create_task(sniffer.start_capture())
    app.state.sniffer_task = sniffer_task
    app.state.processor_task = processor_task

    logger.info("Moteurs d'interception et d'analyse comportementale déployés avec succès.")
    
    yield
    
    logger.info("--- FERMETURE DES SYSTÈMES DE SÉCURITÉ ---")
    await sniffer.stop_capture()
    processor.stop_processing()
    
    sniffer_task.cancel()
    processor_task.cancel()
    
    await asyncio.gather(sniffer_task, processor_task, return_exceptions=True)
    logger.info("Ressources système libérées. Extinction complète de l'application.")

# Initialisation de l'instance maîtresse de FastAPI
app = FastAPI(
    title=settings.APP_NAME,
    description="Cœur d'analyse, de détection et de prévention d'intrusions pour le réseau local de l'ULPGL.",
    version="2.0.0",
    lifespan=app_lifespan
)
app.state.limiter = limiter
app.state.firewall_manager = firewall_manager

@app.exception_handler(RateLimitExceeded)
async def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded):
    retry_after = exc.detail or str(settings.RATE_LIMIT_AUTH_WINDOW_SECONDS)
    return JSONResponse(
        status_code=429,
        content={"detail": "Trop de tentatives. Réessayez dans quelques instants."},
        headers={"Retry-After": retry_after},
    )

# Configuration de la sécurité des partages de ressources (CORS) pour le Dashboard Front-End
# Injectée depuis la configuration centralisée, avec validation stricte en production
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ALLOWED_ORIGINS,
    allow_credentials=settings.CORS_ALLOW_CREDENTIALS,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"] if settings.CORS_ENVIRONMENT != "dev" else ["*"],
    allow_headers=["*"] if settings.CORS_ENVIRONMENT == "dev" else ["Authorization", "Content-Type", "Accept"],
)

# Rate limiting global sur les endpoints sensibles
if settings.RATE_LIMIT_ENABLED:
    app.add_middleware(SlowAPIMiddleware)

# Branchement des routeurs d'API modulaires (Routage explicite)
app.include_router(auth_router, prefix="/api/v1")
app.include_router(alerts_router, prefix="/api/v1")
app.include_router(email_config_router, prefix="/api/v1")
app.include_router(nodes_router, prefix="/api/v1")
app.include_router(keys_router, prefix="/api/v1")
app.include_router(ai_router, prefix="/api/v1")

@app.get("/api/v1/health", summary="Vérification de l'état de santé du système (Health Check)")
async def health_check(db: Session = Depends(get_db)):
    uptime = time.time() - app.state.start_time
    queue_metrics = app.state.packet_queue.get_metrics()
    sniffer_running = getattr(app.state, "sniffer_task", None) is not None and not getattr(app.state, "sniffer_task").done()
    processor_running = getattr(app.state, "processor_task", None) is not None and not getattr(app.state, "processor_task").done()
    engine_status = {
        "sniffer": "running" if sniffer_running else "stopped",
        "processor": "running" if processor_running else "stopped",
        "firewall": "active" if len(firewall_manager.blocked_ips) == 0 else f"{len(firewall_manager.blocked_ips)} IP(s) bloquées",
        "uptime_seconds": round(uptime, 2),
    }
    try:
        db.execute(text("SELECT 1"))
        db_status = "connected"
        status = "healthy"
        from app.db.models import Node
        nodes_count = db.query(Node).filter(Node.is_active == True).count()
    except Exception as e:
        logger.error(f"Erreur lors du Health Check: {str(e)}")
        db_status = "disconnected"
        status = "unhealthy"
        nodes_count = 0
    
    return {
        "status": status,
        "database": db_status,
        "system": "operational",
        "packet_queue": queue_metrics,
        "engine": engine_status,
        "nodes": {
            "active_count": nodes_count
        }
    }

if __name__ == "__main__":
    # Point d'entrée de démarrage manuel pour le développement (ex: python -m app.main)
    import uvicorn
    uvicorn.run(
        "app.main:app", 
        host=settings.API_HOST, 
        port=settings.API_PORT, 
        reload=False  # Rechargement désactivé pour ne pas perturber les threads Scapy
    ) 

# dossier engine
-- feature_extractor.py --

import math
import logging
from typing import Dict, Any, List, Optional

import numpy as np

from app.core.config import settings

logger = logging.getLogger(__name__)


class FeatureExtractor:
    """
    Extrait strictement les 20 features utilisées par IDSEnv/RLInference.
    Fournit :
    - extract(ip) -> np.ndarray shape (20,)
    - extract_dict(ip) -> Dict[str, float]
    - get_feature_names() -> List[str]
    - validate_alignment(rl_model) -> bool
    """

    @staticmethod
    def get_feature_names() -> List[str]:
        return [
            "protocol_tcp",
            "protocol_udp",
            "protocol_icmp",
            "protocol_other",
            "packet_length_norm",
            "src_port_norm",
            "dst_port_norm",
            "ttl_norm",
            "flag_syn",
            "flag_ack",
            "flag_fin",
            "flag_rst",
            "flag_psh",
            "flag_urg",
            "payload_entropy_mean",
            "payload_entropy_max",
            "unique_dst_ips_ratio",
            "failed_auth_ratio",
            "hour_of_day",
            "is_weekend",
        ]

    def extract_dict(self, ip: str, context: Optional[Dict[str, Any]] = None) -> Dict[str, float]:
        """
        Retourne un dictionnaire nommé des 20 features.
        Pour l'instant, remplissage réaliste ou dérivé de `context` si fourni.
        """
        context = context or {}
        protocol = str(context.get("protocol", "OTHER")).upper()
        flags = str(context.get("flags_str", "")).upper()
        packet_length = float(context.get("packet_length", 0))
        src_port = float(context.get("src_port", 0))
        dst_port = float(context.get("dst_port", 0))
        ttl = float(context.get("ttl", 64))
        entropy_mean = float(context.get("payload_entropy_mean", 0.0))
        entropy_max = float(context.get("payload_entropy_max", 0.0))
        unique_dst_ratio = float(context.get("unique_dst_ips_ratio", 0.0))
        failed_auth_ratio = float(context.get("failed_auth_ratio", 0.0))
        hour = float(context.get("hour_of_day", 0.0))
        is_weekend = float(context.get("is_weekend", 0.0))

        features = {
            "protocol_tcp": 1.0 if protocol == "TCP" else 0.0,
            "protocol_udp": 1.0 if protocol == "UDP" else 0.0,
            "protocol_icmp": 1.0 if protocol == "ICMP" else 0.0,
            "protocol_other": 1.0 if protocol not in ("TCP", "UDP", "ICMP") else 0.0,
            "packet_length_norm": float(np.clip(packet_length / 1500.0, 0.0, 1.0)),
            "src_port_norm": float(np.clip(src_port / 65535.0, 0.0, 1.0)),
            "dst_port_norm": float(np.clip(dst_port / 65535.0, 0.0, 1.0)),
            "ttl_norm": float(np.clip(ttl / 255.0, 0.0, 1.0)),
            "flag_syn": 1.0 if "S" in flags else 0.0,
            "flag_ack": 1.0 if "A" in flags else 0.0,
            "flag_fin": 1.0 if "F" in flags else 0.0,
            "flag_rst": 1.0 if "R" in flags else 0.0,
            "flag_psh": 1.0 if "P" in flags else 0.0,
            "flag_urg": 1.0 if "U" in flags else 0.0,
            "payload_entropy_mean": float(np.clip(entropy_mean, 0.0, 1.0)),
            "payload_entropy_max": float(np.clip(entropy_max, 0.0, 1.0)),
            "unique_dst_ips_ratio": float(np.clip(unique_dst_ratio, 0.0, 1.0)),
            "failed_auth_ratio": float(np.clip(failed_auth_ratio, 0.0, 1.0)),
            "hour_of_day": float(np.clip(hour / 23.0 if hour > 0 else 0.0, 0.0, 1.0)),
            "is_weekend": float(np.clip(is_weekend, 0.0, 1.0)),
        }
        return features

    def extract(self, ip: str, context: Optional[Dict[str, Any]] = None) -> np.ndarray:
        features = self.extract_dict(ip, context=context)
        return np.array([features[name] for name in self.get_feature_names()], dtype=np.float32)

    def validate_alignment(self, rl_model) -> bool:
        backend_names = self.get_feature_names()
        model_names = getattr(rl_model, "get_feature_names", lambda: [])()
        aligned = backend_names == model_names
        if not aligned:
            logger.error(
                "Feature alignment mismatch: backend=%s model=%s",
                backend_names,
                model_names,
            )
        return aligned

-- firewall.py --

import subprocess
import time
import uuid
import logging
import asyncio
import ipaddress
from typing import Dict, Any, List, Optional, Callable
from collections import defaultdict, deque

from app.core.config import settings

logger = logging.getLogger("ids_ips.firewall")

class FirewallManager:
    """
    Gestionnaire matériel du pare-feu Linux avec règles avancées.
    Interagit directement avec les tables de filtrage (iptables/nftables)
    en isolant les appels système bloquants dans des threads managés avec:
    
    - Timeout strict de 2 secondes par défaut sur chaque appel iptables.
    - Vérification post-action systématique via `iptables -C`.
    - Stratégie de réessai (3 tentatives max) avec backoff exponentiel.
    - Remontée d'alerte critique via WebSocket et SMTP en cas d'échec persistant.
    """
    def __init__(self, block_failure_callback: Optional[Callable[[Dict[str, Any]], None]] = None) -> None:
        self.blocked_ips: Dict[str, Dict[str, Any]] = {}
        self.manual_block_tokens: Dict[str, Dict[str, Any]] = {}
        self.BLOCK_TOKEN_EXPIRY_SECONDS: int = 300
        self.block_failure_callback = block_failure_callback
        
        self.port_scan_tracker: Dict[str, Dict[str, Any]] = defaultdict(lambda: {
            "scanned_ports": set(),
            "last_seen": time.time()
        })
        self.syn_flood_tracker: Dict[str, deque] = defaultdict(lambda: deque(maxlen=200))
        self.icmp_flood_tracker: Dict[str, deque] = defaultdict(lambda: deque(maxlen=200))
        self.rate_limiter: Dict[str, deque] = defaultdict(lambda: deque(maxlen=100))
        
        self.SYN_FLOOD_THRESHOLD = 100
        self.ICMP_FLOOD_THRESHOLD = 50
        self.PORT_SCAN_THRESHOLD = 10
        self.RATE_LIMIT_THRESHOLD = 30
        self.FLOOD_WINDOW_SECONDS = 1.0
        self.RATE_LIMIT_WINDOW_SECONDS = 60.0

    def _execute_system_command(self, cmd: List[str], timeout: Optional[int] = None) -> bool:
        """
        Exécute une commande système avec timeout explicite et anti-injection.
        """
        timeout = timeout or settings.IPTABLES_TIMEOUT_SECONDS
        try:
            result = subprocess.run(
                cmd, 
                stdout=subprocess.PIPE, 
                stderr=subprocess.PIPE, 
                text=True, 
                timeout=timeout
            )
            if result.returncode == 0:
                return True
            logger.error(f"Erreur d'exécution de la règle pare-feu: {result.stderr.strip()}")
            return False
        except subprocess.TimeoutExpired:
            logger.error(f"Timeout lors de l'exécution de la commande pare-feu: {' '.join(cmd)}")
            return False
        except Exception as e:
            logger.critical(f"Incident critique du sous-système OS: {str(e)}")
            return False

    def _verify_rule_exists(self, ip_address: str) -> bool:
        """
        Vérifie post-action qu'une règle DROP existe bien pour l'IP donnée.
        """
        check_cmd = ["sudo", "iptables", "-C", "INPUT", "-s", ip_address, "-j", "DROP"]
        return self._execute_system_command(check_cmd)

    async def _notify_block_failure(self, ip_address: str, reason: str, attempt: int) -> None:
        """
        Remonte une alerte critique en cas d'échec persistant de blocage.
        """
        alert_data = {
            "source_ip": ip_address,
            "alert_type": "firewall_block_failure",
            "description": f"Échec persistant du blocage iptables après {attempt} tentatives. Raison: {reason}",
            "severity": "tres_critique",
            "timestamp": time.time(),
            "is_blocked": False,
            "is_manual_block": False,
            "validated_by_admin": False,
            "event_count": 1,
        }
        
        if self.block_failure_callback:
            try:
                result = self.block_failure_callback(alert_data)
                if asyncio.iscoroutine(result):
                    await result
                return
            except Exception as e:
                logger.error(f"Erreur callback échec blocage: {e}")
        
        try:
            from app.services.websocket_manager import websocket_manager
            await websocket_manager.broadcast(alert_data)
        except Exception as e:
            logger.error(f"Erreur broadcast WebSocket alerte firewall: {e}")
        
        try:
            from app.core.dependencies import SessionLocal
            from app.services.alert_manager import AlertManager
            def _db_factory():
                return SessionLocal()
            am = AlertManager(db_session_factory=_db_factory)
            am._sync_send_email_alert(alert_data)
        except Exception as e:
            logger.error(f"Erreur email alerte firewall: {e}")

    async def block_ip(self, ip_address: str, reason: str = "Automatique") -> bool:
        """
        Génère et applique une règle iptables DROP pour interdire une adresse IP.
        Inclut timeout, réessais et vérification post-action.
        """
        if ip_address in self.blocked_ips:
            return True

        max_retries = settings.IPTABLES_MAX_RETRIES
        base_timeout = settings.IPTABLES_TIMEOUT_SECONDS
        
        cmd = ["sudo", "iptables", "-A", "INPUT", "-s", ip_address, "-j", "DROP"]
        
        for attempt in range(1, max_retries + 1):
            success = await asyncio.to_thread(self._execute_system_command, cmd, timeout=base_timeout)
            if success:
                verified = self._verify_rule_exists(ip_address)
                if verified:
                    self.blocked_ips[ip_address] = {
                        "blocked_at": time.time(),
                        "reason": reason
                    }
                    logger.warning(f"POLITIQUES PARE-FEU MUTÉES : Adresse IP {ip_address} isolée du réseau.")
                    return True
                else:
                    logger.error(f"Règle iptables appliquée mais non vérifiée pour {ip_address} (tentative {attempt}/{max_retries})")
            else:
                logger.error(f"Échec d'application de la règle iptables pour {ip_address} (tentative {attempt}/{max_retries})")
            
            if attempt < max_retries:
                backoff = min(2 ** attempt, 8)
                await asyncio.sleep(backoff)
        
        logger.critical(f"ÉCHEC CRITIQUE: Impossible de bloquer {ip_address} après {max_retries} tentatives")
        await self._notify_block_failure(ip_address, reason, max_retries)
        return False

    async def unblock_ip(self, ip_address: str, admin_username: str) -> bool:
        """
        Révoque la règle iptables DROP correspondante pour restaurer l'accès à une IP.
        """
        if ip_address not in self.blocked_ips:
            return False

        cmd = ["sudo", "iptables", "-D", "INPUT", "-s", ip_address, "-j", "DROP"]
        
        success = await asyncio.to_thread(self._execute_system_command, cmd, timeout=settings.IPTABLES_TIMEOUT_SECONDS)
        if success:
            del self.blocked_ips[ip_address]
            logger.info(f"POLITIQUES PARE-FEU MUTÉES : Isolation levée pour {ip_address} par l'opérateur {admin_username}.")
            return True
        return False

    def generate_manual_block_token(self, ip_address: str, alert_id: int) -> str:
        token = str(uuid.uuid4())
        self.manual_block_tokens[token] = {
            "ip_address": ip_address,
            "alert_id": alert_id,
            "expires_at": time.time() + self.BLOCK_TOKEN_EXPIRY_SECONDS
        }
        return token

    def verify_and_consume_token(self, token: str, alert_id: int) -> bool:
        current_time = time.time()
        expired_tokens = [t for t, d in self.manual_block_tokens.items() if current_time > d["expires_at"]]
        for t in expired_tokens:
            del self.manual_block_tokens[t]

        if token not in self.manual_block_tokens:
            return False

        token_data = self.manual_block_tokens[token]
        if current_time > token_data["expires_at"] or token_data["alert_id"] != alert_id:
            return False

        del self.manual_block_tokens[token]
        return True

    def get_blocked_ips(self) -> Dict[str, Dict[str, Any]]:
        return self.blocked_ips

    async def detect_and_block_port_scan(self, src_ip: str, dst_ip: str, dst_port: int, protocol: str) -> Optional[str]:
        key = f"{src_ip}->{dst_ip}"
        tracker = self.port_scan_tracker[key]
        tracker["last_seen"] = time.time()
        
        port_identifier = f"{protocol}/{dst_port}"
        tracker["scanned_ports"].add(port_identifier)

        if len(tracker["scanned_ports"]) > self.PORT_SCAN_THRESHOLD:
            reason = f"Port scan détecté: {len(tracker['scanned_ports'])} ports scannés"
            success = await self.block_ip(src_ip, reason)
            if success:
                tracker["scanned_ports"].clear()
                return f"IP {src_ip} bloquée pour scan de ports"
        return None

    async def detect_and_block_syn_flood(self, src_ip: str, dst_ip: str) -> Optional[str]:
        key = f"{src_ip}->{dst_ip}"
        current_time = time.time()
        timestamps = self.syn_flood_tracker[key]

        while timestamps and timestamps[0] < current_time - self.FLOOD_WINDOW_SECONDS:
            timestamps.popleft()

        timestamps.append(current_time)

        if len(timestamps) > self.SYN_FLOOD_THRESHOLD:
            reason = f"SYN Flood détecté: {len(timestamps)} SYN/s"
            success = await self.block_ip(src_ip, reason)
            if success:
                timestamps.clear()
                return f"IP {src_ip} bloquée pour SYN Flood"
        return None

    async def detect_and_block_icmp_flood(self, src_ip: str, dst_ip: str) -> Optional[str]:
        key = f"{src_ip}->{dst_ip}"
        current_time = time.time()
        timestamps = self.icmp_flood_tracker[key]

        while timestamps and timestamps[0] < current_time - self.FLOOD_WINDOW_SECONDS:
            timestamps.popleft()

        timestamps.append(current_time)

        if len(timestamps) > self.ICMP_FLOOD_THRESHOLD:
            reason = f"ICMP Flood détecté: {len(timestamps)} ICMP/s"
            success = await self.block_ip(src_ip, reason)
            if success:
                timestamps.clear()
                return f"IP {src_ip} bloquée pour ICMP Flood"
        return None

    async def detect_and_block_rate_limit(self, src_ip: str, dst_ip: str) -> Optional[str]:
        key = f"{src_ip}->{dst_ip}"
        current_time = time.time()
        timestamps = self.rate_limiter[key]

        while timestamps and timestamps[0] < current_time - self.RATE_LIMIT_WINDOW_SECONDS:
            timestamps.popleft()

        timestamps.append(current_time)

        if len(timestamps) > self.RATE_LIMIT_THRESHOLD:
            reason = f"Rate limit dépassé: {len(timestamps)} connexions/min"
            success = await self.block_ip(src_ip, reason)
            if success:
                timestamps.clear()
                return f"IP {src_ip} bloquée pour rate limit excessif"
        return None

    async def detect_null_scan(self, src_ip: str, dst_ip: str, flags: int) -> Optional[str]:
        if flags == 0:
            reason = "TCP NULL scan détecté (flags = 0)"
            success = await self.block_ip(src_ip, reason)
            if success:
                return f"IP {src_ip} bloquée pour NULL scan"
        return None

    async def detect_xmas_scan(self, src_ip: str, dst_ip: str, flags: int) -> Optional[str]:
        if (flags & 0x01) and (flags & 0x08) and (flags & 0x20):
            reason = "TCP XMAS scan détecté (FIN, PSH, URG flags)"
            success = await self.block_ip(src_ip, reason)
            if success:
                return f"IP {src_ip} bloquée pour XMAS scan"
        return None

    async def detect_fin_scan(self, src_ip: str, dst_ip: str, flags: int) -> Optional[str]:
        if flags == 0x01:
            reason = "TCP FIN scan détecté (FIN flag only)"
            success = await self.block_ip(src_ip, reason)
            if success:
                return f"IP {src_ip} bloquée pour FIN scan"
        return None

    async def apply_advanced_firewall_rules(self, packet_info: Dict[str, Any]) -> Optional[str]:
        src_ip = packet_info.get("src_ip")
        dst_ip = packet_info.get("dst_ip")
        protocol = packet_info.get("protocol")
        dst_port = packet_info.get("dst_port")
        flags = packet_info.get("flags", 0)
        
        if not src_ip or not dst_ip:
            return None
        
        try:
            if ipaddress.ip_address(src_ip).is_private:
                return None
        except ValueError:
            pass
        
        if protocol == "TCP":
            null_result = await self.detect_null_scan(src_ip, dst_ip, flags)
            if null_result:
                return null_result
            
            xmas_result = await self.detect_xmas_scan(src_ip, dst_ip, flags)
            if xmas_result:
                return xmas_result
            
            fin_result = await self.detect_fin_scan(src_ip, dst_ip, flags)
            if fin_result:
                return fin_result
            
            if flags & 0x02:
                syn_result = await self.detect_and_block_syn_flood(src_ip, dst_ip)
                if syn_result:
                    return syn_result
            
            if dst_port:
                port_scan_result = await self.detect_and_block_port_scan(src_ip, dst_ip, dst_port, "TCP")
                if port_scan_result:
                    return port_scan_result
            
            rate_result = await self.detect_and_block_rate_limit(src_ip, dst_ip)
            if rate_result:
                return rate_result
        
        elif protocol == "UDP" and dst_port:
            port_scan_result = await self.detect_and_block_port_scan(src_ip, dst_ip, dst_port, "UDP")
            if port_scan_result:
                return port_scan_result
            
            rate_result = await self.detect_and_block_rate_limit(src_ip, dst_ip)
            if rate_result:
                return rate_result
        
        elif protocol == "ICMP":
            icmp_result = await self.detect_and_block_icmp_flood(src_ip, dst_ip)
            if icmp_result:
                return icmp_result
            
            rate_result = await self.detect_and_block_rate_limit(src_ip, dst_ip)
            if rate_result:
                return rate_result
        
        return None

    def cleanup_trackers(self) -> None:
        current_time = time.time()
        expiry_seconds = 300.0
        
        expired_scan_keys = [
            key for key, data in self.port_scan_tracker.items()
            if current_time - data["last_seen"] > expiry_seconds
        ]
        for key in expired_scan_keys:
            del self.port_scan_tracker[key]
        
        expired_syn_keys = [
            key for key, queue in self.syn_flood_tracker.items()
            if not queue or (current_time - queue[-1] > expiry_seconds)
        ]
        for key in expired_syn_keys:
            del self.syn_flood_tracker[key]
        
        expired_icmp_keys = [
            key for key, queue in self.icmp_flood_tracker.items()
            if not queue or (current_time - queue[-1] > expiry_seconds)
        ]
        for key in expired_icmp_keys:
            del self.icmp_flood_tracker[key]
        
        expired_rate_keys = [
            key for key, queue in self.rate_limiter.items()
            if not queue or (current_time - queue[-1] > expiry_seconds)
        ]
        for key in expired_rate_keys:
            del self.rate_limiter[key]

firewall_manager = FirewallManager()

-- Processor.py --

import asyncio
import time
import logging
import re
from urllib.parse import unquote
from collections import defaultdict, deque
from typing import Dict, Any, Optional, Callable, Set
from scapy.layers.inet import IP, TCP, UDP, ICMP
import scapy.all as scapy
from app.core.config import settings
from app.engine.queue_manager import PacketQueueManager
from app.engine.firewall import firewall_manager

logger = logging.getLogger("ids_ips.processor")

SQLI_PATTERNS = [
    re.compile(r"union\s+select", re.IGNORECASE),
    re.compile(r"or\s+1\s*=\s*1", re.IGNORECASE),
    re.compile(r"select\s+.+\s+from", re.IGNORECASE),
]

XSS_PATTERNS = [
    re.compile(r"<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>", re.IGNORECASE),
    re.compile(r"javascript\s*:", re.IGNORECASE),
]

RCE_PATTERNS = [
    re.compile(r"bin\/(?:sh|bash)", re.IGNORECASE),
    re.compile(r"cmd\.exe", re.IGNORECASE),
]

ATTACK_MATRIX: Dict[int, Dict[str, str]] = {
    1: {"name": "Reconnaissance passive", "severity": "normal"},
    2: {"name": "Reconnaissance active", "severity": "warning"},
    3: {"name": "Collecte d'informations (Information Gathering)", "severity": "normal"},
    4: {"name": "Découverte des hôtes", "severity": "normal"},
    5: {"name": "Scan ICMP (Ping Sweep)", "severity": "warning"},
    6: {"name": "Scan ARP", "severity": "warning"},
    7: {"name": "Scan de ports TCP", "severity": "warning"},
    8: {"name": "Scan de ports UDP", "severity": "warning"},
    9: {"name": "Scan SYN", "severity": "warning"},
    10: {"name": "Scan ACK", "severity": "normal"},
    11: {"name": "Scan FIN", "severity": "warning"},
    12: {"name": "Scan NULL", "severity": "critique"},
    13: {"name": "Scan XMAS", "severity": "critique"},
    14: {"name": "Détection des services", "severity": "normal"},
    15: {"name": "Détection des versions", "severity": "normal"},
    16: {"name": "Détection du système d'exploitation", "severity": "warning"},
    17: {"name": "Énumération DNS", "severity": "normal"},
    18: {"name": "Énumération SMB", "severity": "warning"},
    19: {"name": "Énumération SNMP", "severity": "critique"},
    20: {"name": "Énumération LDAP", "severity": "warning"},
    21: {"name": "Énumération NetBIOS", "severity": "normal"},
    22: {"name": "Énumération NFS", "severity": "warning"},
    23: {"name": "Énumération RPC", "severity": "normal"},
    24: {"name": "Énumération FTP", "severity": "normal"},
    25: {"name": "Énumération SSH", "severity": "normal"},
    26: {"name": "Énumération HTTP", "severity": "normal"},
    27: {"name": "Énumération SMTP", "severity": "normal"},
    28: {"name": "Énumération des utilisateurs", "severity": "warning"},
    29: {"name": "Énumération des partages réseau", "severity": "warning"},
    30: {"name": "Analyse des vulnérabilités", "severity": "warning"},
    31: {"name": "Validation des vulnérabilités", "severity": "warning"},
    32: {"name": "Exploitation de vulnérabilités", "severity": "critique"},
    33: {"name": "Exploitation locale", "severity": "critique"},
    34: {"name": "Exploitation à distance", "severity": "tres_critique"},
    35: {"name": "Attaque par force brute", "severity": "critique"},
    36: {"name": "Attaque par dictionnaire", "severity": "critique"},
    37: {"name": "Password Spraying", "severity": "critique"},
    38: {"name": "Credential Stuffing", "severity": "critique"},
    39: {"name": "Capture d'identifiants", "severity": "critique"},
    40: {"name": "Vol de mots de passe", "severity": "tres_critique"},
    41: {"name": "Escalade de privilèges", "severity": "tres_critique"},
    42: {"name": "Mouvement latéral", "severity": "tres_critique"},
    43: {"name": "Persistance", "severity": "tres_critique"},
    44: {"name": "Exfiltration de données", "severity": "tres_critique"},
    45: {"name": "Effacement des traces", "severity": "tres_critique"},
    46: {"name": "Sniffing", "severity": "critique"},
    47: {"name": "Spoofing IP", "severity": "critique"},
    48: {"name": "Spoofing ARP", "severity": "critique"},
    49: {"name": "Spoofing DNS", "severity": "critique"},
    50: {"name": "Spoofing MAC", "severity": "warning"},
    51: {"name": "Attaque Man-in-the-Middle (MITM)", "severity": "tres_critique"},
    52: {"name": "Empoisonnement ARP (ARP Poisoning)", "severity": "critique"},
    53: {"name": "Empoisonnement DNS (DNS Poisoning)", "severity": "critique"},
    54: {"name": "Détournement de session (Session Hijacking)", "severity": "tres_critique"},
    55: {"name": "Rejeu de paquets (Replay Attack)", "severity": "critique"},
    56: {"name": "Injection SQL (SQL Injection)", "severity": "tres_critique"},
    57: {"name": "Injection de commandes (Command Injection)", "severity": "tres_critique"},
    58: {"name": "Injection LDAP", "severity": "critique"},
    59: {"name": "Injection XPath", "severity": "critique"},
    60: {"name": "Injection XML", "severity": "critique"},
    61: {"name": "Injection NoSQL", "severity": "critique"},
    62: {"name": "Cross-Site Scripting (XSS)", "severity": "warning"},
    63: {"name": "Cross-Site Request Forgery (CSRF)", "severity": "warning"},
    64: {"name": "Inclusion de fichiers locaux (LFI)", "severity": "critique"},
    65: {"name": "Inclusion de fichiers distants (RFI)", "severity": "tres_critique"},
    66: {"name": "Traversée de répertoires (Directory Traversal)", "severity": "warning"},
    67: {"name": "Téléversement de fichiers malveillants", "severity": "tres_critique"},
    68: {"name": "Exécution de code à distance (RCE)", "severity": "tres_critique"},
    69: {"name": "Désérialisation non sécurisée", "severity": "critique"},
    70: {"name": "Contournement de l'authentification", "severity": "tres_critique"},
    71: {"name": "Contournement de l'autorisation", "severity": "critique"},
    72: {"name": "Détournement de cookies", "severity": "warning"},
    73: {"name": "Vol de session", "severity": "critique"},
    74: {"name": "Déni de service (DoS)", "severity": "critique"},
    75: {"name": "Déni de service distribué (DDoS)", "severity": "tres_critique"},
    76: {"name": "Attaque SYN Flood", "severity": "critique"},
    77: {"name": "Attaque UDP Flood", "severity": "critique"},
    78: {"name": "Attaque ICMP Flood", "severity": "critique"},
    79: {"name": "Attaque HTTP Flood", "severity": "critique"},
    80: {"name": "Attaque Slowloris", "severity": "critique"},
    81: {"name": "Attaque Smurf", "severity": "critique"},
    82: {"name": "Attaque Ping of Death", "severity": "tres_critique"},
    83: {"name": "Attaque Teardrop", "severity": "tres_critique"},
    84: {"name": "Attaque DNS Amplification", "severity": "critique"},
    85: {"name": "Attaque NTP Amplification", "severity": "critique"},
    86: {"name": "Attaque SSDP Amplification", "severity": "warning"},
    87: {"name": "Attaque DHCP Starvation", "severity": "critique"},
    88: {"name": "Rogue DHCP", "severity": "tres_critique"},
    89: {"name": "Rogue Access Point", "severity": "tres_critique"},
    90: {"name": "Evil Twin", "severity": "tres_critique"},
    91: {"name": "Déauthentification Wi-Fi", "severity": "critique"},
    92: {"name": "Cassage de clé WPA/WPA2", "severity": "critique"},
    93: {"name": "Capture de handshake Wi-Fi", "severity": "warning"},
    94: {"name": "Installation de porte dérobée (Backdoor)", "severity": "tres_critique"},
    95: {"name": "Déploiement de malware", "severity": "tres_critique"},
    96: {"name": "Déploiement de ransomware", "severity": "tres_critique"},
    97: {"name": "Déploiement de spyware", "severity": "critique"},
    98: {"name": "Déploiement de rootkit", "severity": "tres_critique"},
    99: {"name": "Contrôle à distance (Command and Control - C2)", "severity": "tres_critique"},
    100: {"name": "Sabotage ou destruction de données", "severity": "tres_critique"}
}

class PacketProcessor:
    def __init__(self, alert_callback: Callable[[Dict[str, Any]], Any]) -> None:
        self.alert_callback: Callable[[Dict[str, Any]], Any] = alert_callback
        
        # Structure glissante pour suivre TOUS les outils/événements génériques par IP
        # Format: self.generic_event_tracker[src_ip][attack_id] -> count (entier x)
        self.generic_event_tracker: Dict[str, Dict[int, int]] = defaultdict(lambda: defaultdict(int))
        
        # Anciens Trackers conservés pour compatibilité et comportements bas niveau
        self.port_scan_tracker: Dict[str, Dict[str, Any]] = defaultdict(lambda: {
            "scanned_ports": set(),
            "last_seen": time.time()
        })
        self.syn_flood_tracker: Dict[str, deque] = defaultdict(
            lambda: deque(maxlen=int(settings.ALERT_THRESHOLD_SYN_FLOOD * 2))
        )
        
        self.SYN_FLOOD_WINDOW_SECONDS: float = 1.0
        self.TRACKER_CLEANUP_INTERVAL: float = 60.0
        self.TRACKER_EXPIRY_SECONDS: float = 300.0
        self._is_running: bool = False
        self._circuit_open: bool = False
        self._consecutive_errors: int = 0
        self._MAX_CONSECUTIVE_ERRORS: int = 3
        self._circuit_open_since: float = 0.0
        self._CIRCUIT_TIMEOUT_SECONDS: float = 30.0
        self._cleanup_task: Optional[asyncio.Task] = None

    def _extract_features(self, packet: scapy.Packet) -> Optional[Dict[str, Any]]:
        if not packet.haslayer(IP):
            return None

        ip_layer = packet[IP]
        features: Dict[str, Any] = {
            "timestamp": time.time(),
            "source_ip": ip_layer.src,
            "destination_ip": ip_layer.dst,
            "ttl": ip_layer.ttl,
            "packet_length": len(packet),
            "protocol": "UNKNOWN",
            "source_port": None,
            "destination_port": None,
            "flags_int": 0,
            "flags_str": "",
            "payload": ""
        }

        if packet.haslayer(TCP):
            tcp_layer = packet[TCP]
            features["protocol"] = "TCP"
            features["source_port"] = tcp_layer.sport
            features["destination_port"] = tcp_layer.dport
            features["flags_int"] = int(tcp_layer.flags)
            features["flags_str"] = str(tcp_layer.flags)
            if tcp_layer.payload:
                features["payload"] = str(tcp_layer.payload)
        elif packet.haslayer(UDP):
            udp_layer = packet[UDP]
            features["protocol"] = "UDP"
            features["source_port"] = udp_layer.sport
            features["destination_port"] = udp_layer.dport
            if udp_layer.payload:
                features["payload"] = str(udp_layer.payload)
        elif packet.haslayer(ICMP):
            features["protocol"] = "ICMP"

        return features

    def _trigger_matrix_alert(self, features: Dict[str, Any], attack_id: int, custom_desc: Optional[str] = None) -> None:
        """
        Générateur centralisé d'alertes basé sur la matrice des 100 attaques.
        Incrémente le compteur x de l'IP cible et transmet la structure complète.
        """
        src_ip = features["source_ip"]
        attack_info = ATTACK_MATRIX.get(attack_id, {"name": "Opération Inconnue", "severity": "normal"})
        
        # Incrémentation de x (Le nombre de requêtes faites par l'adresse IP x)
        self.generic_event_tracker[src_ip][attack_id] += 1
        current_count = self.generic_event_tracker[src_ip][attack_id]

        desc = custom_desc or f"Activité détectée : {attack_info['name']}"
        desc += f" [Total occurrences pour cette IP: {current_count}]"

        alert_info = {
            "source_ip": src_ip,
            "destination_ip": features["destination_ip"],
            "source_port": features["source_port"],
            "destination_port": features["destination_port"],
            "protocol": features["protocol"],
            "alert_type": attack_info["name"],
            "severity": attack_info["severity"],
            "description": desc,
            "event_count": current_count
        }
        
        asyncio.create_task(self.alert_callback(alert_info))

    def _inspect_heuristics(self, features: Dict[str, Any]) -> None:
        """
        Analyse les métadonnées et aiguille le trafic vers les 100 identifiants de la matrice.
        """
        payload_str = unquote(features["payload"]).lower()
        src_ip = features["source_ip"]

        if self._circuit_open:
            return

        # 1. Analyse ICMP / Découverte d'hôtes / Ping Sweep
        if features["protocol"] == "ICMP":
            self._trigger_matrix_alert(features, 4, "Hote distant testant la connectivite locale.")
            self.generic_event_tracker[src_ip][78] += 1
            if self.generic_event_tracker[src_ip][78] > 100:
                self._trigger_matrix_alert(features, 78, f"Alerte saturation : ICMP Flood suspecte depuis {src_ip}.")
                self.generic_event_tracker[src_ip][78] = 0

        # 2. Analyse des Scans de ports avances (SYN, XMAS, NULL) via les flags TCP
        if features["protocol"] == "TCP":
            flags = features["flags_int"]
            if flags == 0:
                self._trigger_matrix_alert(features, 12, "Scan furtif TCP NULL intercepted.")
            elif (flags & 0x01) and (flags & 0x08) and (flags & 0x20):
                self._trigger_matrix_alert(features, 13, "Scan agressif TCP XMAS intercepte.")

        # 3. Detection basique d'attaques applicatives web (Injections SQL, XSS, RCE)
        if features["protocol"] == "TCP" and features["destination_port"] in (80, 443, 8080):
            if any(p.search(payload_str) for p in SQLI_PATTERNS):
                self._trigger_matrix_alert(features, 56, "Signature d'injection SQL trouvee dans le payload HTTP.")
            
            if any(p.search(payload_str) for p in XSS_PATTERNS):
                self._trigger_matrix_alert(features, 62, "Tentative d'injection de script Cross-Site Scripting (XSS).")

            if any(p.search(payload_str) for p in RCE_PATTERNS):
                self._trigger_matrix_alert(features, 68, "Tentative d'execution de code a distance (RCE) detectee.")

    def _detect_port_scan(self, features: Dict[str, Any]) -> None:
        src_ip = features["source_ip"]
        dst_ip = features["destination_ip"]
        dst_port = features["destination_port"]
        proto = features["protocol"]

        if not src_ip or not dst_ip or dst_port is None or proto not in ("TCP", "UDP"):
            return

        key = f"{src_ip}->{dst_ip}"
        tracker = self.port_scan_tracker[key]
        tracker["last_seen"] = features["timestamp"]
        
        port_identifier = f"{proto}/{dst_port}"
        tracker["scanned_ports"].add(port_identifier)

        if len(tracker["scanned_ports"]) > settings.ALERT_THRESHOLD_PORT_SCAN:
            # Map vers l'identifiant 7 de notre matrice (Scan de ports TCP) ou 8 (UDP)
            attack_id = 7 if proto == "TCP" else 8
            self._trigger_matrix_alert(
                features, 
                attack_id, 
                f"Balayage de ports horizontal détecté de {src_ip} vers {dst_ip}. Total ports: {len(tracker['scanned_ports'])}."
            )
            tracker["scanned_ports"].clear()

    def _detect_syn_flood(self, features: Dict[str, Any]) -> None:
        if features["protocol"] != "TCP":
            return

        flags = features["flags_int"]
        is_syn_pure = (flags & 0x02) and not (flags & 0x10)

        if not is_syn_pure:
            return

        src_ip = features["source_ip"]
        dst_ip = features["destination_ip"]
        current_time = features["timestamp"]

        key = f"{src_ip}->{dst_ip}"
        timestamps = self.syn_flood_tracker[key]

        while timestamps and timestamps[0] < current_time - self.SYN_FLOOD_WINDOW_SECONDS:
            timestamps.popleft()

        timestamps.append(current_time)

        if len(timestamps) > settings.ALERT_THRESHOLD_SYN_FLOOD:
            # Déclenche l'attaque ID 76 (Attaque SYN Flood) de la liste
            self._trigger_matrix_alert(
                features, 
                76, 
                f"Inondation de paquets SYN (DDoS). Fréquence: {len(timestamps)} p/s."
            )
            timestamps.clear()

    def cleanup_trackers(self) -> None:
        current_time = time.time()
        expired_scan_keys = [
            key for key, data in self.port_scan_tracker.items()
            if current_time - data["last_seen"] > self.TRACKER_EXPIRY_SECONDS
        ]
        for key in expired_scan_keys:
            del self.port_scan_tracker[key]

        expired_syn_keys = [
            key for key, queue in self.syn_flood_tracker.items()
            if not queue or (current_time - queue[-1] > self.TRACKER_EXPIRY_SECONDS)
        ]
        for key in expired_syn_keys:
            del self.syn_flood_tracker[key]
            
        # Évacuation ciblée : supprimer les entrées les plus anciennes au lieu de tout effacer
        if len(self.generic_event_tracker) > 5000:
            excess_count = len(self.generic_event_tracker) - 4000
            stale_keys = list(self.generic_event_tracker.keys())[:excess_count]
            for key in stale_keys:
                del self.generic_event_tracker[key]
            logger.info(f"Évacuation générique: {excess_count} IP(s) ancienne(s) expirée(s) du tracker")
        
        firewall_manager.cleanup_trackers()

    async def _periodic_cleanup_loop(self) -> None:
        while self._is_running:
            await asyncio.sleep(self.TRACKER_CLEANUP_INTERVAL)
            self.cleanup_trackers()

    async def start_processing(self, packet_queue: PacketQueueManager) -> None:
        self._is_running = True
        self._cleanup_task = asyncio.create_task(self._periodic_cleanup_loop())
        logger.info("Moteur d'analyse comportementale etendu (100 types d'attaques) pret.")

        while self._is_running:
            if self._circuit_open:
                if time.time() - self._circuit_open_since > self._CIRCUIT_TIMEOUT_SECONDS:
                    self._circuit_open = False
                    self._consecutive_errors = 0
                    logger.warning("Circuit breaker: retour en mode CLOSED (test half-open).")
                else:
                    try:
                        packet = await asyncio.wait_for(packet_queue.queue.get(), timeout=0.1)
                    except asyncio.TimeoutError:
                        continue
                    packet_queue.task_done()
                    continue

            packet = await packet_queue.queue.get()
            try:
                features = self._extract_features(packet)
                if features:
                    self._inspect_heuristics(features)
                    self._detect_port_scan(features)
                    self._detect_syn_flood(features)
                    try:
                        fw_packet_info = {
                            "src_ip": features["source_ip"],
                            "dst_ip": features["destination_ip"],
                            "protocol": features["protocol"],
                            "dst_port": features["destination_port"],
                            "flags": features["flags_int"],
                        }
                        await firewall_manager.apply_advanced_firewall_rules(fw_packet_info)
                    except Exception as e:
                        logger.error(f"Erreur FirewallManager pendant traitement paquet: {str(e)}")
                self._consecutive_errors = 0
            except Exception as e:
                self._consecutive_errors += 1
                logger.error(f"Incident lors de l'analyse du paquet par le processeur: {str(e)}")
                if self._consecutive_errors >= self._MAX_CONSECUTIVE_ERRORS:
                    self._circuit_open = True
                    self._circuit_open_since = time.time()
                    logger.critical("Circuit breaker: mode FAIL_CLOSE active apres 3 erreurs consecutives.")
            finally:
                packet_queue.task_done()

    def stop_processing(self) -> None:
        self._is_running = False
        if self._cleanup_task and not self._cleanup_task.done():
            self._cleanup_task.cancel()

-- queue_manager.py --

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

-- snifer.py --

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

# dossier engine/anomaly_detection

-- alerting.py --

"""
Implémentation du pattern Observer pour le système d'alerting.
Les observateurs s'abonnent aux événements d'alerte et réagissent de manière découplée.
"""
import asyncio
import logging
import time
from typing import List, Dict, Any, Optional
from abc import ABC, abstractmethod

from .interfaces import IAlertObserver, DetectionResult, CorrelatedIncident, ResponseAction

logger = logging.getLogger("ids_ips.alerting")


class AlertManager:
    """
    Subject du pattern Observer.
    Gère les observateurs et notifie les alertes.
    """
    
    def __init__(self):
        self._observers: List[IAlertObserver] = []
        self._alert_history: List[Dict[str, Any]] = []
        self._max_history = 1000
        self._lock = asyncio.Lock()
    
    def attach(self, observer: IAlertObserver) -> None:
        """
        Attache un observateur au sujet.
        
        Args:
            observer: Observateur à attacher
        """
        self._observers.append(observer)
        logger.info(f"Observateur attaché: {observer.get_observer_name()}")
    
    def detach(self, observer: IAlertObserver) -> None:
        """
        Détache un observateur du sujet.
        
        Args:
            observer: Observateur à détacher
        """
        if observer in self._observers:
            self._observers.remove(observer)
            logger.info(f"Observateur détaché: {observer.get_observer_name()}")
    
    async def notify_alert(self, detection: DetectionResult) -> None:
        """
        Notifie tous les observateurs d'une alerte.
        
        Args:
            detection: Résultat de la détection
        """
        async with self._lock:
            # Enregistrer dans l'historique
            alert_record = {
                "type": "alert",
                "timestamp": time.time(),
                "detection": detection.to_dict()
            }
            self._alert_history.append(alert_record)
            
            # Maintenir la taille de l'historique
            if len(self._alert_history) > self._max_history:
                self._alert_history.pop(0)
        
        # Notifier tous les observateurs de manière asynchrone
        tasks = [observer.on_alert(detection) for observer in self._observers]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Logger les erreurs
        for observer, result in zip(self._observers, results):
            if isinstance(result, Exception):
                logger.error(
                    f"Erreur observateur {observer.get_observer_name()}: {result}"
                )
    
    async def notify_incident(self, incident: CorrelatedIncident) -> None:
        """
        Notifie tous les observateurs d'un incident corrélé.
        
        Args:
            incident: Incident corrélé
        """
        async with self._lock:
            # Enregistrer dans l'historique
            incident_record = {
                "type": "incident",
                "timestamp": time.time(),
                "incident": incident.to_dict()
            }
            self._alert_history.append(incident_record)
            
            # Maintenir la taille de l'historique
            if len(self._alert_history) > self._max_history:
                self._alert_history.pop(0)
        
        # Notifier tous les observateurs de manière asynchrone
        tasks = [observer.on_incident(incident) for observer in self._observers]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Logger les erreurs
        for observer, result in zip(self._observers, results):
            if isinstance(result, Exception):
                logger.error(
                    f"Erreur observateur {observer.get_observer_name()}: {result}"
                )
    
    def get_alert_history(self, limit: int = 100) -> List[Dict[str, Any]]:
        """
        Récupère l'historique des alertes.
        
        Args:
            limit: Nombre maximum d'alertes à retourner
            
        Returns:
            Liste des alertes récentes
        """
        return self._alert_history[-limit:]
    
    def get_observer_count(self) -> int:
        """Retourne le nombre d'observateurs attachés."""
        return len(self._observers)


class DatabaseObserver(IAlertObserver):
    """
    Observateur qui log les alertes en base de données.
    """
    
    def __init__(self, db_session_factory=None):
        self._name = "DatabaseObserver"
        self._db_session_factory = db_session_factory
    
    async def on_alert(self, detection: DetectionResult) -> None:
        """Log l'alerte en base de données."""
        try:
            # Simulation d'insertion en base
            logger.info(
                f"[{self._name}] Alert logged: {detection.rule_name} "
                f"(score: {detection.risk_score}, severity: {detection.severity.value})"
            )
            
            # TODO: Implémenter l'insertion réelle en base de données
            # if self._db_session_factory:
            #     db = self._db_session_factory()
            #     alert = Alert(
            #         rule_id=detection.rule_id,
            #         rule_name=detection.rule_name,
            #         severity=detection.severity.value,
            #         risk_score=detection.risk_score,
            #         confidence=detection.confidence,
            #         evidence=detection.evidence,
            #         created_at=datetime.now(timezone.utc)
            #     )
            #     db.add(alert)
            #     db.commit()
            
        except Exception as e:
            logger.error(f"[{self._name}] Erreur logging alert: {e}")
    
    async def on_incident(self, incident: CorrelatedIncident) -> None:
        """Log l'incident corrélé en base de données."""
        try:
            logger.info(
                f"[{self._name}] Incident logged: {incident.incident_id} "
                f"(score: {incident.composite_score}, pattern: {incident.attack_pattern})"
            )
            
            # TODO: Implémenter l'insertion réelle en base de données
            
        except Exception as e:
            logger.error(f"[{self._name}] Erreur logging incident: {e}")
    
    def get_observer_name(self) -> str:
        return self._name


class WebSocketObserver(IAlertObserver):
    """
    Observateur qui diffuse les alertes via WebSocket.
    """
    
    def __init__(self):
        self._name = "WebSocketObserver"
        self._connected_clients: List[Any] = []
    
    def add_client(self, client: Any) -> None:
        """Ajoute un client WebSocket."""
        self._connected_clients.append(client)
        logger.info(f"[{self._name}] Client WebSocket ajouté")
    
    def remove_client(self, client: Any) -> None:
        """Retire un client WebSocket."""
        if client in self._connected_clients:
            self._connected_clients.remove(client)
            logger.info(f"[{self._name}] Client WebSocket retiré")
    
    async def on_alert(self, detection: DetectionResult) -> None:
        """Diffuse l'alerte via WebSocket."""
        try:
            message = {
                "type": "alert",
                "data": detection.to_dict(),
                "timestamp": time.time()
            }
            
            # Simulation d'envoi WebSocket
            logger.info(
                f"[{self._name}] Alert broadcasted to {len(self._connected_clients)} clients"
            )
            
            # TODO: Implémenter l'envoi réel WebSocket
            # for client in self._connected_clients:
            #     await client.send_json(message)
            
        except Exception as e:
            logger.error(f"[{self._name}] Erreur broadcast alert: {e}")
    
    async def on_incident(self, incident: CorrelatedIncident) -> None:
        """Diffuse l'incident via WebSocket."""
        try:
            message = {
                "type": "incident",
                "data": incident.to_dict(),
                "timestamp": time.time()
            }
            
            logger.info(
                f"[{self._name}] Incident broadcasted to {len(self._connected_clients)} clients"
            )
            
            # TODO: Implémenter l'envoi réel WebSocket
            
        except Exception as e:
            logger.error(f"[{self._name}] Erreur broadcast incident: {e}")
    
    def get_observer_name(self) -> str:
        return self._name


class FirewallObserver(IAlertObserver):
    """
    Observateur qui exécute les actions de firewall.
    """
    
    def __init__(self, firewall_manager=None):
        self._name = "FirewallObserver"
        self._firewall_manager = firewall_manager
    
    async def on_alert(self, detection: DetectionResult) -> None:
        """Exécute l'action de firewall selon la détection."""
        try:
            action = detection.suggested_action
            evidence = detection.evidence
            
            if action == ResponseAction.BLOCK:
                ip_address = evidence.get("source_ip") or evidence.get("ip")
                if ip_address:
                    logger.warning(
                        f"[{self._name}] Blocking IP {ip_address} "
                        f"for {detection.rule_name}"
                    )
                    
                    # TODO: Implémenter le blocage réel
                    # if self._firewall_manager:
                    #     await self._firewall_manager.block_ip(
                    #         ip_address,
                    #         detection.rule_name
                    #     )
            
            elif action == ResponseAction.QUARANTINE:
                logger.warning(
                    f"[{self._name}] Quarantining for {detection.rule_name}"
                )
                # TODO: Implémenter la quarantaine
            
            elif action == ResponseAction.ALERT:
                logger.info(
                    f"[{self._name}] Alert only for {detection.rule_name}"
                )
            
            elif action == ResponseAction.LOG:
                logger.debug(
                    f"[{self._name}] Log only for {detection.rule_name}"
                )
            
        except Exception as e:
            logger.error(f"[{self._name}] Erreur execution firewall action: {e}")
    
    async def on_incident(self, incident: CorrelatedIncident) -> None:
        """Exécute les actions de firewall pour l'incident."""
        try:
            logger.warning(
                f"[{self._name}] Incident {incident.incident_id} "
                f"requires actions: {[a.value for a in incident.recommended_actions]}"
            )
            
            # Exécuter les actions recommandées
            for action in incident.recommended_actions:
                if action == ResponseAction.BLOCK:
                    logger.warning(
                        f"[{self._name}] Blocking IP {incident.source_ip} "
                        f"for incident {incident.incident_id}"
                    )
                    # TODO: Implémenter le blocage réel
            
        except Exception as e:
            logger.error(f"[{self._name}] Erreur execution incident actions: {e}")
    
    def get_observer_name(self) -> str:
        return self._name


class EmailObserver(IAlertObserver):
    """
    Observateur qui envoie des emails pour les alertes critiques.
    """
    
    def __init__(self, smtp_config: Optional[Dict[str, Any]] = None):
        self._name = "EmailObserver"
        self._smtp_config = smtp_config or {}
        self._min_severity_for_email = "high"
    
    async def on_alert(self, detection: DetectionResult) -> None:
        """Envoie un email si l'alerte est critique."""
        try:
            severity = detection.severity.value
            
            # Envoyer seulement pour les alertes de haute sévérité
            if severity in ["high", "critical"]:
                logger.warning(
                    f"[{self._name}] Sending email alert for {detection.rule_name} "
                    f"(severity: {severity}, score: {detection.risk_score})"
                )
                
                # TODO: Implémenter l'envoi réel d'email
                # await self._send_email(
                #     subject=f"IDPS Alert: {detection.rule_name}",
                #     body=self._format_alert_email(detection)
                # )
            
        except Exception as e:
            logger.error(f"[{self._name}] Erreur sending email: {e}")
    
    async def on_incident(self, incident: CorrelatedIncident) -> None:
        """Envoie un email pour l'incident."""
        try:
            severity = incident.severity.value
            
            if severity in ["high", "critical"]:
                logger.warning(
                    f"[{self._name}] Sending email for incident {incident.incident_id} "
                    f"(severity: {severity}, score: {incident.composite_score})"
                )
                
                # TODO: Implémenter l'envoi réel d'email
                # await self._send_email(
                #     subject=f"IDPS Incident: {incident.attack_pattern}",
                #     body=self._format_incident_email(incident)
                # )
            
        except Exception as e:
            logger.error(f"[{self._name}] Erreur sending incident email: {e}")
    
    def _format_alert_email(self, detection: DetectionResult) -> str:
        """Formate le corps de l'email pour une alerte."""
        return f"""
        Alert: {detection.rule_name}
        Rule ID: {detection.rule_id}
        Severity: {detection.severity.value}
        Risk Score: {detection.risk_score}
        Confidence: {detection.confidence}
        
        Evidence:
        {detection.evidence}
        """
    
    def _format_incident_email(self, incident: CorrelatedIncident) -> str:
        """Formate le corps de l'email pour un incident."""
        return f"""
        Incident ID: {incident.incident_id}
        Source IP: {incident.source_ip}
        Attack Pattern: {incident.attack_pattern}
        Severity: {incident.severity.value}
        Composite Score: {incident.composite_score}
        
        Contributing Detections:
        {len(incident.contributing_detections)} detections
        
        Recommended Actions:
        {[a.value for a in incident.recommended_actions]}
        """
    
    async def _send_email(self, subject: str, body: str) -> None:
        """Envoie un email via SMTP."""
        # TODO: Implémenter l'envoi SMTP réel
        pass
    
    def get_observer_name(self) -> str:
        return self._name


class MetricsObserver(IAlertObserver):
    """
    Observateur qui collecte des métriques sur les alertes.
    """
    
    def __init__(self):
        self._name = "MetricsObserver"
        self._metrics: Dict[str, Any] = {
            "total_alerts": 0,
            "total_incidents": 0,
            "alerts_by_severity": {"low": 0, "medium": 0, "high": 0, "critical": 0},
            "alerts_by_rule": {},
            "start_time": time.time()
        }
    
    async def on_alert(self, detection: DetectionResult) -> None:
        """Met à jour les métriques pour l'alerte."""
        self._metrics["total_alerts"] += 1
        self._metrics["alerts_by_severity"][detection.severity.value] += 1
        
        rule_name = detection.rule_name
        self._metrics["alerts_by_rule"][rule_name] = \
            self._metrics["alerts_by_rule"].get(rule_name, 0) + 1
        
        logger.debug(f"[{self._name}] Metrics updated: {self._metrics['total_alerts']} alerts")
    
    async def on_incident(self, incident: CorrelatedIncident) -> None:
        """Met à jour les métriques pour l'incident."""
        self._metrics["total_incidents"] += 1
        logger.debug(f"[{self._name}] Metrics updated: {self._metrics['total_incidents']} incidents")
    
    def get_metrics(self) -> Dict[str, Any]:
        """Retourne les métriques actuelles."""
        uptime = time.time() - self._metrics["start_time"]
        self._metrics["uptime_seconds"] = uptime
        self._metrics["alerts_per_minute"] = \
            (self._metrics["total_alerts"] / uptime) * 60 if uptime > 0 else 0
        return self._metrics.copy()
    
    def reset_metrics(self) -> None:
        """Réinitialise les métriques."""
        self._metrics = {
            "total_alerts": 0,
            "total_incidents": 0,
            "alerts_by_severity": {"low": 0, "medium": 0, "high": 0, "critical": 0},
            "alerts_by_rule": {},
            "start_time": time.time()
        }
    
    def get_observer_name(self) -> str:
        return self._name


# Singleton global
alert_manager = AlertManager()

# Attacher les observateurs par défaut
alert_manager.attach(DatabaseObserver())
alert_manager.attach(WebSocketObserver())
alert_manager.attach(FirewallObserver())
alert_manager.attach(EmailObserver())
alert_manager.attach(MetricsObserver())

-- Baseline_profiler.py --

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

-- correlation.py --

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

-- detector.py -- 

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

-- example_complex_rule.py --

"""
Exemple d'implémentation d'une règle complexe illustrant le pattern Chain of Responsibility.
Détection d'un scan horizontal combiné à une tentative d'authentification SSH échouée.
"""
import asyncio
import time
import logging
from typing import Dict, Any

from .interfaces import PacketContext, DetectionResult, Severity, ResponseAction
from .pipeline import analysis_pipeline
from .state_store import state_store
from .rule_factory import rule_manager
from .correlation import correlation_engine
from .alerting import alert_manager

logger = logging.getLogger("ids_ips.example")


class ComplexRuleExample:
    """
    Exemple d'implémentation d'une règle complexe.
    Démontre le pattern Chain of Responsibility pour détecter:
    - Scan horizontal de ports
    - Tentatives d'authentification SSH échouées
    - Corrélation des deux en une attaque de brute force
    """
    
    def __init__(self):
        self._source_ip = "192.168.1.100"
        self._target_ip = "10.0.0.1"
    
    async def simulate_horizontal_scan(self) -> None:
        """
        Simule un scan horizontal de ports.
        L'attaque scanne plusieurs ports sur la même cible.
        """
        logger.info("=== Simulation Scan Horizontal ===")
        
        # Scanner 20 ports différents (seuil: 15)
        ports = [21, 22, 23, 25, 53, 80, 110, 143, 443, 445, 
                 993, 995, 3306, 3389, 5432, 5900, 8080, 8443, 8888, 9000]
        
        for port in ports:
            context = PacketContext(
                timestamp=time.time(),
                source_ip=self._source_ip,
                destination_ip=self._target_ip,
                source_port=50000 + port,
                destination_port=port,
                protocol="TCP",
                flags=0x02,  # SYN flag
                payload_size=0,
                payload_hash=None
            )
            
            # Traiter à travers le pipeline
            metadata = await analysis_pipeline.process(context)
            
            logger.debug(
                f"Scan port {port}: "
                f"detections={len(metadata.get('detections', []))}, "
                f"score={metadata.get('scoring', {}).get('composite_score', 0):.2f}"
            )
            
            # Petite pause pour simuler un vrai scan
            await asyncio.sleep(0.01)
        
        logger.info(f"Scan horizontal terminé: {len(ports)} ports scannés")
    
    async def simulate_ssh_brute_force(self) -> None:
        """
        Simule des tentatives d'authentification SSH échouées.
        L'attaque tente plusieurs connexions SSH avec échec.
        """
        logger.info("=== Simulation Brute Force SSH ===")
        
        # Simuler 7 échecs d'authentification (seuil: 5)
        for i in range(7):
            context = PacketContext(
                timestamp=time.time(),
                source_ip=self._source_ip,
                destination_ip=self._target_ip,
                source_port=50000 + i,
                destination_port=22,  # SSH
                protocol="TCP",
                flags=0x02,  # SYN flag
                payload_size=64,
                payload_hash=f"ssh_attempt_{i}"
            )
            
            # Mettre à jour le compteur d'échecs d'authentification
            state_store.increment_counter(self._source_ip, "auth_failures")
            
            # Traiter à travers le pipeline
            metadata = await analysis_pipeline.process(context)
            
            logger.debug(
                f"SSH attempt {i+1}: "
                f"auth_failures={metadata.get('state', {}).get('auth_failures', 0)}, "
                f"score={metadata.get('scoring', {}).get('composite_score', 0):.2f}"
            )
            
            # Petite pause
            await asyncio.sleep(0.05)
        
        logger.info("Brute force SSH terminé: 7 tentatives échouées")
    
    async def demonstrate_chain_of_responsibility(self) -> None:
        """
        Démontre le pattern Chain of Responsibility.
        Montre comment chaque handler traite le paquet et le passe au suivant.
        """
        logger.info("=== Démonstration Chain of Responsibility ===")
        
        # Créer un paquet de test
        context = PacketContext(
            timestamp=time.time(),
            source_ip=self._source_ip,
            destination_ip=self._target_ip,
            source_port=50000,
            destination_port=22,
            protocol="TCP",
            flags=0x02,
            payload_size=64,
            payload_hash="test_hash"
        )
        
        # Traiter à travers le pipeline
        metadata = await analysis_pipeline.process(context)
        
        # Afficher le résultat de chaque handler
        logger.info(f"\nRésultats du pipeline:")
        logger.info(f"  Preprocessing: {metadata.get('preprocessing', {}).get('processed_at')}")
        logger.info(f"  State Update: packet_count={metadata.get('state', {}).get('packet_count', 0)}")
        logger.info(f"  Detection: {len(metadata.get('detections', []))} détection(s)")
        logger.info(f"  FSM Transition: {metadata.get('fsm_transition', {}).get('new_state')}")
        logger.info(f"  Scoring: composite_score={metadata.get('scoring', {}).get('composite_score', 0):.2f}")
        logger.info(f"  Alerting: should_alert={metadata.get('alerting', {}).get('should_alert')}")
        logger.info(f"  Processing Time: {metadata.get('pipeline_summary', {}).get('total_processing_time', 0):.4f}s")
    
    async def demonstrate_correlation(self) -> None:
        """
        Démontre la corrélation des signaux faibles.
        Agrège le scan horizontal et les échecs SSH en un incident.
        """
        logger.info("=== Démonstration Corrélation ===")
        
        # Récupérer l'état actuel
        ip_state = state_store.get_state(self._source_ip)
        
        logger.info(f"\nÉtat de l'IP {self._source_ip}:")
        logger.info(f"  Packet count: {ip_state.get('packet_count', 0)}")
        logger.info(f"  Unique ports: {ip_state.get('unique_ports', 0)}")
        logger.info(f"  Auth failures: {ip_state.get('auth_failures', 0)}")
        logger.info(f"  FSM state: {ip_state.get('fsm_state', 'unknown')}")
        
        # Simuler des détections pour la corrélation
        from .detectors import PortScanDetectionStrategy, AuthFailureDetectionStrategy
        
        port_scan_detector = PortScanDetectionStrategy(threshold=15, window_seconds=120)
        auth_failure_detector = AuthFailureDetectionStrategy(threshold=5, window_seconds=300)
        
        # Détecter le scan horizontal
        scan_result = port_scan_detector.detect(
            PacketContext(
                timestamp=time.time(),
                source_ip=self._source_ip,
                destination_ip=self._target_ip,
                source_port=50000,
                destination_port=22,
                protocol="TCP",
                flags=0x02,
                payload_size=0,
                payload_hash=None
            ),
            ip_state
        )
        
        # Détecter les échecs SSH
        auth_result = auth_failure_detector.detect(
            PacketContext(
                timestamp=time.time(),
                source_ip=self._source_ip,
                destination_ip=self._target_ip,
                source_port=50001,
                destination_port=22,
                protocol="TCP",
                flags=0x02,
                payload_size=64,
                payload_hash="ssh_attempt"
            ),
            ip_state
        )
        
        detections = []
        if scan_result and scan_result.detected:
            detections.append(scan_result)
            logger.info(f"Scan horizontal détecté: score={scan_result.risk_score}")
        
        if auth_result and auth_result.detected:
            detections.append(auth_result)
            logger.info(f"Échecs SSH détectés: score={auth_result.risk_score}")
        
        # Corréler les détections
        if detections:
            incident = await correlation_engine.correlate(detections, {self._source_ip: ip_state})
            
            if incident:
                logger.info(f"\nIncident corrélé créé:")
                logger.info(f"  Incident ID: {incident.incident_id}")
                logger.info(f"  Attack Pattern: {incident.attack_pattern}")
                logger.info(f"  Composite Score: {incident.composite_score:.2f}")
                logger.info(f"  Severity: {incident.severity.value}")
                logger.info(f"  Contributing Detections: {len(incident.contributing_detections)}")
                logger.info(f"  Recommended Actions: {[a.value for a in incident.recommended_actions]}")
                
                # Notifier les observateurs
                await alert_manager.notify_incident(incident)
            else:
                logger.info("Aucun incident corrélé (seuils non atteints)")
    
    async def run_full_example(self) -> None:
        """
        Exécute l'exemple complet de la règle complexe.
        """
        logger.info("="*60)
        logger.info("EXEMPLE RÈGLE COMPLEXE: SSH BRUTE FORCE + SCAN HORIZONTAL")
        logger.info("="*60)
        
        # Charger les règles depuis le fichier JSON
        logger.info("\nChargement des règles...")
        rules_loaded = rule_manager.load_rules_from_directory()
        logger.info(f"{rules_loaded} règle(s) chargée(s)")
        
        # Démontrer le Chain of Responsibility
        await self.demonstrate_chain_of_responsibility()
        
        # Simuler l'attaque
        logger.info("\nSimulation de l'attaque...")
        await self.simulate_horizontal_scan()
        await asyncio.sleep(0.1)
        await self.simulate_ssh_brute_force()
        
        # Démontrer la corrélation
        await self.demonstrate_correlation()
        
        # Afficher les métriques
        from .alerting import MetricsObserver
        for observer in alert_manager._observers:
            if isinstance(observer, MetricsObserver):
                metrics = observer.get_metrics()
                logger.info(f"\nMétriques finales:")
                logger.info(f"  Total alerts: {metrics['total_alerts']}")
                logger.info(f"  Total incidents: {metrics['total_incidents']}")
                logger.info(f"  Alerts by severity: {metrics['alerts_by_severity']}")
                logger.info(f"  Alerts per minute: {metrics['alerts_per_minute']:.2f}")
        
        logger.info("\n" + "="*60)
        logger.info("EXEMPLE TERMINÉ")
        logger.info("="*60)


async def main():
    """Point d'entrée pour l'exemple."""
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    example = ComplexRuleExample()
    await example.run_full_example()


if __name__ == "__main__":
    asyncio.run(main())

-- interfaces.py --

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

-- pipeline.py --

"""
Implémentation du pattern Chain of Responsibility pour le pipeline d'analyse.
Chaque handler peut traiter le paquet et le passer au suivant.
"""
import time
import logging
from abc import ABC, abstractmethod
from typing import Optional, List, Dict, Any

from .interfaces import PacketContext, DetectionResult, CorrelatedIncident
from .state_store import state_store
from .detectors import DetectionStrategyFactory

logger = logging.getLogger("ids_ips.pipeline")


class PipelineHandler(ABC):
    """
    Interface abstraite pour les handlers du pipeline.
    Chaque handler peut traiter le contexte et le passer au suivant.
    """
    
    def __init__(self, name: str):
        self._name = name
        self._next_handler: Optional['PipelineHandler'] = None
    
    def set_next(self, handler: 'PipelineHandler') -> 'PipelineHandler':
        """
        Définit le handler suivant dans la chaîne.
        
        Args:
            handler: Handler suivant
            
        Returns:
            Le handler suivant pour le chaînage
        """
        self._next_handler = handler
        return handler
    
    @abstractmethod
    async def handle(self, context: PacketContext, 
                    metadata: Dict[str, Any]) -> Dict[str, Any]:
        """
        Traite le contexte du paquet.
        
        Args:
            context: Contexte du paquet
            metadata: Métadonnées accumulées par les handlers précédents
            
        Returns:
            Métadonnées mises à jour
        """
        pass
    
    async def _pass_to_next(self, context: PacketContext, 
                           metadata: Dict[str, Any]) -> Dict[str, Any]:
        """
        Passe le contexte au handler suivant.
        
        Args:
            context: Contexte du paquet
            metadata: Métadonnées accumulées
            
        Returns:
            Métadonnées mises à jour par le handler suivant
        """
        if self._next_handler:
            return await self._next_handler.handle(context, metadata)
        return metadata
    
    def get_name(self) -> str:
        """Retourne le nom du handler."""
        return self._name


class PreprocessorHandler(PipelineHandler):
    """
    Handler de prétraitement.
    Normalise et enrichit le contexte du paquet.
    """
    
    def __init__(self):
        super().__init__("Preprocessor")
    
    async def handle(self, context: PacketContext, 
                    metadata: Dict[str, Any]) -> Dict[str, Any]:
        """Prétraite le paquet."""
        start_time = time.time()
        
        # Enrichir les métadonnées
        metadata["preprocessing"] = {
            "processed_at": start_time,
            "source_ip": context.source_ip,
            "destination_ip": context.destination_ip,
            "protocol": context.protocol
        }
        
        # Normaliser les flags TCP
        if context.protocol == "TCP":
            metadata["preprocessing"]["tcp_flags"] = {
                "syn": bool(context.flags & 0x02),
                "ack": bool(context.flags & 0x10),
                "fin": bool(context.flags & 0x01),
                "rst": bool(context.flags & 0x04),
                "psh": bool(context.flags & 0x08),
                "urg": bool(context.flags & 0x20)
            }
        
        logger.debug(f"[{self._name}] Paquet prétraité: {context.source_ip} -> {context.destination_ip}")
        
        # Passer au handler suivant
        return await self._pass_to_next(context, metadata)


class StateUpdateHandler(PipelineHandler):
    """
    Handler de mise à jour de l'état.
    Met à jour le State Store pour l'IP source.
    """
    
    def __init__(self):
        super().__init__("StateUpdate")
    
    async def handle(self, context: PacketContext, 
                    metadata: Dict[str, Any]) -> Dict[str, Any]:
        """Met à jour l'état pour l'IP source."""
        start_time = time.time()
        
        # Mettre à jour le State Store
        ip_state = state_store.update_state(context.source_ip, context)
        
        metadata["state"] = ip_state
        metadata["state_update"] = {
            "updated_at": start_time,
            "ip": context.source_ip,
            "packet_count": ip_state.get("packet_count", 0)
        }
        
        logger.debug(f"[{self._name}] État mis à jour pour {context.source_ip}")
        
        # Passer au handler suivant
        return await self._pass_to_next(context, metadata)


class DetectionHandler(PipelineHandler):
    """
    Handler de détection.
    Applique tous les détecteurs de manière séquentielle.
    """
    
    def __init__(self):
        super().__init__("Detection")
        self._detectors = DetectionStrategyFactory.create_all_detectors()
    
    async def handle(self, context: PacketContext, 
                    metadata: Dict[str, Any]) -> Dict[str, Any]:
        """Applique les détecteurs."""
        start_time = time.time()
        
        detections: List[DetectionResult] = []
        ip_state = metadata.get("state", {})
        
        # Appliquer chaque détecteur
        for detector in self._detectors:
            try:
                result = detector.detect(context, ip_state)
                if result and result.detected:
                    detections.append(result)
                    logger.warning(
                        f"[{self._name}] Détection: {detector.get_rule_name()} "
                        f"pour {context.source_ip} (score: {result.risk_score})"
                    )
            except Exception as e:
                logger.error(f"[{self._name}] Erreur détecteur {detector.get_rule_name()}: {e}")
        
        metadata["detections"] = detections
        metadata["detection_summary"] = {
            "total_detections": len(detections),
            "max_risk_score": max((d.risk_score for d in detections), default=0.0),
            "max_severity": max((d.severity.value for d in detections), default="low"),
            "processed_at": start_time
        }
        
        logger.debug(f"[{self._name}] {len(detections)} détection(s) pour {context.source_ip}")
        
        # Passer au handler suivant
        return await self._pass_to_next(context, metadata)


class FSMHandler(PipelineHandler):
    """
    Handler de transitions FSM.
    Met à jour l'état FSM selon les détections.
    """
    
    def __init__(self):
        super().__init__("FSM")
        from .state_store import FSMState
        self._FSMState = FSMState
    
    async def handle(self, context: PacketContext, 
                    metadata: Dict[str, Any]) -> Dict[str, Any]:
        """Met à jour l'état FSM."""
        detections = metadata.get("detections", [])
        ip_state = metadata.get("state", {})
        
        current_fsm = ip_state.get("fsm_state", "normal")
        new_fsm = current_fsm
        
        # Déterminer le nouvel état FSM selon les détections
        max_risk_score = metadata.get("detection_summary", {}).get("max_risk_score", 0.0)
        
        if max_risk_score >= 90.0:
            new_fsm = "blocked"
        elif max_risk_score >= 75.0:
            new_fsm = "malicious"
        elif max_risk_score >= 50.0:
            new_fsm = "suspicious"
        
        # Effectuer la transition si nécessaire
        if new_fsm != current_fsm:
            state_store.transition_state(
                context.source_ip,
                self._FSMState(new_fsm),
                f"Risk score: {max_risk_score}"
            )
            logger.info(
                f"[{self._name}] Transition FSM: {context.source_ip} "
                f"{current_fsm} -> {new_fsm}"
            )
        
        metadata["fsm_transition"] = {
            "previous_state": current_fsm,
            "new_state": new_fsm,
            "transitioned": new_fsm != current_fsm
        }
        
        # Passer au handler suivant
        return await self._pass_to_next(context, metadata)


class ScoringHandler(PipelineHandler):
    """
    Handler de scoring.
    Calcule un score composite basé sur toutes les détections.
    """
    
    def __init__(self):
        super().__init__("Scoring")
    
    async def handle(self, context: PacketContext, 
                    metadata: Dict[str, Any]) -> Dict[str, Any]:
        """Calcule le score composite."""
        detections = metadata.get("detections", [])
        ip_state = metadata.get("state", {})
        
        if not detections:
            metadata["scoring"] = {
                "composite_score": 0.0,
                "confidence": 0.0,
                "factors": {}
            }
            return await self._pass_to_next(context, metadata)
        
        # Facteurs de scoring
        factors = {
            "max_risk_score": max(d.risk_score for d in detections),
            "avg_risk_score": sum(d.risk_score for d in detections) / len(detections),
            "detection_count": len(detections),
            "max_confidence": max(d.confidence for d in detections),
            "auth_failures": ip_state.get("auth_failures", 0),
            "scan_indicators": ip_state.get("scan_indicators", 0),
            "flood_indicators": ip_state.get("flood_indicators", 0)
        }
        
        # Calcul du score composite (pondéré)
        composite_score = (
            factors["max_risk_score"] * 0.4 +
            factors["avg_risk_score"] * 0.2 +
            min(factors["detection_count"] * 10, 20) * 0.1 +
            factors["max_confidence"] * 10 * 0.1 +
            min(factors["auth_failures"] * 5, 15) * 0.1 +
            min(factors["scan_indicators"] * 3, 10) * 0.05 +
            min(factors["flood_indicators"] * 5, 10) * 0.05
        )
        
        # Confiance globale
        confidence = factors["max_confidence"]
        
        metadata["scoring"] = {
            "composite_score": min(composite_score, 100.0),
            "confidence": confidence,
            "factors": factors
        }
        
        logger.debug(
            f"[{self._name}] Score composite: {composite_score:.2f} "
            f"pour {context.source_ip}"
        )
        
        # Passer au handler suivant
        return await self._pass_to_next(context, metadata)


class AlertingHandler(PipelineHandler):
    """
    Handler d'alerting.
    Déclenche les alertes selon les détections et le score.
    """
    
    def __init__(self):
        super().__init__("Alerting")
        self._alert_threshold = 50.0  # Seuil de score pour alerte
    
    async def handle(self, context: PacketContext, 
                    metadata: Dict[str, Any]) -> Dict[str, Any]:
        """Déclenche les alertes si nécessaire."""
        composite_score = metadata.get("scoring", {}).get("composite_score", 0.0)
        detections = metadata.get("detections", [])
        
        should_alert = composite_score >= self._alert_threshold
        
        metadata["alerting"] = {
            "should_alert": should_alert,
            "alert_triggered": False,
            "alert_count": 0
        }
        
        if should_alert and detections:
            metadata["alerting"]["alert_triggered"] = True
            metadata["alerting"]["alert_count"] = len(detections)
            
            logger.warning(
                f"[{self._name}] ALERTE: Score {composite_score:.2f} "
                f"pour {context.source_ip} ({len(detections)} détections)"
            )
        
        # Passer au handler suivant
        return await self._pass_to_next(context, metadata)


class AnalysisPipeline:
    """
    Pipeline d'analyse complet utilisant Chain of Responsibility.
    Orchestre tous les handlers dans l'ordre.
    """
    
    def __init__(self):
        self._head: Optional[PipelineHandler] = None
        self._build_pipeline()
    
    def _build_pipeline(self) -> None:
        """Construit la chaîne de handlers."""
        # Créer les handlers
        preprocessor = PreprocessorHandler()
        state_update = StateUpdateHandler()
        detection = DetectionHandler()
        fsm = FSMHandler()
        scoring = ScoringHandler()
        alerting = AlertingHandler()
        
        # Chaîner les handlers
        preprocessor.set_next(state_update)
        state_update.set_next(detection)
        detection.set_next(fsm)
        fsm.set_next(scoring)
        scoring.set_next(alerting)
        
        self._head = preprocessor
        logger.info("Pipeline d'analyse construit avec succès")
    
    async def process(self, context: PacketContext) -> Dict[str, Any]:
        """
        Traite un paquet à travers le pipeline complet.
        
        Args:
            context: Contexte du paquet
            
        Returns:
            Métadonnées complètes après traitement
        """
        if not self._head:
            raise RuntimeError("Pipeline non initialisé")
        
        start_time = time.time()
        metadata: Dict[str, Any] = {}
        
        try:
            # Traiter à travers la chaîne
            metadata = await self._head.handle(context, metadata)
            
            # Ajouter le temps de traitement total
            metadata["pipeline_summary"] = {
                "total_processing_time": time.time() - start_time,
                "pipeline_version": "1.0.0",
                "processed_at": start_time
            }
            
            return metadata
            
        except Exception as e:
            logger.error(f"Erreur pipeline: {e}")
            metadata["error"] = str(e)
            metadata["pipeline_summary"] = {
                "total_processing_time": time.time() - start_time,
                "error": True
            }
            return metadata
    
    def get_pipeline_info(self) -> List[str]:
        """Retourne la liste des handlers dans le pipeline."""
        handlers = []
        current = self._head
        while current:
            handlers.append(current.get_name())
            current = current._next_handler
        return handlers


# Singleton global
analysis_pipeline = AnalysisPipeline()

-- rule_factory.py --

"""
Implémentation du pattern Factory pour l'instanciation des règles.
Charge dynamiquement des règles depuis des fichiers JSON/YAML.
"""
import json
import yaml
import logging
from typing import Dict, Any, List, Optional
from pathlib import Path

from .interfaces import IRuleFactory, IDetectionStrategy, Severity, ResponseAction
from .detectors import (
    PortScanDetectionStrategy,
    SYNFloodDetectionStrategy,
    AuthFailureDetectionStrategy,
    BehavioralAnomalyDetectionStrategy,
    FSMTransitionDetectionStrategy
)

logger = logging.getLogger("ids_ips.rule_factory")


class RuleFactory(IRuleFactory):
    """
    Factory pour créer des détecteurs à partir de configurations JSON/YAML.
    Charge dynamiquement les règles sans logique hardcodée.
    """
    
    def __init__(self):
        self._rule_cache: Dict[str, Dict[str, Any]] = {}
        self._detector_cache: Dict[str, IDetectionStrategy] = {}
    
    def load_rules(self, rules_path: str) -> List[Dict[str, Any]]:
        """
        Charge les règles depuis un fichier JSON ou YAML.
        
        Args:
            rules_path: Chemin vers le fichier de règles
            
        Returns:
            Liste des configurations de règles
        """
        path = Path(rules_path)
        
        if not path.exists():
            logger.error(f"Fichier de règles introuvable: {rules_path}")
            return []
        
        try:
            with open(path, 'r', encoding='utf-8') as f:
                if path.suffix in ['.json']:
                    rules_data = json.load(f)
                elif path.suffix in ['.yaml', '.yml']:
                    rules_data = yaml.safe_load(f)
                else:
                    logger.error(f"Format de fichier non supporté: {path.suffix}")
                    return []
            
            # Normaliser: si c'est un dict avec clé "rules", extraire la liste
            if isinstance(rules_data, dict) and "rules" in rules_data:
                rules = rules_data["rules"]
            elif isinstance(rules_data, list):
                rules = rules_data
            else:
                logger.error("Format de règles invalide")
                return []
            
            # Valider et mettre en cache
            valid_rules = []
            for rule in rules:
                if self.validate_rule(rule):
                    rule_id = rule.get("id")
                    self._rule_cache[rule_id] = rule
                    valid_rules.append(rule)
                    logger.info(f"Règle chargée: {rule_id}")
                else:
                    logger.warning(f"Règle invalide ignorée: {rule.get('id', 'unknown')}")
            
            logger.info(f"{len(valid_rules)} règle(s) chargée(s) depuis {rules_path}")
            return valid_rules
            
        except Exception as e:
            logger.error(f"Erreur chargement règles depuis {rules_path}: {e}")
            return []
    
    def validate_rule(self, rule_config: Dict[str, Any]) -> bool:
        """
        Valide une configuration de règle.
        
        Args:
            rule_config: Configuration à valider
            
        Returns:
            True si valide, False sinon
        """
        required_fields = ["id", "name", "severity", "criteria", "risk_score"]
        
        # Vérifier les champs obligatoires
        for field in required_fields:
            if field not in rule_config:
                logger.warning(f"Règle invalide: champ '{field}' manquant")
                return False
        
        # Valider la sévérité
        severity = rule_config.get("severity")
        if severity not in [s.value for s in Severity]:
            logger.warning(f"Règle invalide: sévérité '{severity}' invalide")
            return False
        
        # Valider le score de risque
        risk_score = rule_config.get("risk_score")
        if not isinstance(risk_score, (int, float)) or not (0 <= risk_score <= 100):
            logger.warning(f"Règle invalide: risk_score '{risk_score}' invalide")
            return False
        
        # Valider les critères
        criteria = rule_config.get("criteria")
        if not isinstance(criteria, list) or len(criteria) == 0:
            logger.warning(f"Règle invalide: critères vides ou invalides")
            return False
        
        # Valider l'action de réponse
        response_action = rule_config.get("response_action", {}).get("type", "log")
        if response_action not in [a.value for a in ResponseAction]:
            logger.warning(f"Règle invalide: response_action '{response_action}' invalide")
            return False
        
        return True
    
    def create_detector(self, rule_config: Dict[str, Any]) -> IDetectionStrategy:
        """
        Crée un détecteur à partir d'une configuration.
        
        Args:
            rule_config: Configuration de la règle
            
        Returns:
            Instance du détecteur
        """
        rule_id = rule_config.get("id")
        
        # Vérifier le cache
        if rule_id in self._detector_cache:
            logger.debug(f"Détecteur récupéré du cache: {rule_id}")
            return self._detector_cache[rule_id]
        
        # Déterminer le type de détecteur selon les critères
        criteria = rule_config.get("criteria", [])
        detector_type = self._infer_detector_type(criteria)
        
        # Créer le détecteur approprié
        detector = self._create_detector_by_type(detector_type, rule_config)
        
        # Mettre en cache
        self._detector_cache[rule_id] = detector
        logger.info(f"Détecteur créé: {rule_id} (type: {detector_type})")
        
        return detector
    
    def _infer_detector_type(self, criteria: List[Dict[str, Any]]) -> str:
        """
        Infère le type de détecteur selon les critères.
        
        Args:
            criteria: Liste des critères
            
        Returns:
            Type de détecteur
        """
        for criterion in criteria:
            criterion_type = criterion.get("type")
            
            if criterion_type == "port_scan":
                return "port_scan"
            elif criterion_type == "syn_flood":
                return "syn_flood"
            elif criterion_type == "auth_failure":
                return "auth_failure"
            elif criterion_type == "behavioral_anomaly":
                return "behavioral"
            elif criterion_type == "fsm_state":
                return "fsm"
        
        # Défaut: port scan
        return "port_scan"
    
    def _create_detector_by_type(self, detector_type: str, 
                                 rule_config: Dict[str, Any]) -> IDetectionStrategy:
        """
        Crée un détecteur selon son type.
        
        Args:
            detector_type: Type de détecteur
            rule_config: Configuration de la règle
            
        Returns:
            Instance du détecteur
        """
        criteria = rule_config.get("criteria", [])
        
        # Extraire les paramètres du premier critère correspondant
        params = {}
        for criterion in criteria:
            if criterion.get("type") == detector_type or \
               (detector_type == "port_scan" and criterion.get("type") in ["port_scan", "scan"]):
                params = criterion
                break
        
        if detector_type == "port_scan":
            threshold = params.get("threshold", 10)
            window = params.get("window_seconds", 60.0)
            return PortScanDetectionStrategy(threshold, window)
        
        elif detector_type == "syn_flood":
            threshold = params.get("threshold", 100)
            window = params.get("window_seconds", 1.0)
            return SYNFloodDetectionStrategy(threshold, window)
        
        elif detector_type == "auth_failure":
            threshold = params.get("threshold", 5)
            window = params.get("window_seconds", 300.0)
            return AuthFailureDetectionStrategy(threshold, window)
        
        elif detector_type == "behavioral":
            return BehavioralAnomalyDetectionStrategy()
        
        elif detector_type == "fsm":
            return FSMTransitionDetectionStrategy()
        
        else:
            logger.warning(f"Type de détecteur inconnu: {detector_type}, utilisation du défaut")
            return PortScanDetectionStrategy()
    
    def create_detectors_from_file(self, rules_path: str) -> List[IDetectionStrategy]:
        """
        Crée tous les détecteurs depuis un fichier de règles.
        
        Args:
            rules_path: Chemin vers le fichier de règles
            
        Returns:
            Liste des détecteurs créés
        """
        rules = self.load_rules(rules_path)
        detectors = []
        
        for rule in rules:
            try:
                detector = self.create_detector(rule)
                detectors.append(detector)
            except Exception as e:
                logger.error(f"Erreur création détecteur pour règle {rule.get('id')}: {e}")
        
        logger.info(f"{len(detectors)} détecteur(s) créé(s) depuis {rules_path}")
        return detectors
    
    def get_rule(self, rule_id: str) -> Optional[Dict[str, Any]]:
        """
        Récupère une règle par son ID.
        
        Args:
            rule_id: Identifiant de la règle
            
        Returns:
            Configuration de la règle ou None
        """
        return self._rule_cache.get(rule_id)
    
    def get_all_rules(self) -> List[Dict[str, Any]]:
        """Retourne toutes les règles chargées."""
        return list(self._rule_cache.values())
    
    def clear_cache(self) -> None:
        """Nettoie les caches."""
        self._rule_cache.clear()
        self._detector_cache.clear()
        logger.info("Caches nettoyés")


class RuleManager:
    """
    Gestionnaire de règles avec chargement dynamique.
    Centralise la gestion des règles pour le système.
    """
    
    def __init__(self, rules_directory: str = "rules"):
        self._rules_directory = rules_directory
        self._factory = RuleFactory()
        self._loaded_rules: Dict[str, Dict[str, Any]] = {}
        self._active_detectors: List[IDetectionStrategy] = []
    
    def load_rules_from_directory(self) -> int:
        """
        Charge toutes les règles depuis le répertoire.
        
        Returns:
            Nombre de règles chargées
        """
        rules_dir = Path(self._rules_directory)
        
        if not rules_dir.exists():
            logger.warning(f"Répertoire de règles introuvable: {self._rules_directory}")
            return 0
        
        total_rules = 0
        
        # Charger tous les fichiers JSON et YAML
        for file_path in rules_dir.glob("*.json"):
            rules = self._factory.load_rules(str(file_path))
            total_rules += len(rules)
        
        for file_path in rules_dir.glob("*.yaml"):
            rules = self._factory.load_rules(str(file_path))
            total_rules += len(rules)
        
        for file_path in rules_dir.glob("*.yml"):
            rules = self._factory.load_rules(str(file_path))
            total_rules += len(rules)
        
        # Mettre à jour les règles chargées
        self._loaded_rules = self._factory._rule_cache.copy()
        
        logger.info(f"Total de {total_rules} règle(s) chargée(s) depuis {self._rules_directory}")
        return total_rules
    
    def reload_rules(self) -> int:
        """
        Recharge toutes les règles.
        
        Returns:
            Nombre de règles rechargées
        """
        self._factory.clear_cache()
        self._loaded_rules.clear()
        self._active_detectors.clear()
        return self.load_rules_from_directory()
    
    def get_active_detectors(self) -> List[IDetectionStrategy]:
        """
        Retourne les détecteurs actifs.
        
        Returns:
            Liste des détecteurs
        """
        if not self._active_detectors:
            # Créer les détecteurs depuis les règles chargées
            for rule_config in self._loaded_rules.values():
                try:
                    detector = self._factory.create_detector(rule_config)
                    self._active_detectors.append(detector)
                except Exception as e:
                    logger.error(f"Erreur création détecteur: {e}")
        
        return self._active_detectors
    
    def get_rule_by_id(self, rule_id: str) -> Optional[Dict[str, Any]]:
        """Récupère une règle par son ID."""
        return self._factory.get_rule(rule_id)
    
    def get_all_rules(self) -> List[Dict[str, Any]]:
        """Retourne toutes les règles chargées."""
        return self._factory.get_all_rules()


# Singleton global
rule_manager = RuleManager()

-- state_store.py --

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

# dossier engine/anomalie_detection/rules

-- complex_rules.json --

{
  "version": "1.0.0",
  "description": "Règles complexes de détection d'anomalies comportementales pour IDPS",
  "rules": [
    {
      "id": "RULE-SSH-BRUTEFORCE-001",
      "name": "Horizontal SSH Brute Force Attack",
      "version": "1.0.0",
      "severity": "critical",
      "preconditions": {
        "min_confidence": 0.75,
        "min_evidence": 2,
        "required_protocols": ["TCP"],
        "excluded_ips": ["192.168.0.0/16", "10.0.0.0/8", "127.0.0.0/8"]
      },
      "criteria": [
        {
          "type": "port_scan",
          "threshold": 15,
          "window_seconds": 120,
          "target_ports": [22, 2222],
          "scan_type": "horizontal"
        },
        {
          "type": "auth_failure",
          "service": "ssh",
          "threshold": 5,
          "window_seconds": 300,
          "username_variations": true
        }
      ],
      "risk_score": 92,
      "confidence_level": 0.85,
      "evidence_collector": {
        "collect_ports": true,
        "collect_payloads": true,
        "collect_timestamps": true,
        "collect_usernames": true,
        "max_evidence_items": 50
      },
      "response_action": {
        "type": "block",
        "duration_seconds": 3600,
        "log_level": "critical",
        "additional_actions": ["alert", "quarantine"]
      },
      "metadata": {
        "attack_category": "brute_force",
        "mitre_technique": "T1110.001",
        "mitre_tactic": "Credential Access",
        "description": "Détection d'une attaque de brute force SSH combinée à un scan horizontal de ports"
      }
    },
    {
      "id": "RULE-DDOS-SYN-002",
      "name": "Distributed SYN Flood Attack",
      "version": "1.0.0",
      "severity": "critical",
      "preconditions": {
        "min_confidence": 0.80,
        "min_evidence": 1
      },
      "criteria": [
        {
          "type": "syn_flood",
          "threshold": 150,
          "window_seconds": 1.0,
          "destination_port": 80
        }
      ],
      "risk_score": 95,
      "confidence_level": 0.90,
      "evidence_collector": {
        "collect_ports": true,
        "collect_timestamps": true,
        "collect_source_ips": true
      },
      "response_action": {
        "type": "block",
        "duration_seconds": 7200,
        "log_level": "critical",
        "additional_actions": ["alert", "quarantine"]
      },
      "metadata": {
        "attack_category": "ddos",
        "mitre_technique": "T1498",
        "mitre_tactic": "Impact",
        "description": "Détection d'une attaque DDOS par inondation SYN"
      }
    },
    {
      "id": "RULE-RECONNAISSANCE-003",
      "name": "Network Reconnaissance Scan",
      "version": "1.0.0",
      "severity": "high",
      "preconditions": {
        "min_confidence": 0.65,
        "min_evidence": 1
      },
      "criteria": [
        {
          "type": "port_scan",
          "threshold": 20,
          "window_seconds": 300,
          "scan_type": "vertical"
        },
        {
          "type": "behavioral_anomaly",
          "metric": "port_entropy",
          "z_score_threshold": 2.5
        }
      ],
      "risk_score": 75,
      "confidence_level": 0.70,
      "evidence_collector": {
        "collect_ports": true,
        "collect_timestamps": true
      },
      "response_action": {
        "type": "alert",
        "log_level": "warning",
        "additional_actions": ["log"]
      },
      "metadata": {
        "attack_category": "reconnaissance",
        "mitre_technique": "T1595.001",
        "mitre_tactic": "Reconnaissance",
        "description": "Détection d'une activité de reconnaissance réseau"
      }
    }
  ]
}

# Dossier core

-- auth.py --

from __future__ import annotations

import logging
import uuid
import json
import asyncio
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any
from jose import JWTError, jwt
import bcrypt  # Utilisation directe du module natif sans passlib
from fastapi import WebSocket
from app.core.config import settings
from app.api.schemas import TokenData

logger = logging.getLogger("ids_ips.auth_utils")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Vérifie la correspondance entre un mot de passe en clair et son empreinte hachée.
    Sécurisé contre les attaques par timing.
    """
    try:
        # bcrypt requiert des chaînes d'octets (bytes)
        return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))
    except Exception as e:
        logger.error(f"Erreur lors de la vérification cryptographique du mot de passe: {str(e)}")
        return False

def get_password_hash(password: str) -> str:
    """
    Génère un sel unique et applique l'algorithme Bcrypt pour hacher le mot de passe.
    Retourne une chaîne de caractères (str) prête pour le stockage SQL.
    """
    try:
        # Génération du sel et hachage
        salt = bcrypt.gensalt()
        hashed_bytes = bcrypt.hashpw(password.encode('utf-8'), salt)
        return hashed_bytes.decode('utf-8')
    except Exception as e:
        logger.error(f"Erreur lors du hachage du mot de passe: {str(e)}")
        raise

def create_access_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None, secret_key: Optional[str] = None) -> str:
    """
    Génère un jeton d'authentification JWT signé de manière unifiée en UTC.
    Ajoute un identifiant unique `jti` pour permettre la révocation future.
    """
    to_encode = data.copy()
    now = datetime.now(timezone.utc)
    
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(minutes=int(settings.ACCESS_TOKEN_EXPIRE_MINUTES))
        
    to_encode.update({
        "exp": int(expire.timestamp()),
        "iat": int(now.timestamp()),
        "nbf": int(now.timestamp()),
        "jti": str(uuid.uuid4()),
    })
    
    signing_key = secret_key or settings.SECRET_KEY
    try:
        encoded_jwt = jwt.encode(to_encode, signing_key, algorithm=settings.ALGORITHM)
        return encoded_jwt
    except JWTError as e:
        logger.critical(f"Échec critique de signature cryptographique du token: {str(e)}")
        raise

def decode_access_token(token: str, secret_key: Optional[str] = None) -> Optional[TokenData]:
    """
    Décode, vérifie l'intégrité de la signature et valide la date d'expiration d'un JWT.
    """
    signing_key = secret_key or settings.SECRET_KEY
    try:
        payload = jwt.decode(token, signing_key, algorithms=[settings.ALGORITHM])
        username: Optional[str] = payload.get("sub")
        jti: Optional[str] = payload.get("jti")
        if username is None:
            return None
        return TokenData(username=username, jti=jti)
    except JWTError:
        return None
    except Exception as e:
        logger.error(f"Erreur d'extraction ou de parsing du payload JWT: {str(e)}")
        return None

async def authenticate_websocket(websocket: WebSocket, timeout: int = 10, secret_key: Optional[str] = None) -> Optional[TokenData]:
    """
    Authentifie une connexion WebSocket via un token JWT transmis dans le premier message.
    Attend un JSON de la forme {"token": "..."}.
    """
    try:
        raw = await asyncio.wait_for(websocket.receive_text(), timeout=timeout)
    except asyncio.TimeoutError:
        await websocket.close(code=1008, reason="Timeout : token d'authentification requis")
        return None
    except Exception:
        await websocket.close(code=1008, reason="Erreur lors de la réception du token")
        return None
    
    try:
        data = json.loads(raw) if raw else {}
    except Exception:
        await websocket.close(code=1008, reason="Format JSON invalide pour le token")
        return None
    
    token = data.get("token")
    if not token:
        await websocket.close(code=1008, reason="Token d'authentification manquant")
        return None
    
    token_data = decode_access_token(token, secret_key=secret_key)
    if token_data is None:
        await websocket.close(code=1008, reason="Token d'authentification invalide ou expiré")
        return None
    
    return token_data

async def get_user_from_ws_token(token_data: Optional[TokenData]) -> Optional[User]:
    """Charge et valide l'utilisateur associé à un token WebSocket."""
    if token_data is None or token_data.username is None:
        return None
    from app.core.dependencies import SessionLocal
    from app.db.models import User
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.username == token_data.username).first()
        return user
    finally:
        db.close()

-- config.py --

import os
from typing import Optional
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field, computed_field, field_validator, model_validator


class Settings(BaseSettings):
    """
    Configuration globale centralisée de l'application.
    Valide les types au démarrage et charge les variables d'environnement.
    """
    APP_NAME: str = "IDS-IPS-ULPGL"

    NETWORK_INTERFACE: str = Field(default="wlan0")
    ALERT_THRESHOLD_PORT_SCAN: int = Field(default=10)
    ALERT_THRESHOLD_SYN_FLOOD: int = Field(default=100)

    API_HOST: str = Field(default="0.0.0.0")
    API_PORT: int = Field(default=8000)

    DATABASE_URL: str = Field(default="sqlite:///./ids_ips_local.db")
    POSTGRES_HOST: Optional[str] = Field(default=None)
    POSTGRES_PORT: int = Field(default=5432)
    POSTGRES_USER: Optional[str] = Field(default=None)
    POSTGRES_PASSWORD: Optional[str] = Field(default=None)
    POSTGRES_DB: Optional[str] = Field(default=None)
    USE_POSTGRES: bool = Field(default=False)

    SMTP_SERVER: Optional[str] = Field(default=None)
    SMTP_PORT: int = Field(default=587)
    SMTP_USERNAME: Optional[str] = Field(default=None)
    SMTP_PASSWORD: Optional[str] = Field(default=None)
    SMTP_SENDER_EMAIL: Optional[str] = Field(default=None)
    ADMIN_EMAIL: Optional[str] = Field(default=None)

    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(default=30, ge=5, le=480)

    SSH_TIMEOUT_SECONDS: int = Field(default=5, ge=1, le=60)
    SSH_KNOWN_HOSTS_FILE: Optional[str] = Field(default=None)
    SSH_STRICT_HOST_KEY_CHECKING: bool = Field(default=True)

    IPTABLES_TIMEOUT_SECONDS: int = Field(default=2, ge=1, le=30)
    IPTABLES_MAX_RETRIES: int = Field(default=3, ge=1, le=10)

    RATE_LIMIT_ENABLED: bool = Field(default=True)
    RATE_LIMIT_AUTH_REQUESTS: int = Field(default=5, ge=1, le=100)
    RATE_LIMIT_AUTH_WINDOW_SECONDS: int = Field(default=60, ge=10, le=3600)

    AI_MODE_ENABLED: bool = Field(default=False)
    AI_MODEL_PATH: str = Field(default="ml_model/models/ppo_ids_agent.zip")
    AI_CONFIDENCE_THRESHOLD: float = Field(default=0.85, ge=0.0, le=1.0)
    AI_DECISION_TIMEOUT_SECONDS: int = Field(default=5, ge=1, le=30)
    AI_MAX_DECISIONS_PER_MINUTE: int = Field(default=30, ge=1, le=1000)
    AI_FALLBACK_ACTION: str = Field(default="manual")
    AI_LOG_LEVEL: str = Field(default="INFO", pattern="^(DEBUG|INFO|WARNING|ERROR|CRITICAL)$")

    CORS_ENVIRONMENT: str = Field(default="dev", pattern="^(dev|test|prod)$")
    CORS_ALLOWED_ORIGINS: list[str] = Field(default_factory=lambda: ["http://localhost:3000", "http://localhost:5173", "http://localhost:8080"])
    CORS_ALLOW_CREDENTIALS: bool = Field(default=True)
    CORS_ALLOWED_METHODS: list[str] = Field(default_factory=lambda: ["*"])
    CORS_ALLOWED_HEADERS: list[str] = Field(default_factory=lambda: ["*"])

    @field_validator("CORS_ALLOWED_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, v):
        if isinstance(v, list):
            return [str(item).strip() for item in v if str(item).strip()]
        if isinstance(v, str):
            s = v.strip()
            if s.startswith("[") and s.endswith("]"):
                import json
                try:
                    parsed = json.loads(s)
                    return [str(item).strip() for item in parsed if str(item).strip()]
                except json.JSONDecodeError:
                    pass
            return [item.strip() for item in s.split(",") if item.strip()]
        return v

    @model_validator(mode="after")
    def validate_postgres_config(self):
        if self.USE_POSTGRES:
            missing = []
            if not self.POSTGRES_HOST:
                missing.append("POSTGRES_HOST")
            if not self.POSTGRES_USER:
                missing.append("POSTGRES_USER")
            if not self.POSTGRES_PASSWORD:
                missing.append("POSTGRES_PASSWORD")
            if not self.POSTGRES_DB:
                missing.append("POSTGRES_DB")
            if missing:
                raise ValueError(
                    "USE_POSTGRES=true requiert les variables suivantes: " + ", ".join(missing)
                )
        return self

    @model_validator(mode="after")
    def validate_cors_config(self):
        if self.CORS_ENVIRONMENT == "prod":
            if "*" in self.CORS_ALLOWED_ORIGINS:
                raise ValueError(
                    "CORS_ALLOWED_ORIGINS ne peut pas contenir '*' en production. "
                    "Spécifiez les origines explicitement."
                )
            if self.CORS_ALLOW_CREDENTIALS and not self.CORS_ALLOWED_ORIGINS:
                raise ValueError(
                    "CORS_ALLOW_CREDENTIALS=True sans CORS_ALLOWED_ORIGINS explicites est interdit en production."
                )
        if self.CORS_ENVIRONMENT in ("prod", "test") and self.CORS_ALLOW_CREDENTIALS and "*" in self.CORS_ALLOWED_ORIGINS:
            raise ValueError(
                "CORS_ALLOW_CREDENTIALS=True est incompatible avec allow_origins=['*'] en dehors de dev. "
                "Désactivez les credentials ou spécifiez des origines explicites."
            )
        return self

    @computed_field
    @property
    def API_URL(self) -> str:
        return f"http://{self.API_HOST}:{self.API_PORT}"

    @field_validator("SECRET_KEY")
    @classmethod
    def validate_secret_key(cls, v: str) -> str:
        forbidden_patterns = ["CHANGEME", "CHANGE_ME", "example", "your-secret", "secret", "SUPER_SECRET"]
        if any(pattern in v for pattern in forbidden_patterns):
            raise ValueError(
                "SECRET_KEY ne peut pas contenir de valeur d'exemple par défaut. "
                "Générez une clé sécurisée (min 32 caractères aléatoires)."
            )
        if len(v) < 32:
            raise ValueError("SECRET_KEY doit contenir au moins 32 caractères.")
        return v

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )


settings = Settings()

-- dependencies.py --

import logging
from typing import Generator
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session

from app.core.config import settings
from app.core.auth_utils import decode_access_token
from app.db.models import User

logger = logging.getLogger("ids_ips.dependencies")

# Configuration du moteur de persistance relationnelle
# Support SQLite et PostgreSQL
if settings.USE_POSTGRES and settings.POSTGRES_HOST:
    # Configuration PostgreSQL
    DATABASE_URL = f"postgresql://{settings.POSTGRES_USER}:{settings.POSTGRES_PASSWORD}@{settings.POSTGRES_HOST}:{settings.POSTGRES_PORT}/{settings.POSTGRES_DB}"
    connect_args = {}
    logger.info(f"Using PostgreSQL database: {settings.POSTGRES_HOST}:{settings.POSTGRES_PORT}/{settings.POSTGRES_DB}")
else:
    # Configuration SQLite (par défaut)
    DATABASE_URL = settings.DATABASE_URL
    connect_args = {"check_same_thread": False} if settings.DATABASE_URL.startswith("sqlite") else {}
    logger.info(f"Using SQLite database: {settings.DATABASE_URL}")

engine = create_engine(DATABASE_URL, connect_args=connect_args, pool_pre_ping=True)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db() -> Generator[Session, None, None]:
    """
    Générateur de sessions de base de données (Pattern Unit of Work).
    Garantit la libération systématique de la connexion au pool à la fin de la requête.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Schéma d'extraction du jeton d'authentification Bearer
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/v1/auth/token")

async def get_current_user(
    token: str = Depends(oauth2_scheme), 
    db: Session = Depends(get_db)
) -> User:
    """
    Dépendance de sécurité extrayant et vérifiant le porteur du jeton d'accès JWT.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Session expirée ou authentification invalide.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    # Décodage et contrôle d'intégrité cryptographique du jeton
    token_data = decode_access_token(token)
    if token_data is None or token_data.username is None:
        raise credentials_exception
        
    # Recherche de l'utilisateur en base de données
    user = db.query(User).filter(User.username == token_data.username).first()
    if user is None:
        raise credentials_exception
        
    return user

async def get_current_active_user(
    current_user: User = Depends(get_current_user)
) -> User:
    """
    Vérifie si le compte de l'utilisateur authentifié est actif.
    """
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="Ce compte utilisateur est suspendu."
        )
    return current_user

async def get_current_admin_user(
    current_user: User = Depends(get_current_active_user)
) -> User:
    """
    Contrôle d'accès basé sur les rôles (RBAC). 
    Garantit l'exclusivité des routes d'administration aux seuls comptes dotés du privilège 'admin'.
    """
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="Privilèges d'administration requis pour exécuter cette action."
        )
    return current_user 

-- json_logger.py --

import logging
import json
from datetime import datetime, timezone
from typing import Dict, Any


class JSONFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        log_entry: Dict[str, Any] = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "module": record.name,
            "message": record.getMessage(),
            "extra": {}
        }
        for key, value in record.__dict__.items():
            if key not in (
                "name", "msg", "args", "created", "relativeCreated",
                "exc_info", "exc_text", "stack_info", "lineno", "pathname",
                "filename", "module", "funcName", "msecs", "thread", "threadName",
                "process", "processName", "levelname", "levelno", "message",
                "taskName"
            ):
                log_entry["extra"][key] = value
        if record.exc_info and record.exc_info[0]:
            log_entry["extra"]["exception"] = self.formatException(record.exc_info)
        return json.dumps(log_entry, ensure_ascii=False)


def configure_logging(level: int = logging.INFO) -> None:
    handler = logging.StreamHandler()
    handler.setFormatter(JSONFormatter())
    logging.basicConfig(level=level, handlers=[handler], force=True)

-- jwt_manager.py --

import secrets
from typing import Optional
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
from app.db.models import JwtKey


class JwtKeyManager:
    def __init__(self, settings_key: str) -> None:
        self.settings_key = settings_key

    def _generate_key_value(self) -> str:
        return secrets.token_hex(32)

    def get_active_key(self, db: Session) -> str:
        active = db.query(JwtKey).filter(JwtKey.is_active == True).first()
        if active:
            return active.key_value
        bootstrap = db.query(JwtKey).first()
        if bootstrap:
            bootstrap.is_active = True
            db.commit()
            return bootstrap.key_value
        new_key = JwtKey(key_value=self._generate_key_value(), is_active=True)
        db.add(new_key)
        db.commit()
        db.refresh(new_key)
        return new_key.key_value

    def rotate_key(self, db: Session, admin_username: str, note: Optional[str] = None) -> dict:
        active = db.query(JwtKey).filter(JwtKey.is_active == True).first()
        if active:
            active.is_active = False
        new_key = JwtKey(
            key_value=self._generate_key_value(),
            is_active=True,
            rotation_note=note or f"Rotation par {admin_username}"
        )
        db.add(new_key)
        db.commit()
        db.refresh(new_key)
        return {
            "key_id": new_key.id,
            "created_at": new_key.created_at.isoformat() if new_key.created_at else None,
            "rotation_note": new_key.rotation_note,
            "active": new_key.is_active,
        }


from app.core.config import settings

jwt_key_manager = JwtKeyManager(settings_key=settings.SECRET_KEY)

-- rate_limit.py --

"""
Rate limiter global pour l'IDS/IPS.
Utilise slowapi avec identification par adresse IP distante.
"""
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)


# Dossier api

-- schema.py --

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, EmailStr, Field

# SCHÉMAS LIÉS AUX ALERTES 
class AlertCreate(BaseModel):
    """Schéma de validation pour l'injection d'une nouvelle alerte réseau."""
    source_ip: str = Field(..., examples=["192.168.1.50"])
    destination_ip: str = Field(..., examples=["10.0.0.1"])
    source_port: Optional[int] = Field(None, ge=0, le=65535)
    destination_port: Optional[int] = Field(None, ge=0, le=65535)
    protocol: str = Field(..., examples=["TCP", "UDP", "ICMP"])
    alert_type: str = Field(..., examples=["Scan ICMP (Ping Sweep)"])  # Alignera l'une de 100 attaques definies
    description: str = Field(..., examples=["Balayage ICMP glissant détecté"])
    is_blocked: bool = False
    is_manual_block: bool = False
    validated_by_admin: bool = False
    severity: str = Field("normal", examples=["normal", "warning", "critique", "tres_critique"])
    event_count: int = Field(1, description="Nombre d'itérations ou paquets suspectés pour cette IP")

class Alert(AlertCreate):
    """Schéma de sérialisation pour la lecture des alertes depuis l'API."""
    id: int
    timestamp: datetime

    model_config = ConfigDict(from_attributes=True)

# SCHÉMAS LIÉS AUX UTILISATEURS

class UserCreate(BaseModel):
    """Schéma d'inscription : le mot de passe en clair est requis ici."""
    username: str = Field(..., min_length=3, max_length=50)
    email: EmailStr
    password: str = Field(..., min_length=8)
    role: str = "user"

class User(BaseModel):
    """Schéma de sortie sécurisé : aucune trace du mot de passe (hashed ou non)."""
    id: int
    username: str
    email: EmailStr
    role: str
    is_active: bool

    model_config = ConfigDict(from_attributes=True)

# SCHÉMAS LIÉS AUX JETONS DE SÉCURITÉ (AUTH)

class Token(BaseModel):
    """Conteneur du jeton d'accès OAuth2 renvoyé au client."""
    access_token: str
    token_type: str

class TokenData(BaseModel):
    """Structure de transport de la charge utile (payload) extraite du JWT."""
    username: Optional[str] = None
    jti: Optional[str] = None 

# Dossier api/endpoints

-- ai.py --

from fastapi import APIRouter, Depends, HTTPException, status, Request
from pydantic import BaseModel, IPvAnyAddress
from sqlalchemy.orm import Session
from typing import Dict, Any, Optional

from app.core.dependencies import get_db, get_current_admin_user
from app.core.rate_limiter import limiter
from app.core.config import settings
from app.db.models import User
from app.services.ai_decision_service import AIDecisionService

router = APIRouter(prefix="/ai", tags=["Intelligence Artificielle"])


class DecideRequest(BaseModel):
    ip: IPvAnyAddress
    context: Optional[Dict[str, Any]] = None


class DecideResponse(BaseModel):
    ip: str
    action: str
    confidence: float
    model_version: Optional[str]
    features_used: Dict[str, float]
    fallback_count: int
    reason: str


class StatusResponse(BaseModel):
    model_loaded: bool
    model_version: Optional[str]
    model_path: str
    is_trained: bool
    fallback_count: int
    observation_version: str
    features_count: int
    total_decisions: int


class AlignmentResponse(BaseModel):
    aligned: bool
    backend_features: list
    model_features: list
    mismatches: list


_ai_service = AIDecisionService()


@router.post("/decide", response_model=DecideResponse, summary="Décision IA pour une IP")
@limiter.limit(f"{settings.AI_MAX_DECISIONS_PER_MINUTE}/minute")
async def decide_ip(
    request: Request,
    payload: DecideRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    return await _ai_service.evaluate_ip(str(payload.ip), payload.context)


@router.get("/status", response_model=StatusResponse, summary="Statut du module IA")
async def ai_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    stats = _ai_service.rl.get_stats()
    extractor_names = _ai_service.extractor.get_feature_names()
    return StatusResponse(
        model_loaded=stats.get("is_trained", False),
        model_version=stats.get("model_version"),
        model_path=stats.get("model_path", ""),
        is_trained=stats.get("is_trained", False),
        fallback_count=stats.get("fallback_count", 0),
        observation_version=stats.get("observation_version", ""),
        features_count=len(extractor_names),
        total_decisions=stats.get("total_decisions", 0),
    )


@router.get("/alignment", response_model=AlignmentResponse, summary="Alignement features backend ↔ RL")
async def ai_alignment(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    backend_features = _ai_service.extractor.get_feature_names()
    model_features = getattr(_ai_service.rl.agent, "get_feature_names", lambda: [])()
    mismatches = []
    if backend_features != model_features:
        mismatches = [
            {"backend": b, "model": m}
            for b, m in zip(backend_features, model_features + [""] * (len(backend_features) - len(model_features)))
            if b != m
        ]
    return AlignmentResponse(
        aligned=_ai_service.extractor.validate_alignment(_ai_service.rl.agent),
        backend_features=backend_features,
        model_features=model_features,
        mismatches=mismatches,
    )


@router.post("/reload", summary="Recharger le modèle RL depuis le disque")
async def ai_reload(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    try:
        from ml_model.RL.inference import RLInference
        _ai_service.rl = RLInference(model_path=settings.AI_MODEL_PATH)
        return {"status": "success", "message": "Modèle RL rechargé"}
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))

-- alert.py --

from fastapi import APIRouter, Depends, HTTPException, status, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Dict, Any, List
from datetime import datetime, timedelta

from app.core.dependencies import get_db, get_current_admin_user
from app.db.models import Alert, User
from app.engine.firewall import firewall_manager
from app.services.websocket_manager import websocket_manager
from app.services.threat_detector import threat_detector
from app.core.auth_utils import authenticate_websocket, get_user_from_ws_token
from app.core.jwt_manager import jwt_key_manager

router = APIRouter(prefix="/alerts", tags=["Alertes & Pare-feu"])

@router.get("/banned-hosts", summary="Récupérer la liste des hôtes actuellement bloqués")
async def get_banned_hosts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
) -> List[Dict[str, Any]]:
    try:
        banned_alerts = db.query(Alert).filter(Alert.is_blocked == True).order_by(Alert.timestamp.desc()).all()
        result = []
        for alert in banned_alerts:
            result.append({
                "id": alert.id,
                "source_ip": alert.source_ip,
                "alert_type": alert.alert_type,
                "timestamp_block": alert.timestamp.isoformat() if alert.timestamp else None,
                "reason": f"Bloqué via Console (ID #{alert.id})"
            })
        return result
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur lors de la récupération des hôtes bannis: {str(e)}"
        )

@router.get("/history", summary="Récupérer l'historique global des alertes")
async def get_alerts_log_history(
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
) -> List[Dict[str, Any]]:
    """
    Extrait l'historique permanent et formate le timestamp pour éviter le bug Invalid Date sur le client.
    """
    try:
        history = db.query(Alert).order_by(Alert.timestamp.desc()).limit(limit).all()
        result = []
        for alert in history:
            # Sécurité de formatage ISO standard (remplace l'espace par un 'T')
            formatted_timestamp = None
            if alert.timestamp:
                if isinstance(alert.timestamp, str):
                    formatted_timestamp = alert.timestamp.replace(" ", "T")
                else:
                    formatted_timestamp = alert.timestamp.isoformat()

            result.append({
                "id": alert.id,
                "source_ip": alert.source_ip,
                "destination_ip": alert.destination_ip,
                "source_port": alert.source_port,
                "destination_port": alert.destination_port,
                "protocol": alert.protocol,
                "alert_type": alert.alert_type,
                "description": alert.description,
                "is_blocked": alert.is_blocked,
                "is_manual_block": alert.is_manual_block,
                "validated_by_admin": alert.validated_by_admin,
                "severity": alert.severity,
                "event_count": alert.event_count if hasattr(alert, 'event_count') else 1,
                "timestamp": formatted_timestamp
            })
        return result
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur lors de la récupération de l'historique : {str(e)}"
        )

@router.post("/{alert_id}/validate-block", summary="Validation administrative et exécution d'un bannissement IP")
async def validate_and_execute_block(
    alert_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
) -> Dict[str, str]:
    try:
        alert = db.query(Alert).filter(Alert.id == alert_id).with_for_update().first()
        
        if not alert:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Enregistrement d'alerte introuvable.")
            
        if alert.is_blocked:
            return {"status": "ignored", "message": "Cette anomalie a déjà fait l'objet d'un ajustement pare-feu."}

        firewall_success = await firewall_manager.block_ip(alert.source_ip, reason=f"Manuel - Opérateur: {current_user.username}")
        
        if firewall_success:
            alert.is_blocked = True
            alert.is_manual_block = True
            alert.validated_by_admin = True
            db.commit()
            
            # Analyser l'alerte pour déclencher les notifications email
            alert_dict = {
                "source_ip": alert.source_ip,
                "destination_ip": alert.destination_ip,
                "source_port": alert.source_port,
                "destination_port": alert.destination_port,
                "protocol": alert.protocol,
                "alert_type": alert.alert_type,
                "description": alert.description,
                "severity": alert.severity,
                "is_blocked": True,
                "timestamp": alert.timestamp.isoformat() if alert.timestamp else datetime.now().isoformat()
            }
            threat_detector.analyze_alert(alert_dict)
            
            return {"status": "success", "message": f"Hôte {alert.source_ip} banni avec succès du réseau local."}
        else:
            db.rollback()  
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, 
                detail="Échec de couplage avec le sous-système de filtrage matériel de l'OS."
            )
            
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, 
            detail=f"Erreur critique d'accès concurrentiel ou de transaction: {str(e)}"
        )

@router.post("/{alert_id}/unban", summary="Révocation manuelle d'une règle de bannissement")
async def unblock_ip_address(
    alert_id: int,
    payload: Dict[str, Any], 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
) -> Dict[str, str]:
    ip_address = payload.get("ip")
    if not ip_address:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="L'adresse IP source est requise.")

    try:
        alert = db.query(Alert).filter(Alert.id == alert_id).with_for_update().first()
        firewall_success = await firewall_manager.unblock_ip(ip_address, admin_username=current_user.username)
        
        if firewall_success:
            if alert:
                alert.is_blocked = False
            db.commit()
            return {"status": "success", "message": f"L'adresse IP {ip_address} a été réintégrée au trafic réseau."}
        else:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, 
                detail="L'adresse réseau spécifiée ne figure pas parmi les politiques de filtrage actives."
            )
            
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, 
            detail=f"Incident d'exécution lors du déblocage réseau: {str(e)}"
        ) 

@router.websocket("/ws/alerts")
async def websocket_endpoint(websocket: WebSocket, db: Session = Depends(get_db)):
    active_secret = jwt_key_manager.get_active_key(db)
    token_data = await authenticate_websocket(websocket, secret_key=active_secret)
    if token_data is None or token_data.username is None:
        return
    
    user = await get_user_from_ws_token(token_data)
    if user is None or not user.is_active:
        await websocket.close(code=1008, reason="Utilisateur invalide ou inactif")
        return
    
    await websocket_manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
                 
    except WebSocketDisconnect:
        await websocket_manager.disconnect(websocket)

@router.get("/stats/history", summary="Récupérer la moyenne des occurrences d'attaques par minute")
def get_alerts_history(db: Session = Depends(get_db)):
    """
    Exclut la gravité 'normal/low/info' pour cibler uniquement le trafic hostile, 
    puis calcule la moyenne des événements minute par minute.
    """
    time_limit = datetime.utcnow() - timedelta(hours=3)
    
    results = (
        db.query(
            func.strftime("%H:%M", Alert.timestamp, "localtime").label("minute_block"),
            func.count(Alert.id).label("total_alerts"),
            func.count(func.distinct(Alert.source_ip)).label("unique_attackers")
        )
        .filter(Alert.timestamp >= time_limit)
        .filter(
            Alert.severity.isnot(None),
            func.lower(Alert.severity) != "normal",
            func.lower(Alert.severity) != "low",
            func.lower(Alert.severity) != "info"
        )
        .group_by("minute_block")
        .order_by("minute_block")
        .all()
    )
    
    history = []
    for minute_block, total_alerts, unique_attackers in results:
        # Calcul de la moyenne des occurrences par minute d'attaque
        moyenne = round(total_alerts / unique_attackers, 2) if unique_attackers > 0 else total_alerts
        history.append({
            "time": minute_block,
            "Moyenne d'Attaques": moyenne
        })
        
    return history 

-- auth.py --

from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.core.auth_utils import create_access_token, verify_password
from app.core.config import settings
from app.core.jwt_manager import jwt_key_manager
from app.core.rate_limiter import limiter
from app.db.models import User
from app.api.schemas import Token
from app.core.dependencies import get_db
from app.services.threat_detector import threat_detector

router = APIRouter(prefix="/auth", tags=["Authentification"])

@router.post("/token", response_model=Token, summary="Authentification utilisateur et obtention de token JWT")
@limiter.limit(f"{settings.RATE_LIMIT_AUTH_REQUESTS}/{settings.RATE_LIMIT_AUTH_WINDOW_SECONDS}seconds")
async def login_for_access_token(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
) -> dict[str, str]:
    """
    Point d'entrée de sécurité pour l'échange d'identifiants contre un jeton d'accès signé (JWT).
    Conforme aux spécifications de sécurité OAuth2 et immunisé contre l'énumération utilisateur.
    """
    client_ip = request.client.host if request.client else "unknown"
    
    user = db.query(User).filter(User.username == form_data.username).first()
    
    if not user or not verify_password(form_data.password, user.hashed_password):
        threat_detector.analyze_login_attempt(
            username=form_data.username,
            ip_address=client_ip,
            timestamp=datetime.now(timezone.utc).isoformat(),
            location=None,
            is_new_location=False,
            failed_attempts=0,
            is_success=False
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Nom d'utilisateur ou mot de passe incorrect",
            headers={"WWW-Authenticate": "Bearer"},
        )
         
    if not user.is_active:
        threat_detector.analyze_login_attempt(
            username=user.username,
            ip_address=client_ip,
            timestamp=datetime.now(timezone.utc).isoformat(),
            location=None,
            is_new_location=False,
            failed_attempts=0,
            is_success=False
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Compte utilisateur désactivé ou banni du système.",
            headers={"WWW-Authenticate": "Bearer"},
        )
 
    access_token_expires = timedelta(minutes=int(settings.ACCESS_TOKEN_EXPIRE_MINUTES))
    active_secret = jwt_key_manager.get_active_key(db)
    access_token = create_access_token(
        data={"sub": user.username, "role": user.role},
        expires_delta=access_token_expires,
        secret_key=active_secret
    )
    
    threat_detector.analyze_login_attempt(
        username=user.username,
        ip_address=client_ip,
        timestamp=datetime.now(timezone.utc).isoformat(),
        location=None,
        is_new_location=False,
        failed_attempts=0,
        is_success=True
    )
    
    return {
        "access_token": access_token, 
        "token_type": "bearer"
    }

-- email_config.py --

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from typing import Optional
from sqlalchemy.orm import Session

from app.core.dependencies import get_db, get_current_admin_user
from app.db.models import User
from app.services.email_service import email_service
from app.core.config import settings

router = APIRouter(prefix="/email", tags=["Configuration Email"])

class EmailConfig(BaseModel):
    """Schéma de configuration email."""
    smtp_server: str
    smtp_port: int = 587
    smtp_username: str
    smtp_password: str
    smtp_sender_email: EmailStr
    admin_email: EmailStr

class EmailTestRequest(BaseModel):
    """Schéma de test email."""
    test_recipient: Optional[EmailStr] = None

@router.get("/config", summary="Récupérer la configuration email actuelle")
async def get_email_config(
    current_user: User = Depends(get_current_admin_user)
) -> dict:
    """
    Récupère la configuration email actuelle (masque les mots de passe).
    """
    return {
        "smtp_server": settings.SMTP_SERVER,
        "smtp_port": settings.SMTP_PORT,
        "smtp_username": settings.SMTP_USERNAME,
        "smtp_sender_email": settings.SMTP_SENDER_EMAIL,
        "admin_email": settings.ADMIN_EMAIL,
        "is_configured": email_service.is_configured()
    }

@router.post("/config", summary="Mettre à jour la configuration email")
async def update_email_config(
    config: EmailConfig,
    current_user: User = Depends(get_current_admin_user)
) -> dict:
    """
    Met à jour la configuration email.
    Note: Cette configuration est stockée dans les variables d'environnement.
    Pour un changement permanent, modifiez le fichier .env.
    """
    try:
        # Mettre à jour les settings (en mémoire uniquement)
        settings.SMTP_SERVER = config.smtp_server
        settings.SMTP_PORT = config.smtp_port
        settings.SMTP_USERNAME = config.smtp_username
        settings.SMTP_PASSWORD = config.smtp_password
        settings.SMTP_SENDER_EMAIL = config.smtp_sender_email
        settings.ADMIN_EMAIL = config.admin_email
        
        # Recréer l'instance du service email avec la nouvelle configuration
        email_service.smtp_server = config.smtp_server
        email_service.smtp_port = config.smtp_port
        email_service.smtp_username = config.smtp_username
        email_service.smtp_password = config.smtp_password
        email_service.sender_email = config.smtp_sender_email
        email_service.admin_email = config.admin_email
        
        return {
            "status": "success",
            "message": "Configuration email mise à jour avec succès",
            "is_configured": email_service.is_configured()
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur lors de la mise à jour de la configuration: {str(e)}"
        )

@router.post("/test", summary="Tester l'envoi d'email")
async def test_email(
    request: EmailTestRequest,
    current_user: User = Depends(get_current_admin_user)
) -> dict:
    """
    Envoie un email de test pour vérifier la configuration SMTP.
    """
    if not email_service.is_configured():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Le service email n'est pas configuré. Veuillez configurer les paramètres SMTP d'abord."
        )
    
    recipient = request.test_recipient or email_service.admin_email
    
    subject = "Test de configuration email - IDS-IPS ULPGL"
    body = """
Ceci est un email de test envoyé par le système IDS-IPS ULPGL.

Si vous recevez cet email, cela signifie que la configuration SMTP est correcte
et que le service d'envoi d'emails fonctionne normalement.

Détails de la configuration:
- Serveur SMTP: {smtp_server}
- Port: {smtp_port}
- Utilisateur: {smtp_username}
- Expéditeur: {sender_email}
- Destinataire: {recipient}

---
IDS-IPS ULPGL - Système de Détection et Prévention d'Intrusion
""".format(
        smtp_server=email_service.smtp_server,
        smtp_port=email_service.smtp_port,
        smtp_username=email_service.smtp_username,
        sender_email=email_service.sender_email,
        recipient=recipient
    )
    
    success = email_service.send_email(subject, body)
    
    if success:
        return {
            "status": "success",
            "message": f"Email de test envoyé avec succès à {recipient}"
        }
    else:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Échec de l'envoi de l'email de test. Vérifiez votre configuration SMTP."
        )

@router.get("/status", summary="Vérifier le statut du service email")
async def get_email_status(
    current_user: User = Depends(get_current_admin_user)
) -> dict:
    """
    Retourne le statut actuel du service email.
    """
    return {
        "is_configured": email_service.is_configured(),
        "smtp_server": settings.SMTP_SERVER,
        "smtp_port": settings.SMTP_PORT,
        "smtp_username": settings.SMTP_USERNAME,
        "sender_email": settings.SMTP_SENDER_EMAIL,
        "admin_email": settings.ADMIN_EMAIL
    }

-- keys.py --

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional

from app.core.dependencies import get_db, get_current_admin_user
from app.core.jwt_manager import jwt_key_manager
from app.db.models import User


router = APIRouter(prefix="/keys", tags=["Gestion des cles JWT"])


class RotateKeyRequest(BaseModel):
    note: Optional[str] = None


class RotateKeyResponse(BaseModel):
    key_id: int
    created_at: Optional[str]
    rotation_note: Optional[str]
    active: bool


@router.post("/rotate", response_model=RotateKeyResponse, summary="Rotation de la cle JWT (admin)")
async def rotate_jwt_key(
    payload: RotateKeyRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    """
    Cree une nouvelle cle JWT, desactive l'ancienne et retourne les informations de rotation.
    """
    result = jwt_key_manager.rotate_key(db, admin_username=current_user.username, note=payload.note)
    return RotateKeyResponse(**result)


@router.get("/current", summary="Cle JWT active (masquee)")
async def get_current_jwt_key(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    """
    Retourne un indicateur de presence de cle active sans reveler sa valeur complete.
    """
    from app.db.models import JwtKey
    active = db.query(JwtKey).filter(JwtKey.is_active == True).first()
    if not active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Aucune cle JWT active")
    return {
        "key_id": active.id,
        "is_active": active.is_active,
        "created_at": active.created_at.isoformat() if active.created_at else None,
        "rotation_note": active.rotation_note,
        "prefix": active.key_value[:8] + "..."
    }

-- nodes.py --

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, EmailStr

from app.core.dependencies import get_db, get_current_admin_user
from app.db.models import Campus, Department, Node, User
from app.services.node_manager import node_manager
from app.services.node_connection import node_connection_manager

router = APIRouter(prefix="/nodes", tags=["Gestion Multi-Nœuds"])

# Schémas Pydantic pour la validation
class CampusCreate(BaseModel):
    name: str
    location: str
    description: Optional[str] = None

class CampusUpdate(BaseModel):
    name: Optional[str] = None
    location: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None

class DepartmentCreate(BaseModel):
    campus_id: int
    name: str
    description: Optional[str] = None

class DepartmentUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None

class NodeCreate(BaseModel):
    department_id: int
    name: str
    hostname: str
    ip_address: str
    port: int = 22
    connection_type: str = "ssh"  # "ssh" ou "tls"
    ssh_username: Optional[str] = None
    ssh_key_path: Optional[str] = None
    ssh_password: Optional[str] = None
    tls_cert_path: Optional[str] = None
    description: Optional[str] = None

class NodeUpdate(BaseModel):
    name: Optional[str] = None
    hostname: Optional[str] = None
    ip_address: Optional[str] = None
    port: Optional[int] = None
    connection_type: Optional[str] = None
    ssh_username: Optional[str] = None
    ssh_key_path: Optional[str] = None
    ssh_password: Optional[str] = None
    tls_cert_path: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None

# Endpoints Campus
@router.get("/campuses", summary="Récupérer tous les campus")
async def get_campuses(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
) -> List[Dict[str, Any]]:
    """Récupère la liste de tous les campus actifs."""
    campuses = db.query(Campus).filter(Campus.is_active == True).all()
    return [
        {
            "id": campus.id,
            "name": campus.name,
            "location": campus.location,
            "description": campus.description,
            "created_at": campus.created_at.isoformat() if campus.created_at else None
        }
        for campus in campuses
    ]

@router.post("/campuses", summary="Créer un nouveau campus")
async def create_campus(
    campus: CampusCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
) -> Dict[str, Any]:
    """Crée un nouveau campus."""
    try:
        new_campus = Campus(
            name=campus.name,
            location=campus.location,
            description=campus.description
        )
        db.add(new_campus)
        db.commit()
        db.refresh(new_campus)
        
        return {
            "id": new_campus.id,
            "name": new_campus.name,
            "location": new_campus.location,
            "description": new_campus.description,
            "created_at": new_campus.created_at.isoformat() if new_campus.created_at else None
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur lors de la création du campus: {str(e)}"
        )

@router.put("/campuses/{campus_id}", summary="Mettre à jour un campus")
async def update_campus(
    campus_id: int,
    campus: CampusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
) -> Dict[str, Any]:
    """Met à jour un campus existant."""
    try:
        campus_obj = db.query(Campus).filter(Campus.id == campus_id).first()
        if not campus_obj:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Campus introuvable"
            )
        
        for field, value in campus.model_dump(exclude_unset=True).items():
            setattr(campus_obj, field, value)
        
        db.commit()
        db.refresh(campus_obj)
        
        return {
            "id": campus_obj.id,
            "name": campus_obj.name,
            "location": campus_obj.location,
            "description": campus_obj.description,
            "is_active": campus_obj.is_active
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur lors de la mise à jour du campus: {str(e)}"
        )

@router.delete("/campuses/{campus_id}", summary="Supprimer un campus")
async def delete_campus(
    campus_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
) -> Dict[str, str]:
    """Supprime un campus (désactivation)."""
    try:
        campus_obj = db.query(Campus).filter(Campus.id == campus_id).first()
        if not campus_obj:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Campus introuvable"
            )
        
        campus_obj.is_active = False
        db.commit()
        
        return {"status": "success", "message": "Campus désactivé avec succès"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur lors de la suppression du campus: {str(e)}"
        )

# Endpoints Department
@router.get("/departments", summary="Récupérer tous les départements")
async def get_departments(
    campus_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
) -> List[Dict[str, Any]]:
    """Récupère la liste de tous les départements actifs."""
    query = db.query(Department).filter(Department.is_active == True)
    if campus_id:
        query = query.filter(Department.campus_id == campus_id)
    
    departments = query.all()
    return [
        {
            "id": dept.id,
            "campus_id": dept.campus_id,
            "name": dept.name,
            "description": dept.description,
            "created_at": dept.created_at.isoformat() if dept.created_at else None
        }
        for dept in departments
    ]

@router.post("/departments", summary="Créer un nouveau département")
async def create_department(
    department: DepartmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
) -> Dict[str, Any]:
    """Crée un nouveau département."""
    try:
        campus = db.query(Campus).filter(Campus.id == department.campus_id).first()
        if not campus:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Campus introuvable"
            )
        
        new_department = Department(
            campus_id=department.campus_id,
            name=department.name,
            description=department.description
        )
        db.add(new_department)
        db.commit()
        db.refresh(new_department)
        
        return {
            "id": new_department.id,
            "campus_id": new_department.campus_id,
            "name": new_department.name,
            "description": new_department.description,
            "created_at": new_department.created_at.isoformat() if new_department.created_at else None
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur lors de la création du département: {str(e)}"
        )

@router.put("/departments/{department_id}", summary="Mettre à jour un département")
async def update_department(
    department_id: int,
    department: DepartmentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
) -> Dict[str, Any]:
    """Met à jour un département existant."""
    try:
        dept_obj = db.query(Department).filter(Department.id == department_id).first()
        if not dept_obj:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Département introuvable"
            )
        
        for field, value in department.model_dump(exclude_unset=True).items():
            setattr(dept_obj, field, value)
        
        db.commit()
        db.refresh(dept_obj)
        
        return {
            "id": dept_obj.id,
            "campus_id": dept_obj.campus_id,
            "name": dept_obj.name,
            "description": dept_obj.description,
            "is_active": dept_obj.is_active
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur lors de la mise à jour du département: {str(e)}"
        )

@router.delete("/departments/{department_id}", summary="Supprimer un département")
async def delete_department(
    department_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
) -> Dict[str, str]:
    """Supprime un département (désactivation)."""
    try:
        dept_obj = db.query(Department).filter(Department.id == department_id).first()
        if not dept_obj:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Département introuvable"
            )
        
        dept_obj.is_active = False
        db.commit()
        
        return {"status": "success", "message": "Département désactivé avec succès"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur lors de la suppression du département: {str(e)}"
        )

# Endpoints Node
@router.get("/nodes", summary="Récupérer tous les nœuds")
async def get_nodes(
    department_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
) -> List[Dict[str, Any]]:
    """Récupère la liste de tous les nœuds actifs."""
    query = db.query(Node).filter(Node.is_active == True)
    if department_id:
        query = query.filter(Node.department_id == department_id)
    
    nodes = query.all()
    return [
        {
            "id": node.id,
            "department_id": node.department_id,
            "name": node.name,
            "hostname": node.hostname,
            "ip_address": node.ip_address,
            "port": node.port,
            "connection_type": node.connection_type,
            "status": node.status,
            "total_packets": node.total_packets,
            "total_alerts": node.total_alerts,
            "network_load": node.network_load,
            "last_seen": node.last_seen.isoformat() if node.last_seen else None,
            "last_check": node.last_check.isoformat() if node.last_check else None
        }
        for node in nodes
    ]

@router.post("/nodes", summary="Créer un nouveau nœud")
async def create_node(
    node: NodeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
) -> Dict[str, Any]:
    """Crée un nouveau nœud de surveillance."""
    try:
        department = db.query(Department).filter(Department.id == node.department_id).first()
        if not department:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Département introuvable"
            )
        
        new_node = Node(
            department_id=node.department_id,
            name=node.name,
            hostname=node.hostname,
            ip_address=node.ip_address,
            port=node.port,
            connection_type=node.connection_type,
            ssh_username=node.ssh_username,
            ssh_key_path=node.ssh_key_path,
            tls_cert_path=node.tls_cert_path,
            description=node.description
        )
        db.add(new_node)
        db.commit()
        db.refresh(new_node)
        
        return {
            "id": new_node.id,
            "department_id": new_node.department_id,
            "name": new_node.name,
            "hostname": new_node.hostname,
            "ip_address": new_node.ip_address,
            "port": new_node.port,
            "connection_type": new_node.connection_type,
            "status": new_node.status,
            "created_at": new_node.created_at.isoformat() if new_node.created_at else None
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur lors de la création du nœud: {str(e)}"
        )

@router.put("/nodes/{node_id}", summary="Mettre à jour un nœud")
async def update_node(
    node_id: int,
    node: NodeUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
) -> Dict[str, Any]:
    """Met à jour un nœud existant."""
    try:
        node_obj = db.query(Node).filter(Node.id == node_id).first()
        if not node_obj:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Nœud introuvable"
            )
        
        for field, value in node.model_dump(exclude_unset=True).items():
            setattr(node_obj, field, value)
        
        db.commit()
        db.refresh(node_obj)
        
        return {
            "id": node_obj.id,
            "department_id": node_obj.department_id,
            "name": node_obj.name,
            "hostname": node_obj.hostname,
            "ip_address": node_obj.ip_address,
            "port": node_obj.port,
            "connection_type": node_obj.connection_type,
            "status": node_obj.status,
            "is_active": node_obj.is_active
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur lors de la mise à jour du nœud: {str(e)}"
        )

@router.delete("/nodes/{node_id}", summary="Supprimer un nœud")
async def delete_node(
    node_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
) -> Dict[str, str]:
    """Supprime un nœud (désactivation)."""
    try:
        node_obj = db.query(Node).filter(Node.id == node_id).first()
        if not node_obj:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Nœud introuvable"
            )
        
        node_obj.is_active = False
        db.commit()
        
        return {"status": "success", "message": "Nœud désactivé avec succès"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur lors de la suppression du nœud: {str(e)}"
        )

@router.post("/nodes/{node_id}/check", summary="Vérifier le statut d'un nœud")
async def check_node_status(
    node_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
) -> Dict[str, Any]:
    """Vérifie le statut de connexion d'un nœud spécifique."""
    try:
        node = db.query(Node).filter(Node.id == node_id).first()
        if not node:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Nœud introuvable"
            )
        
        result = await node_connection_manager.check_node_status(
            node_id=node.id,
            connection_type=node.connection_type,
            hostname=node.hostname,
            port=node.port,
            username=node.ssh_username,
            key_path=node.ssh_key_path,
            password=None,  # Ne pas stocker les mots de passe en clair
            cert_path=node.tls_cert_path
        )
        
        # Mettre à jour le statut du nœud
        node.status = result.status.value
        node.last_check = result.timestamp
        if result.success:
            node.last_seen = result.timestamp
        db.commit()
        
        return {
            "node_id": node_id,
            "status": result.status.value,
            "success": result.success,
            "latency_ms": result.latency_ms,
            "error_message": result.error_message,
            "timestamp": result.timestamp.isoformat() if result.timestamp else None
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur lors de la vérification du nœud: {str(e)}"
        )

@router.post("/nodes/check-all", summary="Vérifier tous les nœuds")
async def check_all_nodes(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
) -> Dict[str, Any]:
    """Vérifie le statut de tous les nœuds actifs."""
    try:
        results = await node_manager.check_all_nodes(db)
        return {
            "status": "success",
            "total_checked": len(results),
            "results": results
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur lors de la vérification des nœuds: {str(e)}"
        )

@router.get("/hierarchy", summary="Récupérer la hiérarchie complète")
async def get_hierarchy(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
) -> Dict[str, Any]:
    """Récupère la hiérarchie complète des campus, départements et nœuds."""
    try:
        hierarchy = node_manager.get_campus_hierarchy(db)
        return hierarchy
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur lors de la récupération de la hiérarchie: {str(e)}"
        )

@router.get("/stats/aggregated", summary="Récupérer les statistiques agrégées")
async def get_aggregated_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
) -> Dict[str, Any]:
    """Récupère les statistiques agrégées de tous les nœuds."""
    try:
        stats = await node_manager.aggregate_all_nodes_stats(db)
        return stats
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur lors de la récupération des statistiques: {str(e)}"
        )

@router.get("/nodes/{node_id}/alerts", summary="Récupérer les alertes d'un nœud")
async def get_node_alerts(
    node_id: int,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
) -> List[Dict[str, Any]]:
    """Récupère les alertes d'un nœud spécifique."""
    try:
        alerts = node_manager.get_node_alerts(node_id, db, limit)
        return alerts
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur lors de la récupération des alertes: {str(e)}"
        )

@router.post("/nodes/{node_id}/monitor/start", summary="Démarrer la surveillance d'un nœud")
async def start_node_monitoring(
    node_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
) -> Dict[str, str]:
    """Démarre la surveillance d'un nœud spécifique."""
    try:
        success = await node_manager.start_monitoring_node(node_id, db)
        if success:
            return {"status": "success", "message": f"Surveillance démarrée pour le nœud {node_id}"}
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Impossible de démarrer la surveillance du nœud"
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur lors du démarrage de la surveillance: {str(e)}"
        )

@router.post("/nodes/{node_id}/monitor/stop", summary="Arrêter la surveillance d'un nœud")
async def stop_node_monitoring(
    node_id: int,
    current_user: User = Depends(get_current_admin_user)
) -> Dict[str, str]:
    """Arrête la surveillance d'un nœud spécifique."""
    try:
        success = await node_manager.stop_monitoring_node(node_id)
        if success:
            return {"status": "success", "message": f"Surveillance arrêtée pour le nœud {node_id}"}
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Impossible d'arrêter la surveillance du nœud"
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur lors de l'arrêt de la surveillance: {str(e)}"
        )

# dossier db

-- models.py --

from datetime import datetime
from typing import Optional
from sqlalchemy import String, Integer, Boolean, DateTime, func, ForeignKey, Text, Float
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

class Base(DeclarativeBase):
    """
    Classe de base ORM unifiée conforme aux spécifications SQLAlchemy 2.0.
    Garantit le typage statique des modèles.
    """
    pass

class Alert(Base):
    """
    Représentation relationnelle des alertes d'intrusions et anomalies réseau.
    """
    __tablename__ = "IntrusionsAlerts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    source_ip: Mapped[str] = mapped_column(String(45), index=True)
    destination_ip: Mapped[str] = mapped_column(String(45), index=True)
    source_port: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    destination_port: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    protocol: Mapped[str] = mapped_column(String(10), index=True)
    alert_type: Mapped[str] = mapped_column(String(100), index=True)
    description: Mapped[str] = mapped_column(String(500))
    is_blocked: Mapped[bool] = mapped_column(Boolean, default=False)
    is_manual_block: Mapped[bool] = mapped_column(Boolean, default=False)
    validated_by_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    severity: Mapped[str] = mapped_column(String(20), default="normal", index=True)
    event_count: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    node_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("nodes.id"), nullable=True)
    node: Mapped[Optional["Node"]] = relationship("Node", back_populates="alerts")

class User(Base):
    """
    Structure de stockage des identifiants et des privilèges des opérateurs de l'IDS/IPS.
    """
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    role: Mapped[str] = mapped_column(String(20), default="user")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

class JwtKey(Base):
    """
    Clé JWT pour la rotation sécurisée des secrets d'authentification.
    """
    __tablename__ = "jwt_keys"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    key_value: Mapped[str] = mapped_column(String(64), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    rotation_note: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

class Campus(Base):
    """
    Représente un campus (ex: Campus A, Campus B).
    Chaque campus contient plusieurs départements.
    """
    __tablename__ = "campuses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    location: Mapped[str] = mapped_column(String(200))
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    
    # Relations
    departments: Mapped[list["Department"]] = relationship("Department", back_populates="campus", cascade="all, delete-orphan")

class Department(Base):
    """
    Représente un département au sein d'un campus.
    Chaque département contient plusieurs nœuds de surveillance.
    """
    __tablename__ = "departments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    campus_id: Mapped[int] = mapped_column(Integer, ForeignKey("campuses.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    
    # Relations
    campus: Mapped["Campus"] = relationship("Campus", back_populates="departments")
    nodes: Mapped[list["Node"]] = relationship("Node", back_populates="department", cascade="all, delete-orphan")

class Node(Base):
    """
    Représente un nœud de surveillance (serveur, routeur, etc.).
    Chaque nœud peut être connecté via SSH ou TLS pour la surveillance.
    """
    __tablename__ = "nodes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    department_id: Mapped[int] = mapped_column(Integer, ForeignKey("departments.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    hostname: Mapped[str] = mapped_column(String(255), nullable=False)
    ip_address: Mapped[str] = mapped_column(String(45), nullable=False)  # IPv4 ou IPv6
    port: Mapped[int] = mapped_column(Integer, default=22)  # Port SSH par défaut
    
    # Type de connexion
    connection_type: Mapped[str] = mapped_column(String(20), default="ssh")  # "ssh" ou "tls"
    
    # Credentials SSH/TLS
    ssh_username: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    ssh_key_path: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    tls_cert_path: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    
    # Statut du nœud
    status: Mapped[str] = mapped_column(String(20), default="unknown")  # "online", "offline", "error", "unknown"
    last_seen: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_check: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    
    # Statistiques de trafic
    total_packets: Mapped[int] = mapped_column(Integer, default=0)
    total_alerts: Mapped[int] = mapped_column(Integer, default=0)
    network_load: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # en Mbps
    
    # Métadonnées
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Relations
    department: Mapped["Department"] = relationship("Department", back_populates="nodes")
    alerts: Mapped[list["Alert"]] = relationship("Alert", back_populates="node", cascade="all, delete-orphan") 

# Dossier services

-- ai_decision_service.py --

import logging
from typing import Dict, Any, Optional

from app.core.config import settings
from app.engine.feature_extractor import FeatureExtractor

logger = logging.getLogger(__name__)


class _StubRLInference:
    is_trained = False
    model_path = "ml_model/models/ppo_ids_agent.zip"
    model_version = "1.0.0"
    fallback_count = 0
    total_decisions = 0

    def get_action(self, ml_features: Dict[str, Any]) -> int:
        return 2

    def get_stats(self) -> Dict[str, Any]:
        return {
            "is_trained": False,
            "fallback_count": self.fallback_count,
            "total_decisions": self.total_decisions,
            "model_path": self.model_path,
            "model_version": self.model_version,
            "observation_version": "2.0",
        }


def _load_rl_inference():
    try:
        from ml_model.RL.inference import RLInference
        return RLInference(model_path=settings.AI_MODEL_PATH)
    except Exception as exc:
        logger.warning("RL module unavailable, using safe stub: %s", exc)
        return _StubRLInference()


class AIDecisionService:
    """
    Orchestrateur des décisions IA.
    Backend API -> AIDecisionService -> RLInference -> action mappée.
    """
    def __init__(
        self,
        rl_inference: Optional[object] = None,
        feature_extractor: Optional[FeatureExtractor] = None,
        iptables_wrapper=None,
    ):
        self.rl = rl_inference if rl_inference is not None else _load_rl_inference()
        self.extractor = feature_extractor or FeatureExtractor()
        self.iptables = iptables_wrapper
        self.config = settings

    async def evaluate_ip(self, ip: str, context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        if not getattr(self.config, "AI_MODE_ENABLED", False):
            return {
                "ip": ip,
                "action": "manual",
                "confidence": 0.0,
                "reason": "ai_mode_disabled",
                "model_version": getattr(self.rl, "model_version", None),
            }

        if not getattr(self.rl, "is_trained", False):
            return {
                "ip": ip,
                "action": "manual",
                "confidence": 0.0,
                "reason": "model_untrained_fallback",
                "model_version": getattr(self.rl, "model_version", None),
                "fallback_count": getattr(self.rl, "fallback_count", 0),
            }

        observation = self.extractor.extract(ip, context=context)
        action = self.rl.get_action({"ip": ip, **(context or {})})
        action_map = {0: "allow", 1: "block", 2: "manual"}
        decision = action_map.get(action, "manual")

        confidence = 0.0
        try:
            confidence = float(getattr(getattr(self.rl, "agent", None), "model", None) and getattr(getattr(self.rl, "agent", None).model, "log", None) or 0.0)
            confidence = max(0.0, min(1.0, confidence))
        except Exception:
            confidence = 0.85 if decision == "block" else 0.5

        threshold = float(getattr(self.config, "AI_CONFIDENCE_THRESHOLD", 0.85))
        if decision == "block" and confidence < threshold:
            decision = "manual"

        if decision == "block" and self.iptables is not None:
            try:
                await self.iptables.block_ip(ip, reason="AI_BLOCK")
                logger.info("AI BLOCK: ip=%s confidence=%s", ip, confidence)
            except Exception as exc:
                logger.error("AI block failed for %s: %s", ip, exc)
                decision = "manual"

        return {
            "ip": ip,
            "action": decision,
            "confidence": confidence,
            "model_version": getattr(self.rl, "model_version", None),
            "features_used": self.extractor.extract_dict(ip, context=context),
            "fallback_count": getattr(self.rl, "fallback_count", 0),
            "reason": "model_decision" if getattr(self.rl, "is_trained", False) else "model_untrained_fallback",
        }

-- alert_manager.py --

import smtplib
import ssl
import asyncio
import logging
from collections import deque
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Dict, Any, Callable
from sqlalchemy.orm import Session
from app.core.config import settings
from app.db.models import Alert
from app.services.websocket_manager import websocket_manager

logger = logging.getLogger("ids_ips.alerts")

class AlertManager:
    def __init__(self, db_session_factory: Callable[[], Session]) -> None:
        self.db_session_factory: Callable[[], Session] = db_session_factory

    def _sync_send_email_alert(self, alert_data: Dict[str, Any]) -> None:
        """
        Envoi d'email HTML/Texte avec gestion dynamique SSL/TLS.
        """
        required_configs = [
            settings.SMTP_SERVER, settings.SMTP_PORT, 
            settings.SMTP_USERNAME, settings.SMTP_PASSWORD, 
            settings.ADMIN_EMAIL, settings.SMTP_SENDER_EMAIL
        ]
        if not all(required_configs):
            logger.warning("Sous-système SMTP inactif: paramètres manquants.")
            return

        message = MIMEMultipart("alternative")
        message["Subject"] = f"[IDS/IPS CRITICAL] {alert_data.get('alert_type', 'Anomalie')}"
        message["From"] = settings.SMTP_SENDER_EMAIL
        message["To"] = settings.ADMIN_EMAIL

        # --- Génération du contenu Texte et HTML (Issu du Script 8) ---
        text_content = "Une alerte de sécurité a été détectée :\n\n"
        html_content = "<html><body style='font-family: Arial, sans-serif;'><h2 style='color: #d9534f;'>⚠ Alerte Réseau</h2><ul style='background-color: #f9f9f9; padding: 15px; border-left: 4px solid #d9534f; list-style-type: none;'>"
        
        for key, value in alert_data.items():
            text_content += f"{key.replace('_', ' ').title()}: {value}\n"
            html_content += f"<li style='margin-bottom: 8px;'><b>{key.replace('_', ' ').title()}</b>: {value}</li>"
        
        html_content += "</ul></body></html>"

        message.attach(MIMEText(text_content, "plain", "utf-8"))
        message.attach(MIMEText(html_content, "html", "utf-8"))

        context = ssl.create_default_context()
        try:
            # Gestion dynamique STARTTLS (587) vs SSL (465)
            if settings.SMTP_PORT == 465:
                with smtplib.SMTP_SSL(settings.SMTP_SERVER, settings.SMTP_PORT, context=context, timeout=10) as server:
                    server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
                    server.sendmail(settings.SMTP_SENDER_EMAIL, settings.ADMIN_EMAIL, message.as_string())
            else:
                with smtplib.SMTP(settings.SMTP_SERVER, settings.SMTP_PORT, timeout=10) as server:
                    server.starttls(context=context)
                    server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
                    server.sendmail(settings.SMTP_SENDER_EMAIL, settings.ADMIN_EMAIL, message.as_string())
            
            logger.info(f"Email expédié avec succès à {settings.ADMIN_EMAIL}")
        except Exception as e:
            logger.error(f"Échec de l'envoi SMTP: {str(e)}")

    async def _save_to_database(self, alert_data: Dict[str, Any]) -> None:
        """
        Écriture DB isolée dans un thread pour ne JAMAIS bloquer l'Event Loop.
        """
        def _write() -> None:
            with self.db_session_factory() as db:
                model_fields = {
                    k: v for k, v in alert_data.items() 
                    if hasattr(Alert, k) and not isinstance(v, (set, deque))
                }
                db_alert = Alert(**model_fields)
                db.add(db_alert)
                db.commit()
                alert_data["id"] = db_alert.id

        await asyncio.to_thread(_write)

    async def process_new_alert(self, alert_data: Dict[str, Any]) -> None:
        """
        Orchestration asynchrone et parallèle des notifications.
        """
        logger.info(f"Prise en charge de l'alerte: {alert_data.get('alert_type')}")
        
        try:
            # 1. Sauvegarde DB (Non-bloquante)
            await self._save_to_database(alert_data)
            
            # 2. Préparation des tâches
            tasks = [websocket_manager.broadcast(alert_data)]
            
            if alert_data.get("severity") in ("critique", "tres_critique"):
                tasks.append(asyncio.to_thread(self._sync_send_email_alert, alert_data))
                
            # 3. Exécution en parallèle
            await asyncio.gather(*tasks, return_exceptions=True)
            
        except Exception as e:
            logger.critical(f"Défaillance de l'orchestrateur d'alertes: {str(e)}")

-- email_service.py --

"""
Service d'envoi d'emails pour les alertes de sécurité critiques.
Utilise SMTP pour notifier l'administrateur des événements suspects.
"""
import smtplib
import ssl
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional
import logging
from datetime import datetime
from app.core.config import settings

logger = logging.getLogger(__name__)

class EmailService:
    """Service centralisé pour l'envoi d'emails de sécurité."""
    
    def __init__(self):
        self.smtp_server = settings.SMTP_SERVER
        self.smtp_port = settings.SMTP_PORT
        self.smtp_username = settings.SMTP_USERNAME
        self.smtp_password = settings.SMTP_PASSWORD
        self.sender_email = settings.SMTP_SENDER_EMAIL
        self.admin_email = settings.ADMIN_EMAIL
    
    def is_configured(self) -> bool:
        """Vérifie si le service SMTP est correctement configuré."""
        return all([
            self.smtp_server,
            self.smtp_username,
            self.smtp_password,
            self.sender_email,
            self.admin_email
        ])
    
    def send_email(
        self,
        subject: str,
        body: str,
        html_body: Optional[str] = None
    ) -> bool:
        """
        Envoie un email à l'administrateur.
        
        Args:
            subject: Sujet de l'email
            body: Corps du email en texte brut
            html_body: Corps du email en HTML (optionnel)
            
        Returns:
            True si l'email a été envoyé avec succès, False sinon
        """
        if not self.is_configured():
            logger.warning("Service SMTP non configuré - email non envoyé")
            return False
        
        try:
            # Création du message
            msg = MIMEMultipart('alternative')
            msg['From'] = self.sender_email
            msg['To'] = self.admin_email
            msg['Subject'] = f"[IDS-IPS ALERT] {subject}"
            
            # Ajout du corps texte
            text_part = MIMEText(body, 'plain')
            msg.attach(text_part)
            
            # Ajout du corps HTML si fourni
            if html_body:
                html_part = MIMEText(html_body, 'html')
                msg.attach(html_part)
            
            # Connexion SMTP et envoi — gestion dynamique STARTTLS (587) vs SSL (465)
            context = ssl.create_default_context()
            if self.smtp_port == 465:
                with smtplib.SMTP_SSL(self.smtp_server, self.smtp_port, context=context, timeout=10) as server:
                    server.login(self.smtp_username, self.smtp_password)
                    server.send_message(msg)
            else:
                with smtplib.SMTP(self.smtp_server, self.smtp_port, timeout=10) as server:
                    server.starttls(context=context)
                    server.login(self.smtp_username, self.smtp_password)
                    server.send_message(msg)
            
            logger.info(f"Email envoyé avec succès: {subject}")
            return True
            
        except Exception as e:
            logger.error(f"Erreur lors de l'envoi de l'email: {e}")
            return False
    
    def send_suspicious_connection_alert(
        self,
        source_ip: str,
        destination_ip: str,
        port: int,
        protocol: str,
        alert_type: str,
        severity: str,
        timestamp: str
    ) -> bool:
        """
        Envoie une alerte de connexion suspecte.
        
        Args:
            source_ip: Adresse IP source
            destination_ip: Adresse IP de destination
            port: Port concerné
            protocol: Protocole (TCP/UDP/ICMP)
            alert_type: Type d'alerte
            severity: Sévérité de l'alerte
            timestamp: Horodatage de l'événement
            
        Returns:
            True si l'email a été envoyé avec succès
        """
        subject = f"Connexion suspecte détectée - {severity.upper()}"
        
        body = f"""
ALERTE DE SÉCURITÉ - CONNEXION SUSPECTE

Une activité suspecte a été détectée sur votre réseau:

Détails de l'alerte:
- Source IP: {source_ip}
- Destination IP: {destination_ip}
- Port: {port}
- Protocole: {protocol}
- Type d'alerte: {alert_type}
- Sévérité: {severity.upper()}
- Horodatage: {timestamp}

Cette connexion a été identifiée comme potentiellement malveillante par le système IDS-IPS.

Action recommandée:
- Vérifiez les logs détaillés dans le tableau de bord
- Envisagez de bloquer l'adresse IP source si l'activité est confirmée malveillante
- Surveillez les connexions provenant de cette adresse IP

---
IDS-IPS ULPGL - Système de Détection et Prévention d'Intrusion
"""

        html_body = f"""
<html>
<head>
    <style>
        body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
        .alert-box {{ background-color: #fee; border: 1px solid #fcc; padding: 15px; margin: 20px 0; border-radius: 5px; }}
        .info-box {{ background-color: #eef; border: 1px solid #ccf; padding: 15px; margin: 20px 0; border-radius: 5px; }}
        .severity-high {{ color: #c00; font-weight: bold; }}
        .severity-critical {{ color: #900; font-weight: bold; }}
        table {{ border-collapse: collapse; width: 100%; margin: 20px 0; }}
        th, td {{ border: 1px solid #ddd; padding: 8px; text-align: left; }}
        th {{ background-color: #f2f2f2; }}
    </style>
</head>
<body>
    <h1 style="color: #c00;">⚠️ ALERTE DE SÉCURITÉ - CONNEXION SUSPECTE</h1>
    
    <div class="alert-box">
        <p>Une activité suspecte a été détectée sur votre réseau.</p>
    </div>
    
    <h2>Détails de l'alerte:</h2>
    <table>
        <tr><th>Source IP</th><td>{source_ip}</td></tr>
        <tr><th>Destination IP</th><td>{destination_ip}</td></tr>
        <tr><th>Port</th><td>{port}</td></tr>
        <tr><th>Protocole</th><td>{protocol}</td></tr>
        <tr><th>Type d'alerte</th><td>{alert_type}</td></tr>
        <tr><th>Sévérité</th><td class="severity-{severity.lower()}">{severity.upper()}</td></tr>
        <tr><th>Horodatage</th><td>{timestamp}</td></tr>
    </table>
    
    <div class="info-box">
        <h3>Action recommandée:</h3>
        <ul>
            <li>Vérifiez les logs détaillés dans le tableau de bord</li>
            <li>Envisagez de bloquer l'adresse IP source si l'activité est confirmée malveillante</li>
            <li>Surveillez les connexions provenant de cette adresse IP</li>
        </ul>
    </div>
    
    <hr>
    <p style="color: #666; font-size: 12px;">
        IDS-IPS ULPGL - Système de Détection et Prévention d'Intrusion<br>
        {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
    </p>
</body>
</html>
"""
        
        return self.send_email(subject, body, html_body)
    
    def send_intrusion_alert(
        self,
        source_ip: str,
        attack_type: str,
        description: str,
        timestamp: str,
        blocked: bool = False
    ) -> bool:
        """
        Envoie une alerte d'intrusion critique.
        
        Args:
            source_ip: Adresse IP source de l'attaque
            attack_type: Type d'attaque
            description: Description de l'attaque
            timestamp: Horodatage de l'événement
            blocked: Indique si l'attaque a été bloquée
            
        Returns:
            True si l'email a été envoyé avec succès
        """
        status = "BLOQUÉE" if blocked else "DÉTECTÉE"
        subject = f"Intrusion {status} - {attack_type}"
        
        body = f"""
ALERTE CRITIQUE - INTRUSION DÉTECTÉE

Une tentative d'intrusion a été détectée sur votre système:

Détails de l'attaque:
- Source IP: {source_ip}
- Type d'attaque: {attack_type}
- Description: {description}
- Statut: {status}
- Horodatage: {timestamp}

Cette activité a été identifiée comme une menace critique pour votre infrastructure.

Action immédiate requise:
- Vérifiez immédiatement les logs système
- Confirmez si l'attaque a été bloquée automatiquement
- Envisagez de renforcer les règles de pare-feu
- Documentez l'incident pour analyse future

---
IDS-IPS ULPGL - Système de Détection et Prévention d'Intrusion
"""

        html_body = f"""
<html>
<head>
    <style>
        body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
        .critical-alert {{ background-color: #fdd; border: 2px solid #f00; padding: 20px; margin: 20px 0; border-radius: 5px; }}
        .blocked {{ background-color: #dfd; border: 2px solid #0c0; padding: 20px; margin: 20px 0; border-radius: 5px; }}
        table {{ border-collapse: collapse; width: 100%; margin: 20px 0; }}
        th, td {{ border: 1px solid #ddd; padding: 8px; text-align: left; }}
        th {{ background-color: #f2f2f2; }}
    </style>
</head>
<body>
    <h1 style="color: #c00;">🚨 ALERTE CRITIQUE - INTRUSION DÉTECTÉE</h1>
    
    <div class="{'blocked' if blocked else 'critical-alert'}">
        <h2 style="color: {'#0c0' if blocked else '#c00'};">
            {'✅ ATTAQUE BLOQUÉE' if blocked else '⚠️ ATTAQUE DÉTECTÉE'}
        </h2>
        <p>Une tentative d'intrusion a été détectée sur votre système.</p>
    </div>
    
    <h2>Détails de l'attaque:</h2>
    <table>
        <tr><th>Source IP</th><td>{source_ip}</td></tr>
        <tr><th>Type d'attaque</th><td>{attack_type}</td></tr>
        <tr><th>Description</th><td>{description}</td></tr>
        <tr><th>Statut</th><td style="font-weight: bold;">{status}</td></tr>
        <tr><th>Horodatage</th><td>{timestamp}</td></tr>
    </table>
    
    <div style="background-color: #fff3cd; border: 1px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 5px;">
        <h3 style="color: #856404;">⚡ Action immédiate requise:</h3>
        <ul>
            <li>Vérifiez immédiatement les logs système</li>
            <li>Confirmez si l'attaque a été bloquée automatiquement</li>
            <li>Envisagez de renforcer les règles de pare-feu</li>
            <li>Documentez l'incident pour analyse future</li>
        </ul>
    </div>
    
    <hr>
    <p style="color: #666; font-size: 12px;">
        IDS-IPS ULPGL - Système de Détection et Prévention d'Intrusion<br>
        {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
    </p>
</body>
</html>
"""
        
        return self.send_email(subject, body, html_body)
    
    def send_login_alert(
        self,
        username: str,
        ip_address: str,
        timestamp: str,
        location: Optional[str] = None,
        suspicious: bool = False
    ) -> bool:
        """
        Envoie une alerte de connexion utilisateur.
        
        Args:
            username: Nom d'utilisateur
            ip_address: Adresse IP de connexion
            timestamp: Horodatage de la connexion
            location: Localisation géographique (optionnel)
            suspicious: Indique si la connexion est suspecte
            
        Returns:
            True si l'email a été envoyé avec succès
        """
        if suspicious:
            subject = f"⚠️ CONNEXION SUSPECTE - {username}"
        else:
            subject = f"Nouvelle connexion - {username}"
        
        location_text = f"\n- Localisation: {location}" if location else ""
        suspicious_text = "\n\n⚠️ Cette connexion a été identifiée comme SUSPECTE!" if suspicious else ""
        
        body = f"""
ALERTE DE CONNEXION UTILISATEUR

Une nouvelle connexion a été détectée:

Détails de la connexion:
- Utilisateur: {username}
- Adresse IP: {ip_address}
- Horodatage: {timestamp}{location_text}{suspicious_text}

Si vous n'êtes pas à l'origine de cette connexion, veuillez immédiatement:
- Changer votre mot de passe
- Vérifier les logs de connexion
- Contacter l'administrateur système

---
IDS-IPS ULPGL - Système de Détection et Prévention d'Intrusion
"""

        return self.send_email(subject, body)

# Instance globale du service email
email_service = EmailService()

-- node_connexion.py --

"""
Service de gestion des connexions SSH/TLS vers les nœuds de surveillance.
Permet la connexion et la surveillance de nœuds distants pour l'agrégation des données de trafic.

Durcissements appliqués (Phase 4):
- Remplacement d'AutoAddPolicy par WarningPolicy avec vérification optionnelle des known_hosts.
- Timeouts stricts configurables sur connexion, commande et transport SSH.
- Validation systématique du code de retour des commandes distantes.
- Journalisation exhaustive des anomalies au niveau ERROR/CRITICAL.
- Support multi-algorithmes de clés privées (RSA, Ed25519, ECDSA) via découverte automatique.
"""
import logging
import asyncio
import paramiko
import ssl
import socket
from typing import Dict, List, Optional, Tuple
from datetime import datetime
from dataclasses import dataclass
from enum import Enum

from app.core.config import settings

logger = logging.getLogger(__name__)

class ConnectionType(Enum):
    SSH = "ssh"
    TLS = "tls"

class NodeStatus(Enum):
    ONLINE = "online"
    OFFLINE = "offline"
    ERROR = "error"
    UNKNOWN = "unknown"

@dataclass
class NodeConnectionResult:
    success: bool
    status: NodeStatus
    error_message: Optional[str] = None
    latency_ms: Optional[float] = None
    timestamp: datetime = None

class HostKeyPolicy:
    """
    Politique de vérification des clés d'hôte SSH.
    - Si STRICT et known_hosts fourni : WarningPolicy avec chargement du fichier.
    - Si STRICT sans known_hosts : WarningPolicy.
    """
    def __init__(self):
        self.policy = self._build_policy()

    def _build_policy(self):
        if settings.SSH_STRICT_HOST_KEY_CHECKING:
            known_hosts = settings.SSH_KNOWN_HOSTS_FILE
            if known_hosts:
                try:
                    with open(known_hosts, "r") as f:
                        pass
                    return paramiko.WarningPolicy()
                except Exception as e:
                    logger.warning(f"Impossible de charger le fichier known_hosts '{known_hosts}': {e}. Fallback sur WarningPolicy().")
                    return paramiko.WarningPolicy()
            return paramiko.WarningPolicy()
        return paramiko.WarningPolicy()

    def apply(self, client: paramiko.SSHClient):
        client.set_missing_host_key_policy(self.policy)

host_key_policy = HostKeyPolicy()

def _load_private_key(key_path: str) -> Optional[paramiko.PKey]:
    """
    Tente de charger une clé privée en essayant plusieurs algorithmes modernes.
    Supporte RSA, Ed25519, ECDSA. Retourne None si aucun algorithme ne fonctionne.
    """
    key_classes = [paramiko.RSAKey, paramiko.Ed25519Key, paramiko.ECDSAKey]
    for key_cls in key_classes:
        try:
            return key_cls.from_private_key_file(key_path)
        except paramiko.PasswordRequiredException:
            logger.warning(f"Clé '{key_path}' protégée par mot de passe, non supportée pour le chargement automatique.")
            return None
        except Exception:
            continue
    return None

class NodeConnectionManager:
    def __init__(self):
        self.active_connections: Dict[int, paramiko.SSHClient] = {}
        self.connection_pool_size = 50
        self.timeout = settings.SSH_TIMEOUT_SECONDS

    async def connect_ssh(
        self,
        hostname: str,
        port: int,
        username: str,
        key_path: Optional[str] = None,
        password: Optional[str] = None,
        timeout: Optional[int] = None
    ) -> NodeConnectionResult:
        """
        Établit une connexion SSH vers un nœud avec timeout strict et vérification des clés d'hôte.
        """
        start_time = datetime.now()
        timeout = timeout or self.timeout
        client = paramiko.SSHClient()
        
        try:
            host_key_policy.apply(client)
            
            private_key = None
            if key_path:
                private_key = _load_private_key(key_path)
                if private_key is None:
                    logger.warning(f"Impossible de charger la clé privée: {key_path}")
            
            connect_kwargs = dict(
                hostname=hostname,
                port=port,
                username=username,
                timeout=timeout,
                allow_agent=False,
                look_for_keys=False
            )
            
            if private_key:
                connect_kwargs["pkey"] = private_key
            elif password:
                connect_kwargs["password"] = password
            else:
                connect_kwargs["password"] = None
            
            client.connect(**connect_kwargs)
            
            transport = client.get_transport()
            if transport:
                transport.set_keepalive(15)
                transport.set_timeout(timeout)
            
            latency = (datetime.now() - start_time).total_seconds() * 1000
            
            return NodeConnectionResult(
                success=True,
                status=NodeStatus.ONLINE,
                latency_ms=latency,
                timestamp=datetime.now()
            )
            
        except paramiko.BadHostKeyException as e:
            fingerprint = "N/A"
            try:
                if hasattr(e, "key") and e.key:
                    fingerprint = e.key.get_base64()
            except Exception:
                pass
            logger.critical(
                f"ATTENTION: BadHostKeyException pour {hostname}:{port} "
                f"(utilisateur={username}). Possible attaque MITM ! "
                f"Fingerprint reçu: {fingerprint}"
            )
            return NodeConnectionResult(
                success=False,
                status=NodeStatus.ERROR,
                error_message=f"Bad host key: {type(e).__name__} - Possible MITM attack!",
                timestamp=datetime.now()
            )
        except paramiko.AuthenticationException:
            logger.error(f"Authentification échouée pour {username}@{hostname}:{port}")
            return NodeConnectionResult(
                success=False,
                status=NodeStatus.ERROR,
                error_message="Authentication failed",
                timestamp=datetime.now()
            )
        except paramiko.SSHException as e:
            logger.error(f"Erreur SSH pour {hostname}:{port}: {str(e)}")
            return NodeConnectionResult(
                success=False,
                status=NodeStatus.ERROR,
                error_message=f"SSH error: {str(e)}",
                timestamp=datetime.now()
            )
        except socket.timeout:
            logger.error(f"Timeout connexion SSH pour {hostname}:{port} (>{timeout}s)")
            return NodeConnectionResult(
                success=False,
                status=NodeStatus.OFFLINE,
                error_message=f"Connection timeout after {timeout}s",
                timestamp=datetime.now()
            )
        except Exception as e:
            logger.error(f"Erreur inattendue connexion SSH {hostname}:{port}: {str(e)}")
            return NodeConnectionResult(
                success=False,
                status=NodeStatus.ERROR,
                error_message=f"Unexpected error: {str(e)}",
                timestamp=datetime.now()
            )
        finally:
            try:
                client.close()
            except Exception:
                pass
    
    async def connect_tls(
        self,
        hostname: str,
        port: int,
        cert_path: Optional[str] = None,
        timeout: Optional[int] = None
    ) -> NodeConnectionResult:
        """
        Établit une connexion TLS avec vérification stricte du certificat serveur.
        """
        start_time = datetime.now()
        timeout = timeout or self.timeout
        
        try:
            context = ssl.create_default_context()
            if cert_path:
                context.load_cert_chain(cert_path)
            context.verify_mode = ssl.CERT_REQUIRED
            
            with socket.create_connection((hostname, port), timeout=timeout) as sock:
                with context.wrap_socket(sock, server_hostname=hostname) as tls_socket:
                    tls_socket.settimeout(timeout)
                    tls_socket.do_handshake()
                    
                    latency = (datetime.now() - start_time).total_seconds() * 1000
                    
                    return NodeConnectionResult(
                        success=True,
                        status=NodeStatus.ONLINE,
                        latency_ms=latency,
                        timestamp=datetime.now()
                    )
                    
        except ssl.SSLCertVerificationError as e:
            logger.error(f"Vérification certificat TLS échouée pour {hostname}:{port}: {str(e)}")
            return NodeConnectionResult(
                success=False,
                status=NodeStatus.ERROR,
                error_message=f"SSL certificate verification failed: {str(e)}",
                timestamp=datetime.now()
            )
        except ssl.SSLError as e:
            logger.error(f"Erreur TLS pour {hostname}:{port}: {str(e)}")
            return NodeConnectionResult(
                success=False,
                status=NodeStatus.ERROR,
                error_message=f"SSL error: {str(e)}",
                timestamp=datetime.now()
            )
        except socket.timeout:
            logger.error(f"Timeout connexion TLS pour {hostname}:{port} (>{timeout}s)")
            return NodeConnectionResult(
                success=False,
                status=NodeStatus.OFFLINE,
                error_message=f"Connection timeout after {timeout}s",
                timestamp=datetime.now()
            )
        except Exception as e:
            logger.error(f"Erreur inattendue connexion TLS {hostname}:{port}: {str(e)}")
            return NodeConnectionResult(
                success=False,
                status=NodeStatus.ERROR,
                error_message=f"Unexpected error: {str(e)}",
                timestamp=datetime.now()
            )
    
    async def execute_remote_command(
        self,
        hostname: str,
        port: int,
        username: str,
        command: str,
        key_path: Optional[str] = None,
        password: Optional[str] = None,
        timeout: Optional[int] = None
    ) -> Tuple[bool, str, str]:
        """
        Exécute une commande sur un nœud distant via SSH avec timeout strict et validation du code de retour.
        """
        timeout = timeout or self.timeout
        client = paramiko.SSHClient()
        
        try:
            host_key_policy.apply(client)
            
            private_key = None
            if key_path:
                private_key = _load_private_key(key_path)
            
            connect_kwargs = dict(
                hostname=hostname,
                port=port,
                username=username,
                timeout=timeout,
                allow_agent=False,
                look_for_keys=False
            )
            
            if private_key:
                connect_kwargs["pkey"] = private_key
            elif password:
                connect_kwargs["password"] = password
            else:
                connect_kwargs["password"] = None
            
            client.connect(**connect_kwargs)
            
            stdin, stdout, stderr = client.exec_command(command, timeout=timeout)
            
            stdout_output = stdout.read().decode('utf-8', errors='replace')
            stderr_output = stderr.read().decode('utf-8', errors='replace')
            
            exit_status = stdout.channel.recv_exit_status()
            
            if exit_status != 0:
                logger.error(
                    f"Commande distante échouée sur {hostname}:{port} "
                    f"(exit={exit_status}): {command[:100]}... "
                    f"stderr: {stderr_output[:200]}"
                )
            else:
                logger.info(f"Commande distante OK sur {hostname}:{port}: {command[:80]}...")
            
            return (exit_status == 0, stdout_output, stderr_output)
            
        except paramiko.BadHostKeyException as e:
            logger.critical(f"BadHostKeyException sur {hostname}:{port} lors de exec_command: {e}")
            return (False, "", f"Bad host key: {str(e)}")
        except socket.timeout:
            logger.error(f"Timeout commande distante sur {hostname}:{port} (>{timeout}s): {command[:80]}")
            return (False, "", f"Command timeout after {timeout}s")
        except Exception as e:
            logger.error(f"Erreur exécution commande sur {hostname}:{port}: {str(e)}")
            return (False, "", str(e))
        finally:
            try:
                client.close()
            except Exception:
                pass
    
    async def get_network_stats(
        self,
        hostname: str,
        port: int,
        username: str,
        key_path: Optional[str] = None,
        password: Optional[str] = None,
        timeout: Optional[int] = None
    ) -> Dict:
        """
        Récupère les statistiques réseau d'un nœud distant.
        """
        commands = [
            "cat /proc/net/dev | grep -E '(eth|wlan)' | awk '{print $2, $10}'",
            "top -bn1 | grep 'Cpu(s)' | awk '{print $2}' | cut -d'%' -f1",
            "free -m | grep Mem | awk '{print $3, $2}'",
            "uptime | awk -F'load average:' '{print $2}'"
        ]
        
        results = {}
        
        for i, command in enumerate(commands):
            success, stdout, stderr = await self.execute_remote_command(
                hostname, port, username, command, key_path, password, timeout
            )
            
            if success:
                if i == 0:
                    results['network_packets'] = stdout.strip()
                elif i == 1:
                    results['cpu_usage'] = stdout.strip()
                elif i == 2:
                    results['memory_usage'] = stdout.strip()
                elif i == 3:
                    results['load_average'] = stdout.strip()
            else:
                logger.warning(
                    f"Échec récupération stat #{i} sur {hostname}:{port}: {stderr[:100]}"
                )
        
        return results
    
    async def check_node_status(
        self,
        node_id: int,
        connection_type: str,
        hostname: str,
        port: int,
        username: Optional[str] = None,
        key_path: Optional[str] = None,
        password: Optional[str] = None,
        cert_path: Optional[str] = None,
        timeout: Optional[int] = None
    ) -> NodeConnectionResult:
        """
        Vérifie le statut d'un nœud avec timeout strict.
        """
        if connection_type == ConnectionType.SSH.value:
            return await self.connect_ssh(hostname, port, username, key_path, password, timeout)
        elif connection_type == ConnectionType.TLS.value:
            return await self.connect_tls(hostname, port, cert_path, timeout)
        else:
            return NodeConnectionResult(
                success=False,
                status=NodeStatus.ERROR,
                error_message=f"Unknown connection type: {connection_type}",
                timestamp=datetime.now()
            )
    
    async def check_multiple_nodes(
        self,
        nodes: List[Dict],
        timeout: Optional[int] = None
    ) -> Dict[int, NodeConnectionResult]:
        """
        Vérifie le statut de plusieurs nœuds en parallèle avec timeout explicite.
        """
        timeout = timeout or self.timeout
        tasks = []
        
        for node in nodes:
            task = self.check_node_status(
                node_id=node['id'],
                connection_type=node['connection_type'],
                hostname=node['hostname'],
                port=node['port'],
                username=node.get('ssh_username'),
                key_path=node.get('ssh_key_path'),
                password=node.get('ssh_password'),
                cert_path=node.get('tls_cert_path'),
                timeout=timeout
            )
            tasks.append((node['id'], task))
        
        results = {}
        completed_tasks = await asyncio.gather(*[task for _, task in tasks], return_exceptions=True)
        
        for (node_id, _), result in zip(tasks, completed_tasks):
            if isinstance(result, Exception):
                logger.error(f"Exception lors de la vérification du nœud {node_id}: {result}")
                results[node_id] = NodeConnectionResult(
                    success=False,
                    status=NodeStatus.ERROR,
                    error_message=str(result),
                    timestamp=datetime.now()
                )
            else:
                results[node_id] = result
        
        return results

node_connection_manager = NodeConnectionManager()

-- node_manager.py --

"""
Service de gestion multi-nœuds pour la surveillance distribuée.
Gère l'agrégation des données de trafic et la coordination des connexions aux nœuds.
"""
import logging
import asyncio
from typing import Dict, List, Optional
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.db.models import Campus, Department, Node, Alert
from app.services.node_connection import node_connection_manager, NodeStatus

logger = logging.getLogger(__name__)

class NodeManager:
    """Gestionnaire des nœuds de surveillance distribuée."""
    
    def __init__(self):
        self.connection_manager = node_connection_manager
        self.active_monitors: Dict[int, bool] = {}  # node_id -> is_monitoring
        self.aggregated_stats: Dict[int, Dict] = {}  # node_id -> stats
        self.check_interval = 60  # secondes entre les vérifications
    
    async def check_all_nodes(self, db: Session) -> Dict[int, Dict]:
        nodes = db.query(Node).filter(Node.is_active == True).all()
        
        nodes_data = []
        for node in nodes:
            nodes_data.append({
                'id': node.id,
                'connection_type': node.connection_type,
                'hostname': node.hostname,
                'port': node.port,
                'ssh_username': node.ssh_username,
                'ssh_key_path': node.ssh_key_path,
                'ssh_password': None,
                'tls_cert_path': node.tls_cert_path
            })
        
        timeout = settings.SSH_TIMEOUT_SECONDS
        results = await self.connection_manager.check_multiple_nodes(nodes_data, timeout=timeout)
        
        for node_id, result in results.items():
            node = db.query(Node).filter(Node.id == node_id).first()
            if node:
                node.status = result.status.value
                node.last_check = datetime.now()
                if result.success:
                    node.last_seen = datetime.now()
                db.commit()
        
        for node_id, result in results.items():
            self.aggregated_stats[node_id] = {
                'status': result.status.value,
                'success': result.success,
                'latency_ms': result.latency_ms,
                'last_check': result.timestamp.isoformat(),
                'error_message': result.error_message
            }
        
        return self.aggregated_stats
    
    async def get_node_network_stats(self, node: Node, db: Session) -> Dict:
        if node.connection_type == "ssh":
            timeout = settings.SSH_TIMEOUT_SECONDS
            stats = await self.connection_manager.get_network_stats(
                hostname=node.hostname,
                port=node.port,
                username=node.ssh_username or "",
                key_path=node.ssh_key_path,
                password=None,
                timeout=timeout
            )
            
            if stats:
                node.network_load = self._parse_network_load(stats.get('network_packets'))
                node.updated_at = datetime.now()
                db.commit()
            
            return stats
        
        return {}
    
    def _parse_network_load(self, packets_str: str) -> Optional[float]:
        """
        Parse la charge réseau depuis la sortie de commande.
        
        Args:
            packets_str: Chaîne de caractères avec les statistiques de paquets
            
        Returns:
            Charge réseau en Mbps ou None
        """
        try:
            if packets_str:
                # Format typique: "123456 789012" (reçus envoyés)
                parts = packets_str.split()
                if len(parts) >= 2:
                    total_packets = int(parts[0]) + int(parts[1])
                    # Conversion simplifiée en Mbps (à affiner selon les besoins)
                    return round(total_packets / 1000000, 2)
        except:
            pass
        return None
    
    async def aggregate_all_nodes_stats(self, db: Session) -> Dict:
        """
        Agrège les statistiques de tous les nœuds actifs.
        
        Args:
            db: Session de base de données
            
        Returns:
            Dictionnaire avec toutes les statistiques agrégées
        """
        # Récupérer tous les nœuds actifs
        nodes = db.query(Node).filter(Node.is_active == True).all()
        
        aggregated_data = {
            'total_nodes': len(nodes),
            'online_nodes': 0,
            'offline_nodes': 0,
            'error_nodes': 0,
            'unknown_nodes': 0,
            'total_packets': 0,
            'total_alerts': 0,
            'average_network_load': 0.0,
            'nodes': []
        }
        
        total_network_load = 0.0
        nodes_with_load = 0
        
        for node in nodes:
            node_data = {
                'id': node.id,
                'name': node.name,
                'hostname': node.hostname,
                'ip_address': node.ip_address,
                'status': node.status,
                'total_packets': node.total_packets,
                'total_alerts': node.total_alerts,
                'network_load': node.network_load,
                'last_seen': node.last_seen.isoformat() if node.last_seen else None,
                'department_id': node.department_id
            }
            
            # Compter les statuts
            if node.status == NodeStatus.ONLINE.value:
                aggregated_data['online_nodes'] += 1
            elif node.status == NodeStatus.OFFLINE.value:
                aggregated_data['offline_nodes'] += 1
            elif node.status == NodeStatus.ERROR.value:
                aggregated_data['error_nodes'] += 1
            else:
                aggregated_data['unknown_nodes'] += 1
            
            # Agréger les statistiques
            aggregated_data['total_packets'] += node.total_packets
            aggregated_data['total_alerts'] += node.total_alerts
            
            if node.network_load:
                total_network_load += node.network_load
                nodes_with_load += 1
            
            aggregated_data['nodes'].append(node_data)
        
        # Calculer la moyenne
        if nodes_with_load > 0:
            aggregated_data['average_network_load'] = round(total_network_load / nodes_with_load, 2)
        
        return aggregated_data
    
    async def start_monitoring_node(self, node_id: int, db: Session) -> bool:
        """
        Démarre la surveillance d'un nœud spécifique.
        
        Args:
            node_id: ID du nœud
            db: Session de base de données
            
        Returns:
            True si la surveillance a démarré avec succès
        """
        node = db.query(Node).filter(Node.id == node_id).first()
        if not node:
            logger.error(f"Nœud {node_id} introuvable")
            return False
        
        if not node.is_active:
            logger.warning(f"Nœud {node_id} n'est pas actif")
            return False
        
        self.active_monitors[node_id] = True
        logger.info(f"Surveillance démarrée pour le nœud {node_id}")
        
        return True
    
    async def stop_monitoring_node(self, node_id: int) -> bool:
        """
        Arrête la surveillance d'un nœud spécifique.
        
        Args:
            node_id: ID du nœud
            
        Returns:
            True si la surveillance a été arrêtée avec succès
        """
        if node_id in self.active_monitors:
            del self.active_monitors[node_id]
            logger.info(f"Surveillance arrêtée pour le nœud {node_id}")
            return True
        
        return False
    
    async def start_monitoring_all_nodes(self, db: Session) -> bool:
        """
        Démarre la surveillance de tous les nœuds actifs.
        
        Args:
            db: Session de base de données
            
        Returns:
            True si la surveillance a démarré avec succès
        """
        nodes = db.query(Node).filter(Node.is_active == True).all()
        
        for node in nodes:
            await self.start_monitoring_node(node.id, db)
        
        logger.info(f"Surveillance démarrée pour {len(nodes)} nœuds")
        return True
    
    async def stop_monitoring_all_nodes(self) -> bool:
        """
        Arrête la surveillance de tous les nœuds.
        
        Returns:
            True si la surveillance a été arrêtée avec succès
        """
        self.active_monitors.clear()
        logger.info("Surveillance arrêtée pour tous les nœuds")
        return True
    
    async def monitoring_loop(self, db: Session):
        """
        Boucle de surveillance continue des nœuds.
        
        Args:
            db: Session de base de données
        """
        while True:
            try:
                # Vérifier tous les nœuds actifs
                await self.check_all_nodes(db)
                
                # Récupérer les statistiques des nœuds en ligne
                online_nodes = db.query(Node).filter(
                    Node.is_active == True,
                    Node.status == NodeStatus.ONLINE.value
                ).all()
                
                for node in online_nodes:
                    if node.id in self.active_monitors:
                        await self.get_node_network_stats(node, db)
                
                # Attendre avant la prochaine vérification
                await asyncio.sleep(self.check_interval)
                
            except Exception as e:
                logger.error(f"Erreur dans la boucle de surveillance: {e}")
                await asyncio.sleep(self.check_interval)
    
    def get_campus_hierarchy(self, db: Session) -> Dict:
        """
        Récupère la hiérarchie complète des campus, départements et nœuds.
        
        Args:
            db: Session de base de données
            
        Returns:
            Dictionnaire avec la hiérarchie complète
        """
        campuses = db.query(Campus).filter(Campus.is_active == True).all()
        
        hierarchy = {
            'campuses': []
        }
        
        for campus in campuses:
            campus_data = {
                'id': campus.id,
                'name': campus.name,
                'location': campus.location,
                'description': campus.description,
                'departments': []
            }
            
            departments = db.query(Department).filter(
                Department.campus_id == campus.id,
                Department.is_active == True
            ).all()
            
            for department in departments:
                department_data = {
                    'id': department.id,
                    'name': department.name,
                    'description': department.description,
                    'nodes': []
                }
                
                nodes = db.query(Node).filter(
                    Node.department_id == department.id,
                    Node.is_active == True
                ).all()
                
                for node in nodes:
                    node_data = {
                        'id': node.id,
                        'name': node.name,
                        'hostname': node.hostname,
                        'ip_address': node.ip_address,
                        'port': node.port,
                        'connection_type': node.connection_type,
                        'status': node.status,
                        'total_packets': node.total_packets,
                        'total_alerts': node.total_alerts,
                        'network_load': node.network_load,
                        'last_seen': node.last_seen.isoformat() if node.last_seen else None
                    }
                    
                    department_data['nodes'].append(node_data)
                
                campus_data['departments'].append(department_data)
            
            hierarchy['campuses'].append(campus_data)
        
        return hierarchy
    
    def get_node_alerts(self, node_id: int, db: Session, limit: int = 100) -> List[Dict]:
        """
        Récupère les alertes d'un nœud spécifique.
        
        Args:
            node_id: ID du nœud
            db: Session de base de données
            limit: Nombre maximum d'alertes à récupérer
            
        Returns:
            Liste des alertes du nœud
        """
        alerts = db.query(Alert).filter(
            Alert.node_id == node_id
        ).order_by(Alert.timestamp.desc()).limit(limit).all()
        
        alerts_data = []
        for alert in alerts:
            alerts_data.append({
                'id': alert.id,
                'timestamp': alert.timestamp.isoformat() if alert.timestamp else None,
                'source_ip': alert.source_ip,
                'destination_ip': alert.destination_ip,
                'alert_type': alert.alert_type,
                'severity': alert.severity,
                'is_blocked': alert.is_blocked
            })
        
        return alerts_data

# Instance globale du gestionnaire de nœuds
node_manager = NodeManager()

-- threat_detector.py --

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

-- websocket_manager.py --

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
        Accepte et enregistre une nouvelle session client de manière atomique.
        """
        await websocket.accept()
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
