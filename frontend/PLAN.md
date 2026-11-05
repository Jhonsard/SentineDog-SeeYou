# PLAN.md : refonte SentineDog-SeeYou

Statut : **PHASES 1 À 7 TERMINÉES** (Phases 6 et 7 encore en attente de validation utilisateur). **PHASE 10 : ÉTAPES 1 À 7 FAITES ; 8 ET 9 REPRISES PAR LA PHASE 11**. **PHASE 11 : ÉTAPES 1 À 9 FAITES ET VALIDÉE LE 2026-11-04 (SHELL, VUE D'ENSEMBLE, RÉSEAU/TERMINAUX, ALERTES, LISTE NOIRE, RAPPORTS + PDF RÉEL, FUSIONS JOURNAUX + ACTIFS/NŒUDS, RESPONSIVE, VÉRIFICATION).** **THÈME SHADCN NEUTRE (OKLCH) APPLIQUÉ LE 2026-11-05.** TESTS VISUELS MANUELS (760/1100, CLAVIER, CAPTURES) À CONFIRMER PAR L'UTILISATEUR. `bash scripts/verif.sh` passe intégralement.

**Décision thème (2026-11-05)** : le thème shadcn neutre fourni par l'utilisateur remplace la charte 5 couleurs. Les tokens `oklch` de `client/src/index.css` (`:root` / `.dark`) sont la source de vérité. `scripts/audit-couleurs.sh` (section 5) autorise les déclarations de tokens ; `AGENTS.md`, `.claude/rules/palette-couleurs.md`, `contexte/charte-graphique.md` et `SPEC.md` sont alignés. Le PDF reprend la palette claire du thème.
Cocher chaque case une fois la phase terminée ET validée.

Résultat de `bash scripts/audit-couleurs.sh` : **RÉSULTAT : écarts à corriger**.

- §1 hex hors charte : `index.css`, `TrafficAttackChart`, `ui/chart`, `BannedHosts` (composant), `SidebarLayout`, `ManusDialog`, `Sparkline`, `NetworkTrafficView`, `StatusRing` (~130 occurrences).
- §2 teintes de sévérité hors logs : OK — mais parce qu'**aucune teinte de sévérité n'est utilisée nulle part**, pas parce qu'elles sont bien appliquées.
- §3 classes Tailwind de palette : ~430 occurrences sur 13 fichiers.
- §4 `oklch/hsl/rgb` hors `index.css` : `TrafficAttackChart:175,181`, `ui/sidebar:490`, `ManusDialog:54,57`, `NetworkTrafficView:110,111`, `StatusRing:30`.
- §5 `oklch/hsl/rgb` dans `index.css` : lignes 265, 273, 274, 281.

---

## Décisions bloquantes à valider avant toute refonte

| #   | Sujet                                              | Constat réel                                                                                                                                                                                                                | Proposition                                                                                                                                                                                                                          |
| --- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | **Sévérités : 4 valeurs backend → 3 niveaux SPEC** | `types.ts:11` : `"normal" \| "warning" \| "critique" \| "tres_critique"`. Des valeurs `critical`, `high`, `medium`, `low`, `info`, `moyen` apparaissent aussi dans le front (`LogsManagement`, `ThreatIntel`, `AlertFeed`). | **VALIDÉ** : mapper `critique` + `tres_critique` → **Critique**, `warning` (et `moyen`/`medium`) → **Info / Warning**, `normal` (et `low`/`info`) → **Normal**.                                                                      |
| D2  | **Périmètre exact des vues de logs**               | La SPEC cite NetworkLogs, LogsManagement, ThreatIntel. L'audit ajoute `AlertFeed` (vraie table d'alertes avec sévérité). `AlertField` est un doublon mort.                                                                  | **VALIDÉ** : retenir **4 vues** : NetworkLogs, LogsManagement, ThreatIntel, AlertFeed. Supprimer `AlertField`.                                                                                                                       |
| D3  | **`NetworkLogs` n'affiche pas la sévérité**        | `NetworkLogs.tsx:41-46` convertit la sévérité en `action` (`allowed`/`blocked`/`dropped`) et la perd.                                                                                                                       | Ajouter une colonne **Sévérité** (libellé + icône) et conserver **Action** comme statut distinct.                                                                                                                                    |
| D4  | **Composants morts contenant des écarts**          | Jamais importés : `AlertField.tsx`, `Map.tsx`, `ManusDialog.tsx`, `ui/sidebar.tsx`, `ui/chart.tsx`, `pages/BannedHosts.tsx`.                                                                                                | **VALIDÉ puis RÉVISÉ** : les 6 fichiers sont finalement supprimés (`AlertField`, `Map`, `ManusDialog`, `pages/BannedHosts`, `ui/sidebar`, `ui/chart`) pour que `scripts/verif.sh` passe au vert. Aucun import, aucun impact runtime. |
| D5  | **Doublon `BannedHosts`**                          | `components/BannedHosts.tsx` est utilisé (onglet blacklist) ; `pages/BannedHosts.tsx` n'est jamais importé.                                                                                                                 | **VALIDÉ** : garder `components/BannedHosts.tsx`, supprimer `pages/BannedHosts.tsx`.                                                                                                                                                 |
| D6  | **Bug runtime `BannedHosts`**                      | `components/BannedHosts.tsx:21` teste `response.ok` alors que la variable est `res` → `ReferenceError` au chargement de la liste.                                                                                           | Corriger en `res.ok` (correction de bug, pas de changement d'API).                                                                                                                                                                   |

---

## Vues de logs retenues (à valider)

| Vue                | Fichier                                                  | Route / accès                                  | Sévérité aujourd'hui                               | Rendu                                  |
| ------------------ | -------------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------- | -------------------------------------- |
| Network Logs       | `client/src/pages/NetworkLogs.tsx`                       | onglet `network-logs` (pas de route)           | Non affichée, convertie en `action`                | Table shadcn                           |
| Logs Management    | `client/src/pages/LogsManagement.tsx`                    | route `/logs` (protégée), pas d'entrée de menu | Oui, badge coloré, `severity?: string` non typé    | Table shadcn                           |
| Threat Intel       | `client/src/pages/ThreatIntel.tsx`                       | onglet `threat-intel`                          | Oui, `Critical/High/Medium/Low` traduits           | Table shadcn                           |
| Alert Feed         | `client/src/components/AlertFeed.tsx`                    | dashboard overview                             | Oui, 4 niveaux + violet « très critique » + emojis | Table shadcn                           |
| ~~Alert Field~~    | `client/src/components/AlertField.tsx`                   | **jamais importé**                             | Type concurrent `critical/warning/info`            | Mort → suppression proposée            |
| Registre blacklist | `client/src/components/BannedHosts.tsx`                  | onglet `blacklist`                             | Non                                                | Table shadcn — **pas** une vue de logs |
| Top Conversations  | `client/src/components/dashboard/NetworkTrafficView.tsx` | dashboard network                              | Non (champ `risk` jamais alimenté)                 | Table brute — **pas** une vue de logs  |

Aucun hook `useLogsDisplay`, aucune clé `logs-display`, aucun sélecteur, aucune ligne dépliable ni ancre `#log-<id>` n'existent actuellement.

---

## Inventaire des pages et accès réels

- Routes réelles (`App.tsx:20-38`) : `/welcome`, `/login`, `/logs` (protégée), `/nodes` (protégée), `/` (protégée), `/404` + fallback.
- `NetworkLogs`, `ThreatIntel`, `Assets`, `UserProfile`, `Settings`, `BannedHosts` sont des **onglets** rendus par `SidebarLayout`, pas des routes.
- Sous-vues dashboard : `overview` (`MetricCardsGrid`, `TrafficAttackChart`, `EngineHealthPanel`, `AlertFeed`), `network` (`NetworkTrafficView`), `endpoint` (`EndpointSecurityView`) — `SidebarLayout.tsx:644-669`.

---

## Phase 0 : Analyse (lecture seule) — TERMINÉE

- [x] Parcourir `client/src`, lister pages, layouts, composants
- [x] Lire `index.css`, `ThemeContext.tsx`, `SidebarLayout.tsx`, `components/ui/sidebar.tsx`, `components/types.ts`, `App.tsx`, `client/index.html`
- [x] Repérer toutes les vues de logs (4 retenues + 3 écartées, voir tableau)
- [x] Repérer les bibliothèques de graphiques : **recharts 2.15.4** (`TrafficAttackChart`, `NetworkTrafficView`) ; SVG maison (`Sparkline`, `StatusRing`) ; `ui/chart.tsx` mort.

## Phase 1 : Audit — TERMINÉE

- [x] Lancer `bash scripts/audit-couleurs.sh` et noter les écarts par fichier
- [x] Vérifier le format des niveaux de sévérité : **4 valeurs** `normal | warning | critique | tres_critique` (`types.ts:11`)
- [x] Mettre à jour ce plan avec les écarts réels
- [x] **Validation utilisateur : D1 et D2 validées le 2026-11-03**

## Phase 1 bis : Préalables bloquants (avant toute couleur)

- [x] Fusionner les deux `export function NetworkTrafficView()` (`NetworkTrafficView.tsx:28` et `:63`) — le premier portait l'état et le fetch, le second le JSX : fusion, pas suppression
- [x] Corriger `response` → `res` dans `components/BannedHosts.tsx:21` **et** `:22` (deux occurrences)
- [x] Corriger le `</TableRow>` manquant dans `pages/ThreatIntel.tsx` (branche `map` du nouveau ternaire, modification non commitée) — bloquait `pnpm check`
- [x] Vérifier que `pnpm check` passe — **OK le 2026-11-03**
- [x] Trancher D4/D5 : suppression de `AlertField.tsx`, `Map.tsx`, `ManusDialog.tsx`, `pages/BannedHosts.tsx` ; `ui/sidebar.tsx` et `ui/chart.tsx` conservés ; `pnpm check` OK après suppression
- [x] **Validation utilisateur de la Phase 1 bis — validée le 2026-11-03**

## Phase 2 : Variables et thème — TERMINÉE (à valider)

- [x] Réécrire `index.css` : `:root` clair et `.dark` sombre **séparés**, 5 couleurs uniquement
- [x] Tous les anciens tokens (`--void`, `--surface-*`, `--critical*`, `--warning*`, `--secure*`, `--info*`, `--sg-*`, `--edge*`) sont **convertis en alias** vers les 5 couleurs. Suppression définitive au fur et à mesure des phases 3 à 7 (sinon les composants non encore migrés perdent leurs couleurs).
- [x] Hex scrollbar, dégradés et `rgba()` de `index.css` supprimés ; `.glass` et `.hairline` (inutilisés) supprimés ; `.grid-bg` repose sur `color-mix` avec `--border`
- [x] `@custom-variant dark (&:where(.dark, .dark *));`
- [x] Variables shadcn remappées (`--background`, `--foreground`, `--card`, `--border`, `--ring`, `--sidebar*`…) sans réécrire les composants
- [x] Script anti-flash dans `client/index.html`
- [x] `ThemeContext.tsx` : clé `theme`, fallback `prefers-color-scheme`, persistance du choix explicite uniquement, écoute des changements système
- [x] `App.tsx` : `defaultTheme="dark"` retiré, bascule active
- [x] `ThemeToggle` accessible créé (`components/ThemeToggle.tsx`) et placé dans la topbar de `SidebarLayout`
- [x] `ui/sonner.tsx` raccordé au `ThemeContext` maison (plus de `next-themes`)
- [x] `pnpm check` OK, `pnpm build` OK, section 5 du script d'audit : OK
- [x] **Validation utilisateur de la Phase 2 — validée le 2026-11-03**

Note : la sidebar blanche en mode clair signalée en Phase 2 est corrigée en Phase 3 (`bg-sidebar` : `#E0E0E0` clair / `#353A3E` sombre).

## Phase 3 : Sidebar — TERMINÉE (à valider)

- [x] Couleurs clair/sombre selon SPEC §3.2-3.3 : `bg-sidebar` (#E0E0E0 / #353A3E), texte `sidebar-foreground` (#222526 / #E0E0E0), bordures `sidebar-border`
- [x] Accents par onglet supprimés (`#f97316`, `#3b82f6`, `#06b6d4`, `#10b981`, `#a855f7`) : remplacés par une barre verticale de 3 px + texte en gras, fond inchangé
- [x] `#282d37`, `#93000a`, `purple-400`, `zinc-*`, `text-white` supprimés (`SidebarLayout` ne contient plus aucun hex ni classe de palette)
- [x] Boutons : principal `bg-primary text-primary-foreground`, secondaire en contour, désactivé à 50 %
- [x] Focus visible global de 2 px dans la couleur du texte (posé en Phase 2, vérifié ici)
- [x] Animations `animate-pulse` avec `motion-reduce:animate-none`
- [x] `pnpm check` OK, `pnpm build` OK
- [x] **Validation utilisateur de la Phase 3 — validée le 2026-11-03**

## Phase 4 : Cartes, tableaux, formulaires — TERMINÉE (à valider)

- [x] Primitives shadcn utilisées : aucune classe de palette ni hex (seul `ui/chart.tsx`, mort et conservé, en contient)
- [x] Variables ajustées : `--input` aligné sur la couleur de bordure (`#222526` clair / `#E0E0E0` sombre), `--secondary` visible (`#E0E0E0` clair)
- [x] Champs `input`, `textarea`, `select-trigger` : fond `var(--card)`, donc `#FFFFFF` / `#000000` (SPEC §3.4)
- [x] Ombres aplaties globalement : `--shadow-*` redéfinis à `none` ; vérifié dans le CSS produit (`shadow-sm`, `shadow-xs`, `shadow-md`, `shadow-2xl` → `none`)
- [x] Effets vitrés retirés de `SidebarLayout` (`backdrop-blur-sm`)
- [x] Cartes et tableaux : fonds, bordures et textes déjà pilotés par `--card`, `--border`, `--muted`
- [x] Focus clavier : anneau de 2 px dans la couleur du texte conservé
- [x] `pnpm check` OK, `pnpm build` OK
- [x] **Validation utilisateur de la Phase 4 — validée le 2026-11-03**

Note : les pages listées dans la version précédente de cette phase sont traitées en **Phase 7**, une par une, pour ne pas faire deux fois le même travail. La Phase 4 couvre les primitives partagées.

## Phase 5 : Graphiques et statuts — TERMINÉE (à valider)

- [x] `TrafficAttackChart` : Normal en trait plein, Threat en tirets `6 3` + hachures SVG ; légende et infobulle avec la motif du trait, plus aucune couleur de série
- [x] `NetworkTrafficView` : Inbound plein, Outbound tirets + hachures ; légende ajoutée dans l'en-tête du widget
- [x] `Sparkline` : `#4d8eff` supprimé, dégradé remplacé par une aire plate à 12 % d'opacité, animation `animate` supprimée, défaut `var(--foreground)`
- [x] `StatusRing` : `#22c55e`, gradient, halo `feGaussianBlur` et textes en dur supprimés ; piste `var(--muted)`, tracé `var(--foreground)`, aucune animation
- [x] Axes, grilles et curseurs : `var(--foreground)` à 20–40 % d'opacité ; `#6b7280` et `rgba(66,71,84,…)` supprimés des graphiques
- [x] `KpiCard`, `Widget`, `EngineHealthPanel`, `EndpointSecurityView`, `MetricCardsGrid` : accents monochromes, statuts avec libellé + icône (ShieldCheck / ShieldAlert / ShieldX), barres à `var(--foreground)`
- [x] Animations restantes avec `motion-reduce`
- [x] Aucun hex ni token métier dans les fichiers de la phase ; section 4 du script ne signale plus que `ui/sidebar.tsx` (mort, conservé)
- [x] `pnpm check` OK, `pnpm build` OK
- [x] **Validation utilisateur de la Phase 5 — validée le 2026-11-03**

Note : `AlertFeed` garde ses couleurs de sévérité jusqu'à la **Phase 6** ; ses statuts affichent déjà un libellé, et la refonte des lignes colorées y remplacera les badges actuels.

## Phase 6 : Logs — TERMINÉE (à valider)

- [x] Socle commun : `lib/logs.ts` (mapping 4→3, libellés, classes de ligne), `hooks/useLogsDisplay.ts` (clé `logs-display`, `default` | `severity`), `hooks/useExpandableLogs.ts` (état ouvert + ancre)
- [x] Composants partagés : `LogsDisplayToggle` (radios natifs accessibles), `SeverityBadge` (libellé + icône), `LogDetailGrid` (détails sans requête)
- [x] Mapping validé D1 : `critique`/`tres_critique`/`critical`/`high` → Critique ; `warning`/`moyen`/`medium` → Info / Warning ; `normal`/`low`/`info` → Normal ; valeur inconnue → « Non classé », sans teinte inventée
- [x] Coloration de toute la ligne en mode `severity`, texte adapté par ligne (contraste ≥ 4,5:1) ; aucune couleur de ligne en mode `default`
- [x] Chaque ligne : bouton natif, `aria-expanded`, `aria-controls`, Entrée/Espace, Échap referme, `prefers-reduced-motion` respecté ; plusieurs lignes ouvertes
- [x] Ancre stable `#log-<id>` : déplie et fait défiler la ligne une fois les données chargées
- [x] Appliqué aux **4 vues** : `NetworkLogs` (colonne Sévérité ajoutée, D3), `LogsManagement`, `ThreatIntel`, `AlertFeed`
- [x] Habillage des 3 pages de logs (NetworkLogs, LogsManagement, ThreatIntel) basculé sur la charte : plus aucune classe de palette ni `text-white`
- [x] Mapping centralisé ; le type `Alert` de `components/types.ts` reste le contrat backend (4 valeurs) et n'est pas modifié. `AlertField` (type concurrent) supprimé en Phase 1 bis.
- [x] `pnpm check` OK, `pnpm build` OK ; section 2 de l'audit : teintes de sévérité présentes uniquement dans `lib/logs.ts`
- [ ] **Validation utilisateur**

## Phase 7 : Pages — TERMINÉE (à valider)

- [x] Assets — classes de palette supprimées, statut et criticité en libellé + icône
- [x] BannedHosts (composant `components/BannedHosts.tsx`) — 27 hex remplacés par les tokens de la charte
- [x] Login — vérifié : déjà sur les tokens `sg-*` / shadcn, aucune couleur hors charte
- [x] LogsManagement — traité en Phase 6
- [x] NetworkLogs — traité en Phase 6
- [x] NodesManagement — 51 occurrences supprimées, statut en libellé + icône
- [x] NotFound — réécriture plate : plus de dégradé, de `shadow-lg`, de `backdrop-blur`, ni de couleurs de palette
- [x] Settings — 120 occurrences supprimées, check/build OK
- [x] ThreatIntel — traité en Phase 6
- [x] UserProfile — 47 occurrences supprimées, dégradé d'avatar remplacé par `bg-foreground`
- [x] WelcomeAuth — erreurs en libellé + icône + bordure pointillée, plus de `red-500` / `emerald-500`
- [ ] **Validation finale de la Phase 7**

Résultat de `bash scripts/verif.sh` : **VÉRIFICATION : OK** — audit des couleurs « charte respectée », `pnpm check` OK, `pnpm build` OK. Les fichiers morts `ui/chart.tsx` et `ui/sidebar.tsx` ont été supprimés (décision D4 révisée).

## Phase 8 : Vérification

- [ ] `bash scripts/verif.sh` (couleurs + `pnpm check` + `pnpm build`)
- [ ] `pnpm format`
- [ ] Test visuel des deux modes sur toutes les pages
- [ ] Persistance du thème et du choix d'affichage des logs après rechargement
- [ ] Test clavier des lignes de logs (Tab, Entrée, Espace, Échap)
- [ ] Contrastes ≥ 4,5:1
- [ ] Contrôles manuels non couverts par le script : tokens métier (`--info`, `--critical`, `--sg-*`), dégradés recharts, `currentColor` détourné
- [ ] **Validation utilisateur**

## Phase 9 : Livrable

- [ ] Remplir `livrables/RECAP.md`

---

## Phase 10 : Portage de la maquette Figma Make — Shell + Vue d'ensemble

Statut : **EN COURS — PÉRIMÈTRE ET DÉCISIONS VALIDÉS LE 2026-11-03**. Choix utilisateur : **Phase 10 telle quelle** (shell + vue d'ensemble uniquement), Alertes/Réseau/Liste noire/Journaux de la maquette non portés.

Source de référence (lecture seule) : `frontend/SeeYou — Dashboard SOC/`, export **Figma Make** (React 19 + Vite + Tailwind 4, `App.tsx` 3 144 lignes + `index.css` 2 941 lignes). Ne jamais exécuter ses scripts (`dev`, `install`, `deploy`), ne jamais copier ces fichiers tels quels : la maquette est une cible visuelle, le projet reste maître de son architecture. Le dossier est **non suivi et non ignoré par git** : ne jamais le committer.

Périmètre validé le 2026-11-03 :

- shell complet : sidebar, topbar, drawer mobile, thème ;
- vue d'ensemble ;
- logs existants (`NetworkLogs`, `LogsManagement`, `ThreatIntel`, `AlertFeed`) conservés en l'état ;
- la page « Rapports » de la maquette sera ajoutée dans une phase séparée ;
- les pages non maquettées (Assets, Settings, Profile, Nodes, Login, Welcome, 404) ne changent pas.

### Correspondance maquette → projet

| Élément maquette         | Source         | Cible projet                                                                               |
| ------------------------ | -------------- | ------------------------------------------------------------------------------------------ |
| `App` (shell)            | `App.tsx:2660` | `components/SidebarLayout.tsx` (conserver état, WS, auth, onglets)                         |
| `Panel`                  | `App.tsx:139`  | nouveau `components/dashboard/Panel.tsx`                                                   |
| `KpiCard`                | `App.tsx:151`  | `components/dashboard/KpiCard.tsx` (même contrat de props)                                 |
| Grille KPI               | `.kpi-grid`    | `components/MetricCardsGrid.tsx`                                                           |
| « Activité des menaces » | SVG statique   | `components/TrafficAttackChart.tsx` (recharts + WS conservés, habillage maquette)          |
| « Moteur IPS »           | `App.tsx:2957` | `components/dashboard/EngineHealthPanel.tsx` + `StatusRing`                                |
| « Alertes récentes »     | table compacte | nouveau `components/dashboard/RecentAlertsPanel.tsx` (données réelles, `AlertFeed` intact) |
| « Agent IA »             | `App.tsx:3086` | nouveau `components/dashboard/AIPanel.tsx` (branché sur `AIContext`)                       |
| Icônes SVG inline        | `App.tsx:11`   | `lucide-react` (déjà installé, aucune dépendance ajoutée)                                  |
| Classes CSS custom       | `index.css`    | utilitaires Tailwind + tokens ; aucune copie des 402 classes                               |

Dimensions relevées : sidebar `248px`, topbar `74px`, contenu `max-w-[1500px]`, padding `28px 30px`, gaps `12px`, rayon `4px`, KPI valeur `29px`, titre de page `18px`, eyebrow `10px`.

### Décisions à valider avant de coder

| #   | Sujet                                          | Constat                                                                                                                                     | Proposition                                                                                                                                                                                                                                                              |
| --- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D7  | État actif de la navigation                    | La maquette utilise une pastille pleine (`bg-foreground text-background`). La SPEC §3.2 impose fond inchangé + barre verticale 3 px + gras. | **VALIDÉ (2026-11-03) : pastille de la maquette**, puis amender SPEC §3.2 (amendement restant à faire).                                                                                                                                                                  |
| D8  | Contrôles fonctionnels absents de la maquette  | La maquette ne montre ni Start/Stop Sniffer, ni bascule Agent IA, ni rafraîchissement, ni PPS/charge.                                       | **VALIDÉ (2026-11-03) :** topbar = titre, sous-titre, statut système, avatar ; thème dans Paramètres (déplacé le 2026-11-04) ; Start/Stop + PPS/charge dans le panneau IPS ; bascule IA dans le panneau Agent IA ; rafraîchissement dans l'en-tête de la vue d'ensemble. |
| D9  | Entrée « Alertes » de la navigation            | La maquette a une `AlertsPage` complète, pas encore portée.                                                                                 | **VALIDÉ (2026-11-03) :** entrée masquée jusqu'à la phase Alertes (évite un lien mort).                                                                                                                                                                                  |
| D10 | Sélecteur de période (1 h / 24 h / 7 j / 30 j) | La maquette est statique ; l'API `STATS_HISTORY` n'accepte qu'un `limit`, pas de plage temporelle.                                          | **VALIDÉ (2026-11-03) :** l'omettre dans cette phase, l'ajouter quand le backend exposera une plage.                                                                                                                                                                     |
| D11 | Logo de marque                                 | Maquette : carré 38 px plein + icône bouclier + « SeeYou / SENTINEDOG SOC ». Projet : `Seeyou.webp`.                                        | **VALIDÉ (2026-11-03) :** conserver `Seeyou.webp` dans le carré 38 px (reconnaissance visuelle), texte sur deux lignes.                                                                                                                                                  |

### Données réelles uniquement (aucune valeur inventée)

| Carte maquette       | Source réelle                                                                                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Alertes détectées    | `stats.total_alerts`                                                                                                                                                           |
| Menaces bloquées     | `stats.blocked_hosts`                                                                                                                                                          |
| Incidents ouverts    | `stats.active_critical`                                                                                                                                                        |
| Capteurs actifs      | `wsConnected ? "Flux actif" : "Inactif"` (le projet n'a pas de compteur de capteurs)                                                                                           |
| Activité des menaces | série `attack_count` / `normal_count` de `TrafficAttackChart`                                                                                                                  |
| Efficacité IPS       | `health` (valeur `94` actuellement passée par `SidebarLayout` — à conserver telle quelle, pas d'invention)                                                                     |
| Stats IPS            | `stats.pps`, `stats.network_load`, `stats.checksum_errors` (remplacent « paquets analysés / règles / disponibilité », absents du backend)                                      |
| Alertes récentes     | tableau `alerts` déjà chargé (8 premières après recherche locale)                                                                                                              |
| Agent IA             | `status.model_version`, `is_trained`, `total_decisions`, `fallback_count`, `ai_mode_enabled` ; la confiance moyenne et le dernier entraînement n'existent pas → afficher « — » |

### Fichiers prévus

Créés :

- `client/src/components/dashboard/Panel.tsx`
- `client/src/components/dashboard/RecentAlertsPanel.tsx`
- `client/src/components/dashboard/AIPanel.tsx`

Modifiés :

- `client/src/components/SidebarLayout.tsx` (habillage uniquement ; logique WS/auth/onglets/ban intacte)
- `client/src/components/MetricCardsGrid.tsx`
- `client/src/components/dashboard/KpiCard.tsx`
- `client/src/components/dashboard/EngineHealthPanel.tsx`
- `client/src/components/dashboard/StatusRing.tsx` (props pour l'anneau 150 px, bouchons carrés)
- `client/src/components/TrafficAttackChart.tsx` (habillage, données et WS conservés)

Non modifiés : `client/src/index.css` (sauf besoin ponctuel justifié), `ui/*`, pages, contextes, `config.ts`, `server/`, `shared/`, `patches/`, `vercel.json`, `pnpm-lock.yaml`, `dist/`.

### Étapes

- [x] 1. `dashboard/Panel.tsx` créé ; `KpiCard` adapté au contrat visuel de la maquette.
- [ ] 2. Shell : sidebar **248 px** (marque, groupes, pastille active D7, carte utilisateur), topbar **74 px** (titre, sous-titre, statut, thème, avatar) + drawer mobile. _Actuel : sidebar 256 px et topbar de l'ancienne refonte, non conformes._
- [ ] 3. Vue d'ensemble : en-tête (eyebrow, titre, synchronisation) ; grille KPI (`MetricCardsGrid` prête, encore appelée sans `wsConnected`).
- [x] 4. Panneau « Activité des menaces » habillé façon maquette, données réelles et WebSocket conservés.
- [x] 5. Panneau « Moteur IPS » : anneau 150 px, bouchons carrés et métriques réelles en place. `isMonitoring`, `onStart`, `onStop` passés depuis `SidebarLayout` ; Start/Stop + PPS/charge retirés de la topbar (D8). Vérifié le 2026-11-03.
- [x] 6. `RecentAlertsPanel` raccordé dans la vue d'ensemble (recherche locale, détail dépliable accessible, « Toutes les alertes » → onglet Network Logs). `AlertFeed` reste rendu intact sous la grille basse pour conserver filtres, choix d'affichage et action de ban. Vérifié le 2026-11-03.
- [x] 7. `AIPanel` placé dans la vue d'ensemble ; bascule et rechargement du modèle passent par `AIContext`. Ancienne bascule IA de la topbar retirée. Vérifié le 2026-11-03.
- [ ] 8. Responsive (1100 px / 760 px), clavier, `prefers-reduced-motion`, thème clair/sombre.
- [ ] 9. `pnpm check`, `pnpm build`, `bash scripts/verif.sh`, captures clair/sombre.

**État réel au 2026-11-03 :** les étapes 1, 4, 5, 6 et 7 sont faites. `bash scripts/verif.sh` est **OK** (charte respectée, `pnpm check` OK, `pnpm build` OK). Restent le shell (étape 2), l'en-tête de la vue d'ensemble (étape 3), le responsive/accessibilité (étape 8) et les captures (étape 9). Aucune modification n'est encore commitée.

### Critères d'acceptation

- [ ] Aucune couleur hors des 5 autorisées ; aucun hex dans les composants.
- [ ] Aucune dépendance ajoutée.
- [ ] Toutes les fonctions existantes conservées : login/logout, WS, bascule IA, Start/Stop, rafraîchissement, modal de ban, navigation par onglets.
- [ ] Aucun changement d'API, de route, de type partagé ni de variable d'environnement.
- [ ] Données réelles uniquement ; les champs absents affichent « — ».
- [ ] Deux modes visuels cohérents, focus clavier visible, drawer mobile utilisable.
- [ ] `pnpm check` OK, `pnpm build` OK, `bash scripts/verif.sh` OK.
- [ ] **Validation utilisateur avant toute modification de code.**

---

## Phase 11 : Portage complet de la maquette, routes nouvelles et responsive

Statut : **PLAN PROPOSÉ LE 2026-11-04 — EN ATTENTE DE VALIDATION**. Aucun code écrit tant que ce plan n'est pas validé.

### Cadrage validé par l'utilisateur (2026-11-04)

- Terminer la **Phase 10** (shell + vue d'ensemble), puis porter **toutes** les pages utiles de la maquette : Alertes, Réseau, Journaux/Bilans, Liste noire.
- La **sidebar de la maquette** remplace l'actuelle (plus cohérente) : 248 px, groupes SURVEILLANCE / PROTECTION, pastille active, carte utilisateur.
- Le sous-menu `overview / network / endpoint` est **fusionné dans la navigation** : « Réseau » ouvre `NetworkTrafficView` ; `EndpointSecurityView` devient une entrée « Terminaux ».
- **Nouvelles routes protégées** : `/alerts` et `/reports`. Les routes existantes `/welcome`, `/login`, `/logs`, `/nodes`, `/`, `/404` restent **inchangées**.
- **Responsive** sur tout le site (paliers 1100 px / 760 px).
- Les **filtres** des pages maquette sont adaptés aux données réelles, jamais aux tableaux statiques de la maquette.
- **Clarification du 2026-11-04** : la maquette est la **référence visuelle** ; elle est adaptée aux routes existantes. Certaines pages existantes seront **fusionnées**, d'autres seulement habillées.
- **Fusions validées le 2026-11-04** : « Journaux » = `NetworkLogs` + `LogsManagement` (une page, deux sections) ; « Actifs » = `Assets` + `NodesManagement` (route `/nodes` conservée) ; « Réseau » et « Terminaux » restent **séparés**.

### Correspondance définitive maquette → projet

| Maquette            | Route / navigation                       | Source de données réelle                         |
| ------------------- | ---------------------------------------- | ------------------------------------------------ |
| Vue d'ensemble      | `/` onglet `dashboard`                   | `stats`, `history`, `alerts`, WebSocket          |
| Alertes             | `/alerts` (nouvelle route)               | `alerts` (historique 100 + WS)                   |
| Réseau              | nav « Réseau »                           | `NetworkTrafficView` (`STATS_HISTORY`) + `stats` |
| Journaux            | nav « Journaux » → onglet `network-logs` | `NetworkLogs` (`ALERTS.HISTORY`)                 |
| Rapports & bilans   | `/reports` (nouvelle route)              | `alerts` regroupées côté client                  |
| Liste noire         | nav « Liste noire » → onglet `blacklist` | `ALERTS.BANNED_HOSTS` + `UNBAN`                  |
| Threat intelligence | onglet `threat-intel`                    | `ThreatIntel` (contenu inchangé)                 |
| Actifs              | onglet `assets`                          | `Assets` (contenu inchangé)                      |
| Terminaux           | onglet `endpoint` (nouvelle entrée)      | `EndpointSecurityView`                           |
| Nœuds               | route `/nodes` + onglet `nodes`          | `NodesManagement` (contenu inchangé)             |
| Paramètres          | onglet `settings`                        | `Settings` (contenu inchangé)                    |
| Profil              | carte utilisateur en bas                 | `UserProfile` (contenu inchangé)                 |

### Décisions de mise en œuvre à valider

| #   | Sujet                       | Constat                                                                                                                                                               | Proposition                                                                                                                                                                                                                                                                                                                                                       |
| --- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D12 | « Journaux » de la maquette | La page `App.tsx:1388` s'appelle `LogsPage` mais c'est un **générateur de bilans** (« RAPPORTS & CONFORMITÉ »), pas une table de logs.                                | L'exposer en `/reports`. Conserver `NetworkLogs` et `ThreatIntel` ; **`LogsManagement` a été supprimé sur demande utilisateur le 2026-11-04**.                                                                                                                                                                                                                    |
| D13 | `EndpointSecurityView`      | Le sous-onglet disparaît avec la fusion.                                                                                                                              | Entrée « Terminaux » sous PROTECTION. Aucune vue perdue.                                                                                                                                                                                                                                                                                                          |
| D14 | Liste noire                 | Le backend renvoie `{id, source_ip, alert_type, timestamp_block, reason}` ; l'interface actuelle attend `{ip, banned_at, rule_index}` → champs `undefined` à l'écran. | Corriger l'interface et afficher les vrais champs. Brancher « Débloquer » sur `POST /alerts/{id}/unban` avec `{ip: source_ip}`. Retirer « Ajouter / Suspendre » (aucun endpoint backend).                                                                                                                                                                         |
| D15 | Alertes                     | La maquette simule 248 alertes, 3 pages et des statuts « À traiter / En analyse / Bloquée » absents du backend.                                                       | Utiliser les `alerts` réelles. Statut dérivé : `Bloquée` si `is_blocked`, `Validée` si `validated_by_admin`, sinon `À traiter`. Sévérité normalisée sur 3 niveaux (`lib/logs`). Pagination client 8/page. Actions disponibles : validation de blocage (`VALIDATE_BLOCK`) et export CSV des alertes filtrées. Pas de « Marquer en analyse » (aucun champ backend). |
| D16 | Rapports                    | Aucune API de rapports.                                                                                                                                               | Anomalies récurrentes calculées en regroupant `alerts` par `alert_type` (occurrences, source, sévérité, dernier vu). Bilans générés en mémoire ; export CSV/PDF côté client. Cartes sans donnée → « — ».                                                                                                                                                          |
| D17 | Réseau                      | La maquette affiche des Mb/s, connexions et pertes statiques.                                                                                                         | Utiliser `stats.pps`, `stats.network_load`, `stats.checksum_errors`, `stats.avg_events_min` et `history`. Aucune valeur inventée ; état vide explicite. Les flux/protocoles restent ceux dérivés de `STATS_HISTORY` dans `NetworkTrafficView`.                                                                                                                    |
| D18 | `/logs` et `/nodes`         | Ces routes rendent des pages autonomes sans shell.                                                                                                                    | Les rendre dans le shell (onglet initial) pour homogénéité, URL inchangée. Repli : garder autonome + habillage.                                                                                                                                                                                                                                                   |
| D19 | Navigation                  | La maquette n'a ni Nœuds ni Profil en entrée directe.                                                                                                                 | SURVEILLANCE : Vue d'ensemble, Alertes, Réseau, Journaux. PROTECTION : Liste noire, Threat intelligence, Actifs, Terminaux. ADMINISTRATION : Nœuds, Paramètres. Bas : carte utilisateur → Profil, accès déconnexion conservé.                                                                                                                                     |

### Fichiers prévus

Créés :

- `client/src/pages/Alerts.tsx`
- `client/src/pages/Reports.tsx`
- `client/src/pages/LogsHub.tsx` (fusion Journaux)
- `client/src/pages/AssetsHub.tsx` (fusion Actifs/Nœuds)
- `client/src/lib/reportPdf.ts` (PDF réel via `jsPDF` + `jspdf-autotable`)
- `client/src/components/dashboard/NetworkTrafficView.tsx` réécrit (page Réseau)
- `client/src/components/BannedHosts.tsx` réécrit (page Liste noire)

Modifiés :

- `client/src/App.tsx` (ajout de `/alerts` et `/reports` ; routes existantes inchangées)
- `client/src/components/SidebarLayout.tsx` (shell, navigation, raccord des pages)
- `client/src/components/dashboard/NetworkTrafficView.tsx`
- `client/src/components/BannedHosts.tsx`
- `client/src/components/AlertFeed.tsx` (uniquement si partage de filtres/statuts)
- pages existantes : responsive et habillage, sans toucher aux appels API

Non modifiés : `server/`, `shared/`, `patches/`, `vercel.json`, `dist/`, `.env*`, `config.ts` (aucun endpoint ajouté), `contexts/AuthContext.tsx`, `contexts/AIContext.tsx`, `components/types.ts` (contrat backend). `pnpm-lock.yaml` est mis à jour uniquement par `pnpm add` pour les deux dépendances PDF (aucune édition manuelle).

### Étapes (validation après chaque étape)

1. [x] **Shell** — sidebar 248 px de la maquette, topbar 74 px, drawer mobile, carte utilisateur, pastille active. Conserver WS / auth / Start-Stop / bascule IA / modal de ban. **Fait le 2026-11-04, en attente de validation.** La sidebar reste **repliable** : le bouton est placé **en haut, à côté de la marque** (demande utilisateur du 2026-11-04), **sans texte** — icône **X** quand elle est déployée, **menu hamburger** quand elle est repliée, **empilé sous le logo** dans ce cas. Repli à 68 px avec icônes seules et libellés `sr-only`. Le changement clair/sombre a été déplacé de la topbar vers **Paramètres** (carte « Apparence »). **Persistance d'apparence au rechargement** : `sidebar-open` (sidebar repliée/dépliée), `active-tab` (onglet actif hors routes), `theme` et `logs-display`. « Alertes » et « Rapports » restent masqués jusqu'aux étapes 4 et 6 ; « Nœuds » reste visible jusqu'à la fusion Actifs/Nœuds ; « Journaux » pointe encore sur `NetworkLogs` jusqu'à l'étape 7.
2. [x] **Vue d'ensemble** — **Fait le 2026-11-04, en attente de validation.** En-tête « SITUATION ACTUELLE / Bonjour, équipe SOC / dernière synchronisation + état du flux temps réel », bouton « Rafraîchir » déplacé de la topbar vers cet en-tête. Sélecteur de période omis (D10). Grille KPI et panneaux existants conservés.
3. [x] **Réseau / Terminaux** — **Fait le 2026-11-04, en attente de validation.** Page Réseau : en-tête « Observabilité réseau / Trafic réseau », 4 KPI réels (`network_load`, `pps`, `checksum_errors`, `avg_events_min`), graphique `STATS_HISTORY` (attaques / normal), répartition par protocole et principaux flux **dérivés des alertes réelles**, sévérité normalisée sans couleur. Page Terminaux : en-tête dédié, compteurs réels (en ligne / dégradés / isolés), taux de couverture calculé, libellés francisés. Les valeurs statiques `0` et `100` de l'ancienne vue Endpoint sont supprimées. Le volume en octets n'existe pas côté API : les flux affichent le **nombre d'événements**.
4. [x] **Alertes** — **Fait le 2026-11-04, en attente de validation.** Route protégée `/alerts` (le shell est rendu avec `initialTab="alerts"`), entrée « Alertes » dans la sidebar, URL synchronisée par `replaceState` sans remonter le shell (WebSocket et Start/Stop préservés). Filtres réels : recherche, sévérité normalisée (Critique / Info-Warning / Normal / Non classé), statut dérivé (`À traiter`, `Validée`, `Bloquée`). Cartes de synthèse sur données réelles, pagination client 8/page, détail dépliable accessible (`aria-expanded`, `aria-controls`, Échap), export CSV des alertes filtrées, blocage via le modal de ban existant (`VALIDATE_BLOCK`). **Analyse d'alerte** : bouton « Analyser » par ligne, détail enrichi (PPS, sévérité brute, blocage manuel, occurrences) et action de blocage dans le détail. « Toutes les alertes » de la vue d'ensemble pointe désormais vers `/alerts`. Les cases de sélection et actions de masse de la maquette sont omises : aucun endpoint backend pour « En analyse / résolue ».
5. [x] **Liste noire** — **Fait le 2026-11-04, en attente de validation.** `components/BannedHosts.tsx` réécrit : lecture authentifiée de `BANNED_HOSTS` avec les vrais champs (`id`, `source_ip`, `alert_type`, `timestamp_block`, `reason`), regroupement par IP en gardant l'alerte la plus récente, recherche et filtre par type d'alerte, cartes de synthèse réelles (hôtes, types, dernier blocage), export CSV. Déblocage via `POST /alerts/{id}/unban` avec `{ ip: source_ip }`, modale de confirmation, retrait local de l'IP et retour d'état. L'ajout, la suspension et les statuts « Suspendu / Expiré » de la maquette sont retirés : aucun endpoint backend. Note : le backend renvoie une ligne par alerte bloquée et ne met à jour qu'une ligne au déblocage ; l'IP est retirée localement après succès.
6. [x] **Rapports** — **Fait le 2026-11-04, en attente de validation.** Route protégée `/reports` (shell rendu avec `initialTab="reports"`), entrée « Rapports » dans la sidebar, URL synchronisée comme `/alerts`. Période hebdomadaire ou mensuelle calculée depuis la date de référence, avec période précédente pour la variation. Anomalies **regroupées depuis les alertes réelles** par type (`occurrences` = somme des `event_count`), sévérité la plus haute, source la plus fréquente, catégorie = protocole dominant, dernière observation. Synthèse réelle : anomalies, signatures, sources, taux de traitement ; la variation ne s'affiche que si la période précédente contient des données. Constructeur : fréquence, date, sections (Résumé / Anomalies / Sources / Recommandations). Bilans générés **en mémoire de session** (persistés dans `sessionStorage`), taille calculée sur le CSV réel, export CSV, **PDF réel** généré par `jsPDF` + `jspdf-autotable` (importés dynamiquement) : bandeau de titre sombre avec texte blanc, titre de rapport accentué, résumé en cartes, tableaux à en-têtes sombres, paragraphes et recommandations **justifiés**, pieds de page numérotés. Le PDF reprend la palette claire du thème shadcn. Limite assumée : seules les alertes chargées (100 dernières) sont analysées ; les bilans sont conservés pour la session navigateur, pas côté backend.

**Dépendances ajoutées** : `jspdf@4.2.1` et `jspdf-autotable@5.0.9` (demande utilisateur d'un vrai PDF). Elles sont chargées à la demande au clic sur « Exporter PDF » : chunk séparé `reportPdf` (≈ 426 Ko, 138 Ko gzip), hors bundle initial. 7. [x] **Routes existantes + fusions** — **Fait le 2026-11-04, en attente de validation.** `/logs`, `/nodes` et `/` conservées, rendues dans le shell (D18). « Journaux » = `LogsHub` avec `NetworkLogs` seul et le bouton **« Ouvrir les rapports »**. **`LogsManagement` et son onglet sont supprimés sur demande utilisateur du 2026-11-04.** « Actifs » = `AssetsHub` avec deux sections « Actifs » (`Assets`) et « Nœuds » (`NodesManagement`) ; `/nodes` ouvre directement la section Nœuds et l'entrée « Actifs » reste active. L'entrée « Nœuds » de la sidebar est supprimée. Les composants fusionnés conservent leur logique et leurs appels API. **« Rapports » est retiré de la sidebar** : la page `/reports` n'est accessible que depuis Journaux, avec un retour « Journaux ». 8. [x] **Responsive** — **Fait le 2026-11-04, en attente de validation.** Shell : sidebar repliable, **tiroir sous 768 px** (palier proche des 760 px de la maquette), topbar et en-têtes de page qui passent en colonne sous `sm`. Grilles de KPI en 1 colonne sur mobile, 2 sur tablette (`sm`), 4/5 sur desktop (`lg`) ; `MetricCardsGrid` bascule à 1100 px. Toutes les tables sont dans un conteneur `overflow-x-auto` ; les nouvelles tables ont une largeur minimale pour rester lisibles (`Alerts` 900 px, `Reports` 820 px, `Liste noire` 760 px, `Réseau` 640 px). `Reports` : sections en 1 colonne sur mobile. `AssetsHub` : onglets qui se replient. En-têtes de `NetworkLogs`, `ThreatIntel`, `Assets`, `UserProfile` rendus responsives. Animations restantes (spinners, panneau de filtres) complétées par `motion-reduce:animate-none`. Vérifié par `pnpm check` et `pnpm build` ; pas de test visuel navigateur à 760/1100 px. 9. [x] **Vérification** — **Fait le 2026-11-04, validation finale en attente.** `pnpm format` exécuté ; `.prettierignore` ajouté pour protéger la maquette Figma Make et `pnpm-lock.yaml`. `bash scripts/verif.sh` : **OK** (charte, `pnpm check`, `pnpm build`). **Thème shadcn neutre (oklch)** appliqué le 2026-11-05 : tokens `:root` / `.dark` de `index.css` (bordures douces, cartes, sidebar, accent), audit section 5 adapté aux déclarations de tokens, règles et SPEC alignées. Contraste du texte secondaire : 4,74:1 en clair, 7,66:1 en sombre. Persistance `theme` et `logs-display` vérifiée dans le code, focus visible global et `motion-reduce` vérifiés. PDF réel testé sur 1 page et 4 pages. `livrables/RECAP.md` rempli. **Restent les tests visuels manuels** à 760/1100 px, le clavier et les captures, à faire dans le navigateur.

### Critères d'acceptation

- [x] Routes existantes inchangées ; `/alerts` et `/reports` protégées.
- [x] Aucun appel API modifié ou ajouté ; aucun endpoint inventé.
- [x] WS, auth, IA, Start/Stop, modal de ban, filtres d'`AlertFeed` et logs dépliables conservés.
- [x] Thème shadcn neutre (tokens oklch) appliqué ; statuts en libellé + icône.
- [x] Données réelles uniquement ; « — » pour les champs absents.
- [x] Responsive 1100 px / 760 px ; focus clavier visible ; `prefers-reduced-motion` (code vérifié ; test visuel manuel à confirmer).
- [x] `pnpm check`, `pnpm build`, `bash scripts/verif.sh` OK.
- [x] **Validation utilisateur de la Phase 11 — 2026-11-04.**

---

## Hors périmètre / à ne pas toucher

`server/`, `shared/`, `patches/`, `vercel.json`, `pnpm-lock.yaml`, `dist/`, `.env*` ; `client/src/config.ts` et tous les appels API existants ; `client/src/contexts/AuthContext.tsx` et `AIContext.tsx` (hors raccord visuel éventuel) ; clé `jwt_token`.

## Notes annexes

- `.config.ts.swp` parasite à ignorer.
- `client/index.html:2` : `lang="en"` pour une interface française — proposition de passer à `lang="fr"` (à valider).
- `sidebar.tsx` et `chart.tsx` shadcn ne sont pas utilisés : ne pas les réécrire, les supprimer ou les laisser.
