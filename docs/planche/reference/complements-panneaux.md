# SketchUp pour le Web — Compléments panneaux (session du 2026-10-06, 2e passage)

Complète `mesure-camera-panneaux.md` § 4. Onglet de travail : tabId 2085581121 (app.sketchup.com/app).

## Résultat de la session : AUCUN relevé en direct

L'extension Claude in Chrome n'a pas répondu dans cet onglet. Ordre des appels :

1. `javascript_tool` (lecture du DOM) : échec (« failed in the extension »).
2. `computer` screenshot : échec.
3. `navigate` vers https://app.sketchup.com/app : **réussi**. L'onglet a été rechargé.
4. `browser_batch` (attente 8 s puis capture) : échec.
5. `get_page_text` : échec.
6. `read_page` (après 20 s de pause) : échec.
7. `javascript_tool` (après 30 s de pause) : échec.

La consigne demandait de s'arrêter après 2 ou 3 échecs de suite : le test a donc été arrêté. Aucun panneau n'a été ouvert. Aucun réglage n'a été modifié. Aucune action interdite n'a été faite.

État laissé : l'onglet 2085581121 a été rechargé sur /app. On ignore s'il affiche la page d'accueil ou la boîte « Open Recovered Model ». Le modèle de test de la session précédente n'a pas été recréé.

Hypothèse : l'extension a planté une première fois à l'ouverture de Shadows (session précédente) et ne s'en est pas remise pour les outils qui lisent la page. Seul `navigate` répond encore. Pour la suite, il faudra sans doute recharger ou réactiver l'extension, ou ouvrir un nouvel onglet, avant tout nouvel essai. Ces deux dernières actions n'ont pas été faites, car la consigne limitait le travail à cet onglet.

---

Légende :
- **[OBS-avant]** : observé en direct lors de la session précédente (repris de `mesure-camera-panneaux.md`).
- **[NON VÉRIFIÉ]** : rien d'observé. Les éléments marqués « attendu » suivent les conventions connues de SketchUp (version bureau ou doc). Ils servent seulement de liste de contrôle pour le prochain test et **ne doivent pas être codés comme faits**.

## 0. Gestionnaire de panneaux

**Observé en direct** (session précédente, [OBS-avant]) :
- Colonne d'icônes à droite. Ordre : Entity Info, Components, Instructor, 3D Warehouse, Materials, Styles, Tags, Shadows, Scenes, Display, Soften / Smooth, Model Info.
- Un panneau est une carte d'environ 300 px de large qui s'ouvre en place, avec un en-tête titre + icône. Recliquer l'icône le ferme.
- **Plusieurs panneaux peuvent s'empiler**, donc il n'y a pas qu'un seul panneau ouvert à la fois.
- Poignée `Resize panel` et bouton `»` (`Hide panels`).
- Bouton « Upgrade Now » fixé en bas.

**Non vérifié** :
- Largeur minimale et maximale atteintes avec `Resize panel`.
- Si la largeur reste la même après fermeture et réouverture.
- Défilement de la pile quand elle dépasse la hauteur (une seule barre de défilement ou une par panneau).
- Ce qui se passe au retour après `Hide panels` (les panneaux restent-ils ouverts ?).
- Position fixe à droite, ou panneaux détachables.

## 1. Styles
- **Observé en direct** : rien cette fois. Lors de la session précédente [OBS-avant], le panneau restait sur un spinner de chargement après plus de 10 s.
- **Non vérifié**, à relever (attendu) :
  - onglets Select / Edit / Mix ;
  - bibliothèques de styles ;
  - Edit > Edge : Edges, Back Edges, Profiles, Depth Cue, Extension, Endpoints, Jitter, couleur des arêtes ;
  - Edit > Face : couleurs avant et arrière, mode d'affichage, X-ray et opacité ;
  - Edit > Background : fond, Sky, Ground ;
  - Edit > Watermark.
- Commandes déjà vues dans la recherche [OBS-avant] : View Edges {on}, View Back Edges {off}, View Profiles {on}, Depth Cue {off}, View Extensions {off}, View Endpoints {off}, View Jitter {off}, Color Edges all the Same / by Axis / by Material, View Sky {on}, View Ground {off}, View Watermarks {on}, X-ray {off}.

