import os
import numpy as np
import tensorflow as tf
from huggingface_hub import hf_hub_download
from collections import deque
import random

from ml_model.envs.ids_env import IDSEnv


class ModelLoader:
    """
    Charge un modèle TensorFlow/Keras depuis Hugging Face Hub.
    Le token de lecture est fourni via le paramètre hf_token (défini depuis settings.HF_READ_TOKEN)
    ou via la variable d'environnement HF_READ_TOKEN en dernier recours.
    Le fichier est téléchargé dans un cache local temporaire.
    """
    def __init__(self, repo_id: str, filename: str = "rl_agent.keras", local_dir: str = "/tmp/models", hf_token: str = None):
        self.repo_id = repo_id
        self.filename = filename
        self.local_dir = local_dir
        self.hf_token = hf_token

    def load(self) -> str:
        token = self.hf_token or os.getenv("HF_READ_TOKEN")
        os.makedirs(self.local_dir, exist_ok=True)
        download_kwargs = {
            "repo_id": self.repo_id,
            "filename": self.filename,
            "local_dir": self.local_dir,
        }
        if token:
            download_kwargs["token"] = token
        model_path = hf_hub_download(**download_kwargs)
        return model_path


class RLAgent:
    """
    Deep Q-Network custom pour la prise de décision en cybersécurité.
    - 4 actions : allow, alert, block, manual_override
    - Politique epsilon-greedy (exploration/exploitation)
    - Replay buffer + réseau cible pour la stabilité
    """
    ACTION_ALLOW = 0
    ACTION_ALERT = 1
    ACTION_BLOCK = 2
    ACTION_MANUAL = 3
    ACTIONS = [ACTION_ALLOW, ACTION_ALERT, ACTION_BLOCK, ACTION_MANUAL]

    def __init__(self, state_dim: int = None, action_dim: int = 4,
                 epsilon: float = 0.1, epsilon_decay: float = 0.995,
                 epsilon_min: float = 0.01, gamma: float = 0.95,
                 learning_rate: float = 1e-3, model_path: str = None,
                 repo_id: str = None, hf_filename: str = "rl_agent.keras", hf_token: str = None):
        self.lr = learning_rate
        if model_path is not None:
            self._load_model(model_path)
            return

        if repo_id is not None:
            loader = ModelLoader(repo_id=repo_id, filename=hf_filename, hf_token=hf_token)
            downloaded_path = loader.load()
            self._load_model(downloaded_path)
            return

        if state_dim is None:
            raise ValueError("state_dim est requis quand model_path/repo_id n'est pas fourni.")

        self.state_dim = state_dim
        self.action_dim = action_dim
        self.epsilon = epsilon
        self.epsilon_decay = epsilon_decay
        self.epsilon_min = epsilon_min
        self.gamma = gamma
        self.lr = learning_rate

        self.model = self._build_model()
        self.target_model = self._build_model()
        self.update_target_model()

        self.memory = deque(maxlen=10000)
        self.batch_size = 64
        self.is_trained = False

    def _build_model(self):
        model = tf.keras.Sequential([
            tf.keras.layers.Dense(128, activation='relu', input_shape=(self.state_dim,)),
            tf.keras.layers.Dense(64, activation='relu'),
            tf.keras.layers.Dense(self.action_dim, activation='linear')
        ])
        model.compile(optimizer=tf.keras.optimizers.Adam(learning_rate=self.lr), loss='mse')
        return model

    def _load_model(self, path: str):
        if not os.path.exists(path):
            raise FileNotFoundError(f"Modèle RL introuvable : {path}")
        self.model = tf.keras.models.load_model(path)
        self.state_dim = int(self.model.input_shape[1])
        self.action_dim = int(self.model.output_shape[1])
        self.target_model = tf.keras.models.clone_model(self.model)
        self.update_target_model()
        self.memory = deque(maxlen=10000)
        self.batch_size = 64
        self.epsilon = 0.0
        self.epsilon_decay = 0.995
        self.epsilon_min = 0.01
        self.gamma = 0.95
        self.lr = 1e-3
        self.is_trained = True

    def update_target_model(self):
        self.target_model.set_weights(self.model.get_weights())

    def act(self, state):
        if np.random.rand() <= self.epsilon:
            return int(np.random.choice(self.action_dim))
        q_values = self.model.predict(np.expand_dims(state, axis=0), verbose=0)
        return int(np.argmax(q_values[0]))

    def decide_action(self, observation: np.ndarray) -> int:
        q_values = self.model.predict(np.expand_dims(observation, axis=0), verbose=0)
        return int(np.argmax(q_values[0]))

    def get_q_values(self, observation: np.ndarray) -> np.ndarray:
        return self.model.predict(np.expand_dims(observation, axis=0), verbose=0)[0]

    def remember(self, state, action, reward, next_state, done):
        """Stocke une transition dans le replay buffer.
        ATTENTION : méthode réservée à l'entraînement manuel via train.py.
        Ne pas appeler depuis le service d'inférence en production.
        """
        self.memory.append((state, action, reward, next_state, done))

    def replay(self):
        """Entraîne le réseau Q sur un mini-batch tiré du replay buffer.
        ATTENTION : méthode réservée à l'entraînement manuel via train.py.
        Ne pas appeler depuis le service d'inférence en production.
        """
        if len(self.memory) < self.batch_size:
            return
        minibatch = random.sample(self.memory, self.batch_size)
        states = np.array([t[0] for t in minibatch])
        actions = np.array([t[1] for t in minibatch])
        rewards = np.array([t[2] for t in minibatch])
        next_states = np.array([t[3] for t in minibatch])
        dones = np.array([t[4] for t in minibatch])

        target = self.model.predict(states, verbose=0)
        target_next = self.target_model.predict(next_states, verbose=0)
        for i in range(self.batch_size):
            if dones[i]:
                target[i][actions[i]] = rewards[i]
            else:
                target[i][actions[i]] = rewards[i] + self.gamma * np.max(target_next[i])
        self.model.fit(states, target, epochs=1, verbose=0, batch_size=self.batch_size)

        if self.epsilon > self.epsilon_min:
            self.epsilon *= self.epsilon_decay

    def save(self, path):
        os.makedirs(os.path.dirname(path) if os.path.dirname(path) else ".", exist_ok=True)
        self.model.save(path)

    @staticmethod
    def get_feature_names() -> list:
        return IDSEnv.get_feature_names()

    def _features_to_observation(self, ml_features: dict) -> np.ndarray:
        names = self.get_feature_names()
        obs = np.zeros((len(names),), dtype=np.float32)
        for idx, name in enumerate(names):
            val = ml_features.get(name, 0.0)
            obs[idx] = float(np.clip(val, 0.0, 1.0))
        return obs
