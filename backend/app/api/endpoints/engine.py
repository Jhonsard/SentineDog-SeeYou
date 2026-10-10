"""Endpoints de pilotage du moteur d'acquisition réseau (sniffer + processeur)."""
from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.core.dependencies import get_current_admin_user
from app.db.models import User
from app.engine.controller import EngineController

router = APIRouter(prefix="/engine", tags=["Moteur de capture"])


def _get_engine(request: Request) -> EngineController:
    engine = getattr(request.app.state, "engine", None)
    if engine is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Le moteur de capture n'est pas initialisé.",
        )
    return engine


@router.get("/status", summary="État du moteur de capture réseau")
async def engine_status(
    request: Request,
    current_user: User = Depends(get_current_admin_user),
) -> dict:
    return _get_engine(request).status()


@router.post("/sniffer/start", summary="Armer la capture réseau (démarre le sniffer)")
async def start_sniffer(
    request: Request,
    current_user: User = Depends(get_current_admin_user),
) -> dict:
    return await _get_engine(request).start_sniffer()


@router.post("/sniffer/stop", summary="Désarmer la capture réseau")
async def stop_sniffer(
    request: Request,
    current_user: User = Depends(get_current_admin_user),
) -> dict:
    return await _get_engine(request).stop_sniffer()
