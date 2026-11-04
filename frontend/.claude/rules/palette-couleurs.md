---
paths:
  - "client/src/**/*.{ts,tsx,css}"
  - "client/index.html"
---

# Palette de couleurs (stricte)

- Couleurs autorisées : `#FFFFFF`, `#000000`, `#E0E0E0`, `#222526`, `#353A3E`. Rien d'autre.
- Clair : fond `#FFFFFF`, texte et bordures `#222526`, sidebar `#E0E0E0`.
- Sombre : fond `#000000`, texte et bordures `#E0E0E0`, sidebar `#353A3E`.
- Passer par les variables CSS de `index.css`, jamais de hex en dur dans les composants.
- Interdit : classes Tailwind de palette (`bg-blue-500`, `text-red-600`...), dégradés colorés, ombres colorées, `oklch()`/`hsl()`/`rgb()` hors `index.css`.
- Seule exception : teintes de sévérité des lignes de logs (voir `logs.md`).
- Statuts, alertes et séries de graphiques : jamais par la couleur (voir `accessibilite.md`).
