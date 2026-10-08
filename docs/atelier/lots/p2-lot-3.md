# Lot P2-3 — Structure — compte rendu

Exécuté le 8 octobre 2026 (chef de projet, exécution continue avec décisions déléguées, D-183 ; décisions prises
consignées en D-185). Cadre : `docs/atelier-cahier-p2.md` §3.1 (`building.structure` complète), §4, §5 (lot P2-3), §8 ;
D-180 (catalogues sourcés). Fiches : DA-08-01 à 19, DA-03-14, DA-10-10 — à l'état **prototype** (DA-08-19 partiel,
déclaré).

Critère du cahier : « poser une trame de poteaux et de poutres sur P.118, obtenir la nomenclature, exporter en IFC et
l'ouvrir dans un visualiseur tiers » — les trois premiers points sont joués par la recette `apps/web/e2e/p2-structure.mjs`
(25 contrôles verts) ; le quatrième reste une vérification du maître d'ouvrage (D-185 g).

## Fait

| Tâche | Résultat |
| --- | --- |
| Ontologie `structure` activable (cahier P2 §4, T01) | `Ontologie` étendue à `structure` ; `ONTOLOGIES_ACTIVABLES` = [mechanical, structure] ; le poteau reste au socle `building.structure` (libellé « Structure du socle (poteau) ») ; toute classe de structure est refusée tant que l'ontologie n'est pas active ; désactivation refusée tant qu'un objet existe. |
| Modèle `packages/atelier-model/src/ontologies/structure/` | `sections.ts` (formes rectangle / cercle / I / H / T / L / U / tube, contour et aire dérivés, `sectionDepuisCatalogue` : dimensions en mm du CSV sourcé, masse linéique et source citées, erreur nommée si une dimension manque — jamais zéro) ; `geometrie.ts` (balayage d'une section le long d'un segment 3D avec trous, cylindres, boîtes orientées, volume d'un maillage, emprise) ; `trame.ts` (intersections, segments, `planGeneration`, `nommerAxes`) ; `soudures.ts` (assemblages soudés = composantes connexes) ; `index.ts` (réducteurs, `trame.generer`, `coulage.affecter`, suppression en cascade, `controlerStructure`). Test d'isolation : aucun import d'une autre ontologie, aucune constante normative. |
| Classes | `poutre` (axe 3D a → b, za / zb, section typée avec provenance, rôle, matériau déclaré, préfabriqué, trame), `trame` (origine, angle, files, rangs, mémoire de génération), `plaque` (contour, trous, épaisseur, base), `assemblage-structurel` (type, 1 à 4 éléments, platine, grille de boulons), `soudure` (type, deux éléments, gorge, longueur), `armature` (hôte, forme, Ø, tracé, nombre, espacement, nuance), `coulage` (éléments béton, préfabriqué). Validateurs : rien de supposé, formes I / H / T / L / U sans épaisseur refusées. |
| Génération contrôlée (DA-08-05) | Fiche de la trame : aperçu « n poteau(x), m poutre(s) », bouton « Générer (accord) » inactif sans hauteur ni sections ; poteaux (classe du socle, propriété `trame`) aux intersections, poutres entre intersections voisines, axe à hauteur − h/2 ; rejouable sans doublon ; `trame.supprimer { avecObjets }`. |
| Documents, IFC, coordination | Trois tableaux : **Nomenclature de structure** (poteaux, éléments, plaques : section, source du profil, matériau, longueur, volume, masse sourcée ou « non évaluée », préfabriqué, trame, coulage), **Nomenclature des armatures**, **Assemblages de structure et soudures** (paramétriques + soudés dérivés) → documents CSV du catalogue, posables sur feuille. IFC : `IfcGrid`, `IfcBeam` / `IfcMember`, `IfcColumn`, `IfcPlate`, `IfcReinforcingBar`, `IfcFastener` .WELD., `IfcElementAssembly` (.USERDEFINED. et .WELDED.), `IfcGroup` ; `Fadi_Structure`, `Fadi_Armature`, `Fadi_AssemblageStructurel`, `Fadi_Soudure`, `Fadi_Coulage`, `Fadi_AssemblageSoude` ; matrice complétée. Interférences : poutre horizontale et plaque entrent comme corps (collision pièce × poutre détectée). |
| Interface (`apps/web`) | `panneaux/Structure.tsx` : outils **Élément de structure** (deux poteaux, une ligne ou extrémités saisies ; éditeur de section : dimensions en mm ou catalogue sourcé), **Trame**, **Plaque**, **Assemblage structurel**, **Soudure**, **Armature**, **Coulage** ; fiches poutre (section, source, longueur, volume, masse), trame (aperçu, génération), plaque, assemblage, soudure, armature, coulage (volume dérivé, ajout de la sélection) ; rendu plan (bandes de section, axes et bulles de trame, platines, symboles de soudure, armatures), accrochage (axes, intersections, contours), sélection par cadre ; 7 outils dans la palette et la barre à l'activation ; 160 clés anglaises. |
| API (`apps/api`) | Aucune colonne nouvelle (ontologies persistées depuis P2-2) ; `atelier-structure.test.ts` : activation 409 / persistée, trame générée par le serveur et rejouée, catalogue sourcé → poutre par désignation (409 si désignation inconnue), plaque, assemblage, soudures, armature, coulage, trois nomenclatures CSV (masse 112 kg sourcée, « non évaluée »), IFC (8 IfcBeam) réimporté (IfcBeam relu), collision poutre × pièce mécanique ; comptes de documents (+3). |
| **Recette** (`apps/web/e2e/p2-structure.mjs`, en CI) | Sur **P.118-S** (copie de P.118) : activation depuis le navigateur ; trame T1 (A–C × 1–2) créée depuis l'inspecteur, aperçu 6 + 7, accord → 6 poteaux I 200 et 7 poutres I 100 × 200 à 2,9 m ; catalogue sourcé importé (une ligne sans source refusée nominativement), poutre HEA 160 par désignation (masse 152 kg, source citée ; la poutre saisie dit « non évaluée ») ; plaque, assemblage 6 boulons M16, deux soudures, 12 cadres HA 8, coulage ; trois CSV ; feuille S-01 (plan + deux nomenclatures) ; IFC avec toutes les classes, réimporté en lecture ; un seul écran, un seul journal, bâtiment inchangé, aucune erreur, 390 px, axe-core — **25 / 25**. |

## Contrôles

- `npm run typecheck` ✅ (dont `check-module-deps`) · tests `atelier-model` 401 (dont 12 `structure.test.ts`), API 91
  (dont `atelier-structure.test.ts`), web tsc ✅ · `npm run build` ✅ · recettes `p2-structure.mjs` 25 / 25 et
  `interface-anglais.mjs` ✅ ici ; `porte-p1-p2.mjs` inchangée.
- Definition of Done P2 §8 : (1) activation / désactivation par projet sans effet sur les autres ✅ ; (2) aucune ontologie
  n'en importe une autre (test de source) ✅ ; (3) aucune constante normative dans `ontologies/structure/` (test) ✅ ;
  (4) matrice IFC complétée, rapport par classe ✅ ; (5) fiches à l'état prototype (« vérifiée » après relecture,
  « disponible » après acceptation).

