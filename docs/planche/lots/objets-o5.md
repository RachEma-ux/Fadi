# Lot Planche « Objets O-5 » — Isoler, Masquer le reste du modèle — compte rendu

**Statut : livré le 10 octobre 2026.** Délégation D-203 ; décision D-207 ; programme `docs/planche/analyses/programme-lots.md`
(Objets O-5, « Isoler avec restauration ») ; rapport de recherche « Grouper et Éclater SketchUp vers Planche » (décision 7).

## Livré

- **Isoler** (écart Fadi déclaré, modèle Fusion / Shapr3D) : bascule avec restauration. La vue ne rend plus que la
  sélection, et tout le contenu des objets sélectionnés.
  - Les contextes traversés pour atteindre un objet imbriqué ne sont pas rendus.
  - Ce qui n'est pas rendu n'est pas accroché non plus.
  - Rien n'est écrit dans le modèle (R10) : quitter l'isolement rend la vue telle qu'avant, et un objet masqué avant
    le reste après.
  - Un bandeau « Isolement : N élément(s) affiché(s) » porte le bouton Quitter.
  - Filtre `geometrieVisible(m, { isole })` au noyau.
- **Masquer le reste du modèle** (SketchUp « Hide Rest of Model ») : dans un groupe ou un composant ouvert, le reste du
  modèle n'est pas rendu au lieu d'être délavé.
  - La bascule persiste comme dans SketchUp ; à la racine, elle est sans effet (levée au retour à la racine).
  - **Masquer les composants semblables** : option du panneau Affichage, qui cache les autres occurrences du composant
    ouvert.
- **Règle d'or** : Isoler (⦿, **Alt+Maj+I**) et Masquer le reste du modèle (⬒, **Alt+Maj+R**) ont chacune une icône
  propre.
  - Isoler est dans la barre d'actions : présent avec une sélection ou pendant l'isolement, enfoncé quand actif.
  - Masquer le reste est dans le fil d'Ariane, enfoncé quand actif.
  - Les deux figurent dans « Outils ▾ » ; les deux options sont aussi dans le panneau Affichage.

## Contrôles

| Contrôle | Résultat |
| --- | --- |
| `npm run typecheck`, `npm test`, `npm run build` | verts |
| Tests noyau `objets-o5.test.ts` (5) | verts — isolement simple, multiple et imbriqué ; restauration avec modèle inchangé ; masquer le reste ; composants semblables |
| `commandes-objets.test.ts` (disponibilités), test de la règle d'or (commandes de vue) | verts |
| Recette `planche-objets.mjs` étendue à O-5 (bureau) | verte — Alt+Maj+I, bandeau, Quitter, Alt+Maj+R dans un groupe, retour à la racine sans masquage résiduel |
| Recettes `atelier-barre.mjs`, `planche-lot-5.mjs`, `planche-barre-outils.mjs`, `interface-anglais.mjs` | vertes |

## Limites déclarées

- L'isolement reste actif quand on ouvre ou ferme un groupe (c'est un état de la vue). Il se lève par la même commande.
- Les options « Masquer le reste » et « Masquer les composants semblables » ne sont pas enregistrées dans le projet :
  ce sont des états de la vue, comme les autres options d'affichage (R10).
