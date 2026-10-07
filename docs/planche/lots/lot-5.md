# Lot Planche 5 — Matériaux, balises, texte 3D — compte rendu (périmètre des quatre outils « prévus »)

**Statut : code livré sur la branche `planche/lots-4-6` avec les lots 4 et 6 ; recettes navigateur exécutées ici ; CI GitHub
et acceptation du maître d'ouvrage en attente** (7 octobre 2026). Cadre : `cahier-planche.md` §8 (lot 5), §4.14, §4.24,
§4.25, §4.33, décisions P-7, P-8, P-9 tranchées par délégation (D-170).

**Périmètre livré** : les quatre outils de la grille qui restaient « prévus au lot 5 » — Pot de peinture, Prélever la matière,
Balise, Texte 3D — avec ce qu'ils exigent : panneaux **Matériaux** et **Balises**, matières et balises comme données de la
Planche, **Créer un groupe** (Ctrl + G) sur la sélection. Le reste du lot 5 du cahier (Créer un composant par boîte, Rendre
unique, Éclater, Intersection des faces, Info entité, Composants, Styles, Ombres, Scènes, Affichage, Adoucir / lisser, Info
modèle, Navigateur, menu contextuel) **n'est pas livré** et reste au lot 5.

## Ce qui est livré

| Tâche | Contenu | Fichiers | Fiche |
| --- | --- | --- | --- |
| L5.1 | **Pot de peinture** (`B`) : clic = cette face ; Ctrl = faces connectées de même matière ; Maj = toutes les faces de cette matière dans la Planche ; Maj + Ctrl = même objet ; Alt = prélever ; un objet peint de l'extérieur reçoit la matière sur l'occurrence (ses faces sans matière la montrent) ; un pas par clic | `outils/peinture.ts` | PL-05-01 |
| L5.2 | **Prélever la matière** : clic sur une face → matière courante (la sienne, sinon celle de l'objet, sinon défaut), bascule vers le Pot de peinture | `outils/peinture.ts` | PL-05-01 |
| L5.3 | **Balise** : balise choisie dans le panneau, clic sur un objet → l'occurrence porte la balise ; Maj = remplacer l'identique ; Ctrl = toutes les occurrences du composant ; Alt = prélever ; balise masquée = objet ni affiché, ni accroché, ni sélectionnable | `outils/balise.ts` | PL-05-02 |
| L5.4 | **Texte 3D** (P-7) : boîte (texte, hauteur, plein, extrusion), OK → placement au clic → **composant** « Texte 3D « … » » solide, outil Déplacer ; **police géométrique intégrée** (glyphes 5 × 7, A–Z, 0–9, ponctuation ; minuscules et accents ramenés aux capitales ; caractères inconnus ignorés et nommés) | `outils/texte-3d.ts`, `police-geometrique.ts` | PL-05-03 |
| L5.5 | Panneaux **Matériaux** (matière par défaut, liste, créer : nom + couleur unie, P-8) et **Balises** (liste, case Visible, créer) dans la colonne de droite ; choisir une matière active le Pot, choisir une balise active l'outil Balise ; faces rendues dans la couleur de leur matière (ou de leur objet) | `Planche.tsx`, `vue-planche.ts`, `planche.css`, `messages.ts` | PL-05-01, PL-05-02 |
| L5.6 | **Ctrl + G** : la sélection devient un groupe (« Groupe N »), sélectionné ; double-clic de Sélection pour l'ouvrir (lot 2) | `Planche.tsx` | — |
| L5.7 | Noyau : `Materiau`, `Balise`, `Occurrence.materiau` / `balise`, `Face.materiauRecto` (lot 1), `peindreFaces`, `peindreOccurrences`, `peindreFacesPartout`, `baliserOccurrences`, `baliserDefinition`, `creerGroupeDepuisFaces`, `FaceVisible.materiau` (héritée), `ContexteOutil.materiauCourant` / `baliseCourante`, `Transition.materiauCourant` / `baliseCourante` ; registre `registre-materiau.ts` | `geometrie-libre.ts`, `annotations.ts`, `inference.ts`, `outils/machine.ts` | PL-01-01 (extension) |
| L5.8 | Recette `planche-lots-4-6.mjs` : peinture (9), prélever (3), balise (9), texte 3D (8) | `apps/web/e2e/` | — |

## Critères du cahier et preuves

| Critère | Preuve |
| --- | --- |
| CA-PEI-1 à -6 | `outils/materiau.test.ts` — une face ; Ctrl = 5 faces, l'avant brun inchangé ; Maj = même matière partout, même non connectée ; Maj + Ctrl = l'objet seul ; groupe peint en vert : matière sur l'occurrence, aucune face modifiée ; un pas par clic. e2e : panneau, création « Brique », clic, Maj + clic |
| CA-PRE-1 | `materiau.test.ts` — Prélever charge la matière et bascule vers la Peinture ; Alt + clic prélève sans quitter. e2e |
| CA-BAL-1 | `materiau.test.ts` — le groupe porte la balise ; Ctrl = toutes les occurrences ; balise masquée → géométrie visible sans l'objet. e2e : panneau Balises, clic, Visible décoché → l'objet n'est plus sélectionnable, Ctrl + Z |
| CA-T3D-1, -2 | `materiau.test.ts` — OK refusé à vide ; « Fadi » 0,30 / 0,15 → composant **solide** de 0,15 m de haut, posé au clic, outil Déplacer, sélectionné ; « I » et « O » (trou) sont des solides. e2e : boîte, OK vide refusé, « AB 12 » hauteur 0,5 → composant de 84 faces, extrusion 0,15 ; Annuler rend l'outil précédent |
| « matériau du groupe affiché sur les faces sans matériau seulement » | `inference.ts` (`FaceVisible.materiau` : la face garde la sienne, sinon celle de la chaîne d'occurrences) ; rendu par couleurs de sommets dans `majModele` |

## Décisions prises par délégation (D-170)

- **P-7 (polices)** : aucune police tierce (OFL hors liste) — **police géométrique propre à Fadi**, intégrée au noyau, sans fichier ;
  les glyphes sont des polygones à angles droits dont les contacts diagonaux sont supprimés pour que l'extrusion soit un solide.
- **P-8 (matériaux)** : pas de bibliothèque de textures — une matière = **nom + couleur unie**, donnée de la Planche ; « Matière
  par défaut » = blanc.
- **P-9 (balises)** : une balise est un **calque** de la Planche (visible / masqué) ; la correspondance avec les calques de
  l'Atelier (D-012) sera faite au lot 7 avec la persistance.

## Écarts et choix Fadi déclarés

- Pas d'Info entité : les propriétés des matières et des balises sont le nom et la couleur ; une balise ne se renomme pas encore.
- Peindre une arête, le verso d'une face : non livrés (nv dans le relevé) ; « Maj = Remplacer l'identique » pour la Balise remplace
  la balise des objets portant la même balise que l'objet cliqué.
- Texte 3D : la boîte Fadi (texte, hauteur, plein, extrusion) sans choix de police ni d'alignement ; le texte est posé au sol à
  l'origine du clic, largeur selon la police 5 × 7 ; Échap ou Annuler sur la boîte rend l'outil précédent.
- Créer un groupe par Ctrl + G (le menu contextuel reste au lot 5) ; les composants viennent du Texte 3D (et du noyau du lot 1).

## Ce que le maître d'ouvrage pourra vérifier lui-même

- Planche → `R`, clic, `4;3` Entrée ; colonne de droite → Matériaux → nom, couleur, « Créer la matière » → clic sur la face ;
  « … » → Prélever la matière, clic sur la face peinte ;
- `P` puis `1` Entrée, triple-clic, **Ctrl + G** ; Balises → « Créer la balise » → clic sur la boîte ; décocher « Visible » ;
- « … » → Texte 3D, « Fadi », OK, clic au sol ; `M` déplace le composant ;
- `npm test --workspace=@parcours/planche-model` (cas « CA-PEI… CA-T3D… ») ; `node apps/web/e2e/planche-lots-4-6.mjs`.
