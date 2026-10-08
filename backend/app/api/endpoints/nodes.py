from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, EmailStr

from app.core.dependencies import get_db, get_current_admin_user
from app.db.models import Campus, Department, Node, User
from app.services.node_manager import node_manager
from app.services.node_connection import node_connection_manager

router = APIRouter(prefix="/nodes", tags=["Gestion Multi-Nœuds"])

# Schémas Pydantic pour la validation
class CampusCreate(BaseModel):
    name: str
    location: str
    description: Optional[str] = None

class CampusUpdate(BaseModel):
    name: Optional[str] = None
    location: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None

class DepartmentCreate(BaseModel):
    campus_id: int
    name: str
    description: Optional[str] = None

class DepartmentUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None

class NodeCreate(BaseModel):
    department_id: int
    name: str
    hostname: str
    ip_address: str
    port: int = 22
    connection_type: str = "ssh"  # "ssh" ou "tls"
    ssh_username: Optional[str] = None
    ssh_key_path: Optional[str] = None
    ssh_password: Optional[str] = None
    tls_cert_path: Optional[str] = None
    description: Optional[str] = None

class NodeUpdate(BaseModel):
    name: Optional[str] = None
    hostname: Optional[str] = None
    ip_address: Optional[str] = None
    port: Optional[int] = None
    connection_type: Optional[str] = None
    ssh_username: Optional[str] = None
    ssh_key_path: Optional[str] = None
    ssh_password: Optional[str] = None
    tls_cert_path: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None

# Endpoints Campus
@router.get("/campuses", summary="Récupérer tous les campus")
async def get_campuses(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
) -> List[Dict[str, Any]]:
    """Récupère la liste de tous les campus actifs."""
    campuses = db.query(Campus).filter(Campus.is_active == True).all()
    return [
        {
            "id": campus.id,
            "name": campus.name,
            "location": campus.location,
            "description": campus.description,
            "created_at": campus.created_at.isoformat() if campus.created_at else None
        }
        for campus in campuses
    ]

@router.post("/campuses", summary="Créer un nouveau campus")
async def create_campus(
    campus: CampusCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
) -> Dict[str, Any]:
    """Crée un nouveau campus."""
    try:
        new_campus = Campus(
            name=campus.name,
            location=campus.location,
            description=campus.description
        )
        db.add(new_campus)
        db.commit()
        db.refresh(new_campus)
        
        return {
            "id": new_campus.id,
            "name": new_campus.name,
            "location": new_campus.location,
            "description": new_campus.description,
            "created_at": new_campus.created_at.isoformat() if new_campus.created_at else None
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur lors de la création du campus: {str(e)}"
        )

@router.put("/campuses/{campus_id}", summary="Mettre à jour un campus")
async def update_campus(
    campus_id: int,
    campus: CampusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
) -> Dict[str, Any]:
    """Met à jour un campus existant."""
    try:
        campus_obj = db.query(Campus).filter(Campus.id == campus_id).first()
        if not campus_obj:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Campus introuvable"
            )
        
        for field, value in campus.model_dump(exclude_unset=True).items():
            setattr(campus_obj, field, value)
        
        db.commit()
        db.refresh(campus_obj)
        
        return {
            "id": campus_obj.id,
            "name": campus_obj.name,
            "location": campus_obj.location,
            "description": campus_obj.description,
            "is_active": campus_obj.is_active
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur lors de la mise à jour du campus: {str(e)}"
        )

@router.delete("/campuses/{campus_id}", summary="Supprimer un campus")
async def delete_campus(
    campus_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
) -> Dict[str, str]:
    """Supprime un campus (désactivation)."""
    try:
        campus_obj = db.query(Campus).filter(Campus.id == campus_id).first()
        if not campus_obj:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Campus introuvable"
            )
        
        campus_obj.is_active = False
        db.commit()
        
        return {"status": "success", "message": "Campus désactivé avec succès"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur lors de la suppression du campus: {str(e)}"
        )

# Endpoints Department
@router.get("/departments", summary="Récupérer tous les départements")
async def get_departments(
    campus_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
) -> List[Dict[str, Any]]:
    """Récupère la liste de tous les départements actifs."""
    query = db.query(Department).filter(Department.is_active == True)
    if campus_id:
        query = query.filter(Department.campus_id == campus_id)
    
    departments = query.all()
    return [
        {
            "id": dept.id,
            "campus_id": dept.campus_id,
            "name": dept.name,
            "description": dept.description,
            "created_at": dept.created_at.isoformat() if dept.created_at else None
        }
        for dept in departments
    ]

