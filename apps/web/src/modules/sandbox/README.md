# Module : Sandbox

Responsabilité : la Planche — géométrie libre 3D — à soi seule (`/sandbox`) : aucun projet, aucun lien avec la Planche
de l'étape 10 ; seules les préférences d'outils du compte passent par le serveur (lot 5).

8ᵉ module, décidé par le maître d'ouvrage le 20 octobre 2026 (`Studio/Sandbox/Recommandation_Sandbox_Architecture.md`).
Lot 1 : déplacé depuis la Console du Studio (`apps/web/src/modules/studio/console/sandbox/`), sans changement de
comportement ni d'apparence.

## Organisation

- `PageSandbox.tsx` — page de `/sandbox` (fil d'Ariane, titre accessible) ; charge la Planche à la demande.
- `SandboxPlanche.tsx`, `planche/`, `panneaux/` — la Planche copiée (outils, vue three.js, booléens Manifold, brouillon
  local), sur le modèle `@parcours/sandbox-planche-model`.
- Registre unique `REGISTRE_SANDBOX` (`packages/sandbox-planche-model/src/registre-sandbox.ts`, lot 2) : 86 entrées
  (52 outils, 20 commandes, 14 panneaux) avec pictogramme, famille, raccourci, emplacement et disponibilité ; barres,
  grille « ⋯ », liste « Outils » (ouverte par la loupe), recherche, colonne de droite, barre d'actions et clavier le lisent (`registre-interface.test.ts`).
- `pictogrammes/` (lot 3) — pictogrammes SVG : icônes Tabler (`@tabler/icons` 3.49.0, MIT, `LICENCE-TABLER-ICONS.txt`) et
  12 dessins sur mesure (`sur-mesure/`), teintés par famille ; `donnees.ts` est généré
  (`npx tsx apps/web/scripts/generer-pictogrammes-sandbox.ts`) et ne contient que les icônes utilisées.
- Disposition par défaut (lot 4, profil « Standard », proche de SketchUp) : barre gauche de seize outils dans l'ordre de
  SketchUp, grille « ⋯ » par famille, colonne de droite à un clic par panneau (Info modèle en bas, chevron à mi-hauteur
  au survol), aucune barre d'outils en haut (Annuler / Rétablir au clavier : Ctrl + Z / Ctrl + Y), aide à gauche de la barre du bas, Cadrer et zoom + / − (tactile)
  dans la barre d'actions, curseur propre à chaque outil (`pictogrammes/curseur.ts`).
- Pied de page façon SketchUp (24 novembre 2026, ordinateur : page et fenêtre détachée) : une seule bande blanche pleine
  largeur collée en bas, sans carte ni ombre ; à gauche les icônes aide, langue (globe) et périphérique (souris), dont la
  liste s'ouvre au clic ; puis la consigne de l'outil actif ; « Mesures » et son champ à droite (bouton OK seulement au
  toucher) ; la colonne de droite s'arrête au-dessus de la bande. Le contexte de travail (repère, plan, portée, unité)
  n'y est plus affiché : il est annoncé au lecteur d'écran (`[data-reperes-etat]`, masqué) et la barre « Axes et repères »
  s'ouvre par l'outil Axes (Maj + Y) ou Alt + Maj + 1. Téléphone inchangé.
- `preferences/` (lot 5) — personnalisation : profils Standard, Métier (Bois et menuiserie, Volumes et solides) et
  Personnel, favoris, regroupements nommés, « Réinitialiser » (panneau ouvert par « Modifier » dans la grille).
  Préférences enregistrées sur le serveur, par compte (`GET`/`PUT /sandbox/preferences`, table
  `sandbox_tool_preferences`) par un client minimal (`preferences/client.ts`, seul fichier autorisé à appeler le
  serveur) ; copie locale de la dernière version reçue, profil Standard si rien n'a été reçu.
- `routes-sandbox.ts` — adresses : `/sandbox` et l'ancienne `/studio/console/sandbox`, qui y redirige.
- `sandbox.css` (sous `.sandbox-planche`) et `page-sandbox.css` (sous `.sandbox-page`) — feuilles de style isolées.

## Bandeau d'en-tête et menu de la Planche

- **Bandeau d'en-tête** (24 novembre 2026, ordinateur : page et fenêtre détachée) : à la manière de l'en-tête « UI Shell »
  de Carbon, sans logo ni marque IBM et sans la bibliothèque Carbon (CSS propre au Sandbox, `.planche-bandeau`) — 48 px
  gris très foncé (`#161616`) en haut de la Planche ; ☰ occupe le carré gauche (48 × 48), puis « **Planche** » et le nom
  de la Planche ouverte. Le dessin et tout ce qui flotte dessus vivent dans la zone « vue », sous le bandeau ; les barres
  flottantes se placent par défaut sous lui (`planche/zone-dessin.ts`).
- **Barre d'actions dans le bandeau** (24 novembre 2026, ordinateur, `panneaux/ActionsBandeau.tsx`) : la barre flottante
  du milieu disparaît ; ses commandes passent au centre du bandeau, en trois groupes — Cadrer (zoom − / + au toucher) |
  Grouper, Composant, Éclater, Unique | Diviser, Diviser la courbe, Isoler selon la sélection. États grisés et infobulles
  inchangés, Isoler enfoncé pendant l'isolement ; sous 1180 px de large et à la souris, icônes seules (nom en infobulle ; au toucher, le nom reste visible). Le choix bandeau / barre flottante suit la largeur de la fenêtre qui porte la Planche (fenêtre détachée comprise). À droite :
  « Détacher » dans la page ; dans la fenêtre détachée, plus de « Rattacher » : ✕ « Fermer et rattacher ». Position
  mémorisée, poignée et masquage de l'ancienne barre ne s'appliquent plus à l'ordinateur. Téléphone : barre flottante
  inchangée.
- **Téléphone** : pas de bandeau ; ☰ reste une carte flottante en haut à gauche, qu'un appui maintenu 2 s rend
  déplaçable (`planche/deplacement-menu.ts`, position mémorisée dans ce navigateur ; Alt + flèches au clavier).
- **Fenêtre détachée** (24 novembre 2026) : « Détacher » ouvre toujours la fenêtre « image dans l'image » (Document
  Picture-in-Picture), désormais demandée à la taille utile de l'écran au lieu de 1040 × 700 fixes
  (`planche/taille-fenetre-detachee.ts` ; jamais plus petite qu'avant). Le navigateur peut la plafonner à son maximum.

Pictogramme ☰ seul (Tabler `menu-2`, MIT) : un clic déroule le menu, sous le bandeau à l'ordinateur ; douze entrées, dans cet ordre et ces groupes : Ouvrir une Planche,
Nouvelle Planche… | Enregistrer, Enregistrer sous…, Renommer / niveau de référence… | Supprimer la Planche | Partager,
Exporter en IFC / OBJ / STL, Importer en IFC / OBJ / STL | Informations, Télécharger la vue (PNG) | Extensions.

- **Extensions** (« Add-ons » en anglais ; `packages/sandbox-planche-model/src/extensions-sandbox.ts`) : une extension est
  un paquet de fonctions fourni par Fadi — des entrées du registre unique (outils, commandes, panneaux) portant son
  étiquette. Aucun code tiers, aucune installation, aucun redémarrage. La fenêtre « Extensions » du menu propose un
  interrupteur par extension ; une extension désactivée retire ses outils, commandes et panneaux des barres, de la
  grille, de la liste des commandes et de la colonne, sans toucher au dessin. Le choix suit le compte
  (`extensions` des préférences, `/sandbox/preferences`, colonne `extensions` de `sandbox_tool_preferences`) : seuls
  les écarts au réglage d'origine sont enregistrés, si bien qu'un compte existant ne perd rien. Premières extensions,
  actives d'origine : « Bois et menuiserie » et « Volumes et solides » (regroupement d'outils existants).
