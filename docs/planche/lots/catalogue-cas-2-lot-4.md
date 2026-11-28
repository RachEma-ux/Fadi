# Catalogue, cas 2 « Amélioration d'un élément existant » — lot 4 : balises, scènes et gabarit

Suite du lot 3 (`catalogue-cas-2-lot-3.md`). Maquettes du lot 4 (`analyses/catalogue-extensions/cas-2/lot-4/lot4-1..4.png`)
validées par le maître d'ouvrage le 27 novembre 2026 à 18 h 26 (heure suisse) : « Ok ».

## Ce qui est livré (15 entrées)

| n° | Entrée | Où |
|---|---|---|
| 9 | Démarrer depuis un gabarit d'agence (unité, pas, balises, scènes types) | `balises-l4.ts` `lireGabarit`, `modeleDepuisGabarit` ; panneau « Nouvelle Planche » (Ctrl+Maj+9, Alt+8) |
| 11 | État de la vue mémorisé par scène (balises, coupe, style, objets masqués) | `capturerEtatScene`, `appliquerEtatScene` ; panneau Scènes |
| 43 | Échelle nominale en projection parallèle | `Scene.echelle`, `VuePlanche.poserEchelleNominale` (96 ppp) |
| 44 | Scènes types en un clic, existant et démoli compris | `scenesTypes` (liste du gabarit) ; Ctrl+Maj+5 |
| 56 | Existant, à démolir, projeté : balises de phase | `creerBalisesPhase` ; Ctrl+Maj+2 |
| 59 | Profondeur vue limitée au-delà de la coupe | `limiterProfondeur`, `gardeParCoupe`, second plan de rognage de la vue, `plan-vectoriel.ts` |
| 63 | Balises réservées aux cotes, textes et plans de coupe | `reglages.balisesReservees`, `baliserNouveautes` |
| 66 | Plan de coupe placé par distance saisie et par pas | `placerPlan`, `decalerPlan` ; Info entité · Plan de coupe (Ctrl+Maj+6 / Ctrl+Maj+7) |
| 69 | Géométrie nue et annotations balisées | `Arete.balise`, `Face.balise`, `classerSelection` ; Ctrl+Maj+3 |
| 74 | Balise courante posée sur tout ce qui est créé | `baliserNouveautes` dans `poserHistorique` (même pas d'historique) |
| 82 | Balise verrouillée : ni sélection, ni modification | `Balise.verrouillee`, `selection.ts`, `inference.ts` ; Ctrl+Maj+1 |
| 85 | Scène face à la coupe en un geste | `sceneFaceCoupe` ; Ctrl+Maj+8 |
| 108 | Date et heure du soleil par scène | `Scene.soleil` |
| 115 | Épaisseur et type de trait par balise, repris aux sorties | `Balise.epaisseur`, `Balise.trait`, `tiretsDuTrait`, `svgPlan` |
| 116 | Vues d'état (existant, projeté) | `appliquerVueEtat` ; Ctrl+Maj+4 |

## Règle d'or

Douze commandes, familles `balise`, `scene` et `gabarit`, chacune avec son icône Tabler, la barre de son panneau et son
raccourci : `verrouiller-balise` Ctrl+Maj+1, `balises-phase` Ctrl+Maj+2, `classer-selection` Ctrl+Maj+3, `vue-etat`
Ctrl+Maj+4, `scenes-types` Ctrl+Maj+5, `avancer-coupe` Ctrl+Maj+6, `reculer-coupe` Ctrl+Maj+7, `scene-face-coupe`
Ctrl+Maj+8, `gabarit` Ctrl+Maj+9, `importer-gabarit` Ctrl+Maj+0, `enregistrer-gabarit` Alt+7, `creer-planche-gabarit` Alt+8.
Ctrl+Alt+Maj+F1 à F7 sont pris par le cas 4 (planche/calage), Ctrl+Alt+lettre par les extensions ; Ctrl+Maj+chiffre est lu
sur la touche physique (`Digit1`…), comme Alt+chiffre, car Maj change le caractère selon la disposition du clavier.
Icônes du gabarit changées au report de main du 28 novembre 2026, pour rester uniques (règle d'or) face au cas 4 :
`importer-gabarit` `file-arrow-left` (`file-upload` est à « Ouvrir un PDF »), `enregistrer-gabarit` `file-pencil`
(`file-download` est à « Exporter en DXF »), `creer-planche-gabarit` `file-star` (`file-plus` est à « Nouvelle feuille »).
« Vue d'état » n'avait pas de bouton dans la maquette ; la règle d'or (`AGENTS.md`) en exige un : il est ajouté à la barre
du panneau Balises (revue de #507), à la suite de « Verrouiller ».

Balise verrouillée (revue de #507) : en plus du pointeur, « Tout sélectionner » et les extensions de sélection l'ignorent, et
les opérations qui modifient ou effacent (`refuserVerrouilles`) la refusent ; verrouiller retire de la sélection ce qu'elle porte.

## Données

- Aucune épaisseur, couleur, échelle ni liste de scènes n'est fournie par Fadi : elles sont saisies ou viennent du gabarit
  de l'agence. Seules les couleurs de départ des balises de phase créées sans gabarit sont posées, modifiables ensuite.
- Le gabarit (`*.fadi-gabarit.json`, format `fadi-gabarit/1`) doit citer sa source et déclarer au moins une balise. Il est
  rangé tel quel en base pour le compte (`sandbox_fichiers_extensions`, identifiant réservé `planche-gabarit` du cœur,
  `FICHIERS_DU_COEUR` dans `routes/sandbox-preferences.ts`) et gardé avec le modèle (`reglages.gabarit`, texte et archive).
  La liste du panneau « Nouvelle Planche » est relue en base (`GET /sandbox/preferences/fichiers?extension=planche-gabarit`).
- « Enregistrer la Planche comme gabarit » télécharge le fichier et l'archive en base ; rien de la géométrie n'y entre.

## Correctif voisin

La fenêtre « Informations » de la Planche (#467) utilisait la classe `planche-info`, aussi portée par la liste d'Info
entité : le panneau Info entité s'affichait en plein écran. La règle vise désormais `div.planche-info`.

## Recette

`apps/web/e2e/planche-balises-scenes.mjs` (30 contrôles, verte en local le 27 novembre 2026), ajoutée à la CI (tranche
`planche`) et à la préproduction. Recettes voisines relancées en local : `planche-lots-4-6.mjs` (117 vérifications) et
`interface-anglais.mjs`, vertes.
