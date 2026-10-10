# Lot Planche 8 — Pousser/Tirer : modes explicites et vrai Étirement — compte rendu

**Statut : livré le 10 octobre 2026, en attente d'acceptation du maître d'ouvrage.** Décision D-201 ; programme
`docs/planche/analyses/programme-lots.md` (L8) ; fiche `docs/planche/fiches/PL-08-01.md`.

## Livré

- **Contrat d'outil** (`packages/planche-model/src/outils/machine.ts`) : `OptionOutil` (identifiant, valeur, valeurs avec
  disponibilité et raccourci affiché), `VueOutil.options`, méthode facultative `MachineOutil.configurer`. Aucune autre
  machine n'est modifiée.
- **Pousser/Tirer** : options `face` (Normal, Nouvelle face, Étirement, Tube sans fond) et `arete` (Normal, Des deux côtés,
  Allonger) ; Ctrl, Alt et ↓ passent par `configurer`, comme les boutons ; modes exclusifs ; disponibilité selon la cible.
- **Étirement réel** : noyau `etirerFace` (les sommets de la face avancent, les voisines suivent ; refus nommé si une
  voisine deviendrait non plane, se retournerait ou s'annulerait) ; aperçu dédié (la face à sa place, trajets des sommets).
- **Barre d'options** de la Planche (`Planche.tsx`, `planche.css`) : groupes nommés, `aria-pressed`, boutons grisés avec
  motif, raccourci dans l'infobulle ; libellés au catalogue `messages.ts` (français et anglais, Planche détachée comprise).
- **Tube sans fond** : la touche Maj ne le bascule plus (conflit avec les raccourcis `Maj+lettre`, D-198) ; bouton de la
  barre d'options. Consignes et catalogue mis à jour.

## Contrôles

| Contrôle | Résultat |
| --- | --- |
| `npm run typecheck` | vert |
| `npm test` (planche-model) | 503 tests verts (8 ajoutés) |
| Tests web | verts |
| `npm run build` | vert |
| Recette `planche-pousser-modes.mjs` (nouvelle) | verte — desktop et téléphone 390 px |
| Recettes `planche-pousser-aretes`, `planche-barre-outils`, `planche`, `planche-boutons`, `planche-outils`, `planche-modification`, `planche-detachee-documents`, `interface-anglais` | vertes |

## Limites déclarées

- L'Étirement refuse une voisine qui deviendrait gauche (SketchUp la plierait) ; à spécifier si le maître d'ouvrage veut
  le pli automatique.
- Le tube sans fond n'a plus de touche : elle sera attribuée par le registre unique des commandes (lot 9).
- Les barres d'opérations flottantes n'ont pas encore de section « Options » (lot 9).
