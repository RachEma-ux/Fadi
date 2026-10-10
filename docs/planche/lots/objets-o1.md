# Lot Planche « Objets O-1 » — Grouper, Créer un composant, Éclater visibles — compte rendu

**Statut : livré le 10 octobre 2026.** Décisions D-202 (programme, règle d'or) et D-203 (délégation d'exécution) ;
programme `docs/planche/analyses/programme-lots.md` (Objets O-1) ; rapport de recherche « Grouper et Éclater SketchUp
vers Planche ».

## Livré

- **Règle d'or appliquée aux commandes d'objet.** Module pur `commandes-objets.ts` : Grouper (icône ⊞, Ctrl+G),
  Créer un composant (❖, G), Éclater (⊠, **Ctrl+Maj+G**, nouveau, convention Rhino / Tinkercad, miroir de Ctrl+G).
  Chaque commande a sa propre icône (distincte des 45 outils et des icônes de type ◈ / ▣ du Navigateur), un bouton dans
  la **barre d'actions flottante** (au téléphone comme au bureau) et son raccourci dans l'infobulle.
- **Disponibilité unique** (`disponibiliteObjet`) pour la barre, le menu et le clavier, avec un **motif** quand c'est
  grisé : lecture seule ; « sélectionnez d'abord des faces, des arêtes ou des objets » ; « sélectionnez un groupe ou un
  composant » ; « objet verrouillé ».
- **Éclater reste au menu contextuel, grisé**, quand la sélection ne contient que de la géométrie libre (comme SketchUp,
  cahier `cahier-planche.md` §3.7).
- **Rupture des liens annoncée** : grouper (ou créer un composant avec) une surface liée à ses arêtes sources affiche
  « N surface(s) liée(s) à leurs arêtes deviennent indépendantes : les liens n'existent qu'à la racine de la Planche. »
  (EX-LINK-02, `liensRompus`).
- **Control avant G** : l'appui sur Control parvenait aussi à Pousser/Tirer (mode « Nouvelle face ») et restait allumé si
  le groupement était refusé ; l'outil est désormais remis à zéro dans tous les cas. Le registre du lot 9 lira les
  modificateurs au relâchement (correction de fond).

## Contrôles

| Contrôle | Résultat |
| --- | --- |
| `npm run typecheck`, `npm test`, `npm run build` | verts |
| Tests web (`commandes-objets.test.ts`, règle d'or des commandes livrées dans `barres-outils.test.ts`) | verts |
| Recette `planche-objets.mjs` (nouvelle, CI) | 20/20 — bureau 1536 px et téléphone 390 px |
| Recettes Planche existantes | vertes (voir PR) |

## Limites déclarées

- Les autres commandes du menu (Modifier, Rendre unique, Diviser…) restent inscrites « en attente » avec leur lot (O-2,
  O-3, L9) dans le test de la règle d'or.
- La remise à zéro de l'outil après Ctrl+G est une mesure d'attente ; la lecture des modificateurs au relâchement est
  l'objet du lot 9.