## 2. Scenes
- **Observé en direct** : rien.
- [OBS-avant] : les commandes « Scenes » et « Create Scene » existent dans la recherche.
- **Non vérifié**, à relever (attendu) :
  - boutons ajouter, mettre à jour et supprimer une scène, et réordonner la liste ;
  - propriétés d'une scène : nom, description, et propriétés enregistrées (caméra, style, ombres, tags, plans de coupe…) ;
  - réglages d'animation : transition, délai.

## 3. Display
- **Observé en direct** : rien.
- [OBS-avant] : commandes Unhide All / Unhide Last / Unhide Selected, View Hidden Geometry {off}, View Hidden Objects {off}, Hide Rest of Model {off}, Hide Similar Components {off}.
- **Non vérifié** : la composition du panneau. Il est probable qu'il regroupe ces bascules et les options d'édition de composant, mais ce n'est pas confirmé.

## 4. Soften / Smooth
- **Observé en direct** : rien.
- [OBS-avant] : commande « Soften/Smooth Edges ».
- **Non vérifié** (attendu) :
  - curseur « Angle between normals », de 0 à 180°, valeur par défaut 20° dans la version bureau ;
  - cases Smooth normals, Soften coplanar ;
  - le comportement quand rien n'est sélectionné (panneau grisé ?).

## 5. Model Info
- **Observé en direct** : rien.
- **Non vérifié** (attendu) :
  - Units : format, précision, unités d'aire et de volume, accrochage de longueur et d'angle ;
  - Geo-location ;
  - Dimensions et Text : police, taille, extrémités ;
  - Statistics : nombre d'arêtes, de faces, de composants…, et Purge ;
  - Credits / File.
- Pour mémoire, l'Entity Info des cotes et textes est déjà relevé [OBS-avant] : 15 polices, défaut Architects Daughter ; tailles 9 à 32, défaut 12. C'est une piste pour les valeurs par défaut de Model Info, pas une confirmation.

## 6. 3D Warehouse
- **Observé en direct** : rien.
- [OBS-avant] : les liens « Open 3D Warehouse » (Components) et l'onglet 3D Warehouse de Materials existent.
- **Non vérifié** : l'interface du panneau (champ de recherche, filtres, vignettes).

## 7. Outliner, Solid Inspector, Comments
- [OBS-avant] : **absents** de la colonne de droite (compte gratuit). Aucune pastille ne leur correspond dans la liste des 12 panneaux.
- **Non vérifié** :
  - s'ils existent derrière un abonnement ;
  - si l'icône commentaire de la barre du haut correspond à Comments.

## 8. Shadows
- **Observé en direct** : rien. Ce panneau devait être ouvert en dernier, mais on n'y est pas arrivé.
- [OBS-avant] : son ouverture a coïncidé avec le plantage de l'extension. Dans la recherche : View Shadows {off}, Use Sun for Shading {off}, Set Sun Location {off}.
- **Non vérifié** (attendu) :
  - interrupteur ombres ;
  - heure (curseur) et date (curseur ou calendrier) ;
  - fuseau UTC ;
  - curseurs Light / Dark ;
  - case « Use sun for shading » ;
  - options On faces / On ground / From edges.

## 9. À faire au prochain essai
1. Rétablir l'extension : recharger l'extension ou Chrome, ou utiliser un nouvel onglet si c'est autorisé.
2. Relever Styles, Scenes, Display, Soften/Smooth, Model Info, 3D Warehouse avec `get_page_text` ou `javascript_tool`, puis Shadows en dernier, en attendant 5 s.
3. Relever la largeur des panneaux en px par JS (`getBoundingClientRect`) avant et après `Resize panel`.

---

## Relevé DOM direct (session principale, onglet fonctionnel) — Observé

Les panneaux de droite sont tous montés dans le DOM, même fermés ; leur contenu a été lu directement (libellés, champs, bornes, valeurs par défaut). Ce relevé remplace les mentions « non vérifié » ci-dessus pour les panneaux suivants.

