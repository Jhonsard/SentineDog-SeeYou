#!/usr/bin/env python3
"""
Script de seed pour créer un utilisateur admin au premier démarrage.
À exécuter après les migrations Alembic.
"""
import os
import sys
from pathlib import Path

# Ajouter le répertoire parent au path pour importer les modules de l'app
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.core.config import settings
from app.core.auth_utils import get_password_hash
from app.db.models import User, Base

def create_admin_user():
    """Crée un utilisateur admin s'il n'existe pas déjà."""
    
    # Configuration de la base de données
    if settings.USE_POSTGRES and settings.POSTGRES_HOST:
        DATABASE_URL = f"postgresql://{settings.POSTGRES_USER}:{settings.POSTGRES_PASSWORD}@{settings.POSTGRES_HOST}:{settings.POSTGRES_PORT}/{settings.POSTGRES_DB}"
        connect_args = {}
    else:
        DATABASE_URL = settings.DATABASE_URL
        connect_args = {"check_same_thread": False} if settings.DATABASE_URL.startswith("sqlite") else {}
    
    engine = create_engine(DATABASE_URL, connect_args=connect_args, pool_pre_ping=True)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    
    db = SessionLocal()
    try:
        # Vérifier si un admin existe déjà
        existing_admin = db.query(User).filter(User.role == "admin").first()
        if existing_admin:
            print(f"✓ Un administrateur existe déjà : {existing_admin.username}")
            return
        
        # Récupérer les identifiants depuis les variables d'environnement
        admin_username = os.getenv("INIT_ADMIN_USERNAME", "admin")
        admin_email = os.getenv("INIT_ADMIN_EMAIL", "admin@localhost")
        admin_password = os.getenv("INIT_ADMIN_PASSWORD")
        
        if not admin_password:
            print("⚠ INIT_ADMIN_PASSWORD non défini. Création d'admin ignorée.")
            print("  Définissez INIT_ADMIN_PASSWORD dans les variables d'environnement pour créer l'admin au démarrage.")
            return
        
        # Hasher le mot de passe
        hashed_password = get_password_hash(admin_password)
        
        # Créer l'utilisateur admin
        admin_user = User(
            username=admin_username,
            email=admin_email,
            hashed_password=hashed_password,
            role="admin",
            is_active=True
        )
        
        db.add(admin_user)
        db.commit()
        db.refresh(admin_user)
        
        print(f"✓ Administrateur créé avec succès : {admin_user.username} ({admin_user.email})")
        
    except Exception as e:
        db.rollback()
        print(f"✗ Erreur lors de la création de l'admin : {e}")
        raise
    finally:
        db.close()

if __name__ == "__main__":
    create_admin_user()