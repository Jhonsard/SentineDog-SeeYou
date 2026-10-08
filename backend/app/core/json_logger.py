import logging
import json
from datetime import datetime, timezone
from typing import Dict, Any


class JSONFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        log_entry: Dict[str, Any] = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "module": record.name,
            "message": record.getMessage(),
            "extra": {}
        }
        for key, value in record.__dict__.items():
            if key not in (
                "name", "msg", "args", "created", "relativeCreated",
                "exc_info", "exc_text", "stack_info", "lineno", "pathname",
                "filename", "module", "funcName", "msecs", "thread", "threadName",
                "process", "processName", "levelname", "levelno", "message",
                "taskName"
            ):
                log_entry["extra"][key] = value
        if record.exc_info and record.exc_info[0]:
            log_entry["extra"]["exception"] = self.formatException(record.exc_info)
        return json.dumps(log_entry, ensure_ascii=False)


def configure_logging(level: int = logging.INFO) -> None:
    handler = logging.StreamHandler()
    handler.setFormatter(JSONFormatter())
    logging.basicConfig(level=level, handlers=[handler], force=True)
