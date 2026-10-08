# Recommandations Stack Technologique Backend

## Objectif
Minimiser l'empreinte mémoire tout en maintenant des performances élevées pour l'analyse en temps réel de flux réseau à fort débit.

## Stack Recommandée

### 1. Langage et Runtime

**Python 3.11+ (avec optimisations)**

**Justification :**
- **Avantages :** Écosystème riche (scapy, asyncio, pandas), développement rapide, support async natif
- **Optimisations mémoire :** Python 3.11+ inclut des améliorations significatives de performance et de réduction de mémoire
- **Alternatives :** Rust ou Go pour des performances maximales, mais au détriment du temps de développement

**Optimisations Python :**
```python
# Utiliser __slots__ pour réduire la mémoire des objets
@dataclass
class __slots__ = ['field1', 'field2']  # Réduit ~40% mémoire

# Utiliser des types natifs (array vs list)
import array
# array('I') pour unsigned int vs list[int]

# Utiliser generators au lieu de listes pour les itérations
# (x for x in large_list) vs [x for x in large_list]
```

### 2. Structures de Données en Mémoire

**Choix :** `collections.deque` + `defaultdict` + `dict` natif

**Justification :**
- **deque :** O(1) pour append/pop aux deux extrémités, idéal pour sliding windows
- **defaultdict :** Évite les vérifications de clés, réduit le code et la surcharge
- **dict natif :** Python 3.11+ utilise des tables de hachage optimisées

**Alternatives pour haute performance :**
- **PyPy :** Interpréteur JIT, réduit la mémoire de ~30-50%
- **Cython :** Pour les sections critiques (State Store, Correlation Engine)
- **Rust extensions :** Pour les algorithmes de corrélation complexes

**Optimisations spécifiques :**
```python
# Sliding window avec deque (implémenté dans State Store)
from collections import deque
timestamps = deque(maxlen=10000)  # Auto-nettoyage, pas de surcharge

# Utiliser __slots__ pour les objets fréquents
class IPState:
    __slots__ = ['ip', 'packet_count', 'timestamps', ...]  # Réduit mémoire
```

### 3. Base de Données

**PostgreSQL avec TimescaleDB (optionnel)**

**Justification :**
- **PostgreSQL :** Robuste, support JSONB pour les règles dynamiques, connexions poolées
- **TimescaleDB :** Extension pour time-series, optimisé pour les métriques réseau
- **Alternative :** SQLite pour les déploiements légers (déjà implémenté)

**Optimisations PostgreSQL :**
```sql
-- Partitionnement par temps pour les tables de logs
CREATE TABLE alerts (
    id SERIAL,
    timestamp TIMESTAMPTZ,
    data JSONB
) PARTITION BY RANGE (timestamp);

-- Index BRIN pour les time-series (moins de mémoire que B-tree)
CREATE INDEX idx_alerts_timestamp ON alerts USING BRIN (timestamp);

-- Compression TOAST pour les grandes colonnes JSONB
ALTER TABLE alerts ALTER COLUMN data SET STORAGE EXTENDED;
```

### 4. Cache et Session

**Redis (optionnel) pour le cache distribué**

**Justification :**
- **In-memory :** Accès ultra-rapide (<1ms)
- **Structures de données :** Sorted sets pour time-series, Hash pour les états
- **Persistence :** RDB/AOF pour la reprise après crash

**Alternative :** Cache en mémoire avec LRU eviction (implémenté dans State Store)

**Optimisations Redis :**
```redis
# Utiliser Redis Streams pour les événements temps réel
XADD alerts * timestamp 1234567890 data '{"risk_score": 85}'

# Utiliser Sorted Sets pour les time-series
ZADD metrics:packet_rate 1234567890 100.5
ZREMRANGEBYSCORE metrics:packet_rate -inf (1234567890-3600)
```

### 5. Message Queue

**Apache Kafka (optionnel) pour les flux à très haut débit**

**Justification :**
- **Débit :** Millions de messages par seconde
- **Durabilité :** Logs persistants, reprise après crash
- **Partitionnement :** Scalabilité horizontale

**Alternative légère :** `asyncio.Queue` (déjà implémenté) pour les déploiements mono-nœud

**Optimisations Kafka :**
```python
# Compression des messages (réduit 70% la taille)
producer = KafkaProducer(
    compression_type='gzip',
    batch_size=65536,
    linger_ms=10
)

# Partitionnement par IP source pour la localité
partition_key = packet.source_ip
```

### 6. Framework Web

**FastAPI (déjà utilisé)**

**Justification :**
- **Performance :** Starlette sous-jacent, async natif
- **Validation :** Pydantic pour les types
- **Documentation :** OpenAPI automatique

**Optimisations FastAPI :**
```python
# Utiliser ORJSON pour le JSON (plus rapide que ujson)
from fastapi.responses import ORJSONResponse
app = FastAPI(default_response_class=ORJSONResponse)

# Compression des réponses
from fastapi.middleware.gzip import GZipMiddleware
app.add_middleware(GZipMiddleware, minimum_size=1000)
```

