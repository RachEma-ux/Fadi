# Lot 0 — Cadrage, maquette, faisabilité : compte rendu

Branche du lot : `lot/0-cadrage`. Cahier des charges : `docs/atelier-cahier-des-charges.md` §7 (lot 0).
Organisation : une issue et une PR par tâche, intégrées par le chef de projet après CI verte (décision D-010).

**État : en attente d'acceptation du maître d'ouvrage** — en particulier la validation de la maquette (§10.1,
point 1), sans laquelle le lot 3a ne commence pas.

## 1. Ce qui est fait

| Tâche | Livrable | PR / issue | Contrôles |
| --- | --- | --- | --- |
| L0.1 | `docs/architecture.md` amendé (six amendements de `docs/atelier-drawall.md` §10) ; `CLAUDE.md`, `docs/atelier/README.md`, `decisions.md`, gabarit de fiche (déjà sur `main`, 9297c57) | #8 / #2 | CI verte (validate, e2e, image) |
| L0.2 | 63 fiches de capacité à l'état « spécifiée » dans `docs/atelier/fiches/` : DA-01 (01–06, 09–11), DA-02 (01–17), DA-03 (01, 09, 10, 12, 13, 15), DA-04 (01, 07), DA-05 (01–05, 12, 14, 15), DA-06 (07, 08), DA-07 (01–06, 10, 15–17), DA-17-16, DA-18 (03, 04), DA-21 (01, 02, 04–07) | #9, #11 / #3 | Champs du gabarit présents dans chaque fiche ; CI verte |
| L0.3 | Maquette HTML statique `docs/atelier/maquette/` (ouvrir `index.html`, sans serveur ni CDN) : 7 écrans ordinateur 1536 px, 9 écrans téléphone 390 px, niveaux Essentiel / Contextuel / Complet, palette, inspecteur, panneau problèmes ; données extraites de `p118-native-model.json` (`outils/extraire-p118.py --verifier`) ; 18 captures dans `captures/` | #10 / #4 | Workflow « Atelier — maquette » vert : aucune requête externe, aucune erreur JavaScript, pas de défilement horizontal ; CI verte |
| L0.4 | Banc de mesures isolé `docs/atelier/banc/` + workflow `atelier-banc.yml` ; `docs/atelier/p0-mesures.md` avec bancs déclarés ; résultats bruts dans `docs/atelier/banc/resultats-publies/` | #15 / #5 | Banc vert en CI (run 37145845850) ; mesures Node sur le poste local |
| L0.5 | `apps/web/e2e/run.mjs` + `scenarios/00…12-*.mjs` + `attendu.json` ; `init.sql` en sections par module (`atelier` réservée) ; `apps/web/src/lib/api/*.ts` par module (`atelier.ts` réservé) ; `scripts/check-module-deps.mjs` + `manifest.json` en tête de `npm run typecheck` ; hooks `TaskCompleted` / `TeammateIdle` dans `.claude/settings.json` ; bases et port par équipier (`apps/api/README.md`) | #12 / #6 | **327 contrôles avant et après, conformes à `attendu.json`** ; migration rejouée et restauration vérifiée en CI ; CI verte |
| L0.6 | Ce compte rendu ; décisions D-010 à D-017 ; références à l'ancien `parcours-scenario.mjs` mises à jour dans `docs/migration/` | #7 | — |

## 2. Ce qui n'est pas fait, ou pas vérifié

- Fiches des entrées retenues pour les lots 5 et 7 (DA-01-07 / 08 / 12, DA-05-06 / 07 / 09 / 11) : volontairement
  hors du lot 0, qui couvre les entrées des lots 1 à 3.
- Sur le poste de travail (téléphone Android sous PRoot) : ni Chromium, ni rôle PostgreSQL utilisable. Les tests
  de l'API, la migration, le scénario e2e, les captures et le banc n'ont tourné **qu'en GitHub Actions** ;
  localement, seuls `npm run typecheck`, `npm run build` et les tests `core-geometry` (47) et `domain-model`
  (93) ont tourné (L0.5).
- Contrôle e2e instable : sur le commit intermédiaire 391e3bf de `lot/0-cadrage` (fusion de fiches, documentation
  seule), deux contrôles de la page d'accueil (« reprendre mon projet », « Mon parcours ») ont échoué une fois ;
  ils passent sur la PR et sur les commits suivants. À surveiller ; non corrigé au lot 0.
- `docs/migration/matrix.md` §3 (Atelier) n'est pas réécrit : il décrit toujours l'Atelier extrait, qui reste
  le seul Atelier du produit jusqu'à la bascule (lot 4).

## 3. Matrice de propriété (lot 0)

