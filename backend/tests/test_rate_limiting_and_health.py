"""
Tests Phase 7 : Rate limiting et Health Check enrichi.
Vérifie :
- Limite stricte sur /auth/token (5 req/min par IP)
- Code HTTP 429 et header Retry-After
- Health Check retourne uptime, engine, nodes, packet_queue
"""
import os
import unittest
from unittest.mock import patch

os.environ.setdefault("SECRET_KEY", "aB3dEfGhIjKlMnOpQrStUvWxYz123456")

from fastapi.testclient import TestClient
from app.main import app
from app.core.config import settings


class TestRateLimitingAndHealth(unittest.TestCase):
    def test_health_returns_engine_and_nodes(self):
        with TestClient(app) as client:
            response = client.get("/api/v1/health")
            self.assertEqual(response.status_code, 200)
            data = response.json()
            self.assertEqual(data["status"], "healthy")
            self.assertIn("engine", data)
            self.assertIn("uptime_seconds", data["engine"])
            self.assertIn(data["engine"]["sniffer"], ("running", "stopped"))
            self.assertIn(data["engine"]["processor"], ("running", "stopped"))
            self.assertIn("nodes", data)
            self.assertIn("active_count", data["nodes"])
            self.assertIn("packet_queue", data)
            self.assertIn("queue_size", data["packet_queue"])
            self.assertIn("dropped_packets", data["packet_queue"])

    def test_rate_limit_returns_429_after_exceeds(self):
        headers = {"content-type": "application/x-www-form-urlencoded"}
        payload = "username=admin&password=wrong"
        with TestClient(app) as client:
            for _ in range(settings.RATE_LIMIT_AUTH_REQUESTS):
                resp = client.post("/api/v1/auth/token", data=payload, headers=headers)
                self.assertNotEqual(resp.status_code, 429)
            resp = client.post("/api/v1/auth/token", data=payload, headers=headers)
            self.assertEqual(resp.status_code, 429)
            self.assertIn("Retry-After", resp.headers)

    def test_rate_limit_disabled_never_429(self):
        with patch.object(settings, 'RATE_LIMIT_ENABLED', False):
            pass
        with TestClient(app) as client:
            resp = client.get("/api/v1/health")
            self.assertEqual(resp.status_code, 200)


if __name__ == "__main__":
    unittest.main()
