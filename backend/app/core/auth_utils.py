from __future__ import annotations

import logging
import uuid
import json
import asyncio
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any
from jose import JWTError, jwt
import bcrypt  # Utilisation directe du module natif sans passlib
from fastapi import WebSocket
from app.core.config import settings
from app.api.schemas import TokenData

logger = logging.getLogger("ids_ips.auth_utils")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Vérifie la correspondance entre un mot de passe en clair et son empreinte hachée.
    Sécurisé contre les attaques par timing.
    """
    try:
        # bcrypt requiert des chaînes d'octets (bytes)
        return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))
    except Exception as e:
        logger.error(f"Erreur lors de la vérification cryptographique du mot de passe: {str(e)}")
        return False

def get_password_hash(password: str) -> str:
    """
    Génère un sel unique et applique l'algorithme Bcrypt pour hacher le mot de passe.
    Retourne une chaîne de caractères (str) prête pour le stockage SQL.
    """
    try:
        # Génération du sel et hachage
        salt = bcrypt.gensalt()
        hashed_bytes = bcrypt.hashpw(password.encode('utf-8'), salt)
        return hashed_bytes.decode('utf-8')
    except Exception as e:
        logger.error(f"Erreur lors du hachage du mot de passe: {str(e)}")
        raise

def create_access_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None, secret_key: Optional[str] = None) -> str:
    """
    Génère un jeton d'authentification JWT signé de manière unifiée en UTC.
    Ajoute un identifiant unique `jti` pour permettre la révocation future.
    """
    to_encode = data.copy()
    now = datetime.now(timezone.utc)
    
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(minutes=int(settings.ACCESS_TOKEN_EXPIRE_MINUTES))
        
    to_encode.update({
        "exp": int(expire.timestamp()),
        "iat": int(now.timestamp()),
        "nbf": int(now.timestamp()),
        "jti": str(uuid.uuid4()),
    })
    
    signing_key = secret_key or settings.SECRET_KEY
    try:
        encoded_jwt = jwt.encode(to_encode, signing_key, algorithm=settings.ALGORITHM)
        return encoded_jwt
    except JWTError as e:
        logger.critical(f"Échec critique de signature cryptographique du token: {str(e)}")
        raise

def decode_access_token(token: str, secret_key: Optional[str] = None) -> Optional[TokenData]:
    """
    Décode, vérifie l'intégrité de la signature et valide la date d'expiration d'un JWT.
    """
    signing_key = secret_key or settings.SECRET_KEY
    try:
        payload = jwt.decode(token, signing_key, algorithms=[settings.ALGORITHM])
        username: Optional[str] = payload.get("sub")
        jti: Optional[str] = payload.get("jti")
        if username is None:
            return None
        return TokenData(username=username, jti=jti)
    except JWTError:
        return None
    except Exception as e:
        logger.error(f"Erreur d'extraction ou de parsing du payload JWT: {str(e)}")
        return None

async def authenticate_websocket(websocket: WebSocket, timeout: int = 10, secret_key: Optional[str] = None) -> Optional[TokenData]:
    """
    Authentifie une connexion WebSocket via un token JWT transmis dans le premier message.
    Attend un JSON de la forme {"token": "..."}.
    """
    try:
        raw = await asyncio.wait_for(websocket.receive_text(), timeout=timeout)
    except asyncio.TimeoutError:
        await websocket.close(code=1008, reason="Timeout : token d'authentification requis")
        return None
    except Exception:
        await websocket.close(code=1008, reason="Erreur lors de la réception du token")
        return None
    
    try:
        data = json.loads(raw) if raw else {}
    except Exception:
        await websocket.close(code=1008, reason="Format JSON invalide pour le token")
        return None
    
    token = data.get("token")
    if not token:
        await websocket.close(code=1008, reason="Token d'authentification manquant")
        return None
    
    token_data = decode_access_token(token, secret_key=secret_key)
    if token_data is None:
        await websocket.close(code=1008, reason="Token d'authentification invalide ou expiré")
        return None
    
    return token_data

async def get_user_from_ws_token(token_data: Optional[TokenData]) -> Optional[User]:
    """Charge et valide l'utilisateur associé à un token WebSocket."""
    if token_data is None or token_data.username is None:
        return None
    from app.core.dependencies import SessionLocal
    from app.db.models import User
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.username == token_data.username).first()
        return user
    finally:
        db.close()
