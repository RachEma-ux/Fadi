# SketchUp pour le Web : compléments aux outils de modification (module « Planche » de Fadi)

Session de test en direct du 2026-10-06 sur app.sketchup.com (offre gratuite), nouveau modèle « Decimal - Meters ».
Ce fichier complète `outils-modification.md` et `outils-dessin.md` : il traite les points restés « non testés » dans ces deux documents.
Légende : **[OBS]** = observé en direct ; **[INSTR]** = texte du panneau Instructor, non vérifié sauf mention ; **[NV]** = non vérifié.
Notation : `barre d'état` = texte de `#prompt` ; `[Libellé | valeur]` = `#measurements-box-label` et `#measurements-box`.

Modèle de test : boîte A de 4×3×2 m à l'origine ; boîte B de 2×2×1,5 m posée plus loin sur l'axe rouge.

---

## 0. Note de méthode : comportement des modificateurs (complète § 0.5 de outils-modification)

- Pour **Paint, Eraser et Line (Shift)**, les modificateurs restent actifs **tant qu'ils sont maintenus** : la barre d'état change au keydown et revient au keyup. Cela vaut pour Ctrl, Shift et Alt, alors que leur libellé dit « Toggle ». Dans Move et Push/Pull, en revanche, Ctrl agit en bascule (déjà documenté).
- **Line, Alt** : le changement a lieu au **relâchement** (keyup) ; chaque appui-relâchement fait passer au mode suivant (voir § 7).
- **Piège** : tant qu'un `keydown Control` synthétique n'a pas reçu son `keyup`, les raccourcis d'une lettre (Space, etc.) ne changent plus d'outil, car ils sont lus comme Ctrl+touche. Il faut toujours envoyer le keyup.
- Les données d'Entity Info peuvent être lues dans le DOM : le panneau affiche « N Entities », « Solid Group (2 in model) », « Volume », etc. Elles ont servi à mesurer les effets (nombre d'entités, volume).

---

## 1. Paint (Pot de peinture), touche **B**, et panneau Materials

### Observé en direct [OBS]
**Panneau Materials** (bouton « Materials » à droite ; il se déplie au clic sur son **icône**, pas toujours sur son libellé) :
- 3 onglets à icônes : **In Model** (maison), **Browse** (cube à damier), **3D Warehouse**.
- En tête : la vignette du matériau courant, son nom (`Default material`, `Ty_Brown1`…), et les boutons **Delete Materials** (corbeille) et **Import Material** (flèche).
- La section repliable « **Materials In Use** » est une grille de vignettes carrées, 4 par ligne. La vignette active a un **cadre bleu**. Dans un modèle neuf, elle contient déjà `Default material` et les `Ty_*` (Blue1-4, Brown1-2, Gray1-2, Green, Orange, Red, Skin, Yellow), qui viennent du personnage d'échelle. Ces matériaux restent après la suppression du personnage.
- **Cliquer une vignette active automatiquement l'outil Paint** : le liseré de l'outil passe sur Paint dans la barre de gauche.

**Barre d'état** (VCB `[Measurements | vide]` dans tous les cas, il ne sert pas) :
| État | Texte de `#prompt` |
|---|---|
| Repos | `Click to paint an item or object. \| Alt = Sample Material. \| Shift = Paint All Matching. \| Ctrl = Paint All Connected. \| Shift + Ctrl = Paint All on Same Object.` |
| Ctrl maintenu | `Click to paint connected faces with matching material. \| …` (le reste ne change pas) |
| Shift maintenu | `Click to paint matching faces. \| …` |
| Shift + Ctrl maintenus | `Click to paint matching faces of the same object. \| …` |
| Alt maintenu | `Click a face to load its material into the Paint Bucket.` (seul segment) |