### Shadows
- Bascule principale Shadows (case, défaut : off).
- Cases : On face (on), On ground (on), From edges (off), Use sun for shading (off).
- Timezone : « UTC-7:00 » (libellé, modifiable via Add Location).
- Time : curseur range 0–600 (valeur 406 ≈ 1:30 PM), bornes affichées 6:44 AM – 4:44 PM (lever/coucher selon date et lieu).
- Date : curseur range 1–365 (312 = 11/08), échelle des mois J F M A M J J A S O N D.
- Light : curseur 0–100 (80). Dark : curseur 0–100 (45).
- Fog Settings : Show Fog (off), Use Background Color (on), Distance (curseur double).
- Bouton Add Location.

### Scenes
- Barre : Add Scene, Update Active Scene, Play Scenes Animation, Edit Animation Settings.
- Camera : Perspective / Parallel Projection / Two-Point Perspective (boutons exclusifs) ; Field Of View (FOV) curseur 0–120, défaut 30.
- Standard Views : Plan View (Top), South Elevation (Front), East Elevation (Right), North Elevation (Back), West Elevation (Left), Bottom View, Iso.  → c'est ici que se trouvent les vues standard.
- My Scenes : liste + Add Scene.
- Animation Settings (dialogue) : Enable Scene Transitions (on), Transition Time (s) curseur 0–100 défaut 2, Delay Time (s) 0–100 défaut 1, Ok.

### Display
- Unhide : All / Selected / Last.
- View : Hidden Objects (off), Hidden Geometry (off), Color By Tags (off), Section Planes (off), Section Cuts (on, + nombre 1–20 défaut 3), Section Fill (on), Axes (on), True North (off), Guides (on) + action « Delete all guides ».
- Component Edit : Hide Rest of Model (off), Hide Similar Components (off).

### Soften / Smooth
- Soften Coplanar Edges (off), Smooth Edges (off), messages d'état « No softened edges » / « No smoothed edges ».
- Angle : curseur 0–180, défaut 30.

### Model Info
- Length Units : Format (Meter), Display Precision (0.00 m), Length Snapping (on, 0.01 m).
- Area Units : Square Meter, précision 0.00 m². Volume Units : Cubic Meter, précision 0.00 m³.
- Angle Units : Precision 0.0, Angle Snapping (on, 15°).
- Text Settings : Screen Text (police Architects Daughter Regular 9, Update All Screen Text) ; Leader Text (Architects Daughter Regular 9, Endpoints None/Slash/Open arrow/Closed arrow/Dot, Align to Screen/Pin, Update All Leader Text).
- Dimensions Settings : police Architects Daughter Regular 12 ; Align to : above / centered / outside / screen ; Endpoints None/Slash/Open arrow/Closed arrow/Dot ; Update All Dimensions.

### Entity Info (arc sélectionné)
- Arc : Arc length (lecture, « ~ 7.91 m »), Radius (éditable), Segments (éditable, 12), Materials Front (Default material), Tags (Untagged), Shadows : Cast Shadows (case).

### Materials
- Onglets : In Model / Browse / 3D Warehouse ; matériau courant (vignette + nom) ; actions Delete Materials, Import Material ; grille « Materials In Use » (Default material, Ty_Blue1…4, Ty_Brown1-2, Ty_Gray1-2, Ty_Green, Ty_Orange, Ty_Red, Ty_Skin, Ty_Yellow).

### Tags
- Barre : Toggle Master Visibility, Create Tag, Create Folder, Sort Tags, Color by Tag, Purge unused ; champ de recherche.

### Components
- Actions : Edit Component Details, Open 3D Warehouse.

### Gestionnaire de panneaux
- Chaque panneau a un bouton « Resize panel » et « Close » ; un bouton global « Hide panels » ; un panneau ouvert remplace la colonne d'icônes (un seul à la fois observé).

### Styles — non relevé
- Contenu chargé à la demande (vide dans le DOM) ; à relever lors d'une prochaine session.
