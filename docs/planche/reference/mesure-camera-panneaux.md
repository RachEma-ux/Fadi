# SketchUp pour le Web — Mesure/annotation, caméra, panneaux, menus, réglages, raccourcis

Référence pour recréer le module « Planche » de Fadi. Test en direct le 2026-10-06 sur app.sketchup.com (build `2026-10-01--18-45-18--dd1ae9a`), modèle neuf « Decimal - Meters », boîte de test 4 m × 3 m × 2,70 m, personnage « Ty » par défaut.

Légende :
- **[OBS]** : observé en direct (essai réel, texte relevé dans le DOM ou à l'écran).
- **[INSTR]** : texte du panneau Instructor, pas vérifié par un essai.
- **[NON TESTÉ]** : pas vérifié.

Conventions transverses **[OBS]** :
- La barre d'état (en bas à gauche) affiche les consignes de l'outil actif. Les segments sont séparés par « | ».
- La « boîte de mesures » (VCB) est en bas à droite : un libellé suivi d'un champ texte. Le libellé change selon l'outil (Measurements, Length, Area, Distance, Radius, Angle, Field of View, Height Offset, Eye Height…). On tape directement au clavier, sans cliquer dans le champ, puis Entrée. Le séparateur de liste est la virgule (`4m,3m`) et l'unité est acceptée (`2.7m`).
- Une info-bulle d'inférence suit le curseur : « Endpoint », « On Face », « On Edge », « Endpoint in Ty ~ -0.54 m -0.47 m ~ 1.73 m » (sur un composant, avec les coordonnées), « Unlocked plane », « On Face 10.8 m² » (Tape Measure au survol d'une face).
- Le curseur est une image SVG propre à chaque outil et à chaque mode (ex. `tape_measure_guides_c.svg`, `tape_measure_c.svg`). C'est le moyen le plus fiable de savoir dans quel mode se trouve l'outil.
- Les outils pris dans la grille « … » s'ajoutent dans un emplacement « récents » de la barre gauche, sous Tape Measure.
- Les outils de caméra temporaires (Zoom Window, Pan, Orbit lancé depuis un autre outil…) rendent la main à l'outil précédent quand l'action est finie. Après Zoom Window, le Tag tool est revenu tout seul. Après Axes, c'est le Protractor qui est revenu.

---

## 1. Outils de mesure et d'annotation

### 1.1 Tape Measure — raccourci **T**
Titre du bouton : `Tape Measure (T)`.

**Modes**, que Ctrl fait défiler dans l'ordre Guides → Points de guide → Mesure → Guides **[OBS]** :

| Mode | Curseur | Barre d'état (avant 1er clic) |
|---|---|---|
| Lignes de guide (par défaut) | `tape_measure_guides_c.svg` | `Click to create a guide. \| Ctrl = Cycle Guide Lines/Guide Points/Measure. \| Arrow Keys = Toggle Lock Inference Direction.` |
| Points de guide | curseur `auto` (pas d'image) | `Double-click or click and measure to create a guide point \| Ctrl = … \| Arrow Keys = …` |
| Mesure seule | `tape_measure_c.svg` | `Click an item to measure from. \| Ctrl = … \| Arrow Keys = …` |

Note d'implémentation : Ctrl seul, envoyé comme touche système, n'a pas basculé le mode. Un `KeyboardEvent` keydown+keyup `Control` envoyé au canvas l'a fait basculer. L'appli réagit donc à une pression puis relâche de Ctrl seule.

**Étapes observées, mode Guides [OBS]** :
1. Survol d'une face : l'info-bulle affiche « On Face 10.8 m² ». La VCB affiche `Area` = `10.8 m²` : l'aire de la face survolée apparaît avant le 1er clic.
2. 1er clic sur un **sommet**, puis déplacement vers un autre sommet. La barre d'état passe à `Click to place guide or enter distance.` La VCB passe à `Length` = `4.00 m`. Une ligne pointillée rouge (couleur de l'axe) relie les deux points, avec l'étiquette « 4.00 m » près du curseur.
3. 2e clic sur le sommet. Barre d'état : `Click to create a guide or enter distance to resize model.` La VCB garde `Length 4.00 m`. Mesurer de point à point ne crée pas de guide visible.
   - Saisir une longueur à cette étape ouvre le redimensionnement de tout le modèle (selon l'Instructor). **[NON TESTÉ]** : la saisie de redimensionnement a été bloquée exprès, et la boîte de confirmation n'a pas été vue.
4. 1er clic sur une **arête** (milieu de l'arête du bas), puis déplacement vers le haut. Une ligne bleue suit l'axe bleu, avec l'étiquette `1.15 m`. La barre d'état reste sur `Click to place guide or enter distance.`
5. Saisie de `1m` puis Entrée : une ligne de guide **infinie** (tirets noirs) parallèle à l'arête est créée à 1 m. La barre d'état revient à `Click to create a guide.` La VCB garde `1m`.

**Selon l'Instructor [INSTR]** : « Measure distances, create guide lines and guide points, or scale a model. »
- Étapes : 1) cliquer le point de départ ; 2) déplacer le curseur ; 3) cliquer le point d'arrivée.
- Modificateurs : Ctrl fait défiler Guide Lines / Guide Points / Measure. Maintenir Shift verrouille la direction d'inférence courante. Les flèches verrouillent une direction : → rouge, ← vert, ↑ bleu, ↓ parallèle/perpendiculaire.
- Astuces : Échap annule. Après une mesure point à point, saisir une distance redimensionne le modèle. En mode guide, partir d'une arête donne un guide infini et partir d'un point donne un guide fini. En mode point de guide, partir d'une arête ou d'une face puis mesurer pose un point au bout ; un clic dans le vide pose un point seul.

