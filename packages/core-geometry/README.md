# @parcours/core-geometry

Phase 1 de la migration (voir le document de proposition) : isoler les fonctions de géométrie et leurs dépendances réelles, hors DOM, testées, avant toute réécriture d'interface.

## Ce qui est porté dans ce paquet

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

## Ce qui n'est PAS porté — à ne pas combler par supposition

L'extrusion des **poteaux** dépend dans le source de trois fonctions non localisées dans cette passe : `originalShapeData`, `columnShapeMeta`, `ensureColumnProps` — le catalogue des profils de poteaux (SHS, L, creux, composite rempli…). Plutôt que d'inventer cette logique, `buildModelGeometry` accepte un `columnShapeResolver` optionnel :

- **Sans résolveur** : les poteaux sont omis du résultat, et un message explicite apparaît dans `ModelGeometryResult.warnings` (jamais une omission silencieuse).
- **Avec résolveur** : les poteaux sont extrudés normalement (voir le test « extrude les poteaux quand un columnShapeResolver est fourni »).

**Prochaine étape concrète** : localiser et porter le catalogue de profils dans le fichier source (chercher `originalShapeData`, `columnShapeMeta`, `ensureColumnProps` dans le `designer` décodé), ou le redéfinir proprement si le catalogue de profils de poteaux doit de toute façon être revu.

## Ce qui reste à faire pour clore la phase 1 (hors scope de ce paquet)

- Porter `window.V14Bridge` (pont applicatif : parcelle, niveaux, footprint, projet actif) de la même façon — avec tests.
- Cartographier précisément les règles `QA` (280 références dans `esquisser`) avant de les considérer réutilisables en bloc.
- Une fois ces deux paquets extraits et testés, dérouler le jalon **P.118** du document de proposition (preuve de fonctionnement bout-en-bout) avant la phase 3 (écrans React).

## Commandes

```bash
npm install
npm test        # vitest run — 19 tests
npm run typecheck
```

Zéro dépendance runtime : ce paquet n'importe que le DOM `CanvasRenderingContext2D` (type uniquement, pour `drawFaces`), aucune bibliothèque tierce.
