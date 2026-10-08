import logging
from typing import Generator
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session

from app.core.config import settings
from app.core.auth_utils import decode_access_token
from app.core.jwt_manager import jwt_key_manager
from app.db.models import User

logger = logging.getLogger("ids_ips.dependencies")

# Configuration du moteur de persistance relationnelle
# Support SQLite et PostgreSQL
if settings.USE_POSTGRES and settings.POSTGRES_HOST:
    # Configuration PostgreSQL
    DATABASE_URL = f"postgresql://{settings.POSTGRES_USER}:{settings.POSTGRES_PASSWORD}@{settings.POSTGRES_HOST}:{settings.POSTGRES_PORT}/{settings.POSTGRES_DB}"
    connect_args = {}
    logger.info(f"Using PostgreSQL database: {settings.POSTGRES_HOST}:{settings.POSTGRES_PORT}/{settings.POSTGRES_DB}")
else:
    # Configuration SQLite (par défaut)
    DATABASE_URL = settings.DATABASE_URL
    connect_args = {"check_same_thread": False} if settings.DATABASE_URL.startswith("sqlite") else {}
    logger.info(f"Using SQLite database: {settings.DATABASE_URL}")

engine = create_engine(DATABASE_URL, connect_args=connect_args, pool_pre_ping=True)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db() -> Generator[Session, None, None]:
    """
    Générateur de sessions de base de données (Pattern Unit of Work).
    Garantit la libération systématique de la connexion au pool à la fin de la requête.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Schéma d'extraction du jeton d'authentification Bearer
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/v1/auth/token")

async def get_current_user(
    token: str = Depends(oauth2_scheme), 
    db: Session = Depends(get_db)
) -> User:
    """
    Dépendance de sécurité extrayant et vérifiant le porteur du jeton d'accès JWT.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Session expirée ou authentification invalide.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    # Get the active JWT key from the database for verification
    signing_key = jwt_key_manager.get_active_key(db)
    token_data = decode_access_token(token, secret_key=signing_key)
    if token_data is None or token_data.username is None:
        raise credentials_exception
        
    # Recherche de l'utilisateur en base de données
    user = db.query(User).filter(User.username == token_data.username).first()
    if user is None:
        raise credentials_exception
        
    return user

async def get_current_active_user(
    current_user: User = Depends(get_current_user)
) -> User:
    """
    Vérifie si le compte de l'utilisateur authentifié est actif.
    """
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="Ce compte utilisateur est suspendu."
        )
    return current_user

async def get_current_admin_user(
    current_user: User = Depends(get_current_active_user)
) -> User:
    """
    Contrôle d'accès basé sur les rôles (RBAC). 
    Garantit l'exclusivité des routes d'administration aux seuls comptes dotés du privilège 'admin'.
    """
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="Privilèges d'administration requis pour exécuter cette action."
        )
    return current_user 
