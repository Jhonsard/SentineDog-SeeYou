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
