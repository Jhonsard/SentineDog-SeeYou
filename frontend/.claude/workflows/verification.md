# Checklist de vérification

- [ ] `bash scripts/verif.sh` passe (couleurs, `pnpm check`, `pnpm build`)
- [ ] `pnpm format` exécuté
- [ ] Les 11 pages vérifiées en clair et en sombre
- [ ] Le choix `theme` persiste après rechargement, sans flash
- [ ] Le choix `logs-display` persiste après rechargement
- [ ] Lignes de logs : Tab, Entrée, Espace, Échap, ancre `#log-<id>`
- [ ] Contrastes ≥ 4,5:1, y compris les 3 teintes de sévérité dans les 2 modes
- [ ] Aucun appel API, route ou type partagé modifié ; `server/` et `shared/` intacts
