import os
import numpy as np
from ml_model.agent.rl_agent import RLAgent
from ml_model.envs.ids_env import IDSEnv

TOTAL_EPISODES = 500
MODEL_SAVE_PATH = "ml_model/models/rl_agent.keras"
CONTINUE_FROM = os.getenv("RL_CONTINUE_FROM", "")


def compute_reward(action: int, event_type: str) -> float:
    if event_type != "normal":
        if action == RLAgent.ACTION_BLOCK:
            return 10.0
        elif action == RLAgent.ACTION_ALERT:
            return 5.0
        elif action == RLAgent.ACTION_MANUAL:
            return 2.0
        else:
            return -20.0
    else:
        if action == RLAgent.ACTION_ALLOW:
            return 1.0
        elif action == RLAgent.ACTION_ALERT:
            return -2.0
        elif action == RLAgent.ACTION_MANUAL:
            return -1.0
        else:
            return -10.0


def _maybe_push_to_hf(local_path: str):
    """Push optionnel du modèle vers HuggingFace Hub si les variables sont définies."""
    hf_repo_id = os.getenv("AI_HF_REPO_ID")
    hf_filename = os.getenv("AI_HF_FILENAME", "rl_agent.keras")
    hf_write_token = os.getenv("HF_WRITE_TOKEN")
    if not hf_repo_id or not hf_write_token:
        print("Push HuggingFace ignoré : AI_HF_REPO_ID ou HF_WRITE_TOKEN non défini.")
        return
    try:
        from huggingface_hub import HfApi
        api = HfApi(token=hf_write_token)
        api.upload_file(
            path_or_fileobj=local_path,
            path_in_repo=hf_filename,
            repo_id=hf_repo_id,
            repo_type="model",
        )
        print(f"Modèle poussé vers HuggingFace : {hf_repo_id}/{hf_filename}")
    except Exception as exc:
        print(f"Erreur lors du push HuggingFace : {exc}")


def train_agent():
    env = IDSEnv(config={"data_source": "simulated"})
    state_dim = env.observation_space.shape[0]
    action_dim = int(env.action_space.n)

    if CONTINUE_FROM and os.path.exists(CONTINUE_FROM):
        print(f"Chargement du modèle existant depuis {CONTINUE_FROM}")
        agent = RLAgent(model_path=CONTINUE_FROM)
    else:
        agent = RLAgent(state_dim=state_dim, action_dim=action_dim)

    os.makedirs(os.path.dirname(MODEL_SAVE_PATH) or ".", exist_ok=True)

    rewards_history = []
    for episode in range(TOTAL_EPISODES):
        state, info = env.reset()
        done = False
        episode_reward = 0.0

        while not done:
            action = agent.act(state)
            next_state, reward, terminated, truncated, info = env.step(action)
            done = bool(terminated or truncated)
            agent.remember(state, action, reward, next_state, done)
            episode_reward += reward
            state = next_state

        if len(agent.memory) >= agent.batch_size:
            agent.replay()
        if episode % 50 == 0:
            agent.update_target_model()

        rewards_history.append(episode_reward)
        if episode % 20 == 0:
            avg = float(np.mean(rewards_history[-20:])) if len(rewards_history) >= 20 else float(np.mean(rewards_history))
            print(f"Episode {episode}, reward={episode_reward:.2f}, avg_reward={avg:.2f}, epsilon={agent.epsilon:.3f}")

    agent.save(MODEL_SAVE_PATH)
    print(f"Agent entraîné et sauvegardé à {MODEL_SAVE_PATH}")
    _maybe_push_to_hf(MODEL_SAVE_PATH)


if __name__ == "__main__":
    train_agent()
