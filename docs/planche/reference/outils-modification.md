# SketchUp pour le Web : outils de MODIFICATION (référence pour le module « Planche » de Fadi)

Session de test en direct du 2026-10-06 sur app.sketchup.com (offre gratuite), modèle « Decimal - Meters ».
Légende : **[OBS]** = observé en direct ; **[INSTR]** = texte du panneau Instructor, non vérifié sauf mention ;
**[NON TESTÉ]** = pas pu être vérifié (voir « Lacunes » en fin de document).

---

## 0. Conventions communes à tous les outils (observé)

### 0.1 Barre d'état (élément DOM `#prompt`)
- Une seule ligne de texte en bas à gauche. Format constant : `<consigne de l'étape>. | <Touche> = <effet>. | …`
- Le texte **change à chaque étape** de l'outil ET quand on bascule un modificateur (ex. Move : « Ctrl = Copy. » pendant un déplacement devient « Ctrl = Move. » une fois en mode copie).
- Elle peut rester vide un instant juste après un changement d'outil, tant que la souris n'a pas bougé sur le canevas.

### 0.2 Champ de saisie / VCB (`#measurements-box`, libellé `#measurements-box-label`)
- Il est en bas à droite. Son libellé dépend de l'outil et de l'étape : `Measurements` (au repos ou pour Select, Orbit, Pan, Follow Me), `Distance` (Push/Pull, Move, Offset, Flip), `Angle` (Rotate), `Scale` / `Blue Scale` / `Red Scale`… (Scale), `Dimensions` (Rectangle), `Segments` (Divide).
- On n'a **pas besoin de cliquer dedans** : on tape directement au clavier pendant ou juste après l'opération. Les caractères s'affichent dans le champ, puis Entrée valide.
- Pendant le mouvement de la souris, le champ affiche la valeur courante. Le préfixe `~ ` indique une valeur approchée (non accrochée), ex. `~ 7.27 m`. Une valeur exacte, accrochée sur une inférence, s'affiche sans tilde, ex. `90.0`.
- Après validation, le champ garde le texte **tel qu'il a été tapé** (`5m`, `x3`, `/3`, `2x`, `3m`) et non la valeur formatée.
- **Retaper une valeur après l'Entrée modifie la dernière opération** (observé avec Move et un réseau : taper `2` + Entrée après un `x3` a ré-espacé les copies à 2 m).
- Unités : la valeur sans unité prend l'unité du modèle (m), et `m` est accepté en suffixe. Pour Rectangle, le séparateur des 2 dimensions est la virgule : `4m,3m`.
- Retour arrière (Backspace) efface un caractère du champ.

### 0.3 Échap
- Pendant une opération : annule l'opération en cours et ramène à l'étape 1 de l'outil (observé : Push/Pull, Stamp de Move, Scale).
- Au repos avec une sélection, dans Scale : vide la sélection (le texte devient « Click the item or object you want to scale »).

### 0.4 Annuler / Rétablir
- Boutons Undo / Redo en haut à gauche (title « Undo », « Redo »). Le bouton Redo est grisé (`[DIS]`) quand il n'y a rien à rétablir.
- **Granularité observée** : une opération complète = 1 pas d'annulation. Un Move-copie suivi de `x3` puis d'une retape de distance s'annule **en un seul** Undo. Un réseau polaire Rotate `x5` s'annule aussi en un seul pas. En mode Stamp, **chaque copie posée est un pas d'annulation distinct**.
- Ctrl+Z au clavier : dans cet environnement de test, il a tapé « z » dans le VCB au lieu d'annuler. Ce comportement est probablement dû à la façon dont l'automatisation envoie les modificateurs ; sur un vrai clavier, Ctrl+Z devrait annuler.

### 0.5 Modificateurs clavier (note technique importante)
- Les modificateurs sont des **bascules** sur appui simple (keydown de Control, Alt), sauf Shift qui agit **tant qu'il est maintenu**.
- L'application écoute les `keydown`/`keyup` sur le `<canvas>`. Un `KeyboardEvent('keydown',{key:'Control'})` synthétique est bien pris en compte, ce qui a permis de vérifier toutes les bascules Ctrl.