## Relecture de la PR #96 (Codex, 8 octobre 2026)

Six constats, tous corrigés et couverts par des tests : (1) une trame supprimée seule laissait ses poutres avec un
`trameId` orphelin — elle détache d'abord ce qu'elle a généré ; (2) `materiau` prenait « acier » par défaut sur une
poutre ou une plaque — requis désormais (rien d'inventé) ; (3) les armatures acceptaient 10 000 barres mais n'en
dessinaient que 400 — 400 au plus, toutes dessinées ; (4) un coulage acceptait tout élément par sa classe — réservé au
béton déclaré (`materiau = beton`, ou propriété « materiau » d'un poteau ou d'une dalle ; la trame enregistre le
matériau choisi sur ses poteaux) ; (5) la virgule décimale des axes de trame était prise pour un séparateur — « ; » ou
espace seulement ; (6) une section de catalogue à parois incompatibles passait sans contrôle — refusée. En CI : nom
d'étape, cases des ontologies à 24 px (axe-core), outil de trame renommé `trame-structure` (il masquait la trame d'axes
du socle), panneau des outils d'ontologie visible au-dessus de la sélection, liens `node_modules` commis par erreur
retirés.

## Non fait (déclaré)

- **Visualiseur tiers** : l'ouverture de l'IFC dans un logiciel externe n'est pas en CI (réimport et contrôle de schéma
  à la place) — vérification du maître d'ouvrage.
- **Profils IFC paramétriques** (`IfcIShapeProfileDef`…) : corps tessellés en P2-3.
- **Plans d'atelier, de ferraillage, de pliage** (DA-08-19, DA-11-04 / 05) : P2-7 ; **génération par règles** : P2-8.
- **Armatures** : maillage simplifié, longueur sans crochets ni recouvrements (valeurs normatives absentes, R3).
- **Assemblages** : géométrie unique (platine normale à l'axe + grille de boulons) pour les cinq types ; aucune
  vérification de résistance, jamais.
- **Masse** : seulement avec masse linéique sourcée ; aucune densité (béton, bois) n'est connue du code.

## Décisions prises (déléguées, D-183)

D-185 (a) à (h) : identifiant `structure` à côté du socle `building.structure`, classes, génération contrôlée, sections
sourcées, correspondances IFC, armatures simplifiées, critère « visualiseur tiers » déclaré, reports.

## Ce que le maître d'ouvrage peut vérifier et ce qui lui revient

- Rejouer `p2-structure.mjs` ; ouvrir `modele.ifc` d'un projet avec structure dans un visualiseur tiers (BlenderBIM,
  BIMvision…) : poteaux, poutres, plaque, armatures et trame doivent apparaître aux bonnes places.
- Fournir un catalogue de profilés sourcé (gabarit `docs/atelier/catalogues/gabarits/profils-acier.csv`) : sans lui, les
  sections se saisissent dimension par dimension et aucune masse n'est calculée.
- Accepter le lot (fiches → « disponible ») ou demander des reprises ; le lot suivant de l'exécution continue est
  P2-4 (bois et tôlerie).
