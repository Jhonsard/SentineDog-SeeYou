import asyncio
import contextlib
import logging
import time
from unittest.mock import MagicMock, patch, AsyncMock

import pytest

from app.engine.processor import PacketProcessor, SQLI_PATTERNS, XSS_PATTERNS, RCE_PATTERNS
from app.core.json_logger import JSONFormatter


class TestDetectionRegex:
    def test_sqli_patterns_match(self):
        processor = PacketProcessor(alert_callback=MagicMock())
        assert any(p.search("union select password from users") for p in SQLI_PATTERNS)
        assert any(p.search("OR 1=1") for p in SQLI_PATTERNS)
        assert not any(p.search("Hello world") for p in SQLI_PATTERNS)

    def test_xss_patterns_match(self):
        processor = PacketProcessor(alert_callback=MagicMock())
        assert any(p.search("<script>alert(1)</script>") for p in XSS_PATTERNS)
        assert any(p.search("javascript:alert(1)") for p in XSS_PATTERNS)
        assert not any(p.search("no xss here") for p in XSS_PATTERNS)

    def test_rce_patterns_match(self):
        processor = PacketProcessor(alert_callback=MagicMock())
        assert any(p.search("/bin/sh") for p in RCE_PATTERNS)
        assert any(p.search("/bin/bash") for p in RCE_PATTERNS)
        assert any(p.search("cmd.exe /c dir") for p in RCE_PATTERNS)
        assert not any(p.search("normal text") for p in RCE_PATTERNS)

    def test_url_decode_normalization(self):
        import urllib.parse
        payload_raw = urllib.parse.unquote("%3Cscript%3Ealert(1)%3C/script%3E").lower()
        assert any(p.search(payload_raw) for p in XSS_PATTERNS)


class TestCircuitBreaker:
    def test_circuit_opens_after_errors(self):
        callback = MagicMock()
        processor = PacketProcessor(alert_callback=callback)
        processor._is_running = True

        processor._circuit_open = False
        processor._consecutive_errors = 0
        processor._circuit_open_since = 0.0

        for _ in range(3):
            if processor._circuit_open:
                break
            processor._circuit_open = False
            with patch("app.engine.processor.PacketProcessor._extract_features", return_value={"source_ip": "1.2.3.4", "payload": ""}):
                with patch("app.engine.processor.PacketProcessor._inspect_heuristics", side_effect=RuntimeError("boom")):
                    with patch("app.engine.processor.PacketProcessor._detect_port_scan"):
                        with patch("app.engine.processor.PacketProcessor._detect_syn_flood"):
                            with patch("app.engine.processor.PacketProcessor._periodic_cleanup_loop"):
                                queue_mock = MagicMock()
                                queue_mock.queue.get = AsyncMock(return_value=None)
                                queue_mock.task_done = MagicMock()
                                asyncio.run(processor.start_processing(queue_mock))
                                break

        assert processor._consecutive_errors >= 3
        assert processor._circuit_open is True

    def test_circuit_resets_after_timeout(self):
        callback = MagicMock()
        processor = PacketProcessor(alert_callback=callback)
        processor._circuit_open = True
        processor._circuit_open_since = time.time() - 31
        processor._MAX_CONSECUTIVE_ERRORS = 3
        processor._CIRCUIT_TIMEOUT_SECONDS = 30.0

        queue_mock = MagicMock()
        queue_mock.queue.get = AsyncMock(return_value=None)
        queue_mock.task_done = MagicMock()

        async def run():
            processor._is_running = True
            task = asyncio.create_task(processor.start_processing(queue_mock))
            await asyncio.sleep(0.05)
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task

        asyncio.run(run())
        assert processor._circuit_open is False
        assert processor._consecutive_errors == 0


class TestJwtRotation:
    def test_json_logger_outputs_valid_json(self):
        formatter = JSONFormatter()
        record = logging.LogRecord(
            name="test", level=logging.INFO, pathname="", lineno=0,
            msg="hello %s", args=("world",), exc_info=None
        )
        output = formatter.format(record)
        assert "hello world" in output
        assert output.startswith("{")
        assert output.endswith("}")

    def test_jwt_key_manager_rotation(self):
        from app.core.jwt_manager import JwtKeyManager
        from sqlalchemy import create_engine
        from sqlalchemy.orm import sessionmaker, Session
        from app.db.models import Base, JwtKey

        engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
        Base.metadata.create_all(engine)
        SessionLocal = sessionmaker(bind=engine)
        db: Session = SessionLocal()

        manager = JwtKeyManager(settings_key="x" * 32)
        first = manager.get_active_key(db)
        assert isinstance(first, str)
        assert len(first) == 64

        result = manager.rotate_key(db, admin_username="admin")
        assert result["active"] is True
        assert result["key_id"] >= 1

        second = manager.get_active_key(db)
        assert second != first

        db.close()
