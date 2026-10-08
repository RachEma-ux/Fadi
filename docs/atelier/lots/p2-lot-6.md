# Lot P2-6 — Surfaces, bâtiment P2, coordination — compte rendu

Exécuté le 8 octobre 2026 (chef de projet, exécution continue avec décisions déléguées, D-183 ; décisions prises
consignées en D-188). Cadre : `docs/atelier-cahier-p2.md` §4 (coordination entre ontologies, réservations, contrôles
de spécification), §5 (lot P2-6), §8 ; R15 (le paramétrique reste canonique). Fiches : DA-03-02 à 08, 11 ; DA-04-05,
06 ; DA-07-08, 09, 11, 13, 14, 18, 19, 20, 21, 23 ; DA-17-04, 05, 06, 10, 11, 14 — à l'état **prototype**.

Critère du cahier : « un projet qui contient un bâtiment, une machine et un réseau ; une collision signalée ; un
mécanisme animé » — joué par la recette `apps/web/e2e/p2-coordination.mjs` sur P.118-C : ontologies réseaux et
mécanique activées sur le bâtiment P.118 ; plafond, rampe, mur-rideau et terrain créés depuis l'inspecteur ; une gaine
qui traverse un mur signalée dans Modifications puis exemptée par une réservation accordée créée depuis l'inspecteur
(refusée : la collision revient) ; une potence (socle fixe + bras sur pivot) animée depuis la fiche de la liaison, le
premier obstacle (mur) relevé, rien n'écrit ; masse volumique sourcée déclarée depuis la fiche ; coque convertie en
surface libre, subdivisée et sculptée depuis la fiche ; tableaux rénovation / chantier ; IFC natif.

## Fait

