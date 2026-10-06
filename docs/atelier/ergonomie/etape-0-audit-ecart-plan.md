# Ergonomie « SketchUp pour le Web » — étape 0 : audit, écart, plan

Source : `cahier-sketchup-web.md` (version 1, 06/10/2026), intégré à la feuille de route de l'Atelier à la demande du
maître d'ouvrage (06/10/2026) « si cela n'est pas en conflit avec la mission Fadi ». Ce document vaut livrable des
tâches T0.1 (audit), T0.2 (écart) et T0.3 (périmètre).

## 1. Compatibilité avec la mission Fadi

| Exigence du cahier SketchUp | Règle Fadi concernée | Verdict | Traitement retenu |
|---|---|---|---|
| Canvas plein écran, panneaux flottants exclusifs | Cahier Atelier §5.8 (UX1) : cinq repères **permanents** (navigateur, zone de travail, commandes, inspecteur, modifications) | Conflit partiel | **Disposition « Canevas » optionnelle**, choisie par l'utilisateur (préférence locale) ; la disposition actuelle reste celle par défaut. Dans le mode Canevas, les cinq repères restent présents en permanence sous forme d'icônes étiquetées et s'ouvrent en panneaux flottants : aucun repère n'est retiré. |
| Échap revient à l'outil précédent | Comportement actuel : Échap termine le tracé, puis revient à Sélection (e2e existants) | Changement de l'existant | Gardé tel quel en disposition classique ; en disposition Canevas, Échap sans tracé en cours revient à l'outil précédent. |
| i18n : français par défaut **et anglais** | `AGENTS.md` : « Keep the user-facing application in French » | **Conflit** | Structure de catalogue de messages prête (français) ; **aucune interface anglaise livrée** — décision du maître d'ouvrage si l'anglais doit être ouvert. |
| Matériaux (pot de peinture, créer / modifier des matériaux) | Modèle typé (R3 : rien d'inventé ; matériaux portés par les compositions de murs, D-026) ; contrainte du cahier SketchUp : ne pas changer le modèle sans nécessité | Conflit partiel | Panneau **Matériaux en lecture** (matériaux déclarés dans les compositions, en usage) et styles d'affichage par classe (D-135) ; pas de matériau peint sur une face (nouvelle donnée de modèle à spécifier). |
| Sauvegarde manuelle « Save » | R9 : chaque lot validé est enregistré (révision) ; file locale hors ligne | Compatible | « Enregistrer maintenant » = envoi immédiat de la file locale ; l'état reste visible (déjà présent). |
| Orbite à la molette maintenue | Plan 2D (pas d'orbite) et 3D (OrbitControls) | Compatible | 2D : molette maintenue = panoramique (comme aujourd'hui) ; 3D : molette maintenue = orbite, Maj = panoramique. |
| Partage avec confirmation d'enregistrement | Partage existant (module Collaboration, droits R13) | Compatible | Bouton « Partager » : vérifie que tout est enregistré, sinon le dit, puis ouvre le partage existant. |
| Ombres, Styles, Scènes, Info modèle | Vues 3D enregistrées (D-053), styles par classe (D-135) | Compatible | Panneaux d'accès à l'existant ; ombres : option d'affichage locale (jamais une donnée de projet). |
| Règles métier (échelle, cotes, cartouche, surfaces) | Règles Fadi prioritaires | Compatible | Existant conservé (documents dérivés, quantités). |

Aucun conflit ne touche aux 21 étapes, aux repères géométriques (R5), au modèle typé ni au cahier des charges, qui
n'est pas modifié.

## 2. Audit de l'existant (T0.1) — conservé tel quel

- **Rendu** : plan 2D en SVG (`plan2d/Plan2D.tsx`, `rendu.tsx`), 3D three.js (`vue3d/scene3d.ts`, WebGL 2 / WebGPU),
  documents dérivés (`documents/`). Géométrie et modèle purs dans `packages/atelier-model` (indépendants du DOM).
- **État** : modèle typé par commandes (bus local `bus/atelier-client.ts`, file Dexie, révisions serveur) ; état
  d'affichage `etat-ui.ts` (préférences locales : affichage, accrochages, favoris, paramètres d'outils, filtres,
  ensembles synchronisés D-118, styles par classe).
