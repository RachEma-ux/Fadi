# Module : Sandbox

Responsabilité : la Planche — géométrie libre 3D — à soi seule (`/sandbox`) : aucun projet, aucun serveur, aucun lien
avec la Planche de l'étape 10.

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
- `routes-sandbox.ts` — adresses : `/sandbox` et l'ancienne `/studio/console/sandbox`, qui y redirige.
- `sandbox.css` (sous `.sandbox-planche`) et `page-sandbox.css` (sous `.sandbox-page`) — feuilles de style isolées.

## Frontières

- Le Sandbox n'importe ni le Studio, ni l'Atelier, ni `@parcours/atelier-model`, ni `@parcours/planche-model`, ni le
  client d'API ; aucun fichier du Studio n'importe le Sandbox (la carte « 00 Sandbox » est un lien d'adresse).
- Contrôles : `independance.test.ts` (bidirectionnel) et `scripts/frontieres.json` (`npm run typecheck`).
- Recette de bout en bout : `apps/web/e2e/sandbox-module.mjs` (CI, tranche `planche`).

## Lots suivants

Interface proche de SketchUp, préférences sur le serveur, harmonisation des
raccourcis : lots suivants de la recommandation.
