"""
Registre des clés d'accès du plan MCP.

Principes :
  - le secret n'est jamais stocké, seul son condensat SHA-256 est persisté ;
  - la comparaison est réalisée sur des condensats, octet par octet, via
    hmac.compare_digest (aucune sortie anticipée, aucune fuite de longueur) ;
  - chaque clé porte des scopes : 'read' (inspection) et/ou 'write'
    (actions sur le pare-feu) ;
  - une clé de secours statique (MCP_API_KEY) reste possible pour la reprise
    en panne, désactivée par défaut (fail-closed).
"""
import hashlib
import hmac
import logging
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import FrozenSet, List, Optional, Tuple

from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import MCPAPIKey

logger = logging.getLogger("ids_ips.mcp.keys")

SCOPE_READ = "read"
SCOPE_WRITE = "write"
VALID_SCOPES = (SCOPE_READ, SCOPE_WRITE)

KEY_PREFIX = "mcp_sk_"
MIN_KEY_LENGTH = 32

# Borne la taille du registre : la vérification compare la clé présentée à
# chaque entrée active (compare_digest), le coût doit rester negligeable.
MAX_ACTIVE_KEYS = 200

# last_used_at n'est rafraîchi qu'au-delà de cet intervalle pour ne pas écrire
# en base a chaque requete MCP.
_LAST_USED_THROTTLE_SECONDS = 60


@dataclass(frozen=True)
class MCPPrincipal:
    """Identité authentifiée d'un client du plan MCP."""
    key_id: Optional[int]
    name: str
    scopes: FrozenSet[str]
    source: str  # "registry" | "legacy"
    fingerprint: str

    def has_scope(self, scope: str) -> bool:
        return scope in self.scopes


def generate_key() -> str:
    """Génère un secret de clé (256 bits d'entropie)."""
    return f"{KEY_PREFIX}{secrets.token_urlsafe(32)}"


def hash_key(raw_key: str) -> str:
    """Condensat SHA-256 hexadécimal du secret (valeur persistée)."""
    return hashlib.sha256(raw_key.encode("utf-8")).hexdigest()


def fingerprint_of(raw_key: str) -> str:
    """Empreinte courte et non réversible, sûre à journaliser."""
    return hash_key(raw_key)[:12]


def _normalise_scopes(scopes) -> FrozenSet[str]:
    if isinstance(scopes, str):
        items = [s.strip() for s in scopes.split(",")]
    else:
        items = [str(s).strip() for s in scopes]
    cleaned = {s for s in items if s}
    if not cleaned:
        raise ValueError("Au moins un scope est requis (read, write).")
    invalid = cleaned - set(VALID_SCOPES)
    if invalid:
        raise ValueError(f"Scopes invalides: {sorted(invalid)}. Valides: {list(VALID_SCOPES)}")
    # 'write' implique 'read' : une clé destructive peut aussi inspecter.
    if SCOPE_WRITE in cleaned:
        cleaned.add(SCOPE_READ)
    return frozenset(cleaned)


def _is_expired(record: MCPAPIKey, now: datetime) -> bool:
    if record.expires_at is None:
        return False
    expires_at = record.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    return expires_at <= now


def create_key(
    db: Session,
    name: str,
    scopes=("read",),
    expires_in_days: Optional[int] = 90,
    note: Optional[str] = None,
) -> Tuple[str, MCPAPIKey]:
    """
    Crée une clé et retourne (secret en clair, enregistrement).

    Le secret n'est renvoyé qu'ici : il n'est jamais rejouable ensuite.
    """
    normalised = _normalise_scopes(scopes)
    raw_key = generate_key()
    record = MCPAPIKey(
        name=name,
        key_hash=hash_key(raw_key),
        fingerprint=fingerprint_of(raw_key),
        scopes=",".join(sorted(normalised)),
        is_active=True,
        note=note,
    )
    if expires_in_days:
        record.expires_at = datetime.now(timezone.utc) + timedelta(days=expires_in_days)
    db.add(record)
    db.commit()
    db.refresh(record)
    logger.info("Clé MCP créée: name=%s scopes=%s fprint=%s", name, record.scopes, record.fingerprint)
    return raw_key, record


