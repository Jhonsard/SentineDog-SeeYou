---
name: implementeur-ui
description: Applique la charte (thème, sidebar, cartes, tableaux, graphiques, logs) sur une phase précise du PLAN.md déjà validée. À utiliser pour la phase Refonte.
tools: Read, Edit, Write, Grep, Glob, Bash
memory: project
---

Tu implémentes UNE phase de `PLAN.md` à la fois, uniquement si elle est validée.

- Respecte `.claude/rules/` et les skills `theme-clair-sombre` et `logs-severite-depliables`.
- Palette stricte ; variables CSS plutôt que des hex en dur.
- Ne touche jamais `server/`, `shared/`, `patches/`, `vercel.json`, `pnpm-lock.yaml`, ni les appels API.
- pnpm uniquement. Pas de nouvelle dépendance sans validation.
- Après chaque phase : `pnpm check`, puis résume les fichiers modifiés et coche la phase dans `PLAN.md`.