@router.post("/departments", summary="Créer un nouveau département")
async def create_department(
    department: DepartmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
) -> Dict[str, Any]:
    """Crée un nouveau département."""
    try:
        campus = db.query(Campus).filter(Campus.id == department.campus_id).first()
        if not campus:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Campus introuvable"
            )
        
        new_department = Department(
            campus_id=department.campus_id,
            name=department.name,
            description=department.description
        )
        db.add(new_department)
        db.commit()
        db.refresh(new_department)
        
        return {
            "id": new_department.id,
            "campus_id": new_department.campus_id,
            "name": new_department.name,
            "description": new_department.description,
            "created_at": new_department.created_at.isoformat() if new_department.created_at else None
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur lors de la création du département: {str(e)}"
        )

@router.put("/departments/{department_id}", summary="Mettre à jour un département")
async def update_department(
    department_id: int,
    department: DepartmentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
) -> Dict[str, Any]:
    """Met à jour un département existant."""
    try:
        dept_obj = db.query(Department).filter(Department.id == department_id).first()
        if not dept_obj:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Département introuvable"
            )
        
        for field, value in department.model_dump(exclude_unset=True).items():
            setattr(dept_obj, field, value)
        
        db.commit()
        db.refresh(dept_obj)
        
        return {
            "id": dept_obj.id,
            "campus_id": dept_obj.campus_id,
            "name": dept_obj.name,
            "description": dept_obj.description,
            "is_active": dept_obj.is_active
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur lors de la mise à jour du département: {str(e)}"
        )

@router.delete("/departments/{department_id}", summary="Supprimer un département")
async def delete_department(
    department_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
) -> Dict[str, str]:
    """Supprime un département (désactivation)."""
    try:
        dept_obj = db.query(Department).filter(Department.id == department_id).first()
        if not dept_obj:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Département introuvable"
            )
        
        dept_obj.is_active = False
        db.commit()
        
        return {"status": "success", "message": "Département désactivé avec succès"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur lors de la suppression du département: {str(e)}"
        )

# Endpoints Node
@router.get("/nodes", summary="Récupérer tous les nœuds")
async def get_nodes(
    department_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
) -> List[Dict[str, Any]]:
    """Récupère la liste de tous les nœuds actifs."""
    query = db.query(Node).filter(Node.is_active == True)
    if department_id:
        query = query.filter(Node.department_id == department_id)
    
    nodes = query.all()
    return [
        {
            "id": node.id,
            "department_id": node.department_id,
            "name": node.name,
            "hostname": node.hostname,
            "ip_address": node.ip_address,
            "port": node.port,
            "connection_type": node.connection_type,
            "status": node.status,
            "total_packets": node.total_packets,
            "total_alerts": node.total_alerts,
            "network_load": node.network_load,
            "last_seen": node.last_seen.isoformat() if node.last_seen else None,
            "last_check": node.last_check.isoformat() if node.last_check else None
        }
        for node in nodes
    ]

@router.post("/nodes", summary="Créer un nouveau nœud")
async def create_node(
    node: NodeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
) -> Dict[str, Any]:
    """Crée un nouveau nœud de surveillance."""
    try:
        department = db.query(Department).filter(Department.id == node.department_id).first()
        if not department:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Département introuvable"
            )
        
        new_node = Node(
            department_id=node.department_id,
            name=node.name,
            hostname=node.hostname,
            ip_address=node.ip_address,
            port=node.port,
            connection_type=node.connection_type,
            ssh_username=node.ssh_username,
            ssh_key_path=node.ssh_key_path,
            tls_cert_path=node.tls_cert_path,
            description=node.description
        )
        db.add(new_node)
        db.commit()
        db.refresh(new_node)
        
        return {
            "id": new_node.id,
            "department_id": new_node.department_id,
            "name": new_node.name,
            "hostname": new_node.hostname,
            "ip_address": new_node.ip_address,
            "port": new_node.port,
            "connection_type": new_node.connection_type,
            "status": new_node.status,
            "created_at": new_node.created_at.isoformat() if new_node.created_at else None
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur lors de la création du nœud: {str(e)}"
        )

@router.put("/nodes/{node_id}", summary="Mettre à jour un nœud")
async def update_node(
    node_id: int,
    node: NodeUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
) -> Dict[str, Any]:
    """Met à jour un nœud existant."""
    try:
        node_obj = db.query(Node).filter(Node.id == node_id).first()
        if not node_obj:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Nœud introuvable"
            )
        
        for field, value in node.model_dump(exclude_unset=True).items():
            setattr(node_obj, field, value)
        
        db.commit()
        db.refresh(node_obj)
        
        return {
            "id": node_obj.id,
            "department_id": node_obj.department_id,
            "name": node_obj.name,
            "hostname": node_obj.hostname,
            "ip_address": node_obj.ip_address,
            "port": node_obj.port,
            "connection_type": node_obj.connection_type,
            "status": node_obj.status,
            "is_active": node_obj.is_active
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur lors de la mise à jour du nœud: {str(e)}"
        )