### 1.2 Dimensions — pas de raccourci par défaut
Accès : grille « … ». La commande « Dimensions » existe dans la recherche (« Create linear dimensions by defining two points. »).

**Linéaire [OBS]** :
- Au repos : `Select an edge, curve, or two points to dimension, or drag one to move.` La VCB affiche `Measurements` (vide).
- 1er clic sur un sommet : `Select second point for linear dimension.`
- 2e clic : `Place the dimension.`
- Clic de placement : la cote est créée et la barre d'état revient à l'état de repos.
- Rendu : lignes d'attache depuis les deux points, ligne de cote parallèle, petites flèches aux extrémités. Le texte « 4.00 m » est **centré sur la ligne de cote**, qui est coupée autour du texte.
- Survoler une arête la surligne en bleu ; on peut la cliquer comme cible.

**Cercle et arc [OBS]** :
- Cliquer **sur la courbe** d'un cercle (la courbe passe en bleu au survol) donne `Place the dimension.` On obtient une cote de **diamètre** : `DIA 1.20 m` pour un cercle de rayon 0,60 m.
  - Curseur hors du cercle : ligne de rappel (leader) avec le texte « DIA 1.20 m » au bout d'un petit trait horizontal.
  - Curseur dans le cercle : le texte est posé sur le diamètre.
- Cliquer près d'un sommet du polygone de 24 segments accroche l'« Endpoint » ou le « Center » au lieu de la courbe : on obtient alors une cote linéaire centre → point (ex. 0.89 m, 1.05 m). Pour viser la courbe, il faut zoomer.
- Rayon `R` pour les arcs : **[NON TESTÉ]**. L'objet sélectionné s'appelle « Radial Dimension » dans Entity Info.

**Entity Info d'une cote radiale ou linéaire [OBS]** (titre « Radial Dimension ») :
- Font : liste déroulante. Polices : Architects Daughter (défaut), Concert One, Lato, Lora, Merriweather, Montserrat, Noto Sans, Open Sans, Oswald, PT Sans, Permanent Marker, Playball, Prompt, Raleway, Roboto.
- Style : liste « Regular », grisée pour cette police.
- Taille : liste 9, 10, 11, 12 (défaut), 14, 18, 20, 24, 32.
- Align to : 2 boutons, `Align text centered on dimension line` et `Align text to the screen`.
- Endpoints : 5 boutons, `None`, `Slash`, `Open arrow`, `Closed arrow`, `Dot`.
- Materials, Front : pastille « Material ».
- Tags : liste « Untagged ».
- Le texte des cotes s'affiche dans la police choisie (Architects Daughter, effet manuscrit).

**Selon l'Instructor [INSTR]** : « Place Dimension entities. »
1) Cliquer le point de départ ; 2) déplacer ; 3) cliquer le point d'arrivée ; 4) déplacer pour sortir la ligne de cote ; 5) cliquer pour la poser. Échap annule.

### 1.3 Protractor — pas de raccourci
- **[OBS]** Au repos : `Click to set center of Protractor. | Ctrl = Toggle Create Guides. | Arrow Keys = Toggle Lock Rotation Plane.` La VCB affiche `Angle`.
- **[OBS]** Visuel : un rapporteur circulaire gradué suit le curseur. Il est vert quand son plan est perpendiculaire à l'axe vert (sur une face verticale) et bleu quand il est posé sur le sol (plan rouge/vert). L'info-bulle « Unlocked plane » s'affiche quand rien ne verrouille le plan.
- **[OBS]** 1er clic (centre) puis 2e clic (début de l'angle) : `Click to place guide or enter angle. | Ctrl = Toggle Create Guides.` La VCB affiche l'angle courant en degrés avec une décimale (`0.0`, puis `86.9` en bougeant).
- **[OBS]** Saisie `30` puis Entrée : l'outil revient à l'étape 1 et la VCB affiche `30`. Aucune ligne de guide à 30° n'était clairement visible dans le cadrage : création du guide **non confirmée visuellement**.
- **[INSTR]** « Measure angles and create angled guide line entities. »
  - Étapes : placer le centre au sommet de l'angle et cliquer ; ou bien cliquer-glisser le 1er point pour fixer le plan de rotation ; amener le curseur au début de l'angle et cliquer ; amener le curseur à la fin et cliquer.
  - Ctrl active ou désactive la création de guides.
  - Avant le 1er clic : Shift verrouille l'inférence du rapporteur ; les flèches donnent → rouge, ← vert, ↑ bleu, ↓ parallèle.
  - Après le 1er clic : les flèches verrouillent la rotation (↓ parallèle/perpendiculaire).
  - La VCB accepte un angle en degrés (`45` Entrée) ou une pente (`4:12` Entrée).

### 1.4 Axes — pas de raccourci
- **[OBS]** Au repos : `Click to define new origin or double-click to place axes as currently oriented.`
- **[OBS]** Après clic sur l'origine : `Click to set red axis or double-click to set axes as oriented. Alt = Alternate axis orientation.` Une ligne pointillée part de l'origine vers le curseur.
- **[OBS]** Après clic sur l'axe rouge : `Click to set green axis. Alt = Alternate axis orientation (red axis is locked).` Un trièdre provisoire s'affiche : rouge court, vert, pointillés.
- **[OBS]** Après clic sur l'axe vert, les axes du modèle sont déplacés (origine au coin de la boîte, rouge le long de l'arête) et **l'outil précédent revient**. L'action se défait avec Undo.
- **[OBS]** VCB : `Measurements`, vide.
- **[INSTR]** « Move or reorient drawing axes. »
  - Clic pour l'origine, puis clic pour la direction rouge, puis clic pour la direction verte.
  - Alt donne l'autre orientation après le clic d'origine.
  - Un double-clic, à tout moment, pose les axes tels qu'ils sont orientés sur le curseur.

