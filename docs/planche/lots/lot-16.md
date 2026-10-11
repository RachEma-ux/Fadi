# Lot Planche L16 — Texte 3D : aperçu en volume, alignement, pose sur une face — compte rendu

**Statut : livré le 11 octobre 2026.** Délégation D-203 ; décision D-218 ; programme `docs/planche/analyses/programme-lots.md` (L16).

## Livré

- **Aperçu en volume** : l'aperçu montre les faces mêmes de la pose (dessous, flancs, dessus, trous des lettres), à la
  place de l'ancien contour plat. Les faces du texte sont mises en cache par paramètres (texte, hauteur, plein,
  extrusion), si bien que le survol ne recalcule que le placement.
- **Alignement** (option de la barre d'options) : gauche (défaut, comme avant), centre ou droite par rapport au point de
  pose. Il est gardé d'un texte à l'autre.
- **Pose sur la face survolée** (`planDePose`) :
  - le texte se pose dans le plan de la face, extrudé vers l'extérieur ;
  - le haut des lettres suit la projection de +Z sur la face, et le sens de lecture est `haut × normale` ;
  - sur une face horizontale, la lecture suit +X ;
  - ailleurs, le texte se pose au sol, comme avant.
- La police reste la police géométrique Fadi (P-7).

## Contrôles

| Contrôle | Résultat |
| --- | --- |
| `npm run typecheck`, `npm test`, `npm run build` | verts |
| `outils/texte-3d-l16.test.ts` (3) : aperçu et pose avec le même nombre de faces et la même boîte (± 1e-9), épaisseur visible dans l'aperçu ; alignement centre et droite ; pose sur une face verticale (plan, normale, extrusion vers l'extérieur) | verts |
| Recette `planche-texte-3d.mjs` (nouvelle, ajoutée à la CI) : capture de l'aperçu en volume, pose au sol (épaisseur 0,15), alignement centre, pose sur un mur vertical | verte |
| Recettes Planche existantes (dont `planche-lots-4-6.mjs`, CA-T3D), `atelier-barre.mjs`, `interface-anglais.mjs` | vertes |

## Limites déclarées

- L'alignement n'est proposé que dans la barre d'options, pas dans la boîte « Créer un texte 3D ».
- Sur une face d'un objet fermé, le texte est posé dans le contexte d'édition courant. Il n'est pas rangé dans l'objet
  de la face.
