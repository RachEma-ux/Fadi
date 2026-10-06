# SketchUp for Web — Référence documentaire officielle des outils (pour le module « Planche » de Fadi)

> Compilé le 2026-10-06 à partir de sources officielles (help.sketchup.com, Quick Reference Cards officielles 2025 sur download.sketchup.com, developer.sketchup.com, sketchup.trimble.com) et du forum officiel (forums.sketchup.com, réponses d'utilisateurs experts et employés).
> Les références entre crochets `[S#]` / `[F#]` renvoient à la section **Sources** en fin de document. Tout est reformulé.
>
> **Légende des niveaux de confiance**
> - (sans marque) : affirmé par une source officielle citée.
> - **[FORUM]** : seulement attesté sur le forum officiel (pas dans l'aide).
> - **[À VÉRIFIER]** : non trouvé dans une source officielle lisible (souvent présent seulement en image), ou sources contradictoires ; à confirmer par l'équipe qui teste l'app en direct.
> - **[DESKTOP]** : documenté pour SketchUp Desktop ; l'aide Web affirme que l'outillage Web est « presque identique » [S1], mais non vérifié spécifiquement sur le Web.
>
> **Remarque générale importante** : la majorité des pages d'aide des outils sont communes Desktop/Web (section « sketchup/… »). L'aide Web dit que les raccourcis par défaut du Web sont « presque identiques » à ceux du desktop et que la plupart des outils sont les mêmes, simplement placés ailleurs [S1][S44]. La convention de modificateurs est : **Windows Ctrl ⇔ macOS Option**, **Windows Alt ⇔ macOS Command** (constante dans les QRC [S5][S6] et l'aide [S16][S22]).

---

## 0. Interface SketchUp for Web (rappel)

- Les outils sont à gauche, en **Main Toolbar** + **Expanded Toolset** ; l'Expanded Toolset est personnalisable via « Edit » (réordonner, ajouter à la barre principale, « Recent Tool Slots », séparateurs) [S45][S3].
- Une icône **Search** (recherche d'outils/commandes) est en haut de la barre principale [S2] ; c'est aussi par là qu'on (ré)assigne les raccourcis [S1].
- Les panneaux sont à droite (voir §8) [S38].

---

## 1. Outils de sélection et d'effacement

### 1.1 Select — `Espace`
Raccourci Web : **Barre d'espace** [S2].
- Clic simple : sélectionne une entité (arête, face, groupe/composant) [S22].
- Double-clic sur une face : face + ses arêtes bordantes ; double-clic sur une arête : arête + faces connectées [S22].
- Triple-clic : toutes les entités connectées [S22].
- Sélection par fenêtre : glisser **gauche → droite** = seulement ce qui est **entièrement** dedans ; **droite → gauche** = ce qui est entièrement **ou partiellement** dedans (« crossing ») [S22]. (Rendu trait plein vs pointillé du rectangle : **[À VÉRIFIER]**.)
- Modificateurs [S22][S5][S6] :
  | Effet | Windows | macOS |
  |---|---|---|
  | Ajouter | Ctrl | Option |
  | Basculer (ajoute/retire) | Shift | Shift |
  | Retirer | Ctrl+Shift | Shift+Option |
- Tout sélectionner : Ctrl+A / Cmd+A ; tout désélectionner : Ctrl+T / Shift+Cmd+A [S22] **[DESKTOP]**.
- Menu contextuel « Select » : Connected Faces, All Connected, All with Same Tag, All with Same Material, Deselect Edges/Faces, Invert Selection [S22].
- Double-clic sur un groupe/composant = entrer dans son contexte d'édition (voir §7) [S34].
- Astuce officielle : la sélection persiste d'un outil à l'autre ; Échap annule l'opération en cours alors qu'Undo annule la dernière opération terminée [S8].

### 1.2 Lasso — `Shift+Espace`
- Raccourci : **Shift+Espace** [S3][S22].
- Tracé libre ou par segments [S22].
- **Sens du tracé** : horaire = inclut tout ce qui touche la zone ; anti-horaire = seulement ce qui est entièrement dans la zone [S22].
- Modificateurs (Win / Mac) : Shift = ajouter/retirer ; Alt / Option = ajouter ; Shift+Alt / Shift+Option = retirer [S5][S6]. (NB : diffère de Select où « ajouter » = Ctrl sous Windows.)

### 1.3 Eraser — `E`
- Raccourci : **E** [S2].
- Cliquer une arête l'efface **ainsi que les faces qu'elle borde** ; on peut glisser sur plusieurs arêtes : elles sont surlignées et effacées au relâchement [S23].
- L'Eraser **n'efface pas directement les faces** : une face disparaît quand on efface ses arêtes bordantes [S23]. Pour effacer seulement une face : clic droit > Erase [S7][S23].
- Modificateurs [S5][S6][S24][S7] :
  | Effet | Windows | macOS |
  |---|---|---|
  | Masquer (Hide) au lieu d'effacer | Shift | Shift |
  | Adoucir/lisser (soften/smooth) | Ctrl | Option |
  | Dé-adoucir (unsoften) | Alt | Option+Shift (QRC Mac) ; Command (page Soften) |
  → Contradiction Mac pour « unsoften » entre la QRC Mac [S6] (Option+Shift) et la page Soften/Smooth [S24] (Command) **[À VÉRIFIER]**.
- Undo : Ctrl+Z (ou Alt+Retour arrière) / Cmd+Z ; Redo disponible après Undo [S23].
- Si l'on efface une arête par erreur : Undo ou redessiner la ligne, SketchUp **recrée les faces** [S7].

---

## 2. Outils de dessin

### 2.1 Line (« Pencil » dans la barre Web) — `L`
- Raccourci : **L** [S2][S7].
- Étapes : clic = point de départ (Échap pour recommencer) → déplacer (la longueur s'affiche dans le Measurements box, la ligne prend la couleur de l'axe auquel elle est alignée) → clic = point final ; on peut aussi taper la longueur + Entrée [S7]. Les lignes s'enchaînent (le point final devient le départ de la suivante) **[À VÉRIFIER : comportement « chaînage » décrit implicitement]**.
- VCB : longueur (avec unité optionnelle) ; coordonnées **absolues `[x, y, z]`** (par rapport à l'origine des axes) et **relatives `<x, y, z>`** (par rapport au point de départ de la ligne) [S7].
- Verrouillage : flèches ↑ bleu, → rouge, ← vert, ↓ parallèle/perpendiculaire ; Shift maintient la direction d'inférence courante [S7][S6]. La QRC Windows imprime « Alt : lock in current inference direction » pour Line alors que l'aide et la QRC Mac disent **Shift** [S5][S6][S7] **[À VÉRIFIER]**.
- Bascule des inférences linéaires (après le premier clic) : **Alt (Win) / Command (Mac)** fait défiler : toutes inférences actives → toutes désactivées → parallèle/perpendiculaire seulement [S7].
- Faces : relier des lignes en boucle fermée coplanaire crée automatiquement une face ; dessiner une ligne sur une face existante **la divise** [S7] (voir §7).

### 2.2 Freehand — (pas de raccourci par défaut)
- Clic maintenu = départ ; glisser = tracé ; relâcher = fin [S12].
- Le résultat est une **entité Curve** (plusieurs segments qui se comportent comme une seule ligne pour définir/diviser une face) [S12].
- Terminer au point de départ = forme fermée → face [S12].
- Après le tracé : **Ctrl − / Ctrl +** (Win) ou **Cmd − / Cmd +** (Mac) pour diminuer/augmenter le nombre de segments [S12].
- On ne peut changer la longueur d'une courbe freehand que si elle ne borde pas de face [S12].
- Shift pour une polyligne 3D sans inférence : **[À VÉRIFIER]** (comportement desktop historique, non trouvé dans l'aide actuelle).

### 2.3 Rectangle — `R`
- Raccourci : **R** [S2][S10].
- Étapes : clic 1er coin → déplacer en diagonale → clic 2e coin, ou saisie VCB [S10].
- VCB : `longueur,largeur` (ex. `8',20'`) ; longueur seule `3',` ; largeur seule `,3'` ; valeurs **négatives** = direction inversée (`-24,-24`) [S10] ; exemple QRC : `20,40` [S5].
- Inférences de forme : carré et **section dorée** (indiquées par des points bleus / ligne diagonale) ; Shift verrouille l'inférence (ex. section dorée) [S10][S7].
- **Depuis le centre** : QRC Mac = **Option** ; QRC Windows imprime **Alt** [S5][S6]. Or la convention Option⇔Ctrl suggérerait Ctrl sous Windows → **[À VÉRIFIER]** en test réel (Web).
- Après coup : pas de modification des cotes une fois un autre outil choisi ; utiliser Scale ou redessiner [S10].

### 2.4 Rotated Rectangle — (pas de raccourci par défaut)
- Étapes : (optionnel) flèche pour fixer le plan (ex. ← = plan vert) → clic 1er coin → définir le 1er côté (inférence ou longueur + Entrée) → déplacer le rapporteur pour l'angle et la largeur → clic final [S10].
- VCB : après les deux premiers coins, `largeur,angle` (ex. `90,20`) [S5][S6].
- Modificateurs : Shift = garder la direction/le plan courant ; Alt (Win) / Command (Mac) = verrouiller le plan de dessin du 1er côté (après le 1er clic) ; flèches = aligner le 1er côté sur un axe [S5][S6][S10].

### 2.5 Circle — `C`
- Raccourci : **C** [S3][S10].
- Étapes : clic = centre → déplacer = rayon → clic [S10].
- VCB : rayon avec unité (`6"`, `8'`, `34cm`, `7m`) ; **nombre de segments = nombre + `s`** (ex. `24s`) [S5][S6][S10]. Valeurs modifiables tant qu'un autre outil n'est pas choisi ; ensuite via Entity Info (rayon, segments) [S10].
- Shift : verrouille l'inférence courante (plan) [S5][S6].
- Nombre de segments par défaut : le VCB l'affiche ; valeur **24** couramment admise **[À VÉRIFIER]** (non écrite dans le texte de l'aide).
- Le cercle reste lisse après Push/Pull (arêtes adoucies), contrairement au polygone [S10].
- Ellipse : dessiner un cercle puis Scale par une poignée médiane [S10].

### 2.6 Polygon — (pas de raccourci par défaut)
- Étapes : clic centre → déplacer (rayon) → clic ou rayon tapé + Entrée [S10].
- VCB : rayon ; nombre de côtés (l'aide dit « tapez une valeur » ; la convention `Ns` des cercles s'applique vraisemblablement, ex. `8s`) [S10] **[À VÉRIFIER format exact]**. Défaut 6 côtés **[À VÉRIFIER]**.
- **Inscrit / circonscrit** (rayon au sommet vs au milieu d'arête) : bascule **Ctrl (Win) / Option (Mac)** ; ne fonctionne que pour Polygon, pas Circle [F3].
- Chaque côté est un segment : inférences extrémité, milieu, « from point » [S10].

### 2.7 Arcs — Arc / 2 Point Arc (`A`) / 3 Point Arc / Pie
Raccourci Web : **2-Point Arc = A** ; les autres sans raccourci [S3][S4].

**Arc (par centre)** [S11]
- Clic 1 = centre ; clic 2 = point de départ (rayon en pointillé) ; clic 3 = point final.
- VCB : rayon puis angle. Segments par défaut : **12** ; après coup taper `10s` pour les segments.

**Pie** [S11]
- Mêmes étapes que Arc, mais produit une forme fermée (secteur) qui devient une face.

**2 Point Arc** [S11][S5]
- Clic départ → clic fin (ou longueur de corde tapée) → déplacer perpendiculairement pour la **flèche (bulge)** → clic.
- VCB (séquence) : longueur de corde → bulge ; rayon = nombre + `r` (ex. `24r`) ; segments = nombre + `s`.
- Inférence « demi-cercle » quand l'arc fait 180° ; flèches ↑/←/→ verrouillent bleu/vert/rouge.
- **Double-clic** sur un coin après un arc = répète l'arc (congé/arrondi d'angle) avec les mêmes paramètres.
- Tangence : survoler l'arête de référence avant de cliquer ; verrouiller avec Alt (Win)/Command (Mac) [S11].

**3 Point Arc** [S11][S5]
- Clic départ → clic point de passage (pivot) → clic point final.
- Flèches pour verrouiller sur un axe ; QRC : Alt + « Option + / Option − » pour changer le nombre de segments (libellé ambigu sur la carte Windows) **[À VÉRIFIER]**.

**Édition** : Move sur le milieu ou les extrémités met à jour le rayon ; Entity Info pour rayon/segments [S11].
**Incohérence** : l'aide mentionne aussi `20c` pour les segments d'un arc lors d'une saisie ultérieure [S11] **[À VÉRIFIER]**.

### 2.8 3D Text — (pas de raccourci)
- Boîte de dialogue : police, style (regular/bold), alignement, **hauteur** (valeur + unité), case **Filled** (crée des faces ; décochée = contours 2D), case **Extruded** + valeur d'extrusion (décochée = texte 2D) ; bouton **Place** puis clic pour poser (via Move) ; résultat = géométrie 3D (groupe/composant) [S28].
- Gravure : extrusion négative, éclater le groupe, supprimer les lignes superflues [S28].

---

## 3. Outils de modification

### 3.1 Push/Pull — `P`
- Raccourci : **P** [S2][S13].
- Étapes : clic sur une face → déplacer (profondeur dans le VCB) → clic ; ou distance tapée + Entrée [S13].
- **Double-clic** sur une autre face : répète la dernière distance [S13][S5].
- **Ctrl (Win)/Option (Mac)** : pousse/tire une **copie** de la face, l'original reste en place (« new starting face » ; empilement) [S5][S6][S13].
- **Alt (Win)/Cmd (Mac) = mode « stretch »** : déplace la face le long de sa normale en étirant les faces adjacentes au lieu d'en créer de nouvelles ; il faut maintenir la touche **au moment du clic** sur la face [F4]. Message d'erreur possible « Adjacent face has holes » ; Ctrl force alors l'ajout de faces [F4].
- **Évidement** : pousser une face jusqu'à une face opposée **parallèle** supprime la matière (trou traversant) ; les lignes de division sur la face opposée doivent d'abord être effacées [S13].
- Inférence : survoler une autre face pendant le push/pull aligne la profondeur sur elle (« parallèle ») [S13].
- Fonctionne sur faces circulaires, rectangulaires, quelconques (faces planes) [S13].

### 3.2 Move — `M`
- Raccourci : **M** [S2][S14].
- Étapes : sélection (Select/Lasso) → M → clic point de référence → déplacer → clic destination [S14]. Sans pré-sélection, Move prend l'entité survolée ; sur de la géométrie brute cela ne déplace que la face/arête survolée et **étire** le reste (effet « faux auto-fold ») ; d'où le conseil : triple-clic ou groupe/composant [F10].
- VCB : distance (positive/négative, ex. `20'`, `-35mm`) ; **`[x, y, z]`** coordonnées globales ; **`<x, y, z>`** décalage relatif au point de départ [S14].
- Verrouillage : Shift quand la ligne de déplacement prend la couleur de l'axe ; flèches ↑ bleu → rouge ← vert ↓ parallèle/perp. [S14][S5].
- **Copie** : bascule **Ctrl (Win)/Option (Mac)** (un « + » apparaît), permet plusieurs copies consécutives [S5][S6][S17].
- **Réseaux (arrays)** après la 1re copie : voir §6 (`5x`, `*5`, `5/`, `/5`) [S17][S5].
- **Auto-fold** : Alt (Win)/Command (Mac) autorise le déplacement même s'il faut ajouter des arêtes/faces (plis) [S5][S6][S15].
- **Poignées (grips)** : un groupe/composant sélectionné affiche des poignées sur sa boîte englobante ; Alt/Cmd fait défiler coins, milieux, centres de côtés, centre [S14]. (Conflit apparent avec Alt=auto-fold ; dépend du contexte survolé) **[À VÉRIFIER]**.
- Étirement (sans sélection complète) : déplacer une face étire en gardant la face intacte ; une arête étire les faces adjacentes ; une extrémité étire arêtes et faces adjacentes [S15].

### 3.3 Rotate — `Q`
- Raccourci : **Q** [S2].
- Étapes : (sélection) → placer le rapporteur sur le plan voulu (il prend la couleur rouge/vert/bleu) → Shift pour verrouiller le plan → clic sommet (centre) → clic 1er point (branche de référence) → clic angle final, ou valeur tapée [S16].
- Variante : cliquer-glisser du centre au 1er point pour définir un axe de rotation quelconque (plier/folder) [S16][S27].
- VCB : angle décimal (`34.1`) ; **pente** `montée:course` (ex. `8:12`, `3:12`) ; valeur négative = sens antihoraire [S16][S5].
- Shift + Alt/Command : libère le rapporteur du plan inféré tout en gardant l'angle [S16].
- Copie : Ctrl/Option ; puis réseau circulaire `Nx`, `*N`, `N/`, `/N` [S17][S5].
- Poignées de rotation sur les groupes/composants (points gris) ; Alt/Cmd fait défiler centre de l'objet / centre d'arête / coin [S16].
- Molette pendant l'outil = Orbit temporaire [S16].
- Le rapporteur a des graduations de 15° ; près du centre il « accroche » les graduations, plus loin il permet des incréments plus fins [S27].

### 3.4 Scale — `S`
- Raccourci : **S** [S2][S18].
- Boîte jaune avec **poignées vertes** ; la poignée active et l'opposée deviennent **rouges** [S18].
- Poignées de coin = uniforme ; poignées d'arête/face = étirement selon 1 ou 2 axes [S18].
- Modificateurs : **Shift** = bascule uniforme/non uniforme ; **Ctrl (Win)/Option (Mac)** = depuis le centre [S18][S5].
- VCB : facteur (`1.5` = 150 %) ; **négatif** (`-1`) = miroir ; plusieurs facteurs `2,3` (et `x,y,z` selon la poignée) ; **longueur avec unité** (`10m`) pour fixer une dimension [S18][S5].
- Mettre à l'échelle une instance de composant ne modifie qu'elle ; pour toutes, éditer la définition [S18].
- Échelle de tout le modèle : via Tape Measure (§4.1).

### 3.5 Offset — `F`
- Raccourci : **F** [S3][S19].
- Pré-requis : une face, ou **au moins deux arêtes connectées et coplanaires** [S19].
- Étapes : clic sur une arête sélectionnée ou une face → déplacer → clic ; distance dans le VCB, modifiable tant qu'aucune autre action [S19].
- Chevauchements supprimés par défaut ; **Alt (Win)/Command (Mac)** les conserve [S19][S5].
- **Double-clic** sur une autre face juste après = même distance [S19].
- Offset d'arcs → courbes non éditables, sauf arcs circulaires ≥3 segments qui restent des arcs [S19].

### 3.6 Follow Me — (pas de raccourci)
- Méthode A : sélectionner le chemin (arêtes continues) → Follow Me → cliquer le profil [S20][S5].
- Méthode B : cliquer-glisser le profil le long du chemin (le chemin s'affiche en rouge) [S20].
- Profil ≈ perpendiculaire au chemin, pas obligatoirement attaché [S20].
- **Alt (Win)** : utiliser le **périmètre de la face** comme chemin [S5] (Mac : non précisé sur la carte ; vraisemblablement Command **[À VÉRIFIER]**).
- Tour/révolution : cercle comme chemin + demi-profil perpendiculaire centré sur le centre du cercle [S20].
- Chemin et profil doivent être **dans le même groupe/contexte** [S20].

### 3.7 Flip — (pas de raccourci)
- Après sélection, trois plans semi-transparents rouge/vert/bleu apparaissent ; cliquer un plan retourne (180°), le glisser déplace le plan avant de retourner [S16].
- Flèches : ← plan vert, → plan rouge, ↑ plan bleu [S16].
- Ctrl/Option : copie retournée [S16][S5].
- Alt/Command : bascule axes de l'objet ↔ axes du contexte parent [S16].
- Survoler une face affiche un **plan magenta** pour retourner selon cette face [S16].

### 3.8 Solid tools — Outer Shell, Intersect, Union, Subtract, Trim, Split
- **Solide** = groupe ou composant à volume fermé, sans fuite (aucune face manquante ni arête bordant ≠ 2 faces) ; Entity Info indique « Solid » [S21][S37].
- Outer Shell : garde seulement les faces extérieures des solides superposés, résultat = 1 groupe [S21].
- Union : fusionne en un solide (peut conserver des vides internes) [S21].
- Subtract : **ordre important** — le 1er cliqué est l'outil de coupe ; il disparaît, le 2e garde le creux [S21].
- Trim : comme Subtract mais le 1er solide est conservé [S21].
- Intersect : ne garde que le volume commun [S21].
- Split : découpe selon les intersections en plusieurs groupes [S21].
- Usage : choisir l'outil puis cliquer les solides, ou pré-sélectionner puis menu contextuel [S21].
- Disponibilité : Free = **Outer Shell seulement** ; Go/Pro = tous les outils (+ Solid Inspector sur Web) [S21]. Voir §10.

### 3.9 Paint Bucket — `B` ; Sample Material
- Raccourci : **B** [S2][S25].
- Choisir un matériau dans le panneau Materials, cliquer face ou arête ; avec pré-sélection, appliqué à toute la sélection [S25].
- Modificateurs [S5][S6][S25] :
  | Effet | Windows | macOS |
  |---|---|---|
  | Remplir les faces adjacentes de même matériau | Ctrl | Option |
  | Remplacer le matériau sur toutes les faces correspondantes du modèle | Shift | Shift |
  | Remplacer seulement sur le même objet | Ctrl+Shift | (non listé sur la carte Mac) |
  | Échantillonner (Sample) | Alt | Command |
- Peindre un groupe/composant ou la géométrie qu'il contient [S25] ; « Default » en tête de la bibliothèque du modèle restaure la couleur par défaut [S25]. Héritage (les faces « Default » d'un groupe prennent le matériau du groupe) : **[À VÉRIFIER]** (non explicite dans le texte lu).
- Sample Material : outil dédié dans l'Expanded Toolset [S3] ; équivalent à Alt/Cmd dans Paint Bucket [S25].

---

## 4. Construction / mesure / annotation

### 4.1 Tape Measure — `T`
- Raccourci : **T** [S2].
- Mesure : clic départ → déplacer → clic arrivée ; valeur dans le VCB [S26].
- Ctrl (Win)/Option (Mac) : fait défiler les modes **Créer lignes de guide / Créer points de guide / Mesurer seulement** [S26][S5].
- Depuis une arête : ligne de guide parallèle ; depuis une extrémité : point de guide (avec ligne pointillée) [S43m].
- Flèches : verrouillage d'axe [S5].
- **Redimensionner le modèle** : mesurer une distance, taper la longueur voulue + Entrée → SketchUp demande s'il faut redimensionner le modèle [S26][S5][S18].
- Guides : lignes pointillées temporaires qui n'interfèrent pas avec la géométrie [S43m].

### 4.2 Protractor — (pas de raccourci par défaut [S27])
- Survoler ou flèches pour choisir le plan ; Shift verrouille [S27].
- Clic sommet → clic 1er rayon (ou cliquer-glisser pour définir l'axe) → déplacer pour l'angle ; Échap pour recommencer [S27].
- Ctrl/Option : bascule création de guide [S5][S6]. Saisie angle ou pente (`montée:course`) [S43m].
- Précision jusqu'à 0,1° ; graduations de 15° [S27].

### 4.3 Dimensions — (pas de raccourci)
- Clic point de départ → clic point d'arrivée (inférences) → déplacer perpendiculairement pour décaler la cote → clic [S28].
- Raccourci : cliquer directement une arête puis tirer [S28].
- La cote ne se déplace que dans le plan dans lequel on l'a tirée [S28].
- Cercles/arcs : cotes de rayon/diamètre ; type changeable par clic droit > Type > Radius/Diameter [S28].
- Texte édité manuellement : rompt l'association dynamique ; `<>` représente la valeur mesurée **[À VÉRIFIER formulation]** [S28].

### 4.4 Text (Text Label) — (pas de raccourci)
- **Screen text** : clic dans le vide → taper → clic dehors ou Entrée deux fois ; fixe à l'écran [S28].
- **Leader text** : clic sur l'entité → déplacer → clic → texte par défaut (nom de composant, aire de face, etc.) [S28].
- Double-clic sur une face avec l'outil Text = étiquette de l'aire [S28].

### 4.5 Axes — (pas de raccourci)
- Clic = origine → l'axe rouge suit le curseur → clic ; Alt/CMD pour choisir l'axe bleu ou vert à la place → déplacer pour orienter les deux autres → clic [S29].
- Double-clic n'importe où = place les axes à cet endroit [S29].
- Menu contextuel des axes : Align Axes (sur une face), Move (dialogue de valeurs précises, déplacements et rotations), Reset, Hide [S29].
- Vert plein = Nord, vert pointillé = Sud, rouge plein = Est, rouge pointillé = Ouest [S29].

### 4.6 Section Plane (« Create Section » sur Web) — (pas de raccourci)
- Survoler une face pour prévisualiser l'orientation ; Shift verrouille ; flèches : ↑ bleu, → rouge, ← vert, ↓ parallèle à la face ; clic pour placer ; dialogue nom + symbole/numéro [S30].
- **Une seule coupe active par contexte** (modèle, groupe, composant) ; activer par double-clic ou clic droit > Active Cut [S30].
- Clic droit : Reverse, Align View, Create Group from Slice, Hide ; Move/Rotate applicables ; Section Fill dans Styles [S30].

### 4.7 Tag tool — (pas de raccourci)
- Choisir un tag dans le panneau Tags → outil Tag → cliquer une entité (elle clignote violet) [S31].
- Alt/Command : échantillonner le tag de l'entité cliquée ; Shift : remplacer le tag de toutes les entités partageant ce tag ; Ctrl/Option : taguer toutes les instances d'un composant [S31].
- Toute géométrie brute nouvelle est « Untagged » ; recommandation : taguer groupes/composants, pas arêtes/faces [S31].

---

## 5. Navigation / caméra

| Outil | Raccourci Web | Détails |
|---|---|---|
| Orbit | **O** [S2] ; molette maintenue [S1] | Shift maintenu = Pan ; Alt (Win)/Option (Mac) maintenu = désactive l'orbite « pondérée par la gravité » [S5][S6] ; l'aide dit Ctrl/Option pour « rouler » la caméra [S32] → **[À VÉRIFIER]** |
| Pan | **H** [S2] ; molette + clic gauche [S1] | Shift+glisser pendant Orbit [S32] |
| Zoom | **Z** [S3] ; molette [S1] | La molette zoome **vers le curseur** ; glisser haut = agrandir ; Shift+glisser = champ de vision (FOV) ; VCB : FOV en degrés ou focale en mm [S32][S5] |
| Zoom Extents | **Ctrl/Cmd+Shift+E** (Web) [S3] | Desktop : **Shift+Z** [S4] ; un employé (forum, 2020) citait Ctrl+Shift+Z pour le Web [F5] → **contradiction, la page Web actuelle [S3] fait foi** |
| Zoom Window | **Shift+W** (Web) [S3] | Tracer un rectangle à agrandir [S32] |
| Position Camera | — | Clic = place l'œil à **5'6" (≈1,68 m)** au-dessus du point ; cliquer-glisser = place l'œil et oriente vers la cible ; VCB = hauteur d'œil [S33] ; enchaîne sur Look Around |
| Look Around | — | Glisser pour tourner la tête ; VCB = hauteur d'œil [S33][S5] |
| Walk | — | Glisser depuis la croix pour avancer (vitesse = distance au réticule) ; Shift = vertical ; Ctrl/Option = courir ; Alt = désactiver la détection de collision (activée par défaut) ; suit pentes/escaliers [S33] |

- Double-clic (molette) = recentrer [S32][S5].
- Vues standard, Parallel Projection / Perspective / Two-Point Perspective via le menu Camera [S32] **[DESKTOP]**.

---

## 6. VCB (Measurements box) — grammaire complète des saisies

### 6.1 Règles générales
- Le VCB affiche la grandeur courante de l'outil actif ; il sert à **créer** (dimensions), **déplacer/tourner** (distances, angles), **mettre à l'échelle** (facteurs) [S9].
- On **tape directement** au clavier pendant ou juste après l'opération puis **Entrée**, sans cliquer dans la boîte (convention ; formulation explicite non trouvée dans le texte officiel **[À VÉRIFIER]**). On peut retaper la valeur autant de fois que voulu tant qu'une autre action n'a pas eu lieu (explicite pour Offset [S19], Circle/Polygon [S10], arrays [S17]).
- Unités : sans suffixe = unité du modèle (Model Info > Units) ; avec suffixe l'unité tapée **prime** sur le défaut [S39][S14].
- **Séparateur de liste** : `,` si le séparateur décimal du système est le point ; **`;`** si le système utilise la virgule décimale (cas d'une locale française) [F1].
- Valeurs négatives : inversent la direction (Rectangle [S10], Move [S14], Rotate = antihoraire [S16], Scale `-1` = miroir [S18], Push/Pull **[À VÉRIFIER]**).
- Length snapping / angle snapping et précision d'affichage réglés dans Model Info > Units [S39] (valeur d'angle par défaut 15° **[À VÉRIFIER]**).

### 6.2 Grammaire (EBNF informelle)
```
saisie      := longueur | liste | coord_abs | coord_rel | segments | rayon | angle | pente | reseau | facteur
nombre      := ["-"] chiffres [ sep_decimal chiffres ] | fraction_archi   (ex. 3/4", 5' 6")
unite       := '"' | "'" | "mm" | "cm" | "m"            [S9]   (km / yd : [À VÉRIFIER])
longueur    := nombre [unite]
liste       := [longueur] SEP [longueur] [ SEP [longueur] ]  SEP := "," | ";" (selon locale) [F1]
                 → Rectangle "8',20'" / "3'," / ",3'" [S10] ; Rotated Rectangle "largeur,angle" [S5] ;
                   Scale "2,3" / "2,3,4" [S18]
coord_abs   := "[" longueur SEP longueur SEP longueur "]"   (origine des axes)        [S7][S14]
coord_rel   := "<" longueur SEP longueur SEP longueur ">"   (depuis le point de départ) [S7][S14]
segments    := entier ("s"|"S")        Circle, 2-Point Arc, Arc ("24s", "10s")        [S5][S11]
rayon       := longueur ("r"|"R")      2-Point Arc ("24r")                           [S11][S5]
bulge       := longueur                2-Point Arc (2e valeur après la corde)          [S11]
angle       := nombre                  degrés décimaux, Rotate / Protractor ("34.1")  [S16]
pente       := nombre ":" nombre       montée:course, Rotate / Protractor ("3:12")    [S5][S16]
reseau      := entier ("x"|"X") | "*" entier  → copies externes (même pas que la 1re copie)   [S9][S17]
             | entier "/" | "/" entier        → copies internes réparties entre original et 1re copie [S9][S17]
facteur     := nombre | nombre SEP nombre [SEP nombre] | longueur  (Scale)          [S18][S5]
fov         := nombre ["deg"] | nombre "mm"   (Zoom : degrés ou focale)             [S32]
hauteur_oeil:= longueur   (Position Camera / Look Around)                            [S33]
```

### 6.3 Réseaux (arrays) — sémantique
- Move + Ctrl/Option (copie) → poser la 1re copie (distance tapée possible) → taper `7x` ou `*7` = **7 copies** au même pas [S17][S5].
- `5/` ou `/5` = copies réparties **entre** l'original et la 1re copie ; l'aide indique « 4 copies équidistantes » pour `5/` (i.e. 5 intervalles) [S17] — décompte exact à vérifier en test **[À VÉRIFIER]**.
- Rotate + Ctrl/Option → même syntaxe = **réseau circulaire** autour du centre [S17].
- Le nombre est modifiable immédiatement après (retaper) [S17].
- Forum Web : un utilisateur obtenait une erreur avec `x11` ; réponse : saisir d'abord la distance + Entrée, puis le multiplicateur [F2] → l'ordre `Nx` (nombre puis x) est la forme documentée [S9][S5] ; `xN` est accepté sur desktop selon la pratique **[À VÉRIFIER]**.

---

## 7. Inférences

### 7.1 Types [S7]
- **Points** : Origine, Extrémité (Endpoint), Milieu (Midpoint), Intersection, Sur face (On Face), Sur arête (On Edge), Centre (cercle/arc/polygone), points de guide, intersections de coupe.
- **Linéaires** (ligne pointillée) : axe Rouge/Vert/Bleu, Parallèle, Perpendiculaire, Prolongement d'arête (Extend Edge), Tangente au sommet, « From Point », « Through Point ».
- **Formes** : carré, section dorée, demi/quart/trois-quarts de cercle, relations centre/bord d'arcs.

### 7.2 Couleurs
| Repère | Couleur/forme | Source |
|---|---|---|
| Extrémité (Endpoint) | cercle **vert** | [S8] |
| Milieu (Midpoint) | cercle **bleu** (couramment appelé cyan) | [S8] ; « teal » [F8] |
| Sur face (On Face) | **losange bleu** | [S8] |
| Intersection | **X rouge** | [S8] |
| Sur arête / courbe (On Edge) | **carré rouge** | [S8] |
| Inférences à l'intérieur d'un groupe/composant | **magenta** | [S7] |
| Axe X / Y / Z | rouge / vert / bleu (ligne colorée ou pointillée) | [S7] |
| Parallèle / Perpendiculaire | **magenta** (« pink ») | [S7][F8] |
| From Point | pointillé de la couleur de l'axe | [S7] |
| Centre, Tangente, Origine, Guide point | **[À VÉRIFIER]** (images uniquement) | — |
Une info-bulle (ScreenTip) nomme l'inférence [S7].

### 7.3 Verrouillage et contrôle [S7][S5]
- **Shift** maintenu : verrouille la direction/inférence active.
- Flèches : **↑ bleu, → rouge, ← vert, ↓ magenta** (parallèle/perpendiculaire à la géométrie inférée).
- **Shift+Alt (Win) / Shift+Command (Mac)** : verrouille sur le plan d'une face.
- Alt/Command (après le 1er clic) : cycle inférences linéaires toutes / aucune / parallèle-perpendiculaire seulement.
- **Inférence encouragée** : marquer une pause du curseur sur un point en fait une référence prioritaire pour l'alignement (« from point ») [S7].

---

## 8. Géométrie : arêtes, faces, collage, groupes, composants

- **Arête** = segment droit entre deux sommets ; **face** = polygone **plan**, pouvant avoir des trous ; pas de vraies courbes : arcs/cercles = suites d'arêtes (ArcCurve garde centre/rayon) [S37].
- **Création automatique de faces** : une boucle fermée d'arêtes coplanaires crée une face ; une ligne posée sur une face la **divise** en deux [S7].
- **Géométrie collante (sticky)** : faces et arêtes qui se chevauchent **s'intersectent et fusionnent** [S37] ; la géométrie brute colle à toute géométrie brute qu'elle touche [F9].
- **Groupes/Composants** isolent la géométrie : rien n'y colle à l'extérieur [S37][S34]. Un groupe est rendu unique automatiquement lorsqu'il est modifié ; un composant est un « modèle dans le modèle », modifier la définition modifie **toutes les instances** ; « Make Unique » pour une seule [S37][S35][S36].
- Créer : Edit > Make Group / clic droit Make Group ; Make Component (G [S4]) avec dialogue : Definition, Description, Glue To (Any/Horizontal/Vertical/Sloped), Cut Opening, Always Face Camera, Shadows Face Sun, Set Component Axes, Replace selection [S34][S35].
- Éditer : double-clic → contexte d'édition (cadre pointillé) ; sortir en cliquant dehors ou Close Group/Component ; Explode ; Lock/Unlock [S34].
- **Planarité / auto-fold** : les faces doivent rester planes ; lors d'un étirement, SketchUp ajoute des plis (Autofold) ou bloque l'opération ; Alt/Command force l'auto-fold [S15].
- Fusion d'arêtes coplanaires : « Soften coplanar » dans le panneau Soften/Smooth supprime visuellement les arêtes entre faces coplanaires [S24]. Effacer une arête entre deux faces coplanaires les fusionne en une face **[À VÉRIFIER]** (comportement standard, non formulé dans le texte lu).
- **Soft / Smooth / Hidden** : soft = arête cachée et faces regroupées en « surface » ; smooth = ombrage lissé ; hidden = arête cachée sans surface [S24][S37].

---

## 9. Panneaux SketchUp for Web [S38]

| Panneau | Rôle |
|---|---|
| Entity Info | Infos de l'entité sélectionnée (matériau, tag, nb de composants ; rayon/segments ; « Solid ») [S38][S10][S21] |
| Outliner | Arborescence groupes/composants/sections ; **réservé aux abonnés** (jamais dans Free) [F6] |
| Instructor | Conseils contextuels selon l'outil actif [S38] |
| 3D Warehouse | Bibliothèque de modèles [S38] |
| Components | Liste et gestion des composants [S38] |
| Materials | Ajout/gestion des matériaux ; création de matériaux personnalisés réservée à Go/Shop [S38][S43] |
| Styles | Réglages d'affichage groupés ; styles personnalisés réservés à Go/Shop [S38][S43] |
| Environments | Fond panoramique 360° + éclairage IBL [S38] |
| Tags | Visibilité, dossiers, Color by Tag, pointillés [S31] |
| Shadows | Ombres / soleil géolocalisé [S38] |
| Scenes | Vues enregistrées [S38] |
| Soften/Smooth Edges | Curseur « angle entre normales », Smooth normals, Soften coplanar [S24] |
| Display | Géométrie cachée, ombres, brouillard [S38] |
| Model Info | Unités (Architectural/Decimal/Engineering/Fractional, précision, length/angle snapping), polices [S38][S39] |
| Solid Inspector | Détecte et corrige des erreurs de solides ; réservé aux abonnés [S38][S21][F6] |

L'aide prévient qu'un abonnement Go/Pro/Studio peut être requis pour certaines fonctions sans préciser lesquelles panneau par panneau [S38].

---

## 10. Raccourcis clavier par défaut — SketchUp for Web

| Outil / commande | Web (par défaut) | Desktop (comparaison) | Source |
|---|---|---|---|
| Select | Espace | Espace | [S2][S4] |
| Lasso | Shift+Espace | Shift+Espace | [S3][S4] |
| Eraser | E | E | [S2][S4] |
| Paint Bucket | B | B | [S2][S4] |
| Line (Pencil) | L | L | [S2][S4] |
| Rectangle | R | R | [S2][S4] |
| Circle | C | C | [S3][S4] |
| 2 Point Arc | A | A | [S3][S4] |
| Push/Pull | P | P | [S2][S4] |
| Move | M | M | [S2][S4] |
| Rotate | Q | Q | [S2][S4] |
| Scale | S | S | [S2][S4] |
| Offset | F | F | [S3][S4] |
| Tape Measure | T | T | [S2][S4] |
| Orbit | O (+ molette maintenue) | O | [S2][S1] |
| Pan | H (+ molette + clic gauche) | H, Shift+glisser | [S2][S1][S4] |
| Zoom | Z (+ molette) | Z | [S3][S1] |
| Zoom Extents | **Ctrl/Cmd+Shift+E** | Shift+Z | [S3][S4] |
| Zoom Window | **Shift+W** | (Ctrl+Shift+W [À VÉRIFIER]) | [S3] |
| Make Component | G [À VÉRIFIER sur Web] | G | [S4] |
| Back Edges | K [À VÉRIFIER sur Web] | K | [S4] |
| Search | (icône Search) ; Shift+S [À VÉRIFIER sur Web] | Shift+S | [S2][S4] |
| Undo / Redo | Ctrl/Cmd+Z ; Redo [À VÉRIFIER] | Ctrl+Z / Cmd+Z | [S23] |
| Select All / Deselect | Ctrl+A / Ctrl+T [À VÉRIFIER sur Web] | Ctrl+A, Ctrl+T / Cmd+A, Shift+Cmd+A | [S22] |
| Sans raccourci par défaut | Rotated Rectangle, Polygon, Arc, 3 Point Arc, Pie, Freehand, 3D Text, Text, Dimension, Follow Me, Flip, Solid tools, Protractor, Axes, Section, Tag, Sample Material, Position Camera, Look Around, Walk | idem | [S3][S27] |

Personnalisation Web : via Search, cliquer la case à droite du résultat et taper la touche ; modificateurs autorisés **Shift, Alt, Option** ; **Ctrl et Command interdits** ; un modificateur est obligatoire avec les chiffres ; « Reset all shortcuts » pour réinitialiser [S1][S46].

---

## 11. Offres : Free / Go / Pro (Web)

| Élément | Free | Go | Pro / Studio | Source |
|---|---|---|---|---|
| SketchUp for Web | oui | oui | oui | [S41][S42] |
| iPad | non | oui | oui | [S42] |
| Desktop, LayOut, Extension Warehouse | non | non | oui | [S42] |
| Usage commercial | **non** | oui | oui | [S40][F7] |
| Stockage Trimble Connect | 10 Go | (illimité selon page Shop) | — | [S40][S43] |
| Import | SKP, JPG, PNG | + DWG, DXF, DAE, KMZ, 3DS, DEM… | idem+ | [S41][S43] |
| Export | SKP, PNG, STL | + DWG, DXF, DAE, KMZ, 3DS, WRL, FBX, XSI, OBJ | idem+ | [S41][S43] |
| Solid tools | **Outer Shell seulement** | tous | tous | [S21][S43] |
| Outliner, Solid Inspector | non | oui | oui | [F6][S21] |
| Matériaux / styles personnalisés | non | oui | oui | [S43][F7] |
| Crédits IA (AI Render) | non | oui | oui | [S40][S3] |
| Extensions (plugins) | non | non (Web) | desktop seulement | [F7] |
| Sandbox tools | non (Web) | non (Web) | desktop | [F7] |
| Photoreal Materials | ? | oui | oui | [S42] |
| Support | non | oui | oui | [S40] |

Remarque : la page « What's included » compare Free à « SketchUp Shop » (ancien nom de Go) [S43] ; le tableau détaillé du site de tarifs n'était pas lisible en texte [S42] → les lignes non sourcées restent **[À VÉRIFIER]**.

---

## 12. Points incertains / contradictoires (synthèse)

1. **Rectangle depuis le centre** : QRC Windows « Alt », QRC Mac « Option » (≈ Ctrl Windows) [S5][S6].
2. **Line, verrouillage** : QRC Windows « Alt », aide + QRC Mac « Shift » [S5][S6][S7].
3. **Unsoften (Eraser) sur Mac** : Option+Shift [S6] vs Command [S24].
4. **Orbit sans gravité** : Alt/Option selon QRC [S5][S6] vs Ctrl/Option selon l'aide [S32].
5. **Zoom Extents Web** : Ctrl/Cmd+Shift+E [S3] vs Ctrl+Shift+Z (forum 2020) [F5] vs Shift+Z desktop [S4].
6. **Arrays `5/`** : « 4 copies » selon l'aide [S17] ; ordre `x11` refusé sur le Web dans un cas forum [F2].
7. **Move, Alt/Cmd** : sert à la fois à l'auto-fold [S5][S15] et au cycle des poignées des groupes [S14].
8. Segments par défaut Circle (24) / Polygon (6), format côtés Polygon, couleurs Centre/Tangente, angle snapping par défaut : non lisibles dans le texte officiel.
9. `20c` pour segments d'arc mentionné une fois [S11] : non confirmé ailleurs.

---

## Sources

**Aide officielle SketchUp (help.sketchup.com) et documents officiels**
- [S1] Using Shortcuts in SketchUp for Web — https://help.sketchup.com/en/sketchup-web-shortcuts
- [S2] SketchUp for Web's Main Toolbar — https://help.sketchup.com/en/sketchup-web/sketchup-web-main-toolbar
- [S3] SketchUp for Web's Expanded Toolset — https://help.sketchup.com/en/sketchup-web/sketchup-web-expanded-toolbar
- [S4] Default Keyboard Shortcuts (desktop) — https://help.sketchup.com/en/default-keyboard-shortcuts
- [S5] Quick Reference Card SketchUp 2025 Windows — https://download.sketchup.com/QRC2025/HC-QRC2025-en-SU-Windows.pdf
- [S6] Quick Reference Card SketchUp 2025 Mac — https://download.sketchup.com/QRC2025/HC-QRC2025-en-SU-Mac.pdf
- [S7] Introducing Drawing Basics and Concepts — https://help.sketchup.com/en/sketchup/introducing-drawing-basics-and-concepts
- [S8] Tips and Tricks — https://help.sketchup.com/en/sketchup/tips-and-tricks
- [S9] Using the Measurements Box — https://help.sketchup.com/using-measurements-box
- [S10] Drawing Basic Shapes — https://help.sketchup.com/en/sketchup/drawing-basic-shapes
- [S11] Drawing Arcs — https://help.sketchup.com/en/sketchup/drawing-arcs
- [S12] Drawing Freehand Shapes — https://help.sketchup.com/en/sketchup/drawing-freehand-shapes
- [S13] Pushing and Pulling Shapes into 3D — https://help.sketchup.com/en/sketchup/pushing-and-pulling-shapes-3d
- [S14] Moving Entities Around — https://help.sketchup.com/en/sketchup/moving-entities-around
- [S15] Stretching Geometry — https://help.sketchup.com/en/sketchup/stretching-geometry
- [S16] Flipping, Mirroring, Rotating and Arrays — https://help.sketchup.com/en/sketchup/flipping-mirroring-rotating-and-arrays
- [S17] Copying What You've Already Drawn — https://prod-aws-help.sketchup.com/article/3000092 (miroir officiel ; aussi https://help.sketchup.com/en/article/3000092)
- [S18] Scaling Your Model or Parts of Your Model — https://help.sketchup.com/en/sketchup/scaling-your-model-or-parts-your-model
- [S19] Offsetting a Line from Existing Geometry — https://help.sketchup.com/en/sketchup/offsetting-line-existing-geometry
- [S20] Extruding with Follow Me — https://help.sketchup.com/en/sketchup/extruding-follow-me
- [S21] Modeling Complex 3D Shapes with the Solid Tools — https://help.sketchup.com/en/sketchup/modeling-complex-3d-shapes-solid-tools
- [S22] Selecting Geometry — https://help.sketchup.com/en/sketchup/selecting-geometry
- [S23] Erasing and Undoing — https://help.sketchup.com/en/sketchup/erasing-and-undoing
- [S24] Softening, Smoothing, and Hiding Geometry — https://help.sketchup.com/sketchup/softening-smoothing-and-hiding-geometry
- [S25] Applying Materials — https://help.sketchup.com/en/sketchup/applying-materials
- [S26] Measuring Distance — https://help.sketchup.com/en/measuring-distance
- [S27] Measuring Angles — https://help.sketchup.com/en/measuring-angles
- [S28] Adding Text, Labels, and Dimensions to a Model — https://help.sketchup.com/en/sketchup/adding-text-labels-and-dimensions-model
- [S29] Adjusting the Drawing Axes — https://help.sketchup.com/en/sketchup/adjusting-drawing-axes
- [S30] Creating and Using Section Planes — https://help.sketchup.com/en/sketchup/slicing-model-peer-inside
- [S31] Controlling Visibility with Tags — https://help.sketchup.com/en/sketchup/controlling-visibility-tags
- [S32] Viewing a Model — https://help.sketchup.com/en/sketchup/viewing-model
- [S33] Walking Through a Model — https://help.sketchup.com/en/sketchup/walking-through-model
- [S34] Grouping Geometry — https://help.sketchup.com/en/sketchup/grouping-geometry
- [S35] Creating a Basic Component — https://help.sketchup.com/en/sketchup/creating-basic-component
- [S36] Editing Components — https://help.sketchup.com/en/sketchup/editing-components
- [S37] Entity Overview (developer.sketchup.com) — https://developer.sketchup.com/article-entity-overview
- [S38] Creating and Editing Models (panneaux Web) — https://help.sketchup.com/en/sketchup-web/creating-and-editing-models
- [S39] Managing Units of Measurement — https://help.sketchup.com/en/managing-units-measurement
- [S40] SketchUp Free (admin) — https://help.sketchup.com/en/admin/sketchup-free
- [S41] SketchUp Free (page produit) — https://sketchup.trimble.com/en/plans-and-pricing/sketchup-free
- [S42] Plans and pricing — https://sketchup.trimble.com/en/plans-and-pricing (redirigé depuis https://www.sketchup.com/plans-and-pricing/compare)
- [S43] What's included with SketchUp Go/Shop — https://help.sketchup.com/en/sketchup-web/whats-included-sketchup-shop
- [S43m] Precise Modeling with Measurements — https://help.sketchup.com/en/sketchup/measuring-angles-and-distances-model-precisely
- [S44] Using SketchUp for Web — https://help.sketchup.com/en/sketchup-web/using-sketchup-web
- [S45] SketchUp for Web Tools — https://help.sketchup.com/en/sketchup-web/sketchup-web-tools
- [S46] Using Shortcuts in SketchUp for Web (miroir) — https://prod-aws-help.sketchup.com/ru/node/2811

**Forum officiel (forums.sketchup.com)**
- [F1] Measurements separator — https://forums.sketchup.com/t/measurements-separator/44307
- [F2] Array function in SketchUp Web — https://forums.sketchup.com/t/array-function-in-sketchup-web/244061
- [F3] Polygon corner vs side — https://forums.sketchup.com/t/how-do-i-change-whether-im-placing-a-corner-of-a-polygon-circle-or-a-side/28120 ; https://forums.sketchup.com/t/when-drawing-a-circle-how-do-i-toggle-between-midsection-and-vertice-radii/47183
- [F4] Push/Pull stretch — https://forums.sketchup.com/t/who-uses-the-stretch-modifier-key/65512 ; https://forums.sketchup.com/t/push-pull-stretch/312495
- [F5] Zoom Extents shortcut missing (Web) — https://forums.sketchup.com/t/zoom-extents-shortcut-missing/116830
- [F6] Outliner / Solid Inspector on Web — https://forums.sketchup.com/t/was-the-outliner-and-solid-inspector-removed-from-sketchup-for-web/190462
- [F7] Free vs Go — https://forums.sketchup.com/t/free-vs-go/242793 ; https://forums.sketchup.com/t/sketchup-web-sketchup-go-2022/211487 ; https://forums.sketchup.com/t/more-buttons-on-the-list-of-tools/214785
- [F8] What do these inferences mean — https://forums.sketchup.com/t/what-do-these-particular-inferences-mean/209062
- [F9] Why are my objects getting attached — https://forums.sketchup.com/t/why-are-my-objects-getting-attached-to-each-other/11661
- [F10] Move autofold on Mac (Web) — https://forums.sketchup.com/t/move-command-on-mac-only-seems-to-autofold/261034

*Méthode : pages lues via WebFetch (extraction résumée par modèle) ; l'accès direct HTTP à help.sketchup.com était bloqué par le proxy, et de nombreuses informations des pages d'aide (couleurs, valeurs par défaut) ne figurent qu'en images — d'où les marques [À VÉRIFIER].*
