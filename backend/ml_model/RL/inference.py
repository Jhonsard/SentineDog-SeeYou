import os
import logging
from typing import Dict, Any, Optional, List
import numpy as np

from ml_model.agent.rl_agent import RLAgent, ModelLoader
from ml_model.envs.ids_env import IDSEnv

logger = logging.getLogger(__name__)


class RLInference:
    """
    Module d'inférence RL.
    Règles de fallback:
    - Si modèle absent ou non entraîné → action=3 (manual_override)
    - Logging WARNING "UNTRAINED_MODEL_FALLBACK"
    - Compteur fallback_count exposé
    """
    def __init__(self, model_path: str = "ml_model/models/rl_agent.keras",
                 hf_repo_id: str = None, hf_filename: str = "rl_agent.keras", hf_token: str = None):
        self.model_path = model_path
        self.hf_repo_id = hf_repo_id
        self.hf_filename = hf_filename
        self.agent = None
        self.is_trained = False
        self.fallback_count = 0
        self.total_decisions = 0
        self.model_version = "1.0.0"
        self.observation_version = getattr(IDSEnv, "OBSERVATION_VERSION", "2.0")

        try:
            if hf_repo_id is not None:
                loader = ModelLoader(repo_id=hf_repo_id, filename=hf_filename, hf_token=hf_token)
                downloaded_path = loader.load()
                self.agent = RLAgent(model_path=downloaded_path)
                self.is_trained = True
                self.model_version = "keras-dqn-v1-hf"
            elif model_path and os.path.exists(model_path):
                self.agent = RLAgent(model_path=model_path)
                self.is_trained = True
                self.model_version = "keras-dqn-v1"
            else:
                logger.warning("UNTRAINED_MODEL_FALLBACK: No model source configured")
                self.agent = None
                self.is_trained = False
        except Exception as exc:
            logger.error("Failed to load RL model: %s", exc)
            self.agent = None
            self.is_trained = False

    @staticmethod
    def get_feature_names() -> List[str]:
        return IDSEnv.get_feature_names()

    def _features_to_observation(self, ml_features: Dict[str, Any]) -> Optional[np.ndarray]:
        if self.agent is None:
            return None
        try:
            return self.agent._features_to_observation(ml_features)
        except Exception as exc:
            logger.warning("Feature conversion failed: %s", exc)
            return None

    def get_action(self, ml_features: Dict[str, Any]) -> int:
        self.total_decisions += 1
        if not self.is_trained or self.agent is None:
            self.fallback_count += 1
            logger.warning("UNTRAINED_MODEL_FALLBACK")
            return RLAgent.ACTION_MANUAL
        try:
            observation = self._features_to_observation(ml_features)
            if observation is None:
                self.fallback_count += 1
                logger.warning("UNTRAINED_MODEL_FALLBACK")
                return RLAgent.ACTION_MANUAL
            return self.agent.decide_action(observation)
        except Exception as exc:
            self.fallback_count += 1
            logger.warning("UNTRAINED_MODEL_FALLBACK: %s", exc)
            return RLAgent.ACTION_MANUAL

    def get_stats(self) -> Dict[str, Any]:
        return {
            "is_trained": self.is_trained,
            "fallback_count": self.fallback_count,
            "total_decisions": self.total_decisions,
            "model_path": self.model_path,
            "model_version": self.model_version,
            "observation_version": self.observation_version,
        }
