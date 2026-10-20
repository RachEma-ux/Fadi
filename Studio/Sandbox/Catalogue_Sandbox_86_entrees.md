# Catalogue Sandbox — 86 entrées de référence

20 octobre 2026 · Roch

## Objet et légende

Le Sandbox du Studio offre 86 entrées avec une icône : 52 outils, 20 commandes et 14 panneaux. Ce catalogue est la référence de travail ; aucune implémentation n'en découle pour l'instant.

Source : code de `main` `f88806f4`, installé en préproduction le 20 octobre 2026 (`packages/sandbox-planche-model/src/catalogue-outils.ts`, `apps/web/src/modules/studio/console/sandbox/planche/`). Toutes les icônes sont aujourd'hui des caractères Unicode ; décision du 20 octobre 2026 : elles seront remplacées par des pictogrammes Tabler Icons (voir [Recommandation d'architecture](Recommandation_Sandbox_Architecture.md)).

- **Emplacement** : barre = barre verticale gauche ; grille = « ⋯ Plus d'outils » ; actions = barre d'actions flottante ; colonne = colonne de droite ; Objets et vue = sous-liste de la colonne de droite ; menu = clic droit. Tous les outils et commandes figurent aussi dans « Outils ▾ ».
- **Raccourci** : celui de SketchUp quand il existe ; sinon un raccourci propre à Fadi.
- **État** : Conforme = équivalent à SketchUp ; À améliorer = existe mais doit être amélioré ; Manque = un comportement précis manque ; Fadi = sans équivalent SketchUp.

## Outils (52)

41 outils sur 52 sont conformes ou propres à Fadi ; 9 sont à améliorer et 2 ont un manque (après le lot 6). 12 outils sont dans la barre gauche, 39 dans la grille « ⋯ » et 1 au clic droit.

