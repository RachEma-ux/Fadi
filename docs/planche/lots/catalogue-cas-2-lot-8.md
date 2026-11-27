# Catalogue, cas 2 « Amélioration d'un élément existant » — lot 8 : outils de modélisation et composants

Suite du lot 7 (`catalogue-cas-2-lot-7.md`) ; le lot 5 (niveaux et point de base) attend toujours le noyau du cas 4.
Maquettes du lot 8 (`analyses/catalogue-extensions/cas-2/lot-8/lot8-1..4.png`) validées par le maître d'ouvrage le
27 novembre 2026 à 22 h 39 (heure suisse) : « Ok pour le lot 8 du cas 2 ».

## Ce qui est livré (21 entrées)

| n° | Entrée | Où |
|---|---|---|
| 39 | Hauteur d'une extrusion lue et modifiable plus tard ; figée (avec le motif) si elle a été retouchée à la main | `modelisation-l8.ts` `lireExtrusion`, `changerHauteurExtrusion` ; panneau « Info entité · Extrusion » |
| 71 | Couches d'un mur en une liste d'épaisseurs (un groupe par couche, vers l'intérieur ou l'extérieur) | `lireEpaisseurs`, `creerCouches` |
| 98 | Prolonger une arête jusqu'à une face ou une arête limite | `prolongerArete` |
| 35 | Mur depuis un tracé, nu de référence, angles en onglet, épaisseur = somme des couches saisies | `poserMurs` et `chainesDAretes` du cas 4, réutilisés sans modification |
| 32, 61 | Composants fenêtre, porte, baie et garde-corps lus d'un fichier d'agence `fadi-composant/1` (source, nom, genre et section du cadre exigés) ; barreaux répartis de bout en bout, vide au plus le vide saisi | `composants-l8.ts` `lireFichierComposant`, `facesComposant`, `nombreBarreaux` |
| 79 | Pose ajustée à la baie visée (trou, baie dessinée, mur aux dimensions saisies, arête pour un garde-corps) | `poserComposant` |
| 25 | Ouverture découpée qui suit son composant (déplacé, régénéré, remplacé, copié, effacé : le trou est rebouché) | `percer`, `suivreOuvertures`, `boucherTrou` (géométrie libre) ; branché dans `poserHistorique`, même pas d'historique |
| 88 | Remplacer des occurrences en gardant position, balise, nom et données | `definitionDepuisFichier`, `remplacerOccurrences` |
| 68, 72 | Booléens précis loin de l'origine (coordonnées suisses) : calcul dans une origine recentrée, faces recalées sur leurs plans d'origine | `booleenRecentre`, `plansOrigine`, `recalerFaces` ; tous les outils de solides (`outils/solides.ts`) en profitent |
| 99 | Soustraire en gardant la partie retirée, nommée et balisée | `soustraireEnGardant` |
| 16 | Écrêter des volumes par une enveloppe, part retirée chiffrée | `ecreterParEnveloppe` |
| 50 | Caler par deux points (translation, rotation, échelle uniforme) | `matriceCalage`, `calerParDeuxPoints` ; outil de pointage `pointage-caler` |
| 100 | Sélection entre deux altitudes ou dans une boîte 3D | `objetsEntreAltitudes`, `objetsDansBoite`, `boiteDeCoins` ; outil de pointage `pointage-boite` |
| 104 | Miroir lisible : textes et cotes restent lisibles, les composants qui ont une main gardent leur sens | `miroirLisible` |
| 12 | Projection parallèle réellement orthographique | `vue-planche.ts` `cameraRendue` : une `OrthographicCamera` recalée sur la perspective rend l'image, vise et projette ; `metresParPixel` constant |
| 19 | Axonométrie éclatée par niveau ou balise, sans déplacer le modèle (lecture seule le temps de l'affichage) | `modeleEclate` (modèle d'affichage dérivé) |
| 29 | Échelle graphique sur la vue exacte (longueur ronde, 1:n à 96 ppp) | `echelleGraphique` ; surcouche de `VuePlanche` |
| 15 | Aire projetée en plan : union sans double compte et somme | `empreintesEnPlan`, `aireProjetee` ; `AdaptateurBooleens.aireUnion` (manifold `CrossSection`) |
| 114 | Longueur vraie des courbes (sur la courbe, pas sur ses facettes), écart affiché | `longueurCourbes` ; panneau « Vue orthographique » |

## Règle d'or

Famille `modelisation`, dix-huit commandes, chacune avec son icône Tabler, la barre de son panneau et un raccourci en deux
temps (Ctrl+Maj+Espace, puis un chiffre, avec ou sans Maj ; le chiffre est lu sur la touche physique, AZERTY comme QWERTY) :