- **Disposition** : barre supérieure (niveau, Plan / 3D / Documents, annuler / rétablir, palette `Ctrl K`, niveau
  d'affichage, accrochages, cadrer, exporter, importer, Harmonie, état d'enregistrement), barre d'outils (favoris +
  familles), navigateur à gauche, inspecteur / modifications / versions à droite, barre d'état, onglets mobiles.
- **Outils** : 73 outils déclarés (`outils.ts`) avec aide, exemple, synonymes, raccourcis (15), niveau d'affichage.
- **Navigation 2D** : molette = zoom ancré, bouton du milieu / Espace + glisser / deux doigts = panoramique,
  pincement = zoom, loupe au doigt (D-085). **3D** : OrbitControls (orbite, panoramique, zoom), visite à hauteur
  d'œil, vues enregistrées, boîte de coupe, filaire, éclatés.
- **Saisie** : accrochages (extrémité, milieu, centre, quadrant, perpendiculaire, tangente, intersection, proche,
  polaire, grille), saisie de précision « longueur » ou « dx;dy » pendant un tracé, repère de saisie.
- **Tests** : unitaires (modèle, outils 2D), recettes Playwright (`atelier-complements`, `atelier-documents`,
  `atelier-versions`, scénario de bout en bout), axe-core.

## 3. Matrice d'écart (T0.2)

| # | Exigence | État | Remarque |
|---|---|---|---|
| 1 | Canvas plein écran + surcouches | Absent | Disposition actuelle en grille ; ajout d'une disposition Canevas (tranche 1). |
| 2 | Barre supérieure : menu, annuler / rétablir, état, partage | Partiel | Pas de menu principal ni de « Partager » (tranche 5). |
| 3 | Barre d'outils gauche flottante repliable, outil actif signalé | Partiel | Barre existante, non flottante, non repliable (tranche 1). |
| 4 | Outils étendus en grille | Partiel | Familles en menus ; grille en tranche 1. |
| 5 | Barre inférieure : aide, langue, périphérique, Mesures | Partiel | Barre d'état ; champ de précision seulement pendant un tracé (tranche 1). |
| 6 | Colonne d'icônes de panneaux, panneaux exclusifs | Absent | Tranche 1. |
| 7 | Points de rupture, cibles ≥ 44 px | Partiel | Mobile existant (onglets) ; tranche 1 et 6. |
| 8 | Navigation souris (molette, molette maintenue) | Partiel | 2D complet ; 3D : orbite au bouton gauche (tranche 2). |
| 9 | Navigation tactile configurable | Partiel | Gestes fixes (tranche 2). |
| 10 | Trackpad (deux doigts, Maj / Ctrl) | Absent | Tranche 2. |
| 11 | Réglages de navigation (périphérique, inversions, sensibilités, Reset All) | Absent | Tranche 2. |
| 12 | Outils de vue (orbite, pan, zoom, zoom étendu, regarder autour, position caméra) | Partiel | Cadrer, visite, vues 3D existent ; outils Pan / Zoom en tranche 3. |
| 13 | Accrochages et inférences avec aides visuelles | Existe | Dont parallèle : absent (tranche 3). |
| 14 | Champ Mesures (VCB) | Partiel | Seulement pendant un tracé ; toujours visible en Canevas (tranche 1). |
| 15 | Raccourcis configurables, visibles en infobulle | Partiel | Fixes ; configuration en tranche 3. |
| 16 | Recherche d'outils | Existe | Palette `Ctrl K`. |
| 17 | Outils noyau (sélection, lasso, gomme, ligne, rectangle, cercle, arc, polygone, déplacer, rotation, échelle, décalage) | Existe | — |
| 18 | Mètre ruban, cotes, rapporteur, texte, axes | Partiel | Rapporteur absent (tranche 3). |
| 19 | Pousser / tirer, suis-moi, retourner, coque extérieure | Partiel | Pousser / tirer existe ; suis-moi : profil vertical extrudé (D-154) ; retourner / coque : OCCT (§10.1). |
| 20 | Annuler / rétablir sur toutes les opérations | Existe | Journal du serveur. |
| 21 | Instructeur contextuel | Partiel | Aide d'outil en barre d'état ; panneau en tranche 4. |
| 22 | Info entité | Existe | Inspecteur. |
| 23 | Outliner | Partiel | Navigateur (objets par classe) ; arbre groupes / blocs en tranche 4. |
| 24 | Balises / calques | Existe | Calques imbriqués, états de calques. |
| 25 | Matériaux | Partiel | Lecture seule (voir §1). |
| 26 | Affichage (réafficher tout / sélection / dernier, isolement) | Partiel | Isolement, filtres ; masquer / réafficher en tranche 4. |
| 27 | Scènes, styles, ombres, info modèle | Partiel | Vues 3D et styles existent ; ombres et info modèle en tranche 4. |
| 28 | Sauvegarde auto + manuelle, alerte | Partiel | Auto et alerte existent ; « Enregistrer maintenant » en tranche 5. |
| 29 | Menu principal (nouveau, ouvrir, exporter, importer, imprimer…) | Partiel | Exporter / importer existent ; menu en tranche 5. |
| 30 | i18n | Partiel | Français ; anglais non livré (conflit §1). |
| 31 | Accessibilité, performance, tests | Partiel | axe-core et recettes existent ; tranche 6. |

