# Stage 1: Builder - installe les dépendances système et Python
FROM python:3.13-slim-bookworm AS builder

WORKDIR /app

# Dépendances système pour Scapy, Paramiko, cryptography
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libffi-dev \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Copier les requirements d'abord pour profiter du cache Docker
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt


# Stage 2: Runtime - image finale minimaliste
FROM python:3.13-slim-bookworm AS runtime

WORKDIR /app

# Copier les dépendances depuis le builder
COPY --from=builder /install /usr/local

# Copier le code applicatif
COPY app/ ./app/
COPY alembic.ini .
COPY alembic/ ./alembic/
COPY correct_back.md ./correct_back.md

# Variables d'environnement par défaut (override via .env / compose)
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    API_HOST=0.0.0.0 \
    API_PORT=8000 \
    DATABASE_URL=sqlite:///./ids_ips_local.db \
    CORS_ENVIRONMENT=dev \
    CORS_ALLOWED_ORIGINS=["http://localhost:3000","http://localhost:5173","http://localhost:8080"] \
    CORS_ALLOW_CREDENTIALS=true \
    RATE_LIMIT_ENABLED=true \
    RATE_LIMIT_AUTH_REQUESTS=5 \
    RATE_LIMIT_AUTH_WINDOW_SECONDS=60 \
    IPTABLES_TIMEOUT_SECONDS=2 \
    IPTABLES_MAX_RETRIES=3 \
    SSH_TIMEOUT_SECONDS=5 \
    SSH_STRICT_HOST_KEY_CHECKING=true \
    ALERT_THRESHOLD_PORT_SCAN=10 \
    ALERT_THRESHOLD_SYN_FLOOD=100

EXPOSE 8000

# Point d'entrée
CMD ["python", "-m", "app.main"]