**Effets vérifiés :**
1. **Clic simple** sur la face avant de A (Ty_Brown1) : **seule cette face** est peinte.
2. **Ctrl + clic** sur le dessus de A (matériau Ty_Gray2) : toutes les faces **connectées qui avaient le même matériau** (Default) sont peintes, soit le dessus, les côtés et l'arrière. La face avant brune **n'a pas changé**.
3. **Alt + clic** sur la face brune : le matériau est **prélevé**. La vignette d'en-tête devient `Ty_Brown1`, la vignette de la grille est encadrée et l'outil reste Paint. Après le relâchement d'Alt, un clic sur la face avant de B la peint en brun.
4. **Shift + clic** (avec Ty_Red) sur la face brune de A : **toutes les faces Ty_Brown1 du modèle** deviennent rouges, y compris celle de B, qui n'est pas connectée à A.
5. **Shift + Ctrl + clic** (avec Ty_Red) sur le dessus Ty_Gray2 de la géométrie libre : toutes les faces Ty_Gray2 **de cet objet** (géométrie connectée) deviennent rouges. Les faces Ty_Gray2 situées **dans un composant voisin restent inchangées**.

**Groupe et faces intérieures :**
- B est transformé en groupe, puis on le peint de l'extérieur (vert) : les faces qui avaient `Default material` **apparaissent vertes** ; la face déjà rouge **reste rouge**. Entity Info du groupe : `Front: Ty_Green`. Le matériau est donc posé sur le **groupe** et ne s'affiche que sur ses faces sans matériau.
- En édition du groupe (double-clic), on peint le dessus en orange : le dessus devient orange et le reste vert à la sortie. Le matériau de la face l'emporte sur celui du groupe.

### Sample Material (grille « … », 1re ligne)
- [OBS] Barre d'état : `Click a face to load its material into the Paint Bucket.`, avec `[Measurements | vide]`.
- [OBS] Un clic sur une face rouge charge `Ty_Red` et **bascule aussitôt vers l'outil Paint** : la barre d'état devient celle du repos de Paint.

### Selon l'Instructor [INSTR] (fiche « Paint Bucket Tool », id 21074)
« Assign colors and materials to items and objects. » Étapes : (option) présélectionner ; choisir une bibliothèque dans la liste déroulante du Materials Browser ; choisir un matériau ; cliquer les faces.
Alt = sample ; Shift = toggle paint all faces with matching materials ; Ctrl = … all connected faces … ; Shift+Ctrl = … all faces on the same object ….
[NV] La présélection suivie d'un clic (pour peindre toute la sélection) et l'onglet Browse n'ont pas été testés.

---

## 2. Outer Shell

### Observé en direct [OBS]
**Préparation** : le groupe B (2×2×1,5) est copié avec Move + Ctrl + → (axe rouge) et `1` + Entrée. On obtient deux groupes qui se chevauchent sur 1 m.
- Entity Info des 2 groupes sélectionnés : `2 Solid Groups`, `Volume 12 m³`. Pour un seul : `Solid Group (2 in model)`. **Une copie de groupe partage la définition**, ce qui explique le « 2 in model ».
- **Menu contextuel de 2 solides sélectionnés** : `Entity Info | Erase | Hide | Lock | — | Explode | Select ▸ | Area ▸ | Make Component... | Make Group | Intersect Faces ▸ | Outer Shell | Soften/Smooth Edges | Zoom Selection`. **Outer Shell figure dans ce menu.**

**Résultat d'Outer Shell (menu contextuel)** :
- Il reste **un seul groupe** : `Solid Group (1 in model)`, **Volume 9 m³** (6 + 6 − 3 de chevauchement, résultat exact). Le champ **Instance** prend le nom **`OuterShell`**. Le matériau du groupe revient à `Default material` (le vert du groupe est perdu), mais les matériaux des faces (rouge, orange) sont conservés.
- Le volume obtenu est une boîte de 3×2×1,5. Une couture reste visible au milieu, là où se rejoignent les faces venues des deux solides. En édition, cette ligne apparaît grise et non surlignée en bleu dans la sélection. Lecture d'Entity Info après triple-clic à l'intérieur : `18 Entities` [lecture possiblement non rafraîchie, NV].
- L'application **n'a pas planté** cette fois-ci.

**Outer Shell en outil** (grille « … ») :
- Barre d'état : `Select first solid.`, puis après un clic sur un solide : `Select second solid.`, avec `[Measurements | vide]`. Le survol d'une géométrie libre (non solide) n'a pas changé le texte. **Échap** ramène à `Select first solid.`

