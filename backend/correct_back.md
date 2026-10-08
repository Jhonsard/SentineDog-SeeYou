`Directive Opérationnelle Globale : Refonte et Durcissement Industriel de l'IDS/IPS Distribué (FastAPI + Scapy + SQLAlchemy 2.0 + WebSocket + Paramiko)`

`Rôle :` Architecte Logiciel Senior, Ingénieur DevSecOps, Expert IDS/IPS, Ingénieur Backend Python/FastAPI, Expert SQLAlchemy, Expert Réseaux, Ingénieur Sécurité Offensive et Défensive (20+ ans d'expérience).

`Contexte de l'Audit :` Le prototype académique actuel a obtenu la notation de 1.5 / 5 en raison de vulnérabilités critiques de sécurité opérationnelle (secrets en clair, CORS permissif, SSH non durci, exécution aveugle d'iptables), de failles de robustesse réseau (pertes de paquets silencieuses, absence de rate limiting), d'une architecture de production insuffisante (absence d'Alembic, de conteneurisation, de CI/CD), et d'une détection IDS basique et contournable.

`Objectif :` Transformer rigoureusement ce projet en un IDS/IPS robuste, sécurisé, maintenable et proche des standards industriels, sans introduire de régression ni sauter d'étape.

`Méthodologie Obligatoire (Le Cycle d'Exécution)`
Le travail s'effectue strictement de manière séquentielle. Aucune phase ni domaine critique ne peut être traité en parallèle.

Pour chaque étape, le cycle suivant doit être respecté :

`Analyse complète de l'existant et des dépendances associées.`

`Identification des problèmes (vulnérabilités, risques, impacts).`

Justification technique de la correction.

Implémentation réelle (fourniture des fichiers modifiés, chemins exacts, codes complets, commandes de vérification).

Validation et Tests (unitaires, d'intégration ou de sécurité).

Résumé des modifications et attente de l'autorisation explicite pour passer à la phase suivante.

Plan Global d'Exécution (Fusion des 17 étapes dans les 12 phases)
PHASE 1 — Suppression des Vulnérabilités Critiques & Nettoyage des Secrets (Étapes 1 & 13)
Actions :

Supprimer toute clé, token, mot de passe en dur (ex: CHANGEME_SUPER_SECRET_KEY_PROD_ULPGL_2026).

Implémenter un système de configuration centralisé via pydantic-settings / python-dotenv.

Fournir un template .env.example sans valeurs réelles et ajouter .env au .gitignore.

Supprimer entièrement le dossier obsolète ou dupliqué copyy/.

Unifier la gestion JWT en choisissant exclusivement python-jose pour FastAPI, en supprimant la redondance avec pyjwt.

`PHASE 2 — Sécurisation CORS (Étape 2)`
Actions :

Remplacer allow_origins=["*"] par une liste blanche explicite d'origines autorisées injectée depuis la configuration.

Restreindre ou désactiver allow_credentials=True si non nécessaire avec des origines larges.

Adapter la configuration selon les environnements (Dev, Test, Prod).

`PHASE 3 — Authentification & Gestion JWT Avancée (Étape 3 du plan devops)`
Actions :

Valider l'implémentation unique de l'authentification OAuth2 (Password flow) avec FastAPI OAuth2PasswordBearer.

Sécuriser la durée de vie des tokens, la gestion des erreurs d'authentification et le stockage des clés.

`PHASE 4 — Sécurisation SSH Paramiko (Étape 3 du prompt 1)`
Actions :

Remplacer AutoAddPolicy par une politique rigoureuse (WarningPolicy ou chargement strict des hôtes connus via known_hosts).

Implémenter des timeouts stricts de connexion et de commande (défaut : 5 secondes).

Valider systématiquement le code de retour de chaque commande distante et journaliser toute anomalie au niveau ERROR.

`PHASE 5 — Exécution d'Iptables avec Vérification et Timeouts (Étape 7 du prompt 1)`
Actions :

Encapsuler chaque appel système iptables avec un timeout de 2 secondes.

Exécuter systématiquement une vérification post-action (iptables -C) pour confirmer l'application effective de la règle.

Mettre en place une stratégie de réessai (3 tentatives max), avec remontée d'alerte critique via WebSocket et SMTP en cas d'échec persistant.

`PHASE 6 — Robustesse des Files d'Attente & Gestion de Charge (Étape 4 du prompt 1)`
Actions :

Remplacer la file aveugle Queue(maxsize=5000) par une gestion explicite de l'overflow (put_nowait() avec gestion try/except, ou backpressure contrôlée).

Maintenir un compteur atomique de paquets perdus (dropés) exposé via les métriques de santé.

`PHASE 7 — Rate Limiting et Durcissement de l'API (Étapes 5 & 16)`
Actions :

Intégrer slowapi sur les routes sensibles d'authentification (/login, /token) avec une limite stricte (ex: 5 requêtes/minute par IP, code HTTP 429 et header Retry-After).

Implémenter l'endpoint de supervision /api/v1/health retournant l'état du moteur, les compteurs de paquets (traités/dropés), le nombre de nœuds, la santé de la base de données et l'uptime.

`PHASE 8 — Migration de la Base de Données vers Alembic (Étape 9 du prompt 1)`
Actions :

Initialiser Alembic et générer la migration initiale depuis les modèles SQLAlchemy 2.0 existants.

Supprimer définitivement tout appel à Base.metadata.create_all() en production.

Intégrer alembic upgrade head dans le processus de déploiement/démarrage.

`PHASE 9 — Nettoyage Architectural & Suppression du Code Mort (Étapes 13 & 14 du prompt 1)`
Actions :

Supprimer le monkey-patching d'ORM en runtime au profit de colonnes explicites, de propriétés hybrides ou de schémas de sortie Pydantic v2 (model_dump).

Nettoyer les imports inutilisés, la duplication de code et consolider l'arborescence.

`PHASE 10 — Durcissement du Moteur de Détection IDS/IPS & Circuit Breaker (Étapes 6 & 15 du prompt 1)`
Actions :

Remplacer la détection par simple substring par des expressions régulières compilées, précédées d'une normalisation (décodage URL, gestion des encodages multiples).

Implémenter un suivi stateful des flags TCP (SYN, ACK, FIN, RST, XMAS, NULL) via un dictionnaire par couple (src_ip, dst_port).

Ajouter une fenêtre glissante de 10 secondes pour la détection du SYN flood (> 100 SYN sans ACK).

Implémenter un mécanisme de circuit breaker sur le moteur de détection (bascule en mode FAIL_CLOSE = True après 3 erreurs consécutives avec log de niveau CRITICAL).

`PHASE 11 — Journalisation Structurée & Rotation des Clés JWT (Étapes 8 & 17 du prompt 1)`
Actions :

Remplacer tous les print() par un logging structuré au format JSON (timestamp, level, module, message, extra) avec gestion des handlers fichier et console.

Implémenter un endpoint d'administration /api/v1/keys/rotate adossé à une table jwt_keys pour gérer la rotation sécurisée des secrets d'authentification avec période de grâce.

`PHASE 12 — Conteneurisation, CI/CD et Tests Structurés (Étapes 10, 11 & 12 du prompt 1)`
Actions :

Rédiger un Dockerfile multi-stage (builder + runtime) et un docker-compose.yml orchestrant l'API, PostgreSQL et Redis (avec healthchecks et conditions de dépendance).

Configurer un pipeline CI/CD (.github/workflows/ci.yml) intégrant le linting (ruff), l'analyse de secrets (gitleaks/trufflehog), les tests pytest et le build des images.

Écrire une suite de tests structurée (TestClient, base de données de test en mémoire, mocks Paramiko, tests paramétrés pour les vecteurs d'attaque XSS/SQLi/Scan).

Démarrage de la Phase 1
Conformément à la méthodologie, nous commençons exclusivement par la Phase 1.

Veuillez examiner ce plan directeur. Dès votre confirmation, je procèderai à l'analyse détaillée de l'existant pour la Phase 1 (Suppression des vulnérabilités critiques et nettoyage des secrets) et vous fournirai les corrections immédiates.