### 1.5 Text — pas de raccourci
- **[OBS]** Au repos : `Select object to attach text to or position on screen.`
- **Texte avec repère (leader) [OBS]** :
  1. Clic sur une entité (une face) : `Position Text.` Une ligne de rappel élastique suit le curseur et affiche un texte par défaut. Sur une face, ce texte est son **aire** : « 9.68 m² ». Sur une arête ce serait la longueur, sur un sommet les coordonnées (selon les conventions de SketchUp, non vérifié ici).
  2. Clic de placement : `Enter text string.` Une zone de saisie (`TEXTAREA`) apparaît, pré-remplie avec le texte par défaut.
  3. Un clic en dehors valide.
- **Texte écran [OBS]** : clic dans le vide (le ciel). Une zone de saisie apparaît, pré-remplie avec le texte indicatif « Enter text ». Le texte est fixé à l'écran et ne bouge pas avec la caméra.
- **Entity Info, texte avec repère [OBS]** (titre « Text ») :
  - Font, style et taille, comme pour les cotes.
  - Endpoints : None, Slash, Open arrow, **Closed arrow** (défaut).
  - Align to : `Align Leader Text to the Screen` et `Align Leader Text to Pin` (**défaut : Pin**).
  - Materials, Front ; Tags.
- **Entity Info, texte écran [OBS]** : seulement Font, style et taille, Materials (Front) et Tags. Pas d'Endpoints ni d'Align.
- **[INSTR]** 1) Cliquer une entité (bout du repère) ; 2) déplacer ; 3) cliquer pour poser ; 4-5) en option, cliquer dans la boîte et saisir ; 6) cliquer en dehors pour terminer. Échap annule.

### 1.6 Section Plane — pas de raccourci
- **[OBS]** Barre d'état : `Place section plane on face.  Shift = Lock to plane.` (avec deux espaces).
- **[OBS]** Aperçu : un rectangle avec 4 languettes aux coins, qui épouse la face survolée. Sa couleur suit l'axe de la normale : **vert** sur une face de normale verte, **rouge** sur une face de normale rouge.
- **[OBS]** Le clic pose le plan, la coupe est active tout de suite, et **l'outil passe à Select** avec le plan sélectionné. Le plan sélectionné est orange, avec des symboles « cercle + flèche » aux coins pour indiquer le sens. Non sélectionné, il est gris ; au survol, il est bleu.
- **[OBS]** Menu contextuel (clic droit) d'un plan de coupe :
  - icônes en haut (couper, copier, coller, …, supprimer) ;
  - Entity Info, Erase, Hide ;
  - Invert Selection ;
  - **Reverse**, **Active Cut** ;
  - Align View ;
  - Create Group from Slice (grisé quand la coupe est inactive) ;
  - Troubleshoot Section Fill.
- **[OBS]** Avec Reverse, la coupe s'inverse (ici, tout le volume a disparu) et les flèches changent de sens. Décocher Active Cut désactive la coupe et le modèle redevient entier, tandis que le plan reste visible.
- **[OBS]** Entity Info d'un plan de coupe : « Section Plane », champ texte `Instance Name`, petit champ `Symbol` (vide), `Tags`. Pas de case « actif » dans le panneau.
- **[INSTR]** « Create section cuts through your model or objects. »
  - Cliquer une face crée un plan aligné sur cette face.
  - Maintenir Shift avant le 1er clic verrouille l'orientation. Les flèches verrouillent l'orientation (→ rouge, ← vert, ↑ bleu, ↓ parallèle).
  - On peut avoir plusieurs plans actifs s'ils sont dans des contextes différents (modèle, groupe, composant).

