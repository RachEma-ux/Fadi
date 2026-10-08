# Lot Planche 5 — Groupes, composants, matériaux, balises, panneaux — compte rendu

**Statut : lot complet. Première tranche (quatre outils « prévus ») livrée sur `planche/lots-4-6` (D-170) ; seconde
tranche (objets, menu contextuel, panneaux §6) livrée sur `planche/lot-5` (D-171) ; recettes navigateur exécutées ici ;
CI GitHub et acceptation du maître d'ouvrage en attente** (8 octobre 2026). Cadre : `cahier-planche.md` §8 (lot 5),
§5.6, §5.8, §6, §4.14, §4.24, §4.25, §4.33, décisions P-7, P-8, P-9 (D-170) et choix de la seconde tranche (D-171).

## Seconde tranche (D-171) — objets, menu contextuel, panneaux

| Tâche | Contenu | Fichiers | Fiche |
| --- | --- | --- | --- |
| L5.9 | **Créer un composant** (`G`, menu « Créer un composant… ») : boîte relevée — nom prérempli et sélectionné (« Composant N »), croix d'effacement, chevron d'options (Description, Coller à, Découper l'ouverture, Toujours face à la caméra, Ombres face au soleil grisé), Annuler / Créer ; la définition porte ces métadonnées (`MetadonneesDefinition`) ; **occurrences liées** (Ctrl + C / Ctrl + V copie l'occurrence, même définition) ; **Rendre unique** (grisé à 1 occurrence) ; **Éclater** (la géométrie revient libre et sélectionnée) ; **Intersection des faces ▸ Avec le modèle** (arêtes ajoutées le long des pénétrations) | `geometrie-libre.ts` (`grouper` étendu, `rendreUnique`, `eclater`, `intersecterAvecModele`, `modifierDefinition`), `panneaux-objets.tsx` (`DialogueComposant`), `Planche.tsx` | PL-05-04 |
| L5.10 | **Menu contextuel** de Sélection (clic droit, §5.8) : l'entité visée rejoint la sélection ; entrées selon la cible (face, arête, objet, sélection multiple, deux solides, vide) : Info entité, Effacer, Masquer / Réafficher, Verrouiller / Déverrouiller, Sélectionner ▸ (7 modes), Aire ▸ (sélection, balise, matériau), Créer un composant…, Créer un groupe, Intersection des faces ▸, Aligner la vue, Aligner les axes, Inverser les faces, Orienter les faces, Adoucir / Durcir, Diviser, Modifier le groupe / le composant, Éclater, Rendre unique, Coque extérieure, Adoucir / lisser les arêtes, Zoom sur la sélection ; entrées relevées sans effet Web livrable grisées (Texture unique, Décoller, Réinitialiser l'échelle / l'inclinaison, Changer les axes) ; Échap ou clic hors du menu le ferme | `outils/selection.ts` (`etendreSelection`), `geometrie-libre.ts` (`masquerEntites`, `afficherTout`, `verrouillerOccurrences`, `inverserFaces`, `orienterFaces`, `adoucirAretes`, `aire`), `vue-planche.ts` (rappel `menuContextuel`), `panneaux-objets.tsx` (`MenuContextuel`), `Planche.tsx` | PL-05-05 |
| L5.11 | **Panneaux §6** derrière l'icône « Objets et vue » de la colonne (la colonne reste courte) : **Info entité** (face : aire, recto / verso, balise ; arête : longueur ; courbe : rayon, segments ; objet : groupe / composant solide ou non avec motif, volume, N dans le modèle, nom d'occurrence, nom de définition, matériau, balise, Verrouillé, Masqué ; cote / texte / plan de coupe / scène / guide), **Composants** (définitions, nombre d'occurrences, « Sélectionner les occurrences », modifier nom / description / options), **Styles** (arêtes, arêtes arrière `K`, X-ray, mode de face ombré / monochrome / filaire / lignes cachées, couleur par balise, sol), **Ombres** (activer, au sol, heure, jour de l'année, latitude — latitude de la parcelle « non évaluée » déclarée, 46° par défaut), **Scènes** (ajouter, mettre à jour, appliquer, supprimer ; vues standard plan / élévations / dessous en projection parallèle, iso en perspective ; champ de vision), **Affichage** (Réafficher ▸ Tout / Sélection / Dernier, Voir ▸ objets masqués, géométrie masquée, couleur par balise, plans de coupe, axes, guides, Supprimer tous les guides), **Adoucir / lisser** (angle, coplanaires, appliquer à la sélection), **Info modèle** (unités, précision d'affichage — préférence de l'appareil, accrochages, extrémités et alignement du texte et des cotes — réglages de la Planche, un pas), **Navigateur** (arbre des objets, recherche, ouvrir, cibler, masquer / réafficher, supprimer). Les options de Styles / Ombres / Affichage sont des **options de la vue** (R10) ; scènes et réglages sont des **données de la Planche** (annotations `v`, `reglages`) | `annotations.ts` (`Scene`, `ReglagesPlanche`), `inference.ts` (masqué, adouci), `vue-planche.ts` (`OptionsAffichage`, soleil et ombres, projection parallèle, scènes, vues standard), `panneaux-objets.tsx`, `Planche.tsx`, `planche.css`, `messages.ts` | PL-05-06, PL-05-07 |
| L5.12 | Noyau : `Face.masquee`, `Arete.adoucie` (déjà) / `masquee`, `Occurrence.nom` / `masquee` / `verrouille`, `Definition` + `MetadonneesDefinition`, `peindreFacesCote` (recto / verso), `renommerOccurrence`, `adoucirLisser`, `boiteOccurrence`, `aretesMasquees`, `etendreSelection` ; une occurrence **verrouillée** refuse transformation, copie, effacement et éclatement (message nommé) ; une entité **masquée** n'est ni affichée, ni accrochée, ni sélectionnable, ni visée par le menu | `geometrie-libre.ts`, `outils/selection.ts`, `objets.test.ts` | PL-05-04 à PL-05-07 |
| L5.13 | Raccourcis §5.10 : `G` composant, `K` arêtes arrière, `Ctrl + A` tout, `Ctrl + Maj + I` inverser, `Ctrl + C` / `X` / `V` presse-papiers (copie dans le même contexte d'édition, collée à 1 m sur l'axe rouge, sélectionnée — Déplacer la pose) | `Planche.tsx` | PL-05-05 |
| L5.14 | Recette `planche-lot-5.mjs` (composant par G, presse-papiers, Rendre unique, menu contextuel, Info entité, verrou, Éclater, Intersection, Sélectionner ▸, Ctrl + A / Ctrl + Maj + I, groupes chevauchés, Navigateur, Masquer / Réafficher, Composants, Styles / K, Ombres, Scènes, Adoucir / lisser, Info modèle, Aire, Aligner la vue / les axes, Zoom sur la sélection, menu dans le vide) ; tests du noyau `objets.test.ts` | `apps/web/e2e/`, `packages/planche-model/src/` | — |

