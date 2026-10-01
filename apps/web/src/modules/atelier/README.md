# Module : Atelier Architectural

Responsabilité : modèle du bâtiment, dessin, sélection, édition et vues.

Conserve les fonctions de dessin de l'Atelier de référence : niveaux, vues (plan, coupe, volume, éclaté) et les
comportements retenus pour les modes Volume et Éclaté. Les formulaires et panneaux peuvent être améliorés
(saisie, explication des erreurs, accessibilité clavier/tactile) sans changer le modèle sous-jacent. Les
paramètres d'affichage (caméra, sélection, niveau visible, mode Volume/Éclaté) restent séparés des données
physiques du bâtiment — voir `docs/architecture.md`, « Coherent, reversible operations ».

Ce module consomme `@parcours/core-geometry` pour tous les calculs géométriques ; il ne réimplémente jamais une
fonction de géométrie localement.

## Statut

`AtelierPanel.tsx` est fonctionnel pour un seul type d'objet (mur) : création, liste, suppression, persistées
via l'API (`apps/api`) dans `architectural_objects`, avec `projects.model_revision` qui avance atomiquement à
chaque commande — et annulation/rétablissement via `CommandHistory` (`packages/domain-model`). C'est une
tranche verticale réelle, pas une démonstration : les données survivent à un rechargement de page.

Ce qui manque encore pour que ce soit l'Atelier décrit ci-dessus : les autres types d'objets (porte, fenêtre,
colonne, escalier), les vues plan/coupe/volume/éclaté (une seule vue en plan existe), la sélection et l'édition
d'un objet existant (seule la suppression est possible, pas le déplacement), et les commandes métier réelles
(aujourd'hui, `CommandHistory` ne connaît que « ajouter/supprimer un mur », pas une opération de domaine comme
« déplacer un escalier »). Tout cela reste un travail du Lot 3.
