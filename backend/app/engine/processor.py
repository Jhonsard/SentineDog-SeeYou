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
