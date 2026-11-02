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

## Lot F3 — échanges

Livraison :
- **import IFC** (STEP IFC2X3 et IFC4 à IFC4X3, lecteur écrit pour Studio, sans dépendance).
  - L'unité est lue dans le fichier. Si elle est absente, rien n'est importé et l'unité reste « non évaluée ».
  - Murs, ouvertures, dalles et niveaux deviennent natifs.
  - Les pertes sont comptées par type et par motif.
- **état « non natif » explicite** : toute autre entité est conservée dans le document avec son type, son GlobalId, sa
  raison et son empreinte.
  - Elle n'est pas éditable comme un objet natif.
  - Elle est exclue du métré avec mention, et exclue des exports.
  - L'import DXF fait de même.
- **modèle externe**, déclaré avec son auteur, sa discipline, son format, sa version, son unité et sa transformation.
  - Le serveur le relit dans un document à part et le compare à la révision courante.
  - Il est accepté ou refusé par un rôle habilité ; la décision est journalisée et définitive. Un refus exige un motif.
  - La variante n'est jamais modifiée.

Preuves : `studio-echanges` (CI), `import-ifc.test.ts` (20 tests), `modeles-externes.test.ts`,
`studio-modeles-externes.test.ts` (API).

Limites :
- seules les extrusions verticales sont traduites ; le reste devient non natif ;
- pour les modèles externes, seul le format IFC est pris en charge, et ils ne sont pas repris par l'archive du projet ;
- les éléments non natifs ne s'affichent pas sur la planche 2D.

## Lot F4 — collaboration et traçabilité

Livraison :
- **délégation d'approbation**, qui porte une portée, une période, un délégant, un délégué et un motif.
  - Elle est auditée et revérifiée par le serveur à chaque emploi.
  - Un approbateur absent ne vaut jamais accord.
- **rapprochement automatique des observations** à chaque contrôle de révision, par identité, source et règle.
  - Un objet disparu est marqué comme tel, sans clôture automatique de l'observation.
- **journal de corrélation** `commandId` / `jobId` côté navigateur.
  - Un secret ou une géométrie fait échouer le contrôle et bloque l'export.
- **contrôles de traçabilité des fiches EX** (EX-100, 102, 103, 104) sur les données réelles du dépôt.
  - Les écarts réels sont publiés dans
    [TRACABILITE-EX.md](../../../ai-team/reports/claude-f4-tracabilite/TRACABILITE-EX.md) : aucune des 616 preuves
    d'exécution ne peut fonder une conformité, et aucun des 8 principes de REF-01 n'est couvert par une chaîne complète.

Preuves : `studio-delegations.test.ts`, `studio-observations-rapprochement.test.ts`, `journal-correlation.test.ts`,
`studio-tracabilite-ex.test.ts`, et les recettes `studio-publication` et `studio-observations`.

Limites :
- la corrélation existe côté navigateur seulement ;
- délégations et rapprochements ne sont pas repris par l'archive ;
- le circuit de revue externe n'utilise pas les délégations.

## Lot F5 — rendu et index

Livraison :
- **index spatial incrémental** (insertion, suppression, mise à jour), branché sur la sélection et l'accrochage.
  - Il est éprouvé sur 6 × 600 mutations contre le parcours linéaire.
- **dégradation sous charge de la vue 3D** : résolution à 75 % puis 50 %, puis anti-crénelage coupé.
  - Le retour se fait par paliers, et un indicateur s'affiche pendant la dégradation.
  - Accrochage et tolérances restent inchangés ; un test unitaire le vérifie.
- **comparaison SVG / Canvas / GPU** sur S1 à S3, avec un rapport de fidélité, d'accessibilité et de latence, sans
  seuil.
  - DEC-08, qui retient SVG, est confirmée sans bascule.
- **inventaire des types 3D avancés** : sommets et arêtes, groupe, composant, booléen, courbe exacte 3D, surface
  complexe, BRep fournisseur.
  - Tous sont « Non disponible » tant qu'aucun test ne les couvre.
  - Un test échoue si l'un d'eux est annoncé disponible sans test.

Preuves : `studio-rendu` (CI), `index-incremental.test.ts`, `qualite-rendu.test.ts`, `comparaison-moteurs.test.ts`,
`couverture-3d.test.ts`.

Limites :
- la vue 3D ne calcule aucune ombre, donc le palier « ombres » est sauté ;
- le GPU mesuré est un rendu logiciel (SwiftShader), et les appareils réels ne sont pas évalués.

## Lot F2 — noyau exact

Livraison :
- **outil « Booléen exact »** : union, différence et intersection de deux solides (boîtes, prismes droits, solides
  exacts), calculées par le noyau exact.
  - Le noyau tourne dans un Worker chargé seulement à l'activation de l'outil, jamais à l'ouverture.
  - Le résultat va dans `exacts`, avec ses deux opérandes conservés (R15) ; l'engagement est explicite.
  - Le serveur recalcule chaque booléen et fait autorité ; une empreinte différente est refusée (`exact-mismatch`).
- **aperçu provisoire, jamais engagé** : il est confirmé par le calcul exact, ou refusé au-delà de la tolérance.
- **résultat d'une ancienne révision** : marqué périmé, il n'est pas engageable.
- **panne du Worker** :
  - erreur affichée et attentes résolues ;
  - aucune relance silencieuse : la relance est contrôlée ;
  - le document reste identique.
- **suivi du WASM** : taille reçue, instance unique, durée de chargement ; 50 ouvertures sans croissance.
- **contrôle de licence** du binaire distribué (15 points : SHA-256, version, LGPL-2.1-only, remplacement, chargement
  séparé), joué en CI.
- **TR-EX-032** : des espions prouvent que le Manager ne calcule ni ne valide aucune géométrie.

Preuves : recette `studio-exact` (CI), `f2-booleen.test.ts`, `booleen-session.test.ts`, `licence-occt.test.ts`,
`manager-exact.test.ts`, `studio-exact.test.ts` (API). Le booléen est désormais « disponible » dans l'inventaire A.3-08.

Limites :
- les prismes obliques sont refusés comme opérandes ;
- un solide exact ne se déplace pas et ne s'édite pas par ses faces ;
- les solides exacts ne sont exportés ni en IFC, ni en SVG, ni en DXF : ils sont comptés « non couverts » ;
- les allocations internes au WASM ne sont pas mesurées (TR-EX-062 reste partiel).
