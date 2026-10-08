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

    def get_banned_hosts(self) -> List[str]:
        """Retourne la liste des adresses IP actuellement bannies (alias pour MCP tools)."""
        return list(self.blocked_ips.keys())

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
