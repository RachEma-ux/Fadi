# Lot Planche 10b — Cycle de vie des liens d'extrusion — compte rendu

**Statut : livré le 10 octobre 2026.** Délégation D-203 ; décision D-211 ; programme `docs/planche/analyses/programme-lots.md`
(L10) ; cahier V1, B2.3 (EX-LINK-01 à 05, EX-NUM-03 ; cas L-01 à L-05, P-11).

## Nouveau découpage du lot 10 (D-211)

Pour garder des lots livrables seuls, le reste du lot 10 est re-découpé :
- **10b** (ce lot) : liens d'extrusion ;
- **10c** : Suivez-moi complet et aperçu par modèle candidat ;
- **10d** : Révolution.

## Livré

- **Création du lien explicite (EX-LINK-02).**
  - L'option `lier` est ajoutée à `etirerAretes`, `couronne` et `tuberFace`. Absente, elle vaut `true`, comportement
    historique ; `false` crée une surface indépendante.
  - Pousser/Tirer a une option **Lien** : « Liée aux arêtes » par défaut, ou « Indépendante ». L'action
    `set-option keep-source-link` y donne accès aussi.
  - Dans un groupe, « Liée » n'est pas proposée, et la consigne dit que les liens automatiques n'existent qu'à la racine
    de la Planche (L-02). La surface reste valide et indépendante.
- **Recalcul invalide (EX-LINK-03, L-04).** Si la modification d'une source rend sa surface liée impossible à recalculer
  (contour devenu gauche, décalage retourné…), la modification est **refusée** et le modèle précédent est conservé. Avant
  ce lot, le noyau avalait l'erreur et laissait la surface supprimée.
- **Ordre déterministe (EX-LINK-04, L-05).** Les liens sont recalculés dans leur ordre de création ; deux exécutions
  identiques donnent le même modèle.
  - Dans ce noyau, une surface tirée d'une sortie liée accroche de la géométrie étrangère à cette sortie, ce qui détache
    le premier lien.
  - Aucune chaîne de liens ne peut donc exister, ni aucun cycle (règle déclarée, testée).
- **Distance par côté (EX-NUM-03, P-11).** En symétrique (« Des deux côtés »), la consigne donne le total des deux côtés.
- Déjà livrés et vérifiés de nouveau : recalcul au déplacement de la source dans la même opération (L-01) ; détachement à
  l'édition du résultat, à la suppression ou au découpage de la source ; « Détacher le lien » (O-2) ; annuler qui rend
  géométrie et relation (L-03) ; fichiers anciens (L-06).

## Contrôles

| Contrôle | Résultat |
| --- | --- |
| `npm run typecheck`, `npm test`, `npm run build` | verts |
| `liens-l10b.test.ts` (9) : L-01 à L-05, option Lien, consigne dans un groupe, P-11 | verts |
| Recette `planche-liens.mjs` (nouvelle, ajoutée à la CI) : lié par défaut, L-01, Indépendante, L-02 | verte |
| Recettes Planche existantes, `atelier-barre.mjs`, `interface-anglais.mjs` | vertes |

## Limites déclarées

- Le statut « Indépendante » avec sa raison (désactivé, dans un groupe, source découpée…) n'est pas persisté. Le statut
  « Liée aux arêtes sources » reste dérivé des enregistrements (O-2), et la raison d'un détachement n'est pas conservée.
- Les identifiants de la surface régénérée changent à chaque recalcul. L'option est notée, rien n'est construit
  (EX-LINK-04 : « préserver les identifiants stables quand la topologie est inchangée »).
