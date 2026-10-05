# Compléments après le lot 9 — compte rendu

Exécuté le 4 octobre 2026 (chef de projet, session unique ; exécution continue décidée en D-010). Décision : D-022.

Ces compléments lèvent quatre limites déclarées par la recette (`recette.md` §7) ; ils n'ouvrent aucune décision
de la section 10.1.

## Fait

| Sujet | Résultat | Preuve |
| --- | --- | --- |
| Historique d'un objet (DA-21-06 -d) | `GET /atelier/objets/:id/historique` : créé, modifié, supprimé (avec successeurs d'une scission), auteur, révision, date ; repli « Historique de l'objet » dans l'inspecteur. | test API « historique d'un objet », e2e `atelier-complements.mjs` |
| Consultation d'un état passé | Bouton « Consulter » sur une entrée du journal (révision reconstituée) et sur une version nommée : modèle affiché en lecture seule, bandeau, barre d'enregistrement masquée, annuler / rétablir bloqués. | e2e |
| Réutilisation de modèle (DA-21-09) | Panneau « Reprendre d'un autre projet » : source (projet ou version nommée), familles, données de projet à cocher, homonymes ; aperçu sans écriture puis reprise en une révision ; rapport (par classe, niveaux, homonymes, à réparer, non repris). | `reprise.test.ts` (3), `commandes.test.ts` (3), test API « reprise », e2e (590 objets du P.118 repris) |
| Références externes (DA-05-11) | Panneau « Références externes » : rattacher la publication d'un autre projet (niveau source, niveau du projet, origine, rotation) ; superposition grise non sélectionnable ; état ; différences puis épinglage de la dernière publication ; détacher. Refus : sans lecture de la source (404), publication ou empreinte fausse, niveau inconnu, référence circulaire directe ou par chaîne (409). | `refexterne.test.ts` (2), test API « références externes », e2e |

## Contrôles

- `npm run typecheck` ✅ · `npm test` ✅ · `npm run build` ✅ (effectifs : `recette.md` §2).
- Recettes `atelier-nouveau`, `atelier-documents`, `atelier-echanges`, `atelier-versions`, `atelier-automatisation`,
  `atelier-complements` et scénario complet verts en local avant le commit ; nouvelle étape CI pour
  `atelier-complements.mjs`.

## Non fait (déclaré dans les fiches)

- Références externes : accrochage sur la source, représentation dans les documents dérivés et la 3D, cache hors
  ligne persistant, réparation d'une référence inaccessible, contrat source plus récent.
- Réutilisation : sélection spatiale, bibliothèques de définitions partagées.

## À vérifier par le maître d'ouvrage

Dans l'Atelier d'une copie de P.118 : sélectionner un mur, ouvrir « Historique de l'objet » ; dans « Complet »,
« Journal » → « Consulter » ; dans un projet vide avec un niveau, « Reprendre d'un autre projet » → Aperçu →
Reprendre ; publier un second projet, puis « Références externes » → Rattacher.

## Second ensemble (D-023)

| Sujet | Résultat | Preuve |
| --- | --- | --- |
| Raccords de murs (lot 3b) | Onglets aux angles, arrêt sur la face aux tés, en plan, en 3D, dans les vues et le DXF ; P.118 : 330 extrémités en angle, 54 en té, 15 non traitées (nœuds multiples), 41 libres. | `raccords.test.ts` (4), captures du plan |
| Coupes remplies en 3D (lot 3b) | Section pleine (couleur assombrie) en coupe N–S / E–O, en plan et en coupe horizontale ; rien sans plan de coupe. | `chapeaux.test.ts` (2), e2e `atelier-complements.mjs`, `10-coupe-remplie.png` |
| Lasso | Outil « Lasso » et Alt + glisser ; objets entièrement entourés ; Maj ajoute. | `nouveau.test.ts`, e2e |
| Fusions successives | Une variante se fusionne de nouveau : seuls ses lots nouveaux sont rejoués ; conflits depuis la dernière fusion. | test API « variante créée… » (étendu) |
| Vues déplaçables sur feuille | Glisser le cadre d'une vue (ou d'une nomenclature), flèches au clavier, ou saisie du centre. | e2e `atelier-documents.mjs` |
| Nomenclatures sur feuille | « Placer un tableau » : tableau du catalogue mis en grille ; lignes hors feuille signalées ; retrait. | `documents.test.ts`, e2e |
| Annotations propres aux coupes et façades | Textes et cotes dans le repère du dessin ; retrait ; empreinte d'origine retrouvée sans annotation. | `documents.test.ts`, e2e |
| Génération des documents hors du fil principal | Vues et feuilles calculées dans un worker (même code pur), repli dans le fil principal sans worker ; façade sud du P.118 : 514 ms jusqu'à l'aperçu (1 856 ms avant, interface bloquée). | e2e `atelier-documents.mjs` (mesure) |