### Selon l'Instructor [INSTR] (fiche « Outer Shell Tool », id 24198)
« Combine all selected solid objects into a single solid object and remove interior items. » Étapes : 1) Select first solid object. 2) Select second solid object. 3) Select next solid object or press Esc to complete.

---

## 3. Groupes et composants

### 3.1 Make Group [OBS]
Triple-clic (tout le connecté), clic droit, `Make Group`. Ensuite, **un clic simple sélectionne le groupe entier**, avec un contour bleu.

### 3.2 Édition par double-clic, rendu, sortie [OBS]
- Un **double-clic** (outil Select) sur le groupe ouvre l'édition :
  - le **reste du modèle est délavé** (couleurs pâles, semi-transparent : le rouge devient rose pâle, le noir gris) ;
  - une **boîte englobante en pointillés noirs** entoure le groupe ;
  - **les axes se déplacent** sur l'origine locale du groupe (l'un de ses coins).
- La barre d'état reste celle de l'outil (`Click or drag to select objects. …`) : **rien n'indique dans la barre d'état qu'on est en édition**.
- **Échap avec l'outil Select = sortie de l'édition.** **Échap avec l'outil Paint ne fait pas sortir** : il faut d'abord repasser à Select.
- Un clic dans le vide, en dehors du groupe, avec Select fait aussi sortir [OBS indirect : la 1re tentative est ressortie aussitôt].

### 3.3 Make Component… : boîte de dialogue [OBS]
Titre **« Create Component »**, croix de fermeture.
- **Definition Name** : texte prérempli et sélectionné, `Component`, puis `Component#2`… quand le nom existe déjà. Une petite croix efface le contenu. À droite, un **chevron ⌄** déplie les options avancées (le chevron devient ⌃) :
  - **Description** (champ texte vide) ;
  - **Glue to:** 5 boutons-icônes, **None** (par défaut, icône barrée rouge, fond bleu clair), **Any**, **Horizontal**, **Vertical**, **Sloped** ;
  - trois interrupteurs : **Cut opening** (off), **Always face camera** (off, gris foncé), **Shadows face sun** (off, grisé).
- Boutons **Cancel** (lien) et **Create** (bleu).
- Pendant que la boîte est ouverte, le modèle est assombri et un **petit trièdre d'axes du futur composant** s'affiche sur la sélection.
- Attention : lors du 1er essai, le clic sur le chevron a fermé la boîte **et créé le composant** (`Component`). Le 2e essai, avec un `.click()` sur le bouton, a bien déplié les options.

**Entity Info d'un composant** : `Solid Component (1 in model)`, `Volume 24 m³`, champ **Instance** (vide), **Definition** (`Component`), Materials Front, Tags (`Untagged`), Shadows (Cast/Receive), `Unlocked`.

**Menu contextuel d'un composant** : `Entity Info | Erase | Hide | Lock | — | Edit Component | Make Unique (grisé s'il n'y a qu'1 instance) | Explode | — | Select ▸ | Unglue (grisé) | Change Axes | Reset Scale / Reset Skew / Scale Definition (grisés) | — | Intersect Faces ▸ | Soften/Smooth Edges | Zoom Selection`.

### 3.4 Instances liées [OBS]
- Une copie (Move + Ctrl + ←, `4` + Entrée) passe Entity Info à `(2 in model)`.
- En édition d'une instance, Push/Pull du dessus de `1` m : **l'autre instance grandit aussi** de 1 m. Elle est visible en délavé pendant l'édition, puis en couleurs normales à la sortie. Volume affiché : 36 m³ (4×3×3).

### 3.5 Make Unique [OBS]
- Disponible quand il y a au moins 2 instances. Après le clic : Definition = **`Component#1`**, `(1 in model)`.
- En édition de cette instance, Push/Pull du dessus de 1,5 m vers le bas : seule celle-ci change (Volume 18 m³) ; l'autre garde 3 m de haut.

