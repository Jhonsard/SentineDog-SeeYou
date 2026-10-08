"""
Service d'envoi d'emails pour les alertes de sécurité critiques.
Utilise SMTP pour notifier l'administrateur des événements suspects.
"""
import smtplib
import ssl
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional
import logging
from datetime import datetime
from app.core.config import settings

logger = logging.getLogger(__name__)

class EmailService:
    """Service centralisé pour l'envoi d'emails de sécurité."""
    
    def __init__(self):
        self.smtp_server = settings.SMTP_SERVER
        self.smtp_port = settings.SMTP_PORT
        self.smtp_username = settings.SMTP_USERNAME
        self.smtp_password = settings.SMTP_PASSWORD
        self.sender_email = settings.SMTP_SENDER_EMAIL
        self.admin_email = settings.ADMIN_EMAIL
    
    def is_configured(self) -> bool:
        """Vérifie si le service SMTP est correctement configuré."""
        return all([
            self.smtp_server,
            self.smtp_username,
            self.smtp_password,
            self.sender_email,
            self.admin_email
        ])
    
    def send_email(
        self,
        subject: str,
        body: str,
        html_body: Optional[str] = None
    ) -> bool:
        """
        Envoie un email à l'administrateur.
        
        Args:
            subject: Sujet de l'email
            body: Corps du email en texte brut
            html_body: Corps du email en HTML (optionnel)
            
        Returns:
            True si l'email a été envoyé avec succès, False sinon
        """
        if not self.is_configured():
            logger.warning("Service SMTP non configuré - email non envoyé")
            return False
        
        try:
            # Création du message
            msg = MIMEMultipart('alternative')
            msg['From'] = self.sender_email
            msg['To'] = self.admin_email
            msg['Subject'] = f"[IDS-IPS ALERT] {subject}"
            
            # Ajout du corps texte
            text_part = MIMEText(body, 'plain')
            msg.attach(text_part)
            
            # Ajout du corps HTML si fourni
            if html_body:
                html_part = MIMEText(html_body, 'html')
                msg.attach(html_part)
            
            # Connexion SMTP et envoi — gestion dynamique STARTTLS (587) vs SSL (465)
            context = ssl.create_default_context()
            if self.smtp_port == 465:
                with smtplib.SMTP_SSL(self.smtp_server, self.smtp_port, context=context, timeout=10) as server:
                    server.login(self.smtp_username, self.smtp_password)
                    server.send_message(msg)
            else:
                with smtplib.SMTP(self.smtp_server, self.smtp_port, timeout=10) as server:
                    server.starttls(context=context)
                    server.login(self.smtp_username, self.smtp_password)
                    server.send_message(msg)
            
            logger.info(f"Email envoyé avec succès: {subject}")
            return True
            
        except Exception as e:
            logger.error(f"Erreur lors de l'envoi de l'email: {e}")
            return False
    
    def send_suspicious_connection_alert(
        self,
        source_ip: str,
        destination_ip: str,
        port: int,
        protocol: str,
        alert_type: str,
        severity: str,
        timestamp: str
    ) -> bool:
        """
        Envoie une alerte de connexion suspecte.
        
        Args:
            source_ip: Adresse IP source
            destination_ip: Adresse IP de destination
            port: Port concerné
            protocol: Protocole (TCP/UDP/ICMP)
            alert_type: Type d'alerte
            severity: Sévérité de l'alerte
            timestamp: Horodatage de l'événement
            
        Returns:
            True si l'email a été envoyé avec succès
        """
        subject = f"Connexion suspecte détectée - {severity.upper()}"
        
        body = f"""
ALERTE DE SÉCURITÉ - CONNEXION SUSPECTE

Une activité suspecte a été détectée sur votre réseau:

Détails de l'alerte:
- Source IP: {source_ip}
- Destination IP: {destination_ip}
- Port: {port}
- Protocole: {protocol}
- Type d'alerte: {alert_type}
- Sévérité: {severity.upper()}
- Horodatage: {timestamp}

Cette connexion a été identifiée comme potentiellement malveillante par le système IDS-IPS.

Action recommandée:
- Vérifiez les logs détaillés dans le tableau de bord
- Envisagez de bloquer l'adresse IP source si l'activité est confirmée malveillante
- Surveillez les connexions provenant de cette adresse IP

---
IDS-IPS ULPGL - Système de Détection et Prévention d'Intrusion
"""

        html_body = f"""
<html>
<head>
    <style>
        body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
        .alert-box {{ background-color: #fee; border: 1px solid #fcc; padding: 15px; margin: 20px 0; border-radius: 5px; }}
        .info-box {{ background-color: #eef; border: 1px solid #ccf; padding: 15px; margin: 20px 0; border-radius: 5px; }}
        .severity-high {{ color: #c00; font-weight: bold; }}
        .severity-critical {{ color: #900; font-weight: bold; }}
        table {{ border-collapse: collapse; width: 100%; margin: 20px 0; }}
        th, td {{ border: 1px solid #ddd; padding: 8px; text-align: left; }}
        th {{ background-color: #f2f2f2; }}
    </style>
</head>
<body>
    <h1 style="color: #c00;">⚠️ ALERTE DE SÉCURITÉ - CONNEXION SUSPECTE</h1>
    
    <div class="alert-box">
        <p>Une activité suspecte a été détectée sur votre réseau.</p>
    </div>
    
    <h2>Détails de l'alerte:</h2>
    <table>
        <tr><th>Source IP</th><td>{source_ip}</td></tr>
        <tr><th>Destination IP</th><td>{destination_ip}</td></tr>
        <tr><th>Port</th><td>{port}</td></tr>
        <tr><th>Protocole</th><td>{protocol}</td></tr>
        <tr><th>Type d'alerte</th><td>{alert_type}</td></tr>
        <tr><th>Sévérité</th><td class="severity-{severity.lower()}">{severity.upper()}</td></tr>
        <tr><th>Horodatage</th><td>{timestamp}</td></tr>
    </table>
    
    <div class="info-box">
        <h3>Action recommandée:</h3>
        <ul>
            <li>Vérifiez les logs détaillés dans le tableau de bord</li>
            <li>Envisagez de bloquer l'adresse IP source si l'activité est confirmée malveillante</li>
            <li>Surveillez les connexions provenant de cette adresse IP</li>
        </ul>
    </div>
    
    <hr>
    <p style="color: #666; font-size: 12px;">
        IDS-IPS ULPGL - Système de Détection et Prévention d'Intrusion<br>
        {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
    </p>
</body>
</html>
"""
        
        return self.send_email(subject, body, html_body)
    
    def send_intrusion_alert(
        self,
        source_ip: str,
        attack_type: str,
        description: str,
        timestamp: str,
        blocked: bool = False
    ) -> bool:
        """
        Envoie une alerte d'intrusion critique.
        
        Args:
            source_ip: Adresse IP source de l'attaque
            attack_type: Type d'attaque
            description: Description de l'attaque
            timestamp: Horodatage de l'événement
            blocked: Indique si l'attaque a été bloquée
            
        Returns:
            True si l'email a été envoyé avec succès
        """
        status = "BLOQUÉE" if blocked else "DÉTECTÉE"
        subject = f"Intrusion {status} - {attack_type}"
        
        body = f"""
ALERTE CRITIQUE - INTRUSION DÉTECTÉE

Une tentative d'intrusion a été détectée sur votre système:

Détails de l'attaque:
- Source IP: {source_ip}
- Type d'attaque: {attack_type}
- Description: {description}
- Statut: {status}
- Horodatage: {timestamp}

Cette activité a été identifiée comme une menace critique pour votre infrastructure.

Action immédiate requise:
- Vérifiez immédiatement les logs système
- Confirmez si l'attaque a été bloquée automatiquement
- Envisagez de renforcer les règles de pare-feu
- Documentez l'incident pour analyse future

---
IDS-IPS ULPGL - Système de Détection et Prévention d'Intrusion
"""

        html_body = f"""
<html>
<head>
    <style>
        body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
        .critical-alert {{ background-color: #fdd; border: 2px solid #f00; padding: 20px; margin: 20px 0; border-radius: 5px; }}
        .blocked {{ background-color: #dfd; border: 2px solid #0c0; padding: 20px; margin: 20px 0; border-radius: 5px; }}
        table {{ border-collapse: collapse; width: 100%; margin: 20px 0; }}
        th, td {{ border: 1px solid #ddd; padding: 8px; text-align: left; }}
        th {{ background-color: #f2f2f2; }}
    </style>
</head>
<body>
    <h1 style="color: #c00;">🚨 ALERTE CRITIQUE - INTRUSION DÉTECTÉE</h1>
    
    <div class="{'blocked' if blocked else 'critical-alert'}">
        <h2 style="color: {'#0c0' if blocked else '#c00'};">
            {'✅ ATTAQUE BLOQUÉE' if blocked else '⚠️ ATTAQUE DÉTECTÉE'}
        </h2>
        <p>Une tentative d'intrusion a été détectée sur votre système.</p>
    </div>
    
    <h2>Détails de l'attaque:</h2>
    <table>
        <tr><th>Source IP</th><td>{source_ip}</td></tr>
        <tr><th>Type d'attaque</th><td>{attack_type}</td></tr>
        <tr><th>Description</th><td>{description}</td></tr>
        <tr><th>Statut</th><td style="font-weight: bold;">{status}</td></tr>
        <tr><th>Horodatage</th><td>{timestamp}</td></tr>
    </table>
    
    <div style="background-color: #fff3cd; border: 1px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 5px;">
        <h3 style="color: #856404;">⚡ Action immédiate requise:</h3>
        <ul>
            <li>Vérifiez immédiatement les logs système</li>
            <li>Confirmez si l'attaque a été bloquée automatiquement</li>
            <li>Envisagez de renforcer les règles de pare-feu</li>
            <li>Documentez l'incident pour analyse future</li>
        </ul>
    </div>
    
    <hr>
    <p style="color: #666; font-size: 12px;">
        IDS-IPS ULPGL - Système de Détection et Prévention d'Intrusion<br>
        {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
    </p>
</body>
</html>
"""
        
        return self.send_email(subject, body, html_body)
    
    def send_login_alert(
        self,
        username: str,
        ip_address: str,
        timestamp: str,
        location: Optional[str] = None,
        suspicious: bool = False
    ) -> bool:
        """
        Envoie une alerte de connexion utilisateur.
        
        Args:
            username: Nom d'utilisateur
            ip_address: Adresse IP de connexion
            timestamp: Horodatage de la connexion
            location: Localisation géographique (optionnel)
            suspicious: Indique si la connexion est suspecte
            
        Returns:
            True si l'email a été envoyé avec succès
        """
        if suspicious:
            subject = f"⚠️ CONNEXION SUSPECTE - {username}"
        else:
            subject = f"Nouvelle connexion - {username}"
        
        location_text = f"\n- Localisation: {location}" if location else ""
        suspicious_text = "\n\n⚠️ Cette connexion a été identifiée comme SUSPECTE!" if suspicious else ""
        
        body = f"""
ALERTE DE CONNEXION UTILISATEUR

Une nouvelle connexion a été détectée:

Détails de la connexion:
- Utilisateur: {username}
- Adresse IP: {ip_address}
- Horodatage: {timestamp}{location_text}{suspicious_text}

Si vous n'êtes pas à l'origine de cette connexion, veuillez immédiatement:
- Changer votre mot de passe
- Vérifier les logs de connexion
- Contacter l'administrateur système

---
IDS-IPS ULPGL - Système de Détection et Prévention d'Intrusion
"""

        return self.send_email(subject, body)

# Instance globale du service email
email_service = EmailService()
