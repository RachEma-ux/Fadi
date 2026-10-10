# Lot Planche « Objets O-2 » — Contexte d'édition lisible — compte rendu

**Statut : livré le 10 octobre 2026.** Délégation D-203 ; décision D-204 ; programme `docs/planche/analyses/programme-lots.md`
(Objets O-2) ; rapport de recherche « Grouper et Éclater SketchUp vers Planche ».

## Livré

- **Reste du modèle délavé, objet ouvert entouré de pointillés.** `geometrieVisible(m, { chemin })` marque
  `horsContexte` tout ce qui n'est pas sous le contexte ouvert (le contenu des groupes imbriqués reste net) ; la vue le
  dessine en gris translucide, arêtes claires, et trace la boîte englobante de l'objet ouvert en pointillés. Ouvrir ou
  fermer un contexte redessine la vue.
- **Fil d'Ariane cliquable** (W3C APG Breadcrumb : `nav` étiquetée « Contexte d'édition », liste ordonnée,
  `aria-current="page"` sur l'étape courante) : « Planche › Groupe 2 › Groupe 1 » ; chaque étape précédente est un bouton
  qui y revient. Au bureau, au-dessus de la barre d'état ; au téléphone, superposé au dessin au-dessus du volet, **sans
  redimensionner la zone de dessin** (la barre d'options de l'outil se pose alors au-dessus du fil).
- **Fermer** (⤴, **Maj+Échap**) et **Fermer tout** (⤒, **Maj+Origine**) : avec n'importe quel outil (Échap seul ne sort
  d'un objet qu'avec Sélection, comme SketchUp). Règle d'or : icône propre, place dans le fil d'Ariane et dans le groupe
  « Objets » d'« Outils ▾ » (grisées hors d'un objet, avec motif), raccourci sans collision (test).
- **Objet verrouillé non ouvrable** : le double-clic le sélectionne (boîte rouge) au lieu de l'ouvrir.
- **Statut des liens d'extrusion (EX-UI-06)** : une face de surface liée à ses arêtes sources sélectionnée à la racine
  affiche « Liée aux arêtes sources » dans la barre d'état ; le menu contextuel propose **« Détacher le lien »**
  (`detacherLiens` : la relation disparaît, la géométrie reste, un pas d'annulation). `liensDesFaces` au noyau.
- **Menu contextuel** : un clic sur une entrée à sous-menu l'ouvre toujours (correctif d'O-1, conservé).

## Contrôles

| Contrôle | Résultat |
| --- | --- |
| `npm run typecheck`, `npm run build` | verts |
| Tests : `objets-o2.test.ts` (noyau, 3), `commandes-objets.test.ts` (fil d'Ariane), règle d'or des commandes de contexte | verts |
| Recette `planche-objets.mjs` (étendue à O-2) | verte — bureau 1536 px et téléphone 390 px |
| Recettes Planche existantes | vertes (voir PR) |

## Limites déclarées

- « Modifier » (ouvrir l'objet) et « Détacher le lien » restent inscrits « en attente » dans le test de la règle d'or : leur
  raccourci dépend du routage par focus du registre unique (lot 9).
- Le délavage est un rendu translucide simple ; il ne masque rien (« Isoler » est le lot O-5).
