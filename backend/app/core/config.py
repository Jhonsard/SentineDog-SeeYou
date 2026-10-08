import os
from typing import Optional
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field, computed_field, field_validator, model_validator


class Settings(BaseSettings):
    """
    Configuration globale centralisée de l'application.
    Valide les types au démarrage et charge les variables d'environnement.
    """
    APP_NAME: str = "IDS-IPS-ULPGL"

    NETWORK_INTERFACE: str = Field(default="wlan0")
    ALERT_THRESHOLD_PORT_SCAN: int = Field(default=10)
    ALERT_THRESHOLD_SYN_FLOOD: int = Field(default=100)

    API_HOST: str = Field(default="0.0.0.0")
    API_PORT: int = Field(default=8000)

    DATABASE_URL: str = Field(default="sqlite:///./ids_ips_local.db")
    POSTGRES_HOST: Optional[str] = Field(default=None)
    POSTGRES_PORT: int = Field(default=5432)
    POSTGRES_USER: Optional[str] = Field(default=None)
    POSTGRES_PASSWORD: Optional[str] = Field(default=None)
    POSTGRES_DB: Optional[str] = Field(default=None)
    USE_POSTGRES: bool = Field(default=False)

    SMTP_SERVER: Optional[str] = Field(default=None)
    SMTP_PORT: int = Field(default=587)
    SMTP_USERNAME: Optional[str] = Field(default=None)
    SMTP_PASSWORD: Optional[str] = Field(default=None)
    SMTP_SENDER_EMAIL: Optional[str] = Field(default=None)
    ADMIN_EMAIL: Optional[str] = Field(default=None)

    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(default=30, ge=5, le=480)

    SSH_TIMEOUT_SECONDS: int = Field(default=5, ge=1, le=60)
    SSH_KNOWN_HOSTS_FILE: Optional[str] = Field(default=None)
    SSH_STRICT_HOST_KEY_CHECKING: bool = Field(default=True)

    IPTABLES_TIMEOUT_SECONDS: int = Field(default=2, ge=1, le=30)
    IPTABLES_MAX_RETRIES: int = Field(default=3, ge=1, le=10)

    RATE_LIMIT_ENABLED: bool = Field(default=True)
    RATE_LIMIT_AUTH_REQUESTS: int = Field(default=5, ge=1, le=100)
    RATE_LIMIT_AUTH_WINDOW_SECONDS: int = Field(default=60, ge=10, le=3600)

    AI_MODE_ENABLED: bool = Field(default=False)
    AI_MODEL_PATH: str = Field(default="ml_model/models/rl_agent.keras")
    AI_CONFIDENCE_THRESHOLD: float = Field(default=0.85, ge=0.0, le=1.0)
    AI_DECISION_TIMEOUT_SECONDS: int = Field(default=5, ge=1, le=30)
    AI_MAX_DECISIONS_PER_MINUTE: int = Field(default=30, ge=1, le=1000)
    AI_FALLBACK_ACTION: str = Field(default="manual")
    AI_LOG_LEVEL: str = Field(default="INFO", pattern="^(DEBUG|INFO|WARNING|ERROR|CRITICAL)$")

    HF_READ_TOKEN: Optional[str] = Field(default=None)
    HF_WRITE_TOKEN: Optional[str] = Field(default=None)
    AI_HF_REPO_ID: Optional[str] = Field(default=None)
    AI_HF_FILENAME: str = Field(default="rl_agent.keras")

    RL_MANUAL_MODE: bool = Field(default=False)
    RL_MANUAL_MODE_LEARNING_ENABLED: bool = Field(default=False)
    RL_MANUAL_MODE_TRAIN_INTERVAL: int = Field(default=100, ge=10, le=10000)

    MCP_API_KEY: str = Field(
        default="change_this_mcp_secret_key",
        description="Clé de SECOURS statique pour le plan MCP. Ignorée sauf si MCP_LEGACY_API_KEY_ENABLED=true.",
    )
    MCP_LEGACY_API_KEY_ENABLED: bool = Field(
        default=False,
        description="Accepter la clé statique MCP_API_KEY (reprise en panne uniquement). Fail-closed par défaut : utiliser le registre de clés à scopes.",
    )
    MCP_SERVER_NAME: str = Field(default="ids_ips_mcp")
    MCP_SSE_PATH: str = Field(default="/sse")
    MCP_MESSAGES_PATH: str = Field(default="/messages")
    MCP_ALLOWED_ORIGINS: list[str] = Field(
        default_factory=list,
        description=(
            "Origines (Navigateur) autorisées pour les connexions MCP. "
            "Un en-tête Origin ABSENT est toujours accepté : les clients MCP non-navigateur "
            "(Claude Desktop, CLI, scripts) n'envoient pas d'Origin. "
            "La protection contre le DNS rebinding est assurée par MCP_ALLOWED_HOSTS."
        )
    )
    MCP_PUBLIC_HOSTNAME: str = Field(
        default="localhost",
        description="Hostname public utilise par les clients MCP pour joindre le plan MCP (via le reverse proxy).",
    )
    MCP_ALLOWED_HOSTS: list[str] = Field(
        default_factory=list,
        description=(
            "En-tetes Host autorises (protection DNS rebinding, format 'host:port' ou 'host:*'). "
            "Si vide, derive de MCP_PUBLIC_HOSTNAME + API_PORT + localhost/127.0.0.1."
        ),
    )
    # Rate limiting spécifique MCP SSE
    MCP_RATE_LIMIT_ENABLED: bool = Field(default=True, description="Activer le rate limiting sur les endpoints MCP SSE.")
    MCP_RATE_LIMIT_REQUESTS: int = Field(default=60, ge=1, le=10000, description="Nombre max de requêtes MCP par fenêtre et par IP.")
    MCP_RATE_LIMIT_WINDOW_SECONDS: int = Field(default=60, ge=10, le=3600, description="Fenêtre de temps pour le rate limiting MCP (secondes).")
    MCP_RATE_LIMIT_MAX_BUCKETS: int = Field(default=4096, ge=16, le=1000000, description="Nombre max d'entrées mémoire du rate limiter (éviction LRU).")
    MCP_RATE_LIMIT_MAX_SSE_CONNECTIONS: int = Field(default=4, ge=1, le=1000, description="Nombre max de flux SSE simultanés par IP.")
    # mTLS / Client Certificates (préparation)
    MCP_MTLS_ENABLED: bool = Field(default=False, description="Activer mTLS pour connexions MCP (nécessite CA configuré).")
    MCP_MTLS_CA_CERT_PATH: Optional[str] = Field(default=None, description="Chemin vers le certificat CA pour validation certificats clients.")
    # Thread pools dédiés pour opérations bloquantes MCP
    MCP_THREADPOOL_DB_WORKERS: int = Field(default=4, ge=1, le=32, description="Workers pour opérations DB (SQLAlchemy sync).")
    MCP_THREADPOOL_FIREWALL_WORKERS: int = Field(default=2, ge=1, le=16, description="Workers pour opérations Firewall (iptables/ssh).")
    MCP_THREADPOOL_RL_WORKERS: int = Field(default=2, ge=1, le=16, description="Workers pour inférence RL (TensorFlow/Keras).")

    CORS_ENVIRONMENT: str = Field(default="dev", pattern="^(dev|test|prod)$")
    CORS_ALLOWED_ORIGINS: list[str] = Field(default_factory=lambda: ["http://localhost:3000", "http://localhost:5173", "http://localhost:8080"])
    CORS_ALLOW_CREDENTIALS: bool = Field(default=True)
    CORS_ALLOWED_METHODS: list[str] = Field(default_factory=lambda: ["*"])
    CORS_ALLOWED_HEADERS: list[str] = Field(default_factory=lambda: ["*"])

    @field_validator(
        "CORS_ALLOWED_ORIGINS",
        "MCP_ALLOWED_ORIGINS",
        "MCP_ALLOWED_HOSTS",
        mode="before",
    )
    @classmethod
    def parse_list_settings(cls, v):
        if isinstance(v, list):
            return [str(item).strip() for item in v if str(item).strip()]
        if isinstance(v, str):
            s = v.strip()
            if s.startswith("[") and s.endswith("]"):
                import json
                try:
                    parsed = json.loads(s)
                    return [str(item).strip() for item in parsed if str(item).strip()]
                except json.JSONDecodeError:
                    pass
            return [item.strip() for item in s.split(",") if item.strip()]
        return v

    @model_validator(mode="after")
    def derive_mcp_allowed_hosts(self):
        if not self.MCP_ALLOWED_HOSTS:
            hosts = dict.fromkeys(
                [self.MCP_PUBLIC_HOSTNAME, "localhost", "127.0.0.1", "idsips-api"]
            )
            self.MCP_ALLOWED_HOSTS = [f"{host}:{self.API_PORT}" for host in hosts]
        return self

    @model_validator(mode="after")
    def validate_postgres_config(self):
        if self.USE_POSTGRES:
            missing = []
            if not self.POSTGRES_HOST:
                missing.append("POSTGRES_HOST")
            if not self.POSTGRES_USER:
                missing.append("POSTGRES_USER")
            if not self.POSTGRES_PASSWORD:
                missing.append("POSTGRES_PASSWORD")
            if not self.POSTGRES_DB:
                missing.append("POSTGRES_DB")
            if missing:
                raise ValueError(
                    "USE_POSTGRES=true requiert les variables suivantes: " + ", ".join(missing)
                )
        return self

    @model_validator(mode="after")
    def validate_cors_config(self):
        if self.CORS_ENVIRONMENT == "prod":
            if "*" in self.CORS_ALLOWED_ORIGINS:
                raise ValueError(
                    "CORS_ALLOWED_ORIGINS ne peut pas contenir '*' en production. "
                    "Spécifiez les origines explicitement."
                )
            if self.CORS_ALLOW_CREDENTIALS and not self.CORS_ALLOWED_ORIGINS:
                raise ValueError(
                    "CORS_ALLOW_CREDENTIALS=True sans CORS_ALLOWED_ORIGINS explicites est interdit en production."
                )
        if self.CORS_ENVIRONMENT in ("prod", "test") and self.CORS_ALLOW_CREDENTIALS and "*" in self.CORS_ALLOWED_ORIGINS:
            raise ValueError(
                "CORS_ALLOW_CREDENTIALS=True est incompatible avec allow_origins=['*'] en dehors de dev. "
                "Désactivez les credentials ou spécifiez des origines explicites."
            )
        return self

    @computed_field
    @property
    def API_URL(self) -> str:
        return f"http://{self.API_HOST}:{self.API_PORT}"

    @field_validator("SECRET_KEY")
    @classmethod
    def validate_secret_key(cls, v: str) -> str:
        forbidden_patterns = ["CHANGEME", "CHANGE_ME", "example", "your-secret", "secret", "SUPER_SECRET"]
        if any(pattern in v for pattern in forbidden_patterns):
            raise ValueError(
                "SECRET_KEY ne peut pas contenir de valeur d'exemple par défaut. "
                "Générez une clé sécurisée (min 32 caractères aléatoires)."
            )
        if len(v) < 32:
            raise ValueError("SECRET_KEY doit contenir au moins 32 caractères.")
        return v

    @field_validator("MCP_API_KEY")
    @classmethod
    def validate_mcp_api_key(cls, v: Optional[str]) -> Optional[str]:
        if v is None or str(v).strip() == "":
            return v
        forbidden = ["change_this", "changeme", "CHANGEME", "example", "your_key"]
        if any(pattern in str(v).lower() for pattern in forbidden):
            raise ValueError("MCP_API_KEY ne peut pas être une valeur placeholder.")
        return v

    @field_validator("HF_READ_TOKEN", "HF_WRITE_TOKEN")
    @classmethod
    def validate_hf_tokens(cls, v: Optional[str]) -> Optional[str]:
        if v is None or str(v).strip() == "":
            return v
        forbidden = ["CHANGEME", "CHANGE_ME", "example", "your_token", "your-token", "hf_xxx"]
        if any(pattern in str(v) for pattern in forbidden):
            raise ValueError("Token Hugging Face invalide : valeur placeholder détectée.")
        return v

    @model_validator(mode="after")
    def validate_hf_repo_requires_read_token(self):
        if self.AI_HF_REPO_ID and not self.HF_READ_TOKEN:
            raise ValueError(
                "AI_HF_REPO_ID est défini mais HF_READ_TOKEN est absent. "
                "Le téléchargement depuis HuggingFace Hub nécessite un token de lecture."
            )
        return self

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )


settings = Settings()
