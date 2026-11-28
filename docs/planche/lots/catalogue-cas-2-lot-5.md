# Catalogue, cas 2 « Amélioration d'un élément existant » — lot 5 : emplacement, altitudes et soleil

Dernier lot du cas 2 (suite du lot 8, `catalogue-cas-2-lot-8.md`). Il s'appuie sur les niveaux et le point de base déjà
sur main (cas 4) ; le n° 13 (niveaux comme repères nommés) est repris par le cas 4. Maquettes
(`analyses/catalogue-extensions/cas-2/lot-5/lot5-1..3.png`) validées par le maître d'ouvrage le 28 novembre 2026 à
12 h 05 (heure suisse), avec les deux recommandations qui les accompagnaient : le système vertical reste « non déclaré »
tant qu'aucune source qualifiée n'est chargée ; les Ombres passent à une date du calendrier et à l'heure légale.

## Ce qui est livré (9 entrées)

| n° | Entrée | Où |
|---|---|---|
| 5 | Un seul ±0,00 NGF, cliqué puis tapé en place dans l'Emplacement (Entrée enregistre, Échap abandonne) ; c'est le niveau de référence des Niveaux et le H du point de base. L'ancien champ « Altitude » de l'Emplacement disparaît : la valeur déjà enregistrée (sites, GeoData) est gardée ; reçue de GeoData, elle déclare le ±0,00 s'il ne l'est pas encore, sans jamais remplacer un ±0,00 déclaré ; le site de projet reçoit le ±0,00 d'abord | `panneaux-l5.tsx` `SectionZeroProjet` ; `Planche.tsx` `poserZero`, `appliquerEmplacementGeoData` |
| 92 | Système horizontal choisi dans une liste fermée lue par l'API (systèmes dont Fadi a la définition : EPSG:2154, EPSG:26191 ; un autre système se déclare par son .prj, comme avant) ; vertical « non déclaré » ; rappel dans Info modèle | `GET /sandbox/projections/systemes` (`systemesConnus`, noms dans `SITE_CRS_NOMS`) ; `projections-client.ts` `lireSystemesConnus` ; `SectionSystemes`, `RappelSysteme` |
| 45 | Altitudes basse et haute, relatives au ±0,00 et NGF, et encombrement (longueur × largeur × hauteur) d'un objet, d'une face ou d'une sélection de la racine | `altitudes-l5.ts` `encombrement`, `boiteElements` ; `SectionAltitudes` dans Info entité |
| 18 | Altitude du point visé, relative et NGF, au pied de la vue pendant le dessin | `EtiquetteVise` |
| 55 | Déplacer : Tab fait défiler ce qu'attend Mesures (distance, altitude ±0,00, altitude NGF) ; l'altitude tapée pose le point bas de la sélection | `outils/deplacer.ts` (`saisirAltitude`) ; touche `Tab` de `ContexteOutil` |
| 70 | Pousser-tirer : même défilement ; l'altitude tapée porte la face horizontale cliquée à cette altitude | `outils/pousser-tirer.ts` |
| 77 | Position du soleil calculée par un algorithme de référence, heure solaire vraie et équation du temps affichées dans Ombres | `soleil-l5.ts` `positionSoleil` ; `vue-planche.ts` `majSoleil` |
| 105 | Heure légale : fuseau choisi dans la liste du navigateur, enregistré avec l'Emplacement, décalage (heure d'été comprise) à la date choisie ; sans fuseau, heure solaire comme avant ; la date se choisit au calendrier | `emplacement.ts` (`fuseau`) ; `fuseaux.ts` `decalageLegal` ; `PanneauOmbres` |
| 110 | Course solaire depuis un point : un clic donne le point d'observation ; diagramme stéréographique des 21 juin, 21 mars et 21 décembre, masques formés par les objets de la Planche, périodes masquées en heures | `soleil-l5.ts` `courseSolaire`, `silhouetteMasques` ; outil de pointage `pointage-course-solaire` ; `DiagrammeCourseSolaire` |

Un point posé sur une face (une fenêtre dans une façade) est masqué par le plan de cette face : tout le demi-espace
derrière elle est caché, rien devant ; posé sur le sol, rien n'est caché.

## Règle d'or

Une commande nouvelle, famille `emplacement`, hors catalogue, rangée dans le panneau Ombres :

| Commande | Icône | Raccourci |
|---|---|---|
| `course-solaire` — Course solaire depuis un point | `sunset-2` | Ctrl+Maj+Espace, Maj+T, S |

La maquette lot5-3 annonçait « Ctrl+Maj+Espace puis Maj+S ». Depuis l'encadré par familles (#527, validé le
28 novembre 2026 à 11 h 53), Maj+S est la porte de la famille « Mise en page » et les nouvelles commandes passent par
une porte : la commande prend la famille « Site » (Maj+T) et la touche S (soleil).

Les autres entrées sont des réglages faits dans la vue ou le panneau (±0,00 cliqué, liste des systèmes, Tab dans Mesures,
date et fuseau d'Ombres) : aucun bouton ni raccourci ajouté, conformément aux maquettes.

## Écart à la maquette, déclaré

La maquette lot5-3 annonçait l'algorithme SPA (NREL, Reda et Andreas, 2004). SPA demande les tables de termes
périodiques de sa publication, qui devraient être reprises de la source : la Planche emploie l'algorithme de référence
de la NOAA (d'après J. Meeus), écrit sans bibliothèque. Il est vérifié contre le cas d'essai publié de SPA (Golden,
17 octobre 2003) à moins de 0,05° près (`soleil-l5.test.ts`). La hauteur est géométrique, sans réfraction. Le texte
du panneau Ombres le dit.

## Données

Aucune donnée n'est fournie par le code de l'interface : la liste des systèmes vient de l'API (les deux systèmes dont le
serveur a déjà la définition pour les projections), les fuseaux viennent de la base des fuseaux du navigateur, les
masques ne viennent que des objets de la Planche (relief et bâtiments non modélisés : non évalués). Une altitude NGF est
« non évaluée » tant que le ±0,00 n'est pas déclaré.

## Contrôles

- Modèle : `soleil-l5.test.ts` (8), `altitudes-l5.test.ts` (4), `outils/altitudes-outils-l5.test.ts` (5) ; web :
  `fuseaux.test.ts` (2) ; registres (`registre-sandbox.test.ts`, `registre-interface.test.ts`) et indépendance du module
  (`independance.test.ts` : la nouvelle lecture passe par `projections-client.ts`, seule adresse `/sandbox/projections`).
- API : `sandbox-projections.test.ts` (route `GET /systemes`).
- Recette `apps/web/e2e/planche-emplacement-soleil.mjs` (ajoutée à la CI et à `E2E_DEFAUT`) ; `geodata-emplacements.mjs`
  suit la disparition du champ « Altitude » (l'altitude reçue devient le ±0,00).
