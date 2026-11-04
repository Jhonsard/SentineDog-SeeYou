---
name: logs-severite-depliables
description: Implémente les tableaux de logs de SentineDog : choix d'affichage (défaut / coloration par sévérité) et lignes dépliables accessibles avec ancre #log-<id>. À utiliser pour la phase "Logs".
---

# Logs : sélecteur, sévérité, lignes dépliables

## Briques à créer (réutilisables par NetworkLogs, LogsManagement, ThreatIntel)

- `useLogsDisplay()` : lit/écrit `localStorage` clé `logs-display` (`'default' | 'severity'`), défaut `'default'`, `try/catch`.
- `LogsDisplayToggle` : groupe de boutons radio « Par défaut » / « Coloration par sévérité ».
- `severityStyle(level, theme)` : renvoie fond + couleur de texte (table dans `.claude/rules/logs.md`). Mapper les niveaux réels de `types.ts` ; ne rien inventer.
- `LogRow` : ligne + panneau de détail.

## Ligne dépliable (pattern disclosure)

- Cellule principale : `<a href="#log-{id}" id="log-trigger-{id}" aria-expanded aria-controls="log-detail-{id}">`. Au clic : `preventDefault()` puis bascule. Entrée déclenche déjà le clic ; ajouter un `keydown` pour Espace. Échap referme.
- Détail : `<tr id="log-detail-{id}" hidden={!open}><td colSpan={n}>...</td></tr>` avec tous les champs de l'alerte.
- Ancre : au chargement et sur `hashchange`, si le hash vaut `#log-<id>`, ouvrir la ligne et `scrollIntoView({ block: 'center' })`. Vérifier que `wouter` n'est pas gêné par le hash.
- Plusieurs lignes ouvertes possibles. Animation seulement si pas de `prefers-reduced-motion`.

## Sévérité

- Libellé + icône dans une colonne dédiée, même en mode par défaut.
- Mode `severity` : toute la ligne prend fond et texte de la table ; mode `default` : charte standard.

## Vérifier

Tab, Entrée, Espace, Échap ; deux thèmes ; rechargement avec une ancre ; contraste ≥ 4,5:1 ; `pnpm check`.