| Tâche | Résultat |
| --- | --- |
| Bâtiment P2 (socle `building.architecture`) | Classes `plafond` (IfcCovering .CEILING.), `coque` (IfcRoof .FREEFORM., dôme paraboloïdal déclaré), `rampe` (IfcRamp, pente dérivée en % jamais comparée à une règle), `echelle` (IfcStair .LADDER., barreaux à l'entraxe, crinoline), `mur-rideau` (IfcCurtainWall, montants / traverses / panneaux comptés), `terrain` (IfcGeographicElement .TERRAIN., semis triangulé par Delaunay — `geometrie-3d.ts` —, `altitudeTerrain` dans le semis seulement, `terrain.ajouterPoints`), `reservation` (IfcOpeningElement + IfcRelVoidsElement vers l'hôte, statut demandée / accordée / refusée), `installation-chantier` (proxy .PROVISIONFORSPACE., dates ISO contrôlées, phase, hors métrés). Validateurs sans valeur par défaut normative ; géométrie `src/batiment-p2.ts` ; transformations, références, rendu plan, accrochage, sélection ; annexe C complétée. |
| Surfaces libres (`drawing`) | Classe `surface-libre` : maillage de contrôle (faces à 3 ou 4 indices), subdivision de Loop 0–4 (`subdiviserLoop`, 4ⁿ triangles), volume signé ; réducteurs `surfaceLibre.creer / modifier / supprimer / depuisObjet` (conversion **explicite** d'un objet maillé, l'objet reste, origine conservée) `/ deplacerSommet` (édition directe, morphing) `/ subdiviser`. Outil Surface libre (saisie ou conversion de l'objet sélectionné), fiche avec curseur de subdivision et déplacement de sommet. |
| Noyau exact (`packages/geometry-exact`) | Opérations `surface` (grille B-spline `lignes × colonnes` épaissie), `patch` (face non plane tendue sur un contour 3D épaissie), `conge` (toutes les arêtes, refus nommé si le rayon est trop grand) ; validation avant le noyau ; 3 tests (plaque plane 0,1 m³, grille bombée, patch gauche, cube arrondi au volume exact et 26 faces, rayon 0,8 refusé). Outil Solide exact : « Surface (NURBS) » (grille 3 × 3 déduite d'un rectangle, centre relevé), « Patch » (un sommet sur deux relevé), « Congé » (paramètre « Rayon de congé ») ; construction testée (`exact/operations.test.ts`). |
| Coordination (`src/coordination.ts`, `versions.ts`) | `collisionsOntologies` : volumes communs entre corps d'ontologies différentes (`familleCorps` : bâtiment / mep / structure / timber / sheetmetal / mechanical) → collision `ontologies` « réservation ou déplacement à décider », exemptée seulement par une réservation **accordée** couvrant les points de l'emprise commune (sommets intérieurs **et intersections de bords** : une gaine qui traverse un mur n'a aucun sommet dedans) et la tranche d'altitude. `controlesSpecification` → collision `specification` : objet de réseau sans spécification alors qu'une existe pour son système ; fluide ou matériau contredisant la spécification suivie. Servies par `GET /atelier/collisions`, listées dans Modifications. Rien n'est corrigé. |
| Cinématique (`ontologies/mechanical/cinematique.ts`) | `trajectoire(etat, liaison, de, a, n, { collisions })` : poses résolues pas à pas (chaque pas part du précédent), volumes communs par pas (`interferences`), `premierObstacle` ; rien n'est écrit. **Pivot signé** : contrainte `angle-oriente` du solveur (cos et sin autour de l'axe) — le test a montré qu'écrit en cosinus seul, 60° et −60° étaient la même solution et une animation se retournait. Fiche de liaison et fiche de l'assemblage (les liaisons n'ont pas de niveau, le navigateur ne les liste pas) : « Animation du mécanisme » (de, à, pas, bilan, curseur de pas, aperçu SVG des emprises, collisions du pas). |
| Inerties (`ontologies/mechanical/inerties.ts`, `proprietesMasse`) | Volume, centre et tenseur d'inertie d'un maillage fermé (décomposition en tétraèdres, transport au centroïde) ; masse et inertie massique seulement si la pièce porte une **masse volumique déclarée avec sa source** (validateur : source requise, « aucune densité n'est connue du code ») ; assemblage par Huygens, pièces non évaluées listées. Fiche de la pièce : champ et source, « Déclarer » ; fiche de l'assemblage : masse, centre, Izz ou « non évaluées ». |
| Documents, IFC | Tableaux **« Objets par phase (rénovation) »** (phase déclarée sur l'objet, jamais déduite ; « non évaluée » sans phase) et **« Installations de chantier »** (emprise, hauteur, dates, phase) — deux documents de plus (52 / 51 ; 15 tableaux). IFC natif des huit classes du bâtiment P2 + proxy de la surface libre, psets `Fadi_Plafond`, `Fadi_Coque`, `Fadi_Rampe`, `Fadi_Echelle`, `Fadi_MurRideau`, `Fadi_Terrain`, `Fadi_Reservation`, `Fadi_Chantier`, `Fadi_SurfaceLibre` ; matrice complétée. |
| Interface (`apps/web`) | `panneaux/BatimentP2.tsx` : outils **Plafond**, **Coque**, **Rampe**, **Échelle**, **Mur-rideau**, **Terrain**, **Réservation**, **Installation de chantier**, **Surface libre** dans l'inspecteur (contour depuis une esquisse fermée, une dalle ou une pièce sélectionnée, ou rectangle ; axe depuis une ligne ou un mur sélectionné, ou saisi) ; fiches dérivées (pente, comptes de profils, triangles, statut). Outils du socle avec panneau (`panneau: true`) sans sélection préalable. Rendu plan, accrochage, sélection des neuf classes ; 196 clés anglaises. |
| API (`apps/api`) | `atelier-coordination.test.ts` : classes P2 et refus nommés (dates, entraxe), collision gaine × mur dans `/collisions`, réservation demandée (rien) → accordée (exemptée), hôte invalide refusé, contrôle de spécification, conversion en surface libre + subdivision + sommet déplacé, masse volumique sans source refusée / avec source acceptée, tableaux rénovation et chantier (CSV), IFC natif réimporté (IfcCurtainWall, IfcRamp) ; comptes de documents (+2). |
| **Recette** (`apps/web/e2e/p2-coordination.mjs`, en CI) | Contrôles verts : activation réseaux + mécanique ; palette « Plafond » ; plafond, rampe (pente 5 % affichée), mur-rideau (5 / 3 / 8 comptés), terrain (5 points, 4 triangles) créés depuis l'inspecteur et dessinés en plan ; gaine × mur signalée (0,024 m³) et listée dans Modifications ; réservation accordée depuis l'inspecteur → exemptée, refusée → collision de retour ; potence animée 0° → 90° en 7 pas, obstacle au pas 1, libre à 90°, liaison inchangée ; masse volumique : bouton inactif sans source, 3 140 kg avec source, inertie affichée, assemblage « non évaluées » ; coque → surface libre (origine nommée, la coque reste), subdivision 0 → 1 (× 4 faces), sommet relevé ; tableaux rénovation / chantier ; IFC natif ; 52 documents ; un seul écran, un seul journal, bâtiment inchangé, 390 px, axe-core. |

## Contrôles

- `npm run typecheck` ✅ · tests `atelier-model` 444 (dont 17 `batiment-p2.test.ts`), `geometry-exact` 22, web 106
  (dont `exact/operations.test.ts`), API 94 (dont `atelier-coordination.test.ts`) ✅ · `npm run build` ✅ · recette
  `p2-coordination.mjs` verte ici.
- Definition of Done P2 §8 : (1) aucune ontologie nouvelle (bâtiment P2 au socle, déclaré) ✅ ; (2) aucune ontologie
  n'en importe une autre (tests de source inchangés ; `coordination.ts` passe par `interferences` et `CLASSES`) ✅ ;
  (3) aucune constante normative (pas de pente, d'entraxe, de densité dans le code) ✅ ; (4) matrice IFC complétée ✅ ;
  (5) fiches prototype.

## Non fait (déclaré)

- **Surfaces** : raccord (blend) entre deux solides, rayon variable, arêtes vives de subdivision, Catmull–Clark,
  édition directe des faces d'un solide exact, import OBJ / STL (D-188 g).
- **Bâtiment P2** : plafonds inclinés, rampes à paliers, ouvrants de mur-rideau, courbes de niveau et déblais-remblais,
  phasage graphique du chantier.
- **Coordination** : propagation d'une spécification modifiée, réservations proposées automatiquement, export BCF.
- **Mécanique** : vitesses et accélérations, lois de mouvement, plusieurs liaisons pilotées, pset IFC de masse.