### 3.6 Explode [OBS]
- Clic droit sur le composant, `Explode` : la géométrie reste **sélectionnée**. Entity Info : **`18 Entities`** (6 faces et 12 arêtes), `Front: Multiple`.
- Ensuite, un clic simple sélectionne **une seule face** (`Face`, `Area 6 m²`, Front `Ty_Red`, Back `Default material`) : la géométrie est redevenue libre.

---

## 4. Eraser (E) avec Ctrl (adoucir), Shift (masquer), Alt (réafficher)

### Observé en direct [OBS]
| État | `#prompt` |
|---|---|
| Repos | `Click or drag to erase items. \| Ctrl = Toggle Soften/Smooth. \| Alt = Toggle Unsmooth/Unhide. \| Shift = Toggle Hide.` |
| Ctrl | `Click or drag to soften/smooth edges. \| …` |
| Shift | `Click or drag to hide items. \| …` |
| Alt | `Click or drag to unsmooth/unhide items. \| …` |
VCB `[Measurements | vide]`.

- **Ctrl (adoucir)** : on glisse en travers de l'arête verticale qui sépare deux faces avant coplanaires. L'arête **disparaît à l'écran** mais n'est pas effacée : la géométrie compte toujours **31 entités**, alors qu'un effacement aurait fusionné les faces. En sélection, l'arête adoucie s'affiche en **pointillés bleus**. Un clic sur l'une des deux faces ne sélectionne que celle-ci (pas de « surface » commune pour un adoucissement entre faces coplanaires).
- **Shift (masquer)** : sur une ligne libre posée au sol, un clic l'a fait **disparaître**.
- **Alt (réafficher)** : un clic **au même endroit** (sur la ligne invisible) l'a **fait réapparaître**. La ligne avait donc bien été masquée, et non effacée.
- Les deux premiers essais de Shift + **glisser** sur des arêtes de boîte n'ont rien donné de visible. Le glisser automatisé est instantané et échantillonne mal son trajet ; le clic, lui, fonctionne.

### Selon l'Instructor [INSTR] (outils-dessin § 3)
Ctrl+Shift = retirer de la liste en cours de gommage [NV].

---

## 5. Collage de la géométrie libre (« sticky geometry »)

### Observé en direct [OBS]
- **Une ligne tracée sur une face la divise** : déjà observé (voir outils-dessin § 4). La ligne qui va d'un milieu d'arête à l'autre coupe la face en deux.
- **Deux boîtes libres qui se touchent fusionnent** : on copie une boîte libre (18 entités) avec Move + Ctrl + → et `4` + Entrée, ce qui la colle face contre face. Le triple-clic sélectionne alors **les deux boîtes ensemble : 31 entités** (= 18 + 18 − 1 face commune − 4 arêtes communes). La face de contact devient **une seule face intérieure partagée**. Les arêtes coïncidentes sont fusionnées.
- **Copie libre qui chevauche** (Move + Ctrl + ↑, `1` + Entrée sur une boîte de 1,5 m de haut) : **75 entités** connectées. Des arêtes horizontales apparaissent à 1 m et à 1,5 m sur les faces latérales. Les faces coplanaires qui se recouvrent se découpent donc automatiquement.
- **Les groupes ne collent pas** : deux groupes qui se chevauchent restent 2 entités distinctes, et l'édition de l'un ne touche pas l'autre (définitions séparées après Outer Shell, partagées avant). C'est le moyen d'isoler une géométrie.

---

## 6. Intersect Faces (menu contextuel)

### Observé en direct [OBS]
- Le sous-menu propose **`With Model` uniquement**. C'est vrai sur une face, sur un groupe et sur un composant.
- **Composant qui pénètre une géométrie libre** : le composant 4×3×3 est déplacé de 2 m sur le vert pour qu'il entre dans la boîte libre. Ensuite : clic droit sur le composant, `Intersect Faces ▸ With Model`. La géométrie libre passe de **75 à 103 entités** : de nouvelles arêtes apparaissent sur ses faces, le long de la pénétration (lignes verticales sur la face latérale et ligne sur le dessus). Barre d'état ensuite : celle de Select, inchangée.
- **Deux groupes qui partagent la même définition** (copie) : `With Model` sur l'un **n'a rien ajouté**. Il reste 18 entités dans le groupe et aucune arête libre à la racine.
- [NV] On n'a pas vérifié si des arêtes sont aussi ajoutées à l'intérieur du composant.

