# Planche — audit technique outil par outil (7 octobre 2026)

Analyse approfondie du mode Planche après la refonte responsive (PR #84) : chaque outil a été testé individuellement,
d'abord sur sa machine d'états pure (`packages/planche-model`), puis dans le navigateur (Playwright, Chromium, 1536 × 864,
souris et clavier), en lisant l'effet réel sur le modèle par l'instrumentation `window.fadiPlanche` (lecture seule).

## 1. Périmètre et méthode

| Niveau | Ce qui est vérifié | Résultat |
|---|---|---|
| Modèle pur (`vitest`) | 27 fichiers, machines d'états, inférence, saisie Mesures, noyau géométrique | 402 tests verts avant l'audit, **407** après (5 tests ajoutés pour les deux défauts corrigés) |
| Navigateur, outil par outil | nouvelle recette `apps/web/e2e/planche-outils.mjs` : 22 machines + Orbite / Panoramique / Zoom + outils prévus + annuler / rétablir + brouillon | **123 vérifications vertes** après correction (2 défauts trouvés au premier passage) |
| Recettes existantes | `planche.mjs`, `planche-boutons.mjs`, `planche-modification.mjs` | vertes |
| Statique | `npm run typecheck`, `npm run build` | 0 erreur |

Catalogue : 45 outils déclarés (`catalogue-outils.ts`), dont **22 avec machine d'états** (livrés), **3 outils caméra**
gérés par la vue (Orbite, Panoramique, Zoom) et **20 outils « prévus »** (sans machine : grisés avec leur lot, non
activables par la touche, la grille ou la recherche — vérifié : « Mètre : prévu au lot 4 »).

Architecture confirmée par l'audit : la logique des outils est entièrement dans des machines pures (aucune dépendance
React / DOM / three.js), le rendu (`vue-planche.ts`) ne fait que traduire pointeur / clavier en événements et afficher
`vue(etat)` ; l'historique local (un pas par opération, `remplaceDernier` pour les corrections) et le brouillon local
(relu après rechargement) sont tenus par `Planche.tsx`. Cette séparation a permis de localiser les deux défauts dans
le modèle et de les reproduire en test unitaire avant de les corriger.

## 2. Résultat outil par outil

Légende : ✔ conforme ; ✔* conforme après correction dans cet audit ; ◦ observation non bloquante.

