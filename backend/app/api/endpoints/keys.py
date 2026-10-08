from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional

from app.core.dependencies import get_db, get_current_admin_user
from app.core.jwt_manager import jwt_key_manager
from app.db.models import User


router = APIRouter(prefix="/keys", tags=["Gestion des cles JWT"])


class RotateKeyRequest(BaseModel):
    note: Optional[str] = None


class RotateKeyResponse(BaseModel):
    key_id: int
    created_at: Optional[str]
    rotation_note: Optional[str]
    active: bool


@router.post("/rotate", response_model=RotateKeyResponse, summary="Rotation de la cle JWT (admin)")
async def rotate_jwt_key(
    payload: RotateKeyRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    """
    Cree une nouvelle cle JWT, desactive l'ancienne et retourne les informations de rotation.
    """
    result = jwt_key_manager.rotate_key(db, admin_username=current_user.username, note=payload.note)
    return RotateKeyResponse(**result)


@router.get("/current", summary="Cle JWT active (masquee)")
async def get_current_jwt_key(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    """
    Retourne un indicateur de presence de cle active sans reveler sa valeur complete.
    """
    from app.db.models import JwtKey
    active = db.query(JwtKey).filter(JwtKey.is_active == True).first()
    if not active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Aucune cle JWT active")
    return {
        "key_id": active.id,
        "is_active": active.is_active,
        "created_at": active.created_at.isoformat() if active.created_at else None,
        "rotation_note": active.rotation_note,
        "prefix": active.key_value[:8] + "..."
    }
