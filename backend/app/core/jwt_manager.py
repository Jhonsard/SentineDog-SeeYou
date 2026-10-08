import secrets
from typing import Optional
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
from app.db.models import JwtKey


class JwtKeyManager:
    def __init__(self, settings_key: str) -> None:
        self.settings_key = settings_key

    def _generate_key_value(self) -> str:
        return secrets.token_hex(32)

    def get_active_key(self, db: Session) -> str:
        active = db.query(JwtKey).filter(JwtKey.is_active == True).first()
        if active:
            return active.key_value
        bootstrap = db.query(JwtKey).first()
        if bootstrap:
            bootstrap.is_active = True
            db.commit()
            return bootstrap.key_value
        new_key = JwtKey(key_value=self._generate_key_value(), is_active=True)
        db.add(new_key)
        db.commit()
        db.refresh(new_key)
        return new_key.key_value

    def rotate_key(self, db: Session, admin_username: str, note: Optional[str] = None) -> dict:
        active = db.query(JwtKey).filter(JwtKey.is_active == True).first()
        if active:
            active.is_active = False
        new_key = JwtKey(
            key_value=self._generate_key_value(),
            is_active=True,
            rotation_note=note or f"Rotation par {admin_username}"
        )
        db.add(new_key)
        db.commit()
        db.refresh(new_key)
        return {
            "key_id": new_key.id,
            "created_at": new_key.created_at.isoformat() if new_key.created_at else None,
            "rotation_note": new_key.rotation_note,
            "active": new_key.is_active,
        }


from app.core.config import settings

jwt_key_manager = JwtKeyManager(settings_key=settings.SECRET_KEY)
