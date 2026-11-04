# Journal des décisions (2026-11-03)

- Cette refonte remplace l'ancienne refonte inspirée de Grafana.
- Palette stricte à 5 couleurs ; seule exception : coloration des lignes de logs.
- Sélection sidebar : barre d'accent à gauche + texte en gras.
- Graphiques et statuts : motifs, libellés et icônes, pas de couleurs supplémentaires.
- Logs : deux options d'affichage (défaut / coloration par sévérité), lignes dépliables, ancres `#log-<id>`.
- Teintes de sévérité : Critique #b02323 (texte blanc en clair), Info/Warning #fcd6cc / #ebc1ae, Normal #ccebd2 / #8fcc9b (texte noir en sombre pour Info/Warning et Normal).
- Gestionnaire de paquets : pnpm uniquement ; scripts réels : dev, build, start, preview, check, format ; pas de lint.
