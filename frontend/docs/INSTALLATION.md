# Installation du kit d'agent

1. Copier le contenu de ce dossier à la racine du projet (là où se trouve `package.json`). Si `CLAUDE.md`, `AGENTS.md`, `.mcp.json` ou `.claude/settings.json` existent déjà, fusionner au lieu d'écraser.
2. Ajouter à `.gitignore` :
   ```
   CLAUDE.local.md
   .claude/settings.local.json
   ```
3. Rendre les scripts exécutables : `chmod +x scripts/*.sh`.
4. Lancer Claude Code à la racine, activer le style `/output-style` (Tuteur FR), puis coller le prompt de `docs/prompt-lancement.md`.
5. Vérifier à la fin : `bash scripts/verif.sh`.
