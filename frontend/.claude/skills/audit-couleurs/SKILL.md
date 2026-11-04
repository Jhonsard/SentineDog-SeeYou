---
name: audit-couleurs
description: Audite les couleurs hors charte dans client/ (hex, classes Tailwind de palette, fonctions oklch/hsl/rgb). À utiliser en phase Audit et Vérification.
---

# Audit des couleurs

1. Lancer `bash scripts/audit-couleurs.sh` depuis la racine.
2. Lire le rapport : hex hors charte, teintes de sévérité hors logs, classes Tailwind de palette, fonctions de couleur hors `index.css`.
3. Classer les écarts par fichier dans `PLAN.md` (phase Audit) ou dans `livrables/RECAP.md` (phase Vérification).
4. Un écart restant = un retour en phase Refonte. Faux positifs possibles (ancres `#add...`) : les justifier dans le rapport.
