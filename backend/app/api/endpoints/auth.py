from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.core.auth_utils import create_access_token, verify_password
from app.core.config import settings
from app.core.jwt_manager import jwt_key_manager
from app.core.rate_limiter import limiter
from app.db.models import User as UserModel
from app.api.schemas import Token, User, UserCreate
from app.core.dependencies import get_db, get_current_active_user
from app.core.auth_utils import get_password_hash
from app.services.threat_detector import threat_detector

router = APIRouter(prefix="/auth", tags=["Authentification"])

@router.post("/token", response_model=Token, summary="Authentification utilisateur et obtention de token JWT")
@limiter.limit(f"{settings.RATE_LIMIT_AUTH_REQUESTS}/{settings.RATE_LIMIT_AUTH_WINDOW_SECONDS}seconds")
async def login_for_access_token(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
) -> dict[str, str]:
    """
    Point d'entrée de sécurité pour l'échange d'identifiants contre un jeton d'accès signé (JWT).
    Conforme aux spécifications de sécurité OAuth2 et immunisé contre l'énumération utilisateur.
    """
    client_ip = request.client.host if request.client else "unknown"
    
    user = db.query(UserModel).filter(UserModel.username == form_data.username).first()
    
    if not user or not verify_password(form_data.password, user.hashed_password):
        threat_detector.analyze_login_attempt(
            username=form_data.username,
            ip_address=client_ip,
            timestamp=datetime.now(timezone.utc).isoformat(),
            location=None,
            is_new_location=False,
            failed_attempts=0,
            is_success=False
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Nom d'utilisateur ou mot de passe incorrect",
            headers={"WWW-Authenticate": "Bearer"},
        )
         
    if not user.is_active:
        threat_detector.analyze_login_attempt(
            username=user.username,
            ip_address=client_ip,
            timestamp=datetime.now(timezone.utc).isoformat(),
            location=None,
            is_new_location=False,
            failed_attempts=0,
            is_success=False
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Compte utilisateur désactivé ou banni du système.",
            headers={"WWW-Authenticate": "Bearer"},
        )
 
    access_token_expires = timedelta(minutes=int(settings.ACCESS_TOKEN_EXPIRE_MINUTES))
    active_secret = jwt_key_manager.get_active_key(db)
    access_token = create_access_token(
        data={"sub": user.username, "role": user.role},
        expires_delta=access_token_expires,
        secret_key=active_secret
    )
    
    threat_detector.analyze_login_attempt(
        username=user.username,
        ip_address=client_ip,
        timestamp=datetime.now(timezone.utc).isoformat(),
        location=None,
        is_new_location=False,
        failed_attempts=0,
        is_success=True
    )
    
    return {
        "access_token": access_token, 
        "token_type": "bearer"
        }


@router.post("/register", response_model=User, status_code=status.HTTP_201_CREATED, summary="Inscription d'un nouvel utilisateur")
@limiter.limit(f"{settings.RATE_LIMIT_AUTH_REQUESTS}/{settings.RATE_LIMIT_AUTH_WINDOW_SECONDS}seconds")
async def register_user(
    request: Request,
    user_data: UserCreate,
    db: Session = Depends(get_db)
) -> User:
    """
    Crée un nouvel compte utilisateur.
    Vérifie l'unicité du username et de l'email avant création.
    """
    # Vérifier si le username existe déjà
    existing_user = db.query(UserModel).filter(UserModel.username == user_data.username).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ce nom d'utilisateur existe déjà."
        )
    
    # Vérifier si l'email existe déjà
    existing_email = db.query(UserModel).filter(UserModel.email == user_data.email).first()
    if existing_email:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cet email est déjà enregistré."
        )
    
    # Hasher le mot de passe
    hashed_password = get_password_hash(user_data.password)
    
    # Créer l'utilisateur
    new_user = UserModel(
        username=user_data.username,
        email=user_data.email,
        hashed_password=hashed_password,
        role=user_data.role,
        is_active=True
    )
    
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    return new_user


@router.get("/me", response_model=User, summary="Profil de l'utilisateur authentifié (Identity Monitoring)")
@limiter.limit(f"{settings.RATE_LIMIT_AUTH_REQUESTS}/{settings.RATE_LIMIT_AUTH_WINDOW_SECONDS}seconds")
async def read_current_user(
    request: Request,
    current_user: UserModel = Depends(get_current_active_user),
) -> User:
    """
    Renvoie le profil de l'utilisateur courant à partir du jeton JWT (Identity Monitoring).
    Sert la vue front-end / Profile sans exposition du mot de passe.
    """
    return current_user
