# Recommandation d'architecture — Sandbox

20 octobre 2026 · Roch · **Statut : proposée, en attente de décision** (aucune implémentation engagée)

Le Sandbox devient un module autonome, avec son propre registre d'outils, une interface par défaut proche de SketchUp et des pictogrammes Tabler.

Décisions déjà prises par le maître d'ouvrage (20 octobre 2026) :

- le Sandbox est un outil **autonome** et ne rejoindra pas le domaine « 01 Dessin et modélisation » ;
- il ne réutilise **jamais** le système d'outils du 01 : il en reprend le fonctionnement, pas le code ;
- son interface par défaut ressemble à celle de SketchUp ;
- ses icônes sont des **pictogrammes**, jamais des caractères Unicode ni du texte ;
- la bibliothèque de pictogrammes retenue est **Tabler Icons**.

Référence : [Catalogue Sandbox — 86 entrées](Catalogue_Sandbox_86_entrees.md).

## 1. Le module

- **Le code est déplacé sans être réécrit** : il passe de `apps/web/src/modules/studio/console/sandbox/` à `apps/web/src/modules/sandbox/`, et le Sandbox prend sa propre adresse, `/sandbox`.
- **La carte « 00 Sandbox » reste dans la Console du Studio**, comme simple lien vers cette adresse.
- **Un test garantit la séparation, dans les deux sens** : le Sandbox n'importe rien du Studio, de l'Atelier, du registre du 01 (`@parcours/atelier-model`) ni de l'API ; le Studio n'importe rien du Sandbox, hormis ce lien.
- **Pourquoi maintenant** : le déplacement ne touche aujourd'hui que 4 fichiers du Studio (`StudioShell.tsx`, `routes-studio.ts`, `console/ConsoleStudio.tsx`, `console/cartes.ts`) ; plus on attend, plus il coûtera.

## 2. Le registre du Sandbox

- **Une source unique**, `REGISTRE_SANDBOX`, dans `packages/sandbox-planche-model`. Son contenu de départ est le catalogue de référence : 86 entrées, soit 52 outils, 20 commandes et 14 panneaux. Chaque entrée porte son identifiant, son pictogramme, sa famille, son raccourci, son emplacement par défaut et sa disponibilité.
- **Toute l'interface lit ce registre**, sans en garder de copie : barres, grille « ⋯ », menu « Outils ▾ », recherche, colonne de droite, barre d'actions et clavier.
- **Des barres par famille** (Sélection, Dessin, Modification, Solide, Matériau, Mesure, Annotation, Caméra, Objets) : par défaut, chacune affiche tous les outils de sa famille.
- **La personnalisation reprend le fonctionnement du 01, sans son code** :
  - profils Standard, Métier et Personnel ;
  - favoris et regroupements nommés ;
  - choix des outils de la barre gauche ;
  - bouton « Réinitialiser ».
- **Les préférences sont enregistrées dans le navigateur**, conformément à la règle « aucun serveur » du Sandbox.

## 3. Une interface par défaut proche de SketchUp

Cette disposition par défaut est celle du profil « Standard » ; « Réinitialiser » y ramène.

| Zone | Disposition par défaut |
| --- | --- |
| Barre du haut | menu Fichier, nom du brouillon, Annuler / Rétablir, état d'enregistrement |
| Barre verticale gauche | les outils essentiels dans l'ordre de SketchUp (Sélectionner, Gomme, Ligne, Arc, Rectangle, Pousser/Tirer, Décalage, Déplacer, Faire pivoter, Échelle, Mètre, Pot de peinture, Orbite, Panoramique, Zoom, Zoom étendu), puis « ⋯ » |
| Grille « ⋯ » | panneau dépliant, sections par famille, libellé sous chaque icône, bouton « Modifier » |
| Barre verticale droite | chaque panneau en un clic ; (i) Info modèle en bas |
| Barre du bas | aide, consigne de l'outil actif, champ Mesures à droite |
| Vue 3D | fond gris clair, axes rouge, vert et bleu, outil actif surligné, curseur propre à chaque outil |
| Écran tactile | mêmes zones, boutons zoom + / − et Cadrer visibles |

La sous-liste « Objets et vue » (deux clics) disparaît, ainsi que la confusion entre ⓘ (Info entité) et (i) (Info modèle).

## 4. Les pictogrammes : Tabler Icons

- **Bibliothèque retenue : [Tabler Icons](https://github.com/tabler/tabler-icons)**, licence MIT, 6 238 icônes au trait et pleines. Elle couvre directement **16 des 20 outils principaux** de la planche de comparaison (contre 15 pour Lucide et 12 pour IconPark).
- **Ces pictogrammes remplacent tous les caractères Unicode** actuels.
- **Installation** : paquet npm `@tabler/icons`, version figée ; seules les icônes utilisées sont embarquées ; l'avis de licence MIT est conservé dans le dépôt.
- **Style Fadi, inspiré de SketchUp** :
  - trait de 2 px sur la grille de 24 px de Tabler ;
  - couleur selon la famille : Dessin en bleu, Modification en rouge, Mesure en ocre, Matériau en orange, Caméra en vert, Sélection et Info en gris-bleu ;
  - la variante pleine de Tabler signale l'outil actif.
- **Pictogrammes à dessiner sur mesure**, dans la grille et l'épaisseur de trait de Tabler :
  - sans équivalent chez Tabler : Pousser/Tirer, Décalage, Suivez-moi, Rapporteur ;
  - manques relevés dans le catalogue : Pipette, Éclater ;
  - outils propres à Fadi : Profilé, Onglet, Coupe par profil, Allonger une pièce, Aligner une face, Épaissir, Débit.
- **On ne copie rien de SketchUp** : on reprend la disposition et les gestes, jamais les dessins, le logo ou la marque.

## 5. Les règles contrôlées par test

- **La « règle d'or » s'étend aux 86 entrées** : chacune a son pictogramme (Tabler ou sur mesure), jamais partagé, et un raccourci unique ; aucune icône n'est un caractère ou du texte.
- **Les points à harmoniser du catalogue sont corrigés dans le registre** : doublon « Diviser », Maj+Z (Texte 3D / Zoom étendu), raccourci de la recherche.
- **Un test de bout en bout de `/sandbox`** vérifie la disposition par défaut, sur ordinateur et sur téléphone.

## 6. L'ordre des travaux

Un lot à la fois, chacun sur sa branche, avec sa PR et une CI verte :

1. Déplacement du module (aucun changement visible).
2. Registre unique (aucun changement visible).
3. Pictogrammes Tabler et pictogrammes sur mesure.
4. Interface par défaut proche de SketchUp.
5. Personnalisation : profils, favoris, regroupements.
6. Harmonisation des raccourcis.

## Décisions restantes

1. Valider un 8ᵉ module, avec la mise à jour de `docs/architecture.md`, qui en fixe 7.
2. Confirmer l'enregistrement des préférences dans le navigateur.
3. Valider le catalogue de référence comme contenu initial du registre.
4. Désigner qui dessine les 13 pictogrammes sur mesure et valider les couleurs par famille.

## Sources

- [Tabler Icons (GitHub)](https://github.com/tabler/tabler-icons) — licence MIT.
- Planche de comparaison Lucide / Tabler / IconPark : https://claude.ai/artifact/PnZW3xa7RQrfZwV1DHk5nw (privée).
- Couverture mesurée sur le catalogue Iconify (`api.iconify.design`), 20 octobre 2026.
