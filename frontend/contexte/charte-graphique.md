# Charte graphique (résumé)

Cinq thèmes de couleurs sont définis en `oklch` dans `client/src/index.css` : `.theme-1` (Neutre), `.theme-2` (Bleu / Violet), `.theme-3` (Rouge / Bordeaux), `.theme-4` (Vert / Teal) et `.theme-5` (Minimaliste Noir & Blanc). Chacun possède sa déclinaison `.dark`. **`.theme-5` est le thème par défaut.** Les composants utilisent les variables CSS, jamais de couleur en dur.

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