### 1.7 Tag (outil) — pas de raccourci
- **[OBS]** Sans tag sélectionné : `Select or sample a tag to begin tagging. | Alt = Toggle Sample Tag.` L'info-bulle du curseur dit « Select a single tag to apply ».
- **[OBS]** Avec un tag sélectionné dans le panneau Tags : `Click an object to apply a tag. | Alt = Toggle Sample Tag. | Shift = Toggle Replace Matching. | Ctrl = Toggle Tag All Instances.`
- **[INSTR]** Choisir un seul tag dans le panneau Tags, puis cliquer un objet.
  - Alt échantillonne le tag d'un objet. Ctrl applique le tag à toutes les instances d'un composant. Shift remplace le tag de tous les éléments du contexte.
  - Astuces : taguer de préférence des groupes ou composants ; utiliser « Select > All with Tag » dans le menu contextuel ; utiliser Color by Tag.

---

## 2. Outils de caméra

| Outil | Raccourci | Barre d'état [OBS] | VCB [OBS] |
|---|---|---|---|
| Orbit | **O** | `Drag to orbit. Shift = Pan, Ctrl = suspend gravity.` | — |
| Pan | **H** | `Drag in direction to pan` | — |
| Zoom | **Z** (annoncé ; voir la note) | `Drag cursor to zoom.  Up is in, down is out. Shift to change Field of View.` | `Field of View` = `35.00 deg.` |
| Zoom Extents | **Ctrl+Shift+E** | (action immédiate) | — |
| Zoom Window | **Shift+W** | `Drag window area to zoom to` | — |
| Position Camera | — | `Select the camera position.` | `Height Offset` = `~ 1.68 m` |
| Look Around | — | `Drag in direction to turn camera` | `Eye Height` = `~ 2.80 m` (variable) |
| Walk | — | `Click and drag to walk. Ctrl = run, Shift = move vertically or sideways, Alt = disable collision detection` | `Eye Height` = `~ 2.34 m` |

Détails :
- **Orbit [OBS]** : un glisser vers la droite tourne la caméra autour du modèle, verticales gardées.
  - **[INSTR]** Maintenir Shift passe en Pan ; maintenir Ctrl suspend la gravité (les verticales ne restent pas verticales) ; Échap rend l'outil précédent.
- **Pan [INSTR]** : « Move camera vertically or horizontally. » Échap rend l'outil précédent.
- **Zoom [OBS]** :
  - VCB `Field of View` affichée en `35.00 deg.` par défaut.
  - Saisir `60` puis Entrée passe à `60.00 deg.` : grand angle visible, l'horizon descend. On revient avec `35` Entrée.
  - Un glisser vers le haut zoome.
  - Note : la touche **Z** n'a pas activé Zoom quand on venait de Pan (deux essais). L'outil a été lancé depuis la grille. Raccourci listé dans le titre « Zoom (Z) » et dans la recherche ({SC Z}).
  - **[INSTR]** Maintenir Shift change le champ de vision en degrés.
- **Zoom Extents [OBS]** : la vue est cadrée sur tout le modèle. Le cadrage **ne tient pas compte** des panneaux de droite, qui recouvrent une partie du modèle.
- **Zoom Window [OBS]** : glisser un rectangle zoome sur cette zone, puis l'outil précédent revient.
  - **[INSTR]** « Click and drag the cursor across the items in the model that you want to zoom into. »
- **Position Camera [OBS]** :
  - VCB `Height Offset ~ 1.68 m`.
  - Un clic au sol place l'œil au-dessus du point puis **active Look Around automatiquement**. La VCB devient `Eye Height`.
  - **[INSTR]** Clic simple : caméra au-dessus du point, à la hauteur saisie. Cliquer-glisser d'un point A vers un point B : caméra en A qui regarde vers B.
- **Look Around [OBS]** : un glisser fait pivoter la caméra sur place.
  - **[INSTR]** « Pivot camera from a stationary point. » Échap rend l'outil précédent.
- **Walk [OBS]** : barre d'état et VCB relevées ; marche non testée longuement.
  - **[INSTR]** Cliquer-glisser : haut = avancer, bas = reculer, gauche/droite = tourner. Shift = monter/descendre au lieu d'avancer/reculer. Ctrl = courir. Alt = traverser les objets. Plus on s'éloigne du point de départ (marqué par une croix), plus on va vite.

## 3. Navigation (souris)
- **[OBS]** **Molette** : zoom **centré sur le curseur**, environ un cran par niveau. Testé en avant et en arrière.
- **[NON TESTÉ]**, l'outil d'automatisation n'ayant ni clic milieu ni molette avec modificateur :
  - bouton du milieu glissé = orbite ;
  - Shift + bouton du milieu = pan ;
  - double-clic molette = recentrer.
  Ce sont les conventions de SketchUp ; à vérifier.
- **Menu « Input Device »** (icône souris, 3e icône en bas à gauche) **[OBS]** :
  - Fenêtre « CHOOSE YOUR INPUT DEVICE », fermeture ×.
  - Deux grosses tuiles : **Mouse** (sélectionnée, fond bleu) et **Trackpad**.
  - Lien « More settings », qui ouvre Settings sur le seul onglet Navigation.
- Réglages de navigation : voir § 7.3.

---

## 4. Panneaux de droite

