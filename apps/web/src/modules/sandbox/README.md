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
  grille « ⋯ », « Outils ▾ », recherche, colonne de droite, barre d'actions et clavier le lisent (`registre-interface.test.ts`).
- `pictogrammes/` (lot 3) — pictogrammes SVG : icônes Tabler (`@tabler/icons` 3.49.0, MIT, `LICENCE-TABLER-ICONS.txt`) et
  12 dessins sur mesure (`sur-mesure/`), teintés par famille ; `donnees.ts` est généré
  (`npx tsx apps/web/scripts/generer-pictogrammes-sandbox.ts`) et ne contient que les icônes utilisées.
- Disposition par défaut (lot 4, profil « Standard », proche de SketchUp) : barre gauche de seize outils dans l'ordre de
  SketchUp, grille « ⋯ » par famille, colonne de droite à un clic par panneau (Info modèle en bas, chevron à mi-hauteur
  au survol), Annuler / Rétablir dans la barre du haut, aide à gauche de la barre du bas, Cadrer et zoom + / − (tactile)
  dans la barre d'actions, curseur propre à chaque outil (`pictogrammes/curseur.ts`).
- `preferences/` (lot 5) — personnalisation : profils Standard, Métier (Bois et menuiserie, Volumes et solides) et
  Personnel, favoris, regroupements nommés, « Réinitialiser » (panneau ouvert par « Modifier » dans la grille).
  Préférences enregistrées sur le serveur, par compte (`GET`/`PUT /sandbox/preferences`, table
  `sandbox_tool_preferences`) par un client minimal (`preferences/client.ts`, seul fichier autorisé à appeler le
  serveur) ; copie locale de la dernière version reçue, profil Standard si rien n'a été reçu.
- `routes-sandbox.ts` — adresses : `/sandbox` et l'ancienne `/studio/console/sandbox`, qui y redirige.
- `sandbox.css` (sous `.sandbox-planche`) et `page-sandbox.css` (sous `.sandbox-page`) — feuilles de style isolées.

## Menu de la Planche

Bouton ☰ (Tabler `menu-2`, MIT) en haut de la Planche ; onze entrées, dans cet ordre et ces groupes : Ouvrir une Planche,
Nouvelle Planche… | Enregistrer, Enregistrer sous…, Renommer / niveau de référence… | Supprimer la Planche | Partager,
Exporter en IFC / OBJ / STL, Importer en IFC / OBJ / STL | Informations, Télécharger la vue (PNG).

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

## Frontières

- Le Sandbox n'importe ni le Studio, ni l'Atelier, ni `@parcours/atelier-model`, ni `@parcours/planche-model`, ni le
  client d'API général (seul `preferences/client.ts` appelle `/sandbox/preferences`) ; aucun fichier du Studio n'importe le Sandbox (la carte « 00 Sandbox » est un lien d'adresse).
- Contrôles : `independance.test.ts` (bidirectionnel) et `scripts/frontieres.json` (`npm run typecheck`).
- Recette de bout en bout : `apps/web/e2e/sandbox-module.mjs` (CI, tranche `planche`).

## Lots suivants

Harmonisation des raccourcis (lot 6) : lots suivants de la recommandation.
