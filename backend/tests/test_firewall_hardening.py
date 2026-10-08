"""
Tests de durcissement iptables Phase 5.
Vérifie :
- Timeout explicite
- Réessais (max 3 par défaut)
- Vérification post-action
- Alerte critique en cas d'échec persistant
"""
import os
import time
import unittest
import asyncio
from unittest.mock import patch, MagicMock, AsyncMock

os.environ.setdefault("SECRET_KEY", "aB3dEfGhIjKlMnOpQrStUvWxYz123456")

from app.engine.firewall import FirewallManager
from app.core.config import settings


def run_async(coro):
    return asyncio.run(coro)


class TestFirewallHardening(unittest.TestCase):
    def setUp(self):
        self.fm = FirewallManager()
        self.fm.blocked_ips.clear()

    @patch('app.engine.firewall.subprocess.run')
    def test_block_ip_retries_on_failure(self, mock_run):
        mock_run.return_value.returncode = 1
        mock_run.return_value.stderr = "Permission denied"
        
        result = run_async(self.fm.block_ip("192.0.2.1", "test"))
        
        self.assertFalse(result)
        self.assertEqual(mock_run.call_count, settings.IPTABLES_MAX_RETRIES)
        self.assertEqual(mock_run.call_count, 3)

    @patch('app.engine.firewall.subprocess.run')
    def test_block_ip_succeeds_on_verify(self, mock_run):
        mock_run.return_value.returncode = 0
        mock_run.return_value.stderr = ""
        
        result = run_async(self.fm.block_ip("192.0.2.1", "test"))
        
        self.assertTrue(result)
        self.assertEqual(mock_run.call_count, 2)
        self.assertIn("192.0.2.1", self.fm.blocked_ips)

    @patch('app.engine.firewall.subprocess.run')
    def test_verify_rule_exists(self, mock_run):
        mock_run.return_value.returncode = 0
        exists = self.fm._verify_rule_exists("192.0.2.1")
        self.assertTrue(exists)
        args = mock_run.call_args[0][0]
        self.assertEqual(args, ["sudo", "iptables", "-C", "INPUT", "-s", "192.0.2.1", "-j", "DROP"])

    @patch('app.engine.firewall.subprocess.run')
    def test_critical_alert_on_persistent_failure(self, mock_run):
        mock_run.return_value.returncode = 1
        mock_run.return_value.stderr = "Permission denied"
        
        callback = AsyncMock()
        self.fm.block_failure_callback = callback
        
        result = run_async(self.fm.block_ip("192.0.2.1", "test"))
        
        self.assertFalse(result)
        callback.assert_called_once()
        alert = callback.call_args[0][0]
        self.assertEqual(alert["source_ip"], "192.0.2.1")
        self.assertEqual(alert["alert_type"], "firewall_block_failure")
        self.assertEqual(alert["severity"], "tres_critique")
        self.assertIn("3 tentatives", alert["description"])

    @patch('app.engine.firewall.subprocess.run')
    def test_unblock_ip(self, mock_run):
        self.fm.blocked_ips["192.0.2.1"] = {"blocked_at": time.time(), "reason": "test"}
        mock_run.return_value.returncode = 0
        
        result = run_async(self.fm.unblock_ip("192.0.2.1", "admin"))
        
        self.assertTrue(result)
        self.assertNotIn("192.0.2.1", self.fm.blocked_ips)
        args = mock_run.call_args[0][0]
        self.assertEqual(args, ["sudo", "iptables", "-D", "INPUT", "-s", "192.0.2.1", "-j", "DROP"])
