import logging
import json
import os
from datetime import datetime, timezone
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import Dict, Any, Optional


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


class _UserOwnedRotatingFileHandler(RotatingFileHandler):
    """
    Journal rotatif dont le fichier actif reste lisible par l'utilisateur
    qui a lancé `sudo -E`, sans avoir besoin de root pour le consulter.
    """

    def _apply_owner(self) -> None:
        try:
            os.chmod(self.baseFilename, 0o640)
            sudo_uid = os.environ.get("SUDO_UID")
            sudo_gid = os.environ.get("SUDO_GID")
            if sudo_uid and sudo_gid:
                os.chown(self.baseFilename, int(sudo_uid), int(sudo_gid))
        except (OSError, ValueError):
            # Environnement sans sudo ou système de fichiers restreint.
            pass

    def doRollover(self) -> None:
        super().doRollover()
        self._apply_owner()


def _build_file_handler(log_file: str, level: int) -> RotatingFileHandler:
    """Crée un journal rotatif JSON (10 Mo, 5 archives)."""
    path = Path(log_file)
    path.parent.mkdir(parents=True, exist_ok=True)
    handler = _UserOwnedRotatingFileHandler(
        path,
        maxBytes=10 * 1024 * 1024,
        backupCount=5,
        encoding="utf-8",
    )
    handler.setFormatter(JSONFormatter())
    handler.setLevel(level)
    handler._apply_owner()
    return handler


def configure_logging(
    level: int = logging.INFO,
    log_file: Optional[str] = None,
) -> None:
    """
    Configure la sortie console et, si `log_file` est fourni, un fichier rotatif.
    Les logs uvicorn (dont les accès HTTP) sont également écrits dans le fichier.
    """
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(JSONFormatter())

    handlers: list[logging.Handler] = [console_handler]
    file_handler: Optional[RotatingFileHandler] = None
    if log_file:
        try:
            file_handler = _build_file_handler(log_file, level)
            handlers.append(file_handler)
        except OSError as exc:
            # Le fichier de logs est un confort : ne jamais empêcher le démarrage.
            logging.getLogger(__name__).warning(
                "Impossible d'ouvrir le fichier de logs %s : %s", log_file, exc
            )

    logging.basicConfig(level=level, handlers=handlers, force=True)

    if file_handler is not None:
        # `uvicorn.error` propage vers `uvicorn` : ne pas y attacher le fichier,
        # sinon chaque message de démarrage est écrit deux fois.
        for logger_name in ("uvicorn", "uvicorn.access"):
            uvicorn_logger = logging.getLogger(logger_name)
            already_attached = any(
                isinstance(existing, RotatingFileHandler)
                and getattr(existing, "baseFilename", None)
                == file_handler.baseFilename
                for existing in uvicorn_logger.handlers
            )
            if not already_attached:
                uvicorn_logger.addHandler(file_handler)
            if uvicorn_logger.level == logging.NOTSET:
                uvicorn_logger.setLevel(level)
