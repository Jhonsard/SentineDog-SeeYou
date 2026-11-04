---
paths:
  - "client/src/**/*.{ts,tsx,css}"
---

# Accessibilité

- Contraste texte/fond d'au moins 4,5:1 dans les deux modes.
- Focus clavier toujours visible : anneau de 2 px dans la couleur du texte, avec décalage.
- Un statut ne repose jamais sur la couleur seule : libellé + icône.
- Graphiques : séries distinguées par style de trait, marqueurs, opacité ou hachures ; légende avec le motif.
- Respecter `prefers-reduced-motion` pour toute animation.
- Le `ThemeToggle` et le sélecteur d'affichage des logs sont opérables au clavier, avec un nom accessible.
