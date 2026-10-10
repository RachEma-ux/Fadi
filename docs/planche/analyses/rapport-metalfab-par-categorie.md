# Rapport — fichiers partagés analysés par catégorie (DBS MetalFab 2.2) et transposition à la Planche

**10 octobre 2026.** Rédigé par le chef de projet à la demande du maître d'ouvrage du 10 octobre 2026 (« Refais tout le
travail dans la Planche de Fadi et implémente les mêmes fonctions dans la Planche de Fadi », D-200). Cadre :
`AGENTS.md`, `docs/planche/cahier-planche.md` (§2 compatibilité, §10 décisions), `docs/atelier/catalogues/README.md`
(D-180). Documents liés : `table-ameliorations-outils.md` (une ligne par outil) et `programme-lots.md` (ordre de
réalisation).

Ordre d'autorité inchangé : `AGENTS.md` → cahier de l'Atelier (R1–R20) → cahier de la Planche → ce rapport. Le rapport
**décrit** des fichiers et **propose** ; il ne décide rien à la place du maître d'ouvrage.

## 0. Ce qui a été reçu, ce qui manque

| Élément | État | Conséquence |
| --- | --- | --- |
| Extension SketchUp **DBS MetalFab 2.2** (`dbs_metal_fab.rb` + dossier `dbs_metal_fab/`, 135 fichiers) | Reçue, extraite, lue fichier par fichier | Objet de ce rapport (§1 à §7) |
| `su_splat.rbz` (93 Mo) | **Non téléchargé** : le connecteur Drive est limité à 10 Mo ; le dossier Quick Share d'origine est bloqué par la politique réseau | **Non analysé** ; aucune fonction n'en est tirée |
| `ms_c2c_line_2p.rbz` (ligne passant par les milieux de paires successives de points) | **Signalé** par une relecture externe, jamais reçu | **Signalé, non analysé** ; aucun lot tant que le fichier n'est pas fourni (R3) |

Trois **bases** sont tenues séparées dans toute l'analyse (critique reçue) : le **relevé SketchUp pour le Web** (référence
de comportement de la Planche, `docs/planche/reference/`), l'**état actuel de Fadi** (code de `main` plus les PR #109 et
#110, comptées comme état courant) et l'**apport MetalFab** (ce rapport). Un apport MetalFab n'est jamais présenté comme
un comportement SketchUp relevé ; une fonction transposée est un **écart Fadi déclaré** (statut `fadi` du cahier).

## 1. Inventaire par catégorie

| Catégorie | Fichiers | Nombre | Taille | Lisible ? |
| --- | --- | --- | --- | --- |
| Chargeur Ruby | `dbs_metal_fab.rb` | 1 | 1,9 Ko | Oui (texte) |
| Code Ruby chiffré | `*.rbe` (racine, `lib/`, `tools/`, `dialogs/`) | 32 | 471 Ko | **Non** (chiffrement SketchUp) |
| Boîtes de dialogue | `dialogs/*.html`, `*.js`, `css/*.css`, `placing.svg` | 22 | 75 Ko | Oui |
| Données de profils | `data/profiles/*.skp`, `info.txt` | 7 | 963 Ko | Oui (texte du `.skp` extrait par `strings`) |
| Graphismes | `pics/` (logo, aide, 36 glyphes, 14 icônes SVG + PDF) | 68 | 520 Ko | Oui |
| Signature et identifiants | `dbs_metal_fab.susig`, `extension_info.txt` | 2 | 7 Ko | Signature binaire ; identifiants lisibles |
| Licence | `lic.rbe`, `lic_common.rbe` | (compris dans les 32) | 19,7 Ko | Non |

## 2. Code (Ruby)

### 2.1 Chargeur `dbs_metal_fab.rb` (lisible)

