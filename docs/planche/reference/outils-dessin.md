# SketchUp pour le Web — Outils de DESSIN (référence de recréation pour le module « Planche » de Fadi)

Session de test en direct du 2026-10-06, sur app.sketchup.com, modèle vierge « Decimal - Meters », offre gratuite.
Légende :
- **[OBS]** = observé en direct (clic/clavier réels, barre d'état et champ de saisie lus dans le DOM).
- **[INSTR]** = texte du panneau Instructor (aide contextuelle intégrée), non vérifié sauf mention contraire.
- **[NV]** = non vérifié ou impossible à tester avec l'automatisation.

> Note de méthode : les touches modificatrices (Ctrl, Shift, Alt) envoyées comme « appui de touche » par l'automatisation n'étaient PAS prises en compte. En envoyant de vrais `keydown`/`keyup` sur le `<canvas id="canvas">`, Ctrl et Shift ont fonctionné, Alt aussi (pour l'arc). Conséquence pour l'implémentation : SketchUp suit l'**état** des modificateurs via keydown/keyup, pas via `event.shiftKey` au moment du clic. Ctrl et Alt agissent en **bascule** (un appui = changement de mode). Shift agit en **maintien** (actif tant que la touche est enfoncée).

---

## 0. Interface commune (tous les outils)

**[OBS]**
- **Barre d'outils verticale à gauche**, de haut en bas : Search (Shift+-), Select (Space), Eraser (E), Line (L), Rectangle (R), Push/Pull (P), Move (M), Rotate (Q), Scale (S), Paint (B), Orbit (O), Pan (H), Tape Measure (T), puis un emplacement qui change (dernier outil étendu utilisé : 2 Point Arc (A), Polygon, Circle (C)…), puis « ⋯ » qui ouvre la grille d'outils étendus. L'outil actif a un liseré bleu à gauche.
- **Grille étendue (« ⋯ »)**, panneau flottant blanc, par sections :
  - Sélection : Lasso (Shift+Space), Sample Material
  - Dessin : Circle (C), 2 Point Arc (A), Arc, Polygon, 3 Point Arc, Pie, Freehand, Rotated Rectangle, 3D Text
  - Modification : Offset (F), Follow Me, Flip, Outer Shell, **Intersect / Union / Subtract / Trim / Split grisés** (opérations solides, réservées aux offres payantes ou inactives sans solides sélectionnés)
  - Construction : Dimensions, Protractor, Axes, Text, Section Plane, Tag
  - Caméra : Zoom, Zoom Extents, Zoom Window, Position Camera, Look Around, Walk
  - AI Assistant, AI Render (pas testés, conformément aux consignes)
  - Bouton « Edit » en bas (personnaliser la grille).
- **Barre d'état** (en bas à gauche, après les icônes ?, globe, souris) : texte d'aide propre à l'outil et à l'étape, ses segments séparés par « | ».
- **Champ de mesures (VCB)** en bas à droite : `<input id="measurements-box">` précédé d'un libellé qui change (Measurements / Length / Dimensions / Sides / Radius / Inscribed Radius / Circumscribed Radius / Angle / Bulge / Length, Angle / Width, Angle / Distance).
  - Pendant le déplacement de la souris, il affiche la valeur courante. Préfixe **« ~ »** quand la valeur est approximative (inférence non exacte), par ex. `~ 8.25 m`, `~ 1.93 m, 0.59 m`.
  - Après une saisie, il affiche ce qui a été tapé (`3m`, `4m,3m`, `1.5m`, `8`, `6s`).
  - On tape **directement au clavier sans cliquer dans le champ**. Entrée valide. La valeur s'applique à l'opération en cours, ou à la **dernière opération terminée** (on peut corriger un objet juste après l'avoir créé).
  - Unité facultative (`3 m` ou `3`), séparateur décimal « . », séparateur de valeurs multiples « , ».
- **Panneau Instructor** (colonne de droite, bouton « Instructor ») : un iframe `helpcontent/tool/<id>/index.html` avec une animation, puis les rubriques Tool Operation, Modifier Keys et Tips. Il se met à jour quand on change d'outil (avec un léger retard).
- **Échap** annule l'opération en cours et ramène l'outil à sa 1re étape (l'outil reste actif). Si une boîte d'alerte est ouverte, Échap ferme d'abord l'alerte.
- **Infobulles d'inférence** : petit cartouche blanc à bordure grise, texte noir, près du curseur.
- **Couleurs des axes** : rouge = X, vert = Y, bleu = Z. Les axes sont pleins du côté positif et pointillés du côté négatif.

---

## 1. Select — « Select (Space) »

- **Icône** : flèche noire de pointeur.
- **Barre d'état [OBS]** : `Click or drag to select objects. Shift = Add/Subtract. Ctrl = Add. Shift + Ctrl = Subtract.`
- **VCB [OBS]** : « Measurements », vide.

**Observé en direct [OBS]**
- **Clic simple sur une face** : la face seule est sélectionnée, rendue avec une **trame de points bleus**. Ses arêtes ne sont pas sélectionnées.
- **Double-clic sur une face** : la face et ses arêtes bordantes sont sélectionnées (arêtes en **bleu**).
- **Triple-clic** : tout ce qui est connecté est sélectionné (les 2 faces adjacentes et toutes leurs arêtes).
- **Clic sur une courbe** (arc, polygone, arc 2 points) : la **courbe entière** est sélectionnée en un seul objet (tous ses segments en bleu).
- **Clic dans le vide** : tout est désélectionné.
- **Rectangle de sélection de gauche à droite (fenêtre)** : seuls les éléments **entièrement contenus** sont sélectionnés. Test : seules 2 arêtes entièrement incluses, aucune face partiellement incluse.
- **Rectangle de droite à gauche (croisée)** : tout ce que le rectangle **touche** est sélectionné (les deux faces et les arêtes touchées).
- **Shift maintenu + clic** : bascule (ajoute si absent, retire si présent). Vérifié dans les deux sens.
- **Ctrl maintenu + clic** : ajoute uniquement. Un second Ctrl+clic sur un élément déjà sélectionné le **laisse** sélectionné.
- **Ctrl+Shift maintenus + clic** : retire uniquement.
- Il n'y a pas de pré-surbrillance visible au survol avec l'outil Select.
- Sans modificateur, un clic remplace la sélection.

**Selon l'Instructor [INSTR]** : double-clic sur une arête = l'arête et les faces qui la partagent ; double-clic sur un objet (groupe/composant) = l'éditer ; Ctrl+A = tout sélectionner (inutilisable ici, le « A » active l'arc) ; Ctrl+T = tout désélectionner.

**[NV]** : l'aspect du rectangle de sélection pendant le glisser (trait plein pour la fenêtre, pointillé pour la croisée sur desktop) n'a pas pu être capturé ; l'icône de curseur (+ / ± / −) selon le modificateur non plus.

---

## 2. Lasso — « Lasso (Shift+Space) » (grille étendue)

- **Icône** : boucle de lasso avec une flèche.
- **Barre d'état [OBS]** :
  - au repos : `Click or click and drag to draw selection bounds. | Shift = Add/Subtract. | Ctrl = Add. | Shift + Ctrl = Subtract.`
  - après le premier clic : `Double click to close selection bounds.`
- **VCB** : « Measurements », inutilisé.

**Observé en direct [OBS]**
- **Mode polygonal** : une série de clics simples pose les sommets du contour, et un **double-clic ferme** le contour et applique la sélection.
- Rendu : fin trait gris plein qui relie les sommets et suit le curseur. Un **petit carré rouge** marque le point de départ (cible de fermeture).
- **Sens horaire à l'écran** = sélection fenêtre (la courbe entièrement incluse est sélectionnée).
- **Sens anti-horaire** = sélection croisée : une courbe seulement traversée est sélectionnée en entier, un segment séparé non touché ne l'est pas.
- Un clic simple sur un objet sélectionne comme l'outil Select.

**Selon l'Instructor [INSTR]** : cliquer-glisser trace un contour libre ; le sens horaire/anti-horaire peut être inversé dans les préférences (Drawing) ; mêmes modificateurs que Select.

---

## 3. Eraser — « Eraser (E) »

- **Icône** : gomme rose et blanche.
- **Barre d'état [OBS]** :
  - normal : `Click or drag to erase items. | Ctrl = Toggle Soften/Smooth. | Alt = Toggle Unsmooth/Unhide. | Shift = Toggle Hide.`
  - **Shift maintenu** : la première phrase devient `Click or drag to hide items.` Elle revient à « erase » au relâchement.
- **VCB** : « Measurements », inutilisé.

**Observé en direct [OBS]**
- **Clic sur une arête** : l'arête est supprimée, ainsi que **toute face qui dépendait d'elle**.
- **Comportement surprenant mais logique** : un clic sur un seul segment d'un **polygone** a effacé **tout le polygone et sa face**. Le polygone est une seule entité « courbe », donc l'effacement porte sur toute la courbe. Même chose pour un arc 2 points (toute la courbe effacée d'un clic).
- **Cliquer-glisser** : efface les entités survolées, et l'effacement a lieu **au relâchement** du bouton.
- Avec un glisser automatisé instantané, une seule entité traversée a été effacée (échantillonnage du trajet limité).
- Clic dans le vide : rien ne se passe.

**Selon l'Instructor [INSTR]** : Ctrl = adoucir/lisser les arêtes (au lieu d'effacer) ; Alt = annuler le lissage et réafficher (unhide) ; Shift = masquer ; Ctrl+Shift = retirer de la liste en cours de gommage.

**[NV]** : l'effet réel de Shift (masquer) et de Ctrl (adoucir) n'a pas été constaté. Mon clic de test a manqué l'arête et aucune face adjacente adaptée n'existait. La surbrillance des entités marquées pendant le glisser n'a pas pu être capturée.

---

## 4. Line — « Line (L) »

- **Icône** : crayon rouge.
- **Barre d'état [OBS]** :
  1. avant le 1er clic : `Click to set first endpoint. | Arrow Keys = Toggle Lock Inference Direction.`
  2. après le 1er clic : `Click to set second endpoint or enter length. | Alt = Toggle Linear Inferences (All On). | Arrow Keys = Toggle Lock Inference Direction.` (le segment « Alt… » apparaît et disparaît selon le survol)
- **VCB [OBS]** : « Length ». Il affiche la longueur courante (`2.64 m`, `~ 8.25 m` en mode verrouillé). Saisie : `3m`, `3`, `2.7m`.

**Observé en direct [OBS]**
- **Étapes** : clic 1 = départ, déplacement (un segment élastique suit le curseur), clic 2 = segment créé. **L'outil enchaîne automatiquement** : le point 2 devient le départ du segment suivant (polyligne).
- **Saisie de longueur** : après le clic 1, on oriente la souris puis on tape `3 m` Entrée. Le segment fait exactement 3 m dans la direction du curseur, et la chaîne continue depuis ce nouveau point.
- **Fermeture** : un clic sur le point de départ (inférence « Endpoint ») ferme la boucle. **La face est créée automatiquement** (4 arêtes coplanaires, face grise). **La chaîne se termine** et l'outil revient à « Click to set first endpoint ».
- Une ligne tracée **en travers d'une face**, d'un milieu d'arête à l'autre, **coupe la face en deux faces**. La chaîne s'arrête aussi dès que la ligne se termine sur une arête existante qui ferme une face.
- **Échap** : annule le segment en cours, l'outil reste actif et le VCB est vidé.
- **Flèches = verrouillage de direction** (bascule : une seconde pression sur la même flèche déverrouille) :
  - → : axe rouge, ← : axe vert, ↑ : axe bleu, ↓ : parallèle/perpendiculaire à la dernière arête survolée.
  - Rendu quand c'est verrouillé : le segment élastique devient **épais et coloré** (rouge, vert, bleu, ou **magenta** pour parallèle/perpendiculaire). Une **ligne pointillée** relie le curseur réel au point contraint (projection), avec un petit carré rouge au point. Infobulle **« Constrained on Line »**. Le VCB passe en `~ x.xx m`.
  - Avec ↓ et sans arête de référence, la longueur reste bloquée à 0.00 m. Après survol d'une arête diagonale, ↓ contraint parallèlement à cette arête (ligne magenta).
- **Inférences vues** (marqueur + infobulle) :
  | Inférence | Marqueur | Infobulle |
  |---|---|---|
  | Origine | cercle noir avec croix/point | « Origin » |
  | Extrémité | **point vert** | « Endpoint » |
  | Milieu | **point cyan/bleu clair** | « Midpoint » |
  | Sur arête | **carré rouge** | « On Edge » |
  | Sur face | **losange bleu foncé** | « On Face » |
  | Le long d'un axe | le segment prend la couleur de l'axe (rouge/vert/bleu) | « On Red Axis » (« On Green Axis », « On Blue Axis ») |
  | Depuis un point | **ligne pointillée de la couleur de l'axe** qui part d'un point existant (extrémité ou milieu marqué d'un petit cercle) | « From Point » |
  | Contrainte flèche | segment épais coloré, point de contrainte en carré rouge | « Constrained on Line » |
- Hors inférence d'axe, le segment élastique est **noir et fin**.

**Selon l'Instructor [INSTR]** : Alt = alterne les inférences linéaires (All On → All Off → Parallel/Perpendicular Only) ; **Shift maintenu** = verrouille la direction de l'inférence courante ; Échap = annuler ; une boucle fermée d'au moins 3 arêtes coplanaires crée une face.

**[NV]** : l'appui sur Alt n'a pas modifié le libellé de la barre d'état (il reste « (All On) »), effet non constaté. Le verrouillage par Shift n'a pas pu être constaté non plus. La saisie de coordonnées `[x,y,z]` ou `<dx,dy,dz>` n'est pas confirmée (les crochets ne sont pas passés, le VCB affichait seulement `1,1,2`).

---

## 5. Rectangle — « Rectangle (R) »

- **Icône** : carré avec une diagonale et un crayon rouge dans un coin.
- **Barre d'état [OBS]** :
  1. `Click to set first corner. | Ctrl = Toggle Select Center. | Arrow Keys = Toggle Lock Drawing Plane.`
  2. `Click to set opposite corner or enter length, width. | Ctrl = Toggle Draw From Center. | Arrow Keys = Toggle Lock Drawing Plane.`
  - En mode centre : étape 1 `Click to set center.`, étape 2 `Click to set corner or enter length, width.`
- **VCB [OBS]** : libellé « Dimensions », valeur `1.93 m, 0.59 m` (ou `~ …`). Saisie : `4m,3m` (virgule = séparateur). Après la création, le VCB garde `4m,3m`.

**Observé en direct [OBS]**
- **2 clics** : coin 1, puis coin opposé. Le rectangle d'aperçu est **bleu** sur le plan du sol (couleur du plan d'inférence) ; le curseur porte une petite icône de rectangle bleue à plat.
- **Face créée automatiquement**. L'outil reste actif pour un nouveau rectangle.
- **Saisie `4 m , 3 m` Entrée** après le 1er clic : le rectangle fait 4 × 3 m. Le **sens est celui du quadrant où se trouve le curseur** (1re valeur sur rouge, 2e sur vert).
- **Ctrl (bascule) = depuis le centre** : le 1er clic devient le centre. Une **diagonale pointillée** va du centre au coin sous le curseur, et le VCB affiche les dimensions **totales** (environ 2 fois la demi-diagonale). `2m,2m` donne un carré de 2 × 2 centré sur le point. **Le mode reste actif** pour les rectangles suivants, jusqu'à un nouvel appui sur Ctrl.
- **Flèche → avant le 1er clic** : le plan de dessin est verrouillé perpendiculairement à l'axe rouge (plan vertical vert-bleu). L'icône du curseur devient **rouge et verticale**, l'aperçu a des **arêtes rouges épaisses**, avec une infobulle « Constrained on Plane » et une ligne pointillée de projection.
- **Inférences** : « Parallel to Edge » (aperçu aligné sur une arête existante) ; **« Square »** (diagonale pointillée et infobulle quand les deux dimensions sont égales).
- Échap annule.

**Selon l'Instructor [INSTR]** : Shift maintenu = verrouiller le plan inféré courant ; flèches → rouge, ← vert, ↑ bleu, ↓ parallèle. L'ordre des valeurs saisies suit les axes (R puis G, R puis B, ou G puis B selon le plan).

**[NV]** : l'inférence « Golden Section » ; les valeurs négatives.

---

## 6. Rotated Rectangle — « Rotated Rectangle » (grille étendue, pas de raccourci)

- **Icône** : rectangle incliné avec des points de construction.
- **Barre d'état [OBS]** :
  1. `Select first corner.` (le curseur porte un **rapporteur bleu** à plat et l'infobulle « Unlocked plane »)
  2. `Select second corner or enter value. Alt = lock protractor plane.`
  3. `Select third corner or enter value(s). Alt = set protractor baseline.`
- **VCB [OBS]** : étape 2 « **Length, Angle** » (`1.27 m, 0.0`) ; étape 3 « **Width, Angle** » (`~ 4.94 m, 0.0`) ; après la création, « Dimensions » `3.00 m, 2.00 m`.

**Observé en direct [OBS]**
- **3 clics** : coin 1 ; coin 2, qui fixe la direction et la longueur du 1er côté (rapporteur affiché autour du point 1 pour l'angle) ; coin 3, qui fixe la largeur et l'angle du 2e côté.
- Saisie : `3 m` Entrée à l'étape 2 (longueur seule acceptée), puis `2 m , 90` Entrée à l'étape 3, ce qui donne un rectangle 3 × 2 posé sur le sol. **Face créée.**
- Infobulle combinée pendant l'étape 3 : « On Line Length: 3.00 m Width: … ».
- Le rapporteur est dessiné en cercle gradué (bleu sur le plan du sol, noir s'il est vertical).

**Selon l'Instructor [INSTR]** : cliquer-glisser le 1er point permet de choisir le plan ; Shift = verrouiller l'inférence ; Alt après le 1er clic = verrouiller le plan du 1er côté ; Alt après le 2e clic = définir la ligne de base du rapporteur ; flèches avant le 1er clic = axe de rotation du rapporteur, flèches après = direction de dessin.

---

## 7. Circle — « Circle (C) »

- **Icône** : cercle bleu avec un point central et un rayon.
- **Barre d'état [OBS]** :
  1. `Select center point. Use Ctrl '+' or Ctrl '-' to change the number of segments.`
  2. `Select point on edge. Use Ctrl '+' or Ctrl '-' to change the number of segments.`
- **VCB [OBS]** : avant le 1er clic « **Sides** » `24` (défaut) ; après le 1er clic « **Radius** » (`1.29 m`).

**Observé en direct [OBS]**
- **2 clics** : centre, puis point sur le cercle. Le **1er sommet du polygone est placé dans la direction du curseur**, et le rayon est tracé en trait noir du centre au curseur. L'aperçu est **bleu** (plan du sol). **Face créée** automatiquement.
- **Nombre de côtés** :
  - On le tape **avant** le 1er clic : `12` Entrée (le VCB « Sides » passe à 12).
  - On le tape **après** la création : `8s` Entrée, et le dernier cercle est reconstruit avec 8 segments (la saisie `s` fonctionne).
  - **Pendant** le tracé : Ctrl + « + » / Ctrl + « - » ajoute ou retire 1 segment à chaque appui (10 → 4 après six « - »). Une infobulle affiche « **3 sides** ».
  - **Bornes** : 3 à 999. Au-delà (par ex. `1000`), une boîte **« Alert — Curve segments must be in the range from 3 to 999 » [OK]** s'affiche.
  - **Le nombre de côtés est mémorisé** pour le cercle suivant.
- **Saisie du rayon après la création** : `1m` Entrée redimensionne le dernier cercle.
- **Flèche ← avant le 1er clic** : la normale est verrouillée sur l'axe vert (cercle vertical). Le curseur et l'aperçu deviennent **verts**.
- Échap annule (si une alerte est ouverte, le 1er Échap ferme l'alerte).

**Selon l'Instructor [INSTR]** : Shift = verrouiller l'inférence ; flèches avant le clic = normale de la surface (→ R, ← G, ↑ B, ↓ parallèle) ; flèches après le clic = direction de dessin.

---

## 8. Polygon — « Polygon » (grille étendue ou emplacement dynamique de la barre, pas de raccourci)

- **Icône** : hexagone avec un point central.
- **Barre d'état [OBS]** :
  1. `Select center point. Use Ctrl '+' or Ctrl '-' to change the number of segments.`
  2. `Select point on edge. Ctrl = circumscribed. Use Ctrl '+' or Ctrl '-' …`, puis après Ctrl : `… Ctrl = inscribed. …`
- **VCB [OBS]** : avant le clic, « Sides » `6` (défaut). Après le clic, « **Inscribed Radius** » (défaut) ou « **Circumscribed Radius** » après Ctrl.

**Observé en direct [OBS]**
- 2 clics comme le cercle, et **face créée**. `1 m` Entrée fixe le rayon.
- **Inscribed Radius** (défaut) : le rayon va jusqu'à un **sommet**. Un cercle pointillé passe par les sommets (le polygone est inscrit dans le cercle).
- **Ctrl (bascule)** : passe en **Circumscribed Radius**. Le rayon va au **milieu d'un côté** (apothème) et le cercle pointillé est tangent aux côtés. Dans le même mouvement de souris, la valeur passe d'environ 1.85 à 3.06 m.
- Le polygone obtenu est une **seule courbe** : la gomme sur un côté efface tout le polygone et sa face.

**Selon l'Instructor [INSTR]** : Ctrl+/- = nombre de côtés ; flèches identiques au cercle.

---

## 9. Arc (par centre) — « Arc » (grille étendue)

- **Icône** : arc avec un centre et deux rayons.
- **Barre d'état [OBS]** :
  1. `Select center point. Use Ctrl '+' or Ctrl '-' to change the number of segments.` (curseur = rapporteur bleu, infobulle « Unlocked plane »)
  2. `Select first arc point or enter radius. …`
  3. `Select second arc point or enter angle. …`
- **VCB [OBS]** : « Sides » `12` (défaut), puis « Length » (rayon, `0.78 m`), puis « Angle » (`95.6`, en degrés).

**Observé en direct [OBS]**
- 3 clics : centre (le rapporteur reste affiché), 1er point (rayon et angle de départ ; inférence « On Red Axis » possible), 2e point (angle balayé).
- Saisie : `1 m` Entrée (rayon), puis `90` Entrée (angle), ce qui donne un arc de 90°.
- Pendant l'étape 3 : arc d'aperçu noir, rayon de départ en pointillé rouge s'il est sur l'axe rouge, point vert à l'extrémité.
- Résultat : **une courbe seule, sans face ni rayons**.

**Selon l'Instructor [INSTR]** : cliquer-glisser le 1er point pour choisir le plan ; flèches avant le clic = axe de rotation du rapporteur ; le pas d'accrochage angulaire se règle dans Model Info > Units > Angle Units.

---

## 10. 2 Point Arc — « 2 Point Arc (A) »

- **Icône** : arc avec deux extrémités et une flèche de bombement (bulge).
- **Barre d'état [OBS]** :
  1. `Click to set start point. | Use Ctrl '+' or Ctrl '-' to change the number of segments. | Arrow Keys = Toggle Lock Inference Direction.`
  2. `Click to set end point or enter length. | …` (avec en plus `Alt = Toggle Lock Tangency.` quand on part d'une extrémité existante)
  3. `Click to set bulge or enter distance. | …`
- **VCB [OBS]** : « Sides » `12`, puis « Length » (corde), puis « **Bulge** » (`~ 0.86 m`).

**Observé en direct [OBS]**
- 3 clics : départ, fin (corde, saisie `2 m` possible), puis bombement (saisie `0.5 m`). Pendant l'étape 3, l'arc élastique est noir et un **segment vert** matérialise la flèche, perpendiculaire à la corde.
- Après la création : `6s` Entrée reconstruit l'arc avec 6 segments (infobulle « 6 sides in arc »).
- **Arc tangent** : en partant de l'extrémité d'un arc existant (« Endpoint »), l'aperçu devient **cyan** avec l'infobulle « **Tangent at Vertex** ».
  - Sans verrouillage : si la souris s'éloigne de la solution tangente, on retombe en mode à 3 clics (bulge).
  - **Avec Alt (bascule « Lock Tangency »)** : 2 clics suffisent (départ, fin). **L'outil enchaîne ensuite automatiquement** des arcs tangents depuis la dernière extrémité, comme une polyligne de Line, en cyan avec « Tangent at Vertex ». Échap termine la chaîne.
- Comme toute courbe, l'arc est sélectionné ou gommé **en entier**.

**Selon l'Instructor [INSTR]** : Shift = verrouiller l'inférence ; flèches = direction ; en cas d'arêtes multiples, survoler l'arête voulue avant de commencer pour définir la tangence.

**[NV]** : l'infobulle « Half Circle » (bulge = demi-corde) ; le double-clic pour répéter un arc tangent (comportement desktop) non testé.

---

## 11. 3 Point Arc — « 3 Point Arc » (grille étendue)

- **Icône** : arc passant par 3 points.
- **Barre d'état [OBS]** :
  1. `Click to set start point. | Use Ctrl '+' or Ctrl '-' … | Arrow Keys = …`
  2. `Click to set second point or enter length. | …`
  3. `Click to set end point or enter angle. | …`
- **VCB [OBS]** : « Sides » `12`, puis « Length » (`1.55 m`), puis « Angle » (`~ 232.4`).

**Observé en direct [OBS]**
- 3 clics : départ ; 2e point par lequel l'arc **passe toujours** (un trait pointillé gris les relie à l'étape 2) ; fin (ou saisie de l'angle balayé, `120` Entrée).
- À l'étape 3, l'aperçu montre l'arc plein noir et des cordes pointillées vers le curseur.
- Résultat : une courbe sans face.

**Selon l'Instructor [INSTR]** : Alt = verrouiller la tangence ; Shift et flèches comme pour les autres arcs.

---

## 12. Pie — « Pie » (grille étendue)

- **Icône** : secteur de disque (part de tarte).
- **Barre d'état et VCB [OBS]** : identiques à Arc (centre → `Select first arc point or enter radius` « Length » → `Select second arc point or enter angle` « Angle »). Sides par défaut 12.

**Observé en direct [OBS]**
- 3 clics ou saisie (`2 m` Entrée, puis `45` Entrée) : on obtient un **secteur fermé (arc + 2 rayons) avec une face créée automatiquement**.
- Le rapporteur bleu s'affiche au centre pendant l'étape 3.

---

## 13. Freehand — « Freehand » (grille étendue)

- **Icône** : courbe libre ondulée.
- **Barre d'état [OBS]** :
  - `Click and drag to draw a freehand curve. | Arrow Keys = Toggle Lock Drawing Plane.`
  - juste après un tracé : `… | Ctrl '-' / Ctrl '+' = Decrease/Increase Segments. | …`
- **VCB** : « Measurements », inutilisé.

**Observé en direct [OBS]**
- On **appuie, glisse et relâche** : une courbe polyligne est créée le long du trajet (un glisser rectiligne automatisé a donné un trait quasi droit).
- L'outil reste actif.

**Selon l'Instructor [INSTR]** : Ctrl +/- modifie le nombre de segments de la **dernière** courbe, et seulement immédiatement après sa création ; les flèches avant le tracé verrouillent le plan.

**[NV]** : la création de face sur une boucle fermée ; Ctrl +/- sur la courbe.

---

## 14. 3D Text — « 3D Text » (grille étendue)

- **Icône** : lettre « A » en relief bleu.
- **Boîte de dialogue [OBS]** « **CREATE 3D TEXT** » (croix de fermeture en haut à droite) :
  - Zone de texte multiligne, texte indicatif « Enter 3D text » (affiché dans la police choisie), redimensionnable.
  - **Font** : liste déroulante personnalisée (ce n'est pas un `<select>`) avec 16 polices Google : Architects Daughter (défaut), Concert One, Lato, Lora, Merriweather, Montserrat, Noto Sans, Open Sans, Oswald, PT Sans, Permanent Marker, Playball, Prompt, Raleway, Roboto. Chaque nom est affiché dans sa propre police.
  - **Style** : liste déroulante ; pour Architects Daughter, seulement « Regular ».
  - **Height** : `~ 0.30 m`.
  - Case **Text filled** (cochée par défaut).
  - Case **Text extrusion** (cochée par défaut) avec son champ `~ 0.15 m`. Décocher « Text filled » ne grise pas l'extrusion.
  - Boutons **Cancel** et **OK**. OK est grisé tant que le texte est vide, puis devient bleu.
  - Échap ferme la boîte (annulation).
- **Après OK [OBS]** : barre d'état `Place 3D text 3D Text.`. Le texte (un composant) **suit le curseur** et s'oriente selon les inférences (« Endpoint », sol). Un clic le pose : le texte « Fadi » est extrudé et **couché sur le plan du sol**.
- **Juste après la pose**, le texte est **sélectionné et l'outil passe à Move** (`Click to begin moving the pre-selected items. | Ctrl = Cycle Copy/Stamp/Move. | Alt = Toggle Autofold. | …`, VCB « Distance »).

---

## 15. Conventions transversales (à reproduire dans « Planche »)

### 15.1 Cycle de vie d'un outil
- Raccourci clavier d'une lettre (Space, E, L, R, C, A, F…). Shift+Space pour le Lasso.
- Chaque outil est une **machine à états** : la barre d'état change de texte à chaque étape (« Click to set first… » → « Click to set second… or enter … »), et le libellé du VCB change aussi.
- **L'outil reste actif** après une création ; il ne revient jamais tout seul à Select. Exception : 3D Text bascule vers Move.
- **Line et l'arc tangent verrouillé enchaînent** les segments ; les autres repartent à l'étape 1.
- **Échap** = retour à l'étape 1 sans rien créer.

### 15.2 VCB (champ de mesures)
- On tape directement sans focus, Entrée valide. Les valeurs multiples sont séparées par une virgule (`4m,3m`, `2m,90`). L'unité est facultative.
- La saisie s'applique **à l'opération en cours, ou à la dernière opération terminée** (correction après coup : rayon `1m`, nombre de segments `8s`, dimensions).
- Préfixe `~` pour une valeur approximative pendant le survol.
- Le suffixe `s` désigne un nombre de segments ; les angles sont en degrés sans unité.
- Erreur hors bornes : boîte d'alerte modale (« Curve segments must be in the range from 3 to 999 »).
- Libellés rencontrés : Measurements, Length, Dimensions, Sides, Radius, Inscribed Radius, Circumscribed Radius, Angle, Bulge, « Length, Angle », « Width, Angle », Distance.

### 15.3 Inférences (accrochages)
| Type | Rendu |
|---|---|
| Endpoint | point **vert** |
| Midpoint | point **cyan** |
| On Edge | carré **rouge** |
| On Face | losange **bleu** |
| Origin | cercle noir |
| On Red / Green / Blue Axis | segment élastique de la couleur de l'axe |
| From Point | ligne **pointillée de la couleur de l'axe** issue d'un point existant |
| Parallel to Edge / Perpendicular | **magenta** |
| Tangent at Vertex | **cyan** |
| Square (rectangle) | diagonale pointillée |
| Constrained on Line / Plane (verrouillage) | trait épais coloré, ligne pointillée de projection, carré rouge |
| Unlocked plane | infobulle du rapporteur ou du curseur avant le 1er clic |

- Les infobulles sont des cartouches blancs, texte noir, juste à droite et en dessous du curseur.
- L'aperçu de l'outil est **noir** hors inférence ; **bleu** pour les formes posées sur le plan du sol (rectangle, cercle) ; il prend la couleur de l'axe ou du plan quand il est verrouillé (rouge, vert, bleu).

### 15.4 Modificateurs
- **Flèches** (bascule, une 2e pression annule) : → rouge, ← vert, ↑ bleu, ↓ parallèle/perpendiculaire à la dernière arête survolée.
  - Outils linéaires (Line, arcs, et les autres outils après leur 1er clic) : la flèche verrouille la **direction**.
  - Formes (Rectangle, Circle, Polygon, Freehand, rapporteur avant le 1er clic) : la flèche verrouille le **plan ou la normale**.
- **Shift maintenu** : verrouille l'inférence courante (outils de dessin) ; ajoute/retire (Select, Lasso) ; masque (Eraser).
- **Ctrl (bascule)** : depuis le centre (Rectangle) ; inscrit/circonscrit (Polygon) ; ajouter (Select, maintenu) ; adoucir (Eraser) ; copier (Move).
- **Ctrl + « + » / « - »** : nombre de segments ±1 (Circle, Polygon, Arcs, Pie, Freehand), bornes 3 à 999.
- **Alt** : mode d'inférence (Line) ; verrouillage de la tangence (arcs 2 et 3 points) ; plan ou ligne de base du rapporteur (Rotated Rectangle) ; réafficher/annuler le lissage (Eraser).

### 15.5 Géométrie
- Une boucle fermée d'arêtes coplanaires crée une face automatiquement (Line, Rectangle, Rotated Rectangle, Circle, Polygon, Pie).
- Arc, 2 Point Arc, 3 Point Arc et Freehand ne créent pas de face par eux-mêmes.
- Une arête tracée sur une face la découpe.
- Les cercles, polygones et arcs sont des **courbes** (une suite de segments qu'on sélectionne et qu'on gomme comme un seul objet).
- Couleurs de sélection : face = trame de points bleus ; arête = trait bleu.

### 15.6 Grisé ou payant
- Grisés dans la grille gratuite : Intersect, Union, Subtract, Trim, Split.
- Bandeau « Upgrade your modeling experience with a SketchUp subscription » et bouton « Upgrade Now » (non cliqués).
- Aucun outil de dessin testé n'était bloqué.

---

## Lacunes de ce relevé
- Pas d'effet constaté pour : Alt de Line (cycle des inférences), Shift maintenu en verrouillage d'inférence, Shift (masquer) et Ctrl (adoucir) de la gomme, Ctrl +/- de Freehand.
- Non testés : la saisie de coordonnées absolues ou relatives, l'inférence « Half Circle » et le double-clic d'arc tangent, l'inférence « Golden Section », l'aspect du rectangle de sélection pendant le glisser et les curseurs selon le modificateur.
