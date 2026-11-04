# Périmètre et sécurité

- Zones interdites : `server/`, `shared/`, `patches/`, `vercel.json`, `pnpm-lock.yaml`. `dist/` ne s'édite jamais à la main.
- Ne modifier aucun appel API, route, type partagé ni variable d'environnement : le frontend reste connecté au backend.
- Ne jamais lire ni afficher `.env` et `.env.*`.
- pnpm uniquement. Toute nouvelle dépendance doit être justifiée et validée avant `pnpm add`.
- Pas de script `lint` : ne pas en créer.
- Ne pas toucher aux pages ou composants hors périmètre de la phase en cours (voir `PLAN.md`).