---

## 7. Line (L) : Shift (verrouillage) et Alt (cycle des inférences)

### Observé en direct [OBS]
- Après le 1er clic, curseur sur l'inférence « On Red Axis » (segment rouge fin) : `Click to set second endpoint or enter length. | Alt = Toggle Linear Inferences (All On). | Arrow Keys = Toggle Lock Inference Direction.`, `[Length | 1.81 m]`.
- **Shift maintenu**, puis curseur éloigné de l'axe : le segment reste sur l'axe rouge, **épais et rouge**. Un **petit carré rouge** marque le point projeté et une **ligne pointillée** le relie au curseur. Le VCB passe en approché `[Length | ~ 1.22 m]`. **Le segment « Alt = … » disparaît de la barre d'état** pendant le verrouillage.
- **Relâchement de Shift** : le segment redevient noir et libre, et suit le curseur (`3.16 m`).
- **Alt, cycle de 3 états, appliqué au keyup** : `(All On)` → `(All Off)` → `(Parallel/Perpendicular Only)` → `(All On)`. En `All Off`, au même endroit, le segment **ne s'accroche plus** sur l'axe rouge : il reste noir.

---

## 8. 2 Point Arc (A) : double-clic = arc tangent

### Observé en direct [OBS]
- Arc 1 en 3 clics (départ, fin, bulge). Retour à `Click to set start point. | Use Ctrl '+' or Ctrl '-' to change the number of segments. | Alt = Toggle Lock Tangency. | Arrow Keys = …`, avec `[Bulge | 1.66 m]` qui garde la dernière valeur.
- Au survol de l'extrémité : point vert et **lignes pointillées vers le centre de l'arc** (point bleu).
- Clic sur l'extrémité, puis survol : l'aperçu est **cyan** (tangent), `Click to set end point or enter length. | …`, `[Length | 11.61 m]`.
- **Un double-clic au point final crée directement l'arc tangent**, sans étape de bulge, puis l'outil revient à `Click to set start point.` On obtient une courbe en S continue. Contrairement au mode Alt « Lock Tangency » (outils-dessin § 10), **il n'y a pas d'enchaînement automatique** : un nouvel arc tangent demande un nouveau clic sur l'extrémité, puis un double-clic.

**Menu contextuel d'une courbe (arc)** [OBS] : `Entity Info | Erase | Hide | — | Select ▸ | Make Component... | Make Group | Soften | Divide | Explode Curve | Convert to Polygon | Find Center | Zoom Selection`.

---

## 9. Undo / Redo par les boutons

### Observé en direct [OBS]
Boutons en haut à gauche, à côté du titre (title `Undo`, `Redo`) :
- Séquence : masquer une ligne (Shift), puis la réafficher (Alt). **Undo** ×1 → la ligne est de nouveau masquée ; Undo ×2 → elle est de nouveau visible (état initial) ; **Redo** → elle est masquée. **Masquer et réafficher comptent chacun comme un pas d'annulation.**
- Après un Undo, Redo s'active (il est grisé quand la pile est vide). Le DOM n'a ni `disabled` ni `aria-disabled` sur ces boutons : l'état grisé n'est que visuel (classe CSS).
- Une icône « ⚠ » orange (sauvegarde automatique en échec) apparaît entre Redo et Save. Je n'ai pas cliqué dessus.

---

## 10. Récapitulatif des lacunes restantes
1. La peinture d'une présélection et l'onglet Browse de Materials n'ont pas été testés.
2. Outer Shell : nombre exact d'entités du résultat et nature de la ligne de couture (adoucie ou masquée ?) non confirmés.
3. Intersect Faces : présence d'arêtes ajoutées dans le composant non vérifiée.
4. Eraser Ctrl+Shift et effacement par glisser avec modificateur : pas d'effet constaté (limite de l'automatisation).
5. « Glue to », « Cut opening » et « Always face camera » ont seulement été relevés, pas testés.
