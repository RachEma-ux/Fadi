# Lot Planche 10a — Pousser/Tirer complet : nombres, état, Jusqu'à une face, aperçu troué — compte rendu

**Statut : livré le 10 octobre 2026.** Délégation D-203 ; décision D-210 ; programme `docs/planche/analyses/programme-lots.md`
(L10, premier sous-lot) ; cahier V1, B1.4 et B2.2 (EX-NUM, EX-STATE-01 et 03, EX-PT-02, EX-PT-06, EX-PREV-02 ; cas A-10,
A-11, P-04, P-09, P-13, P-16, P-17).

## Découpage du lot 10

L'analyse d'écart entre la V1 et le code a conduit à découper L10 en trois sous-lots :
- **L10a** (ce lot) : nombres, état et étendue de Pousser/Tirer ;
- **L10b** : cycle de vie des liens d'extrusion, Suivez-moi complet et aperçu par modèle candidat ;
- **L10c** : Révolution, comme méthode de Suivez-moi.

## Livré

- **Gardes numériques (EX-NUM-04, P-17).** `pousserTirer`, `tuberFace`, `etirerAretes`, `couronne` et `allongerArete`
  refusent une distance NaN ou ±∞. Ce cas entrait jusqu'ici dans la géométrie : `Math.abs(NaN) < EPS` est faux. Une
  distance non nulle sous la tolérance de modélisation (1 µm) est refusée avec son motif.
- **Une opération refusée garde sa source (EX-STATE-01, A-10).** Après une valeur nulle ou un refus du noyau, la face ou
  l'arête reste acquise, avec la valeur tapée : on corrige sans recliquer. **Échap** annule l'aperçu sans pas
  d'historique et rend la **sélection d'avant l'opération**.
- **Aperçu périmé (EX-STATE-03, A-11).** Le modèle peut changer sous une opération en cours : annuler, rétablir, mise à
  jour venue du serveur. L'outil repart alors de zéro, et la barre d'état dit que l'aperçu est abandonné et ne peut plus
  être validé.
- **Distance signée et Inverser le sens (EX-NUM-02, P-16).**
  - Le champ Mesures montre la distance signée, négative pour creuser.
  - L'option **Sens** (Direct ou Inversé) de la barre d'options, ou l'action `reverse-direction`, applique la valeur tapée
    de l'autre côté, une seule fois : le sens revient à Direct après l'opération.
- **Jusqu'à une face (EX-PT-02, P-04).**
  - Nouvelle option **Étendue** : Distance ou Jusqu'à une face. Avec la seconde, survoler une face parallèle affiche la
    distance signée exacte (au millimètre près) avant la validation, et un clic valide.
  - Refus nommés : face non parallèle, face source elle-même, face d'un autre contexte.
  - L'option est réservée à l'extrusion normale d'une face (V1), et passe par l'action `set-extent`.
  - Noyau : `distanceJusquAFace`.
- **Aperçu d'une face trouée (EX-PREV-02, P-09).** L'aperçu porte les trous (`apercu.trous`) et la vue les rend. En
  Surface ouverte, les parois de chaque boucle s'affichent : un anneau donne deux tubes.
- **Bande annulaire sur boucle concave (EX-PT-06, P-13).** Un décalage dont deux segments non voisins se croisent est
  refusé en nommant ces segments, au lieu de produire une géométrie fausse (`recoupementContour`).

## Contrôles

| Contrôle | Résultat |
| --- | --- |
| `npm run typecheck`, `npm test`, `npm run build` | verts |
| `pousser-tirer-l10a.test.ts` (11) : P-17, A-10, P-16, P-09, P-04, P-13 | verts |
| Recette `planche-pousser-l10a.mjs` (nouvelle, ajoutée à la CI) : A-10, A-11, P-16 | verte |
| Recettes Planche existantes, `atelier-barre.mjs`, `interface-anglais.mjs` | vertes |

## Limites déclarées

- L'aperçu reste tracé par l'outil, avec désormais les trous. L'aperçu calculé par le noyau sur un modèle candidat, avec
  numéro de génération (EX-PREV-01, 03), arrive avec Suivez-moi au lot 10b, qui en a besoin.
- Au lieu d'être surlignée dans la vue, la région qui se recoupe (P-13) est désignée par les numéros de ses segments
  dans le message.
- « Distance par côté » avec le total (P-11) et l'option « garder le lien » sont au lot 10b (liens).