Enregistre l'extension « DBS MetalFab », créateur « DBS », description « Construction designing tool », **version 2.2**,
copyright « 2025 - DBS » (« DBS Daniel Bieńkowski Solutions » dans l'en-tête). Point d'entrée : `dbs_metal_fab/main`.
Le **journal des versions** de l'en-tête (v1.0 du 2024-05-01 à v2.0 du 2025-01-22 ; 2.1 et 2.2 non décrites) est la
source la plus précise sur les fonctions :

| Version | Fonctions annoncées |
| --- | --- |
| 1.6 | matière au dessin ; groupes remplacés par des **instances de composant** (« compatibilité OpenCutList ») ; **angle de coupe d'onglet** affiché ; observateur de l'outil Échelle corrigé ; **sélection depuis la nomenclature** |
| 1.7 | pas de renumérotation à la copie ; nomenclature : sélectionner « même nom », toutes les instances |
| 1.8 | outil d'alignement corrigé |
| 1.9 | dessin des profils dans le **contexte d'édition courant** ; *Draw From Edges* : placement **extérieur / intérieur**, **rotation de 90°** ; *Length offset* : boutons radio et **Maj pour le sens** |
| 2.0 | bibliothèque : filtre par type, tri des colonnes ; profil : longueur de barre, **masse pour 1 m**, **coût par kg**, liste de matériaux avec **masse volumique**, masse de 1 m **calculée depuis la forme** ; nomenclature : tri, calcul **pour la sélection (imbrications comprises)** ; imbrication (*nesting*) : masse et coût totaux |

### 2.2 Fichiers chiffrés (`.rbe`) — rôle déduit du nom, de la taille et des appels

Les `.rbe` sont chiffrés par SketchUp ; leur contenu n'est pas lisible. Le tableau ci-dessous **déduit** un rôle de trois
indices : le nom du fichier, sa taille, et les appels que les boîtes de dialogue lui adressent (§3.2). Aucun rôle n'est
vérifié.

| Fichier | Taille | Rôle déduit (non vérifié) |
| --- | --- | --- |
| `main.rbe` | 36,3 Ko | menus, barre d'outils (14 icônes, §5), chargement des modules |
| `pipe.rbe` | 50,5 Ko | **objet pièce** : génération du balayage d'une section le long d'un segment, placement, attributs (plus gros fichier) |
| `report.rbe` | 22,3 Ko | nomenclature (*BOM*), tri, sélection depuis la liste |
| `calc.rbe` | 17,8 Ko | calculs : masse au mètre depuis l'aire, masse et coût totaux, imbrication en barres |
| `pipes_list.rbe` | 11,7 Ko | inventaire des pièces du modèle (sélection, imbrications) |
| `profile.rbe` | 11,2 Ko | **profil de bibliothèque** (désignation, type, dimensions, champs commerciaux) |
| `settings.rbe` | 9,4 Ko | réglages (§3.1, `settings.html`) |
| `documentation.rbe` | 7,7 Ko | renumérotation, textes d'information, image PNG |
| `component.rbe` | 6,3 Ko | conversion groupe → composant (v1.6) |
| `update.rbe` | 5,8 Ko | vérification de mise à jour |
| `library.rbe` | 4,9 Ko | bibliothèque utilisateur (lecture, écriture) |
| `shape_gen.rbe` | 2,8 Ko | **génération de la section** depuis les modèles `.skp` et leurs formules (§4) |
| `observers.rbe` | 1,5 Ko | observateurs (outil Échelle, copie) |
| `lic.rbe`, `lic_common.rbe` | 0,5 + 19,2 Ko | **contrôle de licence** (§6) |
| `test.rbe` | 0,1 Ko | résidu de développement |
| `lib/tools_drawing.rbe` | 11,4 Ko | aides communes aux outils de dessin (inférences, verrous d'axe) |
| `lib/geom.rbe`, `lib/entities.rbe`, `lib/dbs_lib.rbe` | 3,7 / 3,3 / 0,4 Ko | géométrie et entités communes |
| `tools/draw_pipe_tool.rbe` | 17,4 Ko | outil **Draw** (pièce par deux points) |
| `tools/align_face_tool.rbe` | 11,3 Ko | outil **Align** (aligner une face de pièce) |
| `tools/miter_joint_tool.rbe` | 10,2 Ko | outil **Mitre** (onglet entre deux pièces) |
| `tools/pipe_offset_tool.rbe` | 9,3 Ko | outil **Offset** (icône `offset`) — effet exact inconnu |
| `tools/extrude_and_profile_cut_tool.rbe` | 8,5 Ko | outil **Profile cut** et option « Extrude & cut » |
| `tools/pipe_length_tool.rbe` | 6,2 Ko | outil **Length** (allonger / raccourcir, boîte `offset_tool.html`) |
| `tools/edit_pipe_tool.rbe` | 6,0 Ko | outil **Edit** (changer de profil, redessiner) |
| `tools/dimensioning_tool.rbe` | 4,9 Ko | cotation de pièces — effet exact inconnu |
| `tools/rotate_tool.rbe` | 3,3 Ko | outil **Rotate** (rotation de pièce autour de son axe) |
| `dialogs/*.rbe` (9) | 3,5 à 9,2 Ko | contrôleurs Ruby des boîtes du même nom |

## 3. Boîtes de dialogue (HTML / JavaScript)

### 3.1 Contenu, boîte par boîte

| Boîte | Contenu lu | Fonction |
| --- | --- | --- |
| `draw_tool.html` / `.js` — *Draw tool* | Bibliothèque ; **type** (rond, rectangulaire, U, L, C, T, H, personnalisé) ; **désignation** ; détails ; **matière** (matériaux du modèle avec leur couleur) ; « Snap to center » ; « Length offset » + valeur ; « 90° rotation » ; **« Placing position » : 5 boutons radio** (centre, haut gauche, haut droite, bas droite, bas gauche) posés sur `placing.svg` ; aide : « ◀ ▲ ▶ to lock the axis », « SHIFT to change the placing position » | Dessiner une pièce par deux points |
| `draw_from_lines.html` / `.js` — *Draw from edges* | Mêmes choix de profil et de matière ; « 90° rotation » ; « Place position » **centre / extérieur / intérieur** ; « **Extrude & cut** » ; « Length offset » + valeur ; avertissement « le temps de dessin dépend du nombre d'arêtes, de la segmentation et du processeur » ; bouton « Draw from edges » | Une pièce par arête sélectionnée |
| `edit_tool.html` / `.js` — *Edit profile* | Bibliothèque, type, désignation, détails, matière ; bouton « Redraw pipe » | Changer le profil d'une pièce et la régénérer |
| `library.html` / `.js` — *Library* | « Add new profile » ; recherche (sensible à la casse) ; **filtre par type** ; tableau triable ▲ ▼ ; par ligne : Del, Edit, **Draw** | Bibliothèque de profils de l'utilisateur |
| `add_profile.html` / `.js` — *Add profile to the Library* | Désignation (« eg. RO-200x10 — make sure it matches the profile dimensions ») ; type ; **diamètre, largeur, hauteur, épaisseur** (affichés selon le type) ; **face de profil** prise dans le modèle (type personnalisé) ; longueur de barre ; **catégorie de matériau avec masse volumique écrite en dur** (12 entrées, de « Carbon Steel \| 7850 kg/m³ » à « Plastic (Generic) \| 950 kg/m³ ») ; type de matériau ; masse kg/1 m (estimable) ; coût /1 kg ; norme ; SKU ; URL de fiche technique ; info ; note ; 4 paramètres libres (masqués) | Saisie d'un profil |
| `offset_tool.html` / `.js` — *Pipe length offset* | Opération **+ / −** ; source de la valeur : « **half pipe size** » ou « user defined » ; valeur ; aide « SHIFT to change offset direction » | Allonger / raccourcir une pièce |
| `settings.html` / `.js` — *Properties* | Segmentation ; longueur de barre par défaut ; **préfixe et départ de numérotation** ; « Draw middle line » ; « **Merge collinear edges** » ; devise ; unités de présentation masse (kg/1m) et coût (/1kg) | Réglages globaux |
| `documentation.html` / `.js` — *Documentation tools* | **Renuméroter** la sélection (préfixe, départ) ; ajouter un texte d'information ; outil Texte pour les réarranger ; supprimer tous les textes d'information ; enregistrer une image PNG | Documentation des pièces |
| `about.html` | Texte fourni par Ruby | À propos |

### 3.2 Appels entre boîtes et Ruby (lus dans le JavaScript)

Appels `sketchup.*` : `request_data`, `commit_dialog` / `dialog_commit`, `commit_profile_type`, `request_in_model_colors`,
`close_window`, `add_profile`, `edit_profile`, `delete_profile`, `draw_profile`, `save_profile_face`, `save`, `cancel`,
`estimate_1m_weight`, `commit_length_val`, `commit_float_val`, `commit_text_val`, `rename_parts`, `add_text_info`,
`open_text_tool`, `delete_all_text_info`, `save_image`. Anciennes URL `skp:` : `request_data` (9), `commit@` (4), `close`,
`draw_pipes_from_lines`, `redraw_pipe`. Fonctions JavaScript appelées depuis Ruby : `setData`, `set_colors`,
`rebuild_profile_select_options`, `rebuild_table_data`, **`set_next_placing_pos`** et **`change_rotation`** (touches de
l'outil Draw), **`set_next_offset_direction`** (Maj de l'outil Length).

### 3.3 Clavier et ergonomie relevés dans les boîtes

- Échap ferme toute boîte (`0_common.js`).
- **Maj** fait défiler la position de placement (outil Draw) et inverse le sens (outil Length) : un **modificateur en
  cours d'opération**. Les flèches ◀ ▲ ▶ verrouillent l'axe vert / bleu / rouge, comme dans SketchUp.
- Chaque option est **visible** dans la boîte de l'outil et s'y modifie à la souris ; le clavier n'en est qu'un raccourci.
- Remarques techniques sans conséquence pour Fadi : police chargée depuis Google Fonts (dépendance réseau), interface en
  anglais seulement, `innerHTML` alimenté par des données.

## 4. Données de profils (`data/profiles/`)

`info.txt` (en polonais) fixe les règles de modélisation des sections : fichier enregistré au format **SketchUp 2017** ;
section dans le **plan YZ**, dans le **demi-plan positif** (déplacée ensuite) ; **Y = hauteur** ; la forme est
**redimensionnée par des formules portées par les arêtes**, donc ses dimensions dessinées n'ont pas d'importance, mais
chaque point doit avoir des valeurs « rondes » pour éviter les arrondis ; à faire : points de construction pour le rayon
de congé après redimensionnement.

Les six `.skp` contiennent chacun **une section paramétrique** : un dictionnaire d'attributs `scaling`, clé
`to_ax_formula`, porte sur chaque arête une formule en **`w`** (largeur), **`h`** (hauteur) et **`t`** (épaisseur) :

| Fichier | Formules relevées | Lecture |
| --- | --- | --- |
| `H.skp` | `w * 0.5`, `h * 0.5`, `w * 0.5 - t`, `t * 0.5` | profilé H symétrique, âme et ailes d'épaisseur `t` |
| `C.skp` | `w * 0.5`, `h`, `t`, `h-t`, `w * 0.5 - t`, `w * 0.5 - t * 1.5` | profilé C à **bords tombés** (le terme `t * 1.5`) |
| `U.skp` | `w`, `t`, `h`, `h - t`, `w - t` | profilé U |
| `L.skp` | `w`, `t`, `h`, `h-t` | cornière L |
| `T.skp` | `w * 0.5`, `t`, `t * 0.5`, `h` | profilé T |
| `test.skp` | mêmes formules que `H.skp` ; contient le chemin d'origine `…\StoreExtensions\Pipes Tubes 2020\src\dbs_pipes_tubes_2020\data\profiles\test.skp` | fichier d'essai hérité d'une extension antérieure du même auteur (« Pipes Tubes 2020 ») |

**Constat important** : les fichiers ne contiennent **aucune dimension de profilé du commerce** (ni IPE, ni HEA, ni UPN) ;
ce sont des **gabarits de forme**. Une seule épaisseur `t` sert à l'âme et aux ailes : les profilés laminés réels
(épaisseurs d'âme et d'aile distinctes, congés) ne sont pas représentés. Les dimensions viennent de la bibliothèque de
l'utilisateur (`add_profile.html`), saisies à la main. Les **masses volumiques** de la liste de matériaux sont écrites en
dur, **sans source**.

## 5. Graphismes (`pics/`)

| Fichiers | Description |
| --- | --- |
| `toolbar/*.svg` + `*.pdf` | 14 icônes 32 × 32 (Inkscape 1.1.2) : `draw`, `from edges`, `edit`, `lib`, `length`, `offset`, `mitre`, `profile cut`, `rotate`, `align`, `del face`, `bom`, `document`, `settings` — elles donnent la **liste des commandes de la barre** |
| `alfabet/*.png` | 36 glyphes 25 × 25 (0–9, a–z) : étiquettes affichées dans la vue (repères de pièces), pas un texte 3D |
| `LOGOv3_300x300.png`, `help.png`, `info_l.png` | logo (fond des boîtes), aide 32 × 32, information 24 × 24 |
| `dialogs/placing.svg` | anneau (deux cercles) sur lequel sont posés les 5 boutons radio de placement |

Ces images appartiennent à leur auteur : **aucune n'est reprise**. Fadi dessine ses propres pictogrammes (cahier §3.6).

## 6. Signature et licence

- `dbs_metal_fab.susig` (7 Ko) : signature binaire d'Extension Warehouse (intégrité du paquet), illisible.
- `extension_info.txt` : identifiants `ID` et `VERSION_ID` (UUID) du magasin d'extensions.
- `lic.rbe`, `lic_common.rbe` : contrôle de licence chiffré ; `update.rbe` : mise à jour.
- **Aucun fichier de licence n'accorde de droit de réutilisation** ; le copyright est celui de DBS Daniel Bieńkowski
  Solutions (2025). Conséquence : **ni code, ni image, ni texte de MetalFab n'entre dans Fadi**. Seules des **fonctions**
  (ce que fait l'outil, vu de l'utilisateur) sont décrites ici puis **réécrites** dans le vocabulaire et les règles de
  Fadi ; aucune liste de valeurs (masses volumiques, devises) n'est recopiée.

## 7. Fichiers non analysés

- **SU Splat** (`su_splat.rbz`, 93 Mo) : non téléchargé (limite de 10 Mo du connecteur, dossier Quick Share bloqué par
  la politique réseau). Rien n'en est déduit.
- **`ms_c2c_line_2p.rbz`** : signalé par une relecture externe (ligne passant par les milieux de paires successives de
  points), jamais reçu ; **signalé, non analysé**. La table le garde en attente (ligne N12) sans lot.

## 8. Fonctions identifiées (synthèse)

| # | Fonction MetalFab | Preuve |
| --- | --- | --- |
| F1 | Bibliothèque de profils (ajout, édition, suppression, filtre, tri, recherche, « Draw » depuis une ligne) | `library.html`, `add_profile.html` |
| F2 | Sections paramétriques par formules `w`, `h`, `t` (rond, rectangulaire, U, L, C, T, H) et section personnalisée prise dans le modèle | `data/profiles/*.skp`, `info.txt`, `add_profile.html` |
| F3 | Dessin d'une pièce par deux points : placement sur 5 points, rotation 90°, décalage de longueur, accrochage au centre, verrou d'axe, matière, contexte d'édition courant | `draw_tool.html`, journal v1.9 |
| F4 | Dessin depuis des arêtes : centre / extérieur / intérieur, rotation 90°, extrusion et coupe, fusion des colinéaires, ligne médiane | `draw_from_lines.html`, `settings.html` |
| F5 | Édition d'une pièce : changer de profil et la régénérer | `edit_tool.html` |
| F6 | Onglet entre deux pièces et angle de coupe affiché | icône `mitre`, `miter_joint_tool.rbe`, journal v1.6 |
| F7 | Coupe d'une pièce par le profil d'une autre | icône `profile cut`, `extrude_and_profile_cut_tool.rbe` |
| F8 | Allonger / raccourcir (demi-section ou valeur, + / −) | `offset_tool.html`, `pipe_length_tool.rbe` |
| F9 | Rotation d'une pièce autour de son axe | icône `rotate`, `rotate_tool.rbe` |
| F10 | Alignement d'une face de pièce | icône `align`, `align_face_tool.rbe` |
| F11 | Nomenclature triable, pour la sélection et ses imbrications ; sélection depuis la liste | journal v1.6–2.0, `report.rbe` |
| F12 | Masse au mètre (saisie ou calculée depuis la forme et une masse volumique), masse et coût totaux | `add_profile.html`, journal v2.0 |
| F13 | Imbrication en barres (longueur de barre par profil) | journal v2.0, `settings.html` |
| F14 | Renumérotation (préfixe, départ), textes de repère, image PNG | `documentation.html`, `settings.html` |
| F15 | Pièces en instances de composant (lisibles par un outil de débit tiers) | journal v1.6, `component.rbe` |
| F16 | Outils « Offset », « Dimensioning », « del face » | icônes et noms seulement — **effet inconnu** |

## 9. Ce qui est transposable à la Planche

Règles appliquées à chaque idée :

- **Catalogues sourcés (D-180)** : aucune dimension de profilé, aucune masse linéique, aucune masse volumique, aucun prix
  n'est fourni par Fadi ; les lignes viennent d'un CSV importé avec `source`, `edition`, `page` obligatoires, ou d'une
  **saisie** de l'utilisateur ; une valeur absente est « non évaluée », jamais zéro.
- **Écarts Fadi déclarés** : SketchUp n'a aucun de ces outils ; chacun est un écart `fadi` du cahier de la Planche (§4,
  nouvelle section), avec sa fiche PL-NN-MM avant le code (R8).
- **Géométrie libre ou modèle typé** : la Planche reste de la **géométrie libre** (C8) ; une pièce y est un **composant
  dont les métadonnées régénèrent la géométrie sur commande explicite** (comme le rayon d'un cercle) — jamais une seconde
  géométrie canonique. Le **modèle typé** de l'Atelier (ontologies `structure`, `timber`, `sheetmetal`, `mep`) reste le
  lieu des objets de construction ; le passage de l'un à l'autre est une **conversion explicite** qui relève de P-10
  (décision du maître d'ouvrage).
- **Langue** : textes écrits en français dans `messages.ts`, traduits dans `en.json` ; aucun libellé MetalFab recopié.
- **Pureté** : la géométrie va dans `packages/planche-model` (aucune dépendance, `allowedDependencies: []`) ; le noyau
  reçoit une section sous forme de contour 2D (extérieur + trous) ; le calcul du contour d'une forme et la lecture du
  catalogue se font dans `apps/web`, qui peut importer `@parcours/atelier-model` (`contourSection`, `trousSection`,
  `validerCatalogueCsv`) — pas de duplication, pas de dépendance nouvelle du noyau.

| Idée MetalFab | Où elle va | Règle Fadi et écart déclaré | Lot |
| --- | --- | --- | --- |
| F1 Bibliothèque de profils | **Pont vers l'Atelier** : la Planche lit les définitions `catalogue` du projet (commande `catalogue.importer`, gabarit `profils-acier.csv`) ; saisie de dimensions dans la Planche | D-180 : catalogue livré vide, ligne sourcée ou saisie ; norme, référence fournisseur et URL ne sont reprises que de la ligne sourcée ; pas de bibliothèque « produit » | L12 |
| F2 Sections paramétriques `w`, `h`, `t` | **Planche** (contour 2D) via `contourSection` de l'ontologie `structure` (épaisseurs d'âme et d'aile **distinctes**, plus fidèle que la seule `t`) ; section personnalisée = face choisie dans la Planche | Formes paramétriques = paramètres de saisie, pas des données ; aucune dimension par défaut ; le C à bords tombés n'existe pas dans `FormeSection` : forme nouvelle seulement si le maître d'ouvrage la demande, sinon contour personnalisé | L11, L12 |
| F3 Dessin d'une pièce par deux points | **Planche**, nouvel outil « Profilé » (famille Dessin) | Écart `fadi` ; placement par l'événement `configurer` ; **Ctrl** fait défiler les 5 positions (pas Maj, réservé au verrou d'inférence et à la couche de raccourcis) — écart déclaré par rapport à MetalFab ; dessin dans le contexte d'édition courant (`OptionsContexte.dans`) | L11, L12 |
| F4 Dessin depuis des arêtes | **Planche**, outil « Profilés depuis arêtes » | Écart `fadi` ; pièces **liées** à leurs arêtes comme les surfaces de D-197 ; extérieur / intérieur relatifs au plan de la boucle | L11, L12 |
| F5 Édition et régénération | **Planche** (Info entité d'une pièce) | C8 : régénération explicite depuis les métadonnées, un pas d'annulation | L17 |
| F6 Onglet | **Planche** (noyau : plan bissecteur, déjà employé par `suivezMoi`) | Angles de coupe dérivés, jamais saisis | L13 |
| F7 Coupe par profil | **Planche** (soustraction manifold-3d existante, lot 6) | MO-4 : booléen de maillage déclaré, aucune exactitude B-Rep promise | L13 |
| F8 Allonger / raccourcir | **Planche** (prolonge `allongerArete`, PR #109) | Sens donné par le signe ou un bouton, pas par Maj | L13 |
| F9 Rotation axiale | **Planche** (variante de Faire pivoter, axe = axe de la pièce) | Identité distincte au registre (« Rotation axiale de pièce ») | L17 |
| F10 Alignement de face | **Planche** | — | L17 |
| F11 Nomenclature, sélection depuis la liste | **Planche** (liste de débit de la Planche) ; même présentation que la « Liste de débit » de l'Atelier (`tableaux.ts`) | Aucune chute ni surlongueur supposée (même règle que l'Atelier) ; export CSV « ; » | L14 |
| F12 Masse au mètre, masse totale | **Planche**, avec la règle de l'ontologie mécanique (`inerties.ts`) : masse seulement avec une **masse volumique déclarée avec sa source**, ou une `masse_kg_m` **sourcée** du catalogue | La liste de 12 masses volumiques de MetalFab n'est **pas** reprise (aucune source) ; sinon « non évaluée » | L14 |
| F12 Coût | — | Prix = donnée commerciale non sourcée par défaut : **décision du maître d'ouvrage**, hors programme | — |
| F13 Imbrication en barres | — | Exige longueur de barre et trait de scie déclarés et une règle d'optimisation : **décision du maître d'ouvrage**, hors programme | — |
| F14 Renumérotation, textes de repère, PNG | **Planche** (repère = métadonnée ; textes dérivés ; PNG déjà livré au lot 7) | Un pas d'annulation par renumérotation | L14 |
| F15 Pièces en composants lisibles par un outil de débit | **Planche** (une pièce est un composant ; métadonnées exportées dans la liste de débit et, plus tard, en IFC) ; **pont** vers `structure` / `timber` par conversion explicite | R15, P-10 : conversion jamais silencieuse ; à rouvrir par le maître d'ouvrage | — |
| F16 Offset, Dimensioning, del face | Rien | Effet inconnu (Ruby chiffré) : rien n'est inventé | — |

Ce qui **n'est pas** transposé : le code et les images (licence) ; les masses volumiques et la devise ; la dépendance à
Google Fonts ; la compatibilité OpenCutList en tant que telle (la Planche n'a pas d'extensions tierces) ; les fichiers
non reçus (SU Splat, `ms_c2c_line_2p`).

## 10. Limites de cette analyse

- Rôles des `.rbe` **déduits** (nom, taille, appels, journal) ; aucun comportement interne n'a été exécuté ni observé.
- Les formules des `.skp` ont été extraites du texte du fichier, sans ouvrir SketchUp : l'ordre des arêtes et la
  topologie exacte des sections ne sont pas connus.
- Les constats sur le code de Fadi viennent de la lecture du code de `main` et des branches des PR #109 et #110 ; les
  conflits de clavier signalés dans la table ne sont pas reproduits au navigateur.
