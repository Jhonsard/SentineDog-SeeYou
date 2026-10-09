from fastapi import APIRouter, Depends, HTTPException, status, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Dict, Any, List
from datetime import datetime, timedelta

from app.core.dependencies import get_db, get_current_admin_user
from app.db.models import Alert, User
from app.engine.firewall import firewall_manager
from app.services.websocket_manager import websocket_manager
from app.services.threat_detector import threat_detector
from app.core.auth_utils import authenticate_websocket, get_user_from_ws_token, validate_websocket_origin
from app.core.jwt_manager import jwt_key_manager

router = APIRouter(prefix="/alerts", tags=["Alertes & Pare-feu"])

@router.get("/banned-hosts", summary="Récupérer la liste des hôtes actuellement bloqués")
async def get_banned_hosts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
) -> List[Dict[str, Any]]:
    try:
        banned_alerts = db.query(Alert).filter(Alert.is_blocked == True).order_by(Alert.timestamp.desc()).all()
        result = []
        for alert in banned_alerts:
            result.append({
                "id": alert.id,
                "source_ip": alert.source_ip,
                "alert_type": alert.alert_type,
                "timestamp_block": alert.timestamp.isoformat() if alert.timestamp else None,
                "reason": f"Bloqué via Console (ID #{alert.id})"
            })
        return result
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur lors de la récupération des hôtes bannis: {str(e)}"
        )

@router.get("/history", summary="Récupérer l'historique global des alertes")
async def get_alerts_log_history(
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
) -> List[Dict[str, Any]]:
    """
    Extrait l'historique permanent et formate le timestamp pour éviter le bug Invalid Date sur le client.
    """
    try:
        history = db.query(Alert).order_by(Alert.timestamp.desc()).limit(limit).all()
        result = []
        for alert in history:
            # Sécurité de formatage ISO standard (remplace l'espace par un 'T')
            formatted_timestamp = None
            if alert.timestamp:
                if isinstance(alert.timestamp, str):
                    formatted_timestamp = alert.timestamp.replace(" ", "T")
                else:
                    formatted_timestamp = alert.timestamp.isoformat()

            result.append({
                "id": alert.id,
                "source_ip": alert.source_ip,
                "destination_ip": alert.destination_ip,
                "source_port": alert.source_port,
                "destination_port": alert.destination_port,
                "protocol": alert.protocol,
                "alert_type": alert.alert_type,
                "description": alert.description,
                "is_blocked": alert.is_blocked,
                "is_manual_block": alert.is_manual_block,
                "validated_by_admin": alert.validated_by_admin,
                "severity": alert.severity,
                "event_count": alert.event_count if hasattr(alert, 'event_count') else 1,
                "timestamp": formatted_timestamp
            })
        return result
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur lors de la récupération de l'historique : {str(e)}"
        )

@router.post("/{alert_id}/validate-block", summary="Validation administrative et exécution d'un bannissement IP")
async def validate_and_execute_block(
    alert_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
) -> Dict[str, str]:
    try:
        alert = db.query(Alert).filter(Alert.id == alert_id).with_for_update().first()
        
        if not alert:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Enregistrement d'alerte introuvable.")
            
        if alert.is_blocked:
            return {"status": "ignored", "message": "Cette anomalie a déjà fait l'objet d'un ajustement pare-feu."}

        firewall_success = await firewall_manager.block_ip(alert.source_ip, reason=f"Manuel - Opérateur: {current_user.username}")
        
        if firewall_success:
            alert.is_blocked = True
            alert.is_manual_block = True
            alert.validated_by_admin = True
            db.commit()
            
            # Analyser l'alerte pour déclencher les notifications email
            alert_dict = {
                "source_ip": alert.source_ip,
                "destination_ip": alert.destination_ip,
                "source_port": alert.source_port,
                "destination_port": alert.destination_port,
                "protocol": alert.protocol,
                "alert_type": alert.alert_type,
                "description": alert.description,
                "severity": alert.severity,
                "is_blocked": True,
                "timestamp": alert.timestamp.isoformat() if alert.timestamp else datetime.now().isoformat()
            }
            threat_detector.analyze_alert(alert_dict)
            
            return {"status": "success", "message": f"Hôte {alert.source_ip} banni avec succès du réseau local."}
        else:
            db.rollback()  
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, 
                detail="Échec de couplage avec le sous-système de filtrage matériel de l'OS."
            )
            
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, 
            detail=f"Erreur critique d'accès concurrentiel ou de transaction: {str(e)}"
        )

@router.post("/{alert_id}/unban", summary="Révocation manuelle d'une règle de bannissement")
async def unblock_ip_address(
    alert_id: int,
    payload: Dict[str, Any], 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
) -> Dict[str, str]:
    ip_address = payload.get("ip")
    if not ip_address:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="L'adresse IP source est requise.")

    try:
        alert = db.query(Alert).filter(Alert.id == alert_id).with_for_update().first()
        firewall_success = await firewall_manager.unblock_ip(ip_address, admin_username=current_user.username)
        
        if firewall_success:
            if alert:
                alert.is_blocked = False
            db.commit()
            return {"status": "success", "message": f"L'adresse IP {ip_address} a été réintégrée au trafic réseau."}
        else:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, 
                detail="L'adresse réseau spécifiée ne figure pas parmi les politiques de filtrage actives."
            )
            
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, 
            detail=f"Incident d'exécution lors du déblocage réseau: {str(e)}"
        ) 

@router.websocket("/ws/alerts")
async def websocket_endpoint(websocket: WebSocket, db: Session = Depends(get_db)):
    # Valider l'origine CORS pour WebSocket
    if not validate_websocket_origin(websocket):
        await websocket.close(code=1008, reason="Origine non autorisée")
        return
    
    await websocket.accept()
    active_secret = jwt_key_manager.get_active_key(db)
    token_data = await authenticate_websocket(websocket, secret_key=active_secret)
    if token_data is None or token_data.username is None:
        return
    
    user = await get_user_from_ws_token(token_data)
    if user is None or not user.is_active:
        await websocket.close(code=1008, reason="Utilisateur invalide ou inactif")
        return
    
    await websocket_manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
             
    except WebSocketDisconnect:
        await websocket_manager.disconnect(websocket)

@router.get("/stats/history", summary="Récupérer la moyenne des occurrences d'attaques par minute")
def get_alerts_history(db: Session = Depends(get_db)):
    """
    Exclut la gravité 'normal/low/info' pour cibler uniquement le trafic hostile, 
    puis calcule la moyenne des événements minute par minute.
    """
    time_limit = datetime.utcnow() - timedelta(hours=3)
    
    results = (
        db.query(
            func.strftime("%H:%M", Alert.timestamp, "localtime").label("minute_block"),
            func.count(Alert.id).label("total_alerts"),
            func.count(func.distinct(Alert.source_ip)).label("unique_attackers")
        )
        .filter(Alert.timestamp >= time_limit)
        .filter(
            Alert.severity.isnot(None),
            func.lower(Alert.severity) != "normal",
            func.lower(Alert.severity) != "low",
            func.lower(Alert.severity) != "info"
        )
        .group_by("minute_block")
        .order_by("minute_block")
        .all()
    )
    
    history = []
    for minute_block, total_alerts, unique_attackers in results:
        # Calcul de la moyenne des occurrences par minute d'attaque
        moyenne = round(total_alerts / unique_attackers, 2) if unique_attackers > 0 else total_alerts
        history.append({
            "time": minute_block,
            "Moyenne d'Attaques": moyenne
        })
        
    return history 
