# @parcours/core-geometry

Phase 1 de la migration (voir le document de proposition) : isoler les fonctions de géométrie et leurs dépendances réelles, hors DOM, testées, avant toute réécriture d'interface.

## Relecture du lot 1 (L1.5)

Voir [`RELECTURE.md`](RELECTURE.md) : décision fonction par fonction (garder / adapter / typer), repères marqués au
niveau du type (`src/reperes.ts` : `Point2Local`, `Point2Cadastral`), tolérances D-012 reçues en paramètre
facultatif (`src/tolerances.ts`, seuils historiques par défaut), cas dégénérés de `buildModelGeometry` signalés dans
`diagnostics`. Tests : `src/relecture.test.ts`.

## `geometry.ts` — noyau géométrique (`V14Geometry`)

Toutes les fonctions ci-dessous sont un portage fidèle — pas une réécriture — du code trouvé dans `EMB.designer` (module `designer` / Atelier) de `Parcours_V8_19_Escalier_B_Mezzanine.html`, assignées dans le source à `window.V14Geometry` :

| Export | Origine (nom dans le source) |
| --- | --- |
| `deepClone` | `deep` |
| `segmentLength` | `len` |
| `rotateLocal` | `rotateLocal` |
| `elevationOf` | `elevationOf` |
| `verticalExtent` | `vertical` |
| `wallPolygon` | `wallPoly` |
| `stairFootprint` | `stairFoot` |
| `columnWorldPolygon` | `fd3dColumnWorldPoly` |
| `polygonIntervalsAtAxis` | `polyIntervals` |
| `subtractIntervals` | `subtractIntervals` |
| `cutPrism` | `cutPrism` |
| `prismFaces` | `prismFaces` |
| `drawFaces` | `drawFaces` |
| `buildModelGeometry` | `modelGeometry` |

19 tests unitaires (`src/geometry.test.ts`) couvrent chaque primitive avec des valeurs numériques vérifiables à la main (pas de simple "ça ne plante pas").

### Ce qui n'est PAS porté — à ne pas combler par supposition

L'extrusion des **poteaux** dépend dans le source de trois fonctions non localisées dans cette passe : `originalShapeData`, `columnShapeMeta`, `ensureColumnProps` — le catalogue des profils de poteaux (SHS, L, creux, composite rempli…). Plutôt que d'inventer cette logique, `buildModelGeometry` accepte un `columnShapeResolver` optionnel :

- **Sans résolveur** : les poteaux sont omis du résultat, et un message explicite apparaît dans `ModelGeometryResult.warnings` (jamais une omission silencieuse).
- **Avec résolveur** : les poteaux sont extrudés normalement (voir le test « extrude les poteaux quand un columnShapeResolver est fourni »).

**Prochaine étape concrète** : localiser et porter le catalogue de profils dans le fichier source (chercher `originalShapeData`, `columnShapeMeta`, `ensureColumnProps` dans le `designer` décodé), ou le redéfinir proprement si le catalogue de profils de poteaux doit de toute façon être revu.

## `parcel-geometry.ts` — géométrie de parcelle

Également extrait de `EMB.designer`, utilisé par la façade de stockage du prototype (`inset`) et les calculs de centre/emprise de parcelle : `signedArea`, `polygonArea`, `isConvexPolygon`, `intersectLines`, `inwardOffset` (recul de parcelle), `parcelCenter`, `buildingFootprint`, `projectCode`.

Portage fidèle de la logique ; signatures modifiées pour recevoir leurs données en paramètre plutôt que de les lire d'un état global caché (c'est précisément ce qui les rend pures et testables). 22 tests dans `src/parcel-geometry.test.ts`, y compris un cas qui **documente** un comportement réel non intuitif plutôt que de le corriger silencieusement : au-delà de la demi-largeur, `inwardOffset` inverse le polygone au lieu de renvoyer `null` — il n'y a pas de garde contre l'auto-intersection dans le code source d'origine.

## Ce qui reste à faire pour clore la phase 1

- Localiser et porter le catalogue de profils de poteaux (`originalShapeData`, `columnShapeMeta`, `ensureColumnProps`).
- Cartographier précisément les règles `QA` (280 références dans `esquisser`) avant de les considérer réutilisables en bloc.
- Dérouler le jalon **P.118** (jalon 7 de `docs/architecture.md`, preuve de fonctionnement bout-en-bout) avant la migration des 21 étapes.

## Commandes

```bash
npm install
npm test        # vitest run — 81 tests (47 d'origine + 34 de la relecture L1.5)
npm run typecheck
```

Zéro dépendance runtime, aucune bibliothèque tierce, aucune API navigateur (R6) : `tsconfig.json` n'inclut pas la bibliothèque `DOM` ; `drawFaces` dépend de l'interface structurelle `FaceCanvas`, qu'un `CanvasRenderingContext2D` satisfait.
