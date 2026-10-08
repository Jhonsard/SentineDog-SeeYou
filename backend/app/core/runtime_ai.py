import json
import os
from typing import Dict, Any

from app.core.config import settings

# Stockage d'état runtime des flags du mode Agent IA.
# Permet d'activer/désactiver le mode sans redémarrer le serveur, tout en
# persistant la préférence dans un fichier JSON (survit aux redémarrages).
RUNTIME_PATH = os.path.join(os.path.dirname(__file__), "ai_runtime.json")

DEFAULTS: Dict[str, Any] = {
    "ai_mode_enabled": getattr(settings, "AI_MODE_ENABLED", False),
    "rl_manual_mode": getattr(settings, "RL_MANUAL_MODE", False),
    "rl_manual_mode_learning_enabled": getattr(settings, "RL_MANUAL_MODE_LEARNING_ENABLED", False),
}

_state: Dict[str, Any] | None = None


def load_state() -> Dict[str, Any]:
    global _state
    if _state is not None:
        return _state
    data = dict(DEFAULTS)
    if os.path.exists(RUNTIME_PATH):
        try:
            with open(RUNTIME_PATH, "r", encoding="utf-8") as fh:
                data.update(json.load(fh))
        except Exception:
            pass
    _state = data
    return _state


def get_state() -> Dict[str, Any]:
    return load_state()


def set_state(**kwargs: Any) -> Dict[str, Any]:
    state = load_state()
    for key in DEFAULTS:
        if key in kwargs and kwargs[key] is not None:
            state[key] = bool(kwargs[key])
    try:
        with open(RUNTIME_PATH, "w", encoding="utf-8") as fh:
            json.dump(state, fh, indent=2)
    except Exception:
        pass
    return state
