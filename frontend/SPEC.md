# SPEC : Refonte graphique, thème clair/sombre et logs (SentineDog-SeeYou)

Version validée le 2026-11-03. Cette spécification remplace l'ancienne refonte inspirée de Grafana.

## 0. Mode de travail

- Réponds en français, de façon directe.
- Avant tout code, écris un plan étape par étape dans `PLAN.md` et attends ma validation.
- Si un point est ambigu ou stratégique, pose-moi une question ciblée avant d'avancer.

## 1. Contexte

- Projet : SentineDog-SeeYou. Le site publié (https://sentinedog-seeyou.vercel.app/) n'est pas consultable par l'agent : il travaille uniquement sur les sources locales.
- Sources dans le répertoire de travail courant :
  - front dans `client/` (`client/src/` : `App.tsx`, `components/`, `components/dashboard/`, `components/ui/` (shadcn), `contexts/`, `hooks/`, `lib/`, `pages/`, `index.css`) ;
  - backend dans `server/index.ts`, constantes partagées dans `shared/const.ts`.
- Stack : Vite 7, React 19, TypeScript partout, Tailwind CSS 4.1 (plugin `@tailwindcss/vite`, PAS de `tailwind.config`), routing `wouter`.
- Gestionnaire de paquets : pnpm uniquement (`pnpm-lock.yaml`). Jamais npm ni `package-lock.json`.
- Interdit de modifier : `server/`, `shared/`, `patches/`, `vercel.json`. `dist/` ne s'édite jamais à la main (régénéré par `pnpm build`).
- Le frontend doit rester connecté au backend : aucun appel API, route, type partagé ni variable d'environnement ne change.

## 2. Livrables

### 2.1 Fichiers racine

`CLAUDE.md` (fusionner s'il existe), `CLAUDE.local.md`, `AGENTS.md`, `MAP.md`, `SPEC.md`, `PLAN.md`, `.mcp.json` (si absent), `.worktreeinclude`.

### 2.2 Dossier `.claude/`

`settings.json`, `settings.local.json`, `rules/`, `skills/`, `agents/`, `agent-memory/`, `workflows/`, `output-styles/`.

### 2.3 Dossiers de travail

`contexte/`, `livrables/`, `scripts/`, `docs/`.

### 2.4 Contexte personnel

`contexte/profil.md` : étudiant en 3e année de génie informatique, Python / Java / réseaux / cybersécurité / Linux, Kali Linux, français, ton direct, plan avant code, questions de contrôle.

### 2.5 Application de la charte

Toutes les pages (`Assets`, `Alerts`, `AssetsHub`, `Login`, `LogsHub`, `NetworkLogs`, `NodesManagement`, `NotFound`, `Reports`, `Settings`, `ThreatIntel`, `UserProfile`, `WelcomeAuth`) et les composants partagés (`SidebarLayout`, `components/dashboard/*`, `AlertFeed`, `BannedHosts`, `TrafficAttackChart`, etc.).

## 3. Charte graphique

### 3.1 Couleurs autorisées

Cinq thèmes de couleurs sont définis en `oklch` dans `client/src/index.css` : `.theme-1` (Neutre), `.theme-2` (Bleu / Violet), `.theme-3` (Rouge / Bordeaux), `.theme-4` (Vert / Teal), `.theme-5` (Minimaliste Noir & Blanc). **`.theme-5` est le thème par défaut.** Chaque thème possède sa déclinaison `.dark`. Les composants utilisent les variables CSS, jamais de couleur en dur. Seule exception : la coloration optionnelle des lignes de logs (section 5).

### 3.2 Mode clair (par défaut)

| Élément                                     | Token                                                     |
| ------------------------------------------- | --------------------------------------------------------- |
| Sidebar : fond / texte / bordure            | `--sidebar` / `--sidebar-foreground` / `--sidebar-border` |
| Cartes et tableaux : fond / bordure / texte | `--card` / `--border` / `--card-foreground`               |
| Graphiques (traits, axes, légendes)         | `--foreground` avec opacité                               |
| Accent et focus                             | `--accent` / `--ring`                                     |

### 3.3 Mode sombre (optionnel)

| Élément                                     | Token                                                     |
| ------------------------------------------- | --------------------------------------------------------- |
| Sidebar : fond / texte / bordure            | `--sidebar` / `--sidebar-foreground` / `--sidebar-border` |
| Cartes et tableaux : fond / bordure / texte | `--card` / `--border` / `--card-foreground`               |
| Graphiques (traits, axes, légendes)         | `--foreground` avec opacité                               |
| Accent et focus                             | `--accent` / `--ring`                                     |

Les valeurs exactes des tokens sont dans `client/src/index.css`.

### 3.4 États et composants

- Focus clavier : anneau de 2 px dans `--foreground`, avec décalage.
- Survol : `--accent` / `--accent-foreground` ou bordure `--border`.
- Bouton principal : `--primary` + `--primary-foreground` ; secondaire : contour `--border` ; désactivé : opacité 50 %.
- Champs de formulaire : fond `--background` ou `--card`, bordure `--input`.

### 3.5 Graphiques et statuts sans couleur supplémentaire

- Séries distinguées par style de trait (plein, tirets, pointillés), marqueurs (cercle, carré, triangle), épaisseur, et pour aires/barres par opacité (100 %, 60 %, 30 %) ou hachures SVG. Légende avec le motif.
- Grilles : couleur du texte à 20 % d'opacité.
- Statuts (`StatusRing`, `KpiCard`, `EngineHealthPanel`, `AlertFeed`) : libellé + icône, jamais la couleur seule.

### 3.6 Thèmes

- Thème de couleurs : sélecteur dans **Paramètres**, persisté dans `localStorage` (`color-theme`), `.theme-5` par défaut.
- Mode clair/sombre : bascule dans la **topbar**, persisté dans `localStorage` (`theme`) ; sans choix, `prefers-color-scheme`.
- Les deux classes (`theme-X` et `dark`) sont appliquées sur `<html>`.
- Adapter le `ThemeContext.tsx` existant (pas de second contexte) et ajouter un `ThemeToggle` accessible.
- Classe `dark` appliquée avant le premier rendu (script dans `client/index.html`) pour éviter le flash.
- Tailwind 4 : `@custom-variant dark (&:where(.dark, .dark *));` et variables CSS dans `client/src/index.css` (`@theme`, `:root`, `.dark`) ; variables shadcn (`--background`, `--card`, `--sidebar`...) pointées vers ces valeurs.

## 4. Portée

Toutes les pages : dashboard, sidebar, cartes et tableaux présents dans les pages (mêmes règles que les cartes), formulaires, accueil, pages d'erreur.

## 5. Logs

### 5.1 Vues concernées

`NetworkLogs`, `LogsManagement`, `ThreatIntel`, plus toute autre vue de logs repérée à l'audit (à valider dans `PLAN.md`).

### 5.2 Choix d'affichage (deux options)

- Sélecteur accessible (boutons radio) au-dessus de chaque tableau de logs, identique partout.
- Option A « Par défaut » : lignes sans coloration (charte standard).
- Option B « Coloration par sévérité » : toute la ligne colorée selon sa sévérité.
- Choix en `localStorage` (clé `logs-display`, valeurs `default` | `severity`), défaut = `default`.

### 5.3 Coloration par sévérité (seule tolérance de couleur)

- Niveaux : Critique, Info / Warning, Normal. Libellé en toutes lettres + icône dans une colonne, jamais la couleur seule.
- Toute la ligne est colorée ; la couleur du texte est choisie par ligne (contraste ≥ 4,5:1) :

| Sévérité       | Fond clair | Texte clair | Fond sombre | Texte sombre |
| -------------- | ---------- | ----------- | ----------- | ------------ |
| Critique       | `#b02323`  | `#FFFFFF`   | `#3B0D0D`   | `#E0E0E0`    |
| Info / Warning | `#fcd6cc`  | `#222526`   | `#ebc1ae`   | `#000000`    |
| Normal         | `#ccebd2`  | `#222526`   | `#8fcc9b`   | `#000000`    |

- Si une donnée contient un autre niveau, demander avant d'inventer une teinte.

### 5.4 Lignes dépliables

- Chaque ligne est un élément interactif natif (lien ou bouton, pas un `div` cliquable), atteignable au clavier (Tab).
- Clic, Entrée ou Espace : déplie/replie un panneau de détail sous la ligne (`aria-expanded`, `aria-controls`). Échap referme. Animation désactivée si `prefers-reduced-motion`.
- Le panneau affiche toutes les informations de l'alerte disponibles (horodatage, source, destination, protocole, sévérité, message, etc.), sans nouvelle requête si les données sont déjà chargées.
- Ancre stable `#log-<id>` : ouvrir la page avec cette ancre déplie la ligne et la fait défiler dans la vue. Plusieurs lignes peuvent rester ouvertes.

## 6. Workflow

1. **Analyse** : parcourir `client/`, repérer pages, layouts, composants, `index.css`, `ThemeContext.tsx`, usage des couleurs, vues de logs.
2. **Audit** : lister les écarts avec la charte (`bash scripts/audit-couleurs.sh`).
3. **Plan** : écrire `PLAN.md`, attendre ma validation.
4. **Refonte** dans l'ordre : variables et thème, sidebar, cartes et tableaux, graphiques, logs, puis les pages une par une.
5. **Vérification** : `pnpm check`, `pnpm build`, `pnpm format` ; test des deux modes sur toutes les pages ; persistance après rechargement ; test clavier des logs (Tab, Entrée, Espace, Échap) ; recherche de couleurs résiduelles ; contrastes ≥ 4,5:1. Pas de script lint : n'en créer aucun.

## 7. Contraintes techniques

Pas de dépendance lourde sans justification ; code typé et lisible ; routing `wouter` conservé ; shadcn adapté via les variables.

## 8. Livrable final

Liste des fichiers créés/modifiés, récapitulatif par page (`livrables/RECAP.md`), commande pour lancer et vérifier : `pnpm dev` (puis `pnpm build && pnpm preview` pour tester le build).
