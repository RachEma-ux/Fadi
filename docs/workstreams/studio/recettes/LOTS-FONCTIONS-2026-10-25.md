# Lots de fonctions Studio — 25 octobre 2026

Le dossier G4 recense des fonctions absentes. Elles sont construites ici par lots, sous délégation du maître d'ouvrage
([ADR-STUDIO-PILOTE-01](../../../continuity/decisions/ADR-STUDIO-PILOTE-01.md)). Chaque lot passe par une PR, avec une
CI verte avant sa fusion. Une obligation ne passe à « Vérifié » que si un test exécuté contrôle son critère exact.

## Lot F1 — géométrie 3D

Livraison :
- **direction d'extrusion** :
  - extrusion 2D : `+z` ou `-z` ;
  - prisme : un vecteur saisi, non nul, hors du plan du profil ;
  - dans les deux cas, la direction est demandée et jamais proposée d'office.
- **relation du prisme à sa polyligne source**, choisie explicitement à la création :
  - « référence liée » : le prisme est recalculé dans la même révision que sa source, ou passe « à résoudre » si la
    source disparaît ;
  - « associé » : le lien est contrôlé, et toute mise à jour est explicite ;
  - « copie indépendante » : aucune propagation.
- **édition des faces** :
  - pousser ou tirer une face plane d'une boîte ou d'un prisme droit ;
  - pivoter un solide autour de l'axe vertical.
- **division d'une face cotée** : sur un prisme lié, c'est l'arête de la source qui est divisée. Les cotes sont
  réattachées quand c'est prouvé ; sinon, elles passent « à résoudre ».

Preuves :
- recette `apps/web/e2e/studio-faces.mjs`, jouée en CI (30 contrôles) ;
- tests du modèle `packages/atelier-model/src/studio/composition/f1-geometrie.test.ts` (17 tests) ;
- `studio-navigation` : TEST-002 pousse désormais une face.

Limites déclarées :
- la rotation se fait seulement autour de l'axe vertical, et aucun outil d'échelle 3D n'est ajouté ;
- l'édition de groupe n'existe pas ;
- sont refusés explicitement : le décalage d'une face oblique, la division de la base ou du sommet, et la division d'un
  prisme « associé » ;
- aucune cote ne vise un solide libre : TEST-007 est prouvé par les cotes de la polyligne source d'un prisme lié.
