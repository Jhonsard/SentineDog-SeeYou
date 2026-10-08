import smtplib
import ssl
import asyncio
import logging
from collections import deque
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Dict, Any, Callable
from sqlalchemy.orm import Session
from app.core.config import settings
from app.core.dependencies import SessionLocal
from app.db.models import Alert
from app.services.websocket_manager import websocket_manager

logger = logging.getLogger("ids_ips.alerts")

class AlertManager:
    def __init__(self, db_session_factory: Callable[[], Session]) -> None:
        self.db_session_factory: Callable[[], Session] = db_session_factory

    def _sync_send_email_alert(self, alert_data: Dict[str, Any]) -> None:
        """
        Envoi d'email HTML/Texte avec gestion dynamique SSL/TLS.
        """
        required_configs = [
            settings.SMTP_SERVER, settings.SMTP_PORT, 
            settings.SMTP_USERNAME, settings.SMTP_PASSWORD, 
            settings.ADMIN_EMAIL, settings.SMTP_SENDER_EMAIL
        ]
        if not all(required_configs):
            logger.warning("Sous-système SMTP inactif: paramètres manquants.")
            return

        message = MIMEMultipart("alternative")
        message["Subject"] = f"[IDS/IPS CRITICAL] {alert_data.get('alert_type', 'Anomalie')}"
        message["From"] = settings.SMTP_SENDER_EMAIL
        message["To"] = settings.ADMIN_EMAIL

        # --- Génération du contenu Texte et HTML (Issu du Script 8) ---
        text_content = "Une alerte de sécurité a été détectée :\n\n"
        html_content = "<html><body style='font-family: Arial, sans-serif;'><h2 style='color: #d9534f;'>⚠ Alerte Réseau</h2><ul style='background-color: #f9f9f9; padding: 15px; border-left: 4px solid #d9534f; list-style-type: none;'>"
        
        for key, value in alert_data.items():
            text_content += f"{key.replace('_', ' ').title()}: {value}\n"
            html_content += f"<li style='margin-bottom: 8px;'><b>{key.replace('_', ' ').title()}</b>: {value}</li>"
        
        html_content += "</ul></body></html>"

        message.attach(MIMEText(text_content, "plain", "utf-8"))
        message.attach(MIMEText(html_content, "html", "utf-8"))

        context = ssl.create_default_context()
        try:
            # Gestion dynamique STARTTLS (587) vs SSL (465)
            if settings.SMTP_PORT == 465:
                with smtplib.SMTP_SSL(settings.SMTP_SERVER, settings.SMTP_PORT, context=context, timeout=10) as server:
                    server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
                    server.sendmail(settings.SMTP_SENDER_EMAIL, settings.ADMIN_EMAIL, message.as_string())
            else:
                with smtplib.SMTP(settings.SMTP_SERVER, settings.SMTP_PORT, timeout=10) as server:
                    server.starttls(context=context)
                    server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
                    server.sendmail(settings.SMTP_SENDER_EMAIL, settings.ADMIN_EMAIL, message.as_string())
            
            logger.info(f"Email expédié avec succès à {settings.ADMIN_EMAIL}")
        except Exception as e:
            logger.error(f"Échec de l'envoi SMTP: {str(e)}")

    async def _save_to_database(self, alert_data: Dict[str, Any]) -> None:
        """
        Écriture DB isolée dans un thread pour ne JAMAIS bloquer l'Event Loop.
        """
        def _write() -> None:
            with self.db_session_factory() as db:
                model_fields = {
                    k: v for k, v in alert_data.items() 
                    if hasattr(Alert, k) and not isinstance(v, (set, deque))
                }
                db_alert = Alert(**model_fields)
                db.add(db_alert)
                db.commit()
                alert_data["id"] = db_alert.id

        await asyncio.to_thread(_write)

    async def process_new_alert(self, alert_data: Dict[str, Any]) -> None:
        """Orchestration asynchrone et parallele des notifications."""
        logger.info(f"Prise en charge de l'alerte: {alert_data.get('alert_type')}")
        
        try:
            await self._save_to_database(alert_data)
            tasks = [websocket_manager.broadcast(alert_data)]
            if alert_data.get("severity") in ("critique", "tres_critique"):
                tasks.append(asyncio.to_thread(self._sync_send_email_alert, alert_data))
            await asyncio.gather(*tasks, return_exceptions=True)
        except Exception as e:
            logger.critical(f"Defaillance de l'orchestrateur d'alertes: {str(e)}")

    def get_global_stats(self) -> Dict[str, Any]:
        """
        Calcule les statistiques globales depuis la base de donnees.
        Utilise par l'outil MCP get_security_stats_and_alerts.
        """
        db_session = self.db_session_factory()
        try:
            total_alerts = db_session.query(Alert).count()
            high_severity_alerts = db_session.query(Alert).filter(
                Alert.severity.in_(("critique", "tres_critique", "eleve"))
            ).count()
            anomaly_rate = round(high_severity_alerts / total_alerts, 4) if total_alerts > 0 else 0.0
            return {
                "total_alerts": total_alerts,
                "anomaly_rate": anomaly_rate,
                "high_severity_count": high_severity_alerts,
            }
        finally:
            db_session.close()


alert_manager = AlertManager(db_session_factory=SessionLocal)
