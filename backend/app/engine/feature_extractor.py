import math
import logging
from typing import Dict, Any, List, Optional

import numpy as np

from app.core.config import settings

logger = logging.getLogger(__name__)


class FeatureExtractor:
    """
    Extrait strictement les 20 features utilisées par IDSEnv/RLInference.
    Fournit :
    - extract(ip) -> np.ndarray shape (20,)
    - extract_dict(ip) -> Dict[str, float]
    - get_feature_names() -> List[str]
    - validate_alignment(rl_model) -> bool
    """

    @staticmethod
    def get_feature_names() -> List[str]:
        return [
            "protocol_tcp",
            "protocol_udp",
            "protocol_icmp",
            "protocol_other",
            "packet_length_norm",
            "src_port_norm",
            "dst_port_norm",
            "ttl_norm",
            "flag_syn",
            "flag_ack",
            "flag_fin",
            "flag_rst",
            "flag_psh",
            "flag_urg",
            "payload_entropy_mean",
            "payload_entropy_max",
            "unique_dst_ips_ratio",
            "failed_auth_ratio",
            "hour_of_day",
            "is_weekend",
        ]

    def extract_dict(self, ip: str, context: Optional[Dict[str, Any]] = None) -> Dict[str, float]:
        """
        Retourne un dictionnaire nommé des 20 features.
        Pour l'instant, remplissage réaliste ou dérivé de `context` si fourni.
        """
        context = context or {}
        protocol = str(context.get("protocol", "OTHER")).upper()
        flags = str(context.get("flags_str", "")).upper()
        packet_length = float(context.get("packet_length", 0))
        src_port = float(context.get("src_port", 0))
        dst_port = float(context.get("dst_port", 0))
        ttl = float(context.get("ttl", 64))
        entropy_mean = float(context.get("payload_entropy_mean", 0.0))
        entropy_max = float(context.get("payload_entropy_max", 0.0))
        unique_dst_ratio = float(context.get("unique_dst_ips_ratio", 0.0))
        failed_auth_ratio = float(context.get("failed_auth_ratio", 0.0))
        hour = float(context.get("hour_of_day", 0.0))
        is_weekend = float(context.get("is_weekend", 0.0))

        features = {
            "protocol_tcp": 1.0 if protocol == "TCP" else 0.0,
            "protocol_udp": 1.0 if protocol == "UDP" else 0.0,
            "protocol_icmp": 1.0 if protocol == "ICMP" else 0.0,
            "protocol_other": 1.0 if protocol not in ("TCP", "UDP", "ICMP") else 0.0,
            "packet_length_norm": float(np.clip(packet_length / 1500.0, 0.0, 1.0)),
            "src_port_norm": float(np.clip(src_port / 65535.0, 0.0, 1.0)),
            "dst_port_norm": float(np.clip(dst_port / 65535.0, 0.0, 1.0)),
            "ttl_norm": float(np.clip(ttl / 255.0, 0.0, 1.0)),
            "flag_syn": 1.0 if "S" in flags else 0.0,
            "flag_ack": 1.0 if "A" in flags else 0.0,
            "flag_fin": 1.0 if "F" in flags else 0.0,
            "flag_rst": 1.0 if "R" in flags else 0.0,
            "flag_psh": 1.0 if "P" in flags else 0.0,
            "flag_urg": 1.0 if "U" in flags else 0.0,
            "payload_entropy_mean": float(np.clip(entropy_mean, 0.0, 1.0)),
            "payload_entropy_max": float(np.clip(entropy_max, 0.0, 1.0)),
            "unique_dst_ips_ratio": float(np.clip(unique_dst_ratio, 0.0, 1.0)),
            "failed_auth_ratio": float(np.clip(failed_auth_ratio, 0.0, 1.0)),
            "hour_of_day": float(np.clip(hour / 23.0 if hour > 0 else 0.0, 0.0, 1.0)),
            "is_weekend": float(np.clip(is_weekend, 0.0, 1.0)),
        }
        return features

    def extract(self, ip: str, context: Optional[Dict[str, Any]] = None) -> np.ndarray:
        features = self.extract_dict(ip, context=context)
        return np.array([features[name] for name in self.get_feature_names()], dtype=np.float32)

    def validate_alignment(self, rl_model) -> bool:
        backend_names = self.get_feature_names()
        model_names = getattr(rl_model, "get_feature_names", lambda: [])()
        aligned = backend_names == model_names
        if not aligned:
            logger.error(
                "Feature alignment mismatch: backend=%s model=%s",
                backend_names,
                model_names,
            )
        return aligned
