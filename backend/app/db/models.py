from datetime import datetime
from typing import Optional
from sqlalchemy import String, Integer, Boolean, DateTime, func, ForeignKey, Text, Float
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

class Base(DeclarativeBase):
    """
    Classe de base ORM unifiée conforme aux spécifications SQLAlchemy 2.0.
    Garantit le typage statique des modèles.
    """
    pass

class Alert(Base):
    """
    Représentation relationnelle des alertes d'intrusions et anomalies réseau.
    """
    __tablename__ = "IntrusionsAlerts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    source_ip: Mapped[str] = mapped_column(String(45), index=True)
    destination_ip: Mapped[str] = mapped_column(String(45), index=True)
    source_port: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    destination_port: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    protocol: Mapped[str] = mapped_column(String(10), index=True)
    alert_type: Mapped[str] = mapped_column(String(100), index=True)
    description: Mapped[str] = mapped_column(String(500))
    is_blocked: Mapped[bool] = mapped_column(Boolean, default=False)
    is_manual_block: Mapped[bool] = mapped_column(Boolean, default=False)
    validated_by_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    severity: Mapped[str] = mapped_column(String(20), default="normal", index=True)
    event_count: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    node_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("nodes.id"), nullable=True)
    node: Mapped[Optional["Node"]] = relationship("Node", back_populates="alerts")

class User(Base):
    """
    Structure de stockage des identifiants et des privilèges des opérateurs de l'IDS/IPS.
    """
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    role: Mapped[str] = mapped_column(String(20), default="user")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

class JwtKey(Base):
    """
    Clé JWT pour la rotation sécurisée des secrets d'authentification.
    """
    __tablename__ = "jwt_keys"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    key_value: Mapped[str] = mapped_column(String(64), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    rotation_note: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

class MCPAPIKey(Base):
    """
    Registre des clés d'accès du plan MCP (Model Context Protocol).

    Le secret n'est JAMAIS stocké : seul son condensat SHA-256 est conservé,
    ce qui rend une fuite de la base inexploitable pour l'authentification.
    Les scopes ('read' / 'write') séparent l'inspection des opérations
    destructives sur le pare-feu.
    """
    __tablename__ = "mcp_api_keys"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    key_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    fingerprint: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    scopes: Mapped[str] = mapped_column(String(100), nullable=False, default="read")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_used_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    note: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

class Campus(Base):
    """
    Représente un campus (ex: Campus A, Campus B).
    Chaque campus contient plusieurs départements.
    """
    __tablename__ = "campuses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    location: Mapped[str] = mapped_column(String(200))
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    
    # Relations
    departments: Mapped[list["Department"]] = relationship("Department", back_populates="campus", cascade="all, delete-orphan")

class Department(Base):
    """
    Représente un département au sein d'un campus.
    Chaque département contient plusieurs nœuds de surveillance.
    """
    __tablename__ = "departments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    campus_id: Mapped[int] = mapped_column(Integer, ForeignKey("campuses.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    
    # Relations
    campus: Mapped["Campus"] = relationship("Campus", back_populates="departments")
    nodes: Mapped[list["Node"]] = relationship("Node", back_populates="department", cascade="all, delete-orphan")

class Node(Base):
    """
    Représente un nœud de surveillance (serveur, routeur, etc.).
    Chaque nœud peut être connecté via SSH ou TLS pour la surveillance.
    """
    __tablename__ = "nodes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    department_id: Mapped[int] = mapped_column(Integer, ForeignKey("departments.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    hostname: Mapped[str] = mapped_column(String(255), nullable=False)
    ip_address: Mapped[str] = mapped_column(String(45), nullable=False)  # IPv4 ou IPv6
    port: Mapped[int] = mapped_column(Integer, default=22)  # Port SSH par défaut
    
    # Type de connexion
    connection_type: Mapped[str] = mapped_column(String(20), default="ssh")  # "ssh" ou "tls"
    
    # Credentials SSH/TLS
    ssh_username: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    ssh_key_path: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    tls_cert_path: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    
    # Statut du nœud
    status: Mapped[str] = mapped_column(String(20), default="unknown")  # "online", "offline", "error", "unknown"
    last_seen: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_check: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    
    # Statistiques de trafic
    total_packets: Mapped[int] = mapped_column(Integer, default=0)
    total_alerts: Mapped[int] = mapped_column(Integer, default=0)
    network_load: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # en Mbps
    
    # Métadonnées
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Relations
    department: Mapped["Department"] = relationship("Department", back_populates="nodes")
    alerts: Mapped[list["Alert"]] = relationship("Alert", back_populates="node", cascade="all, delete-orphan") 