### 0.6 Inférences / accrochages (observés)
Infobulles vues : `Endpoint`, `Midpoint`, `On Edge`, `On Face`, `Origin`, `On Red Axis`, `On Green Axis`, `On Blue Axis`, `Constrained on Line` (axe verrouillé par une flèche), `Unlocked plane` (rapporteur libre).
- Un axe verrouillé par une flèche du clavier s'affiche comme une ligne pointillée **épaissie** de la couleur de l'axe, de la base jusqu'au curseur projeté.
- Avec Rectangle, un plan verrouillé affiche l'aperçu du rectangle **dans la couleur de l'axe normal** (rouge pour Droite/Red).
- Flèches : → = Rouge, ← = Vert, ↑ = Bleu, ↓ = Parallèle/Perpendiculaire.

### 0.7 Sélection préalable (Select, touche Espace)
- Clic = sélectionne une entité. Double-clic sur une face = la face et ses arêtes. **Triple-clic = tout ce qui est connecté** (méthode utilisée pour sélectionner une boîte de géométrie libre).
- Glisser de droite à gauche = sélection croisée. Ctrl maintenu = ajouter, Shift = basculer, Shift+Ctrl = retirer [INSTR, Ctrl maintenu vérifié].
- Rendu de la sélection : contour bleu + trame de points sur les faces. Les objets (groupes) ont un contour bleu de boîte englobante.

---

## 1. Push/Pull (Pousser/Tirer), touche **P**

### Observé en direct [OBS]
**Étapes et barre d'état :**
1. Outil actif : `Click to select the face that you want to push or pull. | Ctrl = Toggle Create New Starting Face. | Alt = Toggle Stretch Mode.`, libellé **Distance**, valeur `0.00 m`.
2. Clic sur une face (on ne glisse pas) : `Click to set face or enter distance. | Ctrl = Toggle Create New Starting Face. | Alt = Toggle Stretch Mode.` La face suit le curseur selon sa normale, et la valeur s'affiche en direct (ex. `2.26 m`).
3. Un 2e clic fixe la face, ou bien on tape la distance + Entrée. On peut aussi faire les deux : cliquer, puis taper `2.7m` + Entrée, ce qui **redimensionne l'extrusion qui vient d'être faite** (2,72 m est devenu 2,70 m).

**Signe de la distance** : une valeur positive va dans le sens de la normale de la face (tirer), une négative en sens inverse (pousser/creuser). Le VCB affiche ensuite la valeur absolue (`3.00 m` après `-3m`).

**Creuser jusqu'à percer** : un rectangle de 1×1 m dessiné sur la face avant d'une boîte de 3 m de profondeur, poussé de `-3m`, a donné un **trou traversant** (la face arrière a été supprimée et l'on voyait l'axe vert à travers). L'outil détecte une face opposée parallèle à la profondeur atteinte et y perce le trou.

**Ctrl = nouvelle face de départ** : après le clic sur la face du dessus, la bascule Ctrl puis +1 m conserve une **arête horizontale à l'ancien niveau** sur les faces latérales. Sans Ctrl, la face existante est simplement déplacée et les faces latérales sont allongées sans arête intermédiaire.

**Double-clic = répéter** : après un tirage de 0,5 m sur le dessus, un double-clic sur la face latérale droite l'a tirée de 0,5 m. Le VCB revient ensuite à `0.00 m`.

**Échap** pendant le tirage : la face revient à sa place, la barre d'état revient à l'étape 1 et la sélection est vidée.

**Inférences** pendant le tirage : `Endpoint` sur les sommets existants (la distance prend alors la hauteur de ce point).

**Après la fin** : l'outil reste actif, à l'étape 1. La face extrudée reste sélectionnée, donc un nouveau clic n'importe où la reprend [INSTR : « When a face is pre-selected, you can click anywhere in the model to begin push/pulling it »].