| Zone | Propriétaire |
| --- | --- |
| `docs/architecture.md`, `docs/atelier/decisions.md`, `docs/atelier/lots/**`, `docs/migration/**` | chef de projet |
| `docs/atelier/fiches/DA-01…05-*.md` | équipier « fiches A » |
| `docs/atelier/fiches/DA-06, 07, 17, 18, 21-*.md` | équipier « fiches B » |
| `docs/atelier/maquette/**`, `.github/workflows/atelier-maquette.yml` | équipier « maquette » |
| `docs/atelier/banc/**`, `docs/atelier/p0-mesures.md`, `.github/workflows/atelier-banc.yml` | équipier « mesures » |
| `apps/web/e2e/**`, `apps/api/src/db/init.sql`, `apps/web/src/lib/api/**`, `scripts/check-module-deps.mjs`, `packages/*/manifest.json`, `package.json`, `.claude/settings.json`, `.gitignore`, `ci.yml` (étape e2e), sections e2e des README | équipier « outillage » |

## 4. Mesures (L0.4)

Détail et bancs déclarés : `docs/atelier/p0-mesures.md`. Essentiel :

| Mesure | Résultat | Banc |
| --- | --- | --- |
| web-ifc 0.0.78 (MPL-2.0) | 0,65 Mo brotli ; init 487 ms (Node), 143 ms (navigateur) ; schéma IFC 4.3 présent | poste local / CI |
| manifold-3d 3.5.4 (Apache-2.0) | 0,18 Mo brotli ; init 17–37 ms ; P.118 percé (220 murs, 210 ouvertures) en 74–167 ms, 0 non-conforme ; 24 / 24 cas limites conformes | poste local / CI |
| OCCT (occt-wasm 5.5.0 ; opencascade.js 1.1.1) — banc seulement, licence non arbitrée | 4,7 Mo et 9,5 Mo brotli ; init 94 ms et 575 ms (navigateur) | poste local / CI |
| Yjs 13.6.33 | mises à jour de 11 à 63 octets ; 10 000 éditions à deux clients convergentes | poste local |
| Écriture IFC 4.3 de P.118 | directe : 19 ms ; web-ifc : 376 ms ; même fichier relu (220 murs, 210 vides, 120 poteaux, 6 niveaux) | poste local |
| Rendu three.js WebGL2, scène P.118 (60 176 triangles) | ouverture 116–238 ms ; sélection p95 ≤ 0,5 ms ; fusion par matériau 1 098 → 120 appels ; trame p95 ≈ 66–70 ms **en rendu logiciel** | CI, SwiftShader |
| Budget de trame sur GPU réel, Firefox, Safari | **non mesuré** (pas de banc GPU ni de Chromium sur le poste) | — |

Le premier passage CI dépassait la limite du job (300 trames × 12 rendus en rendu logiciel) : trames et rayons
sont devenus réglables (60 / 100 en CI).

## 5. Constats sur les données P.118 (à traiter au lot 1)

1. **Calques.** `floorDesign.levels[*].layers` existe par niveau (16 à 20 calques selon le niveau, 22 noms
   distincts au total) ; il n'y a pas de liste de calques de projet. Le chiffre de contrôle « 20 calques » de R7
   et du §6 correspond au maximum par niveau, pas au total.
2. **Pièces.** Les `rooms[].polygons` ne sont pas dans le repère local des murs mais dans celui des `modelPoints`
   de `meta.layoutV819.registration` ; `rooms[].area` correspond à l'état d'avant la révision 8.19
   (ex. S01 : 253,394 → 230,614 m²) ; 7 pièces n'ont pas de tracé courant ; 33 tracés de pièce sans code.
   La règle d'import du §6 ne suffit pas : proposition dans DA-07-15 (repères jamais mélangés, R5).
3. **Dalles.** Chaque dalle porte `thickness: 0.1` et `height: 0.25` (« 0,25 m conservé uniquement pour la
   représentation ») : quelle valeur devient `epaisseur` ?
4. **Données sans destination au §6** (risque R7) : `levels[].areas`, `levels[].meta`, `vertexOffsets` (104
   tracés) et `topOffsets` (19), 124 tracés de hauteur nulle, acrotère importé comme `roof-slab`.
5. **Escaliers.** 8 volées de l'escalier B sans niveaux reliés, contremarches ni épaisseur de paillasse : la
   relation `relie` n'est pas créée, un problème est listé.
6. **Noyaux.** Aire calculée ≠ aire déclarée sur R+1 à R+3 (38,230 contre 25,815 m²) : écart listé, pas corrigé.
7. **Libellés.** Au RDC, R04 « Desserte principale · 1,94 m » dans `rooms[]` mais « · 2 m » dans `paths[]`.

