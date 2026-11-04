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

## Charte en bref

- 5 couleurs seulement : `#FFFFFF`, `#000000`, `#E0E0E0`, `#222526`, `#353A3E`.
- Clair par défaut (fond blanc), sombre optionnel (fond noir), choix en `localStorage` (clé `theme`).
- Seule exception : coloration optionnelle des lignes de logs par sévérité (voir `contexte/charte-graphique.md`).
- Détails : `SPEC.md` et `.claude/rules/`.

## Conventions

- Code TypeScript typé, lisible, cohérent avec l'existant. Pas de dépendance lourde sans justification.
- Conserver le routing `wouter`. Adapter shadcn via les variables CSS, sans réécrire les composants.
- Réponses et commentaires en français.
