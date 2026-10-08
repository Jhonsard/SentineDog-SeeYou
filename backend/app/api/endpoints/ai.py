from fastapi import APIRouter, Depends, HTTPException, status, Request
from pydantic import BaseModel, IPvAnyAddress, Field, ConfigDict
from sqlalchemy.orm import Session
from typing import Dict, Any, Optional

from app.core.dependencies import get_db, get_current_admin_user
from app.core.rate_limiter import limiter
from app.core.config import settings
from app.db.models import User
from app.services.ai_decision_service import AIDecisionService

router = APIRouter(prefix="/ai", tags=["Intelligence Artificielle"])


class DecideRequest(BaseModel):
    ip: IPvAnyAddress
    context: Optional[Dict[str, Any]] = None


class DecideResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    ip: str
    action: str
    confidence: float
    model_version: Optional[str]
    features_used: Dict[str, float]
    fallback_count: int
    reason: str


class StatusResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    model_loaded: bool
    model_version: Optional[str]
    model_path: str
    is_trained: bool
    fallback_count: int
    observation_version: str
    features_count: int
    total_decisions: int
    ai_mode_enabled: bool
    rl_manual_mode: bool
    rl_manual_mode_learning_enabled: bool


class AlignmentResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    aligned: bool
    backend_features: list
    model_features: list
    mismatches: list


class FeedbackRequest(BaseModel):
    ip: IPvAnyAddress
    human_action: int = Field(ge=0, le=3, description="0=allow, 1=alert, 2=block, 3=manual")
    context: Optional[Dict[str, Any]] = None


class FeedbackResponse(BaseModel):
    status: str
    ip: str
    action: int
    reward: float
    buffer_size: int


class AIModeRequest(BaseModel):
    ai_mode_enabled: Optional[bool] = None
    rl_manual_mode: Optional[bool] = None
    rl_manual_mode_learning_enabled: Optional[bool] = None


_ai_service = AIDecisionService()


@router.post("/decide", response_model=DecideResponse, summary="Décision IA pour une IP")
@limiter.limit(f"{settings.AI_MAX_DECISIONS_PER_MINUTE}/minute")
async def decide_ip(
    request: Request,
    payload: DecideRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    return await _ai_service.evaluate_ip(str(payload.ip), payload.context)


@router.get("/status", response_model=StatusResponse, summary="Statut du module IA")
async def ai_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    stats = _ai_service.rl.get_stats()
    extractor_names = _ai_service.extractor.get_feature_names()
    return StatusResponse(
        model_loaded=stats.get("is_trained", False),
        model_version=stats.get("model_version"),
        model_path=stats.get("model_path", ""),
        is_trained=stats.get("is_trained", False),
        fallback_count=stats.get("fallback_count", 0),
        observation_version=stats.get("observation_version", ""),
        features_count=len(extractor_names),
        total_decisions=stats.get("total_decisions", 0),
        ai_mode_enabled=getattr(_ai_service, "ai_mode_enabled", False),
        rl_manual_mode=getattr(_ai_service, "rl_manual_mode", False),
        rl_manual_mode_learning_enabled=getattr(_ai_service, "rl_manual_mode_learning_enabled", False),
    )


@router.post("/mode", response_model=StatusResponse, summary="Activer/désactiver le mode Agent IA et le mode manuel RL")
async def ai_set_mode(
    payload: AIModeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    _ai_service.set_mode(
        ai_mode_enabled=payload.ai_mode_enabled,
        rl_manual_mode=payload.rl_manual_mode,
        rl_manual_mode_learning_enabled=payload.rl_manual_mode_learning_enabled,
    )
    return await ai_status(db, current_user)


@router.get("/alignment", response_model=AlignmentResponse, summary="Alignement features backend ↔ RL")
async def ai_alignment(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    backend_features = _ai_service.extractor.get_feature_names()
    model_features = getattr(_ai_service.rl.agent, "get_feature_names", lambda: [])()
    mismatches = []
    if backend_features != model_features:
        mismatches = [
            {"backend": b, "model": m}
            for b, m in zip(backend_features, model_features + [""] * (len(backend_features) - len(model_features)))
            if b != m
        ]
    return AlignmentResponse(
        aligned=_ai_service.extractor.validate_alignment(_ai_service.rl.agent),
        backend_features=backend_features,
        model_features=model_features,
        mismatches=mismatches,
    )


@router.post("/reload", summary="Recharger le modèle RL depuis le disque ou HuggingFace")
async def ai_reload(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    try:
        from ml_model.RL.inference import RLInference
        hf_repo_id = getattr(settings, "AI_HF_REPO_ID", None)
        if hf_repo_id:
            _ai_service.rl = RLInference(
                model_path=settings.AI_MODEL_PATH,
                hf_repo_id=hf_repo_id,
                hf_filename=getattr(settings, "AI_HF_FILENAME", "rl_agent.keras"),
                hf_token=settings.HF_READ_TOKEN,
            )
            source = "HuggingFace"
        else:
            _ai_service.rl = RLInference(model_path=settings.AI_MODEL_PATH)
            source = "local"
        return {"status": "success", "message": f"Modèle RL rechargé depuis {source}"}
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))


@router.post("/feedback", response_model=FeedbackResponse, summary="Soumettre une décision humaine en mode manuel")
async def ai_feedback(
    payload: FeedbackRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    result = _ai_service.record_manual_feedback(
        ip=str(payload.ip),
        human_action=payload.human_action,
        context=payload.context,
    )
    return FeedbackResponse(
        status=result.get("status", "error"),
        ip=str(payload.ip),
        action=payload.human_action,
        reward=result.get("reward", 0.0),
        buffer_size=result.get("buffer_size", 0),
    )
