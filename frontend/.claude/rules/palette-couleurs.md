---
paths:
  - "client/src/**/*.{ts,tsx,css}"
  - "client/index.html"
---

# Palette de couleurs (thème shadcn neutre)

- Source de vérité : les tokens `oklch` de `client/src/index.css` (`:root` / `.dark`), exposés via `@theme inline`.
- Clair par défaut, sombre optionnel ; choix en `localStorage` (clé `theme`).
- Les composants utilisent les variables CSS (`bg-background`, `text-foreground`, `border-border`...), jamais de couleur en dur.
- Interdit : classes Tailwind de palette (`bg-blue-500`, `text-red-600`...), dégradés ou ombres colorés hors tokens.
- `oklch()`/`hsl()`/`rgb()` sont autorisés **uniquement** dans les déclarations de tokens de `index.css`.
- Seule exception : teintes de sévérité des lignes de logs (voir `logs.md`).
- Statuts, alertes et séries de graphiques : jamais par la couleur (voir `accessibilite.md`).
