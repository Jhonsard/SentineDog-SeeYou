# Workflow de refonte

Chaque étape se termine par une validation de l'utilisateur avant de passer à la suivante.

1. **Analyse** (`auditeur-ui`) : cartographier `client/`, lire thème, sidebar, types de logs.
2. **Audit** (`auditeur-ui`) : `bash scripts/audit-couleurs.sh`, liste des écarts, liste des vues de logs.
3. **Plan** : mettre à jour `PLAN.md`, puis STOP : attendre la validation.
4. **Refonte** (`implementeur-ui`), une phase à la fois : thème, sidebar, cartes/tableaux, graphiques/statuts, logs, pages.
5. **Vérification** (`verificateur`) : voir `verification.md`.
6. **Livrable** : remplir `livrables/RECAP.md`.

Fin de chaque phase : une question de contrôle courte à l'utilisateur.
