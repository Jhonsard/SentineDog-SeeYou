import gymnasium as gym
from gymnasium import spaces
import numpy as np
from collections import deque
import random


OBSERVATION_VERSION = "2.0"

ACTION_ALLOW = 0
ACTION_ALERT = 1
ACTION_BLOCK = 2
ACTION_MANUAL = 3


class IDSEnv(gym.Env):
    """
    Environnement Gymnasium pour IDS/IPS orienté RL.
    - mode simulated : scénarios générés pour l'entraînement
    - mode live : observation injectée depuis le backend réel
    - 4 actions : allow, alert, block, manual_override
    """
    metadata = {"render_modes": ["human"], "render_fps": 30}

    def __init__(self, config=None):
        super().__init__()
        if config is None:
            config = {}

        self.observation_version = OBSERVATION_VERSION
        self.data_source = str(config.get("data_source", "simulated")).lower()
        self.observation_space = spaces.Box(low=0, high=1, shape=(20,), dtype=np.float32)
        self.action_space = spaces.Discrete(4)

        self.current_state = np.zeros(20, dtype=np.float32)
        self.history = deque(maxlen=100)
        self.intrusion_scenario_generator = IntrusionScenarioGenerator()
        self.db_session = config.get("db_session")

        self.REWARD_CORRECT_ALLOW = config.get("reward_correct_allow", 1.0)
        self.REWARD_CORRECT_BLOCK = config.get("reward_correct_block", 10.0)
        self.REWARD_CORRECT_ALERT = config.get("reward_correct_alert", 5.0)
        self.REWARD_CORRECT_MANUAL = config.get("reward_correct_manual", 2.0)
        self.PENALTY_FALSE_POSITIVE = config.get("penalty_false_positive", -10.0)
        self.PENALTY_FALSE_NEGATIVE = config.get("penalty_false_negative", -20.0)
        self.PENALTY_WRONG_ALERT = config.get("penalty_wrong_alert", -2.0)
        self.PENALTY_WRONG_MANUAL = config.get("penalty_wrong_manual", -1.0)

    @staticmethod
    def get_feature_names():
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

    def _get_simulated_observation(self):
        self.current_state, self.intrusion_scenario_generator.last_event_type = (
            self.intrusion_scenario_generator.generate_event()
        )
        return self.current_state

    def _get_real_observation(self):
        if self.db_session is None:
            return self.current_state
        try:
            from app.db.models import Alert
            from app.engine.feature_extractor import FeatureExtractor
            recent_alert = self.db_session.query(Alert).order_by(Alert.timestamp.desc()).first()
            if recent_alert is None:
                return self.current_state
            context = {
                "protocol": recent_alert.protocol,
                "packet_length": recent_alert.packet_length if hasattr(recent_alert, "packet_length") else 0,
                "src_port": recent_alert.src_port if hasattr(recent_alert, "src_port") else 0,
                "dst_port": recent_alert.dst_port if hasattr(recent_alert, "dst_port") else 0,
                "ttl": recent_alert.ttl if hasattr(recent_alert, "ttl") else 64,
                "flags_str": recent_alert.flags if hasattr(recent_alert, "flags_str") else "",
            }
            feature_extractor = FeatureExtractor()
            return feature_extractor.extract(str(recent_alert.source_ip), context=context)
        except Exception:
            return self.current_state

    def _get_obs(self):
        if self.data_source == "live":
            return self._get_real_observation()
        return self._get_simulated_observation()

    def _get_info(self):
        return {"current_event_type": getattr(self.intrusion_scenario_generator, "last_event_type", "normal")}

    def reset(self, seed=None, options=None):
        super().reset(seed=seed)
        observation = self._get_obs()
        info = self._get_info()
        return observation, info

    def step(self, action):
        is_intrusion = self.intrusion_scenario_generator.last_event_type != "normal"
        reward = 0.0
        terminated = False
        truncated = False

        if is_intrusion:
            if action == ACTION_ALLOW:
                reward = self.PENALTY_FALSE_NEGATIVE
            elif action == ACTION_ALERT:
                reward = self.REWARD_CORRECT_ALERT
            elif action == ACTION_BLOCK:
                reward = self.REWARD_CORRECT_BLOCK
            elif action == ACTION_MANUAL:
                reward = self.REWARD_CORRECT_MANUAL
        else:
            if action == ACTION_ALLOW:
                reward = self.REWARD_CORRECT_ALLOW
            elif action == ACTION_ALERT:
                reward = self.PENALTY_WRONG_ALERT
            elif action == ACTION_BLOCK:
                reward = self.PENALTY_FALSE_POSITIVE
            elif action == ACTION_MANUAL:
                reward = self.PENALTY_WRONG_MANUAL

        if self.data_source == "live":
            observation = self._get_obs()
        else:
            self.current_state, self.intrusion_scenario_generator.last_event_type = (
                self.intrusion_scenario_generator.generate_event()
            )
            observation = self.current_state

        return observation, reward, terminated, truncated, self._get_info()

    def render(self):
        pass

    def close(self):
        pass

    def set_live_observation(self, observation: np.ndarray):
        if observation is None:
            return
        observation = np.asarray(observation, dtype=np.float32)
        if observation.shape[-1] != 20:
            raise ValueError(f"Live observation must have 20 features, got {observation.shape[-1]}")
        if observation.ndim == 1:
            self.current_state = np.clip(observation, 0.0, 1.0)
        elif observation.ndim == 2 and observation.shape[0] == 1:
            self.current_state = np.clip(observation[0], 0.0, 1.0)
        else:
            raise ValueError("Unsupported observation shape")


