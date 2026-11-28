# Catalogue, cas 2 « Amélioration d'un élément existant » — lot 8 : outils de modélisation et composants

Suite du lot 7 (`catalogue-cas-2-lot-7.md`) ; le lot 5 (niveaux et point de base) attend toujours le noyau du cas 4.
Maquettes du lot 8 (`analyses/catalogue-extensions/cas-2/lot-8/lot8-1..4.png`) validées par le maître d'ouvrage le
27 novembre 2026 à 22 h 39 (heure suisse) : « Ok pour le lot 8 du cas 2 ». Le 28 novembre 2026 à 1 h 22, le maître
d'ouvrage a demandé de régler les écarts et de se conformer aux maquettes, en réglant par interaction plutôt que par des
commandes et des raccourcis ajoutés : c'est l'état décrit ici.

## Ce qui est livré (21 entrées)

| n° | Entrée | Où |
|---|---|---|
| 39 | Hauteur d'une extrusion lue et modifiable plus tard ; figée (avec le motif) si elle a été retouchée à la main | `modelisation-l8.ts` `lireExtrusion`, `changerHauteurExtrusion` ; panneau « Info entité · Extrusion » |
| 71 | Couches d'un mur en une liste d'épaisseurs, nom facultatif devant chacune (« enduit 0,015 ; maçonnerie 0,175 ») : un groupe par couche, vers l'intérieur ou l'extérieur | `lireCouches`, `creerCouches` |
| 98 | Prolonger une arête jusqu'à une face ou une arête limite | `prolongerArete` |
| 35 | Mur depuis un tracé : préréglage de l'outil Mur du cas 4 (axe tracé dans la vue, accroché au tracé existant, nu de référence réglé à l'outil par Ctrl, angles en onglet), épaisseur = somme des couches saisies | outil Mur et « Murs depuis les arêtes » du cas 4, sans modification ; l'épaisseur de sa barre suit les couches |
| 32, 61 | Composants fenêtre, porte, baie et garde-corps lus d'un fichier d'agence `fadi-composant/1` (source, nom, genre et section du cadre exigés), importés par la dernière entrée de la liste « Composant » ou déposés sur le panneau ; barreaux répartis de bout en bout, vide au plus le vide saisi | `composants-l8.ts` `lireFichierComposant`, `facesComposant`, `nombreBarreaux` |
| 79 | Pose ajustée à la baie visée : trou, baie dessinée, ou mur plein (un clic sur le mur donne le milieu de la largeur, l'allège saisie la hauteur) ; garde-corps sur une arête choisie, ou pointé par ses deux extrémités dans la vue | `poserComposant`, `genreBaie` ; outils de pointage `pointage-baie`, `pointage-garde-corps` |
| 25 | Ouverture découpée qui suit son composant (déplacé, régénéré, remplacé, copié, effacé : le trou est rebouché) | `percer`, `suivreOuvertures`, `boucherTrou` (géométrie libre) ; branché dans `poserHistorique`, même pas d'historique |
| 88 | Remplacer des occurrences en gardant position, balise, nom et données | `definitionDepuisFichier`, `remplacerOccurrences` |
| 68, 72 | Booléens précis loin de l'origine (coordonnées suisses) : calcul dans une origine recentrée, faces recalées sur leurs plans d'origine | `booleenRecentre`, `plansOrigine`, `recalerFaces` ; tous les outils de solides (`outils/solides.ts`) en profitent |
| 99 | Soustraire en gardant la partie retirée, nommée et balisée | `soustraireEnGardant` |
| 16 | Écrêter des volumes par une enveloppe, part retirée chiffrée | `ecreterParEnveloppe` |
| 50 | Caler par deux points (translation, rotation, échelle uniforme) | `matriceCalage`, `calerParDeuxPoints` ; outil de pointage `pointage-caler` |
| 100 | Sélection entre deux altitudes ou dans une boîte 3D (bornée par les altitudes saisies, sinon hauteur cliquée ou tapée au champ Mesures) | `objetsEntreAltitudes`, `objetsDansBoite`, `boiteDeCoins` ; outil de pointage `pointage-boite` |
| 104 | Miroir lisible : l'axe se pointe dans la vue (deux points, plan vertical) ; textes et cotes restent lisibles, les composants qui ont une main gardent leur sens | `miroirLisible`, `planDeMiroir` ; outil de pointage `pointage-miroir` |
| 12 | Projection parallèle réellement orthographique | `vue-planche.ts` `cameraRendue` : une `OrthographicCamera` recalée sur la perspective rend l'image, vise et projette ; `metresParPixel` constant |
| 19 | Axonométrie éclatée par niveau ou balise, sans déplacer le modèle (lecture seule le temps de l'affichage) | `modeleEclate` (modèle d'affichage dérivé) |
| 29 | Échelle graphique sur la vue exacte (longueur ronde, 1:n à 96 ppp) | `echelleGraphique` ; surcouche de `VuePlanche` |
| 15 | Aire projetée en plan : union sans double compte et somme | `empreintesEnPlan`, `aireProjetee` ; `AdaptateurBooleens.aireUnion` (manifold `CrossSection`) |
| 114 | Longueur vraie des courbes (sur la courbe, pas sur ses facettes), écart affiché | `longueurCourbes` ; panneau « Vue orthographique » |

## Règle d'or

Famille `modelisation`, seize commandes, chacune avec son icône Tabler, la barre de son panneau et un raccourci en deux
temps (Ctrl+Maj+Espace, puis un chiffre, avec ou sans Maj ; le chiffre est lu sur la touche physique, AZERTY comme QWERTY) :

| Commande | Icône | Raccourci |
|---|---|---|
| `extrusion-hauteur` — Info entité · Extrusion | `arrow-autofit-height` | Ctrl+Maj+Espace, 1 |
| `creer-couches` — Créer les couches | `stack-3` | Ctrl+Maj+Espace, 2 |
| `prolonger-arete` — Prolonger l'arête | `arrow-bar-to-right` | Ctrl+Maj+Espace, 3 |
| `composants-agence` — Composants dynamiques | `window` | Ctrl+Maj+Espace, 4 |
| `ajuster-baie` — Ajuster à la baie | `aspect-ratio` | Ctrl+Maj+Espace, 5 |
| `remplacer-occurrences` — Remplacer les occurrences | `replace` | Ctrl+Maj+Espace, 6 |
| `soustraire-garder` — Soustraire et garder | `cut` | Ctrl+Maj+Espace, 7 |
| `caler-deux-points` — Caler par deux points | `vector-spline` | Ctrl+Maj+Espace, 8 |
| `selection-altitudes` — Sélectionner entre altitudes | `arrows-vertical` | Ctrl+Maj+Espace, 9 |
| `selection-boite` — Boîte 3D | `box-margin` | Ctrl+Maj+Espace, Maj+9 |
| `miroir-lisible` — Miroir lisible | `flip-horizontal` | Ctrl+Maj+Espace, 0 |
| `ecreter-enveloppe` — Écrêter par l'enveloppe | `crop` | Ctrl+Maj+Espace, Maj+0 |
| `vue-ortho` — Vue orthographique | `perspective-off` | Ctrl+Maj+Espace, Maj+1 |
| `eclater-axonometrie` — Éclater l'axonométrie | `arrows-split` | Ctrl+Maj+Espace, Maj+2 |
| `echelle-graphique` — Échelle graphique | `tallymarks` | Ctrl+Maj+Espace, Maj+3 |
| `aire-projetee` — Mesurer l'aire projetée | `chart-area` | Ctrl+Maj+Espace, Maj+4 |

Correction faite en chemin : une seconde touche Maj + chiffre était lue sans Maj dans le navigateur (un `KeyboardEvent`
étalé perd ses accesseurs) ; test ajouté dans `registre-commandes.test.ts`.

Icônes changées au report de main du 28 novembre 2026 (unicité des pictogrammes) : `caler-deux-points` prend
`vector-spline` (`vector` est à « Feuilles DXF »), `echelle-graphique` prend `tallymarks` (`ruler-measure-2` est à
« Caler le fond »).

## Conformité aux maquettes (écarts réglés le 28 novembre 2026)

Les dix écarts du premier dépôt sont réglés ainsi ; les réglages se font dans la vue ou dans les champs de la maquette.

1. « Mur depuis un tracé » : la commande `murs-en-couches`, la liste « Nu de référence » et le champ « Hauteur du mur »
   sont retirés. Comme la maquette le dit, c'est un préréglage de l'outil Mur du cas 4 : l'épaisseur de sa barre devient
   la somme des couches saisies, l'axe se trace dans la vue (accroché au tracé existant), le nu se règle à l'outil (Ctrl).
2. « Importer un composant » : la commande et le bouton sont retirés ; un fichier arrive par la dernière entrée de la
   liste « Composant » (« Importer un fichier d'agence… ») ou en le déposant sur le panneau, archivé en base d'abord.
3. Miroir : la liste « Axe du miroir » est retirée ; l'axe se pointe dans la vue (deux points), le plan est vertical.
4. Boîte 3D : bornée par les altitudes saisies comme sur la maquette ; sans altitudes, sa hauteur se clique (troisième
   point) ou se tape au champ Mesures, au lieu d'être libre.
5. Écrêter : l'enveloppe reste le dernier solide choisi tant que l'enveloppe du cas 4 n'est pas sur `main` (provisoire).
6. Garde-corps : posé sur une arête choisie, ou pointé par ses deux extrémités dans la vue ; la longueur saisie au champ
   « Longueur » de la maquette l'emporte, dans la direction cliquée.
7. Baie dans un mur plein : un clic sur le mur donne le milieu de la largeur (le point est pris sur le plan du mur
   choisi) ; l'allège saisie donne la hauteur.
8. Couches : un nom facultatif se saisit devant chaque épaisseur (« enduit 0,015 ; maçonnerie 0,175 ; isolant 0,10 »,
   comme la maquette) ; sans nom, « Couche i ». Aucune matière ni balise n'est imposée.
9. Longueur vraie des courbes : au panneau « Vue orthographique », comme la note de la maquette.
10. Projection parallèle : la liste « Projection » du panneau, comme la maquette ; son exactitude vaut pour toute la vue.

## Données

- Aucune donnée inventée : épaisseurs, hauteurs, altitudes, écarts, noms et vides sont saisis ; aucun vide réglementaire
  n'est proposé. Les composants viennent de fichiers d'agence : chaque fichier importé est archivé tel quel en base pour
  le compte (`planche-composant`, version `fadi-composant/1`, `FICHIERS_DU_COEUR` de l'API) avant d'être proposé.
- L'occurrence d'un composant garde le fichier (texte), son archive, son genre, sa main et les valeurs saisies ; son
  ouverture (contour et face d'appui) est gardée sur l'occurrence pour la suivre.

## Contrôles

- `packages/sandbox-planche-model/src/modelisation-l8.test.ts` (16 tests), `composants-l8.test.ts` (9 tests) ;
  `apps/web/src/modules/sandbox/planche/modelisation-l8-manifold.test.ts` (3 tests avec le vrai moteur manifold-3d :
  partie gardée, cotes exactes en coordonnées suisses, écrêtage, aire projetée) ; registres mis à jour ; test d'API de
  l'archive `planche-composant`.
- Recette `apps/web/e2e/planche-modelisation.mjs` (CI, tranche `planche` ; préprod) : verte en local, avec les
  réglages par interaction (import par la liste, baie d'un clic, miroir par deux points, boîte de hauteur tapée,
  préréglage « Mur ») et l'absence de commande hors maquette.
- Non lancé en local : `apps/api/src/app.test.ts` (sa base de test signée n'est pas montée dans ce conteneur) ; le test de
  l'archive `planche-composant` tourne en CI. L'archivage réel est vérifié par la recette (fichier importé, « archivé en
  base »).
