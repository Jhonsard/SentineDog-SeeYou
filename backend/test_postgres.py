#!/usr/bin/env python3
"""
Script de test pour la connexion PostgreSQL et la création des tables.
"""
import asyncio
import sys
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

# Test avec configuration PostgreSQL
POSTGRES_CONFIG = {
    "host": "localhost",
    "port": 5432,
    "user": "admin",
    "password": "SuperSecurise2026",
    "database": "ids_ips_db"
}

def test_postgres_connection():
    """Teste la connexion PostgreSQL."""
    try:
        # Construction de l'URL de connexion
        database_url = f"postgresql://{POSTGRES_CONFIG['user']}:{POSTGRES_CONFIG['password']}@{POSTGRES_CONFIG['host']}:{POSTGRES_CONFIG['port']}/{POSTGRES_CONFIG['database']}"
        
        print(f"Tentative de connexion à PostgreSQL: {POSTGRES_CONFIG['host']}:{POSTGRES_CONFIG['port']}/{POSTGRES_CONFIG['database']}")
        
        # Création du moteur
        engine = create_engine(database_url, pool_pre_ping=True)
        
        # Test de connexion
        with engine.connect() as connection:
            result = connection.execute(text("SELECT version()"))
            version = result.fetchone()[0]
            print(f"✓ Connexion PostgreSQL réussie!")
            print(f"  Version: {version}")
            
            # Test de création de table
            print("\nTest de création de table...")
            connection.execute(text("""
                CREATE TABLE IF NOT EXISTS test_table (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(100),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """))
            connection.commit()
            print("✓ Table de test créée avec succès")
            
            # Test d'insertion
            print("\nTest d'insertion...")
            connection.execute(text("INSERT INTO test_table (name) VALUES ('test_postgres')"))
            connection.commit()
            print("✓ Insertion réussie")
            
            # Test de sélection
            print("\nTest de sélection...")
            result = connection.execute(text("SELECT * FROM test_table"))
            rows = result.fetchall()
            print(f"✓ Sélection réussie: {len(rows)} ligne(s)")
            
            # Nettoyage
            print("\nNettoyage...")
            connection.execute(text("DROP TABLE IF EXISTS test_table"))
            connection.commit()
            print("✓ Table de test supprimée")
            
        print("\n" + "="*50)
        print("✓ Tous les tests PostgreSQL réussis!")
        print("="*50)
        assert True
        
    except Exception as e:
        print(f"\n✗ Erreur lors du test PostgreSQL: {str(e)}")
        print("\n" + "="*50)
        print("Instructions pour configurer PostgreSQL:")
        print("="*50)
        print("1. Installer PostgreSQL:")
        print("   sudo apt update")
        print("   sudo apt install postgresql postgresql-contrib")
        print("")
        print("2. Démarrer le service PostgreSQL:")
        print("   sudo systemctl start postgresql")
        print("   sudo systemctl enable postgresql")
        print("")
        print("3. Créer la base de données et l'utilisateur:")
        print("   sudo -u postgres psql")
        print("   CREATE DATABASE ids_ips_db;")
        print("   CREATE USER ids_ips_user WITH PASSWORD 'your_secure_password';")
        print("   GRANT ALL PRIVILEGES ON DATABASE ids_ips_db TO ids_ips_user;")
        print("   \\q")
        print("")
        print("4. Mettre à jour le fichier .env:")
        print("   USE_POSTGRES=true")
        print("   POSTGRES_HOST=localhost")
        print("   POSTGRES_PORT=5432")
        print("   POSTGRES_USER=ids_ips_user")
        print("   POSTGRES_PASSWORD=your_secure_password")
        print("   POSTGRES_DB=ids_ips_db")
        print("="*50)
        assert False

if __name__ == "__main__":
    success = test_postgres_connection()
    sys.exit(0 if success else 1)
