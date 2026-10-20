# Recommandation d'architecture — Sandbox

20 octobre 2026 · Roch · **Statut : orientation décidée ; trois points restent à valider avant tout code** (aucune implémentation engagée)

Le Sandbox devient un module autonome, avec son propre registre d'outils, une interface par défaut proche de SketchUp et des pictogrammes Tabler.

## Journal des décisions

| Date | Décision | Statut | Section |
| --- | --- | --- | --- |
| 20 octobre 2026 | Le Sandbox est un outil **autonome** ; il ne rejoindra pas le domaine « 01 Dessin et modélisation » | Décidé | 1 |
| 20 octobre 2026 | Le Sandbox devient un **module à part** (`apps/web/src/modules/sandbox/`, adresse `/sandbox`) | Décidé (8ᵉ module à inscrire dans `docs/architecture.md`) | 1 |
| 20 octobre 2026 | Un **catalogue d'outils qui fonctionne comme celui du 01**, sans jamais réutiliser son code | Décidé | 2 |
| 20 octobre 2026 | L'interface par défaut **ressemble à celle de SketchUp** | Décidé | 3 |
| 20 octobre 2026 | Les icônes sont des **pictogrammes**, jamais des caractères Unicode ni du texte | Décidé | 4 |
| 20 octobre 2026 | Bibliothèque de pictogrammes : **Tabler Icons** (MIT), après comparaison avec Lucide et IconPark | Décidé | 4 |
| — | Enregistrement des préférences dans le navigateur | À confirmer | 2 |
| — | Catalogue de référence comme contenu initial du registre | À valider | 2 |
| 20 octobre 2026 | **12 pictogrammes sur mesure** dessinés dans le style Tabler et **couleurs par famille**, validés sur la planche de comparaison | Décidé | 4 |

Référence : [Catalogue Sandbox — 86 entrées](Catalogue_Sandbox_86_entrees.md).

## 1. Le module — décidé

- **Le code est déplacé sans être réécrit** : il passe de `apps/web/src/modules/studio/console/sandbox/` à `apps/web/src/modules/sandbox/`, et le Sandbox prend sa propre adresse, `/sandbox`.
- **La carte « 00 Sandbox » reste dans la Console du Studio**, comme simple lien vers cette adresse.
- **Un test garantit la séparation, dans les deux sens** : le Sandbox n'importe rien du Studio, de l'Atelier, du registre du 01 (`@parcours/atelier-model`) ni de l'API ; le Studio n'importe rien du Sandbox, hormis ce lien.
- **Pourquoi maintenant** : le déplacement ne touche aujourd'hui que 4 fichiers du Studio (`StudioShell.tsx`, `routes-studio.ts`, `console/ConsoleStudio.tsx`, `console/cartes.ts`) ; plus on attend, plus il coûtera.

## 2. Le catalogue du Sandbox, sur le modèle du 01 — décidé

- **Une source unique**, `REGISTRE_SANDBOX`, dans `packages/sandbox-planche-model`. Son contenu de départ est le catalogue de référence : 86 entrées, soit 52 outils, 20 commandes et 14 panneaux. Chaque entrée porte son identifiant, son pictogramme, sa famille, son raccourci, son emplacement par défaut et sa disponibilité.
- **Toute l'interface lit ce registre**, sans en garder de copie : barres, grille « ⋯ », menu « Outils ▾ », recherche, colonne de droite, barre d'actions et clavier.
- **Des barres par famille** (Sélection, Dessin, Modification, Solide, Matériau, Mesure, Annotation, Caméra, Objets) : par défaut, chacune affiche tous les outils de sa famille.
- **La personnalisation reprend le fonctionnement du 01, sans son code** :
  - profils Standard, Métier et Personnel ;
  - favoris et regroupements nommés ;
  - choix des outils de la barre gauche ;
  - bouton « Réinitialiser ».
- **Enregistrement des préférences — à confirmer (voir « Points restant à valider »)** : la proposition est de les garder dans le navigateur, conformément à la règle « aucun serveur » du Sandbox. Aucun lot ne fige ce choix avant sa validation.

## 3. Une interface par défaut proche de SketchUp — décidé

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

## 4. Les pictogrammes : Tabler Icons — décidé

