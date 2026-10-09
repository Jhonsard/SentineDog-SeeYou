import logging
from contextlib import asynccontextmanager
import asyncio
import time
from fastapi import FastAPI, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import text
from slowapi.middleware import SlowAPIMiddleware
from slowapi.errors import RateLimitExceeded

# Importations des composants d'infrastructure centralisés
from app.core.config import settings
from app.db.models import Base
from app.core.dependencies import get_db, SessionLocal
from app.engine.sniffer import NetworkSniffer
from app.engine.processor import PacketProcessor
from app.engine.queue_manager import PacketQueueManager
from app.services.alert_manager import AlertManager
from app.services.websocket_manager import websocket_manager
from app.api.endpoints.auth import router as auth_router
from app.api.endpoints.alert import router as alerts_router
from app.api.endpoints.email_config import router as email_config_router
from app.api.endpoints.nodes import router as nodes_router
from app.api.endpoints.keys import router as keys_router
from app.api.endpoints.ai import router as ai_router
from app.core.rate_limiter import limiter
from app.core.thread_pools import prewarm_threadpools, shutdown_threadpools
from app.engine.firewall import firewall_manager
from app.core.json_logger import configure_logging
from app.mcp.server import create_mcp_app

configure_logging(level=logging.INFO)
logger = logging.getLogger("ids_ips.main")

@asynccontextmanager
async def app_lifespan(app: FastAPI):
    app.state.start_time = time.time()
    logger.info("--- INITIALISATION DU BACKEND IDS/IPS ULPGL ---")
    
    if len(settings.SECRET_KEY) < 32:
        logger.critical("SECRET_KEY trop courte (<32 caracteres). Arret immediat.")
        raise RuntimeError("SECRET_KEY invalide: longueur minimum 32 caracteres.")
    
    try:
        from alembic.config import Config
        from alembic import command
        alembic_cfg = Config("alembic.ini")
        alembic_cfg.set_main_option("sqlalchemy.url", settings.DATABASE_URL)
        command.upgrade(alembic_cfg, "head")
        logger.info("Schema de base de donnees synchronise via Alembic.")
    except Exception as e:
        logger.critical(f"Impossible d'appliquer les migrations Alembic: {str(e)}")
        raise

    # Seed initial admin user if configured
    try:
        from scripts.seed_admin import create_admin_user
        create_admin_user()
    except Exception as e:
        logger.warning(f"Seed admin non executé: {e}")

    packet_queue: PacketQueueManager = PacketQueueManager(maxsize=5000)
    app.state.packet_queue = packet_queue

    # Pools de threads dedies (DB / iptables / TensorFlow) : ils sont liberes
    # dans le finally du lifespan. L'app MCP montee ne recevant pas le scope
    # lifespan, c'est le seul endroit fiable pour les arreter.
    prewarm_threadpools()

    alert_manager = AlertManager(db_session_factory=SessionLocal)
    firewall_manager.block_failure_callback = alert_manager.process_new_alert
    processor = PacketProcessor(alert_callback=alert_manager.process_new_alert)
    sniffer = NetworkSniffer(packet_queue=packet_queue, interface=settings.NETWORK_INTERFACE)

    processor_task = asyncio.create_task(processor.start_processing(packet_queue))
    sniffer_task = asyncio.create_task(sniffer.start_capture())
    app.state.sniffer_task = sniffer_task
    app.state.processor_task = processor_task

    try:
        from app.services.ai_decision_service import _load_rl_inference, AIDecisionService
        from app.api.endpoints.ai import _ai_service
        app.state.rl_inference = _load_rl_inference()
        app.state.ai_service = _ai_service
        if app.state.rl_inference and getattr(app.state.rl_inference, "is_trained", False):
            source = "HuggingFace" if getattr(settings, "AI_HF_REPO_ID", None) else "local"
            logger.info("Module RL precharge avec succes depuis %s.", source)
        else:
            logger.warning("Module RL non entraîné, mode fallback manuel actif.")

        if getattr(settings, "RL_MANUAL_MODE_LEARNING_ENABLED", False):
            async def _background_train_loop():
                while True:
                    try:
                        await asyncio.sleep(30)
                        service = app.state.ai_service
                        if service is not None:
                            result = service.maybe_train()
                            if result.get("status") == "trained":
                                logger.info("Entrainement Humain en arriere-plan: %s", result)
                    except asyncio.CancelledError:
                        break
                    except Exception as exc:
                        logger.error("Erreur dans la boucle d'entrainement Humain: %s", exc)

            app.state.background_train_task = asyncio.create_task(_background_train_loop())
            logger.info("Apprentissage Humain en mode manuel active (entrainement en arriere-plan).")
    except Exception as exc:
        logger.warning("Module RL non disponible au demarrage: %s", exc)
        app.state.rl_inference = None

    logger.info("Moteurs d'interception et d'analyse comportementale déployés avec succès.")
    
    yield

    logger.info("--- FERMETURE DES SYSTÈMES DE SÉCURITÉ ---")
    background_train_task = getattr(app.state, "background_train_task", None)
    if background_train_task is not None:
        background_train_task.cancel()
        try:
            await background_train_task
        except asyncio.CancelledError:
            pass

    await sniffer.stop_capture()
    processor.stop_processing()

    sniffer_task.cancel()
    processor_task.cancel()

    await asyncio.gather(sniffer_task, processor_task, return_exceptions=True)

    # Arret des pools de threads dedies (DB / iptables / TensorFlow).
    await shutdown_threadpools()

    logger.info("Ressources système libérées. Extinction complète de l'application.")