- **Extension « Contrôle et nettoyage »** (à activer ; `packages/sandbox-planche-model/src/controle.ts`,
  `planche/panneau-controle.tsx`) : panneau de la colonne et deux commandes, Contrôler (Maj + F8) et Nettoyer
  (Maj + F2). Le relevé compte sur toute la Planche les objets vides, les matières et balises inutilisées, les arêtes
  isolées et les objets de la racine qui ne sont pas des solides fermés ; il ne modifie rien. Nettoyer retire
  seulement ce qui est coché (les arêtes isolées ne le sont pas d'origine), en une opération : un seul Annuler. Un
  objet verrouillé n'est jamais touché ; le nettoyage se fait à la racine, aucun objet ouvert en édition.
- **Extension « Composants dynamiques »** (à activer ; d'après les Dynamic Components de SketchUp ;
  `packages/sandbox-planche-model/src/composants-dynamiques.ts`, `planche/panneau-dynamique.tsx`) : un composant porte
  des **paramètres** (valeur ou formule de tableur « =… »), montrés ou non comme **options** (zone de texte ou liste), et
  des **règles** qui fixent par formule les attributs de ses objets contenus : `X`, `Y`, `Z`, `LenX`, `LenY`, `LenZ`,
  `RotZ`, `Hidden`, `Material`, `Copies` (avec la variable `Copy`). Aucun code n'est exécuté : les formules sont lues par
  un interpréteur pur (fonctions listées par `FONCTIONS_DYNAMIQUES`). Tout est rangé sur la définition du composant
  (`dynamique`), vérifié à la relecture. Commandes : panneau (Maj + F7), Redessiner (Maj + F11). Écarts déclarés avec
  SketchUp : longueurs en mètres (SketchUp : pouces) ; une option change toutes les instances du composant (« Rendre
  unique » en détache une) ; pas d'outil Interagir ni d'`onClick`, pas de `RotX` / `RotY`, pas de référence d'un objet à
  un autre, pas de fonction aléatoire. Jeu d'essai de la recette : `apps/web/e2e/donnees/sandbox-etagere-dynamique.json`.

- **Planches nommées, locales** (`planche/registre-planches.ts`) : un index et un document par Planche dans ce navigateur
  (IndexedDB) ; la première, « Brouillon Sandbox », garde la clé historique (aucune migration). Aucun projet, aucun
  serveur. Au plus 50 Planches. Enregistrer sous copie la Planche et garde le dessin et l'historique à l'écran.
- **Niveau de référence** : altitude déclarée (m), mémorisée avec la Planche, **non appliquée à la géométrie**.
- **Partager** : fichier IFC via le partage du navigateur (Web Share), sinon téléchargé.
- **Export IFC** (`echanges-ifc.ts`) : IFC4, un `IfcBuildingElementProxy` par maillage en `IfcTriangulatedFaceSet`, mètres ;
  aucune classe, propriété ni quantité inventée. OBJ et STL : inchangés.
- **Import** (`echanges-import.ts`) : OBJ, STL (ASCII et binaire), IFC (`IfcTriangulatedFaceSet`, unité lue). Un groupe par
  maillage ; les triangles coplanaires voisins sont fusionnés (un cube = 6 faces). OBJ et STL : unité choisie dans le
  menu (mètre par défaut). **Plafond : 1 500 triangles** (insertion quadratique, mesurée : 528 → 0,5 s, 2 200 → 7,5 s).
- **Informations** (`planche/informations-planche.tsx`) : page dans le style d'Excel (cartes à gauche, propriétés à
  droite) ; chaque chiffre est mesuré (contenu, taille du document, objets non étanches, éléments non exportés).
