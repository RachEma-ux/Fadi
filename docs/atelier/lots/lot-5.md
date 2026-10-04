# Lot 5 — Documents dérivés, quantités, objets reportés — compte rendu

Exécuté le 4 octobre 2026 (chef de projet, session unique ; exécution continue décidée en D-010).

Ouvrir : un projet, `?module=atelier`, bouton « Documents » de la barre (à côté de Plan et 3D). Les fichiers produits
apparaissent aussi dans le module Documents, groupe « Vues, feuilles et quantités de l'Atelier ».

## Fait

| Sujet | Résultat |
| --- | --- |
| Vues | `packages/atelier-model/src/documents/vues.ts` : une vue est une définition du modèle (`vue.creer` / `.modifier` / `.supprimer`), son dessin est dérivé. **Plan par niveau** : coupe horizontale des maillages purs à 1,00 m par défaut (D-017, réglable), murs et poteaux coupés en poché avec le **contour de leur union** (plus de traits intérieurs aux jonctions), arêtes vues sous la coupe, symboles de portes (battant conventionnel signalé), fenêtres, escaliers (foulée, flèche), pièces (contour, code, nom, aire calculée), cotes, textes, étiquettes, esquisses, blocs. **Coupe** (trace quelconque, profondeur) et **façade** (nord / sud / est / ouest du quadrillage) : matière coupée en poché, **visibilité par faces** — chaque arête est découpée analytiquement là où une face plus proche la recouvre (intervalles le long de l'arête, grille d'accélération), arêtes = bords des régions planes (ni diagonales de triangulation, ni sommets en T) ; lignes cachées en tirets en option ; repères de niveaux. **Plan de masse** : parcelle convertie explicitement du repère cadastral au repère local (`cadastralVersLocal`), sommets cotés en coordonnées EPSG, aires calculée et officielle, enveloppe des murs extérieurs, toitures et faîtages, flèche du nord du quadrillage. **Détail** : plan découpé par un cadre, à grande échelle. Phases filtrables par vue ; « à démolir » en tirets. |
| Fraîcheur | Chaque vue déclare ses objets dépendants et l'empreinte de ses entrées (`objetsVue`, `empreinteVue`), calculables sans générer le dessin ; feuille : empreinte de ses vues. Au catalogue : à jour tant que révision et empreinte n'ont pas bougé, périmé après une commande. Dans l'Atelier, vue par vue : « non produite », « à jour », « périmée (le dessin a changé) » ou « dessin inchangé, modèle modifié ailleurs ». |
| Annotations attachées | Cotes associatives : l'outil Cotation rattache chaque extrémité posée sur une caractéristique d'objet (`<cote>~a`, `<cote>~b`) ; la cote suit l'objet en plan comme dans les documents et passe « à réparer » (rouge et libellé) quand le mur est scindé ou supprimé. |
| Feuilles et jeux | `documents/feuilles.ts` : formats A0–A4 paysage / portrait, cadre (marge de reliure), vues à leur échelle avec titre, cartouche (projet, titre, numéro, jeu, indice, auteur, date saisie, échelles, révision du modèle, empreinte) ; placement automatique au-dessus du cartouche, avertissement si une vue dépasse le cadre ; `feuille.creer` / `.modifier` / `.placer` / `.retirer` / `.supprimer`. Jeux : paramètre de regroupement des feuilles. |
| Rendus | SVG (vue, feuille), **PDF vectoriel sans dépendance** (une page, Helvetica WinAnsi, pochés remplis, tirets, mêmes octets d'une génération à l'autre), DXF R12 (calques par nature de trait, pochés en SOLID triangulés, repère de la vue en mètres ou feuille en millimètres, origine cadastrale en commentaire). |
| Tableaux et quantités | `documents/tableaux.ts` : pièces, portes, fenêtres, murs (surface nette d'une face, hauteur « non évaluée » quand absente), composants (comptage par définition), synthèse par niveau ; CSV (BOM, « ; », unités en en-tête) et rapport HTML des quantités, datés par la révision et l'empreinte. |
| Catalogue (API) | `apps/api/src/lib/atelier-documents.ts`, routes `GET /projects/:id/documents/atelier/{vues,feuilles}/:id.{pdf,dxf,svg}`, `/tableaux/:type.csv`, `/quantites.html` : produits par le serveur à la révision courante avec le code pur d'`atelier-model`, inscrits au catalogue (révision, empreinte) ; en-têtes `X-Model-Revision`, `X-Input-Hash`. |
| Mode Documents | `apps/web/src/modules/atelier/nouveau/documents/Documents.tsx` : liste des vues, feuilles et tableaux avec fraîcheur ; aperçu calculé dans le navigateur (hors du rendu) ; réglages (échelle, niveau, hauteur de coupe, trace, profondeur, orientation, cadre, lignes cachées, phases) ; placement des vues ; production PDF / DXF / SVG / CSV ; utilisable à 390 px. |
| Esquisse contrainte bornée | `atelier-model/src/contraintes.ts` + `commandes/contrainte.ts` (D-018) : coïncidence, horizontal, vertical, parallèle, perpendiculaire, distance pilotante ou de contrôle ; solveur de Gauss–Newton au plus petit déplacement, rang du jacobien pour les degrés de liberté, refus des contraintes redondantes ou incompatibles (y compris un segment réduit à zéro) ; après toute autre commande : transformation qui violerait une contrainte refusée, geste sur un sommet résolu en tenant ce sommet, contrainte « à réparer » quand son esquisse disparaît. Inspecteur : ajout typé, liste, diagnostic. |
| Blocs et composants | `commandes/bloc.ts` : `bloc.definir` (depuis une sélection d'esquisses, textes, solides ; point de base ; bibliothèque ; composant avec propriétés typées et classification ; redéfinition = version suivante, les occurrences suivent ; option « remplacer la sélection »), `bloc.placer`, décomposition en copies indépendantes ; bibliothèques consultées sans commande ; propriétés effectives (héritées / surchargées) ; solides des composants en 3D. Outil « Placer un bloc » avec recherche. |
| Toitures, garde-corps, phases | Toitures monopente / bipente (convention D-018, faîtage en plan et au plan de masse, volume en 3D) ; classe `garde-corps` (IfcRailing ; plein, vitré ou barreaudage ; hauteur saisie obligatoire) avec outil ; `phase.affecter` (existant / nouveau / à démolir) dans l'inspecteur, en tirets au plan. |

## Contrôles

- `npm run typecheck` ✅ · `npm test` ✅ (core-geometry 47, domain-model 93, **atelier-model 73** dont 27 nouveaux —
  visibilité vérifiable à la main, union des contours, plan / coupe / façade / masse du P.118, fraîcheur par niveau,
  cote associative puis « à réparer », commandes de vues et feuilles, PDF / DXF reproductibles, tableaux, contraintes
  DA-01-07 / 08, blocs et composants DA-05-06 / 07 / 09, toitures, garde-corps, phases — **API 67**, web 20) ·
  `npm run build` ✅.
- Recette `apps/web/e2e/atelier-documents.mjs` (nouvelle, en CI) : **18 contrôles verts** — cote rattachée puis
  « à réparer », toiture bipente, garde-corps, contrainte, bloc et seconde occurrence, phase, vues, feuille A1 à deux
  vues, PDF à jour au catalogue et reproductible, périmé après une commande, tableaux, téléphone, axe-core, aucune
  erreur JavaScript.
- Recette `apps/web/e2e/atelier-nouveau.mjs` : 41 contrôles verts ; scénario complet `parcours-scenario.mjs` : 326 contrôles
  verts, « Scénario conforme. » (catalogue des documents : 7 tableaux et quantités de l'Atelier en plus).
- `⏱` (Chromium headless, rendu logiciel) : nouvelle vue en plan → aperçu 0,26–0,30 s ; façade sud du P.118 complet
  (≈ 37 000 triangles occultants) → aperçu 1,7–1,8 s ; PDF d'une feuille A1 à deux vues produit par le serveur
  1,5 s (≈ 43 Ko).
- Acceptation du cahier : plan et tableau reproduits à la révision courante et périmés après une commande ✅ ; cote
  « à réparer » après scission d'un mur ✅ ; PDF d'une feuille au catalogue ✅ ; quantités identiques entre deux
  générations à la même révision ✅.

## Défauts corrigés pendant le lot

- Arêtes parasites sur les dalles (diagonales de triangulation, ponts vers les trous) : les arêtes sont désormais les
  bords des régions planes, comptés par recouvrement le long de chaque droite.
- Barre de l'Atelier sur deux lignes : le menu « Exporter » s'ouvrait hors de l'Atelier et ne recevait plus les clics ;
  il s'ouvre maintenant vers l'intérieur, et la barre reste sur une ligne jusqu'à 1 280 px.
- Entrée dans un champ de précision vide termine désormais le tracé en cours (contours, polylignes, garde-corps),
  comme Entrée sur le plan.

## Non fait / reporté

- Vue 3D : jonctions de murs et remplissage des coupes restent ceux du lot 3b (les documents, eux, ont l'union des
  contours et les pochés) ; lasso ; manipulateur 3D à poignées.
- Façade d'un grand modèle calculée dans le fil principal (1,8 s sur le P.118) : un Web Worker est la suite naturelle.
- Contraintes : pas de proposition automatique de coïncidence à l'accrochage (la contrainte s'ajoute dans
  l'inspecteur) ; pas de contrainte d'angle, de tangence ni d'arc (jeu borné).
- Feuilles : positions des vues saisies ou automatiques, pas encore déplaçables à la souris ; un seul cartouche
  type ; pas de nomenclature placée sur une feuille.
- Coupes et façades : pas d'annotations propres (cotes de niveau seulement).
- IFC, DXF en import, paquet natif : lot 6.
