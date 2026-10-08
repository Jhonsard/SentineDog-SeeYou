import logging
import time
from typing import Dict, Any, Optional
from collections import deque, defaultdict

import numpy as np

from app.core.config import settings
from app.core import runtime_ai
from app.engine.feature_extractor import FeatureExtractor

logger = logging.getLogger(__name__)


class _StubRLInference:
    is_trained = False
    model_path = "ml_model/models/rl_agent.keras"
    model_version = "1.0.0"
    fallback_count = 0
    total_decisions = 0

    def get_action(self, ml_features: Dict[str, Any]) -> int:
        return 3

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
        hf_repo_id = getattr(settings, "AI_HF_REPO_ID", None)
        hf_filename = getattr(settings, "AI_HF_FILENAME", "rl_agent.keras")
        model_path = getattr(settings, "AI_MODEL_PATH", "ml_model/models/rl_agent.keras")

        if hf_repo_id:
            logger.info("Chargement du modèle RL depuis HuggingFace: %s/%s", hf_repo_id, hf_filename)
            return RLInference(model_path=model_path, hf_repo_id=hf_repo_id, hf_filename=hf_filename, hf_token=settings.HF_READ_TOKEN)
        else:
            logger.info("Chargement du modèle RL depuis le chemin local: %s", model_path)
            return RLInference(model_path=model_path)
    except Exception as exc:
        logger.warning("RL module unavailable, using safe stub: %s", exc)
        return _StubRLInference()


def compute_reward(action: int, event_type: str) -> float:
    if event_type != "normal":
        if action == 0:
            return -20.0
        elif action == 1:
            return 5.0
        elif action == 2:
            return 10.0
        else:
            return 2.0
    else:
        if action == 0:
            return 1.0
        elif action == 1:
            return -2.0
        elif action == 2:
            return -10.0
        else:
            return -1.0


