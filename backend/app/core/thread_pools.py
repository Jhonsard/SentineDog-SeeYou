"""
Pools de threads dedies aux operations bloquantes.

Isoler les appels bloquants (SQLAlchemy synchrone, iptables/sudo, TensorFlow)
de la boucle evenementielle est la condition de la "Vitesse Machine" : le
traitement de paquets et la capture ne doivent jamais attendre un outil d'audit.

Un pool par classe de ressource pour qu'une requete d'audit lente (ou un
entrainement) ne consomme jamais les threads du pare-feu.
"""
import logging
from concurrent.futures import ThreadPoolExecutor
from typing import Optional

from app.core.config import settings

logger = logging.getLogger("ids_ips.thread_pools")

_db_threadpool: Optional[ThreadPoolExecutor] = None
_firewall_threadpool: Optional[ThreadPoolExecutor] = None
_rl_threadpool: Optional[ThreadPoolExecutor] = None


def _get_pool(
    current: Optional[ThreadPoolExecutor],
    workers: int,
    prefix: str,
) -> ThreadPoolExecutor:
    if current is None:
        logger.info("Initialisation du thread pool %s (%d workers)", prefix, workers)
        return ThreadPoolExecutor(max_workers=workers, thread_name_prefix=prefix)
    return current


def get_db_threadpool() -> ThreadPoolExecutor:
    global _db_threadpool
    _db_threadpool = _get_pool(
        _db_threadpool, settings.MCP_THREADPOOL_DB_WORKERS, "ids-db"
    )
    return _db_threadpool


def get_firewall_threadpool() -> ThreadPoolExecutor:
    global _firewall_threadpool
    _firewall_threadpool = _get_pool(
        _firewall_threadpool, settings.MCP_THREADPOOL_FIREWALL_WORKERS, "ids-firewall"
    )
    return _firewall_threadpool


def get_rl_threadpool() -> ThreadPoolExecutor:
    global _rl_threadpool
    _rl_threadpool = _get_pool(
        _rl_threadpool, settings.MCP_THREADPOOL_RL_WORKERS, "ids-rl"
    )
    return _rl_threadpool


def prewarm_threadpools() -> None:
    """Cree les pools au demarrage pour eviter un pic de latence a la 1re requete."""
    get_db_threadpool()
    get_firewall_threadpool()
    get_rl_threadpool()


async def shutdown_threadpools() -> None:
    """A appeler dans le lifespan de l'application (les apps montees ne
    recoivent pas le scope lifespan, le MCP ne peut donc pas le faire)."""
    global _db_threadpool, _firewall_threadpool, _rl_threadpool
    for name, pool in [
        ("DB", _db_threadpool),
        ("Firewall", _firewall_threadpool),
        ("RL", _rl_threadpool),
    ]:
        if pool is not None:
            logger.info("Arret du thread pool %s...", name)
            pool.shutdown(wait=True, cancel_futures=True)
    _db_threadpool = _firewall_threadpool = _rl_threadpool = None