| # | Outil | SketchUp | Famille | Icône | Raccourci | Emplacement | État | Remarque |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Sélectionner | Select | Sélection | ↖ | Espace | barre | Conforme |  |
| 2 | Lasso | Lasso Select | Sélection | ➰ | Maj+Espace | grille | Conforme |  |
| 3 | Ligne | Line | Dessin | ╱ | L | barre | À améliorer | Après Échap, le dernier segment n'est plus corrigeable |
| 4 | Main levée | Freehand | Dessin | 〰 | Maj+L | grille | Conforme | Raccourci Fadi |
| 5 | Rectangle | Rectangle | Dessin | ▭ | R | barre | Conforme |  |
| 6 | Rectangle pivoté | Rotated Rectangle | Dessin | ◇ | Maj+R | grille | Conforme | Raccourci Fadi |
| 7 | Cercle | Circle | Dessin | ◯ | C | grille | Conforme |  |
| 8 | Polygone | Polygon | Dessin | ⬡ | Maj+P | grille | Conforme | Raccourci Fadi |
| 9 | Arc | Arc | Dessin | ◠ | Maj+A | grille | À améliorer | Icône partagée avec le panneau Adoucir |
| 10 | Arc 2 points | 2 Point Arc | Dessin | ⌒ | A | grille | Conforme |  |
| 11 | Arc 3 points | 3 Point Arc | Dessin | ◡ | Maj+H | grille | Conforme | Raccourci Fadi |
| 12 | Secteur | Pie | Dessin | ◔ | Maj+N | grille | Conforme | Raccourci Fadi |
| 13 | Texte 3D | 3D Text | Dessin | A | Alt+Maj+Z | grille | Conforme | Raccourci Fadi ; Maj+Z rendu au Zoom étendu (lot 6) |
| 14 | Profilé | — | Dessin | ▰ | Maj+Q | grille | Fadi |  |
| 15 | Profilés depuis arêtes | — | Dessin | ⫴ | Alt+Maj+Q | grille | Fadi |  |
| 16 | Gomme | Eraser | Modification | ⌫ | E | barre | Conforme |  |
| 17 | Pousser/Tirer | Push/Pull | Modification | ⇕ | P | barre | À améliorer | Ctrl doit être tapé seul, pas maintenu |
| 18 | Déplacer | Move | Modification | ✥ | M | barre | À améliorer | Pas d'aperçu d'un groupe déplacé |
| 19 | Faire pivoter | Rotate | Modification | ⟳ | Q | barre | À améliorer | Pas d'aperçu des objets tournés |
| 20 | Échelle | Scale | Modification | ⤢ | S | barre | À améliorer | Pas d'accrochage pendant le glissement |
| 21 | Décalage | Offset | Modification | ⧈ | F | grille | À améliorer | Absent de la barre ; aperçu réduit ; chevauchement refusé |
| 22 | Suivez-moi | Follow Me | Modification | ↬ | Maj+F | grille | Conforme | Raccourci Fadi |
| 23 | Retourner | Flip | Modification | ⇋ | Maj+V | grille | Conforme | Raccourci Fadi |
| 24 | Diviser | Divide | Modification | ÷ | Maj+D | menu | Conforme | Commande en double supprimée : le clic droit et la barre d'actions lancent l'outil (lot 6) |
| 25 | Onglet | — | Modification | ◸ | Alt+Maj+O | grille | Fadi |  |
| 26 | Coupe par profil | — | Modification | ⧄ | Alt+Maj+B | grille | Fadi |  |
| 27 | Allonger une pièce | — | Modification | ⇿ | Alt+Maj+A | grille | Fadi |  |
| 28 | Aligner une face | — | Modification | ⫠ | Alt+Maj+F | grille | Fadi |  |
| 29 | Épaissir | — | Modification | ▥ | Alt+Maj+J | grille | Fadi |  |
| 30 | Enveloppe extérieure | Outer Shell | Solide | ⬚ | Maj+E | grille | Conforme | Raccourci Fadi |
| 31 | Union | Union | Solide | ∪ | Maj+U | grille | Conforme | Raccourci Fadi |
| 32 | Soustraction | Subtract | Solide | ⊖ | Alt+Maj+D | grille | Conforme | Raccourci Fadi ; Maj+S rendu à la recherche (lot 6) |
| 33 | Ajuster | Trim | Solide | ⊘ | Maj+J | grille | Conforme | Raccourci Fadi |
| 34 | Intersection | Intersect | Solide | ∩ | Maj+I | grille | Conforme | Raccourci Fadi |
| 35 | Scinder | Split | Solide | ⫛ | Maj+G | grille | Conforme | Raccourci Fadi |
| 36 | Pot de peinture | Paint Bucket | Matériau | ▨ | B | barre | Conforme |  |
| 37 | Prélever la matière | Sample Material | Matériau | ◉ | Maj+M | grille | Conforme | Raccourci Fadi |
| 38 | Mètre | Tape Measure | Mesure | ↔ | T | barre | Manque | Pas de longueur au survol ; redimensionne tout le modèle ; guides ignorés par les inférences |
| 39 | Rapporteur | Protractor | Mesure | ∡ | Maj+O | grille | Conforme | Raccourci Fadi |
| 40 | Axes | Axes | Mesure | ⊹ | Maj+Y | grille | Conforme | Raccourci Fadi |
| 41 | Cotation | Dimensions | Annotation | ⟷ | Maj+C | grille | Conforme | Raccourci Fadi |
| 42 | Texte | Text | Annotation | T | Maj+T | grille | Conforme | Raccourci Fadi |
| 43 | Plan de coupe | Section Plane | Annotation | ⊟ | Maj+K | grille | Conforme | Raccourci Fadi |
| 44 | Balise | Tag | Annotation | ⌖ | Maj+B | grille | Conforme | Raccourci Fadi |
| 45 | Orbite | Orbit | Caméra | ⟲ | O | barre | Conforme |  |
| 46 | Panoramique | Pan | Caméra | ✣ | H | barre | Manque | Maj+molette zoome au lieu de déplacer la vue en 3D |
| 47 | Zoom | Zoom | Caméra | ⊕ | Z | grille | Conforme |  |
| 48 | Zoom étendu | Zoom Extents | Caméra | ⤧ | Maj+Z | grille | Conforme | Comme SketchUp (lot 6) ; bouton Cadrer dans la barre d'actions (lot 4) |
| 49 | Zoom fenêtre | Zoom Window | Caméra | ⧉ | Maj+W | grille | À améliorer | Icône partagée avec Détacher |
| 50 | Positionner la caméra | Position Camera | Caméra | ◎ | Alt+Maj+P | grille | Conforme | Raccourci Fadi |
| 51 | Regarder autour | Look Around | Caméra | ◐ | Alt+Maj+L | grille | À améliorer | Icône partagée avec le panneau Styles |
| 52 | Marcher | Walk | Caméra | ⇡ | Alt+Maj+M | grille | Conforme | Raccourci Fadi |

