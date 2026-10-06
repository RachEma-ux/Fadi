# @parcours/planche-model

Noyau pur du mode **Planche** de l'Atelier (D-163, D-164) : géométrie libre 3D type SketchUp pour le Web,
grammaire du champ Mesures, inférences et catalogue déclaratif des outils. Aucune dépendance (ni React, ni three,
ni DOM). Spécification : `docs/planche/cahier-planche.md` ; relevés de référence : `docs/planche/reference/`.

| Fichier | Rôle | Fiche |
|---|---|---|
| `src/vecteur.ts` | Vecteurs 3D, rotation de Rodrigues | — |
| `src/geometrie-libre.ts` | Modèle immuable sommets / arêtes / faces, faces automatiques, collage, opérations d'outils | PL-01-01 |
| `src/saisie-vcb.ts` | Analyse du champ Mesures | PL-01-02 |
| `src/inference.ts` | Moteur d'inférence (points, arêtes, axes, parallèle / perpendiculaire, verrous) | PL-01-03 |
| `src/catalogue-outils.ts` | Outils et panneaux relevés (étapes, consignes, modificateurs, statut du relevé) | PL-01-04 |

Contrôles : `npm test --workspace=@parcours/planche-model`, `npm run typecheck`.
