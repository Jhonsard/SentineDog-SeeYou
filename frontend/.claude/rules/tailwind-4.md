---
paths:
  - "client/src/**/*.{ts,tsx,css}"
---

# Tailwind CSS 4

- Il n'y a PAS de `tailwind.config` : ne pas en créer.
- Mode sombre : `@custom-variant dark (&:where(.dark, .dark *));` dans `index.css`.
- Couleurs centralisées en variables CSS (`:root`, `.dark`) exposées via `@theme inline`.
- Variables shadcn à aligner sur la charte : `--background`, `--foreground`, `--card`, `--card-foreground`, `--popover`, `--primary`, `--primary-foreground`, `--secondary`, `--muted`, `--accent`, `--border`, `--input`, `--ring`, `--sidebar*`.
- Aucun composant shadcn n'est réécrit : on change les variables.