| Commande | Icône | Raccourci |
|---|---|---|
| `extrusion-hauteur` — Info entité · Extrusion | `arrow-autofit-height` | Ctrl+Maj+Espace, 1 |
| `creer-couches` — Créer les couches | `stack-3` | Ctrl+Maj+Espace, 2 |
| `prolonger-arete` — Prolonger l'arête | `arrow-bar-to-right` | Ctrl+Maj+Espace, 3 |
| `murs-en-couches` — Mur depuis un tracé | `stack-middle` | Ctrl+Maj+Espace, Maj+5 |
| `composants-agence` — Composants dynamiques | `window` | Ctrl+Maj+Espace, 4 |
| `ajuster-baie` — Ajuster à la baie | `aspect-ratio` | Ctrl+Maj+Espace, 5 |
| `remplacer-occurrences` — Remplacer les occurrences | `replace` | Ctrl+Maj+Espace, 6 |
| `importer-composant` — Importer un composant | `package-import` | Ctrl+Maj+Espace, Maj+6 |
| `soustraire-garder` — Soustraire et garder | `cut` | Ctrl+Maj+Espace, 7 |
| `caler-deux-points` — Caler par deux points | `vector` | Ctrl+Maj+Espace, 8 |
| `selection-altitudes` — Sélectionner entre altitudes | `arrows-vertical` | Ctrl+Maj+Espace, 9 |
| `selection-boite` — Boîte 3D | `box-margin` | Ctrl+Maj+Espace, Maj+9 |
| `miroir-lisible` — Miroir lisible | `flip-horizontal` | Ctrl+Maj+Espace, 0 |
| `ecreter-enveloppe` — Écrêter par l'enveloppe | `crop` | Ctrl+Maj+Espace, Maj+0 |
| `vue-ortho` — Vue orthographique | `perspective-off` | Ctrl+Maj+Espace, Maj+1 |
| `eclater-axonometrie` — Éclater l'axonométrie | `arrows-split` | Ctrl+Maj+Espace, Maj+2 |
| `echelle-graphique` — Échelle graphique | `ruler-measure-2` | Ctrl+Maj+Espace, Maj+3 |
| `aire-projetee` — Mesurer l'aire projetée | `chart-area` | Ctrl+Maj+Espace, Maj+4 |

Correction faite en chemin : une seconde touche Maj + chiffre était lue sans Maj dans le navigateur (un `KeyboardEvent`
étalé perd ses accesseurs) ; test ajouté dans `registre-commandes.test.ts`.

## Écarts déclarés par rapport aux maquettes

- « Mur depuis un tracé » : la maquette décrit le préréglage sans bouton ; ajout d'une commande `murs-en-couches`
  (Maj+5), d'une liste « Nu de référence » et d'un champ « Hauteur du mur » (aucune hauteur par défaut).
- « Importer un composant » (Maj+6) : bouton ajouté au panneau « Composants dynamiques » (la maquette montre la liste des
  fichiers sans dire comment un fichier y arrive).
- Miroir : une liste « Axe du miroir » (axe rouge ou vert) ajoutée ; le plan passe par le centre de la sélection.
- Boîte 3D : tracée à plat, sa hauteur est bornée par les altitudes saisies au champ « Entre les altitudes » quand il est
  rempli, sinon libre.
- Écrêter : l'enveloppe est le dernier solide choisi, tant que l'enveloppe du cas 4 n'est pas sur `main`.
- Garde-corps : posé sur une arête horizontale choisie (sa longueur en est reprise).
- Baie aux dimensions saisies dans un mur plein : centrée en largeur, allège saisie.
- Couches : un groupe par couche (nommé « Couche i · e m »), sans matière ni balise imposée.
- Longueur vraie des courbes : affichée au panneau « Vue orthographique » seulement.
- Projection parallèle : elle est désormais exacte partout (scènes, vues standard, échelle nominale du lot 4 comprises),
  pas seulement depuis ce panneau.

## Données

- Aucune donnée inventée : épaisseurs, hauteurs, altitudes, écarts, noms et vides sont saisis ; aucun vide réglementaire
  n'est proposé. Les composants viennent de fichiers d'agence : chaque fichier importé est archivé tel quel en base pour
  le compte (`planche-composant`, version `fadi-composant/1`, `FICHIERS_DU_COEUR` de l'API) avant d'être proposé.
- L'occurrence d'un composant garde le fichier (texte), son archive, son genre, sa main et les valeurs saisies ; son
  ouverture (contour et face d'appui) est gardée sur l'occurrence pour la suivre.

## Contrôles

- `packages/sandbox-planche-model/src/modelisation-l8.test.ts` (13 tests), `composants-l8.test.ts` (7 tests) ;
  `apps/web/src/modules/sandbox/planche/modelisation-l8-manifold.test.ts` (3 tests avec le vrai moteur manifold-3d :
  partie gardée, cotes exactes en coordonnées suisses, écrêtage, aire projetée) ; registres mis à jour ; test d'API de
  l'archive `planche-composant`.
- Recette `apps/web/e2e/planche-modelisation.mjs` (CI, tranche `planche` ; préprod) : 35 contrôles verts en local.
- Non lancé en local : `apps/api/src/app.test.ts` (sa base de test signée n'est pas montée dans ce conteneur) ; le test de
  l'archive `planche-composant` tourne en CI. L'archivage réel est vérifié par la recette (fichier importé, « archivé en
  base »).
