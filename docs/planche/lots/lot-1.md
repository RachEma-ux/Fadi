# Lot Planche 1 — Noyau pur `packages/planche-model` — compte rendu prévisionnel

**Statut : prévisionnel** (rédigé avant le code, 6 octobre 2026, branche `planche/lot-1`). Ce document dit ce que le lot
livrera, comment le vérifier et ce qui sera demandé au maître d'ouvrage ; il sera réécrit en compte rendu à la fin du
lot (fait, non fait, mesures, décisions).

> **Accepté par le maître d'ouvrage le 8 octobre 2026 (D-174)** ; fiches du lot à l'état « disponible ».

Cadre : `docs/planche/cahier-planche.md` §8 (lot 1), décisions MO-1 à MO-5 (§1.2). **Aucune interface** : rien ne
change dans `apps/web` ni dans `apps/api` ; le mode Planche n'apparaît pas encore dans l'Atelier.

## Point de départ

Le paquet existe déjà en partie : `packages/planche-model/` avec `package.json` (`@parcours/planche-model`, vitest,
TypeScript), `manifest.json` (`contracts: {}`, `allowedDependencies: []`), `tsconfig.json` et `src/vecteur.ts`
(vecteurs, tolérances `EPS = 1e-9`, `TOL = 1e-6`, rotation de Rodrigues). Le paquet n'est **pas encore inscrit** au
script `test` racine (`package.json`, liste explicite des espaces de travail). Le commentaire de `TOL` attribue la
valeur à SketchUp sans source : à reformuler en « choix Fadi » (tolérance non relevée, cahier L-31 ; R3).

## Tâches

| Tâche | Contenu | Fichiers | Fiche | Dépend de |
| --- | --- | --- | --- | --- |
| L1.1 | Compléter et tester les vecteurs : plans (point + normale), distances point–droite, point–segment, droite–droite (points les plus proches), segment–segment coplanaires, point dans un polygone plan, aire signée, matrices affines 4 × 4 (composition, inverse, application), projection écran depuis une matrice de 16 nombres. Reformuler le commentaire de `TOL`. | `src/vecteur.ts`, `src/vecteur.test.ts` | PL-01-01 | — |
| L1.2 | Noyau de géométrie libre : structure (sommets, arêtes, faces planes trouées, courbes, contextes, groupes), ajout avec collage et faces automatiques, effacement, différences et inverse exacts, invariants, sérialisation canonique `planche-geometrie/1`, aire, volume, solidité. | `src/geometrie-libre.ts`, `src/geometrie-libre.test.ts` | PL-01-01 | L1.1 |
| L1.3 | Champ Mesures : analyse typée (grammaire du cahier §5.3), locale `fr` / `en`, unités, option impériale (refusée par défaut), formatage, erreurs nommées. | `src/saisie-vcb.ts`, `src/saisie-vcb.test.ts` | PL-01-02 | — |
| L1.4 | Inférences : points, linéaires, surfaces, verrous (flèche, Maj, cycle Alt), priorité déterministe, libellés et jetons de couleur, accrochage de longueur et d'angle. | `src/inference.ts`, `src/inference.test.ts` | PL-01-03 | L1.1, L1.2 |
| L1.5 | Catalogue déclaratif des 45 outils, contrôle, recherche, raccourcis. | `src/catalogue-outils.ts`, `src/catalogue-outils.test.ts` | PL-01-04 | L1.3 (types d'attente), L1.4 (types d'inférence) |
| L1.6 | Point d'entrée (`src/index.ts`), `README.md` du paquet (rôle, contrats, limites, renvois), inscription de `@parcours/planche-model` au script `test` racine ; `manifest.json` : description gardée, `contracts` = `{ "planche-geometrie": 1 }`. | `src/index.ts`, `README.md`, `manifest.json`, `package.json` (racine) | — | L1.1 à L1.5 |
| L1.7 | Fiches PL-01-01 à PL-01-04 passées à « prototype » avec la preuve liée (tests) ; compte rendu définitif de ce lot ; décisions à consigner dans `docs/atelier/decisions.md` (MO-1 à MO-5, tolérances choisies). | `docs/planche/fiches/`, `docs/planche/lots/lot-1.md` | — | L1.6 |

