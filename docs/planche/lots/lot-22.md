# Lot Planche L22 — Effilement, torsion et loft (méthodes de Suivez-moi) — compte rendu

**Statut : livré le 11 octobre 2026.** Délégation D-203 ; décision D-224 ; programme `docs/planche/analyses/programme-lots.md` (L22,
hors V1, inclus par D-202). Référence des écarts : `docs/planche/reference/ecarts-fadi-extrusion.md` § 3.

## Livré

- **Noyau** (`geometrie-libre.ts`).
  - `effiler(m, profil, { longueur, echelle, torsion, segments, bouchons })` balaie le profil (trous compris) le long de
    sa normale. La section passe linéairement de l'échelle 1 à `echelle` et tourne de `torsion` degrés autour du centre du
    profil. Sans torsion : un tronçon, parois planes ; avec torsion : 12 tronçons par défaut, parois gauches coupées en
    triangles.
  - `loft(m, profilA, profilB, { segments })` relie deux faces sans trou de même nombre de sommets. Les sommets sont
    appariés dans le même sens de parcours, en partant du couple le plus proche. Les deux profils sont consommés et
    remplacés par la coque fermée.
  - Refus codés (diagnostics L19) : longueur nulle, échelle ≤ 0, tronçons hors de 1 à 512, profils identiques ou
    incompatibles, complexité au-delà du plafond de 2 000 triangles.
- **Outil Suivez-moi** : deux méthodes de plus, **Effilement** et **Loft**. Alt seul fait le tour Chemin → Révolution →
  Effilement → Loft. Il n'y a ni outil ni raccourci de plus : la règle d'or reste tenue par Suivez-moi (icône, barre,
  Maj + F).
  - Effilement : survol du profil → aperçu ; clic → un pas « Effilement ». Le champ Mesures prend
    « longueur ; échelle ; torsion » (un champ vide garde sa valeur). Retapé juste après, il recalcule depuis le profil
    d'origine en remplaçant le dernier pas.
  - Loft : clic sur le premier profil, puis sur le second (aperçu au survol) → un pas « Loft ». Le champ Mesures prend les
    tronçons « Ns » ; retapés juste après, ils corrigent le même pas.
- Textes traduits (`messages.ts` FR / EN, `en.json`).

## Contrôles

| Contrôle | Résultat |
| --- | --- |
| `npm run typecheck`, `npm test`, `npm run build` | verts |
| `effiler-loft-l22.test.ts` (5) : tronc de pyramide exact, torsion de 90° (sommet tourné, coque fermée), refus (échelle nulle, plafond), loft vers un carré réduit (volume du tronc), refus de profils incompatibles | verts |
| `effilement-loft-outil.test.ts` (6) : tour des méthodes par Alt, aperçu sans pas, correction « 2;;0 » puis « ;1 », refus, loft en deux clics, « 4s » | verts |
| `revolution-outil.test.ts` : Alt après Révolution mène désormais à Effilement | vert |
| Recette `planche-effilement-loft.mjs` (nouvelle, ajoutée à la CI) | verte |
| Recettes `planche-epaissir.mjs` (L21) et `planche-etirement-plis.mjs` (L20), lancées sur cette branche | vertes |
| Recettes Planche existantes, `atelier-barre.mjs`, `interface-anglais.mjs` | vertes |

## Limites déclarées

- Effilement et torsion suivent la normale du profil (chemin droit). Un effilement le long d'un chemin quelconque n'est
  pas livré.
- Loft : deux profils seulement, sans trou, même nombre de sommets, interpolation linéaire (pas de rails ni de courbes
  de guidage).
- Les parois tordues sont des triangles : le volume converge vers la valeur exacte quand les tronçons augmentent.