### Critères du cahier (lot 5, seconde tranche) et preuves

| Critère | Preuve |
| --- | --- |
| Pousser / tirer dans une occurrence → l'autre occurrence suit | occurrences liées = même `Definition` (`contenu` partagé) ; `objets.test.ts` « copie liée puis Rendre unique » ; e2e : Ctrl + V → 2 occurrences de `d…` |
| Rendre unique → seule elle change | `objets.test.ts` ; e2e : « Fenêtre » / « Fenêtre#1 », grisé à 1 occurrence |
| Éclater d'une boîte → 18 entités libres | `objets.test.ts` ; e2e : 6 faces libres, 25 entités connectées après Intersection |
| Deux groupes chevauchés ne collent pas | e2e : 2 boîtes solides chevauchées → 2 occurrences, 0 face libre |
| Intersection des faces avec le modèle | `objets.test.ts` (segments ajoutés) ; e2e : « 6 arête(s) d'intersection ajoutée(s) » |
| Panneaux §6 | e2e : chaque panneau ouvert et actionné ; options de la vue sans pas d'historique (R10) ; scène et réglages = un pas chacun |
| Menu contextuel §5.8 | e2e : entrées listées par cible (objet, face, vide), grisés vérifiés (Rendre unique) |

### Choix Fadi déclarés (D-171)

