# Lot Planche L14 — Liste de débit, repères et étiquettes — compte rendu

**Statut : livré le 11 octobre 2026.** Délégation D-203 ; décision D-217 ; fiche `PL-14-01.md` ; programme
`docs/planche/analyses/programme-lots.md` (L14 : la chaîne des profilés L11 à L14 est close).

## Livré

- **Noyau pur** (`debit.ts`) :
  - les pièces du modèle, imbrications comprises, avec leur chemin, leur repère et le milieu de leur axe ;
  - des lignes groupées par section (source complète), longueur et angles, chaque ligne retenant les identifiants
    exacts de ses occurrences ;
  - la masse, seulement avec une source ;
  - le tri par colonne, le CSV au format de l'Atelier et les repères d'une renumérotation.
- **Repères et étiquettes** :
  - `Occurrence.repere`, posé par `numeroterPieces` (un pas) et gardé par une copie ;
  - une étiquette par pièce (`poserEtiquettesPieces`, texte à repère marqué `etiquettePiece`), effacées ensemble ;
  - la masse linéique d'une ligne de catalogue sourcée est copiée dans la source de la pièce à la pose (adaptateur L12).
- **Panneau « Liste de débit »** (« Objets et vue » ☷) :
  - barre d'actions ;
  - portée, préfixe et départ ;
  - masse volumique avec sa source ;
  - table triable, avec une ligne cliquable qui donne la sélection exacte, et un total.
- **Règle d'or** : cinq commandes au registre, avec icône, barre du panneau, raccourci et disponibilité (motifs) :
  - Liste de débit : Alt+Maj+T ;
  - Renuméroter : Alt+Maj+N ;
  - Étiquettes : Alt+Maj+E ;
  - Effacer les étiquettes : Alt+Maj+W ;
  - Exporter : Alt+Maj+X.

## Contrôles

| Contrôle | Résultat |
| --- | --- |
| `npm run typecheck`, `npm test`, `npm run build` | verts |
| `debit-l14.test.ts` (8) : cadre 4 × 3 (2 lignes, 14 m, 45°) ; même désignation, deux longueurs ; deux catalogues → deux lignes, masses distinctes ; masse volumique sans ou avec source ; portée sélection imbriquée ; renumérotation (un pas, copie gardée) et tri ; étiquettes ; CSV | verts |
| `commandes-objets.test.ts` : disponibilités du débit, raccourcis ; `registre-commandes.test.ts` : unicité des icônes et des raccourcis | verts |
| Recette `planche-debit.mjs` (nouvelle, ajoutée à la CI) : Alt+Maj+T ; 2 lignes et 14 m ; masse non évaluée puis 20 kg avec source ; tri ; clic → 2 occurrences exactes ; Alt+Maj+N, E, W ; export CSV | verte |
| Recettes Planche existantes, `atelier-barre.mjs`, `interface-anglais.mjs` | vertes |

## Limites déclarées

- **Sélection depuis la liste** : seules les occurrences du contexte ouvert sont sélectionnées. Celles qui sont dans
  d'autres objets sont comptées dans une note (ouvrir l'objet pour les sélectionner).
- **Repère par ligne** : la renumérotation donne le même repère aux pièces d'une même ligne, puisqu'elles sont
  identiques.
- **Étiquettes** : elles sont posées au milieu de l'axe, 0,3 m au-dessus, et ne suivent pas une pièce déplacée ensuite
  (texte à repère ordinaire).
