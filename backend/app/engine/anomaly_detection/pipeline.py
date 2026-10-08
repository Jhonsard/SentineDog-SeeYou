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