class AIDecisionService:
    """
    Orchestrateur des décisions IA.
    Backend API -> AIDecisionService -> RLInference -> action mappée.
    """
    ACTION_ALLOW = 0
    ACTION_ALERT = 1
    ACTION_BLOCK = 2
    ACTION_MANUAL = 3

    ACTION_MAP = {
        ACTION_ALLOW: "allow",
        ACTION_ALERT: "alert",
        ACTION_BLOCK: "block",
        ACTION_MANUAL: "manual",
    }

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
        rt = runtime_ai.get_state()
        self.ai_mode_enabled = rt["ai_mode_enabled"]
        self.rl_manual_mode = rt["rl_manual_mode"]
        self.rl_manual_mode_learning_enabled = rt["rl_manual_mode_learning_enabled"]
        self.memory: deque = deque(maxlen=10000)
        self.feedback_count = 0
        self._decision_history: Dict[str, deque] = defaultdict(lambda: deque(maxlen=100))

    def set_mode(
        self,
        ai_mode_enabled: Optional[bool] = None,
        rl_manual_mode: Optional[bool] = None,
        rl_manual_mode_learning_enabled: Optional[bool] = None,
    ) -> Dict[str, Any]:
        """Bascule les flags du mode Agent IA (persistés via runtime_ai)."""
        updated = runtime_ai.set_state(
            ai_mode_enabled=ai_mode_enabled if ai_mode_enabled is not None else self.ai_mode_enabled,
            rl_manual_mode=rl_manual_mode if rl_manual_mode is not None else self.rl_manual_mode,
            rl_manual_mode_learning_enabled=(
                rl_manual_mode_learning_enabled
                if rl_manual_mode_learning_enabled is not None
                else self.rl_manual_mode_learning_enabled
            ),
        )
        self.ai_mode_enabled = updated["ai_mode_enabled"]
        self.rl_manual_mode = updated["rl_manual_mode"]
        self.rl_manual_mode_learning_enabled = updated["rl_manual_mode_learning_enabled"]
        return updated

    async def evaluate_ip(self, ip: str, context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        if getattr(self, "rl_manual_mode", False):
            learning_enabled = getattr(self, "rl_manual_mode_learning_enabled", False)
            ml_features = self.extractor.extract_dict(ip, context=context)
            rl_suggestion = None
            if learning_enabled and getattr(self.rl, "is_trained", False):
                try:
                    rl_suggestion = int(self.rl.get_action(ml_features))
                except Exception:
                    rl_suggestion = None
            result = {
                "ip": ip,
                "action": "manual",
                "confidence": 0.0,
                "reason": "manual_mode_enabled",
                "model_version": getattr(self.rl, "model_version", None),
                "features_used": ml_features,
                "fallback_count": getattr(self.rl, "fallback_count", 0),
                "rl_suggestion": rl_suggestion,
                "learning_enabled": learning_enabled,
            }
            self._record_decision(ip, result)
            return result

        if not getattr(self, "ai_mode_enabled", False):
            result = {
                "ip": ip,
                "action": "manual",
                "confidence": 0.0,
                "reason": "ai_mode_disabled",
                "model_version": getattr(self.rl, "model_version", None),
                "features_used": self.extractor.extract_dict(ip, context=context),
                "fallback_count": getattr(self.rl, "fallback_count", 0),
            }
            self._record_decision(ip, result)
            return result

        if not getattr(self.rl, "is_trained", False):
            result = {
                "ip": ip,
                "action": "manual",
                "confidence": 0.0,
                "reason": "model_untrained_fallback",
                "model_version": getattr(self.rl, "model_version", None),
                "features_used": self.extractor.extract_dict(ip, context=context),
                "fallback_count": getattr(self.rl, "fallback_count", 0),
            }
            self._record_decision(ip, result)
            return result

        ml_features = self.extractor.extract_dict(ip, context=context)
        action = self.rl.get_action(ml_features)
        decision = self.ACTION_MAP.get(action, "manual")

        confidence = 0.0
        try:
            observation = self.extractor.extract(ip, context=context)
            q_values = self.rl.agent.get_q_values(observation)
            confidence = float(np.max(q_values))
            confidence = max(0.0, min(1.0, confidence))
        except Exception:
            confidence = 0.85 if decision == "block" else 0.5

        threshold = float(getattr(self.config, "AI_CONFIDENCE_THRESHOLD", 0.85))
        if decision in ("block", "alert") and confidence < threshold:
            decision = "manual"

        if decision == "block" and self.iptables is not None:
            try:
                await self.iptables.block_ip(ip, reason="AI_BLOCK")
                logger.info("AI BLOCK: ip=%s confidence=%s", ip, confidence)
            except Exception as exc:
                logger.error("AI block failed for %s: %s", ip, exc)
                decision = "manual"

        if decision == "alert":
            logger.info("AI ALERT: ip=%s confidence=%s", ip, confidence)

        result = {
            "ip": ip,
            "action": decision,
            "confidence": confidence,
            "model_version": getattr(self.rl, "model_version", None),
            "features_used": ml_features,
            "fallback_count": getattr(self.rl, "fallback_count", 0),
            "reason": "model_decision" if getattr(self.rl, "is_trained", False) else "model_untrained_fallback",
        }
        self._record_decision(ip, result)
        return result

    def _record_decision(self, ip: str, result: Dict[str, Any]) -> None:
        """
        Enregistre une decision dans l'historique temporel pour consultation MCP.
        Operation O(1) — ne bloque pas la boucle evenementielle temps reel.
        """
        action_label = result.get("action", "manual")
        decision_code = next((k for k, v in self.ACTION_MAP.items() if v == action_label), 3)
        record = {
            "timestamp": time.time(),
            "decision_code": decision_code,
            "decision_label": action_label,
            "confidence": result.get("confidence", 0.0),
            "features": result.get("features_used", {}),
            "reason": result.get("reason", ""),
            "model_version": result.get("model_version"),
        }
        self._decision_history[ip].append(record)

    def get_latest_decision_for_ip(self, ip_address: str) -> Optional[Dict[str, Any]]:
        """
        Retourne la derniere decision enregistreee pour une IP donnee.
        Utilise par le serveur MCP (explain_rl_decision).
        """
        history = self._decision_history.get(ip_address)
        if not history:
            return None
        return dict(history[-1])

    def record_manual_feedback(self, ip: str, human_action: int, context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        if not getattr(self.rl, "is_trained", False):
            return {"status": "skipped", "reason": "model_not_trained"}

        ml_features = self.extractor.extract_dict(ip, context=context)
        observation = self.extractor.extract(ip, context=context)
        event_type = "normal"
        if context and "event_type" in context:
            event_type = context["event_type"]

        reward = compute_reward(human_action, event_type)
        next_observation = np.zeros_like(observation)
        done = True

        self.memory.append((observation, human_action, reward, next_observation, done))
        self.feedback_count += 1

        logger.info("Feedback enregistre: ip=%s action=%s reward=%s buffer=%s", ip, human_action, reward, len(self.memory))
        return {
            "status": "recorded",
            "ip": ip,
            "action": human_action,
            "reward": reward,
            "buffer_size": len(self.memory),
        }

    def maybe_train(self) -> Dict[str, Any]:
        if not getattr(self.rl, "is_trained", False):
            return {"status": "skipped", "reason": "model_not_trained"}

        train_interval = getattr(self.config, "RL_MANUAL_MODE_TRAIN_INTERVAL", 100)
        if len(self.memory) < train_interval:
            return {"status": "skipped", "reason": "not_enough_samples", "buffer_size": len(self.memory), "required": train_interval}

        try:
            agent = self.rl.agent
            agent.replay()
            agent.update_target_model()
            trained_count = len(self.memory)
            self.memory.clear()
            logger.info("Entrainement Humain effectue sur %s transitions.", trained_count)
            return {"status": "trained", "samples": trained_count}
        except Exception as exc:
            logger.error("Erreur lors de l'entrainement Humain: %s", exc)
            return {"status": "error", "detail": str(exc)}
