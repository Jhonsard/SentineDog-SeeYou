#!/usr/bin/env python3
"""
Administration du registre de clés du plan MCP.

Usage :
    python -m scripts.mcp_key_admin create --name "agent-audit" --scopes read
    python -m scripts.mcp_key_admin create --name "agent-correctif" --scopes read,write --days 30
    python -m scripts.mcp_key_admin list
    python -m scripts.mcp_key_admin revoke --id 3

Le secret n'est affiché qu'à la création : il n'est pas rejouable ensuite
(seul son SHA-256 est stocké). Le récupérer ensuite est impossible : il faut
créer une nouvelle clé.
"""
import argparse
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def _session():
    from app.core.dependencies import SessionLocal
    return SessionLocal()


def cmd_create(args) -> int:
    from app.services.mcp_key_service import create_key

    db = _session()
    try:
        raw_key, record = create_key(
            db,
            name=args.name,
            scopes=[s.strip() for s in args.scopes.split(",") if s.strip()],
            expires_in_days=args.days,
            note=args.note,
        )
    finally:
        db.close()

    print("Clé MCP créée.")
    print(f"  id          : {record.id}")
    print(f"  nom         : {record.name}")
    print(f"  scopes      : {record.scopes}")
    print(f"  empreinte   : {record.fingerprint}")
    print(f"  expiration  : {record.expires_at or 'jamais'}")
    print()
    print("  SECRET (à copier dans la configuration du client MCP, affiché une seule fois) :")
    print(f"  {raw_key}")
    return 0


def cmd_list(args) -> int:
    from app.services.mcp_key_service import list_keys

    db = _session()
    try:
        rows = list_keys(db)
    finally:
        db.close()

    if not rows:
        print("Aucune clé enregistrée.")
        return 0

    now = datetime.now(timezone.utc)
    print(f"{'id':>3}  {'nom':<24} {'scopes':<14} {'empreinte':<14} {'état':<10} dernier usage")
    for row in rows:
        expires = row.expires_at
        if expires is not None and expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        if not row.is_active:
            state = "révoquée"
        elif expires is not None and expires <= now:
            state = "expirée"
        else:
            state = "active"
        last_used = row.last_used_at.isoformat() if row.last_used_at else "-"
        print(f"{row.id:>3}  {row.name:<24} {row.scopes:<14} {row.fingerprint:<14} {state:<10} {last_used}")
    return 0


def cmd_revoke(args) -> int:
    from app.services.mcp_key_service import revoke_key

    db = _session()
    try:
        ok = revoke_key(db, args.id)
    finally:
        db.close()

    if not ok:
        print(f"Clé {args.id} introuvable.")
        return 1
    print(f"Clé {args.id} révoquée.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Registre de clés du plan MCP")
    sub = parser.add_subparsers(dest="command", required=True)

    p_create = sub.add_parser("create", help="Créer une clé (affiche le secret une fois)")
    p_create.add_argument("--name", required=True, help="Identifiant du client (ex: agent-audit)")
    p_create.add_argument("--scopes", default="read", help="read, write (défaut: read)")
    p_create.add_argument("--days", type=int, default=90, help="Durée de validité en jours (0 = sans expiration)")
    p_create.add_argument("--note", default=None, help="Commentaire libre")
    p_create.set_defaults(func=cmd_create)

    p_list = sub.add_parser("list", help="Lister les clés")
    p_list.set_defaults(func=cmd_list)

    p_revoke = sub.add_parser("revoke", help="Révoquer une clé")
    p_revoke.add_argument("--id", type=int, required=True)
    p_revoke.set_defaults(func=cmd_revoke)

    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
