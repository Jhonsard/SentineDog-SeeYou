import pytest
from pydantic import ValidationError
from ipaddress import IPv4Address

from app.mcp.tools import (
    SecurityStatsInput,
    ExplainDecisionInput,
    ManualActionInput,
    ActionType,
    SecurityStatsSummary,
    SecurityStatsResponse,
    AlertSummary,
    RLDecisionResponse,
    RLDecisionNotFoundResponse,
    RLDecisionErrorResponse,
    RLDecisionResponseUnion,
    RLFeedbackResult,
    ManualActionResponse,
    _sync_get_security_stats,
    _sync_explain_rl_decision,
)
from app.db.models import Alert
from datetime import datetime


class TestMCPInputModels:
    """Tests pour les modèles d'entrée (validation Pydantic)."""

    def test_security_stats_input_valid(self):
        params = SecurityStatsInput(limit=20)
        assert params.limit == 20

    def test_security_stats_input_default(self):
        params = SecurityStatsInput()
        assert params.limit == 20

    def test_security_stats_input_limit_bounds(self):
        with pytest.raises(ValidationError):
            SecurityStatsInput(limit=0)
        with pytest.raises(ValidationError):
            SecurityStatsInput(limit=101)
        SecurityStatsInput(limit=1)
        SecurityStatsInput(limit=100)

    def test_security_stats_input_extra_forbidden(self):
        with pytest.raises(ValidationError):
            SecurityStatsInput(limit=20, extra_field="not_allowed")

    def test_explain_decision_input_valid(self):
        params = ExplainDecisionInput(ip_address="192.168.1.1")
        assert params.ip_address == IPv4Address("192.168.1.1")

    def test_explain_decision_input_invalid_ip(self):
        with pytest.raises(ValidationError):
            ExplainDecisionInput(ip_address="not-an-ip")

    def test_explain_decision_input_extra_forbidden(self):
        with pytest.raises(ValidationError):
            ExplainDecisionInput(ip_address="192.168.1.1", extra_field="not_allowed")

    def test_manual_action_input_valid_block(self):
        params = ManualActionInput(
            ip_address="192.168.1.100",
            action=ActionType.BLOCK,
            reason="Test block reason"
        )
        assert params.action == ActionType.BLOCK
        assert params.ip_address == IPv4Address("192.168.1.100")

    def test_manual_action_input_valid_unban(self):
        params = ManualActionInput(
            ip_address="192.168.1.100",
            action=ActionType.UNBAN,
            reason="Test unban reason"
        )
        assert params.action == ActionType.UNBAN

    def test_manual_action_input_reason_bounds(self):
        with pytest.raises(ValidationError):
            ManualActionInput(ip_address="192.168.1.1", action=ActionType.BLOCK, reason="sho")  # 3 chars < 5
        with pytest.raises(ValidationError):
            ManualActionInput(ip_address="192.168.1.1", action=ActionType.BLOCK, reason="x" * 501)
        ManualActionInput(ip_address="192.168.1.1", action=ActionType.BLOCK, reason="Valid reason")  # 13 chars OK

    def test_manual_action_input_extra_forbidden(self):
        with pytest.raises(ValidationError):
            ManualActionInput(
                ip_address="192.168.1.1",
                action=ActionType.BLOCK,
                reason="Valid reason",
                extra_field="not_allowed"
            )


class TestMCPOutputModels:
    """Tests pour les modèles de sortie (sérialisation JSON)."""

    def test_alert_summary_from_orm(self):
        alert = Alert(
            id=1,
            timestamp=datetime(2026, 1, 1, 12, 0, 0),
            source_ip="192.168.1.1",
            destination_port=80,
            protocol="TCP",
            severity="warning",
            alert_type="Port scan",
        )
        summary = AlertSummary.model_validate(alert, from_attributes=True)
        assert summary.id == 1
        assert summary.source_ip == "192.168.1.1"
        assert summary.rule_triggered == "Port scan"

    def test_security_stats_summary(self):
        summary = SecurityStatsSummary(
            banned_hosts_count=2,
            banned_hosts=["10.0.0.1", "10.0.0.2"],
            anomaly_rate=0.15,
            total_alerts_count=100,
        )
        assert summary.banned_hosts_count == 2
        assert len(summary.banned_hosts) == 2

    def test_security_stats_response(self):
        response = SecurityStatsResponse(
            summary=SecurityStatsSummary(
                banned_hosts_count=0,
                banned_hosts=[],
                anomaly_rate=0.0,
                total_alerts_count=0,
            ),
            recent_alerts=[],
        )
        assert response.summary.total_alerts_count == 0
        assert response.recent_alerts == []

    def test_rl_decision_response(self):
        response = RLDecisionResponse(
            ip_address="192.168.1.1",
            decision_code=2,
            decision_label="block",
            confidence_score=0.95,
            low_confidence_flag=False,
            extracted_features_count=20,
            features_20_vector={"feature1": 0.5, "feature2": 0.8},
            evaluated_at="2026-01-01T12:00:00",
            model_version="1.0.0",
            reason="model_decision",
        )
        assert response.decision_code == 2
        assert response.confidence_score == 0.95
        assert not response.low_confidence_flag

    def test_rl_decision_not_found_response(self):
        response = RLDecisionNotFoundResponse(
            message="Not found",
            ip_address="192.168.1.1",
        )
        assert response.status == "not_found"
        assert response.ip_address == "192.168.1.1"

    def test_rl_decision_error_response(self):
        response = RLDecisionErrorResponse(
            message="Error occurred",
            ip_address="192.168.1.1",
        )
        assert response.status == "error"
        assert response.ip_address == "192.168.1.1"

    def test_rl_feedback_result(self):
        feedback = RLFeedbackResult(
            status="recorded",
            ip="192.168.1.1",
            action=2,
            reward=10.0,
            buffer_size=100,
        )
        assert feedback.status == "recorded"
        assert feedback.reward == 10.0

    def test_manual_action_response(self):
        response = ManualActionResponse(
            status="success",
            action_executed="blocked",
            target_ip="192.168.1.1",
            firewall_updated=True,
            rl_feedback_recorded=RLFeedbackResult(status="recorded"),
            reason="Test reason",
        )
        assert response.status == "success"
        assert response.firewall_updated is True

    def test_rl_decision_response_union_types(self):
        success = RLDecisionResponse(
            ip_address="192.168.1.1",
            decision_code=2,
            decision_label="block",
            confidence_score=0.95,
            low_confidence_flag=False,
            extracted_features_count=20,
            features_20_vector={},
            evaluated_at="2026-01-01T12:00:00",
        )
        not_found = RLDecisionNotFoundResponse(message="Not found", ip_address="192.168.1.1")
        error = RLDecisionErrorResponse(message="Error", ip_address="192.168.1.1")

        union: RLDecisionResponseUnion = success
        assert isinstance(union, RLDecisionResponse)

        union = not_found
        assert isinstance(union, RLDecisionNotFoundResponse)

        union = error
        assert isinstance(union, RLDecisionErrorResponse)


