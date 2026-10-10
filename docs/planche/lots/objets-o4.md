# Lot Planche « Objets O-4 » — Groupe vide, Déplacer vers un groupe, Navigateur — compte rendu

**Statut : livré le 10 octobre 2026.** Délégation D-203 ; décision D-206 ; programme `docs/planche/analyses/programme-lots.md`
(Objets O-4) ; rapport de recherche « Grouper et Éclater SketchUp vers Planche » (fonctions absentes : groupe vide,
re-parentage ; décision 8 : cible partagée).

## Livré

- **Nouveau groupe vide** (`grouperVide`, écart Fadi déclaré : SketchUp n'en crée pas) : une définition sans contenu et son
  occurrence à l'origine du contexte courant ; le groupe est **ouvert aussitôt** pour y dessiner. Refermé vide, il reste :
  seules les définitions sans occurrence sont purgées.
- **Déplacer vers un groupe** (`deplacerVersContexte`) : les objets sélectionnés passent dans le groupe ou composant choisi,
  ou à la racine, **sans bouger à l'écran** (inverse du repère monde de la cible × repère monde du contexte de départ ×
  transformation propre), identifiants gardés, un pas d'annulation.
  - Les groupes partagés sur les deux chemins sont rendus uniques de haut en bas (I7) : une copie d'un groupe parent ne
    reçoit ni ne perd l'objet.
  - Cible = composant partagé : l'objet apparaît dans chaque occurrence ; ce n'est pas tu, le message donne le nombre
    d'occurrences (décision 8 du rapport : « propager avec avertissement »).
  - Refus nommés : objet ou cible verrouillés, cible = contexte de départ, cycle (un objet dans lui-même ou un de ses
    descendants), géométrie libre (comme le Navigateur de SketchUp, seuls groupes et composants se rangent).
- **Navigateur** :
  - barre de commandes en tête de l'arbre ;
  - **renommage en place** (Entrée valide, Échap annule, la sortie du champ valide) ;
  - **glisser-déposer** : sur une ligne = ranger dedans ; au bord haut ou bas d'une ligne = à côté, même parent ; sur
    « Planche (racine) » = à la racine ;
  - un objet verrouillé ne se glisse pas et n'accepte rien ;
  - le fil d'Ariane et la boîte « Déplacer vers… » affichent le nom propre de l'objet.
- **Règle d'or** :
  - Nouveau groupe vide (⊡, **Alt+Maj+G**), Déplacer vers un groupe… (⇲, **Alt+Maj+V**) et Renommer (✎, **F2**) ont
    chacune une icône propre ;
  - elles figurent dans la barre du Navigateur, dans « Outils ▾ » et au menu contextuel (groupe vide sans sélection ;
    Renommer et Déplacer vers… sur un objet) ;
  - leurs raccourcis sont sans collision (test) ;
  - F2 ouvre le Navigateur sur l'objet sélectionné.

## Contrôles

| Contrôle | Résultat |
| --- | --- |
| `npm run typecheck`, `npm test`, `npm run build` | verts |
| Tests noyau `objets-o4.test.ts` (6) | verts — groupe vide non purgé, position monde conservée (aller et retour), refus, groupe cible partagé rendu unique, composant cible partagé compté, déplacement depuis un groupe imbriqué dans un groupe copié |
| `commandes-objets.test.ts` (disponibilités et cibles), test de la règle d'or (commandes du Navigateur) | verts |
| Recette `planche-objets.mjs` étendue à O-4 (bureau 1536 px) | verte — Alt+Maj+G, Alt+Maj+V, F2, glisser-déposer vers la racine et dans un groupe |
| Recettes `planche-lot-5.mjs`, `planche-barre-outils.mjs`, `interface-anglais.mjs`, `atelier-barre.mjs` | vertes |

## Limites déclarées

- Le glisser-déposer HTML5 n'existe pas au toucher sur les navigateurs mobiles. Au téléphone, on range un objet par
  « Déplacer vers un groupe… » (menu contextuel, barre du Navigateur ou « Outils ▾ »).
- L'origine locale d'un groupe reste celle de son contexte : c'est le lot O-6.
- La géométrie libre ne se range pas dans un groupe par cette commande. Pour l'y mettre : Couper, ouvrir le groupe, puis
  Coller.
- Déplacer vers un groupe calcule le repère de départ et d'arrivée à partir de l'identifiant d'occurrence : dans un
  composant à plusieurs occurrences qui contient un objet imbriqué, c'est la première occurrence qui sert de repère
  (l'objet est rangé dans la définition commune, donc dans toutes ; seule sa position relative peut différer). Le chemin
  complet introduit par la revue d'O-2 pour les outils sera étendu à cette commande avec le registre du lot 9.
