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
  inchangés, Isoler enfoncé pendant l'isolement ; sous 1180 px de large et à la souris, icônes seules (nom en infobulle ; au toucher, le nom reste visible, en petit sous l'icône). Le choix bandeau / barre flottante suit la largeur de la fenêtre qui porte la Planche (fenêtre détachée comprise). À droite :
  « Détacher » dans la page ; dans la fenêtre détachée, plus de « Rattacher » : ✕ « Fermer et rattacher ». Position
  mémorisée, poignée et masquage de l'ancienne barre ne s'appliquent plus à l'ordinateur. Téléphone : barre flottante
  inchangée.
- **Centre du bandeau : Annuler · Rétablir | Cadrer · Zoom** (26 novembre 2026, maquette validée par le maître
  d'ouvrage) : le centre ne garde que ce qui sert quel que soit l'outil. Annuler (Ctrl Z) et Rétablir (Ctrl Y) du
  brouillon, grisés quand il n'y a rien à faire, l'infobulle nomme l'opération ; Cadrer (Maj Z) ; Zoom choisit l'outil
  Zoom (Z), enfoncé quand il est l'outil courant. Annuler et Rétablir en icônes seules à la souris (au toucher, nom visible sous l'icône, AGENTS.md) ;
  pas de zoom − / + dans le bandeau (ils restent dans la barre flottante du téléphone). Les commandes de groupe (Grouper, Composant, Éclater, Unique, Diviser,
  Diviser la courbe, Isoler) quittent le bandeau sans disparaître : barre « Groupe » de la liste Outils, clic droit et
  clavier. Téléphone : barre flottante inchangée.
- **Menus du bandeau** (26 novembre 2026, `panneaux/MenusBandeau.tsx`) : Édition, Affichage, Caméra et Fenêtres juste
  après le nom ; ☰ reste le menu Fichier. Aucune fonction nouvelle : Édition (Annuler, Rétablir, Couper, Copier, Coller,
  sélection, Effacer, Masquer, Verrouiller), Affichage (panneaux Styles et Affichage réunis : mode de face, arêtes,
  X-ray, sol, axes, guides, plans de coupe, couleur par balise, objets masqués, Réafficher tout), Caméra (vues standard,
  perspective / parallèle, champ de vision, zoom, Mes scènes), Fenêtres (chaque panneau de la colonne, panneaux des
  extensions actives). Motif « Menubar » : clic, survol d'un titre voisin, flèches, Échap, clic ailleurs ; une case ou
  un choix radio laisse le menu ouvert. Les quatre titres restent visibles à toute largeur, comme sur la maquette (resserrés sous 1180 px). Rien n'est écrit dans
  la Planche par Affichage et Caméra (R10).
- **Nom de la Planche dans le fil d'Ariane** (26 novembre 2026, maquette validée, `fil-ariane-planche.ts`) : dans la
  page, le bandeau ne porte que « Planche » ; le nom de la Planche ouverte termine le fil « Studio / Console / Sandbox /
  <nom> ». Détachée (fenêtre ou plein écran), la Planche remet son nom dans son bandeau.
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
  (`extensions` des préférences, `/sandbox/preferences`, colonne `extensions` de `sandbox_tool_preferences`) : seul
  ce que le compte a basculé lui-même est enregistré, si bien qu'un compte existant ne perd rien. La plateforme règle
  le catalogue en base (`addon_platform_settings`, routes `GET /admin/addons` et `PATCH /admin/addons/:id`,
  journalisées) : état de chaque extension (disponible, expérimentale, retirée) et réglage d'origine des comptes qui
  n'ont rien choisi. La réponse de `/sandbox/preferences` porte ce `catalogue` ; la Planche en déduit ce qui est actif
  (`choixEffectif`, `catalogue-extensions.ts`) : une extension retirée ne l'est pour personne, le choix du compte est
  gardé et revient si elle est rétablie. Premières extensions,
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
  `RotX`, `RotY`, `RotZ` (appliqués dans cet ordre), `Hidden`, `Material`, `Copies` (avec la variable `Copy`). Une
  formule de règle lit le composant (`Parent!LenX`) ou un autre objet contenu par son nom (`Porte!LenX`). Le champ
  **Au clic** porte des actions `SET("Nom", v1, v2…)` / `ALTER(…)`, déclenchées par l'outil **Interagir** (main qui
  clique, Ctrl + Maj + F) : chaque clic fait passer le paramètre à la valeur suivante (phase 1, lot 1, 26 novembre 2026 ;
  `outils/interagir.ts`, fiche `docs/planche/reference/ecarts-fadi-dynamiques.md`). Aucun code n'est exécuté : les
  formules sont lues par un interpréteur pur (fonctions listées par `FONCTIONS_DYNAMIQUES`). Tout est rangé sur la
  définition du composant (`dynamique`), vérifié à la relecture. Commandes : panneau (Maj + F7), Redessiner (Maj + F11).
  Écarts déclarés avec SketchUp : longueurs en mètres (SketchUp : pouces) ; une option change toutes les instances du
  composant (« Rendre unique » en détache une) ; SET et ALTER passent tous deux à la valeur suivante, sans animation ;
  pas d'ANIMATE, REDRAW ni GOTOSCENE ; pas de fonction aléatoire. Jeu d'essai de la recette : `apps/web/e2e/donnees/sandbox-etagere-dynamique.json`.
