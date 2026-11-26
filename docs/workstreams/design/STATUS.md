# Design — Statut

Mis à jour : 2026-11-26 (UTC).

## État

**En cours** — lots L0 (PR #418), L1 (PR #419), L2 (PR #420), L3 (PR #421) et L4 implémentés sur branches empilées ; non acceptés.

## Faits vérifiés

- Garde des plafonds (`apps/web/src/design/plafonds.test.ts`) verte sur `main` 470e99f : 581 couleurs hexadécimales
  opaques, 616 avec alpha, 20 points de rupture distincts dans les feuilles CSS de `apps/web/src` (19 avant la revue de
  #418 : les requêtes composées ne comptaient que leur premier seuil ; 1180 px manquait).
- Relevé `e2e/design-releve.mjs` exécuté localement le 26-11-2026 (stack locale, 21 cas : 7 écrans × 412 / 1 440 /
  320 px) : aucune violation axe critique ou grave ; aucun débordement du document ; défilements horizontaux internes
  relevés (barre des modules de projet, phases et grille de la Vue d'ensemble, onglets et pastilles GeoData) ; cibles
  sous 24 px relevées par écran (1 à 5).

- L1 (#414) : GeoData bascule à 700 px (CSS et `PageGeoData.tsx`), plus aucun 760 px dans le module ; « Carte » pressé
  et survolé à 5,23:1 (au lieu de 1,00:1). `e2e/geodata.mjs` : 269 contrôles verts en local, dont 4 nouveaux
  (`DESIGN L1`). Points de rupture : plafond inchangé à 19 (700 existait déjà ; 701 écrit `not all and (max-width:700px)`).

- L2 (#415) : au téléphone (Pixel 7), la colonne d'outils GeoData s'arrête à 777 px, au-dessus de la barre du bas
  (781 px) ; avant, elle descendait à 841 px et cinq outils étaient cachés dessous. Elle défile au doigt (`pan-y`,
  balayage tactile CDP : `scrollTop` 178) ; la poignée (24 px, collante) garde seule le glisser. `e2e/geodata.mjs` :
  273 contrôles verts en local, dont 4 nouveaux (`DESIGN L2`).

- L3 (#416) : un champ nombre d'étape est un texte à clavier décimal ; « 12,5 » est enregistré 12,5 ; « 1e » et
  « abc » gardent le texte, affichent un message relié au champ (`aria-invalid`, `aria-describedby`) et n'envoient
  aucune écriture ; « -3 » reste accepté. Avant : « 1e » effaçait en silence une valeur enregistrée (500 relu vide
  après rechargement, vérifié). Date incomplète : même règle. `parcours-scenario.mjs` : 5 contrôles `DESIGN L3` verts
  en local ; vitest `lireNombre` : 3 tests.

- L4 (#417) : décision du maître d'ouvrage du 26-11-2026, « Remettre l'action » retirée le 13-10 (commit 6c558ec9).
  La Vue d'ensemble rend de nouveau une action utile (`resolveDossierPrimaryAction`) avant l'aperçu ; les alertes
  détaillées restent dans la cloche. Au téléphone, la bande des trois suivis tient chaque suivi sur une ligne : sur
  l'accueil du projet, le bouton finit à 752 px sur 839 (Pixel 7) et à 787 sur 844 (390 px), hauteur 48 px.
  `accueils-design.mjs` : 85 contrôles verts en local, dont les reprises Commencer / Poursuivre (étape 09) /
  programme / Atelier / revue, l'action en attente pendant le chargement et « Vérifier l'accès au dossier » pour un
  rôle inconnu. Sur l'accueil de l'application, l'action reste sous la ligne de flottaison au téléphone (relevé, lot L9).

- L5 (#429) : `navigation-entrees.ts` (entrées de la barre et de la feuille, entrée active ; 3 tests vitest), `BarreBasGlobale`, `FeuillePlus`, `barre-bas.css` ; rendues mais `display:none` à toutes les largeurs (vérifié au Pixel 7 et à 1 440 px : barre présente, non affichée, rail inchangé).

- L6 (#430) : sous 700 px, la barre du bas (Accueil, Projets, Studio, GeoData, Plus) remplace le rail ; à 701 px le rail revient seul (vérifié). Feuille « Plus » : focus au titre, entrées ≥ 48 px, Échap et Retour la ferment sans changer d'adresse, focus rendu à « Plus » ; un choix remplace l'entrée d'historique. `accueils-design.mjs` : 94 contrôles verts en local ; `project-layout.mjs` : 830 / 831 (le seul échec attend la parcelle de l'iframe à 701 px, sans lien avec la navigation). GeoData garde sa barre propre en attendant L7.

- L6b (#431) : rail du bureau : Accueil, Projets, Studio, GeoData, puis Collaboration, Bibliothèque, Harmonie (ajoutée), Revues externes, Organisations, Extensions, Paramètres ; ordre Tab relevé à 1 440 px identique à l'ordre visuel (16 arrêts).

- L7 (#432) : L7 (#432) : GeoData garde une seule barre du bas, à 5 boutons (Carte, Chercher, Couches, Enregistrer, Plus) ; « Plus » ouvre la feuille de l'application (navigation principale en tête) par l'événement fadi:ouvrir-plus ; même hauteur (64 px) et même fond que la barre globale ; recette geodata.mjs 276/276 en local.

- L9 (#433) : L9 (#433) : au téléphone (≤ 700 px), l'en-tête tient sur une rangée de 64 px au plus (titre, Rechercher, Autres actions, Cloche) ; plus d'icône Accueil (la barre du bas l'a) ; Historique, État et Langue sous « Autres actions » ; bureau inchangé ; recette accueils-design.mjs verte en local avec 6 contrôles L9.

## Points ouverts

- Capture sur un vrai téléphone Android à joindre par le maître d'ouvrage avant fusion.
- Lots L1 à L4 autorisés, en PR empilées sur L0.

## Liens de suivi

- Issue de chantier : https://github.com/RachEma-ux/Fadi/issues/412 ; lot L0 : #413
- Branche de tâche : `design/l0-outillage`

## Préconditions de clôture

- Critères de chaque Issue de lot testés et documentés ; acceptation du maître d'ouvrage consignée.
