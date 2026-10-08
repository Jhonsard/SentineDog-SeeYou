import os
import time
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import StaticPool

from app.db.models import Base, User
from app.core.config import Settings
from app.main import app
from app.core.dependencies import get_db
from app.core.auth_utils import get_password_hash
from app.engine.feature_extractor import FeatureExtractor
from ml_model.RL.inference import RLInference
from ml_model.envs.ids_env import IDSEnv
from app.services.ai_decision_service import AIDecisionService


# Override config for tests
class AISettings(Settings):
    AI_MODE_ENABLED: bool = True
    AI_MODEL_PATH: str = "ml_model/models/rl_agent.keras"
    AI_CONFIDENCE_THRESHOLD: float = 0.85
    AI_MAX_DECISIONS_PER_MINUTE: int = 30


settings = AISettings()


@pytest.fixture(scope="module")
def db():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(bind=engine)
    yield SessionLocal
    Base.metadata.drop_all(engine)


@pytest.fixture(scope="module")
def client(db):
    def override_get_db():
        yield db()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture(scope="module")
def admin_token(client: TestClient):
    response = client.post(
        "/api/v1/auth/token",
        data={"username": "admin", "password": "admin123"},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    if response.status_code != 200:
        # create admin
        from app.db.models import User
        from app.core.auth_utils import get_password_hash
        test_db = next(get_db())
        try:
            test_db.add(User(username="admin", email="admin@test.com", hashed_password=get_password_hash("admin123"), role="admin", is_active=True))
            test_db.commit()
        except Exception:
            test_db.rollback()
        response = client.post(
            "/api/v1/auth/token",
            data={"username": "admin", "password": "admin123"},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
    return response.json()["access_token"]


def test_feature_extractor_shape():
    extractor = FeatureExtractor()
    arr = extractor.extract("192.168.1.10", context={"protocol": "TCP", "packet_length": 64})
    assert arr.shape == (20,)
    assert arr.min() >= 0.0
    assert arr.max() <= 1.0


def test_feature_names_alignment():
    assert IDSEnv.get_feature_names() == FeatureExtractor.get_feature_names()


def test_ids_env_action_space():
    env = IDSEnv()
    assert env.action_space.n == 4


def test_validate_alignment():
    extractor = FeatureExtractor()
    from ml_model.agent.rl_agent import RLAgent
    dummy_agent = RLAgent(state_dim=20, action_dim=4)
    assert extractor.validate_alignment(dummy_agent) is True


def test_rl_inference_untrained_fallback():
    rl = RLInference(model_path="nonexistent.zip")
    assert rl.is_trained is False
    assert rl.get_action({}) == 3
    assert rl.fallback_count == 1


def test_rl_inference_trained_if_present():
    path = "ml_model/models/rl_agent.keras"
    if not os.path.exists(path):
        pytest.skip("trained model not present")
    rl = RLInference(model_path=path)
    assert rl.is_trained is True
    action = rl.get_action({"protocol_tcp": 1.0, "packet_length_norm": 0.5})
    assert action in (0, 1, 2, 3)


def test_decide_requires_auth(client: TestClient, admin_token: str):
    resp = client.post("/api/v1/ai/decide", json={"ip": "192.168.1.10"})
    assert resp.status_code in (401, 403)


def test_decide_returns_decision(client: TestClient, admin_token: str):
    resp = client.post(
        "/api/v1/ai/decide",
        json={"ip": "192.168.1.10"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "action" in data
    assert "confidence" in data


def test_status_returns_keys(client: TestClient, admin_token: str):
    resp = client.get("/api/v1/ai/status", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    data = resp.json()
    for key in ["model_loaded", "is_trained", "fallback_count", "features_count", "total_decisions"]:
        assert key in data


def test_alignment_endpoint(client: TestClient, admin_token: str):
    resp = client.get("/api/v1/ai/alignment", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert "aligned" in data


def test_rate_limit_on_decide(client: TestClient, admin_token: str):
    for _ in range(5):
        client.post(
            "/api/v1/ai/decide",
            json={"ip": "192.168.1.10"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
    resp = client.post(
        "/api/v1/ai/decide",
        json={"ip": "192.168.1.10"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 429


def test_ai_decision_service_fallback():
    fake_rl = MagicMock(is_trained=False)
    service = AIDecisionService(rl_inference=fake_rl)
    import asyncio
    result = asyncio.run(service.evaluate_ip("10.0.0.1"))
    assert result["action"] == "manual"
    assert result["reason"] == "model_untrained_fallback"