- **Extension « Emplacement »** (à activer ; réunit Add Location et Solar North de SketchUp ;
  `packages/sandbox-planche-model/src/emplacement.ts`, `planche/panneau-emplacement.tsx`) : la position du projet est
  **saisie** (latitude, longitude, altitude facultative, nom libre) et rangée dans les réglages de la Planche
  (`reglages.emplacement`, vérifiés à la relecture), avec le **vrai nord** en degrés depuis l'axe vert, sens horaire. Les
  ombres prennent alors cette latitude et ce nord (`soleil`) ; sans emplacement elles gardent leur réglage de vue.
  Commandes : panneau (Maj + F1), Nord sur l'arête sélectionnée (Maj + F9, une fois la position enregistrée : aucune coordonnée n'est inventée), Flèche du nord (Maj + F12, état de vue).
  Limites déclarées : ni carte, ni terrain, ni recherche d'adresse (ils demandent une source de données qualifiée) ;
  l'heure des ombres est l'heure solaire du lieu, la longitude est enregistrée sans y entrer.
- **Extension « Scripts »** (à activer ; d'après la console Ruby et les extensions libres de SketchUp ;
  `packages/sandbox-planche-model/src/scripts.ts`, `planche/panneau-scripts.tsx`, `planche/scripts-execution.ts`,
  `planche/scripts-planche.worker.ts`) : la personne écrit ou colle un script **JavaScript** qui dessine par l'objet
  `planche` (vingt fonctions : `ligne`, `rectangle`, `boite`, `pousser`, `deplacer`, `copier`, `tourner`, `grouper`,
  `composant`, `effacer`, lectures et `afficher` ; longueurs en mètres, points `[x, y, z]`) — les mêmes opérations du
  modèle que les outils. Trois exemples fournis (rangée de poteaux, escalier droit, aire des faces sélectionnées).
  **Isolement** : un Web Worker neuf par exécution reçoit une copie du modèle ; il est arrêté à la réponse ou d'office
  après 5 s ; son fichier est servi avec une politique de contenu (`apps/api/src/lib/sandbox-scripts-csp.ts` :
  `connect-src 'none'`, `script-src 'self' 'unsafe-eval'`) qui interdit toute connexion et tout code d'une autre origine,
  et le Worker retire en plus au script les fonctions de réseau, de stockage et de chargement de code. Le modèle rendu
  est relu (`lireModelePlanche`) puis appliqué en **un seul pas d'historique**, seulement si le dessin n'a pas changé
  entre-temps ; une erreur donne sa ligne et ne garde rien. « Mes scripts » (20 au plus, 8 000 caractères chacun,
  40 000 au total) suivent le compte : champ `scripts` de `/sandbox/preferences`, colonne `scripts` de
  `sandbox_tool_preferences` ; le serveur les range, il ne les exécute jamais ; un enregistrement sans ce champ les garde.
  Commandes : panneau (Maj + F3), Exécuter (Maj + F6, aussi depuis l'éditeur).
  Limites déclarées : script synchrone seulement (ni attente, ni minuterie) ; au plus 2 000 opérations de dessin par
  script ; la ligne d'une erreur de lecture (syntaxe) n'est pas donnée, ni celle d'une erreur sous Safari ; en
  développement (`vite`), le fichier du Worker est servi sans la politique de contenu, seul le retrait des fonctions
  s'applique, et le mot `import` est refusé partout dans le texte (commentaires compris) ; une boîte dont la base
  touche une face existante est refusée (grouper d'abord) ; pas d'accès aux matières, balises, annotations ni composants dynamiques.

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

## Menu « Sites » (sites de projet, 27 novembre 2026)

Après Fenêtres, le bandeau porte le menu « Sites » (maquette validée) : Nouveau site de projet…, Ouvrir un site de
projet…, Sauvegarder, Sauvegarder sous… | Importer un site…, Exporter le site…. Les sites vivent dans la base dédiée
`sites_*`, servie par `/sites/api` ; le module partagé `lib/sites/menu-sites.tsx` (seul import hors du dossier admis avec
`lib/i18n`, `lib/local-store` et `ChoixLangue`) porte l'état, les actions et les fenêtres, et GeoData offre les mêmes articles.
Un site se rattache à la Planche courante (lien `planche` en base) : à la réouverture, il est retrouvé. Ouvrir ou Importer
pose sa position comme Emplacement (un pas d'historique) et active l'extension au besoin ; un nord absent du site est dit
« non évalué » (la Planche garde 0°). Sauvegarder écrit l'Emplacement (position, nord, altitude, lieu) avec la source
« Emplacement de la Planche ». Comme les autres menus du bandeau, « Sites » n'existe que sur ordinateur.

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
  client d'API général (seul `preferences/client.ts` appelle `/sandbox/preferences` et `/sandbox/preferences/extensions`) ; aucun fichier du Studio n'importe le Sandbox (la carte « 00 Sandbox » est un lien d'adresse).
- Contrôles : `independance.test.ts` (bidirectionnel) et `scripts/frontieres.json` (`npm run typecheck`).
- **Protocole des extensions, version 1.0 — lot 1** (proposition validée par le maître d'ouvrage le 25 novembre 2026,
  Issue #410 ; socle sans interface) : une extension est un **paquet de texte** `fadi-addon/1` (fiche, code JavaScript,
  pages des panneaux — jamais de code compilé), validé strictement par `validerPaquetExtension`
  (`packages/sandbox-planche-model/src/protocole-extensions.ts` : fiche, neuf permissions, commandes avec icône et
  raccourci obligatoires, bornes de 200 000 caractères de code et 1 Mo par paquet, version du protocole acceptée ou
  refusée avec son motif). Le code tourne dans **un Web Worker par extension**, qui reste en vie pendant la séance
  (`planche/extension-planche.worker.ts`, isolé comme celui des scripts par `planche/isolement-worker.ts` et par la même
  politique de contenu) ; l'hôte (`planche/hote-extensions.ts`) le démarre au premier appel, lui adresse demandes et
  événements un par un, et l'arrête au-delà de 5 s pour une demande ou de 1 s pour un événement — l'extension
  redémarre alors à neuf. Messages de trois sortes (demande, réponse, événement), erreurs nommées
  (`ERREURS_PROTOCOLE`) ; une demande de l'extension n'est servie que si elle figure à la table `DEMANDES_EXTENSION`
  (ce lot : le journal seulement). Extension d'essai : `apps/web/e2e/donnees/essai-socle.fadi-addon.json`. Le
  branchement dans la Planche (commandes, panneau, outil, modèle) vient avec les lots suivants : rien n'est encore
  visible, et le Worker des extensions n'est pas encore chargé par l'application.
- **Protocole des extensions, version 1.0 — lot 2** (toujours sans interface) : la Planche sert à une extension la
  **lecture complète du modèle** (« modele.lire » : faces, arêtes, objets du contexte, en mètres), l'**opération
  explicite** (« operation.ouvrir / valider / abandonner », « modele.modifier » avec les dix fonctions de dessin d'un
  script personnel) et la **sélection** (« selection.lire / definir »), chacune derrière sa permission
  (`packages/sandbox-planche-model/src/services-extensions.ts`, `creerServicesExtension`). Une opération travaille sur
  une copie : rien n'est visible avant la validation, qui applique l'ensemble en **un seul pas d'annulation** sous le nom
  donné ; une seconde opération est l'erreur « operation_deja_ouverte » ; une modification sans opération reçoit une
  opération automatique au nom de la commande, validée à la fin de l'appel ; si le dessin a changé entre-temps, rien
  n'est appliqué (« operation_refusee ») ; un appel en échec, hors délai ou arrêté abandonne l'opération. Côté
  extension, chaque demande rend une promesse (`planche.modele.*`, `planche.operation.*`, `planche.selection.*`,
  `planche.demander`) et un traitement peut être `async`. Les fonctions de dessin sont celles des scripts
  (`creerFonctionsPlanche`, extraite de `executerScript` sans changement de comportement). L'hôte reçoit l'accès à la
  Planche par `acces` (`AccesPlanche`) ; le branchement réel (modèle et annulation de la Planche) vient avec le lot des
  commandes. Extension d'essai : `apps/web/e2e/donnees/essai-modele.fadi-addon.json`.
- **Protocole des extensions, version 1.0 — lot 3** (premier lot visible ; images validées par le maître d'ouvrage le
  26 novembre 2026, Issue #435) : **extensions installées, commandes, avis, saisies**.
  - *Base de données* : une extension installée est un paquet rangé en base (`addon_packages`), jamais dans le code.
    L'administrateur l'importe par `POST /admin/addons/paquets` (liste `GET`, retrait `DELETE /admin/addons/paquets/:id`,
    journalisés ; pas encore d'écran) ; le serveur la juge (`jugerImportPaquet`,
    `packages/sandbox-planche-model/src/extensions-installees.ts` : forme du paquet, identifiant non réservé, raccourcis
    avec modificateur ou touche de fonction et pris par personne — Planche, navigateur, autre extension —, icônes en
    SVG), la range, et la rend aux comptes par `GET /sandbox/preferences/extensions` ; il ne l'exécute jamais. Le
    navigateur repasse les mêmes règles à la réception (`lirePaquetsInstalles`).
  - *Interface* : chaque extension installée a sa **famille** dans la liste « Outils », à son nom, avec la pastille
    « extension » ; chaque commande y garde son icône (une image du paquet, `<img>` : rien du dessin ne s'exécute), son
    nom et son raccourci, et l'étiquette de la **barre** de l'extension (`extension:<id>`). Une commande lancée (liste,
    barre, clavier) adresse « commande.<id> » à l'extension avec `{ langue }` ; la Planche lui prête son modèle, sa
    sélection et son historique (`AccesPlanche` dans `Planche.tsx`) : une opération validée est **un pas d'annulation**.
    Une commande à la fois par extension.
  - *Avis et saisies* (permission « messages », `saisies-extensions.ts`) : « message.afficher » pose un avis au-dessus
    de la barre d'état, au nom de l'extension ; « saisie.demander » ouvre une fenêtre dessinée par la Planche (champs
    texte, nombre, choix, case), rend des valeurs validées ou `null` si elle est annulée, et **suspend le délai** de la
    commande tant qu'elle est ouverte. Une commande qui échoue, dépasse 5 s ou ne démarre pas pose un avis rouge qui
    dit ce qui a été gardé (`planche/extensions-installees.tsx`). Les textes d'une extension sont toujours posés comme
    du texte.
  - Limites de ce lot : toute extension installée est offerte à tous les comptes (le choix par compte et l'écran
    d'administration viennent ensuite) ; hors connexion, aucune extension installée n'est offerte.
  - Extension d'essai : `apps/web/e2e/donnees/essai-commandes.fadi-addon.json` ; recette
    `apps/web/e2e/extensions-commandes.mjs` (CI, tranche `planche`).
- **Protocole des extensions, version 1.0 — lot 5** (Issue #441 ; aucun changement visible) : **données attachées**.
  Une extension pose ses propres clés et valeurs sur un objet, sur un composant ou sur le projet (permission
  « donnees ») : `planche.donnees.lire(cible, cle?)`, `.ecrire(cible, cle, valeur)`, `.effacer(cible, cle?)` ; la cible
  est `"projet"`, l'identifiant d'un objet, ou `{ composant: <objet> }`. *Base de données* : ces données font partie du
  dessin et s'enregistrent avec lui — champ `donnees` de l'occurrence et de la définition, `reglages.donneesExtensions`
  pour le projet — rangées par identifiant d'extension : une extension ne voit ni ne touche celles d'une autre. Écrire
  est une modification : opération ouverte ou automatique, un seul pas d'annulation. Les données d'un objet le suivent
  quand il est copié. Valeurs : des données seulement, 4 000 caractères et 100 clés par cible au plus
  (`packages/sandbox-planche-model/src/donnees-extensions.ts`). Essai : commandes « Étiqueter l'objet » et « Lire
  l'étiquette » du paquet d'essai, contrôlées par `apps/web/e2e/extensions-commandes.mjs`.
- **Protocole des extensions, version 1.0 — lot 7, première et deuxième parties** (Issue #445 ; aucun changement
  visible) : **matières, balises, unités, événements, minuteries**.
  - *Matières et balises* : `planche.matieres.lire()` et `planche.balises.lire()` (permission « modele.lire ») rendent
    celles du dessin ; `planche.matieres.appliquer(ids, matiere)` (faces et objets) et
    `planche.balises.appliquer(ids, balise)` (objets) les posent ou les retirent (`null`), comme toute modification :
    une opération, un pas d'annulation. « modele.lire » rend la matière de chaque face, la matière et la balise de
    chaque objet. Une extension ne crée pas de matière : elle emploie celles du dessin (depuis 1.1, elle peut créer une balise, voir plus bas).
  - *Unités* (sans permission) : `planche.unites.lire()` rend les unités et le séparateur décimal de l'interface ;
    `planche.unites.formater(valeur, "longueur" | "aire")` écrit une valeur comme la Planche l'écrit.
  - *Événements* (permission « evenements », `evenements-extensions.ts`) : « projet.ouvert » `{ nom }`,
    « projet.enregistre », « modele.change » `{ ajoutes, modifies, supprimes, origine, tronque }` (origine :
    `utilisateur`, `extension`, `annulation`, `retablissement`) et « selection.change » `{ selection }`, adressés aux
    seules extensions qui les déclarent dans `abonnements`. Un événement n'arrive jamais au milieu d'une opération : il
    attend derrière l'appel en cours de l'extension, avec 1 s pour répondre. Une extension n'est pas prévenue de ses
    propres changements ; une chaîne de réactions entre extensions est coupée au troisième rebond. Une réaction qui
    modifie le dessin le fait dans une opération **discrète**, rattachée au pas d'annulation de l'utilisateur (Ctrl+Z
    défait le geste et la réaction d'un coup) ; après une annulation ou un rétablissement, une telle modification est
    refusée — elle déferait le geste de l'utilisateur. Une réaction arrêtée au délai pose un avis rouge.
  - *Minuteries* (même permission) : `planche.minuterie.dans(delaiMs, fonction)` appelle `fonction` une fois, après la
    commande (10 minutes et 10 minuteries au plus) ; `planche.minuterie.annuler(id)`. Une échéance qui modifie le
    dessin fait son propre pas ; les minuteries sont perdues quand l'extension s'arrête.
  - Extension d'essai : `apps/web/e2e/donnees/essai-evenements.fadi-addon.json` ; recette
    `apps/web/e2e/extensions-evenements.mjs` (CI, tranche `planche`).
  - *Fichiers* (permission « fichiers ») : `planche.fichiers.ouvrir(types?)` rend `{ nom, texte }` ou `null`,
    `planche.fichiers.enregistrer(nom, texte)` rend vrai ou faux. Pendant une commande seulement, une fenêtre à la
    fois, délai suspendu. C'est toujours une fenêtre de la Planche qui s'ouvre, au nom de l'extension : pour ouvrir,
    elle dit les types acceptés et la taille (texte seulement, 1 000 000 caractères au plus) et l'utilisateur choisit
    le fichier — l'extension ne reçoit que celui-là, un autre type est refusé dans la fenêtre ; pour enregistrer, elle
    montre le nom, la taille et les premières lignes, et le fichier part dans les téléchargements si l'utilisateur
    accepte. L'extension ne lit ni ne choisit aucun emplacement. Extension d'essai :
    `apps/web/e2e/donnees/essai-fichiers.fadi-addon.json` ; recette `apps/web/e2e/extensions-fichiers.mjs` (CI,
    tranche `planche`).
  - *Protocole 1.1 — plans reçus (DXF)* (cas 3 du catalogue des extensions, lot 1 ; une version mineure n'ajoute que
    des fonctions : une extension écrite pour 1.0 reste acceptée et garde exactement ce qu'elle avait). **Fichiers
    lourds** : `planche.fichiers.ouvrir(types, { flux: true })` rend `{ nom, taille, lire(debut, longueur), texte() }`
    — le texte (50 000 000 caractères au plus) reste dans la Planche et se lit par morceaux de 500 000 caractères
    (demandes `fichiers.lire`) ; la fenêtre de la Planche annonce alors « 50 Mo au plus ». `planche.fichiers.enregistrer`
    envoie un texte de plus de 1 000 000 caractères par morceaux (`fichiers.preparer`, `fichiers.ajouter`, puis
    `fichiers.enregistrer { nom, jeton }`), sans rien changer pour l'extension. Un jeton ne vaut que pendant sa
    commande, quatre à la fois au plus (`creerReserveFichiers`). Le type `.svg` est admis. **Dessin** :
    `planche.modele.lignes([[a, b], …])` (20 000 segments en une opération, `ajouterSegments` du noyau),
    `planche.modele.arc(depart, milieu, fin, cotes)` et `planche.modele.cercle(centre, rayon, normale, cotes)` (une
    courbe chacun). **Balises** : `planche.balises.creer(nom, couleur)` rend l'identifiant ; une balise du même nom est
    reprise, pas doublée. **Lecture** : chaque arête lue dit sa `courbe` (genre, centre, rayon, normale) ;
    `planche.modele.lire({ portee: "monde" })` rend toutes les faces et arêtes du modèle, en coordonnées du modèle, avec
    le `chemin` d'occurrences et la `balise` héritée ; au-delà de 32 niveaux d'imbrication ou de 50 000 entités, la
    lecture est refusée (jamais rendue en partie), et une courbe déformée par une échelle non uniforme n'est plus
    annoncée (ses segments restent). **Délai** : le temps que la Planche passe à servir une demande ne
    compte plus dans les 5 s d'une commande. Limite connue, mesurée le 27 novembre 2026 : l'insertion dans le noyau
    croît à peu près au carré du nombre de segments (1 000 en 0,6 s, 5 000 en 14 s) ; un gros plan attend
    l'insertion hors du fil principal (D10-F14-027, noyau).
  - *Protocole 1.3 — précision et trame* (cas 3 du catalogue des extensions, lot 2 ; n'ajoute que des fonctions).
    **Unités** : `planche.unites.lire()` rend la précision réelle du projet (`decimales`, choisie dans Info modèle, au
    lieu de 2 figé), les pas d'accrochage (`pasLongueur` en mètres, `pasAngle` en degrés, `null` s'ils sont coupés) et
    le format de cote (`formatCote`) ; `unites.formater` met une longueur à cette précision. **Outil** : chaque
    événement de souris porte aussi `vise`, le point visé avant accrochage (le rayon coupe le plan de travail, le sol
    à défaut), ou `null`. **Annotations** : `planche.cotes.creer(a, b, position, direction)` pose une cote linéaire
    entre deux points du monde (direction « alignee », « horizontale », « verticale », « axe-x », « axe-y » ou
    « axe-z ») ; `planche.textes.creer(ancre, position, texte)` pose un texte avec repère (200 caractères au plus) ;
    l'une et l'autre acceptent une balise existante en dernier argument : la balise cachée, l'annotation l'est aussi ;
    `planche.modele.lire()` dit `dans`, l'objet ouvert en édition (`null` à la racine) ;
    `planche.objets.verrouiller(ids, verrou)` verrouille ou déverrouille des groupes et composants du contexte ;
    `planche.annotations.lire()` rend les cotes linéaires et les textes avec repère, `planche.annotations.effacer(ids)`
    en efface (un identifiant inconnu : rien n'est effacé). Les écritures passent par l'opération ouverte ou automatique, en un seul pas d'annulation (permission `modele.modifier`).
  - *Extension « Échanges DXF »* (cas 3, lot 1, `apps/web/extensions/echanges-dxf/`, protocole 1.1 ; sources, assembleur
    `assembler.mjs` et paquet assemblé, importé par l'administrateur) : trois commandes, chacune avec son icône et son
    raccourci. **Importer un plan DXF** (Ctrl+Alt+Maj+I) : unité lue dans le fichier (`$INSUNITS`, « non indiquée » sinon,
    à choisir), espace objet ou une présentation, pose à plat ou debout sur l'arête sélectionnée ; lignes, polylignes
    (bombes comprises), arcs et cercles en vraies courbes ; un groupe par calque, balisé du nom du calque ; blocs en
    composants (une définition, une occurrence par insertion ; une insertion à l'échelle ≠ 1 est posée éclatée et
    signalée) ; textes, hachures, cotes et autres entités comptés et signalés, jamais perdus en silence ; un seul pas
    d'annulation. Limite : un plan tracé sur de la géométrie libre existante peut la couper ; les morceaux coupés
    rejoignent le groupe du calque. **Exporter en DXF** (Ctrl+Alt+Maj+X) : tout le modèle ou la sélection, unité
    déclarée, un calque par balise, arcs et cercles plans en vrais arcs, sinon en segments. **Plan masse en
    figure-fond** (Ctrl+Alt+Maj+M) : bâti en noir plein, voirie en trait, parcelles en trait fin, chacun choisi par sa
    balise ; SVG en mètres (viewBox, sans échelle imposée) ou DXF (calques BATI, VOIRIE, PARCELLES) ; une face percée
    est remplie sans ses trous, et c'est signalé. Test : `extension-echanges-dxf.test.ts`.
  - *Extension « Trame d'axes »* (cas 3, lot 2, D1-F2-030, `apps/web/extensions/trame-axes/`, protocole 1.3 ; maquettes
    validées le 27 novembre 2026) : l'outil « Trame d'axes » (Ctrl+Alt+A) demande les entraxes en X et en Y (liste
    « 5,40;5,40;7,20 » ou série « 6x5,40 », 40 files au plus par direction), les repères (lettres ou chiffres, jamais
    les mêmes dans les deux directions), l'angle et le débord ; l'aperçu suit le pointeur, l'origine s'accroche (point
    visé arrondi au pas d'accrochage du projet hors accrochage) ou se saisit « x;y ». La trame posée : files en traits
    accrochables (ni case ni disque) dans un groupe verrouillé sur la balise « Trame », bulles (textes avec repère) et
    cotes d'entraxe et totales ; ses réglages sont gardés sur le groupe. « Modifier la trame » (Ctrl+Alt+F) rouvre les
    réglages de la trame sélectionnée et la repose en un seul pas, au même endroit, anciennes bulles et cotes retirées.
    Aucune valeur imposée : les entraxes sont ceux de l'utilisateur.
  - *Panneau* (lot 4, permission « panneau ») : la fiche déclare `panneaux: [{ id, titre, page, icone }]` — l'icône est
    un dessin SVG du paquet, propre au panneau. Le panneau paraît dans la colonne de la Planche, à la suite des siens,
    et s'ouvre à leur place (titre, pastille « extension », note d'isolement). Sa page est un fragment HTML du paquet,
    affiché dans un cadre **sans origine** (`sandbox="allow-scripts"`) et **sans réseau** (règle de contenu
    `CSP_PAGE_PANNEAU`) : elle ne voit ni la Planche, ni le compte, ni l'enregistrement local. Elle ne peut pas davantage
    conduire son cadre vers une autre adresse : `apps/web/index.html` porte la règle `frame-src 'self'`, qui refuse à
    tout cadre de l'application une navigation vers une autre origine. Les styles, scripts et
    dessins du paquet qu'elle cite par leur nom y sont recopiés (`composerPagePanneau`). Dans la page :
    `fadi.action(nom, donnees)` appelle une action nommée de l'extension et rend sa réponse, `fadi.surDonnees(fn)`
    reçoit ses envois, `fadi.langue`. Dans l'extension : `planche.panneau.sur(panneau, action, fn)`,
    `planche.panneau.envoyer(panneau, donnees)` (faux si le panneau est fermé), `planche.panneau.ouvrir(panneau)`.
    Une action est une demande comme une commande (5 s, opération automatique : un seul pas d'annulation) ; il ne
    passe que des données, 20 000 caractères au plus. Extension d'essai :
    `apps/web/e2e/donnees/essai-panneau.fadi-addon.json` ; recette `apps/web/e2e/extensions-panneau.mjs` (CI, tranche
    `planche`).
  - *Outil interactif* (lot 6, permission « outil ») : la fiche déclare `outils: [{ id, libelle, icone, raccourci,
    curseur? }]`. L'outil paraît dans la liste des outils, sous son extension, et s'active comme un outil de la Planche
    (clic ou raccourci) ; son nom s'affiche en tête de la barre d'état. Une seule machine pure sert tous les outils
    d'extension (`outils/outil-extension.ts`, identifiant `extension:<extension>:<outil>`) : elle calcule l'accrochage
    comme les outils d'origine et prépare l'événement, que la Planche transmet à l'extension
    (`outil.<outil>.<evenement>` : activation, desactivation, pause, reprise, annulation, deplacement, appui,
    relachement, clic, double-clic, touche, validation, saisie). Un événement de souris porte `{ point, nature, objet }`
    ; une saisie `{ texte, longueur }`. L'extension les traite par `planche.outil.sur(outil, evenement, fn)` et rend
    une **description** que la Planche relit et dessine : `apercu { segments, pointilles, points, contours, textes }`,
    `etat` (barre d'état), `saisie { libelle, valeur }`, `curseur` (croix, fleche, main, cible), `reference` (départ
    de l'accrochage). L'outil ne dessine jamais lui-même. 1 s par événement ; les déplacements ne s'empilent pas (un en
    cours, le dernier en attente). Un outil qui échoue ou dépasse son délai rend la main à Sélection, avec un avis.
    Extension d'essai : `apps/web/e2e/donnees/essai-outil.fadi-addon.json` ; recette
    `apps/web/e2e/extensions-outil.mjs` (CI, tranche `planche`).
  - *Administration* (onglet « Administration » de la page Extensions, réservé à l'administrateur de la plateforme) :
    la liste réunit les extensions fournies par Fadi (réglables, jamais modifiables) et les extensions ajoutées
    (importées ou créées ici), avec leur état (disponible, expérimentale), leur réglage « installée d'origine » et les
    actions Modifier, Exporter, Retirer (confirmée ; les dessins ne sont jamais touchés). Un fichier importé est
    d'abord **jugé sans rien écrire** (`POST /admin/addons/paquets?essai=1`) : accepté, il montre sa fiche, ses
    commandes et ce qu'il demande avant « Installer » ; refusé, il liste ses motifs. L'éditeur
    (`routes/addons/EditeurExtension.tsx`) crée ou modifie la fiche, les commandes (icône, libellés français et
    anglais, raccourci) et le code ; les contrôles avant d'enregistrer (`controlesPaquet`, logique pure du paquet
    `sandbox-planche-model`) vérifient la fiche, les commandes, les raccourcis libres, la réponse du code à chaque
    commande et l'écriture du code — le code est lu, jamais exécuté dans la page. Le serveur rejuge toujours le
    paquet entier. Chaque compte installe ou désinstalle une extension ajoutée depuis « Disponibles » / « Installées »
    (`GET /sandbox/preferences/extensions/catalogue`, `PUT /sandbox/preferences/extensions/:id`) ; la Planche ne
    reçoit que les extensions installées par le compte (son choix, sinon le réglage d'origine). Recette
    `apps/web/e2e/extensions-administration.mjs` (CI, tranche `planche` ; base jetable, hors préproduction).
- Recette de bout en bout : `apps/web/e2e/sandbox-module.mjs` (CI, tranche `planche`).

## Lots suivants

Harmonisation des raccourcis (lot 6) : lots suivants de la recommandation.
