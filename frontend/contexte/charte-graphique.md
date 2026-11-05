# Charte graphique (résumé)

Le thème est un thème shadcn neutre défini en `oklch` dans `client/src/index.css` (`:root` / `.dark`), exposé via `@theme inline`. Les composants utilisent les variables CSS, jamais de couleur en dur.

Le thème shadcn neutre remplace l'ancienne charte 5 couleurs (décision du 2026-11-05).

| Élément        | Token                                                     |
| -------------- | --------------------------------------------------------- |
| Fond / texte   | `--background` / `--foreground`                           |
| Cartes         | `--card` / `--card-foreground`                            |
| Bordures       | `--border` / `--input`                                    |
| Accent / focus | `--accent` / `--ring`                                     |
| Sidebar        | `--sidebar` / `--sidebar-foreground` / `--sidebar-border` |
| Graphiques     | `--chart-1` … `--chart-5`                                 |
| Rayon          | `--radius`                                                |

Les valeurs exactes sont dans `client/src/index.css`.

## Logs : teintes de sévérité (seule exception)

| Sévérité       | Fond clair | Texte clair | Fond sombre | Texte sombre |
| -------------- | ---------- | ----------- | ----------- | ------------ |
| Critique       | #b02323    | #FFFFFF     | #3B0D0D     | #E0E0E0      |
| Info / Warning | #fcd6cc    | #222526     | #ebc1ae     | #000000      |
| Normal         | #ccebd2    | #222526     | #8fcc9b     | #000000      |
