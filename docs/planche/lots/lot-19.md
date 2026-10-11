# Lot Planche L19 — Persistance, diagnostics, mesures, matrice d'acceptation — compte rendu

**Statut : livré le 11 octobre 2026.** Délégation D-203 ; décision D-221 ; programme `docs/planche/analyses/programme-lots.md` (L19) ;
cahier V1, B5.1 et B5.2 (EX-SAVE, EX-MODEL-02, EX-SEC, EX-ERR, EX-PERF, EX-REL ; cas I-01 à I-10).

**La famille d'extrusion n'est pas déclarée complète.** Voir le verdict de `docs/planche/recette-extrusion-v1.md`.

## Livré

- **Codes de diagnostic stables (EX-ERR-01).** Les quatorze codes du cahier sont dans `diagnostics.ts`.
  - `ErreurPlanche` est une `RangeError` qui garde son message français : les appelants n'ont rien à changer.
  - Ces codes portent les refus de Pousser/Tirer, des balayages d'arêtes, de la couronne, de l'étirement, des liens, de
    Suivez-moi (chemin discontinu ou ramifié, onglet, profil), de la Révolution (axe, domaines) et du contexte.
  - La barre d'état montre le message, puis le recours traduit et le code (`data-diagnostic`). Aucune trace de pile
    n'est affichée.
- **Plafond de complexité (EX-PERF-02).** Le nombre de triangles est estimé avant de générer un Suivez-moi ou une
  Révolution. Au-delà de **2 000**, l'opération est refusée par `EX_COMPLEXITY_LIMIT`, sans géométrie partielle. Ce
  plafond est réglé sur les mesures (voir ci-dessous) et réglable par opération.
- **Contextes transformés (EX-MODEL-02, I-01, I-02).**
  - La distance de Pousser/Tirer, tapée ou visée, est en mètres monde. Elle est ramenée le long de la normale locale de
    la face, ce qui vaut en translation, rotation, échelle uniforme et miroir.
  - Une échelle non uniforme qui fausserait la dimension est refusée par `EX_CONTEXT_TRANSFORM_UNSUPPORTED`, avec un
    modèle inchangé. Une échelle non uniforme qui garde la normale (face alignée) donne la dimension exacte.
  - Le vecteur des balayages d'arêtes, la longueur d'allongement et la distance de couronne (refus si le plan n'est pas
    à l'échelle uniforme) suivent le même principe. La correction par le champ Mesures repart des valeurs monde.
- **Exports honnêtes (EX-SAVE-04, I-07).** Les exports OBJ et STL comptent les objets non étanches (surfaces ouvertes),
  et la Planche les annonce : exportés comme surfaces, sans volume, à fermer avant une impression 3D.
- **Sûreté des commandes (EX-SEC-01, I-05, I-06).** Tests d'API ajoutés :
  - un delta forgé portant une coordonnée non finie (1e400 lu comme Infinity) est refusé ;
  - une référence pendante l'est aussi ; dans les deux cas la révision ne bouge pas ;
  - un compte non membre ne peut rien écrire.
- **Persistance (EX-SAVE-01, 03, I-04).** Pour l'application, la correction immédiate et l'annulation, l'empreinte
  après delta est celle du modèle attendu ; la relecture redonne la même empreinte.
- **Mesures (EX-PERF-01).** Elles sont consignées dans `docs/planche/mesures/l19-extrusion.md`, pour la machine de
  bureau de référence, en noyau seul. Les mesures sur téléphone réel n'ont pas été faites.
- **Matrice d'acceptation V1** : `docs/planche/recette-extrusion-v1.md`, une ligne par cas du cahier, avec preuve, lot et
  état.

## Contrôles

| Contrôle | Résultat |
| --- | --- |
| `npm run typecheck`, `npm test`, `npm run build` | verts |
| `integration-l19.test.ts` (14) : codes, plafond, quatre contextes (I-01), refus non uniforme (I-02), face alignée, round-trip d'empreinte, deltas forgés, exports, message détachable | verts |
| `atelier-planches.test.ts` : delta forgé, référence pendante, non-membre | verts |
| Recette `planche-diagnostics-l19.mjs` (nouvelle, ajoutée à la CI) : refus codé `EX_DISTANCE_INVALID` avec recours, aucun pas, face gardée (A-10) | verte |
| Recettes Planche existantes, `atelier-barre.mjs`, `interface-anglais.mjs` | vertes |
| Mesures de bureau | consignées ; budgets de balayage **non tenus** |
| Mesures sur téléphone réel | **non exécutées** (aucun appareil accessible) |

## Limites déclarées et suite

- P-05 à P-07 (Étirement à plis) relèvent du lot L20.
- I-10 reste ouvert : il faut les mesures sur téléphone, puis l'optimisation du balayage (index spatial à l'insertion,
  travail hors du fil principal) et de nouvelles mesures avant de relever le plafond.
- Les cas partiels sont listés dans la matrice : A-09, A-12, F-02, F-03, T-02, T-04, I-03, I-05, I-08.
- Le Texte 3D n'est pas soumis au plafond : sa complexité reste bornée par sa police et sa boîte de saisie.