def list_keys(db: Session) -> List[MCPAPIKey]:
    return db.query(MCPAPIKey).order_by(MCPAPIKey.created_at.desc()).all()


def revoke_key(db: Session, key_id: int) -> bool:
    record = db.query(MCPAPIKey).filter(MCPAPIKey.id == key_id).first()
    if record is None:
        return False
    record.is_active = False
    record.revoked_at = datetime.now(timezone.utc)
    db.commit()
    logger.warning("Clé MCP révoquée: id=%s name=%s fprint=%s", key_id, record.name, record.fingerprint)
    return True


def _touch_last_used(db: Session, record: MCPAPIKey) -> None:
    now = datetime.now(timezone.utc)
    last = record.last_used_at
    if last is not None and last.tzinfo is not None:
        if (now - last).total_seconds() < _LAST_USED_THROTTLE_SECONDS:
            return
    elif last is not None:
        if (now.replace(tzinfo=None) - last).total_seconds() < _LAST_USED_THROTTLE_SECONDS:
            return
    try:
        record.last_used_at = now
        db.commit()
    except Exception as exc:  # la métrique d'usage ne doit jamais bloquer l'auth
        db.rollback()
        logger.debug("Mise à jour last_used_at impossible: %s", exc)


def _verify_legacy(raw_key: str) -> Optional[MCPPrincipal]:
    """Clé de secours statique, désactivée par défaut."""
    if not getattr(settings, "MCP_LEGACY_API_KEY_ENABLED", False):
        return None
    expected = settings.MCP_API_KEY
    if not expected:
        return None
    # Comparaison sur condensats : évite la TypeError de compare_digest sur
    # les chaînes non ASCII et supprime toute fuite liée à la longueur.
    if not hmac.compare_digest(hash_key(raw_key), hash_key(expected)):
        return None
    logger.warning(
        "Authentification MCP par la clé de secours statique (MCP_LEGACY_API_KEY_ENABLED=true). "
        "Migrer vers le registre de clés à scopes."
    )
    return MCPPrincipal(
        key_id=None,
        name="legacy-static-key",
        scopes=frozenset({SCOPE_READ, SCOPE_WRITE}),
        source="legacy",
        fingerprint=fingerprint_of(expected),
    )


def verify_key(db: Session, raw_key: str) -> Optional[MCPPrincipal]:
    """
    Résout une clé présentée en un principal authentifié, ou None.

    La clé de secours statique n'est évaluée qu'après échec du registre, et
    seulement si MCP_LEGACY_API_KEY_ENABLED est vrai (fail-closed par défaut).
    """
    if not raw_key or len(raw_key) < 8:
        return None

    candidate = hash_key(raw_key)
    now = datetime.now(timezone.utc)

    active_keys = (
        db.query(MCPAPIKey)
        .filter(MCPAPIKey.is_active.is_(True))
        .order_by(MCPAPIKey.id)
        .limit(MAX_ACTIVE_KEYS)
        .all()
    )

    matched: Optional[MCPAPIKey] = None
    for record in active_keys:
        # Pas de sortie anticipée : on compare tous les condensats.
        if hmac.compare_digest(record.key_hash or "", candidate):
            matched = record

    if matched is not None and not _is_expired(matched, now):
        try:
            _touch_last_used(db, matched)
        except Exception:
            db.rollback()
        return MCPPrincipal(
            key_id=matched.id,
            name=matched.name,
            scopes=_normalise_scopes(matched.scopes),
            source="registry",
            fingerprint=matched.fingerprint,
        )

    if matched is not None:
        logger.warning("Clé MCP expirée: id=%s fprint=%s", matched.id, matched.fingerprint)

    return _verify_legacy(raw_key)
