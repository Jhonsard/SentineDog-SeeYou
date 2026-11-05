---
paths:
  - "client/src/**/*.{ts,tsx,css}"
  - "client/index.html"
---

# Palette de couleurs (5 thèmes oklch)

- Source de vérité : les classes `.theme-1` à `.theme-5` de `client/src/index.css`, chacune avec sa déclinaison `.dark`, exposées via `@theme inline`. **`.theme-5` (Minimaliste) est le défaut.**
- Sélecteur de thème dans **Paramètres** (`color-theme`), bascule clair/sombre dans la **topbar** (`theme`) ; les deux persistés.
- Les composants utilisent les variables CSS (`bg-background`, `text-foreground`, `border-border`...), jamais de couleur en dur.
- Interdit : classes Tailwind de palette (`bg-blue-500`, `text-red-600`...), dégradés ou ombres colorés hors tokens.
- `oklch()`/`hsl()`/`rgb()` sont autorisés **uniquement** dans les déclarations de tokens de `index.css`.
- Seule exception : teintes de sévérité des lignes de logs (voir `logs.md`).
- Statuts, alertes et séries de graphiques : jamais par la couleur (voir `accessibilite.md`).
