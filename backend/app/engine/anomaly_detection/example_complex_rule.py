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
