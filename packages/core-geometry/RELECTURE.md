# Relecture de `core-geometry` (lot 1, tâche L1.5, issue #27)

Relecture fonction par fonction : **garder** (inchangé, éventuellement mieux documenté), **typer** (signature plus
stricte ou repère marqué, sans changement à l'exécution), **adapter** (tolérance reçue en paramètre, cas dégénéré
signalé ; comportement par défaut identique sauf mention). Règles appliquées : R3, R5, R6, R7, R20 ; tolérances
D-012.

## Principes retenus

- **Aucune dépendance nouvelle.** `core-geometry` reste sans dépendance (manifeste `allowedDependencies: []`) ; il
  n'importe ni `atelier-model` ni `domain-model` (qui dépend de lui).
- **Tolérances D-012 reçues en paramètre** (`src/tolerances.ts`). `TolerancesGeometrie` reprend les noms et unités
  de D-012 (`tolCoincidence`, `longueurMin`, `tolAngle`, `aireMin`) : l'objet `TOLERANCES` d'`atelier-model` se
  passe tel quel, sans recopier ses valeurs. Sans tolérance, chaque fonction garde son **seuil historique**
  (`TOLERANCES_HISTORIQUES`, un par site d'usage) : les tests existants et les appelants actuels ne voient aucune
  différence. Une tolérance mal formée (négative, NaN, infinie) lève `ErreurTolerance`.
- **Repères marqués au niveau du type** (`src/reperes.ts`) : `Point2Local`, `Point2Cadastral` = `Point2` + marque
  statique facultative. Un `Point2` non marqué reste accepté partout (rétrocompatible) ; un point marqué `local`
  n'est pas assignable à un point marqué `cadastral` (vérifié par `@ts-expect-error` dans les tests). Les fonctions
  valables dans tout repère plan rendent leurs points dans le repère de l'entrée (générique `P extends Point2`).
  Le repère `geographic` (degrés) n'a pas de marque : aucune fonction du paquet n'a de sens en degrés.
- **Cas dégénérés explicités** : documentés dans la JSDoc de chaque fonction et, pour `buildModelGeometry`,
  signalés dans `diagnostics` (R7) au lieu d'être écartés en silence.
- **R6** : `tsconfig.json` n'inclut plus la bibliothèque `DOM` ; le paquet compile sans elle (`drawFaces` dépend
  de l'interface structurelle `FaceCanvas`).

## Tableau

| Fonction | Fichier | Décision | Motif | Risque |
| --- | --- | --- | --- | --- |
| `Point2`, `Point3` | geometry.ts | garder | Tuples en lecture seule, base de tout le paquet et des appelants. | Aucun repère porté : voir `Point2Local`. |
| `Wall`, `Stair`, `ColumnElement.p`, `PathElement`, `Prism` | geometry.ts | typer | Coordonnées marquées `Point2Local` (repère local du projet) ; `customProfile` documenté comme repère du profil. | Nul à l'exécution ; un appelant qui marquerait `cadastral` serait refusé (voulu). |
| `deepClone` | geometry.ts | garder | Copie JSON fidèle au prototype ; suffisante pour ce modèle sans `Map` / `Date`. | NaN et ±Infinity deviennent `null`, `undefined` disparaît (documenté). |
| `segmentLength` | geometry.ts | garder | Exact (`Math.hypot`). | Aucun. |
| `rotateLocal` | geometry.ts | garder | Rotation autour de l'origine, en radians ; repère du profil, pas du projet. | Aucun. |
| `elevationOf` | geometry.ts | garder | Fidèle ; niveau inconnu → 0 documenté. | R3 : 0 m est une valeur supposée ; désormais signalée par `buildModelGeometry` (`niveau-inconnu`). |
| `findLevel` (nouveau) | geometry.ts | adapter | Distingue « niveau absent » de « altitude 0 », sans changer `elevationOf`. | Aucun. |
| `verticalExtent` | geometry.ts | garder | Fidèle ; sommet sous la base → hauteur nulle documentée. | Inversion base / sommet ramenée silencieusement à 0 : signalée par `buildModelGeometry` (`hauteur-nulle`). |
| `wallPolygon` | geometry.ts | typer | Repère local ; épaisseur 0,20 m du prototype et mur de longueur nulle (sommets confondus) documentés. | R3 : épaisseur supposée, signalée par `buildModelGeometry` (`valeur-prototype`). |
| `stairFootprint` | geometry.ts | typer | Repère local ; largeur 1,20 m du prototype documentée. | R3 : largeur supposée, signalée (`valeur-prototype`). |
| `columnWorldPolygon` | geometry.ts | typer | Seule conversion de repère du fichier (profil → local) : rendue explicite dans le type de retour `Point2Local[]` ; entrée `readonly`. | Angle en degrés (convention du modèle) ; aucun. |
| `polygonIntervalsAtAxis` | geometry.ts | adapter | Largeur minimale d'intervalle = `tol.tolCoincidence` (historique 1e-8 m) ; règle demi-ouverte documentée. | Défaut inchangé. |
| `subtractIntervals` | geometry.ts | garder | Exact, sans tolérance ; précondition (intervalles ordonnés) documentée. | Intervalles inversés non contrôlés (comme le prototype). |
| `cutPrism` | geometry.ts | adapter | Transmet `tol` à `polygonIntervalsAtAxis`. | Défaut inchangé. |
| `prismFaces` | geometry.ts | garder | Fidèle ; typage des points sans `as`. | Couleur de trait codée en dur (rendu). |
| `drawFaces`, `FaceCanvas` | geometry.ts | garder | Peintre naïf fidèle, sans DOM global. Tri **en place** et face vide (profondeur NaN) documentés. | Fonction de rendu dans un paquet pur : à déplacer côté web au lot 3a (question 4). |
| `buildModelGeometry` | geometry.ts | adapter | Géométrie produite inchangée ; 5ᵉ paramètre facultatif `tol` (`longueurMin` : murs 1e-7 m, escaliers 0 ; `tolCoincidence` : fusion d'abscisses 1e-8 m) ; nouveau champ `diagnostics` (codes `mur-degenere`, `hauteur-nulle`, `niveau-inconnu`, `ouverture-orpheline`, `ouverture-largeur-nulle`, `valeur-prototype`, `escalier-degenere`, `escalier-marches-bornees`, `chemin-degenere`, `poteaux-sans-resolveur`) ; `warnings` = leurs messages. | Changement de sortie **justifié par R7** : `warnings` peut désormais contenir des messages là où il était vide (aucun appelant hors du paquet). Escaliers : `z0` lit l'altitude du niveau courant, pas `baseLevel` (prototype, documenté). |
| `ColumnShapeResolver` | geometry.ts | garder | Limite assumée du portage (catalogue de profils absent). | Inchangé. |
| `signedArea` | parcel-geometry.ts | garder | Formule du lacet ; cas < 3 sommets et auto-intersection documentés. | Aucun. |
| `polygonArea` | parcel-geometry.ts | garder | Valeur absolue de l'aire signée. | Contour auto-intersecté : pas une surface (documenté). |
| `isConvexPolygon` | parcel-geometry.ts | adapter | `tol.tolAngle` → test normalisé abs(sin θ) < tolAngle (historique : produit vectoriel absolu 1e-8 m², dépendant de l'échelle). Sommets tous alignés → `true` documenté et testé. | Défaut inchangé ; l'étoile auto-intersectée « convexe » est un cas non traité (comme le prototype). |
| `intersectLines` | parcel-geometry.ts | adapter + typer | Générique sur le repère ; `tol.tolAngle` → parallélisme normalisé (historique : déterminant absolu 1e-9 m²) ; droite indéterminée (`a` = `b`) → `null` documenté. | Défaut inchangé (y compris NaN propagé). |
| `inwardOffset` | parcel-geometry.ts | adapter + typer | Générique (résultat dans le repère de l'entrée) ; `tol.longueurMin` (côté nul, historique 0), `tol.aireMin` (historique 1e-6 m²), `tol.tolAngle`. | **Inchangé** : au-delà de la demi-largeur, le résultat est replié et non `null` (test existant conservé). Détection ajoutée à côté (`offsetInverts`). |
| `offsetInverts` (nouveau) | parcel-geometry.ts | adapter | Détecte un décalage replié (côté de sens opposé au côté d'origine) sans modifier `inwardOffset`. | L'API (`parcel-transmission.ts`) ne l'appelle pas encore (question 2). |
| `parcelCenter` | parcel-geometry.ts | garder | Fidèle ; [0, 0] sans centroïde documenté. | R3 : [0, 0] n'est pas un centroïde calculé. |
| `ParcelLike`, `FloorDesignLevel` | parcel-geometry.ts | typer | Points des tracés de niveau marqués `Point2Local`. | Repère de `ParcelLike` non marqué (question 3). |
| `buildingFootprint` | parcel-geometry.ts | garder | Fidèle ; repères documentés : résultat dans le repère de la parcelle, conversion local → parcelle par ajout du centre. | Sans centroïde, le repli rend des coordonnées **locales** sous le même type : mélange possible (question 3). |
| `projectCode` | parcel-geometry.ts | garder | Fidèle (libellé d'interface). | « V14 » sans projet : libellé hérité du prototype. |
| `ProjectRepository`, `ProjectSummary`, `LevelModel`, `NotImplementedYetError` | project-repository.ts | retiré | Contrat documentaire sans appelant, remplacé par le modèle typé d'`atelier-model`. | Supprimé au lot 4 (L4.2, cahier §5.5). |
| `cross` (interne) | site-zoning.ts | garder | Produit vectoriel. | Aucun. |
| `triangulate` | site-zoning.ts | typer | Générique sur le repère ; cas < 3, > 2000 sommets, 3 sommets alignés (triangle d'aire nulle rendu) et garde-fou inatteignable documentés. Seuil 1e-9 m² nommé mais **non paramétrable**. | Contour auto-intersecté → erreur (voulu). |
| `clipHalfPlane` | site-zoning.ts | adapter + typer | Générique ; `tol.tolCoincidence` (marge de côté, historique 1e-9 m), `tol.aireMin` (historique 1e-8 m²). | Exact pour un convexe seulement (documenté ; l'appelant lui donne des triangles). |
| `sumArea` | site-zoning.ts | garder | Somme d'aires. | Aucun. |
| `cutArea` | site-zoning.ts | adapter + typer | Générique ; transmet `tol` ; cas `wanted` ≤ 0 ou ≥ aire totale documentés. | Précision limitée à 48 itérations (prototype). |
| `siteZoning`, `SiteZoningInput`, `SiteZone` | site-zoning.ts | adapter + typer | Contour et zones marqués `Point2Local` ; 3ᵉ paramètre facultatif `tol` (`longueurMin` sur le côté d'approche, historique 0). | L'aire `c.area` vient de l'appelant, non recalculée (documenté). |
| `SITE_ZONING_RATES`, `SiteVariant`, `SiteZoning` | site-zoning.ts | garder | Taux du prototype, zones d'intention (pas réglementaires). | Variante inconnue → A (appelant non typé). |
| `vertexCentroid` | site-zoning.ts | typer | Générique sur le repère ; liste vide → [0, 0] et sommet de fermeture répété documentés. | Aucun. |
| `TolerancesGeometrie`, `TOLERANCES_HISTORIQUES`, `resoudreTolerance`, `produitVectorielNegligeable`, `ErreurTolerance` (nouveaux) | tolerances.ts | adapter | Réception des tolérances D-012 sans dépendance ni copie de valeurs. | La correspondance seuil historique → champ D-012 est une proposition (question 1). |
| `RepereGeometrie`, `Point2En`, `Point2Local`, `Point2Cadastral`, `enRepere`, `ErreurPointGeometrie` (nouveaux) | reperes.ts | typer | Marque statique de repère (R5) compatible avec les appelants actuels. | Marque facultative : protège dès qu'un appelant marque ses données, pas avant. |

## Signatures publiques modifiées (toutes rétrocompatibles)

- Paramètre final facultatif `tol?: TolerancesGeometrie` : `polygonIntervalsAtAxis`, `cutPrism`,
  `buildModelGeometry` (5ᵉ), `isConvexPolygon`, `intersectLines`, `inwardOffset`, `clipHalfPlane` (5ᵉ), `cutArea`,
  `siteZoning` (3ᵉ).
- Génériques `P extends Point2` (rendent le type de l'entrée, `Point2` pour un appelant actuel) : `intersectLines`,
  `inwardOffset`, `triangulate`, `clipHalfPlane`, `cutArea`, `vertexCentroid`.
- Types de retour plus précis (`Point2Local[]`, assignables à `Point2[]`) : `wallPolygon`, `stairFootprint`,
  `columnWorldPolygon` ; champs `Point2Local` dans `Wall`, `Stair`, `ColumnElement.p`, `PathElement`, `Prism`,
  `SiteZone.polys`, `SiteZoningInput.local`, `FloorDesignLevel.paths[].points`.
- `ModelGeometryResult` gagne le champ `diagnostics` (sortie).
- Ajouts : `findLevel`, `offsetInverts`, `src/reperes.ts`, `src/tolerances.ts` (exportés par `index.ts`).

Appelants (recherche `grep`) : `packages/domain-model` (`site.ts` : `polygonArea`, `siteZoning`, `sumArea`,
`vertexCentroid` ; types `Point2`, `SiteZoning`, `SiteZone`, `SiteVariant` dans `site.ts`, `harmonie.ts`,
`design-review.ts`, `model-analysis.ts`, `concept-preview.ts`), `apps/api` (`parcel-transmission.ts` :
`inwardOffset`, `polygonArea` ; `site-context.ts` : `vertexCentroid` ; `design-context.ts` : `Point2`), `apps/web`
(`lib/api/harmonie.ts` : `SiteZoning` ; `lib/api/parcours.ts` : `Point2`). Aucun n'appelle les fonctions avec des
points marqués : tous reçoivent le même type qu'avant. `domain-model` et `atelier-model` ont été recompilés et
testés ; `apps/api` et `apps/web` n'ont été vérifiés que par lecture (consigne de poste).

## Questions ouvertes

1. **Correspondance des tolérances** : seuils historiques → champs D-012 (`intervalleMin` → `tolCoincidence`,
   `longueurMurMin` → `longueurMin`, produits vectoriels → `tolAngle` normalisé, aires → `aireMin`). À confirmer
   quand D-012 sera figée avec les réducteurs (L1.2) ; la triangulation garde son seuil propre.
2. **Recul de parcelle replié** : `apps/api/src/lib/parcel-transmission.ts` enregistre aujourd'hui l'enveloppe
   repliée d'un recul trop grand comme une enveloppe valide. Faut-il l'y refuser avec `offsetInverts` (hors de la
   zone de cette tâche) ?
3. **Repère de `buildingFootprint`** : sans centroïde de parcelle, le dernier repli rend des coordonnées locales là
   où les deux premiers rendent le repère de la parcelle. Faut-il rendre `null` dans ce cas (changement de
   comportement, à décider) ?
4. **`drawFaces`** (rendu Canvas) dans un paquet de géométrie pure : le déplacer vers `apps/web` au lot 3a ?
5. **Valeurs du prototype** (épaisseur 0,20 m, allège 0,90 m, hauteur 2,10 m, largeur d'escalier 1,20 m,
   12 marches) : désormais signalées ; le modèle typé doit-il les rendre obligatoires pour que ces replis ne
   servent plus (R3) ?