| Outil | Activation | Scénarios vérifiés dans le navigateur | Tests unitaires | État |
|---|---|---|---|---|
| Sélection | Espace | clic face / arête ; double-clic face + arêtes ; Ctrl ajoute ; Maj bascule ; clic vide ; cadre fenêtre (5) et croisée ; Suppr efface (1 pas) ; poignée d'extrémité glissée ; Échap | 20 | ✔ |
| Lasso | Maj + Espace | contour polygonal horaire fermé au double-clic (fenêtre, 5) ; anti-horaire (croisée) | 8 | ✔ |
| Gomme | E | arête libre ; arête de face (face suit) ; face seule / vide : rien ; glisser sur 2 arêtes = 1 pas | 13 | ✔ |
| Ligne | L | 2 clics ; chaîne continue ; saisie « 3 » dans la direction du curseur ; boucle → face 12 m² ; 1 pas par segment ; → verrou rouge ; Échap | 19 | ✔ |
| Main levée | recherche | appuyer-glisser-relâcher = 1 courbe ; Ctrl − ré-échantillonne (même pas) ; boucle fermée → face | 9 | ✔ |
| Rectangle | R | clic + « 4;3 » ; correction après coup « 5;2 » (même pas) ; 2 clics ; Ctrl = depuis le centre | 17 | ✔ |
| Rectangle pivoté | recherche | 2 clics puis « 2;90 » → 6 m² au sol | 10 | ✔ |
| Cercle | C | centre + « 2 » (24 côtés) ; « 8s » reconstruit ; rayon « 3 » corrige (même pas) | 15 | ✔ |
| Polygone | recherche | « 2 » → hexagone ; Ctrl = circonscrit (plus grand) | 8 | ✔ |
| Arc (centre) | recherche | centre, départ, « 90 » → courbe sans face, 12 côtés | 10 | ✔ ◦ |
| Arc 2 points | A | départ, fin, flèche « 1 » → courbe, sommet à y = 1 | 12 | ✔ |
| Arc 3 points | recherche | 3 clics → courbe passant par le 2ᵉ point | 9 | ✔ |
| Secteur | recherche | « 90 » → arc 12 côtés + 2 rayons, face ≈ π m² | 4 | ✔ |
| Pousser/Tirer | P | face + « 2 » → boîte 6 faces ; « 3 » corrige (même pas) ; « -1 » pousse | 10 | ✔ |
| Déplacer | M | clic face (base), → « 2 » ; « <0;2;0> » ; Ctrl copie ; « x3 » réseau (1 pas) | 11 | ✔ |
| Faire pivoter | Q | centre, départ, « 90 » → 3 × 4, aire conservée | 8 | ✔ |
| Échelle | S | poignée de coin + « 2 » (8 × 6) ; **poignée de milieu + « 10m » sur une face plate** | 10 → 12 | ✔* |
| Décalage | F | face + « 0,5 » → anneau + face intérieure ; **arête présélectionnée, point de mesure extérieur + « 1 »** | 9 → 12 | ✔* |
| Suivez-moi | recherche | chemin présélectionné (face), clic sur un profil vertical → faces extrudées sur le périmètre | 4 | ✔ |
| Retourner | recherche | → miroir en place (1 pas) ; Ctrl + ← | 6 | ✔ ◦ |
| Diviser | recherche | Segments 5 par défaut ; arête + « 4 » → +3 arêtes, retour à Sélection | 5 | ✔ |
| Orbite | O | glisser tourne la vue | — | ✔ |
| Panoramique | H | glisser déplace la vue, échelle conservée (± 10 %, perspective) | — | ✔ |
| Zoom | Z | glisser change l'échelle ; « 60 » = champ de vision annoncé ; Échap = outil précédent | — | ✔ |
| 20 outils prévus | — | grisés avec leur lot (19 dans la grille, Mètre et Pot de peinture dans la barre) ; la recherche annonce le motif et ne les active pas | 22 (catalogue) | ✔ |
| Historique / brouillon | Ctrl+Z / Ctrl+Y | état restauré à l'identique ; brouillon local relu après rechargement | — | ✔ |

## 3. Défauts trouvés et corrigés

### D1 — Échelle : sur une sélection plate, la poignée visée portait l'axe sans épaisseur

**Symptôme** : face 4 × 3 au sol, outil Échelle, clic sur le milieu du bord droit (4 ; 1,5), saisie « 10m » →
« Dimension cible impossible : la sélection est plate dans cet axe ». Aucune mise à l'échelle.

**Cause** (`echelle.ts`, `poignees()`) : les 26 poignées sont générées pour une boîte 3 × 3 × 3 ; quand la boîte est
plate en z, trois poignées coïncident au même point (face x, arête x·z, coin x·y·z) et `poigneeVisee()` retient la
première rencontrée, celle qui porte l'axe z d'étendue nulle.