## 4. Plan par tranches (T0.3)

Chaque tranche est additive, livrée seule, avec ses tests, et vérifie que les recettes existantes passent toujours.

1. **D-156 — Disposition Canevas** (livrée) : bascule de disposition (préférence locale) ; barre d'outils flottante repliable
   avec outil actif ; grille d'outils étendus ; colonne d'icônes à droite et panneaux flottants exclusifs (Outliner =
   navigateur, Info entité = inspecteur, Modifications, Versions, Instructeur, Affichage, Navigation, Raccourcis) ;
   barre inférieure (aide, langue, périphérique, champ Mesures toujours visible) ; mobile : panneaux en surcouche.
2. **D-157 — Navigation** (livrée) : réglages (périphérique souris / trackpad, geste deux doigts, inversions, sensibilités,
   Réinitialiser) ; trackpad 2D (deux doigts = panoramique, pincement = zoom) ; 3D : molette maintenue = orbite,
   Maj = panoramique ; tactile deux doigts orbite ou panoramique.
3. **D-158 — Outils de vue et saisie** (livrée) : outils Panoramique et Zoom, zoom étendu, rapporteur, accrochage parallèle,
   raccourcis configurables (infobulles, palette).
4. **D-159 — Panneaux** (livrée) : Instructeur (opération en étapes, astuces), Affichage (masquer la sélection, réafficher
   tout / le dernier), Info modèle, Matériaux (lecture), Ombres (option d'affichage 3D), arbre de l'Outliner.
5. **D-160 — Fichiers** (livrée) : menu principal (enregistrer maintenant, exporter, importer, imprimer, partager après
   enregistrement confirmé).
6. **D-161 — Qualité** : recette Playwright Canevas desktop + émulation mobile, axe-core, cibles ≥ 44 px, catalogue
   de messages français.

**Métriques de succès** : en Canevas, sur desktop et mobile, ouvrir le plan, choisir un outil, tracer avec saisie
numérique, naviguer, ouvrir un panneau sans perdre le dessin, enregistrer — recette verte ; recettes existantes
vertes ; aucune violation axe critique ou sérieuse.
