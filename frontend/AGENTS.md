# AGENTS.md : SentineDog-SeeYou (refonte graphique)

Instructions valables pour tout agent de code (Claude Code, Codex, Cursor...).

## Projet

Tableau de bord de sécurité SentineDog-SeeYou. Les sources sont dans le répertoire de travail courant (racine du projet).
Le site publié (https://sentinedog-seeyou.vercel.app/) n'est pas consultable : travailler uniquement sur les sources locales.

## Stack

- Vite 7, React 19, TypeScript partout, Tailwind CSS 4.1 (`@tailwindcss/vite`, PAS de `tailwind.config`), routing `wouter`.
- Composants shadcn/ui dans `client/src/components/ui/`.
- Gestionnaire de paquets : **pnpm uniquement** (jamais npm, npx ni yarn ; pas de `package-lock.json`).

## Commandes (scripts réels de package.json)

- `pnpm dev` : serveur de développement (`vite --host`)
- `pnpm check` : `tsc --noEmit`
- `pnpm build` : build client + serveur (régénère `dist/`)
- `pnpm preview` : prévisualiser le build
- `pnpm format` : `prettier --write .`
- Il n'existe PAS de script `lint` : ne pas en créer ni l'appeler.
- `bash scripts/verif.sh` : audit des couleurs + check + build.

## Zones interdites

Ne jamais modifier `server/`, `shared/`, `patches/`, `vercel.json`, `pnpm-lock.yaml`.
`dist/` ne s'édite jamais à la main (il est régénéré par `pnpm build`).
Le frontend doit rester connecté au backend : ne toucher à aucun appel API, route, type partagé ni variable d'environnement.

## Thèmes en bref

- 5 thèmes de couleurs en `oklch` : `.theme-1` à `.theme-5`, chacun avec sa déclinaison `.dark`. **`.theme-5` (Minimaliste) est le défaut.**
- Sélecteur de thème dans **Paramètres** (`color-theme`), bascule clair/sombre dans la **topbar** (`theme`), les deux persistés.
- Les composants utilisent les variables CSS, jamais de couleur en dur.
- Seule exception : coloration optionnelle des lignes de logs par sévérité (voir `contexte/charte-graphique.md`).
- Détails : `SPEC.md`, `.claude/rules/palette-couleurs.md` et `contexte/charte-graphique.md`.

## Conventions

- Code TypeScript typé, lisible, cohérent avec l'existant. Pas de dépendance lourde sans justification.
- Conserver le routing `wouter`. Adapter shadcn via les variables CSS, sans réécrire les composants.
- Réponses et commentaires en français.