Restent non faits : manipulateur 3D à poignées ; import IFC des annotations,
matériaux et types ; `IfcMaterialLayerSet` ; blocs, `XREF`, hachures et cotes DXF ; DWG ; jonctions de murs à l'export
IFC (rectangles extrudés) ; nœuds de trois murs ou plus.

## Références externes, suite (D-024)

Accrochage sur la source ; dessin dans les plans et détails des documents (téléchargements et publications, avec
les droits du demandeur) et en 3D ; mention « hors ligne » sur la dernière représentation lue. Preuves :
`refexterne.test.ts` (3), test API « références externes » (vue SVG avec et sans droit sur la source), e2e
`atelier-complements.mjs` (3D et document).

## Échanges complétés (D-025)

| Sujet | Résultat | Preuve |
| --- | --- | --- |
| Blocs DXF | `INSERT` décomposés (base, échelles, rotation, réseau, imbrication, calque 0) ; `XREF` signalées. | `echanges.test.ts` « blocs (INSERT)… » |
| Hachures et cotes DXF | `HATCH` → hachure du contour extérieur (motif nommé) ; `DIMENSION` linéaires et alignées → cotes. | idem |
| IFC : type, matériaux, propriétés | Propriétés `ifc:type`, `ifc:materiaux` (couches et épaisseurs), `ifc:epaisseurCouches`, `ifc:<Pset>.<nom>` (avec la mesure IFC). | test API « P.118 exporté… » (fichier `test-corpus/ifc/materiaux-mm.ifc`, en millimètres) |
| IFC : annotations | Textes et traits du niveau ; les textes du P.118 exporté reviennent à l'identique. | idem |

## Composition des parois (D-026)

Couches du type de mur (matériau, épaisseur, fonction) éditées dans l'inspecteur ; cohérence avec l'épaisseur du mur
(collision sinon, correction proposée, jamais faite en silence) ; séparations dessinées en plan et dans les documents ;
`IfcMaterialLayerSet` à l'export. Preuves : `compositions.test.ts` (3), e2e `atelier-complements.mjs`.

## Manipulateur 3D à poignées

Avec l'outil Sélection, deux flèches (X rouge, Y verte) au-dessus de la sélection, de taille constante à l'écran ;
glisser une flèche déplace la sélection le long de l'axe (pas de 1 cm, 10 cm avec Maj ; valeur affichée), le
relâcher produit un lot `transformer.deplacer` ; calque verrouillé : pas de poignées. Preuve : e2e
`atelier-complements.mjs` (« manipulateur 3D »).

## Raccords, suite (D-027)

Nœuds de trois murs avec une paire alignée raccordés comme des tés ; à l'export IFC, murs raccordés extrudés depuis
leur contour raccordé (référence du corpus mise à jour, validée par IfcOpenShell 0.9.0). Preuves : `raccords.test.ts`
(5), `test-corpus/ifc/petit.attendu.ifc`.

## Éditeur guidé de scripts (D-028)

Formulaire de script (paramètres, boucles, commandes du catalogue guidé ou libres), validé à mesure, enregistré en
version du projet ; les scripts intégrés se rouvrent à l'identique. Preuves : `gabarits.test.ts` (3), e2e
`atelier-automatisation.mjs` (« éditeur guidé »).

## Suites (D-029)

Références externes : calque verrouillé et publication « non lisible » (test API, `refexterne.test.ts`) ;
réutilisation par sélection spatiale (`reprise.test.ts`, panneau « Reprendre ») ; anneau de rotation du manipulateur
3D (e2e `atelier-complements.mjs`).

## Suites (D-030, D-031)

