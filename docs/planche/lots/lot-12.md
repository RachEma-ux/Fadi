# Lot Planche L12 — Outils « Profilé » et « Profilés depuis arêtes » — compte rendu

**Statut : livré le 10 octobre 2026.** Délégation D-203 ; décision D-215 ; fiches `PL-12-01.md` et `PL-12-02.md` ;
référence `docs/planche/reference/ecarts-fadi-profiles.md` ; programme `docs/planche/analyses/programme-lots.md` (L12).

## Livré

- **Deux outils propres à Fadi** (catalogue au statut `fadi`, famille Dessin, étapes, consignes et modificateurs) :
  - **Profilé** (`outils/profile.ts`) : deux clics, ou un clic et une longueur tapée ; verrou d'axe aux flèches ;
    aperçu du prisme sous le curseur ; pose dans le contexte d'édition courant ;
  - **Profilés depuis arêtes** (`outils/profiles-aretes.ts`) : présélection d'une ou plusieurs chaînes ; aperçu par
    modèle candidat ; « Poser » (ou clic, ou Entrée au champ vide) en un seul pas ; décalage tapé ; options position,
    rotation, onglets, fusion des colinéaires (noyau : `poserPiecesSurAretes(…, { fusionner })`).
- **Règle d'or** :
  - pictogrammes ▰ et ⫴ ;
  - barres « Volumes » ① Créer pour les deux outils, et « Arêtes » ① Créer pour Profilés depuis arêtes ;
  - raccourcis Fadi **Maj+Q** et **Alt+Maj+Q**, libres jusque-là (tests `barres-outils.test.ts` mis à jour) ;
  - options aux touches de modification frappées seules : Ctrl pour placement ou position, Alt pour la rotation.
- **Panneau Profilés** (`panneau-profiles.tsx`), avec trois sources de section :
  1. une ligne d'un **catalogue du projet**, lue dans les définitions `catalogue` de l'Atelier. Sans catalogue, le
     panneau affiche « Aucun catalogue importé — importez un CSV sourcé… » et aucune valeur n'est proposée ;
  2. des **dimensions saisies** en mm, pour rectangle, rond, rond creux, tube rectangulaire, I, H, T, L ou U. Aucune
     valeur par défaut : un champ vide bloque « Poser » avec le message « Dimension manquante : … » ;
  3. la **face sélectionnée** (contour et trous).
- **Adaptateur pur** (`sections-planche.ts`) :
  - il s'appuie sur `sectionDepuisCatalogue`, `contourSection`, `trousSection` et `sectionBoisDepuisCatalogue` de
    l'Atelier ;
  - les ronds sont facettisés au nombre de segments saisi (24 par défaut, comme le Cercle) ;
  - la source du catalogue (source, édition, page, ligne) est copiée dans la pièce ;
  - une cellule vide est refusée par son nom, jamais remplacée par zéro.
- **Info entité** : désignation, longueur de l'axe et source de la section d'une pièce.
- **Cahier** : section 8 bis « Écarts Fadi — profilés ».

## Contrôles

| Contrôle | Résultat |
| --- | --- |
| `npm run typecheck`, `npm test`, `npm run build` | verts |
| `outils/profiles-outils.test.ts` (9) : Profilé (sans section, deux clics, longueur tapée et verrou, Ctrl / Alt) ; depuis arêtes (sans arêtes, rectangle → 4 pièces liées en un pas, deux chaînes, décalage et fusion, Ctrl / Alt) | verts |
| `sections-planche.test.ts` (7) : catalogue I, cellule vide refusée, rond creux et bois, saisie sans défaut, face percée, aucune valeur de profilé (texte) | verts |
| Recette `planche-profiles.mjs` (nouvelle, ajoutée à la CI), en deux parties. **Bureau** : catalogue d'essai importé, avec « Données d'essai, non contractuelles » dans la colonne `source` ; Maj+Q ; pièce de 3,00 m en un pas ; source visible dans l'Info entité ; Alt+Maj+Q ; dimension manquante ; aperçu ; « Poser » de 4 pièces liées en un pas. **Téléphone 390 px** : sans catalogue, aucune ligne proposée ; le panneau tient dans l'écran | verte |
| Recettes Planche existantes, `atelier-barre.mjs`, `interface-anglais.mjs` | vertes |

## Limites déclarées

- **Matière d'apparence par défaut (C15)** : non attribuée. La matière se peint comme pour tout composant.
- **Pièces fusionnées** : elles ne sont pas liées, car elles couvrent plusieurs arêtes.
- **Panneau au bureau** : il prend place au-dessus de la barre d'options. Au téléphone, il flotte sur le dessin et
  défile s'il le faut.
- Les consignes et les erreurs des machines restent en français, comme les autres outils. Les codes bilingues sont
  prévus au lot L19.
