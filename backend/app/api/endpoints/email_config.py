from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from typing import Optional
from sqlalchemy.orm import Session

from app.core.dependencies import get_db, get_current_admin_user
from app.db.models import User
from app.services.email_service import email_service
from app.core.config import settings

router = APIRouter(prefix="/email", tags=["Configuration Email"])

class EmailConfig(BaseModel):
    """Schéma de configuration email."""
    smtp_server: str
    smtp_port: int = 587
    smtp_username: str
    smtp_password: str
    smtp_sender_email: EmailStr
    admin_email: EmailStr

class EmailTestRequest(BaseModel):
    """Schéma de test email."""
    test_recipient: Optional[EmailStr] = None

@router.get("/config", summary="Récupérer la configuration email actuelle")
async def get_email_config(
    current_user: User = Depends(get_current_admin_user)
) -> dict:
    """
    Récupère la configuration email actuelle (masque les mots de passe).
    """
    return {
        "smtp_server": settings.SMTP_SERVER,
        "smtp_port": settings.SMTP_PORT,
        "smtp_username": settings.SMTP_USERNAME,
        "smtp_sender_email": settings.SMTP_SENDER_EMAIL,
        "admin_email": settings.ADMIN_EMAIL,
        "is_configured": email_service.is_configured()
    }

@router.post("/config", summary="Mettre à jour la configuration email")
async def update_email_config(
    config: EmailConfig,
    current_user: User = Depends(get_current_admin_user)
) -> dict:
    """
    Met à jour la configuration email.
    Note: Cette configuration est stockée dans les variables d'environnement.
    Pour un changement permanent, modifiez le fichier .env.
    """
    try:
        # Mettre à jour les settings (en mémoire uniquement)
        settings.SMTP_SERVER = config.smtp_server
        settings.SMTP_PORT = config.smtp_port
        settings.SMTP_USERNAME = config.smtp_username
        settings.SMTP_PASSWORD = config.smtp_password
        settings.SMTP_SENDER_EMAIL = config.smtp_sender_email
        settings.ADMIN_EMAIL = config.admin_email
        
        # Recréer l'instance du service email avec la nouvelle configuration
        email_service.smtp_server = config.smtp_server
        email_service.smtp_port = config.smtp_port
        email_service.smtp_username = config.smtp_username
        email_service.smtp_password = config.smtp_password
        email_service.sender_email = config.smtp_sender_email
        email_service.admin_email = config.admin_email
        
        return {
            "status": "success",
            "message": "Configuration email mise à jour avec succès",
            "is_configured": email_service.is_configured()
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur lors de la mise à jour de la configuration: {str(e)}"
        )

@router.post("/test", summary="Tester l'envoi d'email")
async def test_email(
    request: EmailTestRequest,
    current_user: User = Depends(get_current_admin_user)
) -> dict:
    """
    Envoie un email de test pour vérifier la configuration SMTP.
    """
    if not email_service.is_configured():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Le service email n'est pas configuré. Veuillez configurer les paramètres SMTP d'abord."
        )
    
    recipient = request.test_recipient or email_service.admin_email
    
    subject = "Test de configuration email - IDS-IPS ULPGL"
    body = """
Ceci est un email de test envoyé par le système IDS-IPS ULPGL.

Si vous recevez cet email, cela signifie que la configuration SMTP est correcte
et que le service d'envoi d'emails fonctionne normalement.

Détails de la configuration:
- Serveur SMTP: {smtp_server}
- Port: {smtp_port}
- Utilisateur: {smtp_username}
- Expéditeur: {sender_email}
- Destinataire: {recipient}

---
IDS-IPS ULPGL - Système de Détection et Prévention d'Intrusion
""".format(
        smtp_server=email_service.smtp_server,
        smtp_port=email_service.smtp_port,
        smtp_username=email_service.smtp_username,
        sender_email=email_service.sender_email,
        recipient=recipient
    )
    
    success = email_service.send_email(subject, body)
    
    if success:
        return {
            "status": "success",
            "message": f"Email de test envoyé avec succès à {recipient}"
        }
    else:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Échec de l'envoi de l'email de test. Vérifiez votre configuration SMTP."
        )

@router.get("/status", summary="Vérifier le statut du service email")
async def get_email_status(
    current_user: User = Depends(get_current_admin_user)
) -> dict:
    """
    Retourne le statut actuel du service email.
    """
    return {
        "is_configured": email_service.is_configured(),
        "smtp_server": settings.SMTP_SERVER,
        "smtp_port": settings.SMTP_PORT,
        "smtp_username": settings.SMTP_USERNAME,
        "sender_email": settings.SMTP_SENDER_EMAIL,
        "admin_email": settings.ADMIN_EMAIL
    }
