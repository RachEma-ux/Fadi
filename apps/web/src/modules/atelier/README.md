# Module : Atelier Architectural

Responsabilité : modèle du bâtiment, dessin, sélection, édition et vues.

Depuis la bascule (lot 4 du chantier DrawAll V4.1, `docs/atelier-cahier-des-charges.md`), l'Atelier est reconstruit
sur le modèle typé de `packages/atelier-model` : un seul Atelier dans le produit, ouvert par `?module=atelier` et aux
étapes 10 / 11. L'ancien moteur extrait du prototype (Design Atelier V14-3) et son magasin clé / valeur ont été
supprimés ; les projets qui n'avaient que lui ont été repris dans le modèle typé par la migration de bascule
(`apps/api/src/db/bascule.ts`), sans perte.

## Organisation

- `bus/atelier-client.ts` — bus de commandes : aperçu immédiat par le même réducteur que le serveur, file des lots
  (Dexie), envoi ordonné, rebase sur 409, lots « conflit » / « refusé » à trancher, annuler / rétablir (journal du
  serveur, pile locale tant qu'un lot n'est pas parti), cache local du modèle pour l'ouverture hors ligne.
  `bus/etat-projet.ts` expose l'état de la file à l'en-tête du projet (indicateur, bandeau des conflits).
- `nouveau/AtelierNouveau.tsx` — cinq repères : barre (niveau, Plan / 3D, annuler / rétablir, palette, affichage,
  accrochages, cadrer, exports, Harmonie à l'étape 10, état), barre d'outils, navigateur (site, niveaux, calques,
  objets), zone de travail, inspecteur et panneau des modifications. `etat-ui.ts` porte l'état d'affichage (jamais
  dans le modèle, R10).
- `nouveau/plan2d/` — plan SVG : rendu par classe, accrochages, saisie de précision, outils de tracé (lots de
  commandes de l'annexe B), sélection, manipulation directe.
- `nouveau/vue3d/` — three.js (WebGL2, WebGPU en option), chargé seulement à l'ouverture de la vue 3D ; les maillages
  viennent de `atelier-model/projection/maillage.ts`.
- `nouveau/exports.ts` — exports de travail : DXF du niveau, SVG du plan, CSV des quantités, modèle JSON, PNG de la vue
  3D, téléchargés et enregistrés au catalogue des documents.
- `nouveau/documents/` — mode « Documents » (lot 5) : vues (plan par niveau avec hauteur de coupe, coupe, façade avec
  visibilité par faces, plan de masse, détail), feuilles (formats A0–A4, cartouche, placement automatique) et tableaux
  (pièces, portes, fenêtres, murs, composants, synthèse). Vues et feuilles sont des définitions du modèle ; l'aperçu
  est calculé dans le navigateur par `@parcours/atelier-model` (`documents/`), les fichiers PDF / DXF / SVG / CSV sont
  produits par le serveur à la révision courante (`GET /projects/:id/documents/atelier/…`) et inscrits au catalogue ;
  fraicheur vue par vue (non produite, à jour, périmée, « dessin inchangé »).
- `nouveau/panneaux/Complements.tsx` — inspecteur du lot 5 : phase, blocs et composants (créer, propriétés héritées),
  contraintes d'esquisse (ajout, degrés de liberté, suppression). Outils ajoutés : garde-corps, toiture en pente,
  « Placer un bloc » ; les cotes posées sur des objets leur sont rattachées (cotes associatives, « à réparer » si
  l'objet visé est scindé ou supprimé).
- `AtelierHarmonyPage.tsx` — sous-page « Harmonie du bâtiment » de l'étape 10 (V8.4) ; `DesignReview.tsx` — bilan
  Harmonie du bâtiment conçu (flow-v62), calculé côté serveur depuis la projection du modèle typé.

## Référence protégée de l'exemple

Sur la référence P.118 (`exampleMode = "reference"`), la première modification validée crée la copie de travail
(`POST /projects/:id/copies`, nom « copie de travail · Atelier »), y applique le lot et bascule l'écran sur elle,
même module et même étape ; l'original n'est jamais écrit.

## Accessibilité

Plan SVG avec `role="application"`, barre d'outils `role="toolbar"`, palette en `combobox` / `listbox`, raccourcis
uniques, focus visible, 390 px avec un panneau à la fois. axe-core passe sur l'Atelier monté (ordinateur et
téléphone) dans les deux scénarios de recette ; le dessin 3D n'est pas audité automatiquement.

L'onglet « Hypothèses & MapTiler » du bilan reçoit l'observation déclarée du contexte extérieur ; « Collecter
l'altitude indicative du centre » appelle MapTiler depuis le navigateur avec la clé de l'utilisateur
(`lib/maptiler.ts`), jamais par le serveur.
