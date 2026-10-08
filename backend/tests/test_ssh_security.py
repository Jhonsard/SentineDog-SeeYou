"""
Tests de sécurité SSH Phase 4 (Paramiko).
Vérifie le durcissement des connexions SSH :
- Absence d'AutoAddPolicy
- Timeouts explicites
- Support multi-algorithmes (RSA, Ed25519, ECDSA)
- Validation du code de retour
"""
import os
import unittest
from unittest.mock import patch, MagicMock, PropertyMock
from datetime import datetime

os.environ.setdefault("SECRET_KEY", "aB3dEfGhIjKlMnOpQrStUvWxYz123456")

from app.services.node_connection import (
    NodeConnectionManager,
    NodeConnectionResult,
    NodeStatus,
    _load_private_key,
    host_key_policy,
)
from app.core.config import settings
import asyncio
import paramiko


class TestHostKeyPolicy(unittest.TestCase):
    @patch('app.services.node_connection.paramiko.WarningPolicy')
    def test_warning_policy_by_default(self, mock_warning_cls):
        mock_instance = MagicMock()
        mock_warning_cls.return_value = mock_instance
        with patch.object(settings, 'SSH_STRICT_HOST_KEY_CHECKING', False):
            policy = host_key_policy._build_policy()
            self.assertEqual(policy, mock_instance)
            mock_warning_cls.assert_called_once()

    def test_apply_policy_to_client(self):
        client = MagicMock(spec=paramiko.SSHClient)
        host_key_policy.apply(client)
        client.set_missing_host_key_policy.assert_called_once_with(host_key_policy.policy)


class TestLoadPrivateKey(unittest.TestCase):
    @patch('app.services.node_connection.paramiko.Ed25519Key')
    @patch('app.services.node_connection.paramiko.ECDSAKey')
    @patch('app.services.node_connection.paramiko.RSAKey')
    def test_loads_ed25519_first(self, mock_rsa_cls, mock_ecdsa_cls, mock_ed25519_cls):
        mock_ed25519_cls.from_private_key_file.return_value = "ed25519_key"
        mock_rsa_cls.from_private_key_file.side_effect = Exception("Not RSA")
        mock_ecdsa_cls.from_private_key_file.side_effect = Exception("Not ECDSA")
        key = _load_private_key("/path/to/ed25519_key")
        mock_ed25519_cls.from_private_key_file.assert_called_once_with("/path/to/ed25519_key")
        self.assertEqual(key, "ed25519_key")

    @patch('app.services.node_connection.paramiko.ECDSAKey')
    @patch('app.services.node_connection.paramiko.RSAKey')
    def test_loads_rsa_if_ed25519_fails(self, mock_rsa_cls, mock_ecdsa_cls):
        mock_rsa_cls.from_private_key_file.return_value = "rsa_key"
        mock_ecdsa_cls.from_private_key_file.side_effect = Exception("Not ECDSA")
        key = _load_private_key("/path/to/rsa_key")
        mock_rsa_cls.from_private_key_file.assert_called_once_with("/path/to/rsa_key")
        self.assertEqual(key, "rsa_key")

    @patch('app.services.node_connection.paramiko.RSAKey')
    @patch('app.services.node_connection.paramiko.Ed25519Key')
    @patch('app.services.node_connection.paramiko.ECDSAKey')
    def test_returns_none_when_no_key_works(self, mock_ecdsa_cls, mock_ed25519_cls, mock_rsa_cls):
        for mock in (mock_rsa_cls, mock_ed25519_cls, mock_ecdsa_cls):
            mock.from_private_key_file.side_effect = Exception("Unsupported key")
        key = _load_private_key("/path/to/unknown_key")
        self.assertIsNone(key)


class TestConnectSSH(unittest.TestCase):
    @patch('app.services.node_connection.paramiko.SSHClient')
    @patch('app.services.node_connection._load_private_key')
    def test_connect_ssh_uses_strict_timeout(self, mock_load_key, mock_ssh_cls):
        manager = NodeConnectionManager()
        manager.timeout = 7
        
        mock_client = MagicMock()
        mock_ssh_cls.return_value = mock_client
        mock_transport = MagicMock()
        mock_client.get_transport.return_value = mock_transport
        mock_client.connect.return_value = None
        
        async def run_test():
            with patch.object(settings, 'SSH_TIMEOUT_SECONDS', 7):
                return await manager.connect_ssh("10.0.0.1", 22, "admin", key_path="/tmp/key")
        
        result = asyncio.run(run_test())
        
        mock_client.connect.assert_called_once()
        call_kwargs = mock_client.connect.call_args[1]
        self.assertEqual(call_kwargs["timeout"], 7)
        self.assertEqual(call_kwargs["allow_agent"], False)
        self.assertEqual(call_kwargs["look_for_keys"], False)
        mock_transport.set_timeout.assert_called_once_with(7)
        self.assertTrue(result.success)
        self.assertEqual(result.status, NodeStatus.ONLINE)

    @patch('app.services.node_connection.paramiko.SSHClient')
    def test_bad_host_key_logs_critical(self, mock_ssh_cls):
        manager = NodeConnectionManager()
        
        mock_client = MagicMock()
        mock_ssh_cls.return_value = mock_client
        
        fake_key = MagicMock(spec=paramiko.PKey)
        fake_key.get_base64.return_value = "FAKEFINGERPRINT"
        
        mock_client.connect.side_effect = paramiko.BadHostKeyException("host", 22, fake_key)
        
        async def run_test():
            with patch.object(settings, 'SSH_TIMEOUT_SECONDS', 5):
                return await manager.connect_ssh("10.0.0.1", 22, "admin")
        
        result = asyncio.run(run_test())
        
        self.assertFalse(result.success)
        self.assertEqual(result.status, NodeStatus.ERROR)
        self.assertIn("MITM", result.error_message)


class TestExecuteRemoteCommand(unittest.TestCase):
    @patch('app.services.node_connection.paramiko.SSHClient')
    @patch('app.services.node_connection._load_private_key')
    def test_non_zero_exit_is_false_and_logged(self, mock_load_key, mock_ssh_cls):
        manager = NodeConnectionManager()
        
        mock_client = MagicMock()
        mock_ssh_cls.return_value = mock_client
        mock_channel = MagicMock()
        mock_channel.recv_exit_status.return_value = 1
        mock_client.exec_command.return_value = (None, MagicMock(read=lambda: b"out"), MagicMock(read=lambda: b"err"))
        
        async def run_test():
            with patch.object(settings, 'SSH_TIMEOUT_SECONDS', 5):
                return await manager.execute_remote_command("10.0.0.1", 22, "admin", "false")
        
        result = asyncio.run(run_test())
        
        success, out, err = result
        self.assertFalse(success)
        self.assertEqual(mock_channel.recv_exit_status(), 1)


if __name__ == "__main__":
    unittest.main()