class IntrusionScenarioGenerator:
    """
    Simule la génération d'événements réseau, incluant trafic normal et intrusions.
    Produit un vecteur normalisé de 20 features aligné avec IDSEnv.get_feature_names().
    """
    def __init__(self):
        self.event_types = {
            "normal": 0.70,
            "port_scan": 0.15,
            "syn_flood": 0.10,
            "malware_comm": 0.05,
        }
        self.last_event_type = "normal"

    def _normalize(self, value, min_v=0.0, max_v=1.0):
        if max_v == min_v:
            return 0.0
        return float(np.clip((value - min_v) / (max_v - min_v), 0.0, 1.0))

    def generate_event(self):
        event_type = random.choices(
            list(self.event_types.keys()),
            weights=list(self.event_types.values()),
            k=1,
        )[0]
        self.last_event_type = event_type

        obs = np.zeros(20, dtype=np.float32)

        if event_type == "normal":
            proto_flag = random.choice(["tcp", "udp", "icmp"])
            if proto_flag == "tcp":
                obs[0] = 1.0
                flags = random.choice(["A", "PA", "SA", "R", "FA"])
                self._apply_flags(obs, flags)
            elif proto_flag == "udp":
                obs[1] = 1.0
            else:
                obs[2] = 1.0

            obs[3] = 0.0
            obs[4] = self._normalize(random.uniform(40, 1500), 0, 1500)
            obs[5] = self._normalize(random.randint(1024, 65535), 0, 65535)
            obs[6] = self._normalize(random.randint(1, 65535), 0, 65535)
            obs[7] = self._normalize(random.randint(32, 255), 0, 255)
            obs[8] = 0.0
            obs[9] = 1.0
            obs[10] = 0.0
            obs[11] = 0.0
            obs[12] = 0.0
            obs[13] = 0.0
            obs[14] = self._normalize(random.uniform(0.1, 0.6), 0, 1)
            obs[15] = self._normalize(random.uniform(0.2, 0.9), 0, 1)
            obs[16] = self._normalize(random.uniform(0.0, 0.3), 0, 1)
            obs[17] = self._normalize(random.uniform(0.0, 0.1), 0, 1)
            obs[18] = self._normalize(random.randint(0, 23), 0, 23)
            obs[19] = random.choice([0.0, 1.0])

        elif event_type == "port_scan":
            obs[0] = 1.0
            obs[1] = 0.0
            obs[2] = 0.0
            obs[3] = 0.0
            obs[4] = self._normalize(random.uniform(40, 120), 0, 1500)
            obs[5] = self._normalize(random.randint(1024, 65535), 0, 65535)
            obs[6] = self._normalize(random.randint(1, 1024), 0, 65535)
            obs[7] = self._normalize(random.randint(32, 255), 0, 255)
            obs[8] = 1.0
            obs[9] = 0.0
            obs[10] = 0.0
            obs[11] = 0.0
            obs[12] = 0.0
            obs[13] = 0.0
            obs[14] = self._normalize(random.uniform(0.2, 0.7), 0, 1)
            obs[15] = self._normalize(random.uniform(0.3, 0.95), 0, 1)
            obs[16] = self._normalize(random.uniform(0.4, 0.9), 0, 1)
            obs[17] = self._normalize(random.uniform(0.1, 0.5), 0, 1)
            obs[18] = self._normalize(random.randint(0, 23), 0, 23)
            obs[19] = random.choice([0.0, 1.0])

        elif event_type == "syn_flood":
            obs[0] = 1.0
            obs[1] = 0.0
            obs[2] = 0.0
            obs[3] = 0.0
            obs[4] = self._normalize(random.uniform(40, 110), 0, 1500)
            obs[5] = self._normalize(random.randint(1024, 65535), 0, 65535)
            obs[6] = self._normalize(random.randint(1, 1024), 0, 65535)
            obs[7] = self._normalize(random.randint(32, 255), 0, 255)
            obs[8] = 1.0
            obs[9] = 0.0
            obs[10] = 0.0
            obs[11] = 0.0
            obs[12] = 0.0
            obs[13] = 0.0
            obs[14] = self._normalize(random.uniform(0.3, 0.8), 0, 1)
            obs[15] = self._normalize(random.uniform(0.4, 0.95), 0, 1)
            obs[16] = self._normalize(random.uniform(0.5, 0.8), 0, 1)
            obs[17] = self._normalize(random.uniform(0.2, 0.7), 0, 1)
            obs[18] = self._normalize(random.randint(0, 23), 0, 23)
            obs[19] = random.choice([0.0, 1.0])

        elif event_type == "malware_comm":
            obs[0] = 1.0
            obs[1] = 0.0
            obs[2] = 0.0
            obs[3] = 0.0
            obs[4] = self._normalize(random.uniform(60, 1500), 0, 1500)
            obs[5] = self._normalize(random.randint(1024, 65535), 0, 65535)
            obs[6] = self._normalize(random.randint(1, 65535), 0, 65535)
            obs[7] = self._normalize(random.randint(32, 255), 0, 255)
            obs[8] = 0.0
            obs[9] = 1.0
            obs[10] = 0.0
            obs[11] = 0.0
            obs[12] = 1.0
            obs[13] = 0.0
            obs[14] = self._normalize(random.uniform(0.5, 1.0), 0, 1)
            obs[15] = self._normalize(random.uniform(0.6, 1.0), 0, 1)
            obs[16] = self._normalize(random.uniform(0.2, 0.6), 0, 1)
            obs[17] = self._normalize(random.uniform(0.1, 0.4), 0, 1)
            obs[18] = self._normalize(random.randint(0, 23), 0, 23)
            obs[19] = random.choice([0.0, 1.0])

        return obs.astype(np.float32), event_type

    def _apply_flags(self, obs, flags):
        mapping = {
            "S": (8, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0),
            "A": (9, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0),
            "F": (10, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0),
            "R": (11, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0),
            "PA": (8, 0.0, 1.0, 1.0, 0.0, 0.0, 0.0),
            "SA": (8, 0.0, 1.0, 1.0, 0.0, 0.0, 0.0),
            "FA": (10, 0.0, 1.0, 1.0, 1.0, 0.0, 0.0),
            "RA": (11, 0.0, 1.0, 1.0, 0.0, 1.0, 0.0),
        }
        selected = mapping.get(flags, (9, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0))
        idx, sync_val, ack_val, fin_val, rst_val, psh_val, urg_val = selected
        obs[idx] = 1.0
        sync_idx = 8
        if sync_idx < len(obs):
            obs[sync_idx] = max(obs[sync_idx], float(sync_val or 0.0))
        ack_idx = 9
        if ack_idx < len(obs):
            obs[ack_idx] = max(obs[ack_idx], float(ack_val or 0.0))
        fin_idx = 10
        if fin_idx < len(obs):
            obs[fin_idx] = max(obs[fin_idx], float(fin_val or 0.0))
        rst_idx = 11
        if rst_idx < len(obs):
            obs[rst_idx] = max(obs[rst_idx], float(rst_val or 0.0))
        psh_idx = 12
        if psh_idx < len(obs):
            obs[psh_idx] = max(obs[psh_idx], float(psh_val or 0.0))
        urg_idx = 13
        if urg_idx < len(obs):
            obs[urg_idx] = max(obs[urg_idx], float(urg_val or 0.0))
