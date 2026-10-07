# @parcours/planche-model

Noyau pur du mode **Planche** de l'Atelier (D-164 à D-168) : géométrie libre 3D type SketchUp pour le Web,
grammaire du champ Mesures, inférences et catalogue déclaratif des outils. Aucune dépendance (ni React, ni three,
ni DOM). Spécification : `docs/planche/cahier-planche.md` ; relevés de référence : `docs/planche/reference/`.

| Fichier | Rôle | Fiche |
|---|---|---|
| `src/vecteur.ts` | Vecteurs 3D, rotation de Rodrigues | — |
| `src/geometrie-libre.ts` | Modèle immuable sommets / arêtes / faces, faces automatiques, collage, opérations d'outils | PL-01-01 |
| `src/saisie-vcb.ts` | Analyse du champ Mesures | PL-01-02 |
| `src/inference.ts` | Moteur d'inférence (points, arêtes, axes, parallèle / perpendiculaire, verrous) | PL-01-03 |
| `src/catalogue-outils.ts` | Outils et panneaux relevés (étapes, consignes, modificateurs, statut du relevé) | PL-01-04 |
| `src/outils/` | Machines d'états pures des outils (contrat `machine.ts`, registre `MACHINES`) — lot 2 : dessin ; lot 3 : modification (`pousser-tirer`, `deplacer`, `faire-pivoter`, `echelle`, `decalage`, `suivez-moi`, `retourner`, `diviser`, aides `commun-modif.ts`) | PL-02-01 à PL-02-06, PL-03-01 à PL-03-07 |

Contrôles : `npm test --workspace=@parcours/planche-model`, `npm run typecheck`.
