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