- Les panneaux du lot 5 sont regroupés derrière une seule icône **« Objets et vue »** (colonne de droite) : la colonne garde
  quatre icônes au téléphone comme à l'ordinateur ; un panneau ouvert a une flèche « ◂ » qui revient au choix.
- **Styles, Ombres, Affichage** = options d'affichage de la vue (jamais écrites dans la Planche, R10) ; **Scènes** et
  **réglages d'Info modèle** = données de la Planche (annotations) ; la **précision d'affichage** = préférence de l'appareil.
- **Ombres** : la latitude vient de la parcelle du projet quand elle est connue ; sinon « non évaluée », latitude 46° par
  défaut déclarée dans le panneau ; le nord des vues standard est le nord du quadrillage cadastral (D-017).
- **Vues standard** : plan et élévations en **projection parallèle** (dessin d'architecte), « Iso » rend la perspective ;
  la projection parallèle est émulée par une caméra à champ de 1° éloignée (three.js), déclaré.
- **Coller** (Ctrl + V) pose la copie à 1 m sur l'axe rouge dans le même contexte d'édition que la copie, sélectionnée ;
  un collage dans un autre contexte est refusé (message). Le « Tampon » du Déplacer reste la voie pour les copies placées.
- **Aligner la vue** garde la distance caméra-cible courante ; **Aligner les axes** pose le repère de saisie sur la face
  (origine au centre, z = normale, x le long de la première arête).
- **Adoucir / Durcir** sur une arête : propriété `adoucie` (l'arête n'est plus dessinée ni visée, les faces restent) ;
  **Adoucir / lisser** par angle agit sur les arêtes des faces de la sélection (coplanaires en option).
- Entrées relevées sans effet livrable sur le Web (Texture unique, Décoller, Réinitialiser l'échelle / l'inclinaison,
  Changer les axes, Souder, Trouver le centre, Convertir en polygone, Éclater la courbe) : **grisées** ou absentes, nv (§9).
- Effets de « Coller à », « Découper l'ouverture », « Toujours face à la caméra » : **métadonnées enregistrées**, sans
  effet géométrique (nv au relevé, §9) ; déclaré dans la boîte et la fiche.

## Première tranche (D-170) — les quatre outils « prévus »

**Périmètre** : Pot de peinture, Prélever la matière, Balise, Texte 3D, avec ce qu'ils exigent : panneaux **Matériaux**
et **Balises**, matières et balises comme données de la Planche, **Créer un groupe** (Ctrl + G) sur la sélection.

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

## Écarts et choix Fadi déclarés (première tranche ; l'Info entité est livrée en seconde tranche)

- Les propriétés des matières et des balises sont le nom et la couleur ; une balise ne se renomme pas encore.
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
- Seconde tranche : `R`, clic, `2;2`, `P`, `1`, triple-clic, **`G`** → « Fenêtre », Créer ; **Ctrl + C**, **Ctrl + V** ; clic droit sur
  la copie → **Rendre unique** ; clic droit → **Info entité** (volume 4,00 m³, Verrouillé) ; clic droit → **Éclater** ; colonne →
  **Objets et vue** → Navigateur, Styles (`K`), Scènes (vue « Plan (dessus) », Ajouter une scène), Info modèle (Enregistrer) ;
  `node apps/web/e2e/planche-lot-5.mjs`.