- **Bibliothèque retenue : [Tabler Icons](https://github.com/tabler/tabler-icons)**, licence MIT, 6 238 icônes au trait et pleines. Elle couvre directement **16 des 20 outils principaux** de la planche de comparaison (contre 15 pour Lucide et 12 pour IconPark).
- **Ces pictogrammes remplacent tous les caractères Unicode** actuels.
- **Installation** : paquet npm `@tabler/icons`, version figée ; seules les icônes utilisées sont embarquées ; l'avis de licence MIT est conservé dans le dépôt.
- **Style Fadi, inspiré de SketchUp** :
  - trait de 2 px sur la grille de 24 px de Tabler ;
  - couleur selon la famille (validée le 20 octobre 2026) :

    | Famille | Couleur | Thème clair | Thème sombre |
    | --- | --- | --- | --- |
    | Dessin | bleu | `#1f6fd1` | `#5aa0ff` |
    | Modification | rouge | `#d23b2c` | `#ff6b5c` |
    | Mesure | ocre | `#b5730a` | `#e3a23a` |
    | Matériau | orange | `#c2410c` | `#f2774a` |
    | Caméra | vert | `#1e8a5a` | `#4cc58d` |
    | Sélection, Objets | gris-bleu | `#3f5c7a` | `#8fb0d4` |
    | Info | gris | `#5b6672` | `#9aa5b1` |

  - la variante pleine de Tabler signale l'outil actif.
- **12 pictogrammes sur mesure, dessinés et validés** (20 octobre 2026), dans la grille de 24 px et le trait de 2 px de Tabler ; sources SVG dans [`pictogrammes/`](pictogrammes/) :
  - sans équivalent chez Tabler : Pousser/Tirer (`pousser.svg`), Décalage (`decalage.svg`), Suivez-moi (`suivez.svg`), Rapporteur (`rapporteur.svg`) ;
  - commande sans équivalent : Éclater (`eclater.svg`) ;
  - outils propres à Fadi : Profilé (`profile.svg`), Onglet (`onglet.svg`), Coupe par profil (`coupe-profil.svg`), Allonger une pièce (`allonger.svg`), Aligner une face (`aligner.svg`), Épaissir (`epaissir.svg`), Débit (`debit.svg`).
- **La Pipette n'a pas besoin de dessin** : Tabler a l'icône `color-picker`.
- **On ne copie rien de SketchUp** : on reprend la disposition et les gestes, jamais les dessins, le logo ou la marque.

## 5. Les règles contrôlées par test

- **La « règle d'or » s'étend aux 86 entrées** : chacune a son pictogramme (Tabler ou sur mesure) ; aucune icône n'est un caractère ou du texte.
- **Pictogrammes uniques, sauf exceptions déclarées** : deux entrées ne partagent jamais un pictogramme, sauf un outil ou une commande et le panneau qu'il ouvre, quand ils portent le même objet. Ces exceptions sont listées une à une dans le registre et le test n'admet qu'elles. Liste de départ, reprise du catalogue : Pot de peinture et Matériaux, Balise et Balises, Liste de débit et Débit. Les autres paires du catalogue (◠, ◐, ⧉, ❖) reçoivent des pictogrammes distincts.
- **Raccourcis uniques là où ils existent** : chaque raccourci déclaré n'appartient qu'à une entrée. Les 52 outils et les 20 commandes en ont un ; les 14 panneaux n'en ont pas à ce stade et s'ouvrent depuis la barre de droite. Leur en attribuer serait une décision à part, jamais un champ obligatoire du registre.
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

## Points restant à valider avant le premier lot

1. Inscrire le 8ᵉ module dans `docs/architecture.md`, qui en fixe 7 (le principe est décidé).
2. Confirmer l'enregistrement des préférences dans le navigateur.
3. Valider le catalogue de référence comme contenu initial du registre.

## Sources

- [Tabler Icons (GitHub)](https://github.com/tabler/tabler-icons) — licence MIT.
- Planche de comparaison Lucide / Tabler / IconPark : https://claude.ai/artifact/PnZW3xa7RQrfZwV1DHk5nw (privée).
- Couverture mesurée sur le catalogue Iconify (`api.iconify.design`), 20 octobre 2026.