**Structure [OBS]** :
- Colonne d'icônes à droite. Le libellé s'affiche sous forme de pastille texte au survol, ou en permanence au début.
- Ordre : Entity Info, Components, Instructor, 3D Warehouse, Materials, Styles, Tags, Shadows, Scenes, Display, Soften / Smooth, Model Info.
- Un clic sur l'icône ouvre le panneau **en place dans la pile** : une carte large d'environ 300 px avec un en-tête titre + icône. Recliquer l'icône de l'en-tête le ferme.
- Une poignée `Resize panel` et un bouton `»` (`Hide panels`) replient tout.
- Plusieurs panneaux peuvent s'empiler.
- Le bouton « Upgrade Now » est fixé en bas.
- Outliner, Solid Inspector et Comments **n'apparaissent pas** dans cette colonne (compte gratuit).

### 4.1 Entity Info [OBS]
- Rien de sélectionné : « **No Selection** », rien d'autre.
- Face sélectionnée :
  - « Face » ; `Area` `9.68 m²` (aire calculée, ici face de 10,8 m² moins le disque) ;
  - Materials : `Front` liste « Default material » avec vignette, `Back` liste « Default material » ;
  - Tags : liste « Untagged » ;
  - Shadows : interrupteurs `Cast Shadows` (activé) et `Receive Shadows` (activé).
- Cote : voir § 1.2. Texte : voir § 1.5. Plan de coupe : voir § 1.6.

### 4.2 Components [OBS]
- En haut, 2 icônes : `Edit Component Details` (crayon, grisé sans sélection) et `Open 3D Warehouse`.
- Liste des composants du modèle : vignette, nom « Ty », auteur « SketchUp », menu ⋮ (`Overflow`).
- Le menu ⋮ propose `Edit Component Details` et `Upload to 3D Warehouse`.

### 4.3 Instructor [OBS]
- Panneau avec une illustration animée de l'outil et une aide HTML (iframe `/en/helpcontent/tool/<id>/index.html`).
- Contenu : titre, résumé, « Tool Operation » (liste numérotée), « Modifier Keys », « Tips », lien « Click to learn about more advanced operations... ».
- Il se met à jour à chaque changement d'outil. Les textes relevés sont repris en [INSTR] dans les sections ci-dessus.

### 4.4 3D Warehouse
**[NON TESTÉ]** : panneau non ouvert, pour éviter tout téléchargement.

### 4.5 Materials [OBS]
- 3 onglets à icônes : `In Model` (maison), `Browse` (cube), `3D Warehouse`.
- Aperçu du matériau courant (grande vignette + nom), boutons `Delete Materials` (corbeille) et `Import Material` (flèche montante).
- **In Model** : section repliable « Materials In Use », grille de vignettes 4 colonnes. Contenu : Default material, Material, Ty_Blue1-4, Ty_Brown1-2, Ty_Gray1-2, Ty_Green, Ty_Orange.
- **Browse** : catégories repliables, chacune avec une vignette ronde. Liste : Asphalt & Concrete, Brick, Fabric, Glass, Ground, Metal, Patterns, Plaster, Plastic, Roofing, Solid Colors, Stone, Tile, Wood.
  - Exemples : Asphalt_01_1K, Concrete_02_1K, Brick_01_1K, Carpet_01_1K, Denim_03_1K, Leather_06_1K, Glass_Basic_01, Glass_Mirror_01, Glass_Safety_01, Glass_Sky_Reflection_01…
- Choisir une vignette **active le Paint Bucket**. Barre d'état : `Click to paint an item or object. | Alt = Sample Material. | Shift = Paint All Matching. | Ctrl = Paint All Connected. | Shift + Ctrl = Paint All on Same Object.`
- Cliquer l'aperçu n'a pas ouvert d'éditeur de matériau.

### 4.6 Styles
**[OBS] partiel** : l'ouverture a donné un spinner de chargement qui tournait encore après plus de 10 s. Contenu non relevé. Une icône ⚠ près de « Save » indiquait un problème d'auto-sauvegarde ou de connexion.

### 4.7 Tags [OBS]
- Barre d'icônes :
  - `Toggle Master Visibility` (œil) ;
  - `Create Tag` (+) ;
  - `Create Folder` (grisé) ;
  - `Sort Tags` (A↓Z) ;
  - `Color by Tag` ;
  - `Purge unused`.
- Champ « Search tags... ».
- Liste vide au départ : « Untagged » n'est pas listé.
- **Create Tag** ouvre la fenêtre « Create New Tag » :
  - champ `Tag Name`, pré-rempli et sélectionné « Tag1 » ;
  - un chevron déplie « Choose tag color » (grille de pastilles, environ 9 par ligne, défilante) et « Choose dash pattern » (une douzaine de motifs : plein, tirets, pointillés, tiret-point…) ;
  - boutons `Cancel` et `Ok`.
- Ligne d'un tag : bandeau de couleur à gauche, œil `View Tags`, nom, menu ⋮ (`Overflow`) avec `Apply`, `Edit`, `Delete`.
- Sélectionner un tag active l'outil Tag (barre d'état du § 1.7).
- Un tag « Tag1 » a été créé dans le modèle de test.