### Selon l'Instructor [INSTR]
- « Push and pull face entities to add or subtract volume. »
- Étapes : (option) présélectionner la face → cliquer une face → bouger → cliquer ou taper la distance.
- Ctrl = Toggle create new starting face. **Alt = Toggle Stretch mode** [NON TESTÉ : avec une boîte orthogonale, les deux modes donnent le même résultat. La différence n'apparaît que si les faces voisines ne sont pas perpendiculaires (étirement des faces voisines au lieu de créer de nouvelles faces)].
- Esc = annuler et vider la sélection. Double-clic = répéter la distance dans la même direction.

---

## 2. Move (Déplacer), touche **M**

### Observé en direct [OBS]
**Barre d'état selon l'état :**
| État | Texte |
|---|---|
| Rien de sélectionné | `Click something to begin moving it. \| Ctrl = Cycle Copy/Stamp/Move. \| Alt = Toggle Autofold. \| Arrow Keys = Toggle Lock Inference Direction.` |
| Sélection préalable | `Click to begin moving the pre-selected items. \| Ctrl = Cycle Copy/Stamp/Move. \| …` |
| Pendant le déplacement | `Click to place the items you're moving or enter a distance. \| Ctrl = Copy. \| Alt = Toggle Autofold. \| Arrow Keys = …` |
| Pendant une copie | `Click to place the items you're copying or enter a distance. \| Ctrl = Move. \| …` |
| Mode copie armé avant le clic | `Click to begin copying the pre-selected items. \| Ctrl = Cycle Copy/Stamp/Move. …` |
| Mode Stamp | `Click to make multiple copies. \| Ctrl = Cycle Copy/Stamp/Move. …` (et `Ctrl = Move.` pendant la pose) |
| Déplacement d'un sommet | `Click to place the items you're moving or enter a distance. \| Alt = Toggle Autofold. \| Arrow Keys = …` (**pas de Ctrl** : on ne copie pas un sommet) |

Libellé du VCB : **Distance**.

**Étapes** : 1) clic sur le point de base (un sommet de préférence, l'accrochage Endpoint apparaît) ; 2) la sélection suit le curseur ; 3) clic de destination, ou distance tapée + Entrée. Clic-clic, **pas de glisser**.

**Verrouillage d'axe** : la flèche → pendant le déplacement verrouille sur Rouge (ligne pointillée rouge épaisse et infobulle `Constrained on Line`). ↑ verrouille sur Bleu (vérifié en déplaçant une arête). Le mouvement est alors la projection du curseur sur l'axe, et une distance tapée est appliquée dans la direction de cette projection.

**Ctrl = cycle Copy → Stamp → Move** (3 appuis = retour à Move, vérifié via la barre d'état). Un appui pendant le déplacement bascule en copie.

**Réseau linéaire** (copie de 5 m sur l'axe rouge) :
- `x3` + Entrée → 3 copies supplémentaires, soit **4 objets** au pas de 5 m.
- `2x` + Entrée (copie de 6 m) → 2 copies, soit 3 objets au pas de 6 m. **`x3` et `3x` sont donc acceptés tous les deux.**
- `/3` + Entrée (copie de 15 m) → **3 intervalles** de 5 m entre l'original et la copie, soit 4 objets.
- Retaper une distance (`2` + Entrée) juste après un réseau **ré-espace tout le réseau**. Ici, les boîtes de géométrie libre se chevauchaient alors et fusionnaient.
- Après le réseau, la sélection est vidée et l'outil revient à « Click something to begin moving it ».

**Stamp** (Ctrl ×2) : clic sur le point de base, puis **chaque clic pose une copie** pendant qu'un fantôme reste attaché au curseur. Échap retire le fantôme ; la dernière copie posée reste sélectionnée. Chaque copie est un Undo séparé.

**Déplacer une arête ou un sommet = étirement** :
- Sans sélection, survoler une arête (infobulle `Midpoint`) puis clic, ↑ et `1m` : l'arête avant du dessus monte de 1 m. La face du dessus devient un plan incliné et les faces latérales deviennent des trapèzes. La géométrie connectée suit.
- Sommet (`Endpoint`) déplacé de 0,8 m en Z : les faces adjacentes se déforment. La face avant, qui restait plane, est restée une seule face.

**Après un déplacement simple** : la sélection reste active, l'outil revient à « Click to begin moving the pre-selected items » et le VCB garde `5m`.

**Pas de Ctrl via le clic souris** : `left_click` avec le modificateur ctrl n'a pas été interprété (ni par Move, ni par Select). L'application lit l'état du clavier, pas `MouseEvent.ctrlKey`.

### Selon l'Instructor [INSTR]
- Alt = Toggle Autofold mode (« useful for overriding Move tool constraints »). Survolé au-dessus d'un objet, Alt fait défiler les types de poignées. [NON TESTÉ]
- Shift = verrouiller sur la direction d'inférence courante. [NON TESTÉ : Shift maintenu non essayé avec Move]
- Les poignées de rotation du Move s'activent dans Preferences > Drawing. Les croix rouges sur la boîte englobante d'un objet permettent de le faire pivoter. [NON TESTÉ]
- « After moving a copy, you can type a number followed by the x key and then press Enter » [vérifié, ainsi que `xN` et `/N`].

---

## 3. Rotate (Faire pivoter), touche **Q**

### Observé en direct [OBS]
**Barre d'état et VCB (`Angle`) :**
1. Repos sans sélection : `Click something to select it and set the center point of rotation. | Ctrl = Toggle Copy. | Arrow Keys = Toggle Lock Rotation Plane.`
   Avec sélection : `Click to set the center point of rotation. | Ctrl = Toggle Copy. | Arrow Keys = Toggle Lock Rotation Plane.`
2. Après le clic du centre : `Move cursor to locate start point of rotation and click to begin rotating. | Ctrl = Toggle Copy.` (variante copie : « …to begin rotating a copy. »)
3. Après le clic du point de départ : `Click to set the rotation or enter angle. | Ctrl = Toggle Copy.` (copie : « Click to set the rotated copy or enter angle. »)
4. Après le clic final ou Entrée : retour à l'étape 1, la sélection est conservée.

**Rapporteur** : un cercle gradué qui suit le curseur. Sa **couleur indique le plan** : bleu = plan horizontal (normale bleue), vert = face dont la normale est verte. Sur le sol il affiche l'infobulle `Unlocked plane`. Sur une face, il s'aligne sur celle-ci.

**Verrouillage du plan** : ← (Green) avant le 1er clic → le rapporteur reste vert même ailleurs que sur la face.

**Point de départ** : inférences `On Red Axis` / `On Green Axis`. Pendant la rotation, l'angle s'accroche sur les axes (affiché `90.0` sans tilde quand il est accroché).

**Saisie** : `30` + Entrée → 30° (VCB `30.0`). **Pente** `1:2` + Entrée → acceptée et convertie en degrés (VCB `~ 26.6`, soit atan(1/2) = 26,57°). Le sens suit le côté où se trouve le curseur.

**Réseau polaire** : centre sur l'Origine (infobulle `Origin`), Ctrl, départ sur l'axe rouge, `60` + Entrée puis `x5` + Entrée → 6 boîtes à 60° autour de l'origine. La dernière copie reste sélectionnée et tout le réseau s'annule en un seul Undo.

**Surprise** : sans sélection préalable, cliquer une face avec Rotate ne sélectionne **que cette face**. Une rotation de la face avant d'une boîte dans son propre plan a donc déformé toute la boîte, car les arêtes connectées sont étirées.

### Selon l'Instructor [INSTR]
- « Rotate, stretch, distort, or copy items or objects along a rounded path. »
- Avant le 1er clic, Shift maintenu verrouille l'inférence du rapporteur et les flèches basculent le plan (→ Red, ← Green, ↑ Blue, ↓ Parallel). Après le 1er clic, les flèches verrouillent la direction d'inférence de la rotation (↓ = Parallel/Perpendicular). [Partiellement vérifié : ← avant le clic]
- Pendant l'étape 2, on peut **cliquer-glisser le rapporteur le long d'une arête ou d'un axe** pour définir un axe de rotation quelconque. [NON TESTÉ]
- Exemples de saisie : `45` + Entrée, pente `4:12` + Entrée.

---

## 4. Scale (Échelle), touche **S**

### Observé en direct [OBS]
**Poignées** : avec la sélection, une **boîte englobante jaune** apparaît avec **26 poignées vertes** : 8 coins, 12 milieux d'arêtes et 6 centres de faces. La poignée survolée devient **rouge**, ainsi que le point d'ancrage opposé (rouge pâle). Une ligne pointillée relie les deux. Infobulle d'exemple : `Blue Scale about Opposite Point`.

**Barre d'état :**
- Repos avec sélection : `Click a scale grip to begin scaling. | Ctrl = Toggle Scale About Center. | Shift = Toggle Uniform Scale.`
- Survol d'un coin : `Click a scale grip to begin scaling uniformly. | …`
- Pendant une mise à l'échelle uniforme par un coin : `Click to finish scaling uniformly, or enter a scale factor or dimension. | Ctrl = … | Shift = …`, libellé **Scale**.
- Pendant une mise à l'échelle sur un axe par la poignée du centre du dessus : `Click to finish scaling, or enter a scale factor or dimension.`, libellé **Blue Scale**.
- Après la bascule Ctrl : `Click to finish scaling about center, or enter a scale factor or dimension.` L'ancrage passe au centre de la boîte et l'objet grandit symétriquement.
- Shift maintenu sur une poignée de face : le texte passe à « …scaling uniformly ». Shift **inverse** donc le mode par défaut de la poignée.
- Repos sans sélection, après un Échap : `Click the item or object you want to scale. | Ctrl = … | Shift = …`

**Saisie** :
- `2` + Entrée par un coin : facteur 2 uniforme, ancré au coin opposé. La boîte de 4×3×2,7 est passée à 8×6×5,4.
- `3m` + Entrée sur la poignée bleue du dessus : **la hauteur devient exactement 3 m** (au lieu de 5,4), ancrée en bas. Une longueur avec unité est donc interprétée comme une dimension cible, un nombre seul comme un facteur.
- Le VCB affiche le facteur courant pendant le geste (ex. `1.48`, `1.23`).

**Après la fin** : retour à « Click a scale grip to begin scaling », la sélection et les poignées restent affichées.

### Selon l'Instructor [INSTR]
- Coin : échelle sur 3 axes, uniforme par défaut (Shift = non uniforme). Milieu d'arête : 2 axes, non uniforme par défaut (Shift = uniforme). Centre de face : 1 axe, non uniforme par défaut (Shift = uniforme).
- Exemple : `2.5` + Entrée = 250 % ; `6'` + Entrée = 6 pieds de haut.
- « Live Components outlined in red are locked in the Scale tool. »
- Facteur négatif (miroir) : [NON TESTÉ]

---

## 5. Offset (Décalage), touche **F** (dans la grille « … »)

### Observé en direct [OBS]
- Barre d'état à l'activation, sans sélection : `Select face or edges to offset. Alt = Allow overlap.`, libellé **Distance**.
- Avec des arêtes présélectionnées : `Pick point from which offset will be measured. Alt = Allow overlap.`
- Après le clic sur la face : `Pick point to define offset or enter value. Alt = Allow overlap.`, avec une valeur en direct (ex. `~ 0.90 m`). La face est mise en sélection et l'aperçu du contour décalé suit le curseur.
- `0.3m` + Entrée : un contour intérieur à 0,3 m. La face est **divisée** en un anneau et une face intérieure.
- **Double-clic** sur la face intérieure : un nouveau décalage de 0,3 m, ce qui donne 2 anneaux concentriques. La dernière distance est donc bien répétée.
- **Offset d'arêtes** : deux arêtes contiguës présélectionnées (Ctrl maintenu dans Select), F, clic sur l'arête, curseur vers l'extérieur, `0.5m` + Entrée → une **polyligne ouverte** de 2 segments parallèle à 0,5 m, prolongée jusqu'à l'intersection. **Aucune face n'est créée.**
- Le sens (intérieur ou extérieur) est donné par le côté du curseur au moment de la saisie.
- Après la fin : retour à l'étape 1 (`Select face or edges to offset.`).

### Selon l'Instructor [INSTR]
- « Create copies of lines at a uniform distance from originals. » Étapes : clic sur une face, bouger, clic.
- **Alt = Toggle allow/trim overlap** [NON TESTÉ].

---

## 6. Follow Me (Suivez-moi), pas de raccourci (grille « … »)

### Observé en direct [OBS]
- Préparation : une face rectangulaire de 4×3 m au sol (le chemin) et un rectangle-profil vertical de 0,4×0,6 m dessiné à un coin, perpendiculaire à l'arête rouge (Rectangle + flèche → pour verrouiller le plan Red).
- Présélection de la face au sol avec Select (un simple clic), puis Follow Me. Barre d'état : `Click the profile that you want to extrude.`, libellé **Measurements**.
- Clic sur le profil : extrusion immédiate du profil **sur tout le périmètre** de la face. Le résultat est un cadre (muret) fermé avec les coins à onglet. La face au sol est en partie consommée.
- Après la fin, l'outil reste actif avec le même texte.

### Selon l'Instructor [INSTR]
- Sans présélection : 1) cliquer la face du profil ; 2) déplacer le curseur le long des arêtes à suivre ; 3) cliquer pour terminer.
- Avec présélection : présélectionner une suite continue d'arêtes, ou une face dont le périmètre sert de chemin, puis activer l'outil et cliquer le profil.
- **Alt = utiliser le périmètre de la face comme chemin.** Esc = annuler. [Le mode « glisser le long du chemin » n'a pas été testé.]

---

## 7. Flip (Retourner), pas de raccourci (grille « … »)

### Observé en direct [OBS]
- Avec une sélection, on active Flip. **Trois plans semi-transparents** (rouge, vert, bleu) passent par le centre de la boîte englobante de la sélection. Le plan survolé devient plus opaque.
- Barre d'état : `Click or drag a plane to flip the selection. | Ctrl = Toggle Flip / Copy. | Arrow Keys = Flip about a plane.`, libellé **Distance**.
- Après la bascule Ctrl : `Click or drag a plane to flip and copy the selection. | …`
- **Glisser le plan vert** (cliquer-glisser) en mode copie : une **copie miroir** est créée de l'autre côté d'un plan décalé. Le VCB indique ce décalage (`2.36 m`) et la barre d'état ajoute `Enter a distance to adjust mirror plane offset.`
- `1m` + Entrée : le décalage du plan passe à 1 m et la copie se rapproche.
- **Clic simple sur un plan** = miroir en place, autour du centre. Cela n'a pas été visible ici parce que l'objet testé est symétrique.
- Le panneau Instructor n'a **pas** de fiche pour Flip : il est resté sur « Select Tool ».

---

## 8. Outer Shell et opérations solides (grille « … »)

### Observé en direct [OBS]
- Dans la grille, les icônes **Intersect, Union, Subtract, Trim, Split sont grisées**. Elles le restent même avec deux groupes sélectionnés : c'est la restriction de l'offre gratuite. Dans le DOM, ce sont des `DIV.wrapper` sans attribut disabled ; le grisé n'est que visuel.
- **Outer Shell est actif** (non grisé), avec 2 groupes sélectionnés.
- Le clic sur Outer Shell a été le dernier geste : l'extension de navigateur a ensuite échoué 3 fois de suite, et le test a été arrêté là. **Le résultat d'Outer Shell n'a pas été observé.** Une boîte de dialogue native a peut-être bloqué la page (hypothèse).

### Comportement attendu (non vérifié)
Outer Shell fusionne des solides (groupes ou composants étanches) en un seul solide en gardant uniquement l'enveloppe extérieure. Les autres outils sont des booléens réservés aux offres payantes.

---

## 9. Paint (Pot de peinture), touche **B**, et Sample Material — [NON TESTÉ]

Ces outils n'ont pas pu être testés avant l'arrêt du navigateur. Seuls leurs boutons ont été relevés :
- `Paint (B)` dans la barre gauche ; `Sample Material` (sans raccourci) dans la grille « … », 1re ligne, à côté de Lasso.

Selon la documentation SketchUp classique (à vérifier) :
- clic = peindre l'entité ;
- Ctrl = peindre toutes les faces connectées de même matière ;
- Shift = remplacer la matière partout dans le modèle ;
- Ctrl+Shift = remplacer sur l'objet ;
- Alt = pipette (prélever).

---

## 10. Menu contextuel (clic droit, outil Select) [OBS]

Le menu porte une **barre d'icônes en tête** : Couper (ciseaux), Copier, Coller, Coller sur place (icône de presse-papiers avec une flèche), Supprimer (corbeille). Les libellés des icônes n'ont pas pu être lus : elles n'ont pas d'attribut title.

### 10.1 Sur une face (rien de sélectionné au préalable)
`Entity Info | Erase | Hide | — | Select ▸ | Make Component... | Make Group | Area ▸ | Intersect Faces ▸ | Align View | Align Axes | Reverse Faces | Orient Faces | Zoom Selection | — | Make Unique Texture (grisé)`
- **Select ▸** : Bounding Edges, Connected Faces, All Connected, All with Same Tag, All with Same Material, Deselect Faces, Invert Selection.
- **Area ▸** : Selection, Tag, Material.
- **Intersect Faces ▸** : **With Model** seulement (pas de With Selection ni With Context dans la version Web).

### 10.2 Sur une arête
`Entity Info | Erase | Hide | — | Select ▸ | Make Component... | Make Group | Soften | Divide | Zoom Selection`
- **Select ▸** : Connected Faces, All Connected, All with Same Tag, Deselect Edges, Invert Selection.
- **Divide** (testé) : la barre d'état affiche `Select or enter number of segments.`, le libellé du VCB est **Segments** et la valeur par défaut `5`. Le survol de l'arête montre des points rouges et l'infobulle « 5 segments Length… ». `3` + Entrée valide, puis l'outil Select revient.

### 10.3 Sur une sélection multiple de géométrie libre (triple-clic)
`Entity Info | Erase | Hide | — | Explode (grisé) | Select ▸ | Area ▸ | Make Component... | Make Group | Intersect Faces ▸ | Align View | Reverse Faces | Weld Edges | Soften/Smooth Edges | Zoom Selection`

### 10.4 Sur un groupe
`Entity Info | Erase | Hide | Lock | — | Edit Group | Explode | Make Component... | — | Select ▸ | Unglue (grisé) | Reset Scale (grisé) | Reset Skew (grisé) | — | Intersect Faces ▸ | Soften/Smooth Edges | Zoom Selection`

Make Group a été testé : la géométrie sélectionnée devient un groupe, avec un contour bleu de boîte englobante quand il est sélectionné. Make Component… ouvre probablement une boîte de dialogue ; non cliqué.

---

## 11. Groupes / Composants

### Observé [OBS]
- **Création** : sélection (triple-clic) → clic droit → `Make Group`. Le groupe obtenu est sélectionnable d'un seul clic (contour bleu de boîte). L'entrée `Edit Group` apparaît dans son menu.
- Avec un groupe dans la sélection, le menu de la sélection multiple affiche `Explode` grisé (aucun groupe à éclater), tandis qu'il est actif sur un groupe.
- Le bouton « Edit Component Details » du panneau Components est grisé tant qu'aucun composant n'est sélectionné.

### Non testé
- L'édition par **double-clic** pour entrer dans le groupe et **Échap** pour en sortir. D'après le Select Tool (« Double-click an object to edit it »), le double-clic ouvre l'édition et la géométrie hors du groupe est grisée [INSTR].
- Explode et Make Component (boîte de dialogue).

---

## 12. Autres observations utiles pour Fadi
- Titres et raccourcis des boutons (attribut title) : Select (Space), Eraser (E), Line (L), Rectangle (R), Push/Pull (P), Move (M), Rotate (Q), Scale (S), Paint (B), Orbit (O), Pan (H), Tape Measure (T), Circle (C), 2 Point Arc (A), Lasso (Shift+Space), Offset (F), Zoom (Z), Zoom Extents (Ctrl+Shift+E), Zoom Window (Shift+W), Search (Shift+-). Sans raccourci : Polygon, Arc, 3 Point Arc, Pie, Freehand, Rotated Rectangle, 3D Text, Follow Me, Flip, Outer Shell, Intersect, Union, Subtract, Trim, Split, Dimensions, Protractor, Axes, Text, Section Plane, Tag, Position Camera, Look Around, Walk, Sample Material.
- Shift+Z n'est pas un zoom étendu dans la version Web (sans effet) ; le raccourci est Ctrl+Shift+E.
- La molette zoome autour du curseur. Pan (H) : la barre d'état affiche « Drag in direction to pan » et Esc rend l'outil précédent. Orbit (O) : « Drag to orbit. Shift = Pan, Ctrl = suspend gravity. »
- Rectangle : `Click to set first corner. | Ctrl = Toggle Select Center. | Arrow Keys = Toggle Lock Drawing Plane.` puis `Click to set opposite corner or enter length, width. | Ctrl = Toggle Draw From Center. | …`, libellé **Dimensions**, valeur `~ 1.17 m, ~ 0.90 m`.
- Une icône « Save failed » (triangle orange) est apparue à côté de Save : la sauvegarde automatique a échoué. Je n'ai pas cliqué dessus.

---

## Lacunes
1. **Paint / Sample Material** : non testés, l'extension de navigateur a échoué 3 fois de suite juste après le clic sur Outer Shell.
2. **Outer Shell** : résultat non observé. Booléens payants : vus uniquement grisés.
3. **Édition de groupe** (double-clic, Échap), Explode, Make Component : non testés.
4. **Alt** (Push/Pull Stretch, Move Autofold, Offset overlap, Follow Me périmètre) et **Shift** avec Move et Rotate : non testés, seuls les textes ont été relevés.
5. Clic simple Flip (miroir en place) non mis en évidence : l'objet était symétrique.
6. Rotation sur un axe quelconque par cliquer-glisser du rapporteur : non testée.