IFC : placement propre de chaque mur et `IfcMaterialLayerSetUsage` (`compositions.test.ts`, corpus régénéré et validé
par IfcOpenShell). DXF : cotes radiales, diamétrales et angulaires (`echanges.test.ts`). Bibliothèques partagées :
famille « définitions » de la reprise (`reprise.test.ts`, test API, e2e `atelier-complements.mjs`). Réparation d'une
référence externe par repointage explicite (`refexterne.test.ts`, test API, bouton « Réparer… »).
Raccords des nœuds sans paire alignée unique (Y, croisement de quatre murs) : `raccords.test.ts` (D-032).
Flèche Z du manipulateur 3D pour les objets à décalage de base (e2e `atelier-complements.mjs`, D-033).
Croisements de murs peints d'un seul tenant dans le plan (`raccords.test.ts`, e2e `atelier-complements.mjs`, D-034).
DXF : cotes d'ordonnée (D-035) ; XREF résolues par les fichiers joints (D-036) — `echanges.test.ts`.
Portes : sens d'ouverture et changement d'hôte des ouvertures (`ouvrants.test.ts`, e2e `atelier-complements.mjs`, D-037).
IFC : connexions des murs `IfcRelConnectsPathElements` (`raccords.test.ts`, corpus régénéré, D-038).
Déplacer ou copier vers un autre niveau (`niveaux-transfert.test.ts`, e2e `atelier-complements.mjs`, D-039).
Dupliquer un niveau avec son contenu (`niveaux-transfert.test.ts`, e2e, D-040).
Groupes : renommer, ajouter, retirer (`groupes.test.ts`, e2e, D-041).
Polygone régulier et cercle par trois points (`geometrie-outils.test.ts`, e2e, D-042).
Transformations complémentaires : copies tournées ou à l'échelle, pas irréguliers, prolonger d'une longueur, raccord de rayon nul, scission multiple, joindre (`transformations-plus.test.ts`, e2e, D-043).
Organisation : niveaux (gérer, supprimer avec réaffectation), types (supprimer, substituer), nature d'une ouverture, groupe → bloc (`organisation-plus.test.ts`, e2e, D-044).
Propriétés en tableau (CSV, propriété commune), numérotation des pièces, synthèse de zone, historique CSV (`proprietes-csv.test.ts`, test API, e2e, D-045).
Esquisse : ellipse, rectangles par centre et par 3 points, cercle par 2 points, trame d'axes ; arcs et rectangles transformés corrigés (`esquisse/*.test.ts`, e2e, D-046).
Étirer en entraînant les murs joints, portes doubles et coulissantes, répartition d'ouvertures (`architecture-plus.test.ts`, e2e, D-047).
Vues axonométriques et mesure 3D (`axonometrie.test.ts`, e2e, D-048).
Décalage de contours fermés et en série, chanfrein de sommet, sommets communs, calculs dans les champs (`dessin-plus.test.ts`, e2e, D-049).
Contour détecté, axes des murs, quadrants, repères numérotés, fusion et scission de pièces, fichier de bibliothèque (`pieces-plus.test.ts`, e2e, D-050).
Contraintes : longueurs égales, milieu, sur la ligne, fixe, symétrie, angle ; tolérance de respect au micromètre (`contrainte-plus.test.ts`, e2e, D-051).
Verrous d'objet et de groupe (`verrous.test.ts`, API, e2e, D-052).
Vues 3D enregistrées et éclaté horizontal (`vues3d.test.ts`, e2e, D-053).
Conversion d'esquisses : spline ajustée, courbes en polylignes (`esquisse/conversion.test.ts`, e2e, D-054).
Commentaires attachés aux entrées du journal (API, e2e, D-055).
Zones : appartenance déclarée, imbriquées, sur plusieurs niveaux (`zones.test.ts`, e2e, D-056).
Calques masqués par vue (`documents/calques-vue.test.ts`, e2e, D-057).
Réseau sur trajectoire, aligner ; paramètres d'outil visibles avec une sélection (`reseau-trajet.test.ts`, e2e, D-058).
Usage des dalles, hauteur propre des pièces et espaces, trémie d'escalier (`dalles-pieces.test.ts`, e2e, D-059).
Changer de classe sur place, copie de pièces avec code suivant (`changer-classe.test.ts`, e2e, D-060).
Frontière apparente vérifiée, accrochage « Proche », historique des indices des feuilles (`frontiere-apparente.test.ts`, `historique-feuille.test.ts`, e2e, D-061).
Arc tangent, marques de centre (`geometrie-outils.test.ts`, `calques-vue.test.ts`, `nouveau.test.ts`, D-062).
Segments en arc dans les polylignes, arrondi des sommets, DXF exact (`esquisse/arcs-polyligne.test.ts`, e2e, D-063).
Décalage à angles arrondis, chanfrein multiple, hachure décomposée (`esquisse/decalage-arrondi.test.ts`, D-064).
Référentiels de classification, classification dans l'inspecteur, export IFC des classifications (`referentiels.test.ts`, e2e, D-065).
Filtres d'affichage par classe et ensembles d'affichage locaux ou partagés (`ensembles.test.ts`, e2e, D-066).
Repère altimétrique du site, extrusion d'un profil ouvert, main levée (`altimetrie.test.ts`, `nouveau.test.ts`, e2e, D-067).
Gestion des calques, jonction de deux murs, isolement de la sélection, écart de l'éclaté (`nouveau.test.ts`, e2e, D-068).
Outil Plancher : contour et trémies proposés depuis les murs et les escaliers, interstices, reprise (`plancher.test.ts`, `nouveau.test.ts`, e2e, D-069).
Manipulateur du plan 2D : déplacer selon un axe, tourner, échelle uniforme (`nouveau.test.ts`, e2e, D-070).
Miroir des occurrences de bloc, pas polaire réglable, liaison pièce ↔ espace programmé (`bloc.test.ts`, `nouveau.test.ts`, e2e, D-071).
Motifs de hachure dans les vues et au plan (`hachures.test.ts`, e2e, D-072).
Ajuster et prolonger des polylignes jusqu'à des courbes et des contours, raccord ligne–arc et arc–arc (`ajuster-chemin.test.ts`, D-073).
Cercles et arcs contraignables : rayon, diamètre, tangences (`contraintes-cercles.test.ts`, e2e, D-074).
Éclaté par classe, visite à hauteur d'œil (e2e, D-075).
Propriétés en tableau, décalage des cercles, arcs et polylignes à arcs (`ajuster-chemin.test.ts`, e2e, D-076).
Manipulateur 2D : pivot déplaçable, valeur tapée pendant le glissement (`nouveau.test.ts`, e2e, D-077).
Blocs imbriqués (`bloc.test.ts`, D-078).
Reconnaissance de formes proposée, gomme (`reconnaissance.test.ts`, e2e, D-079).
Calques imbriqués (`calques-imbriques.test.ts`, e2e, D-080).
Notifications ciblées des auteurs d'objets modifiés (`atelier-commands.test.ts`, D-081).
Tangentes imposées des courbes (`tangentes.test.ts`, e2e, D-082).
Fenêtres jumelées et d'angle (`fenetres.test.ts`, e2e, D-083).
Escaliers à volées et paliers (`escaliers.test.ts`, e2e, D-084).
Loupe de précision au doigt (e2e, D-085).
Murs courbes (`murs-courbes.test.ts`, e2e, D-086).
Éclaté par groupe (e2e, D-087).
Échelle d'un escalier, étirer arcs et cercles, propriétés des groupes et calques (tests, e2e, D-088).
Verrou transmis et notifié (`atelier-commands.test.ts`, D-089).
Boîte de coupe et annotations 3D (`vues3d.test.ts`, e2e, D-090).
Repère de saisie (`nouveau.test.ts`, e2e, D-091).
Escalier hélicoïdal, hachures associatives, motif de points (tests, e2e, D-092).
Poignées de tangente au plan (`nouveau.test.ts`, e2e, D-093).
Chanfrein avec un arc, raccord et chanfrein multiples (`chanfrein-arc.test.ts`, e2e, D-094).
Ouvertures sur un mur courbe (`murs-courbes.test.ts`, e2e, D-095).
Pièces et planchers délimités par un arc (`murs-courbes.test.ts`, `nouveau.test.ts`, D-096).
Échange BCF 2.1 des vues 3D (`echanges/bcf.test.ts`, e2e, D-097).
Plancher : trémies choisies une à une, aperçu chiffré au survol (`nouveau.test.ts`, e2e, D-098).
Décalage des courbes et ellipses (`chanfrein-arc.test.ts`, `nouveau.test.ts`, D-099).
Effacement partiel à la gomme (`esquisse/effacer.test.ts`, `nouveau.test.ts`, D-100).
Menuiserie paramétrée des fenêtres (`menuiserie.test.ts`, e2e, D-101).
Cotes rattachées à une occurrence de bloc (`bloc.test.ts`, `nouveau.test.ts`, D-102).
Calques gelés (`calques-imbriques.test.ts`, e2e, D-103).
Raccords avec un mur courbe (`murs-courbes.test.ts`, D-104).
