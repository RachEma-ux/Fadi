# Lot 1 — Modèle typé `packages/atelier-model` : compte rendu

Branche du lot : `lot/1-modele`, partie de `atelier/principal` (D-020). Cahier : §5.1–5.3, §6, §7 (lot 1).
**État : en cours.**

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
| L1.2 commandes et réducteurs | #24 | en cours (vague 1) |
| L1.5 relecture de `core-geometry` | #27 | en cours (vague 1) |
| L1.3 références et quantités | #25 | à lancer (vague 2) |
| L1.4 importeur P.118 et projection | #26 | à lancer (vague 2) |
| L1.6 manifeste, `check-module-deps`, compte rendu | #28 | en cours : `atelier-model` obligatoire, contrat `atelier-commands` exigé |

Exécution en deux vagues de deux équipiers : le poste (téléphone, 7 Go) a saturé lors d'un `npm run typecheck`
racine pendant la phase 1 ; les équipiers ne contrôlent que leur paquet, la CI contrôle l'ensemble.

## Fait / non fait, mesures, décisions, rapport d'import

À compléter à la fin du lot.