## 6. Décisions prises par le chef de projet (§10.2)

D-010 à D-017 dans `docs/atelier/decisions.md` : organisation PR + CI GitHub ; ordre historique du scénario
découpé ; tolérances numériques provisoires ; commandes hors annexe B = propositions à figer en L1.2 ; règle
d'échelle des objets paramétriques ; 409 strict conservé au lot 2 ; D-016 export IFC par écriture directe et
web-ifc pour l'import et la validation ; D-017 Yjs non retenu au lot 0 (annotations = commandes, question
rouverte au lot 7).

## 7. Décisions qui appartiennent au maître d'ouvrage (§10.1)

**Validation de la maquette** (point 1) — à trancher en l'ouvrant (`docs/atelier/maquette/index.html`) :

1. Disposition ordinateur : navigateur à gauche, inspecteur à droite, panneau des problèmes en bas, replié par défaut.
2. Niveau d'affichage à l'ouverture : Essentiel ; en Essentiel, outils du prototype à plat, familles de
   commandes seulement en Complet.
3. Téléphone : cinq onglets en bas (Projet, Outils, Inspecteur, Problèmes, Affichage) qui ouvrent des feuilles.
4. Réserves Harmonie listées avec un lien « Ouvrir » vers l'étape 10, sans traitement dans l'Atelier.
5. Orientation du plan : tourné pour la lecture ou repère local brut ; nord non dessiné tant qu'il n'est pas
   confirmé (H11).
6. Syntaxe de saisie relative et polaire (`@dx;dy`, `@l<a`).

**Suppressions de fonctions visibles et périmètre** (points 6 et 8) :

7. « Extruder » du prototype fait en réalité une coque ou un percement : ces fonctions disparaissent au lot 4
   sans figurer au §5.5. Les garder au lot 3, ou les renvoyer à DA-04-09 / 10 (optionnel) ?
8. Les 7 pièces de P.118 sans géométrie courante : les garder ou les retirer ?
9. Notes de revue rattachées à un objet et à une révision : fonction nouvelle, à ajouter ou non.
10. « Niveau CAO » distinct des calques, classes d'organisation libres ou système de classification (avec sa
    source) : ajout au périmètre ou non. Jeu de propriétés de votre pratique dès le lot 3 ?
11. Interprétations à confirmer : DA-03-15 « Construction modeling » = types constructifs à couches (et non
    phasage / 4D) ; DA-07-05 « Floors » = plancher d'un niveau (même classe `dalle`) ; « espace » = surface
    nommée sans code (les blocs sanitaires deviennent-ils des pièces ?) ; ouverture hébergée par une dalle
    (proposition §4.2) ou seulement par un mur (cahier §5.2) ; les 7 « murs » de 1,10 m du calque Garde-corps.

**Données à fournir avec leur source** (point 7, R3 — rien n'est inventé en attendant) :

12. Calques P.118 : calques de projet (union des 22 noms) ou par niveau ; R7 passe-t-il à 22 ? Calque initial
    d'un projet vide ?
13. Épaisseur des dalles de P.118 : 0,10 m (`thickness`) ou 0,25 m (`height`, « représentation ») ?
14. Catalogue initial de portes et fenêtres ; jeu de hachures normalisé (SIA 400 ou ISO 128-50) ; convention
    marches / contremarches et règles dimensionnelles d'escalier — chacun avec sa source, ou rien.

**Exploitation** (point 4) :

15. Stockage des volumes en base en attendant un stockage objet ; politique de conservation de l'historique
    avant le lot 7.

## 8. Ce que le maître d'ouvrage peut vérifier lui-même

- **Ouvrir la maquette** : `docs/atelier/maquette/index.html` (ou les captures `docs/atelier/maquette/captures/`,
  aussi en artefact `captures-maquette` du workflow « Atelier — maquette »).
- **Lire les mesures** : `docs/atelier/p0-mesures.md`.
- **Lire les fiches** : `docs/atelier/fiches/` (état en tête de chaque fiche).
- **CI** : onglet Actions du dépôt, PR du lot vers `main` (validate, e2e à 327 contrôles, image, maquette).

## 9. Definition of Done du lot 0 (§7, acceptation)

- [x] Fiches à l'état « spécifiée » pour tout le périmètre du lot 3 (63 fiches).
- [ ] Maquette validée par le maître d'ouvrage — **en attente**.
- [x] Mesures publiées avec banc déclaré (`p0-mesures.md`) ; budget GPU déclaré non mesuré.
- [x] Scénario découpé passant à l'identique : 327 contrôles, CI verte.
- [x] `check-module-deps` en place (`npm run typecheck`).