Ordre : L1.1 → (L1.2 ∥ L1.3) → L1.4 → L1.5 → L1.6 → L1.7. Les fichiers listés sont les seuls touchés hors de
`docs/planche/` (plus la ligne du script `test` racine).

## Contrôles à passer

| Contrôle | Commande | Attendu |
| --- | --- | --- |
| Modularité (R6) | `npm run typecheck` (lance d'abord `scripts/check-module-deps.mjs`) | Aucun import hors `allowedDependencies: []` ; ni `react`, ni `three`, ni API navigateur dans `packages/planche-model/src` (tests exceptés pour `vitest`) |
| Types | `npm run typecheck` | `strict` sans erreur dans tous les espaces de travail |
| Tests | `npm test` (et `npm test --workspace=@parcours/planche-model`) | Tous les cas chiffrés des fiches PL-01-01 à PL-01-04 verts ; tests existants inchangés et verts |
| Construction | `npm run build` | Vert (le paquet n'est pas encore importé par `apps/web` : contrôle de non-régression) |
| Scénario de bout en bout | scénario Playwright du README (« End-to-end scenario ») | Vert, inchangé (aucune interface touchée) |
| CI | intégration continue du dépôt | Verte avant la demande d'acceptation (R19) |
| Hygiène (R18) | relecture du lot | Ni secret, ni `node_modules`, ni `dist/`, ni HTML de référence |

Un contrôle qui n'aura pas pu tourner sera déclaré ici, jamais tu.

## Critères d'acceptation du lot

CA-L1-1 à CA-L1-6 du cahier §8 : modularité verte ; cas chiffrés des quatre fiches verts ; sérialisation canonique
stable ; inverse exact de toute opération ; catalogue complet (45 outils, statut et renvoi pour chacun) ; typecheck,
test, build, scénario et CI verts, aucune interface modifiée.

## Ce que le maître d'ouvrage pourra vérifier lui-même

- `npm test --workspace=@parcours/planche-model` : nombre de tests et cas nommés comme dans les fiches (ex. « deux
  boîtes collées : 11 faces, 20 arêtes, 31 entités ») ;
- `npm run typecheck` : le contrôle de modularité liste `@parcours/planche-model` sans violation ;
- `packages/planche-model/README.md` et les fiches `docs/planche/fiches/PL-01-0*.md` : chaque comportement codé renvoie
  à un relevé (obs) ou est déclaré « choix Fadi » ;
- l'Atelier (Plan / 3D / Documents) n'a pas changé.

## Hors périmètre du lot 1

Toute interface (mode Planche, rendu three.js, barre d'état, champ Mesures à l'écran) : lot 2. Transformations,
Pousser / tirer : lot 3. Composants, matériaux : lot 5. Booléens (manifold-3d) : lot 6. Commandes, persistance, IFC :
lot 7.

## Décisions

- Prises par le maître d'ouvrage (06/10/2026) : MO-1 à MO-5 (cahier §1.2), à consigner dans `docs/atelier/decisions.md`.
- Déléguées au chef de projet (cahier Atelier §10.2), à consigner à la fin du lot : tolérances `TOL` et coplanarité,
  rayon de capture par défaut (12 px), priorité des inférences, normale des faces créées, fusion des faces coplanaires
  à l'effacement de leur arête commune.
- Ouvertes, sans effet bloquant sur ce lot (cahier §10) : P-3 (séparateurs — la grammaire est paramétrée par la
  locale) et P-4 (unités anglo-saxonnes — option refusée par défaut) ; les autres concernent les lots 2 à 7.

## Demande d'acceptation (à envoyer à la fin du lot)

> Lot Planche 1 terminé : noyau pur `packages/planche-model` (géométrie libre, champ Mesures, inférences, catalogue
> des 45 outils), sans interface. Contrôles : typecheck, test, build, scénario et CI — résultats ci-dessus. À
> vérifier : les commandes de la section « Ce que le maître d'ouvrage pourra vérifier ». Décisions demandées avant le
> lot 2 : P-2, P-3, P-4, P-5, P-7, P-11, P-12 (cahier §10). Acceptez-vous le lot 1 et l'ouverture du lot 2 ?
