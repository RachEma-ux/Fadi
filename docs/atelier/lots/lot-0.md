# Lot 0 — Cadrage, fiches, faisabilité — compte rendu

Exécuté le 3 octobre 2026 (chef de projet : session Claude en cours, équipiers : sous-agents « fiches A / B / C »
et « mesures »). Instruction du maître d'ouvrage : exécution de bout en bout sans acceptation intermédiaire
(décision D-010).

## Fait

| Tâche | Résultat |
| --- | --- |
| L0.1 | `CLAUDE.md`, `docs/atelier/README.md`, `decisions.md` (D-001 à D-013), gabarit de fiche ; amendements du plan reportés dans `docs/architecture.md` (modèle typé et fiches, cycle transactionnel, rendu WebGL2, états « à recalculer / publié », versions / variantes / publications, matrice d'échanges, lot 6 du programme). Cahier des charges complété d'après les fiches (caractéristiques nommées d'esquisse, `calqueId` sur toute occurrence, entités `groupe` / `bloc` / `composant` / `reference-externe`, tolérances, commandes `transformer.raccorder` / `.chanfreiner`, `contrainte.*`, `calque.affecter`, `refexterne.*`, DA-02-16 au lot 3a, choix IFC). |
| L0.2 | **72 fiches** à l'état « spécifiée (lot 0) » dans `docs/atelier/fiches/` : DA-01 (12), DA-02 (17), DA-03 (6), DA-04 (2), DA-05 (12), DA-06 (2), DA-07 (10), DA-17-16, DA-18-03 / 04, DA-21 (7). Interprétations consignées en D-012. |
| L0.3 | Maquette : non réalisée en document séparé (D-011) ; le lot 3a est construit d'après la section 5.8 avec captures pour validation a posteriori. |
| L0.4 | `docs/atelier/p0-mesures.md` + `scripts/bench/` : three.js WebGL2 A / B (instanciation : 1 199 → 24 draw calls, coût CPU de rendu 15,0 → 0,17 ms p50, première image 834 → 528 ms, tas 13,8 → 8,0 Mo), WebGPU absent en headless, web-ifc 0.0.78 (wasm 0,44 Mo brotli, IFC4X3 lu et écrit en Node), OCCT (opencascade.js 65,9 Mo / 9,5 Mo brotli, LGPL ; `occt-wasm` 21,2 Mo / 4,7 Mo brotli, licence déclarée non vérifiée), manifold-3d (0,16 Mo brotli, différence 0,44 ms), Yjs (1 000 annotations → 104 Ko), quotas (547 Mo en headless). Banc déclaré : bac à sable Linux, 2 vCPU, 8 Go, Chromium 141 headless, rendu logiciel SwiftShader — non représentatif d'un GPU réel. |
| L0.5 | `scripts/check-module-deps.mjs` (manifestes `packages/*/manifest.json`, dépendances fermées, pas d'API navigateur dans un paquet pur, pas d'import croisé `apps/web` ↔ `apps/api`) exécuté par `npm run typecheck` ; hooks de qualité en exemple (`docs/atelier/claude-settings.example.json`). Découpage du scénario e2e reporté au lot 4 (D-011). |

## Non fait

- Maquette statique séparée (D-011) ; découpage du scénario e2e et bases par équipier (sans objet dans une exécution à session unique, reportés au lot 4 pour le scénario).
- Mesures sur GPU réel, appareil de référence et téléphone Android : hors de portée du bac à sable (section 11 de `p0-mesures.md`).

## Décisions prises (déléguées, section 10.2)

D-011, D-012, D-013 — voir `docs/atelier/decisions.md`.

## Décisions qui appartiennent au maître d'ouvrage (non bloquantes pour les lots 1 à 9)

1. Licence OCCT, si des opérations de forme libres sont voulues un jour (lot optionnel) ; le paquet `occt-wasm` à licence déclarée permissive mérite une vérification juridique avant tout usage.
2. Fournisseur de modèle de langage pour l'assistant (lot 8) ; sans lui, l'assistant reste déterministe.
3. Stockage objet et hébergement durable.
4. Compte au service de validation IFC de buildingSMART (lot 6, optionnel).
5. Validation a posteriori de l'interface du lot 3a (captures) et de la tolérance d'aire des pièces (0,5 m² ou 2 %).

## Ce que vous pouvez vérifier

- `docs/atelier/p0-mesures.md` : chiffres et banc ; `scripts/bench/README.md` pour reproduire.
- `docs/atelier/fiches/` : ouvrir par exemple `DA-07-01.md` (murs), `DA-07-10.md` (escalier), `DA-02-16.md` (saisie de précision).
- `npm run typecheck` : le contrôle de modularité s'exécute en tête.
