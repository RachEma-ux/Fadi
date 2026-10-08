# Lot P2-1 — Noyau exact (OCCT) — compte rendu

Exécuté le 8 octobre 2026 (chef de projet, session unique ; engagé par le maître d'ouvrage après la livraison de P2-0,
D-182). Cadre : `docs/atelier-cahier-p2.md` §5 (lot P2-1), lot optionnel du cahier Atelier (§ « Noyau exact OCCT »),
D-177 (OCCT = composant LGPL chargé séparément), R15 (une seule géométrie canonique par objet), D-013 (rien de lourd
sur le chemin d'ouverture). Fiches : DA-04-02, 03, 04, 08, 09, 10, 11 ; DA-03-01 (-d), DA-03-12 — à l'état
**prototype** jusqu'à l'acceptation du lot.

## Fait

| Tâche | Résultat |
| --- | --- |
| Paquet pur `packages/geometry-exact` | Enveloppe de `occt-wasm` 5.6.1 (OCCT 7.9 en WebAssembly) sans React ni DOM : `MoteurExact.charger({ wasm })` (octets, URL ou chemin ; sans option, le paquet localise le `.wasm` à côté de lui), `executer(operation)` → `SolideExact` (brep binaire OCCT en base64, maillage, volume, aire, faces, empreinte FNV-1a 64 du brep), `exporterStep(brep, pose)`, `validerOperation` (refus nommés par chemin). Opérations : révolution (profil 2D + axe + angle), extrusion, balayage (profil + trajet, `sweepPipeShell`), lissage (profils étagés, réglé ou lisse), booléens (union / soustraction / intersection ; opérandes `{ brep, pose }` ou `{ extrusion }`), trou (cylindre, traversant ou borgne), coque (paroi `e`, dessus ouvert en option), import STEP. **18 tests** Node (volumes attendus à 1e-6 m³, `isValid`, reproductibilité de l'empreinte, STEP aller-retour). Manifeste de dépendances : seul ce paquet importe `occt-wasm`. |
| Modèle typé (`packages/atelier-model`) | Classe **`solide-exact`** (ontologie `drawing`) : `brep` canonique (z relatif au niveau, avant pose), `maillage` / `volume` / `aire` / `faces` dérivés, `pose` (position, angle autour de z), `emprise` (enveloppe convexe du maillage posé, recalculée au déplacement), `moteur` / `versionMoteur` / `empreinteBrep`, `operation` (type, sources, libellé, entrées). Commandes `solideExact.creer` (contrat **`atelier-commands/3`**, les contrats 1 et 2 restent acceptés), `objet.modifier` restreint (nom, calque, pose), déplacer / tourner (pose) ; miroir et échelle **refusés nommément** (un brep ne se met pas à l'échelle sans recalcul). Maillage 3D, vues (coupe de l'emprise), quantités (`solidesExacts { nombre, volume }`), annexe C, IFC (`IfcBuildingElementProxy` type `Fadi_SolideExact`, `IfcTriangulatedFaceSet`, propriétés brep / moteur / empreinte), reprise. **6 tests** + les 371 existants verts. Les objets paramétriques ne sont jamais convertis (R15) : leur extrusion sert d'opérande. |
| Serveur = autorité (`apps/api`) | `apps/api/src/lib/atelier-exact.ts` : toute commande `solideExact.creer` d'un lot (et de `/commands/essai`) est **recalculée** par le même noyau (même paquet, même `.wasm`) ; l'empreinte annoncée par le navigateur doit être retrouvée, sinon **409 motif `exact`** ; une commande sans `operation.entrees` est refusée (400) : un brep ne s'écrit jamais sans avoir été recalculé ici ; les résultats écrits sont ceux du serveur. Routes `GET /projects/:id/atelier/solides-exacts/:objetId/export.step` (STEP AP242 ISO 10303-21, nom de fichier depuis le serveur) et `POST /projects/:id/atelier/import-step?niveauId=…` (un `solide-exact` par solide du fichier, opération `import-step` tracée). Noyau chargé **à la demande** dans le processus Node (jamais au démarrage). **1 test** API (recalcul, 409, STEP aller-retour, délai 120 s). `occt-wasm` est **externe** au bundle esbuild (`apps/api/scripts/build.mjs`) : son chargeur trouve le `.wasm` à côté de lui dans `node_modules` ; le Dockerfile copie les manifestes des paquets `atelier-model`, `planche-model`, `geometry-exact` pour que `npm ci --omit=dev` installe occt-wasm dans l'image. |
| Navigateur (`apps/web`) | Web Worker `exact/exact.worker.ts` + `moteur-exact.ts` : OCCT chargé **au premier choix de l'outil « Solide exact »**, jamais à l'ouverture (contrôlé par la recette : aucune requête `.wasm` avant l'outil, une seule après, servie comme fichier séparé — remplaçable par `localStorage["fadi.occt.wasm"]`, D-177). Outil **Solide exact** (palette, famille Créer, synonymes révolution / balayage / lissage / booléen / trou / coque / brep / occt) : opération choisie dans l'inspecteur, opérandes depuis la sélection (`exact/operations.ts`, **7 tests** : refus nommés quand la sélection ne convient pas), **Aperçu** (volume, faces, empreinte) puis **Créer** : la commande part avec l'opération et la géométrie calculée, le serveur recalcule. Fiche d'un solide exact (volume, aire, faces, moteur, empreinte, opération, **Télécharger STEP**) ; bouton « Exporter STEP » de la barre ; Échanges « Importer → Pièce STEP… ». Plan : emprise dessinée, sélectionnable sur toute sa surface (comme un mur sur son épaisseur), accrochage sur son contour, sélection au cadre ; 3D : maillage dérivé. **53 clés** ajoutées au dictionnaire anglais. |
| Recette navigateur `apps/web/e2e/p2-noyau-exact.mjs` (en CI) | **13 contrôles verts** : aucun `.wasm` à l'ouverture ; niveau, profil, axe et mur posés par le contrat `/3` ; noyau chargé dans un Worker après le choix de l'outil (un seul `.wasm`, fichier séparé) ; l'outil annonce la révolution ; aperçu = volume du tube π(1,2² − 1²) ≈ 1,382 m³, 4 faces, empreinte ; **création : le serveur a recalculé et retrouvé l'empreinte** ; fiche (volume, moteur, empreinte) ; STEP téléchargé (`ISO-10303-21;`) ; **soustraction exacte mur − tube** (le mur reste paramétrique, un nouveau solide exact apparaît) ; 3D sans erreur ; IFC avec `Fadi_SolideExact` ; import STEP du tube exporté (même volume) ; 390 px sans défilement horizontal ; axe-core sans violation critique ou sérieuse. Captures `p2-1-revolution.png` et suivantes dans `atelier-captures/` (artefact CI). |
| Documents | D-182 (`decisions.md`), 9 fiches à « prototype (P2-1) » avec preuves liées, cahier P2 v1.1 (statuts), cahier Atelier (lot optionnel livré), `matrice-echanges.md` (STEP export / import, classe `solide-exact`), `CLAUDE.md`, `README.md`. |

## Contrôles

- `npm run typecheck` ✅ (dont `check-module-deps`) · tests : `geometry-exact` 18, `atelier-model` 378, `core-geometry`,
  `domain-model`, `planche-model`, `api` (dont `atelier-exact.test.ts` ; les tests du contrat passent à `/3`), `web` ✅ ·
  `npm run build` ✅ (Worker en module ES, `occt-wasm` externe côté API) · recette `p2-noyau-exact.mjs` ✅ 13 / 13 ici,
  ajoutée à la CI · recettes existantes non modifiées.
- Chargement mesuré ici : noyau dans le Worker ≈ 1,3 s au premier outil (21 Mo de `.wasm`, cache navigateur ensuite) ;
  aucun coût à l'ouverture (contrôlé).

## Non fait (déclaré)

- **Planche : option « opération exacte » à côté de manifold-3d** (cahier P2 §5, P2-1) — **non fait, reporté** : la
  Planche reste au maillage ; les solides exacts vivent dans l'Atelier (classe `solide-exact`). À reprendre quand une
  ontologie en a besoin (P2-2 : pièces mécaniques), avec le résultat déclaré « exact » ou « maillage » comme prévu.
- Balayage, lissage, trou et coque sont couverts par les tests Node du noyau et par l'outil (opérandes, refus), pas
  par la recette navigateur (qui joue révolution, booléen, STEP) ; les gestes de tracé des profils sont ceux des
  recettes du lot 3a.
- Congés et chanfreins exacts, dépouilles, profils multiples : non spécifiés dans les fiches, non faits.
- STEP : écriture et lecture par OCCT ; aucune conformité AP242 « certifiée » (même règle que l'IFC, D-006) ; les
  attributs produit (PMI, couleurs, assemblages) ne sont pas lus.
- Le délai du Worker (borne annoncée aux fiches) est celui de l'appel ; aucune annulation d'une opération en cours.

## Décisions prises (déléguées, 10.2)

- `occt-wasm` devient une **dépendance du dépôt** (`packages/geometry-exact`, `apps/web`) : conforme à D-177 — le
  binaire `.wasm` LGPL est un fichier séparé, servi par sa propre URL, remplaçable par l'utilisateur et non modifié ;
  l'outillage JavaScript du paquet est MIT OR Apache-2.0 (vérifié au banc P2-0).
- Le **serveur fait autorité** sur chaque solide exact (recalcul + empreinte) plutôt que de faire confiance au brep
  envoyé par le navigateur (R9 : rien d'inventé ni d'altéré ne s'écrit).
- Un solide exact est **sélectionnable sur toute son emprise** dans le plan ; un trait qui la traverse garde la
  priorité à égalité.
- Contrat de commandes porté à **`/3`** (nouvelle classe et nouvelle commande) ; les archives et publications
  enregistrent le contrat courant.

## Ce que le maître d'ouvrage peut vérifier et ce qui lui revient

1. Rejouer la recette (`BASE_URL=… node apps/web/e2e/p2-noyau-exact.mjs`) ou, à la main : outil « Solide exact » sur un
   rectangle et une ligne → Aperçu → Créer ; vérifier qu'aucun `.wasm` n'est demandé avant l'outil (onglet Réseau).
2. Ouvrir la fiche d'un solide exact : volume, empreinte, « Télécharger STEP » ; réimporter le fichier dans un autre
   niveau.
3. Lire D-182 et les 9 fiches « prototype » ; **accepter le lot P2-1** (les fiches passent à « disponible ») puis
   **décider l'engagement de P2-2** (mécanique et assemblages, 4 j), un lot à la fois (D-176).
4. Trancher le report de l'option exacte de la Planche (ci-dessus) : avec P2-2 ou jamais.
