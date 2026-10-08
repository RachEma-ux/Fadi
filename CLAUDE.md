# Fadi — consignes pour Claude Code

Lis d'abord `AGENTS.md` (règles du dépôt, non négociables). Si la tâche touche l'Atelier architectural, lis
ensuite `docs/atelier-cahier-des-charges.md` et suis son mode d'emploi (section 0).

## Projet

Application web bilingue français / anglais (D-163 ; le français est la langue source, l'anglais vient du dictionnaire
`apps/web/src/lib/i18n/en.json`) : Parcours de 21 étapes, Atelier architectural, Programmation, Analyses métier,
Documents, Collaboration. Monorepo npm : `packages/domain-model` (entités, repères, règles métier pures),
`packages/core-geometry` (géométrie pure), `packages/atelier-model` (chantier Atelier), `apps/api` (Express 5,
PostgreSQL + PostGIS, Drizzle), `apps/web` (React 19, Vite, TanStack Query, Dexie, service worker). Entrées
développeur : `README.md`, `docs/architecture.md`, `docs/migration/matrix.md`.

## Commandes

`npm ci` · `npm run db:migrate` · `npm run typecheck` · `npm test` · `npm run build` · `npm run dev:api` (API :3001)
· `npm run dev` (web :5173) · scénario de bout en bout : README, « End-to-end scenario ».

## Règles essentielles (le détail est dans AGENTS.md)

- Les 21 étapes (01–21, phases, libellés, cartes mobiles) sont intouchables ; Harmonie reste dans les étapes. L'anglais
  n'en est qu'un affichage traduit : les libellés source restent ceux du français.
- Interface bilingue : tout nouveau texte d'interface s'écrit en français dans le code et reçoit sa traduction dans
  `apps/web/src/lib/i18n/en.json` ; la recette `interface-anglais.mjs` relève ce qui resterait en français. Données du
  projet, exemples et documents produits ne sont pas traduits.
- Jamais de donnée réglementaire, structurelle ou de projet inventée ; exigence, hypothèse et recommandation
  sont trois choses distinctes ; une valeur absente est « non évaluée ».
- Repères `cadastral`, `geographic`, `local` tagués ; conversions explicites ; jamais mélangés.
- Géométrie et modèle indépendants de React et du DOM.
- `npm run typecheck`, `npm test`, `npm run build` avant tout commit ; scénario e2e et CI verts avant toute
  demande d'acceptation ; un contrôle qui n'a pas pu tourner est déclaré.
- Jamais de secret, de `node_modules`, de `dist/` ni du HTML de référence dans un commit.

## Chantier Atelier (DrawAll V4.1)

- Cahier des charges : `docs/atelier-cahier-des-charges.md` (règles R1–R20, contrats, lots, organisation).
- Proposition acceptée : `docs/atelier-drawall.md`. Référentiel : `docs/drawall/`.
- Lots P1 (Atelier 0–9, Planche 1–7) acceptés le 8 octobre 2026 (D-174). Étape P2 : cahier `docs/atelier-cahier-p2.md`
  **validé** (D-176), lot **P2-0 livré** (`docs/atelier/lots/p2-lot-0.md`, `p2-mesures.md`) ; décisions D-177 (OCCT =
  composant LGPL chargé séparément, licences amendées), D-178 (solveur écrit), D-179 (DWG / DGN renoncés), D-180
  (catalogues CSV sourcés, `docs/atelier/catalogues/`), D-181 (projet mixte P.118-M). Ordre imposé P2-0 → P2-1 → P2-2 →
  porte P1 → P2 ; un lot à la fois, chaque lot suivant attend son engagement par le maître d'ouvrage.
- Suivi : `docs/atelier/` (fiches de capacité, décisions, mesures, maquette, comptes rendus de lot).
- Un lot à la fois ; acceptation du maître d'ouvrage entre deux lots ; les décisions de la section 10.1 du
  cahier lui appartiennent : s'arrêter et demander, ne pas inventer.
