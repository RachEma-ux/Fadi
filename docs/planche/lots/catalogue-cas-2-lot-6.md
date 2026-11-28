# Catalogue, cas 2 « Amélioration d'un élément existant » — lot 6 : échanges, import et export

Suite du lot 4 (`catalogue-cas-2-lot-4.md`) ; le lot 5 (niveaux et point de base) attend le noyau du cas 4. Maquettes du
lot 6 (`analyses/catalogue-extensions/cas-2/lot-6/lot6-1..4.png`) validées par le maître d'ouvrage le 27 novembre 2026 à
19 h 34 (heure suisse) : « Ok. Accepté ».

## Ce qui est livré (9 entrées)

| n° | Entrée | Où |
|---|---|---|
| 2 | Placements IFC composés à l'import, chaque objet à sa place | `echanges-ifc-lecture.ts` `Lecteur.placement` (`IfcLocalPlacement` composé avec ses parents) |
| 6 | Rapport d'échange chiffré joint à chaque import et export (écrit, omis, approché, refusé) | `echanges-l6.ts` `RapportEchange`, `texteRapport` ; panneau `TableauRapport` ; `*.rapport.txt` téléchargé et archivé |
| 22 | Faces polygonales, B-rep et extrusions lues ; représentations non lues comptées et nommées | `lireItem` (triangulation, faces polygonales, extrusions avec vides, B-rep à facettes, éléments projetés) ; `LectureIfc.lues`, `nonLues` |
| 36 | Planche complète exportée et réimportée en fichier natif contrôlé par son empreinte | `enveloppeNatif`, `ouvrirEnveloppeNatif` (format `fadi-planche/1`, SHA-256 `empreinte.ts`) ; panneau « Fichier natif et image » (Alt+F1) |
| 53 | Image de la vue à une définition choisie, fond transparent en option | `VuePlanche.captureDefinition` (cible hors écran, `setViewOffset`), `cadreImage` ; Full HD, QHD, 4K ou saisie jusqu'à 8 192 px |
| 90 | Unité et repère réellement écrits annoncés à l'export | `rapportExport` (`unite`, `repere`) ; panneau « Exporter » |
| 91 | Nom, classe, GlobalId, propriétés et rangement par classe et par étage gardés à l'import IFC | `importerIfc` : groupe par objet (`donnees.ifc`), rangé fichier > étage (ordre des altitudes) > classe ; panneau d'import (arbre, données de l'objet choisi) |
| 95 | Objets masqués et balises éteintes déclarés à l'export, inclus au choix | `objetsNonAffiches`, `preparerExport` ; cases du panneau « Exporter » |
| 112 | Tracé SVG, DXF ou liste de sommets collé depuis une autre application | `lireTraceColle`, `poserTraces` ; panneau « Coller un tracé » (Ctrl+V, Édition > Coller) |

## Règle d'or

Une commande nouvelle, famille `echange` : `natif-image` (icône Tabler `file-database`, barre du panneau « Fichier natif et
image », raccourci Alt+F1). Le panneau « Exporter » s'ouvre par l'entrée existante Fichier > Exporter (format choisi), le
panneau d'import par Fichier > Importer, le panneau « Coller un tracé » par Ctrl+V et Édition > Coller : aucune commande
nouvelle pour eux. La seconde touche N du raccourci en deux temps (« Ctrl+Maj+Espace, N », mécanisme du cas 4, PR #510)
est réservée à `natif-image` et sera ajoutée quand ce mécanisme sera sur `main`.

Ctrl+V : la Planche ne bloque plus le collage du navigateur ; si le presse-papiers porte un tracé reconnu, le panneau
« Coller un tracé » s'ouvre, sinon le collage interne (copie d'objets) a lieu comme avant, après 120 ms.

## Données

- Aucune unité n'est supposée : celle de l'IFC est lue (`IfcSIUnit`, unité convertie), celle du DXF par `$INSUNITS`, celle
  du SVG seulement si la largeur de la racine la porte ; sinon l'unité est demandée et « Coller » reste indisponible.
- Une représentation non lue (surface courbe `IfcAdvancedBrep`, etc.) n'est jamais approchée en silence : l'objet est
  « refusé » et la représentation nommée dans le rapport. Les ouvertures (`IfcOpeningElement`) sont « omises ».
- Le fichier importé et son rapport sont rangés tels quels en base pour le compte (`sandbox_fichiers_extensions`,
  identifiant réservé `planche-echange` du cœur, `FICHIERS_DU_COEUR` dans `routes/sandbox-preferences.ts`).
- Un fichier natif dont l'empreinte ne correspond plus au contenu est refusé (motif « empreinte »), comme un format inconnu.

## Contrôles

`npm run typecheck`, `npm run build` et les tests du modèle (1 226), du web (1 413) et des autres paquets, verts en local.
Les tests de l'API qui demandent une base de test signée ne peuvent tourner qu'en CI (test ajouté : archivage sous
`planche-echange`).

## Recette

`apps/web/e2e/planche-echanges.mjs` (31 contrôles, verte en local le 27 novembre 2026), ajoutée à la CI (tranche `planche`)
et à la préproduction. Recettes voisines relancées en local à cause du changement de Ctrl+V : `planche-objets.mjs` et
`planche-lot-5.mjs`, vertes.
