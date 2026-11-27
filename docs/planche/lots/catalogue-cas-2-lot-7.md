# Catalogue, cas 2 « Amélioration d'un élément existant » — lot 7 : versions, jalons, brouillon et fiche du projet

Suite du lot 6 (`catalogue-cas-2-lot-6.md`) ; le lot 5 (niveaux et point de base) attend le noyau du cas 4. Maquettes du
lot 7 (`analyses/catalogue-extensions/cas-2/lot-7/lot7-1..4.png`) validées par le maître d'ouvrage le 27 novembre 2026 à
21 h 16 (heure suisse) : « Ok, implimente ».

## Ce qui est livré (10 entrées)

| n° | Entrée | Où |
|---|---|---|
| 33, 41 | Comparer deux états (jalon, état courant, original ou brouillon) objet par objet : ajoutés, supprimés, modifiés et ce qui a changé | `versions-l7.ts` `comparerModeles` (occurrences de la racine, cotes, textes, plans de coupe ; aspects géométrie, matière, balise, nom, données, état ; géométrie libre comptée à part) ; panneau « Comparer » |
| 48 | Différences surlignées dans la vue 3D | `segmentsDifferences` ; `VuePlanche.poserDifferences` (ajoutés, modifiés, supprimés en pointillés) |
| 38 | Jalon nommé, daté, figé avec son empreinte SHA-256 | `poserJalon`, `contenuJalon`, `lireContenuJalon` (contenu canonique relu contre l'empreinte, refusé s'il a changé) ; `versions-stockage.ts` |
| 40 | Statut et indice de révision sur la Planche, recopiés par chaque jalon | `poserRevision`, `revisionDe` ; statuts proposés : liste `statuts` du gabarit d'agence puis statuts des jalons (`statutsProposes`) |
| 62 | Registre des émissions et partages : date, pièce, indice, format, destinataire déclaré | `noterEmission`, `declarerDestinataire` ; noté à chaque export (IFC, OBJ, STL, .planche, PNG, SVG du plan) et partage |
| 73 | Brouillon d'essai sans toucher l'original : appliquer (un pas d'historique), garder comme variante, abandonner | `InfoPlanche.brouillonDe` ; panneau « Brouillon » et bandeau |
| 76 | Variante dérivée d'un jalon, origine (Planche et jalon) affichée et ouvrable | `InfoPlanche.origine`, `enVariante`, `variantesDe` |
| 86 | Consultation seule (Planche courante ou jalon), mesure permise | état `consultation` de `Planche.tsx` : lecture seule (outils de modification refusés, Ctrl+Z refusé, rien n'est enregistré), bandeau |
| 109 | Fiche du projet saisie une fois, reprise dans les pièces émises | `poserFiche`, `ficheDe`, `lignesFiche` ; `IFCPROJECT` / `IFCSITE`, rapports d'échange, titre et description du SVG du plan |

## Règle d'or

Famille `version`, six commandes, chacune avec son icône Tabler, la barre de son panneau et un raccourci en deux temps
(Ctrl+Maj+Espace, puis une touche ; mécanisme repris tel quel du cas 4, PR #510, pour que la fusion soit sans écart) :

| Commande | Icône | Raccourci |
|---|---|---|
| `versions` — Versions et jalons | `history` | Ctrl+Maj+Espace, V |
| `poser-jalon` — Poser un jalon | `flag` | Ctrl+Maj+Espace, Maj+J |
| `consultation` — Consultation seule | `lock-access` | Ctrl+Maj+Espace, G |
| `comparer` — Comparer deux états | `git-compare` | Ctrl+Maj+Espace, Q |
| `brouillon` — Essayer en brouillon | `git-branch` | Ctrl+Maj+Espace, Maj+V |
| `fiche-projet` — Fiche du projet | `id-badge-2` | Ctrl+Maj+Espace, Maj+F |

Ctrl+Maj+Espace affiche l'encadré des secondes touches. Consultation : du jalon choisi quand « Versions et jalons » est
ouvert, sinon de la Planche courante ; la même commande en sort.

## Écarts déclarés par rapport aux maquettes

- « Nom du jalon » : un champ de saisie au-dessus de « Poser un jalon » (la maquette ne montre pas où le nom est saisi ;
  un jalon exige un nom).
- Destinataire d'une émission : champ de saisie sur la ligne du registre (la maquette montre le destinataire déclaré).
- Statut : champ avec liste proposée (la maquette montre une liste ; la saisie libre reste permise, note du panneau).

## Données

- Aucune donnée inventée : statut, indice, fiche et destinataires viennent de la saisie ; un champ vide reste « non
  renseigné » (écrit absent, `$`, dans l'IFC). Les statuts proposés viennent du gabarit d'agence importé.
- Jalons, registre et brouillons restent dans ce navigateur, comme les Planches de Sandbox (`localStore`, clés
  `sandbox-planche-versions/<planche>` et `sandbox-planche-jalon/<planche>/<jalon>`) ; supprimer une Planche retire ses
  jalons et son registre.
- Cartouche des feuilles : les feuilles (cas 4, PR #495) ne sont pas encore sur `main` ; la fiche y sera reprise après leur
  fusion. Aujourd'hui elle est reprise dans l'IFC, les rapports d'échange et le SVG du plan vectoriel.

## Contrôles

- `packages/sandbox-planche-model/src/versions-l7.test.ts` (10 tests) ; registres mis à jour (`registre-sandbox.test.ts`,
  `registre-commandes.test.ts` : routage des raccourcis en deux temps).
- Recette `apps/web/e2e/planche-versions.mjs` (CI, tranche `planche` ; préprod) : 35 contrôles verts en local.