**Correction** : un axe plat ne porte plus de poignée (comme les 8 poignées d'une forme 2D dans SketchUp) ; le
« coin » est la poignée qui porte tous les axes actifs (uniforme par défaut). Tests : 8 poignées pour une face au
sol (4 coins x·y, 4 milieux à un axe, aucune sur z) ; milieu du bord droit + « 10m » → largeur 10, hauteur inchangée.

### D2 — Décalage d'une arête seule : le côté du curseur était perdu

**Symptôme** : arête basse du rectangle présélectionnée, clic du point de mesure à l'extérieur (2 ; −1), saisie « 1 »
→ la parallèle est posée **à l'intérieur** (y = 1) et divise la face en deux, alors que le relevé exige « du côté du
curseur » et « aucune face ». Même défaut pour une arête cliquée sans présélection ; le champ Mesures restait à 0,00 m
au survol.

**Cause** (`decalage.ts`) : pour une chaîne rectiligne, le plan de décalage était construit avec le **rayon de visée
lui-même** (`cross(B − A, direction)`) : un plan qui contient le rayon, donc jamais coupé par lui ; le point visé
retombait sur l'arête, le côté était indéterminé et le noyau choisissait l'intérieur.

**Correction** : nouvelle fonction `normaleChaine()` — plan de la chaîne si elle n'est pas rectiligne, sinon plan
d'une face bordant l'arête, sinon plan contenant l'arête et faisant face au rayon ; la distance initiale est calculée
dès le clic. Le noyau `decalerAretes()` était correct (vérifié directement). Tests : point de mesure extérieur →
y = −1 et aucune face ; intérieur → y = 1 ; arête cliquée + curseur à 0,70 m → Mesures « ~ 0,70 m » puis arête à
y = −0,7.

## 4. Observations non bloquantes

- **Retourner + Ctrl + flèche** : la copie miroir par le plan passant par le centre se confond avec l'original, donc
  rien de nouveau n'apparaît, mais un pas « Retourner et copier » est enregistré et la sélection est vidée. Conforme à
  la géométrie, surprenant pour l'utilisateur ; la copie utile passe par le glisser du plan (décalage), non testé au
  navigateur (plans 3D non atteignables simplement par Playwright).
- **Arc, Secteur, Arc 2 / 3 points** : « 12 côtés » s'applique à l'arc lui-même quel que soit l'angle (comme SketchUp),
  et non au cercle complet. Le comportement est cohérent, la fiche pourrait le préciser.
- **Sélection par cadre** : le cadre est un rectangle **écran** ; en perspective, un cadre tracé entre deux points
  monde n'englobe pas forcément la projection de la face. Comportement correct, à garder en tête pour les recettes.
- **Panoramique** : en perspective, les distances projetées varient légèrement (≈ 4 %) lors d'un panoramique ;
  attendu avec une caméra perspective.
- **CI** : l'étape « recherche « zoom » : outil Zoom » de `planche.mjs` a échoué deux fois de suite sur des commits
  intermédiaires de la PR #84 puis est repassée sur le commit final sans changement de ce code ; aucune cause trouvée
  dans la boîte de recherche (filtrage synchrone, Entrée choisit `resultats[rang]`). À surveiller ; si cela se
  reproduit, attendre explicitement la première option avant Entrée (c'est ce que fait la nouvelle recette).
- **Zone cliquable** : dans la vue par défaut (1536 px), les points monde au-delà de x ≈ 8,3 m sortent du canevas ;
  les premiers échecs du script venaient de là, pas des outils. La nouvelle recette garde |x|, |y| ≤ 8.

## 5. Couverture restante et risques

- Non couverts au navigateur (couverts par les tests unitaires) : Gomme avec Ctrl (adoucir) / Maj (masquer) / Alt ;
  Lasso en contour libre (glisser) ; Retourner par glisser du plan ; Suivez-moi sur chemin d'arêtes ; verrous
  ← ↑ ↓ et Maj maintenue des outils de tracé ; réseaux « /3 » ; Diviser par le menu contextuel (absent, lot 5).
- Suivez-moi a 4 tests unitaires seulement (profil + chemin face) ; les cas d'onglet sur chemin ouvert et de profil
  non perpendiculaire ne sont pas testés.
- Les outils prévus (Texte 3D, solides, Pot de peinture, Mètre, Rapporteur, Axes, Cotation, Texte, Plan de coupe,
  Balise, caméras avancées) sont correctement verrouillés ; rien n'est simulé.
- Mobile : couvert par `planche.mjs` (tracé au doigt, modificateurs) et `planche-boutons.mjs` (cibles, disposition) ;
  la recette outil par outil est desktop uniquement.

## 6. Livrables de l'audit

- `packages/planche-model/src/outils/echelle.ts` + tests : poignées d'une sélection plate (D1).
- `packages/planche-model/src/outils/decalage.ts` + tests : plan de décalage d'une arête seule (D2).
- `apps/web/e2e/planche-outils.mjs` : recette outil par outil (123 vérifications), ajoutée à la CI après
  `planche-modification.mjs`.
