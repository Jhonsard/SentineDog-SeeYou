import os
from app.core.dependencies import SessionLocal
from app.db.models import User
from app.core.auth_utils import get_password_hash

ADMIN_USERNAME = os.environ.get("ADMIN_USERNAME", "admin")
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD")

if not ADMIN_EMAIL or not ADMIN_PASSWORD:
    print("Erreur: ADMIN_EMAIL et ADMIN_PASSWORD doivent être définis dans l'environnement.")
    exit(1)

db = SessionLocal()
if not db.query(User).filter(User.username == ADMIN_USERNAME).first():
    admin_user = User(
        username=ADMIN_USERNAME,
        email=ADMIN_EMAIL,
        hashed_password=get_password_hash(ADMIN_PASSWORD),
        role="admin",
        is_active=True,
    )
    db.add(admin_user)
    db.commit()
    print(f"Utilisateur administrateur '{ADMIN_USERNAME}' créé avec succès !")
else:
    print(f"Utilisateur administrateur '{ADMIN_USERNAME}' existe déjà.")
db.close()
