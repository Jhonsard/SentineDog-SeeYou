#!/usr/bin/env python3
"""Cree ou (re)initialise un compte administrateur.

Utile quand le mot de passe du compte admin n'est plus connu.

Usage (depuis le dossier backend/) :
    python -m scripts.set_admin_password --username admin --password 'MonMotDePasse'
ou via variables d'environnement ADMIN_USERNAME / ADMIN_EMAIL / ADMIN_PASSWORD.

Le compte est cree s'il n'existe pas, sinon son mot de passe et son role
sont mis a jour. Le schema de la base est cree/verifie au passage.
"""
import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.dependencies import SessionLocal
from app.db.models import User
from app.core.auth_utils import get_password_hash


def main() -> int:
    parser = argparse.ArgumentParser(description="Cree/reinitialise un compte administrateur.")
    parser.add_argument("--username", default=os.getenv("ADMIN_USERNAME", "admin"))
    parser.add_argument("--email", default=os.getenv("ADMIN_EMAIL", "admin@localhost"))
    parser.add_argument("--password", default=os.getenv("ADMIN_PASSWORD"))
    parser.add_argument("--role", default="admin")
    args = parser.parse_args()

    if not args.password:
        print("Erreur : --password (ou la variable ADMIN_PASSWORD) est requis.", file=sys.stderr)
        return 1
    if len(args.password) < 8:
        print("Erreur : le mot de passe doit contenir au moins 8 caracteres.", file=sys.stderr)
        return 1

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.username == args.username).first()
        if user:
            user.hashed_password = get_password_hash(args.password)
            user.role = args.role
            user.is_active = True
            db.commit()
            print(f"[OK] Mot de passe reinitialise pour '{user.username}' (role={user.role}).")
        else:
            user = User(
                username=args.username,
                email=args.email,
                hashed_password=get_password_hash(args.password),
                role=args.role,
                is_active=True,
            )
            db.add(user)
            db.commit()
            print(f"[OK] Compte '{user.username}' cree (role={user.role}).")
    except Exception as exc:
        db.rollback()
        print(f"[ERREUR] {exc}", file=sys.stderr)
        return 1
    finally:
        db.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
