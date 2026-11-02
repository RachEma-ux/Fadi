# Recette déléguée du pilote Studio — 25 octobre 2026

**Nature.** Recette des trois parcours (R.3-01) jouée par le chef de projet, **par délégation du maître d'ouvrage**
([ADR-STUDIO-PILOTE-01](../../../continuity/decisions/ADR-STUDIO-PILOTE-01.md), P-08 et P-09). Ce n'est pas un constat du
maître d'ouvrage en personne : il peut la rejouer avec le [guide](RECETTE-UTILISATEUR-PILOTE.md).

**Où et comment.**
- Lieu : préproduction jetable, montée comme la CI (PostGIS 16, API servant le build, Mailpit), sur `main` du 25 octobre
  et les correctifs de cette branche.
- Navigateur : Chromium, en bureau 1280 × 900 et en gabarit téléphone 390 × 844, avec un rendu logiciel. Aucun appareil
  physique ni GPU réel n'a été utilisé (DEC-13).
- Méthode : les gestes du guide sont exécutés par les recettes de [RECETTE-PILOTE-2026-10-25.md](RECETTE-PILOTE-2026-10-25.md).
  Leurs captures d'écran ont ensuite été examinées une à une : accueil, planche 2D, volume libre et coupe, mur et
  ouverture en 3D, révision historique, téléphone.

## Résultat par parcours

| Parcours | Verdict | Constats |
|---|---|---|
| **A — dessin 2D seul, jusqu'à la publication** | **Conforme** | L'entrée Studio de la barre mène à l'accueil : reprise, projets, nouvelle étude, sans redirection. Sur la planche 2D, ligne et cote sont accrochées ; une cote dont l'objet a été supprimé est annoncée « à résoudre ». L'enregistrement et la réouverture dans une nouvelle session sont exacts. La publication « Dessin 2D indépendant » produit SVG, DXF et feuille PDF, sans IFC, avec des empreintes vérifiées. Un conflit de révision est annoncé sans rien écraser. |
| **B — 3D directe, jusqu'à la vue et la coupe** | **Conforme au guide, avec une réserve** | Boîte et prisme libres sont posés et déplacés sans dessin 2D préalable. La coupe à z = 1,5 m donne ses contours. **Réserve** : l'édition de faces n'existe pas dans Studio (TEST-002 « En cours ») ; le parcours s'arrête au volume, au déplacement et à la coupe. |
| **C — objets associés, jusqu'à la revue et la publication** | **Conforme au guide, avec deux réserves** | Pour un mur de 6 × 3 × 0,2 m et une ouverture de 1 × 2,1 m, le métré donne 3,600 / 0,420 / 3,180 m³. Après élargissement à 1,20 m depuis la vue 3D, il donne 3,096 m³, et la révision historique reste lisible. Le manifeste multi-sources est approuvé sur l'ensemble. **Réserves** : la modification acceptée du même mur en 2D puis en 3D n'est pas recettée (TEST-003) ; les étapes C sont jouées dans plusieurs recettes, pas en une seule séance. |

**Aucun défaut éliminatoire n'a été constaté pendant cette recette.** Pour rappel, les défauts éliminatoires définis à G0
sont : double autorité, corruption de référence, accès entre projets, doublon de commande, écrasement de conflit,
publication sous l'approbation d'un autre contenu. L'absence de défaut ne vaut pas preuve de leur absence : plusieurs
contrôles qui la démontreraient restent partiels (BLOC-01, BLOC-02, BLOC-04 ; voir `STATUS.md`).

## Défauts trouvés et corrigés pendant la recette

| Défaut | Correctif | Preuve |
|---|---|---|
| Après une panne réseau du moteur de la planche, « Réessayer » ne relançait aucun téléchargement. | `reessayerPlanche` (PR #309) | `studio-chargement`, étape 8 |
| Chaque fermeture de la vue 3D retenait un moteur de rendu entier, environ 37 Ko par cycle. three.js abonne chaque moteur à sa table DFG partagée sans jamais le désabonner. | `texturesPartagees` et `libererTexturesPartagees` (`vue3d/ressources-gpu.ts`) | `studio-memoire` ; `ressources-gpu.test.ts` |
| Les contrôles de caméra restaient accrochés au `document` après la fermeture, parce que React détache le DOM avant les nettoyages de `useEffect`. | Déconnexion des contrôles dans un `useLayoutEffect` (`Vue3DStudio.tsx`) | `studio-memoire` : 3 écouteurs avant et après 80 cycles |

La même fuite de table DFG concerne vraisemblablement les autres vues three.js de Fadi : vue 3D de l'Atelier, Planche,
Sandbox. Elles sont hors du périmètre Studio et n'ont pas été mesurées.