class TestMCPSyncFunctions:
    """Tests pour les fonctions synchrones (exécutées dans thread pools)."""

    def test_sync_get_security_stats_structure(self):
        """Teste que la fonction retourne la bonne structure (mock DB)."""
        from unittest.mock import patch, MagicMock

        with patch('app.mcp.tools.SessionLocal') as mock_session_local, \
             patch('app.mcp.tools.firewall_manager') as mock_firewall, \
             patch('app.mcp.tools.alert_manager') as mock_alert_manager:

            mock_db = MagicMock()
            mock_session_local.return_value = mock_db

            mock_alert = MagicMock(spec=Alert)
            mock_alert.id = 1
            mock_alert.timestamp = datetime(2026, 1, 1, 12, 0, 0)
            mock_alert.source_ip = "192.168.1.1"
            mock_alert.destination_port = 80
            mock_alert.protocol = "TCP"
            mock_alert.severity = "warning"
            mock_alert.alert_type = "Port scan"

            mock_db.query.return_value.order_by.return_value.limit.return_value.all.return_value = [mock_alert]
            mock_firewall.get_banned_hosts.return_value = ["10.0.0.1"]
            mock_alert_manager.get_global_stats.return_value = {"total_alerts": 50, "anomaly_rate": 0.1}

            result = _sync_get_security_stats(limit=10)

            assert isinstance(result, SecurityStatsResponse)
            assert result.summary.banned_hosts_count == 1
            assert result.summary.banned_hosts == ["10.0.0.1"]
            assert result.summary.anomaly_rate == 0.1
            assert result.summary.total_alerts_count == 50
            assert len(result.recent_alerts) == 1
            assert result.recent_alerts[0].source_ip == "192.168.1.1"

    def test_sync_explain_rl_decision_not_found(self):
        """Teste le cas où aucune décision n'est trouvée."""
        from unittest.mock import patch

        with patch('app.mcp.tools._ai_service') as mock_ai:
            mock_ai.get_latest_decision_for_ip.return_value = None

            result = _sync_explain_rl_decision("192.168.1.1")

            assert result is None

    def test_sync_explain_rl_decision_found(self):
        """Teste le cas où une décision est trouvée."""
        from unittest.mock import patch

        with patch('app.mcp.tools._ai_service') as mock_ai:
            mock_ai.get_latest_decision_for_ip.return_value = {
                "decision_code": 2,
                "decision_label": "block",
                "confidence": 0.92,
                "features": {"f1": 0.5, "f2": 0.8},
                "timestamp": "2026-01-01T12:00:00",
                "model_version": "1.0.0",
                "reason": "model_decision",
            }

            result = _sync_explain_rl_decision("192.168.1.1")

            assert isinstance(result, RLDecisionResponse)
            assert result.ip_address == "192.168.1.1"
            assert result.decision_code == 2
            assert result.confidence_score == 0.92
            assert result.low_confidence_flag is False
            assert result.extracted_features_count == 2


class TestActionTypeEnum:
    """Tests pour l'enum ActionType."""

    def test_action_type_values(self):
        assert ActionType.BLOCK == "block"
        assert ActionType.UNBAN == "unban"

    def test_action_type_mapping(self):
        from app.mcp.tools import _ACTION_TO_CODE
        assert _ACTION_TO_CODE[ActionType.BLOCK] == 2
        assert _ACTION_TO_CODE[ActionType.UNBAN] == 0


if __name__ == "__main__":
    pytest.main([__file__, "-v"])