# Lot P2-7 — Documentation et échanges P2 — compte rendu

Exécuté le 9 octobre 2026 (chef de projet, exécution continue avec décisions déléguées, D-183 ; décisions prises
consignées en D-189). Cadre : `docs/atelier-cahier-p2.md` §5 (lot P2-7), §6 (DGN / DWG : D-179), §8 ; R3 (rien
d'inventé), R9 (journal). Fiches : DA-14-11, 13, 14, 15 ; DA-15-03, 08 à 16, 18 ; DA-16-09, 16 ; DA-22-07 à 09 —
à l'état **prototype** ; DA-22-02 (DGN) renoncée (D-179) ; DA-22-10 (CloudWorx) sans objet.

Critère du cahier : « feuille de ferraillage, feuille de pliage, nuage affiché derrière le modèle » — joué par la
recette `apps/web/e2e/p2-documentation.mjs` sur P.118-D : feuilles gabarits « production béton » (plan + armatures +
feuille de ferraillage) et « pliage » (plan + table de pliage + débit) créées d'un clic depuis Documents et produites
(SVG, PDF), nuage LAS lu par le serveur et posé derrière le plan avec sa tranche de relevé, plus annotation de
fabrication, cote tolérancée et étiquette intelligente depuis l'inspecteur, isométrique de tuyauterie.

## Fait

| Tâche | Résultat |
| --- | --- |
| Annotations mécaniques et de fabrication | Classe `annotation-fabrication` (`annotation`, IfcAnnotation .SYMBOL.) à quatre types : tolérance géométrique (12 caractéristiques, valeur, références A / B / A-B), soudure (9 cordons, taille, longueur, côté, périphérique, chantier, procédé déclaré), état de surface (Ra / Rz / Rt, procédé, stries), symbole spécialiste. `src/annotations-fabrication.ts` : `texteAnnotation` (texte dérivé), `tracerAnnotation` (cadre case par case, ligne de référence et queue de soudure, cordon côté flèche / opposé, cercle périphérique, drapeau chantier, coche d'état de surface, flèche d'attache — en primitives, aucune police de symboles). Altitude facultative : l'annotation est retenue par les vues axonométriques (DA-15-11). Cote mécanique : `prefixe` (Ø, R, □, M) et `tolerance { plus, moins }` sur la cotation ; texte « Ø1000 +0,1/−0,05 » ou « 500 ±0,2 » (mm) ; écarts négatifs refusés. Étiquette intelligente : `champ` gabarit (`{nom}`, `{repere}`, `{numero}`, `{classe}`, `{niveau}`, `{section}`, `{longueur}`, `{volume}`) résolu à chaque rendu, « non évalué » pour un champ absent, champ inconnu refusé. Vues, plan 2D, DXF, IFC et projection d'analyse portent les textes dérivés. |
| Documents | Vue `isometrique` (projection isométrique en trait unique des réseaux : segments, raccords, vannes, équipements ; repère · section · longueur ; avertissements : aucun réseau, longueurs non mesurables) ; `feuille.gabarit` (atelier, production-acier, production-beton, ferraillage, pliage, isometrique : vue + nomenclatures posées sur un A1 paysage, cartouche non rempli) ; tableaux **« Tableau des perçages »** (trous des opérations exactes — `operation.entrees` désormais conservées, recalculées par le serveur), **« Feuille de ferraillage (pliage des barres) »** (segments, plis, longueur développée géométrique, allongement « non évaluée »), **« Liste de débit »** (groupée par classe, désignation et longueur, sans chute) — trois documents de plus (55 / 54 ; 18 tableaux). |
| Nuages de points | `src/echanges/nuage.ts` : lecteur LAS 1.0–1.4 non compressé (formats de point 0 à 10, échelle et décalage de l'en-tête, compte 64 bits LAS 1.4) et XYZ / PTS texte, écrit dans le dépôt (aucune bibliothèque tierce), décimation régulière (20 000 points au plus), `coupeNuage` ; E57 et LAZ refusés nommément. Classe `nuage-de-points` (`drawing`) : échantillon, bornes, source, pas, **origine déclarée obligatoire** (translation du repère du relevé vers le repère local — jamais devinée), tranche (`coupeZ`, `epaisseurCoupe`) ; déplacement en plan (l'origine suit) ; omis de l'IFC (déclaré). Route `POST /atelier/nuages` (en-têtes nom, niveau, origine, tranche, plafond) → `nuageDePoints.creer` journalisé. Plan 2D : points de la tranche derrière le modèle (3 000 au plus), accrochage des outils de tracé sur ces points (relevé de plans, DA-22-07) ; vues : croix fines (5 000 au plus). |
| Échanges renoncés | DGN (DA-22-02) : renoncé (D-179), fiche à l'état renoncé ; DWG (DA-22-03) inchangé ; CloudWorx (DA-22-10) : sans objet (propriétaire). |
| Interface (`apps/web`) | `panneaux/Documentation.tsx` : outil **Annotation de fabrication** (type, champs par type, aperçu du texte dérivé, flèche attachée à l'objet sélectionné), fiches `FicheAnnotationFabrication`, `FicheCotationMecanique` (préfixe, écarts, aperçu), `FicheEtiquetteIntelligente` (gabarit, champs disponibles, aperçu), outil **Nuage de points** (fichier, nom, origine, tranche, plafond → serveur → relecture), `FicheNuageDePoints` (source, origine, bornes, tranche modifiable). Documents : « Isométrique de tuyauterie » et menu « Feuille gabarit » (six gabarits). Rendu plan (annotation encadrée + flèche, cote tolérancée, étiquette résolue, nuage en tirets), accrochage, sélection ; 111 clés anglaises. |
| API (`apps/api`) | Route `/atelier/nuages` ; libellé de vue `isométrique de tuyauterie` ; `atelier-documentation.test.ts` : annotations et refus nommés, 18 tableaux, isométrique (SVG), feuille gabarit production béton (SVG, PDF), ferraillage / débit / perçages (CSV), IFC .SYMBOL., nuage (origine requise, E57 refusé, LAS lu et posé, tranche), plan SVG avec nuage et cote tolérancée ; comptes de documents (+3). |
| Relecture Codex (PR #100) | (a) Le serveur retire `operation.entrees` après recalcul : le trou d'une opération « trou » est désormais conservé dans `operation.percage` (centre, direction, Ø, profondeur validés par le noyau) et le tableau des perçages le porte **avec la pose du solide** (position et rotation appliquées au centre et à la direction) ; test API sur la vraie route. (b) Le nuage de points est dessiné **derrière** le modèle dans le plan interactif (ordre de tracé) et dans les vues générées (couche de fond avant la projection). (c) Les annotations de fabrication portées par une altitude sont **projetées par la caméra** de l'axonométrie et tracées (symbole, attache, texte), plus seulement déclarées. (d) Rotation, miroir et échelle d'un nuage sont **refusés nommément** : l'origine déclarée du relevé est une translation, seule une translation la garde vraie. |
| **Recette** (`apps/web/e2e/p2-documentation.mjs`, en CI) | 23 contrôles verts : activation structure + réseaux, objets de production ; soudure d'angle a5 créée depuis l'inspecteur sur la poutre (aperçu, flèche) ; cote Ø +1 / −0,5 mm et étiquette `{nom} · {section} · {longueur}` appliquées depuis les fiches et dessinées ; feuilles gabarits production béton et pliage, vue isométrique depuis Documents ; feuille de ferraillage produite (C1, B500B), isométrique (EF-01, 4,00 m), tableaux ferraillage / débit / perçages, 18 tableaux ; nuage LAS de 2 000 points lu (décimé à 1 000), E57 refusé, nuage dessiné derrière le plan, tranche changée depuis la fiche ; un seul écran, un seul journal, bâtiment inchangé, 390 px, axe-core. |

## Contrôles

- `npm run typecheck` ✅ · tests `atelier-model` 456 (dont 8 `p2-7-documentation.test.ts`), `geometry-exact` 22, web 106,
  API 95 (dont `atelier-documentation.test.ts`) ✅ · `npm run build` ✅ · recettes `p2-documentation.mjs` et
  `interface-anglais.mjs` vertes ici.
- Definition of Done P2 §8 : (1) aucune ontologie nouvelle (annotations au socle `annotation`, nuage au `drawing`) ✅ ;
  (2) aucune ontologie n'en importe une autre (inchangé) ✅ ; (3) aucune constante normative (aucune tolérance, rugosité,
  rayon de pliage ni repère supposés : tests) ✅ ; (4) matrice IFC complétée ✅ ; (5) fiches prototype ; DGN / DWG déclarés.

## Non fait (déclaré)

- **Annotations** : classes ISO 286 traduites en écarts, modificateurs GD&T (Ⓜ, Ⓛ), symboles ISO 2553 / 1302 complets,
  PMI STEP AP242, annotations liées aux faces 3D.
- **Documents** : cotation automatique des isométriques, spools, vues de détail par pièce, schémas de façonnage dessinés,
  rayons de pliage sourcés, optimisation de débit.
- **Nuages** : E57 et LAZ, couleurs et intensités, géoréférencement par repère cadastral, reconnaissance de plans ou de
  murs (relevé assisté).
- **DGN / DWG** : renoncés (D-179) ; CloudWorx sans objet.