## Commandes (20)

Les 20 commandes agissent sur la sélection sans changer d'outil ; elles sont regroupées sous « Objets » dans « Outils ▾ ». La commande Diviser (⦙, Alt+Maj+D), qui doublait l'outil 24, a été supprimée au lot 6.

| # | Commande | SketchUp | Groupe | Icône | Raccourci | Emplacement | État | Remarque |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 53 | Grouper | Make Group | Objets | ⊞ | Ctrl+G | actions | Conforme |  |
| 54 | Composant | Make Component | Objets | ❖ | G | actions | À améliorer | Icône partagée avec le panneau Composants |
| 55 | Éclater | Explode | Objets | ⊠ | Ctrl+Maj+G | actions | Conforme | Raccourci Fadi |
| 56 | Rendre unique | Make Unique | Objets | ⎘ | Alt+Maj+U | actions | Conforme | Raccourci Fadi |
| 57 | Diviser en segments | Divide (arête courbe) | Objets | ⌇ | Alt+Maj+C | actions, si utile | Conforme | Raccourci Fadi |
| 58 | Fermer le groupe | Close Group / Component | Contexte | ⤴ | Maj+Échap | fil d'Ariane | Conforme |  |
| 59 | Fermer tout | — | Contexte | ⤒ | Maj+Origine | fil d'Ariane | Fadi |  |
| 60 | Détacher le lien | — | Lien | ⛓ | Alt+Maj+K | Outils ▾ | Fadi |  |
| 61 | Nouveau groupe vide | — | Navigateur | ⊡ | Alt+Maj+G | panneau Navigateur | Fadi |  |
| 62 | Déplacer vers… | glisser dans Outliner | Navigateur | ⇲ | Alt+Maj+V | panneau Navigateur | Fadi |  |
| 63 | Renommer | Outliner, Entity Info | Navigateur | ✎ | F2 | panneau Navigateur | Conforme |  |
| 64 | Isoler | — | Vue | ⦿ | Alt+Maj+I | actions | Fadi |  |
| 65 | Masquer le reste | Hide Rest of Model | Vue | ⬒ | Alt+Maj+R | Outils ▾ | Conforme | Raccourci Fadi |
| 66 | Section de la pièce | — | Pièce | ⇆ | Alt+Maj+S | barre de la pièce | Fadi |  |
| 67 | Rotation de la pièce | — | Pièce | ⥁ | Alt+Maj+H | barre de la pièce | Fadi |  |
| 68 | Liste de débit | — | Débit | ☷ | Alt+Maj+T | panneau Débit | Fadi | Ouvre le panneau Débit, même icône |
| 69 | Renuméroter | — | Débit | № | Alt+Maj+N | panneau Débit | Fadi |  |
| 70 | Étiquettes | — | Débit | 🏷 | Alt+Maj+E | panneau Débit | Fadi |  |
| 71 | Effacer les étiquettes | — | Débit | ⌧ | Alt+Maj+W | panneau Débit | Fadi |  |
| 72 | Exporter le débit | — | Débit | ⇩ | Alt+Maj+X | panneau Débit | Fadi |  |

## Panneaux (14)

Trois panneaux s'ouvrent en un clic depuis la colonne de droite ; les dix autres sont regroupés sous « ▤ Objets et vue », à deux clics, alors que SketchUp les place tous dans sa barre de droite. Un seul panneau est ouvert à la fois, et son état n'est pas mémorisé.