### 4.8 Shadows, Scenes, Display, Soften/Smooth, Model Info
**[NON TESTÉ]** : l'extension Chrome a cessé de répondre (3 échecs de suite) à l'ouverture de Shadows. Le test s'est arrêté là, comme le demandait la consigne.
Ce que la recherche de commandes a confirmé à ce sujet [OBS] :
- Ombres : « View Shadows » {off}, « Use Sun for Shading » {off}, « Set Sun Location ».
- Scènes : « Scenes », « Create Scene ».
- Affichage : « Unhide All / Unhide Last / Unhide Selected », « View Hidden Geometry », « View Hidden Objects ».
- Lissage : « Soften/Smooth Edges ».

---

## 5. Vues standard [OBS : commandes présentes dans la recherche « Search SketchUp »]
Aucun bouton de vue dans la barre gauche, ni de menu Camera. Les vues se lancent par la **recherche (Shift+-)**, et on peut leur **assigner un raccourci**. Aucun raccourci par défaut.
- Front View, Back View, Left View, Right View, Top View, Bottom View, Isometric View.
- Perspective {on}, Parallel Projection {off}, Two-Point Perspective {off}. Ce sont des interrupteurs.
- Camera Previous, Camera Next, Field of View, Zoom Selection, Align View (aussi dans le menu contextuel d'une face).
- Modes d'affichage des faces : Wireframe, Hidden Line, Shaded, Shaded with Textures, Monochrome, X-ray {off}, View Back Edges {off, **K**}.

---

## 6. Menu principal ☰ (en haut à gauche, `Open Model/Preferences`) [OBS]
Le bouton devient « × » quand le menu est ouvert. Entrées, icône à gauche :
1. **Home**
2. **New**
3. **Open >** : Trimble Connect, My device.
4. **Save as**
5. **Share**
6. **Import >** : Trimble Connect, My device ; séparateur ; Status dashboard.
7. **Export >** : 3DS, Collada, DWG >, DXF >, FBX, KMZ, OBJ ; séparateur ; Status dashboard.
   - DWG > : 3D, 2D, Section Slice (grisé sans coupe active).
   - DXF > : 3D, 2D, Section Slice (grisé).
8. **Download >** : SKP, PNG, STL.
9. (séparateur) **App Settings**
10. **Add location**
11. **Print**

Rien n'a été exécuté : survol seulement, sauf App Settings.

---

## 7. Réglages (App Settings → fenêtre « SETTINGS ») [OBS]
Fenêtre modale avec onglets à gauche : **General, Accessibility, Navigation, Graphics, Memory**. **Il n'y a pas d'onglet Shortcuts** : les raccourcis s'éditent dans la recherche (§ 8). Aucun réglage n'a été modifié ; les listes ouvertes ont été refermées sur la même valeur.

### 7.1 General
- **Autosave**
  - `Autosave` : interrupteur, activé.
  - `Minutes between saves` : champ, 5.
  - `Purge unused on model exit, Save As, Export or Upload to 3D Warehouse?` : liste Always / **Ask every time** / Never.
- **Move Tool**
  - `Show Move tool rotation grips` : activé.
- **Regional**
  - `Language` : English. Choix : Deutsch, English, Español, Français, Italiano, 日本語, 한국어, Português, Русский, Svenska, 简体中文, 繁體中文.
  - `Default template` : Architectural - Feet & Inches, Fractional - Inches, Decimal - Inches, Decimal - Feet, Decimal - Millimeters, Decimal - Centimeters, **Decimal - Meters** (valeur actuelle).
- Bouton `Reset All`.

### 7.2 Accessibility
- « Axis and inference colors », 5 pastilles modifiables :
  - Red axis `rgb(255,0,0)` ;
  - Green axis `rgb(0,255,0)` ;
  - Blue axis `rgb(0,0,255)` ;
  - Parallel / perpendicular `rgb(255,0,255)` (magenta) ;
  - Tangent `rgb(0,255,255)` (cyan).
- Bouton `Reset All`.

### 7.3 Navigation
- **Choose Device** (icône ? d'aide) :
  - `Device` : Mouse / Trackpad ;
  - `Two-finger swipe mapped to` : Orbit (grisé avec Mouse).
- **Hardware** :
  - `Allow 3Dconnexion SpaceMouse support` : désactivé, avec lien « Learn more ».
- **Invert direction** :
  - `Zoom` : désactivé ;
  - `Orbit` et `Pan` : grisés avec Mouse.
- **Device Sensitivity** : curseurs de -3 à 3, valeur 0.
  - `Zoom` : actif ;
  - `Orbit` et `Pan` : grisés avec Mouse.
- Bouton `Reset All`.

### 7.4 Graphics
- **Graphics Engine** :
  - `Use classic graphics engine` : désactivé ;
  - `Automatically enhance materials` : désactivé ;
  - `Metalness` : curseur à 0.1 + interrupteur (grisé) ;
  - `Roughness` : curseur à 0.5 + interrupteur (grisé).
- **Graphics Messages** :
  - `Reset all graphics-related alert messages` : bouton `Reset Messages`.
- Bouton `Reset All`.

### 7.5 Memory
- **Memory Usage** (ⓘ) : barre « 0.7% of 4 GB ».
- **Memory Usage Warning** :
  - `Show memory usage warnings` : activé ;
  - `Show warning when usage reaches (%)` : 75.
- **Optimize Memory Usage** :
  - `Clear undo history` : désactivé ;
  - `Purge unused entities` : grisé.
- Lien « Learn how to improve performance ».
- Boutons `Reset All` et `Optimize Now` (grisé).

---

## 8. Raccourcis clavier

### 8.1 Où et comment [OBS]
- **Search SketchUp** : bouton loupe en haut de la barre gauche, `Search SketchUp (Shift+-)`. On l'ouvre aussi par Help → « Search SketchUp ».
- La recherche ouvre une barre « Search... » avec une icône (?). Les résultats sont des lignes contenant :
  - icône de l'outil ;
  - nom en gras et description ;
  - pour les commandes à bascule, un **interrupteur** qui montre l'état courant ;
  - une case carrée **`shortcut-input`** (« Assign a shortcut to this command »), vide ou affichant la touche.
- 5 résultats s'affichent d'abord, puis « See more results. » en montre jusqu'à 20.
- La commande « Reset Shortcuts » rétablit les raccourcis par défaut.
- 163 commandes ont été relevées (liste ci-dessous, sans doute presque complète).

### 8.2 Raccourcis par défaut [OBS : relevés dans les champs de la recherche et les titres des boutons]
| Commande | Raccourci |
|---|---|
| Select | Space |
| Lasso | Shift+Space |
| Eraser | E |
| Line | L |
| Rectangle | R |
| Circle | C |
| 2 Point Arc | A |
| Push/Pull | P |
| Offset | F |
| Move | M |
| Rotate | Q |
| Scale | S |
| Paint Bucket | B |
| Tape Measure | T |
| Orbit | O |
| Pan | H |
| Zoom | Z |
| Zoom Window | Shift+W |
| Zoom Extents | Ctrl+Shift+E |
| Make Component | G |
| View Back Edges | K |
| Undo | Ctrl+Z |
| Redo | Ctrl+Y |
| Cut | Ctrl+X |
| Copy | Ctrl+C |
| Paste | Ctrl+V |
| Delete | Backspace |
| Select All | Ctrl+A |
| Invert Selection | Ctrl+Shift+I |
| Print | Ctrl+P |
| Search SketchUp | Shift+- |
| Deselect (Instructor de Select) | Ctrl+T [INSTR] |

Sans raccourci par défaut : Dimensions, Protractor, Axes, Text, Section Plane, Tag, Position Camera, Look Around, Walk, Polygon, Arc, 3 Point Arc, Pie Arc, Freehand, Follow Me, toutes les vues standard, etc. « Photoreal Materials » a un champ de raccourci affiché comme « none ».

### 8.3 Liste des commandes de la recherche [OBS]
{on}/{off} donne l'état de l'interrupteur au moment du relevé.

**Outils de dessin et de modification** :
- Select ; Lasso ; Eraser ; Line ; Freehand ; Rectangle ; Rotated Rectangle ; Circle ; Polygon ; Arc ; 2 Point Arc ; 3 Point Arc ; Pie Arc ; 3D Text.
- Push/Pull ; Follow Me ; Offset ; Move ; Rotate ; Scale ; Flip ; Divide ; Weld Edges.
- Paint Bucket ; Sample Material.
- Tape Measure ; Dimensions ; Protractor ; Text ; Axes ; Section Plane ; Tag.

**Solides** : Outer Shell, Intersect, Union, Subtract, Trim, Split.

**Caméra** : Orbit, Pan, Zoom, Zoom Window, Zoom Extents, Zoom Selection, Field of View, Position Camera, Look Around, Walk, Camera Previous, Camera Next, Align View.

**Vues** : Front, Back, Left, Right, Top, Bottom, Isometric View ; Perspective {on} ; Parallel Projection {off} ; Two-Point Perspective {off}.

**Styles de faces** : Wireframe, Hidden Line, Shaded, Shaded with Textures, Monochrome, X-ray {off}, Photoreal Materials, Toggle Transparency {on}.

**Arêtes** : View Edges {on}, View Back Edges {off}, View Profiles {on}, Depth Cue {off}, View Extensions {off}, View Endpoints {off}, View Jitter {off}, Color Edges all the Same, Color Edges by Axis, Color Edges by Material.

**Affichage** :
- View Axes {on}, View Guides {on}, View Crosshairs {off}, View Dashes {on}, View Watermarks {on}, View Sky {on}, View Ground {off}, View Fog {off}, View Shadows {off}.
- View Section Planes {on}, View Section Cuts {on}, View Section Fill {on}.
- View Hidden Geometry {off}, View Hidden Objects {off}.
- Hide Rest of Model {off}, Hide Similar Components {off}.
- Color By Tag {off}, Show New Tags {on}.
- Use Sun for Shading {off}, Use Environment as Skydome, Use Environment for Reflections, Set Sun Location {off}, Project Texture {off}.

**Édition** :
- Undo, Redo, Cut, Copy, Paste, Paste in Place, Delete, Delete Guides.
- Select All, Select None, Invert Selection, Deselect Edges, Deselect Faces.
- Hide, Unhide All, Unhide Last, Unhide Selected, Lock, Unlock All, Unlock Selected.
- Make Group, Make Component, Close Group/Component.
- Reverse Faces, Orient Faces, Intersect Faces with Model, Intersect Faces with Selection, Intersect Faces with Context, Soften/Smooth Edges, Area.
- Position Texture, Reset Texture, Make Unique Texture.

**Fichier et appli** :
- Home, Create New Model, Open, Save As, Download SKP, Insert, Print.
- Export 3DS, Export Collada, Export DWG (2D), Export DWG (3D), Export DXF (2D), Export DXF (3D), Export FBX, Export KMZ, Export OBJ, Export STL, Export Image (PNG).
- Add Location, Scenes, Create Scene, Purge Unused, Optimize Memory Usage, Settings, Reset Shortcuts, Move Rotation Grips {on}, AI Assistant, AI Render.

Descriptions relevées (extraits) :
- « Make Component : Define selected geometry as an object that can be updated across multiple copies. »
- « Paste in Place : Paste geometry in the exact location from which it was cut or copied. »
- « Export DWG (2D) : Generate a scaled 2D DWG file from your current model view. »
- « Isometric View : Display a 3D object in two dimensions; use with parallel projection. »
- « Area : Display the area of a selected face. »
- « Divide : Segment a selected edge into any number of divisions. »

---

## 9. Barres du haut et du bas [OBS]

**Barre du haut, à gauche** (carte blanche) :
- ☰ `Open Model/Preferences` ;
- nom du fichier « Untitled » ;
- icône ✦ `SketchUp AI` ;
- `Undo` ↶ et `Redo` ↷ (grisés quand rien n'est à défaire ou refaire) ;
- icône d'état ⚠ (apparue pendant « Auto-saving... ») ;
- bouton texte d'état « Saved » → « Save » (`Save all changes`).

**Barre du haut, à droite** :
- pastille avatar (initiales) ;
- icône de commentaire ou curseur ;
- bouton bleu **Share**.

**Bannière** : « Upgrade your modeling experience with a SketchUp subscription. Subscribe » avec une croix ×. Elle se ferme.

**Barre gauche** :
- en haut, la loupe `Search SketchUp (Shift+-)` ;
- un chevron ^ fait défiler la liste vers le haut ;
- outils, dans l'ordre : Select, Eraser, Line, Rectangle, Push/Pull, Move, Rotate, Scale, Paint, Orbit, Pan, Tape Measure ;
- un séparateur, puis l'emplacement des outils récents (2 Point Arc, Polygon, Circle, Dimensions…) ;
- « … » ouvre la grille d'outils étendue ;
- un chevron ˅ fait défiler vers le bas.

**Grille « … »** (titres et raccourcis) :
- Lasso (Shift+Space), Sample Material.
- Circle (C), 2 Point Arc (A), Arc, Polygon, 3 Point Arc, Pie, Freehand, Rotated Rectangle, 3D Text.
- Offset (F), Follow Me, Flip, Outer Shell, Intersect, Union, Subtract, Trim, Split. Les outils solides sont grisés sans sélection.
- Dimensions, Protractor, Axes, Text, Section Plane, Tag.
- Zoom (Z), Zoom Extents (Ctrl+Shift+E), Zoom Window (Shift+W), Position Camera, Look Around, Walk.
- AI Assistant, AI Render.
- En bas, bouton « Edit » pour personnaliser la barre ; à droite, une poignée ⋮.

**Barre du bas, à gauche** :
- `Help` (?) ouvre « Need Help? » avec 3 boutons : Explore Help Center, Explore the forums, Search SketchUp ;
- `Language translation menu` (globe) ;
- `Input Device` (souris) : voir § 3 ;
- puis le texte de la barre d'état.

**Barre du bas, à droite** :
- libellé VCB + champ (« Measurements » au repos) ;
- logo SketchUp.

**Menu contextuel d'une face [OBS]** :
- icônes en haut (couper, copier, coller, …, supprimer) ;
- Entity Info, Erase, Hide ;
- Select >, Make Component..., Make Group ;
- Area >, Intersect Faces > ;
- Align View, Align Axes, Reverse Faces, Orient Faces, Zoom Selection ;
- Make Unique Texture (grisé).

---

## 10. Lacunes
- Panneaux **Styles** (bloqué sur le chargement), **Shadows, Scenes, Display, Soften/Smooth, Model Info, 3D Warehouse** non relevés : l'extension Chrome a échoué 3 fois de suite et le test a été arrêté.
- Boîte de **redimensionnement du modèle** par Tape Measure non affichée (saisie bloquée exprès).
- Création du **guide angulaire** du Protractor non confirmée à l'écran.
- Cote de **rayon** (arc) non testée.
- **Bouton du milieu, Shift+molette, double-clic molette** non testables avec l'outil.
- La touche **Z** n'a pas activé Zoom dans l'essai (outil lancé depuis la grille).
- Traces laissées dans le modèle de test « Untitled » (auto-sauvegarde activée) :
  - une ligne de guide ;
  - deux cotes ;
  - un cercle ;
  - deux textes ;
  - un plan de coupe désactivé ;
  - le tag « Tag1 ».