@router.delete("/nodes/{node_id}", summary="Supprimer un nœud")
async def delete_node(
    node_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
) -> Dict[str, str]:
    """Supprime un nœud (désactivation)."""
    try:
        node_obj = db.query(Node).filter(Node.id == node_id).first()
        if not node_obj:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Nœud introuvable"
            )
        
        node_obj.is_active = False
        db.commit()
        
        return {"status": "success", "message": "Nœud désactivé avec succès"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur lors de la suppression du nœud: {str(e)}"
        )

@router.post("/nodes/{node_id}/check", summary="Vérifier le statut d'un nœud")
async def check_node_status(
    node_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
) -> Dict[str, Any]:
    """Vérifie le statut de connexion d'un nœud spécifique."""
    try:
        node = db.query(Node).filter(Node.id == node_id).first()
        if not node:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Nœud introuvable"
            )
        
        result = await node_connection_manager.check_node_status(
            node_id=node.id,
            connection_type=node.connection_type,
            hostname=node.hostname,
            port=node.port,
            username=node.ssh_username,
            key_path=node.ssh_key_path,
            password=None,  # Ne pas stocker les mots de passe en clair
            cert_path=node.tls_cert_path
        )
        
        # Mettre à jour le statut du nœud
        node.status = result.status.value
        node.last_check = result.timestamp
        if result.success:
            node.last_seen = result.timestamp
        db.commit()
        
        return {
            "node_id": node_id,
            "status": result.status.value,
            "success": result.success,
            "latency_ms": result.latency_ms,
            "error_message": result.error_message,
            "timestamp": result.timestamp.isoformat() if result.timestamp else None
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur lors de la vérification du nœud: {str(e)}"
        )

@router.post("/nodes/check-all", summary="Vérifier tous les nœuds")
async def check_all_nodes(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
) -> Dict[str, Any]:
    """Vérifie le statut de tous les nœuds actifs."""
    try:
        results = await node_manager.check_all_nodes(db)
        return {
            "status": "success",
            "total_checked": len(results),
            "results": results
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur lors de la vérification des nœuds: {str(e)}"
        )

@router.get("/hierarchy", summary="Récupérer la hiérarchie complète")
async def get_hierarchy(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
) -> Dict[str, Any]:
    """Récupère la hiérarchie complète des campus, départements et nœuds."""
    try:
        hierarchy = node_manager.get_campus_hierarchy(db)
        return hierarchy
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur lors de la récupération de la hiérarchie: {str(e)}"
        )

@router.get("/stats/aggregated", summary="Récupérer les statistiques agrégées")
async def get_aggregated_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
) -> Dict[str, Any]:
    """Récupère les statistiques agrégées de tous les nœuds."""
    try:
        stats = await node_manager.aggregate_all_nodes_stats(db)
        return stats
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur lors de la récupération des statistiques: {str(e)}"
        )

@router.get("/nodes/{node_id}/alerts", summary="Récupérer les alertes d'un nœud")
async def get_node_alerts(
    node_id: int,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
) -> List[Dict[str, Any]]:
    """Récupère les alertes d'un nœud spécifique."""
    try:
        alerts = node_manager.get_node_alerts(node_id, db, limit)
        return alerts
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur lors de la récupération des alertes: {str(e)}"
        )

@router.post("/nodes/{node_id}/monitor/start", summary="Démarrer la surveillance d'un nœud")
async def start_node_monitoring(
    node_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
) -> Dict[str, str]:
    """Démarre la surveillance d'un nœud spécifique."""
    try:
        success = await node_manager.start_monitoring_node(node_id, db)
        if success:
            return {"status": "success", "message": f"Surveillance démarrée pour le nœud {node_id}"}
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Impossible de démarrer la surveillance du nœud"
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur lors du démarrage de la surveillance: {str(e)}"
        )

@router.post("/nodes/{node_id}/monitor/stop", summary="Arrêter la surveillance d'un nœud")
async def stop_node_monitoring(
    node_id: int,
    current_user: User = Depends(get_current_admin_user)
) -> Dict[str, str]:
    """Arrête la surveillance d'un nœud spécifique."""
    try:
        success = await node_manager.stop_monitoring_node(node_id)
        if success:
            return {"status": "success", "message": f"Surveillance arrêtée pour le nœud {node_id}"}
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Impossible d'arrêter la surveillance du nœud"
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur lors de l'arrêt de la surveillance: {str(e)}"
        )
