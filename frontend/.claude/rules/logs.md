---
paths:
  - "client/src/pages/{NetworkLogs,ThreatIntel,LogsHub}.tsx"
  - "client/src/components/**/*Log*.tsx"
  - "client/src/components/types.ts"
---

# Logs : affichage, sévérité, lignes dépliables

- Deux options d'affichage (clé `localStorage` `logs-display`, valeurs `default` | `severity`, défaut `default`).
- Niveaux : Critique, Info / Warning, Normal. N'en inventer aucun ; si une donnée a un autre niveau, demander.
- Couleurs de ligne en mode `severity` (les seules hors palette) :
  - Critique : clair fond `#b02323` / texte `#FFFFFF` ; sombre fond `#3B0D0D` / texte `#E0E0E0`
  - Info / Warning : clair fond `#fcd6cc` / texte `#222526` ; sombre fond `#ebc1ae` / texte `#000000`
  - Normal : clair fond `#ccebd2` / texte `#222526` ; sombre fond `#8fcc9b` / texte `#000000`
- Toujours afficher la sévérité en toutes lettres + icône.
- Chaque ligne : lien/bouton natif, `aria-expanded`, `aria-controls`, ancre `#log-<id>`, Entrée/Espace déplient, Échap referme.