| # | Panneau | SketchUp | Icône | Accès | État | Remarque |
| --- | --- | --- | --- | --- | --- | --- |
| 73 | Instructeur | Instructor | ? | colonne, 1 clic | Conforme |  |
| 74 | Matériaux | Materials | ▨ | colonne, 1 clic | Conforme | Même icône que le Pot de peinture |
| 75 | Balises | Tags | ⌖ | colonne, 1 clic | Conforme | Même icône que l'outil Balise |
| 76 | Objets et vue | — | ▤ | colonne, 1 clic | Fadi | Ouvre la sous-liste des dix panneaux suivants |
| 77 | Info entité | Entity Info | ⓘ | Objets et vue, 2 clics | À améliorer | Icône (i) réservée à Model Info dans SketchUp |
| 78 | Composants | Components | ❖ | Objets et vue, 2 clics | À améliorer | Icône partagée avec la commande Composant |
| 79 | Styles | Styles | ◐ | Objets et vue, 2 clics | À améliorer | Icône partagée avec Regarder autour |
| 80 | Ombres | Shadows | ☀ | Objets et vue, 2 clics | Conforme |  |
| 81 | Scènes | Scenes | 🎞 | Objets et vue, 2 clics | Conforme |  |
| 82 | Affichage | Display | 👁 | Objets et vue, 2 clics | Conforme | Contient « Supprimer tous les guides » |
| 83 | Adoucir | Soften Edges | ◠ | Objets et vue, 2 clics | À améliorer | Icône partagée avec l'outil Arc |
| 84 | Info modèle | Model Info | ⚙ | Objets et vue, 2 clics | Manque | Pas d'accès direct (i) ; unité fixée au mètre ; seule la précision se règle, par appareil |
| 85 | Navigateur | Outliner | ☰ | Objets et vue, 2 clics | Conforme |  |
| 86 | Débit | — | ☷ | Objets et vue, 2 clics | Fadi |  |

**Panneaux du catalogue absents de l'interface** (sans icône, non comptés dans les 86) : 3D Warehouse, Inspecteur de solides et Environnements, qui existent dans SketchUp ; Commentaires, propre à Fadi.

## Absences et points à harmoniser

Dix éléments de SketchUp n'ont aucune entrée dans le Sandbox ; six points du catalogue sont à harmoniser avant toute implémentation, et le remplacement des icônes Unicode est décidé.

| Élément | Nature | Détail |
| --- | --- | --- |
| Boutons zoom + et − | Absent | Molette, pincement ou outil Zoom seulement |
| Bouton Cadrer | Absent | Libellé et place prévus dans la barre d'actions, bouton non branché |
| Icône (i) Info modèle en accès direct | Absent | Panneau à deux clics, icône ⚙ |
| Grandes icônes | Absent |  |
| Curseur propre à chaque outil | Absent | Curseurs système seulement |
| Éditeur de raccourcis | Absent | Clé de préférence prévue, inutilisée |
| Personnalisation des barres | Absent | Barre gauche fixe ; barres flottantes affichables seulement |
| Choix de l'unité du modèle | Absent | Mètre fixe |
| Inférence de prolongement d'arête | Absent |  |
| Inférence par pause (From Point) et guides comme points d'accroche | Absent | Le moteur sait faire la pause, aucun outil ne l'utilise |
| Icônes en double | À harmoniser | ◠ Arc / Adoucir ; ◐ Regarder autour / Styles ; ⧉ Zoom fenêtre / Détacher ; ❖ Composant / Composants ; ▨ Pot de peinture / Matériaux ; ⌖ Balise / Balises |
| Diviser | Fait (lot 6) | Une seule entrée : l'outil Diviser (Maj+D), lancé aussi par le clic droit et la barre d'actions |
| Icône ⓘ | À harmoniser | Sert à Info entité, alors que (i) désigne Model Info dans SketchUp |
| Maj+Z | Fait (lot 6) | Zoom étendu, comme SketchUp ; Texte 3D passe à Alt+Maj+Z |
| Zoom étendu | Fait (lot 6) | Maj+Z ; Ctrl+Maj+E, réservé par Firefox (outil réseau), n'est plus pris |
| Recherche d'outil | Fait (lot 6) | Maj+S, comme SketchUp ; Soustraction passe à Alt+Maj+D |
| Icônes Unicode | Décidé | Remplacées par des pictogrammes **Tabler Icons** (MIT), 12 dessinés sur mesure et validés (dossier [`pictogrammes/`](pictogrammes/)) : voir [la recommandation](Recommandation_Sandbox_Architecture.md) |

Les icônes partagées entre un outil et le panneau qu'il ouvre (Pot de peinture et Matériaux, Balise et Balises, Liste de débit et Débit) peuvent rester communes ; les trois premières paires de la ligne « Icônes en double » non.

Document de travail édité sur claude.ai : https://claude.ai/code/artifact/36490c8e-1b7c-4e76-8217-c5240dc62d63