# Initialisation de l'instance maîtresse de FastAPI
app = FastAPI(
    title=settings.APP_NAME,
    description="Cœur d'analyse, de détection et de prévention d'intrusions pour le réseau local de l'ULPGL.",
    version="2.0.0",
    lifespan=app_lifespan
)
app.state.limiter = limiter
app.state.firewall_manager = firewall_manager

@app.exception_handler(RateLimitExceeded)
async def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded):
    retry_after = exc.detail or str(settings.RATE_LIMIT_AUTH_WINDOW_SECONDS)
    return JSONResponse(
        status_code=429,
        content={"detail": "Trop de tentatives. Réessayez dans quelques instants."},
        headers={"Retry-After": retry_after},
    )

# Configuration de la sécurité des partages de ressources (CORS) pour le Dashboard Front-End
# Injectée depuis la configuration centralisée, avec validation stricte en production
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ALLOWED_ORIGINS,
    allow_credentials=settings.CORS_ALLOW_CREDENTIALS,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"] if settings.CORS_ENVIRONMENT != "dev" else ["*"],
    allow_headers=["*"] if settings.CORS_ENVIRONMENT == "dev" else ["Authorization", "Content-Type", "Accept"],
)

# Rate limiting global sur les endpoints sensibles
if settings.RATE_LIMIT_ENABLED:
    app.add_middleware(SlowAPIMiddleware)

# Branchement des routeurs d'API modulaires (Routage explicite)
app.include_router(auth_router, prefix="/api/v1")
app.include_router(alerts_router, prefix="/api/v1")
app.include_router(email_config_router, prefix="/api/v1")
app.include_router(nodes_router, prefix="/api/v1")
app.include_router(keys_router, prefix="/api/v1")
app.include_router(ai_router, prefix="/api/v1")

app.mount("/mcp", create_mcp_app(), name="mcp")

@app.get("/api/v1/health", summary="Vérification de l'état de santé du système (Health Check)")
async def health_check(db: Session = Depends(get_db)):
    uptime = time.time() - app.state.start_time
    queue_metrics = app.state.packet_queue.get_metrics()
    sniffer_running = getattr(app.state, "sniffer_task", None) is not None and not getattr(app.state, "sniffer_task").done()
    processor_running = getattr(app.state, "processor_task", None) is not None and not getattr(app.state, "processor_task").done()
    engine_status = {
        "sniffer": "running" if sniffer_running else "stopped",
        "processor": "running" if processor_running else "stopped",
        "firewall": "active" if len(firewall_manager.blocked_ips) == 0 else f"{len(firewall_manager.blocked_ips)} IP(s) bloquées",
        "uptime_seconds": round(uptime, 2),
    }
    try:
        db.execute(text("SELECT 1"))
        db_status = "connected"
        status = "healthy"
        from app.db.models import Node
        nodes_count = db.query(Node).filter(Node.is_active == True).count()
    except Exception as e:
        logger.error(f"Erreur lors du Health Check: {str(e)}")
        db_status = "disconnected"
        status = "unhealthy"
        nodes_count = 0
    
    return {
        "status": status,
        "database": db_status,
        "system": "operational",
        "packet_queue": queue_metrics,
        "engine": engine_status,
        "nodes": {
            "active_count": nodes_count
        }
    }

if __name__ == "__main__":
    # Point d'entrée de démarrage manuel pour le développement (ex: python -m app.main)
    import uvicorn
    uvicorn.run(
        "app.main:app", 
        host=settings.API_HOST, 
        port=settings.API_PORT, 
        reload=False  # Rechargement désactivé pour ne pas perturber les threads Scapy
    ) 
