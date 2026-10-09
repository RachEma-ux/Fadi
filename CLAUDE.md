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
  **validé** (D-176), lots **P2-0 et P2-1 livrés et acceptés** (`docs/atelier/lots/p2-lot-0.md`, `p2-lot-1.md`,
  D-182, D-183), lot **P2-2 livré** (`p2-lot-2.md`, D-184 : porte P1 → P2 passée sur bâtiment + mécanique), lot **P2-3 livré** (`p2-lot-3.md`, D-185 : ontologie `structure`), lot **P2-4 livré** (`p2-lot-4.md`, D-186 : ontologies `timber` et `sheetmetal`), lot **P2-5 livré** (`p2-lot-5.md`, D-187 : ontologie `mep`), lot **P2-6 livré** (`p2-lot-6.md`, D-188 : bâtiment P2, surfaces libres, coordination, cinématique, inerties), lot **P2-7 livré** (`p2-lot-7.md`, D-189 : annotations de fabrication, isométriques, feuilles gabarits, perçages / ferraillage / débit, nuages de points), lot **P2-8 livré** (`p2-lot-8.md`, D-190 : graphes de génération contrôlée, règles par ontologie, dossier de recette P2 `docs/atelier/recette-p2.md` — **P2 livré en entier ; lots P2-2 à P2-8 acceptés le 9 octobre 2026, D-193 : 125 fiches « disponible », P2 clos, aucune suite engagée**) ; exécution
  continue avec décisions 10.1 déléguées au chef de projet (D-183, consignées une à une) ; décisions D-177 (OCCT = composant LGPL chargé séparément, licences
  amendées), D-178 (solveur écrit), D-179 (DWG / DGN renoncés), D-180 (catalogues CSV sourcés,
  `docs/atelier/catalogues/`), D-181 (projet mixte P.118-M). Ordre imposé P2-0 → P2-1 → P2-2 → porte P1 → P2 ; un lot à
  la fois, chaque lot suivant attend son engagement par le maître d'ouvrage.
- Ontologie mécanique (P2-2) : `packages/atelier-model/src/ontologies/mechanical/` (solveur, liaisons, géométrie,
  familles, réducteurs) ; activation par projet (`ontologie.activer`, `etat.ontologies`) — une classe d'une ontologie
  inactive est refusée ; une pièce copie la géométrie de sa source, le solveur tourne dans le réducteur (navigateur et
  serveur) ; une ontologie n'importe jamais une autre ontologie directement.
- Ontologie structure (P2-3) : `packages/atelier-model/src/ontologies/structure/` (sections, géométrie de balayage, trame,
  assemblages soudés dérivés, réducteurs) ; identifiant `structure` activable par projet, le poteau reste au socle
  `building.structure` ; génération de trame après aperçu et accord ; sections saisies ou de catalogue sourcé, masse
  linéique sourcée seule retenue ; aucune constante normative (test) ; géométrie seulement, aucune vérification.
- Ontologies bois et tôlerie (P2-4) : `ontologies/timber/` (sections, ossature : plans de mur et de charpente, réducteurs)
  et `ontologies/sheetmetal/` (pliage sourcé, développé dérivé, géométrie) ; géométrie 3D commune dans
  `src/geometrie-3d.ts` ; génération d'ossature après aperçu et accord ; paramètres de pliage fournis (table sourcée ou
  facteur K déclaré avec sa source), sinon développé « non évalué ».
- Ontologie réseaux (P2-5) : `ontologies/mep/` (sections saisies ou catalogue `tubes-raccords.csv` sourcé, géométrie des
  segments / raccords / vannes / équipements / supports, connectivité par ports — `portsDe`, `incompatibilites`,
  `controlerReseau` —, P&ID dérivé, réducteurs dont `reseau.router`, `reseau.connecter`, `specification.definir`) ;
  identifiant `mep` activable par projet ; une connexion est une relation `connecte` jugée sans table de valeurs ;
  aucun DN, débit ni pression dans le code (test) ; document `atelier-pid` (SVG) et tableau `reseau` au catalogue.
- Bâtiment P2 et coordination (P2-6) : classes `plafond`, `coque`, `rampe`, `echelle`, `mur-rideau`, `terrain`, `reservation`,
  `installation-chantier` au socle `building.architecture` (géométrie `src/batiment-p2.ts`) et `surface-libre` au `drawing`
  (maillage de contrôle + subdivision de Loop, édition directe, conversion **explicite** `surfaceLibre.depuisObjet` — le
  paramétrique reste canonique, R15) ; `src/coordination.ts` : collisions entre ontologies (type `ontologies`) exemptées
  seulement par une réservation **accordée**, contrôles de spécification (type `specification`) ; rien n'est corrigé.
  Mécanique : `ontologies/mechanical/cinematique.ts` (trajectoire dérivée, obstacle ; pivot signé `angle-oriente`) et
  `inerties.ts` (masse seulement avec une masse volumique déclarée **avec sa source**). Noyau exact : opérations `surface`,
  `patch`, `conge` en plus.
- Documentation et relevé P2 (P2-7) : `src/annotations-fabrication.ts` (classe `annotation-fabrication` : tolérance géométrique,
  soudure, état de surface, symbole spécialiste — symboles tracés en primitives, texte dérivé ; cote mécanique `prefixe` /
  `tolerance` ; étiquette intelligente `champ`) ; vue `isometrique` ; `feuille.gabarit` ; tableaux `percages`, `ferraillage`,
  `debit` ; `src/echanges/nuage.ts` (LAS / XYZ / PTS lus sans bibliothèque, décimés, E57 / LAZ refusés) et classe
  `nuage-de-points` posée par une origine **déclarée** (`POST /atelier/nuages`) ; DGN / DWG renoncés (D-179).
- Automatisation P2 (P2-8) : `src/automatisation/graphes.ts` (graphe de génération = nœuds paramètre / calcul / série /
  niveaux / règle / commande + liens « qui lit quoi » ; `validerGraphe` sans cycle, `compilerGraphe` → `ScriptAtelier`,
  `proposerGraphe` → **même boucle contrôlée** que l'assistant, aucune correction automatique) ; graphes du projet =
  définitions `graphe` (`commandes/graphes.ts`) ; `src/automatisation/regles-classes.ts` (règle `regle.definir { classe }`
  contrôlée sur chaque occurrence après chaque commande, problèmes rattachés, jamais corrigés — aucune règle fournie par
  Fadi, R3) ; routes `GET /atelier/graphes`, `POST /atelier/graphes/:id/proposer` (accord par les routes de l'assistant) ;
  `panneaux/Graphes.tsx` (vue SVG + éditeur visuel), `panneaux/Regles.tsx`.
- Noyau exact (P2-1) : `packages/geometry-exact` (occt-wasm) est le seul endroit qui importe `occt-wasm` ; le `.wasm`
  (LGPL) reste un fichier séparé, jamais chargé à l'ouverture (Web Worker à la demande, `exact/moteur-exact.ts`) ; le
  serveur (`apps/api/src/lib/atelier-exact.ts`) recalcule chaque `solideExact.creer` et fait autorité ; `occt-wasm`
  est externe au bundle esbuild de l'API (`apps/api/scripts/build.mjs`). Les objets paramétriques ne sont jamais
  convertis en brep (R15) : leur extrusion sert d'opérande.
- Suivi : `docs/atelier/` (fiches de capacité, décisions, mesures, maquette, comptes rendus de lot).
- Un lot à la fois ; acceptation du maître d'ouvrage entre deux lots ; les décisions de la section 10.1 du
  cahier lui appartiennent : s'arrêter et demander, ne pas inventer.
