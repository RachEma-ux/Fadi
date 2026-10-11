# Lot Planche L21 — Extrusion multi-faces et Épaissir — compte rendu

**Statut : livré le 11 octobre 2026.** Délégation D-203 ; décision D-223 ; programme `docs/planche/analyses/programme-lots.md` (L21,
hors V1, inclus par D-202). Référence des écarts : `docs/planche/reference/ecarts-fadi-extrusion.md`.

## Livré

- **Pousser/Tirer de plusieurs faces** (`pousserTirerFaces`).
  - Si la face cliquée fait partie d'une présélection de plusieurs faces, elles sont toutes poussées ou tirées, chacune
    selon sa normale, de la même distance, en une seule opération et un seul pas.
  - Une distance retapée juste après corrige l'ensemble.
  - Cela vaut en mode Normal ou Conserver la face de départ. Surface ouverte, Étirement et « Jusqu'à une face » restent à
    une face.
- **Épaissir** (`epaissir`, outil `epaissir`) change une face, ou une surface ouverte faite de plusieurs faces, en volume
  fermé.
  - Chaque sommet est décalé pour que chacune de ses faces avance exactement de l'épaisseur. Les faces décalées restent
    planes et les coins sont en onglet.
  - Des parois ferment les arêtes de bord, et la coque regarde vers l'extérieur.
  - L'épaisseur suit le curseur ou se tape. Elle est en mètres monde, ramenée au contexte d'édition (EX-MODEL-02).
  - Refus nommés : surface non variété, sommet où l'épaisseur est intenable, épaisseur nulle ou non finie.
  - Règle d'or : icône ▥, raccourci Alt + Maj + J, barre Volumes · Créer.

## Contrôles

| Contrôle | Résultat |
| --- | --- |
| `npm run typecheck`, `npm test`, `npm run build` | verts |
| `extrusion-multi-l21.test.ts` (7) : deux rectangles poussés en une opération ; refus sans face ; une face épaissie (0,2 m³ fermé) ; tube carré sans fond épaissi (0,44 m³, coins en onglet) ; refus aux faces opposées ; outils Pousser/Tirer (présélection, correction) et Épaissir | verts |
| Règle d'or (registre, barres, raccourcis, icônes uniques) | verts |
| Recette `planche-epaissir.mjs` (nouvelle, ajoutée à la CI) | verte |
| Recettes Planche existantes, `atelier-barre.mjs`, `interface-anglais.mjs` | vertes |

## Limites déclarées

- L'aperçu de Pousser/Tirer à plusieurs faces ne montre que la face cliquée. L'opération, elle, porte sur toutes.
- Épaissir n'élague pas les recouvrements : sur une surface très courbe, une épaisseur trop forte peut faire se croiser
  les faces décalées. Un sommet à plus de trois plans non concourants est refusé.
