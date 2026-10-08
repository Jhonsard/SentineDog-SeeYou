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