- **Historique** (`planche/journal-planche.ts`) : journal des modifications par Planche, dans ce navigateur (200 entrées
  au plus, les 5 dernières affichées : `jj.mm.aaaa hh.mm, auteur, description`). L'auteur est « Vous » : le Sandbox ne peut
  pas lire le compte (frontières). Deux entrées identiques à moins d'une minute sont fusionnées.

## Axes et repères (chantier Axes, `docs/workstreams/axes/`)

- **Contexte de travail** (AX-1, décision AX-D3) : repère de travail, plan de travail (XY / XZ / YZ du repère) et verrou,
  personnels, hors de l'historique Annuler / Rétablir, mémorisés par Planche dans ce navigateur
  (`planche/contexte-travail.ts`) ; « Repère précédent » parcourt leur historique de session. Changer de repère ne
  déplace jamais la géométrie ; l'ancien `annotations.repere` d'un document n'est plus écrit, seulement lu comme
  contexte initial.
- **Barre « Axes et repères »** (AX-2, `planche/BarreReperes.tsx`, `planche/commandes-reperes.ts`) : compacte et
  flottante, ouverte par Placer les axes (Maj + Y) ou Alt + Maj + 1 ; commandes Alt + Maj + 1 à 8
  et F4 ; inspecteur (origine, orientation, rotation par axe nommé, plan, verrou). Recette `apps/web/e2e/sandbox-axes.mjs`.
- **Repères enregistrés** (AX-3, `annotations.reperes`, panneau « Repères », `planche/PanneauReperes.tsx`) : mutations du
  document (Annuler les défait) ; « Modifié » ; suppression d'un repère cité par une scène après résolution explicite ;
  option de scène « Rappeler le repère » ; triade d'orientation (`planche/triade.ts`), exclue du PNG par défaut.
  Recette `apps/web/e2e/sandbox-reperes.mjs`.
- **Origine du composant** (AX-4, `planche/PanneauOrigineComposant.tsx`, Maj + F4, menu « Changer les axes ») : 27 ancrages,
  point libre, orientation séparée, portée et refus explicites, aucun sommet monde déplacé. Recette `sandbox-origine.mjs`.
- **Repères liés et coordonnées des exports** (AX-5) : santé du lien explicite, mise à jour seulement depuis la même face ;
  exports en coordonnées du modèle, du repère de travail ou d'origine (si l'import l'a consignée). Recette
  `sandbox-reperes-lies.mjs` ; dossier de recette `docs/workstreams/axes/RECETTE.md`.

## Frontières

- Le Sandbox n'importe ni le Studio, ni l'Atelier, ni `@parcours/atelier-model`, ni `@parcours/planche-model`, ni le
  client d'API général (seul `preferences/client.ts` appelle `/sandbox/preferences`) ; aucun fichier du Studio n'importe le Sandbox (la carte « 00 Sandbox » est un lien d'adresse).
- Contrôles : `independance.test.ts` (bidirectionnel) et `scripts/frontieres.json` (`npm run typecheck`).
- Recette de bout en bout : `apps/web/e2e/sandbox-module.mjs` (CI, tranche `planche`).

## Lots suivants

Harmonisation des raccourcis (lot 6) : lots suivants de la recommandation.
