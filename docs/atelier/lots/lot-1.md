# Lot 1 — Modèle typé `packages/atelier-model` : compte rendu

Branche du lot : `lot/1-modele`, partie de `atelier/principal` (D-020). Cahier : §5.1–5.3, §6, §7 (lot 1).
**État : livré, en attente d'acceptation du maître d'ouvrage** (après fusion des PR #30 à #35 dans `lot/1-modele` et CI verte de la PR du lot).

## Organisation (5 équipiers)

Phase 1 — interfaces figées avant distribution (§9) : L1.1 ontologie + squelette du paquet, contrats de commandes,
de références et de quantités sous forme de types. Phase 2 — en parallèle, sur ces types : L1.2, L1.3, L1.4, L1.5.

## Matrice de propriété

| Zone | Propriétaire |
| --- | --- |
| `packages/atelier-model/package.json`, `tsconfig.json`, `manifest.json`, `README.md`, `src/index.ts`, `src/ontologie/**`, `src/contrats/**` ; `package.json` racine (workspaces, scripts), `package-lock.json` | équipier « modèle » (phase 1) |
| `packages/atelier-model/src/commandes/**` | équipier « commandes » (L1.2) |
| `packages/atelier-model/src/references/**`, `src/quantites/**` | équipier « références » (L1.3) |
| `packages/atelier-model/src/importeur/**`, `src/projection/**` | équipier « import » (L1.4) |
| `packages/core-geometry/**` | équipier « géométrie » (L1.5) |
| `docs/atelier/lots/lot-1.md`, `docs/atelier/decisions.md`, `scripts/check-module-deps.mjs` | chef de projet (L1.6) |

## Avancement

| Tâche | Issue | État |
| --- | --- | --- |
| L1.1 ontologie et contrats figés (`atelier-commands/1`, `quantites/1`) | #23 | fusionnée (PR #29) ; 37 tests |
| L1.2 commandes et réducteurs | #24 | PR #32 ; 86 types de commande, 93 tests |
| L1.5 relecture de `core-geometry` | #27 | PR #31 ; 81 tests (47 conservés) |
| L1.3 références et quantités | #25 | PR #34 (après #32) ; 22 tests ; règle quantites/1 (D-026) |
| L1.4 importeur P.118 et projection | #26 | PR #33 (après #32) ; P.118 importé sans perte, 115 tests du paquet |
| L1.6 manifeste, `check-module-deps`, compte rendu | #28 | en cours : `atelier-model` obligatoire, contrat `atelier-commands` exigé ; D-023 à D-026 ; D-027 ; amendement des contrats et intégration de L1.3 : PR #35 ; 154 tests du paquet |

Exécution en deux vagues de deux équipiers : le poste (téléphone, 7 Go) a saturé lors d'un `npm run typecheck`
racine pendant la phase 1 ; les équipiers ne contrôlent que leur paquet, la CI contrôle l'ensemble.

## Fait

- **Paquet `@parcours/atelier-model`** (§5.1) : dépendances `core-geometry` et `domain-model` seulement, contrôlées par
  `check-module-deps` (paquet obligatoire, contrat `atelier-commands` exigé).
- **Ontologie** (§5.2) : toutes les classes, unités typées, repères tagués jamais mélangés, provenance et statut
  obligatoires, « non évaluée » explicite, relations admises, caractéristiques nommées, classes IFC, catalogue versionné.
- **Contrats** `atelier-commands/1` et `quantites/1`, amendés avant publication (D-024, D-026, D-027).
- **Commandes** (§5.3, annexe B) : réducteurs purs des 86 types, lot atomique, `baseRevision`, empreinte
  `atelier-empreinte/1`, inverses exacts (`restauration`), historique annuler / rétablir, recalcul des cotations
  rattachées.
- **Références et quantités** : résolution, « à réparer » avec propositions, jamais de réparation silencieuse (R12) ;
  règle `quantites/1` (D-026).
- **Importeur P.118 et projection** (§6, D-021, D-025) : import sans perte, effectifs source = cible, projection vers
  l'entrée d'analyse identique (6 niveaux, 74 locaux) — rapport : [`lot-1-rapport-import.md`](lot-1-rapport-import.md).
- **Relecture de `core-geometry`** : [`packages/core-geometry/RELECTURE.md`](../../../packages/core-geometry/RELECTURE.md),
  comportement par défaut inchangé, appelants inchangés (D-023).

## Mesures

| Contrôle | Résultat |
| --- | --- |
| Tests `atelier-model` | 154 |
| Tests `core-geometry` | 81 (47 conservés + 34) |
| Tests `domain-model` | 93, inchangés |
| `check-module-deps` | aucune dépendance interdite |
| Typecheck complet, build, e2e | CI GitHub de chaque PR (poste local insuffisant, cf. Avancement) |

## Non fait / reporté

- `bloc.definir` / `bloc.placer` refusés avec motif (lot 5) ; transformations restreintes à certaines classes, refus
  motivés (`decomposer` d'un polygone régulier, convention d'angle à figer).
- Volumes de murs sans jonctions (écarts aux angles avec le prototype, D-026) ; ligne de nez d'escalier (lot 5).
- Recul de parcelle replié et emprise sans centroïde : lot 2 (D-023) ; `drawFaces` vers `apps/web` : lot 3a.
- Importeur des archives du prototype (§7) : non demandé au lot 1, aucune archive à migrer (D-001).

## Décisions du lot

D-020 à D-027 (`decisions.md`).