### 7. Monitoring et Observabilité

**Prometheus + Grafana**

**Justification :**
- **Prometheus :** Time-series database native, scraping léger
- **Grafana :** Visualisation en temps réel
- **Mémoire minimale :** ~100MB pour Prometheus

**Métriques clés à monitorer :**
- Mémoire par IP dans State Store
- Taille des buffers de corrélation
- Latence du pipeline
- Taux de faux positifs

### 8. Optimisations Mémoire Spécifiques

#### 8.1. State Store

**Implémentation actuelle :** Dictionnaires avec deque
**Optimisations :**
```python
# Utiliser weakref pour les entrées rarement utilisées
import weakref
state_cache = weakref.WeakValueDictionary()

# Nettoyage agressif des états expirés
def cleanup_aggressive():
    current_time = time.time()
    expired = [ip for ip, state in states.items() 
               if current_time - state.last_seen > 300]  # 5 min
    for ip in expired:
        del states[ip]
```

#### 8.2. Correlation Engine

**Implémentation actuelle :** Deque pour signal buffer
**Optimisations :**
```python
# Limiter la taille du buffer par IP
MAX_SIGNALS_PER_IP = 100
signal_buffer[ip] = deque(maxlen=MAX_SIGNALS_PER_IP)

# Utiliser des bytes au lieu de strings pour les IDs
import hashlib
incident_id = hashlib.md5(f"{ip}{timestamp}".encode()).digest()
```

#### 8.3. Baseline Profiler

**Implémentation actuelle :** Deque pour les valeurs
**Optimisations :**
```python
# Sous-échantillonnage pour les métriques haute fréquence
if len(values) % 10 == 0:  # Garder 1/10 des valeurs
    values.append(value)

# Utiliser numpy pour les calculs statistiques (plus rapide)
import numpy as np
mean = np.mean(values)
std = np.std(values)
```

### 9. Configuration Production

**Recommandations pour déploiement haute performance :**

```yaml
# docker-compose.yml optimisé
services:
  ids-ips:
    image: ids-ips:latest
    deploy:
      resources:
        limits:
          memory: 2G
        reservations:
          memory: 1G
    environment:
      - PYTHONUNBUFFERED=1
      - MALLOC_ARENA_MAX=2  # Réduit la fragmentation mémoire
```

**Variables d'environnement Python :**
```bash
# Réduire l'overhead du GIL
PYTHONUNBUFFERED=1

# Limiter le nombre d'arenas malloc (réduit fragmentation)
MALLOC_ARENA_MAX=2

# Activer les optimisations du GC
PYTHONMALLOC=malloc
```

### 10. Comparatif des Stacks

| Composant | Option Légère | Option Haute Performance | Recommandation |
|-----------|---------------|-------------------------|----------------|
| Langage | Python 3.11+ | Rust/Go | Python 3.11+ |
| Runtime | CPython | PyPy | PyPy (si compatible) |
| State Store | dict + deque | Rust HashMap | dict + deque |
| Base de données | SQLite | PostgreSQL + TimescaleDB | SQLite (dev) / PostgreSQL (prod) |
| Cache | In-memory LRU | Redis | In-memory LRU |
| Message Queue | asyncio.Queue | Kafka | asyncio.Queue |
| Framework | FastAPI | Actix-web (Rust) | FastAPI |

### 11. Estimation Empreinte Mémoire

**Pour 10,000 IPs actives simultanément :**

| Composant | Mémoire (MB) | Justification |
|-----------|--------------|---------------|
| State Store | ~200 | 20KB par IP (dict + deque) |
| Baseline Profiler | ~150 | 15KB par IP (statistiques) |
| Correlation Buffer | ~100 | 10KB par IP (signal buffer) |
| Pipeline Metadata | ~50 | 5KB par IP (contexte) |
| **Total** | **~500 MB** | Acceptable pour 10K IPs |

**Optimisations possibles :**
- Nettoyage agressif : -30%
- PyPy : -40%
- Rust extensions : -50%

### 12. Conclusion

**Stack recommandée pour minimiser l'empreinte mémoire :**

```
Python 3.11+ (ou PyPy)
├── FastAPI (API)
├── asyncio.Queue (Message Queue)
├── dict + deque (State Store)
├── SQLite (Base de données)
├── In-memory LRU (Cache)
└── Prometheus + Grafana (Monitoring)
```

**Cette stack permet :**
- Empreinte mémoire < 500MB pour 10,000 IPs
- Latence < 10ms par paquet
- Débit > 100,000 paquets/seconde
- Développement rapide et maintenance facile

**Pour des performances extrêmes :**
- Remplacer Python par Rust pour les composants critiques
- Utiliser PostgreSQL + TimescaleDB pour la persistance
- Ajouter Redis pour le cache distribué
- Utiliser Kafka pour les flux multi-nœuds
