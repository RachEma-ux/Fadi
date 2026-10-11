# Lot Planche « Objets O-6 » — Origine locale des groupes et composants — compte rendu

**Statut : livré le 10 octobre 2026.** Délégation D-203 ; décision D-208 ; programme `docs/planche/analyses/programme-lots.md`
(Objets O-6) ; rapport de recherche « Grouper et Éclater SketchUp vers Planche » (décision 5).

## Décision (D-208)

Le choix « origine locale d'un nouvel objet » est tranché par le chef de projet, sous la délégation D-203. Trois options
étaient ouvertes : coin de la boîte englobante, origine du contexte, ou `IDENTITE` historique. Il retient le **coin
minimal de la boîte englobante, axes parallèles à ceux du contexte**. C'est le défaut des axes d'un composant dans
SketchUp. Les positions locales restent lisibles (« à 0 du coin »), et c'est le préalable aux opérations relatives à
l'objet (échelle, rotation autour de son origine, remplacement). L'ancien comportement reste disponible : option
« Origine du contexte » de la boîte « Créer un composant », et `origine: "contexte"`, valeur par défaut du noyau.

## Livré

- `grouper(m, ids, { origine: "coin" })` : le contenu est ramené à l'origine et l'occurrence est translatée du coin
  minimal (objets imbriqués compris). **Rien ne bouge à l'écran.**
- Interface :
  - Grouper (Ctrl+G) crée le groupe au coin de sa boîte englobante ;
  - « Créer un composant » propose « Origine des axes » : coin de la boîte englobante (défaut) ou origine du contexte.

## Contrôles

| Contrôle | Résultat |
| --- | --- |
| `npm run typecheck`, `npm test`, `npm run build` | verts |
| Tests noyau `objets-o6.test.ts` (3) | verts — coin, défaut historique, objet imbriqué ; positions monde inchangées |
| Recette `planche-objets.mjs` (O-6 : origine (3, 0, 0) d'un groupe créé en x = 3) et toutes les recettes Planche | vertes |

## Limites déclarées

- Pas encore de commande « Changer les axes » pour déplacer l'origine d'un objet existant. Elle reste inscrite au lot 9
  (`changer-axes`, grisée).
