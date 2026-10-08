from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, EmailStr, Field

# SCHÉMAS LIÉS AUX ALERTES 
class AlertCreate(BaseModel):
    """Schéma de validation pour l'injection d'une nouvelle alerte réseau."""
    source_ip: str = Field(..., examples=["192.168.1.50"])
    destination_ip: str = Field(..., examples=["10.0.0.1"])
    source_port: Optional[int] = Field(None, ge=0, le=65535)
    destination_port: Optional[int] = Field(None, ge=0, le=65535)
    protocol: str = Field(..., examples=["TCP", "UDP", "ICMP"])
    alert_type: str = Field(..., examples=["Scan ICMP (Ping Sweep)"])  # Alignera l'une de 100 attaques definies
    description: str = Field(..., examples=["Balayage ICMP glissant détecté"])
    is_blocked: bool = False
    is_manual_block: bool = False
    validated_by_admin: bool = False
    severity: str = Field("normal", examples=["normal", "warning", "critique", "tres_critique"])
    event_count: int = Field(1, description="Nombre d'itérations ou paquets suspectés pour cette IP")

class Alert(AlertCreate):
    """Schéma de sérialisation pour la lecture des alertes depuis l'API."""
    id: int
    timestamp: datetime

    model_config = ConfigDict(from_attributes=True)

# SCHÉMAS LIÉS AUX UTILISATEURS

class UserCreate(BaseModel):
    """Schéma d'inscription : le mot de passe en clair est requis ici."""
    username: str = Field(..., min_length=3, max_length=50)
    email: EmailStr
    password: str = Field(..., min_length=8)
    role: str = "user"

class User(BaseModel):
    """Schéma de sortie sécurisé : aucune trace du mot de passe (hashed ou non)."""
    id: int
    username: str
    email: EmailStr
    role: str
    is_active: bool

    model_config = ConfigDict(from_attributes=True)

# SCHÉMAS LIÉS AUX JETONS DE SÉCURITÉ (AUTH)

class Token(BaseModel):
    """Conteneur du jeton d'accès OAuth2 renvoyé au client."""
    access_token: str
    token_type: str

class TokenData(BaseModel):
    """Structure de transport de la charge utile (payload) extraite du JWT."""
    username: Optional[str] = None
    jti: Optional[str] = None 
