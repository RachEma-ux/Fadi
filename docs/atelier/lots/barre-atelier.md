# Barre de l'Atelier — Plan à deux fonctions, Fichier, roue ⚙, barre d'actions flottante — compte rendu

Exécuté le 9 octobre 2026 (chef de projet, après la clôture de P2 — D-193 —, sur demande du maître d'ouvrage et avec
ses choix de détail délégués). Décision : **D-195**. Deux lots empilés : **A** (barre du haut) puis **B** (barre
d'actions flottante). Rails d'outils de l'Atelier et de la Planche, menu ☰ des Planches et mode Documents (D-191)
inchangés.

## Lot A — barre du haut

Rangée résultante : **Fichier · Plan · 3D · Documents · Planche · ⚙ · état d'enregistrement** (Annuler / Rétablir
et Cadrer y restent jusqu'au lot B).

| Sujet | Résultat | Preuve |
| --- | --- | --- |
| Plan à deux fonctions | `panneaux/BoutonPlan.tsx` : un clic active le mode Plan **et** ouvre la liste des niveaux (rôle `menu`, `menuitemradio`, niveau courant coché, flèches / Début / Fin, Échap — sans effet sur les autres écouteurs d'Échap —, clic ailleurs, nouveau clic sur Plan) ; choisir un niveau l'affiche et referme ; le nom accessible du bouton reste « Plan » (chevron décoratif `aria-hidden`, pas de contenu généré en CSS qui entrerait dans le nom ; `getByRole` et `text-is` le trouvent). Le sélecteur `barre-niveau` est supprimé. | `planche-detachee-documents.mjs` (retour en Plan : liste cochée sur le niveau choisi dans Documents) ; aide `lib-barre.mjs` (`allerEnPlan`, `choisirNiveau`) |
| Exporter / Importer dans Fichier | `panneaux/MenuPrincipal.tsx` reçoit les deux sous-menus (`<details>` en accordéon **exclusif** dans la liste — `sousMenuExclusif`, au basculement et jamais au pointeur enfoncé, pour que la liste ne bouge pas sous le doigt avant que le clic n'aboutisse — mêmes entrées et `data-export` / `data-import`) ; `fermerMenus` referme le sous-menu **et** Fichier ; `MenuImport` (`Echanges.tsx`) porte ses champs de fichier et sa boîte DXF hors du menu (portail vers `body`, un menu fermé ne rend pas son contenu). Les deux menus ont quitté la rangée ; le renvoi indirect `ouvrirMenuBarre` disparaît. En Planche, Fichier ne les propose plus (ils ouvraient des menus masqués). | recettes `atelier-nouveau`, `atelier-echanges`, `atelier-complements`, `atelier-canevas`, `parcours-scenario` adaptées (`ouvrirExports`, `ouvrirImports`) |
| Harmonie | Entrée du menu Fichier à l'étape 10 (`#atelier-harmonie-button`, `data-menu="harmonie"`), plus de bouton dans la rangée. | `parcours-scenario.mjs`, `planche-boutons.mjs` |
| Rechercher un outil | Le bouton de la rangée disparaît ; la loupe du rail d'outils (`data-palette-bouton`) existe désormais dans les deux dispositions ; Ctrl K inchangé. | 10 recettes (`[data-palette-bouton]`) |
| Roue ⚙ | `panneaux/Reglages.tsx` (`[data-reglages]`) : Outils affichés (Essentiel / Contextuel / Complet), Accrochages (neuf cases, pas polaire, pas de grille), Disposition (Canevas) ; attributs de test inchangés (`data-accrochage`, `data-pas-polaire`, `data-disposition-canevas`) ; absente en Documents. | `atelier-canevas.mjs`, `interface-anglais.mjs`, `planche-boutons.mjs` (`basculerCanevas`) |
| Menus de la barre | Fichier et ⚙ (menus de premier niveau) se referment au clic extérieur, comme la liste des niveaux ; téléphone : la liste des niveaux sort en surcouche fixe comme les menus (D-192). | `planche-detachee-documents.mjs` (téléphone) |
| Messages | `messages.ts` : `menu.harmonie`, `plan.aide`, `plan.niveaux`, `reglages.titre`, `reglages.affichage`, `reglages.disposition` (FR / EN). Aucune clé `en.json` nouvelle : les libellés déplacés étaient déjà traduits. | `interface-anglais.mjs` |

## Lot B — barre d'actions flottante

Rangée résultante : **Fichier · Plan · 3D · Documents · Planche · ⚙ · état d'enregistrement** — Annuler / Rétablir et
Cadrer ont quitté la rangée pour la barre d'actions flottante ; ⚙ gagne la section « Barre d'actions » et reste présente
en Documents (elle n'y propose que cette section).

| Sujet | Résultat | Preuve |
| --- | --- | --- |
| Barre d'actions | `panneaux/BarreActions.tsx` (`[data-barre-actions]`, rôle `toolbar`) : poignée ⠿, groupe « Annuler et rétablir », puis les actions du mode. Atelier (rendue par `AtelierNouveau.tsx`) : Annuler / Rétablir du journal (`client.annuler()` / `retablir()`, inactifs en lecture seule) et **Cadrer** (Plan : le niveau, `cadrer()` ; 3D : la vue, `cadrerVue3D()`) ; en Documents, Annuler / Rétablir seulement. Planche (rendue dans sa racine par `Planche.tsx`) : Annuler / Rétablir du brouillon local (`data-planche-annuler` / `-retablir`, inactifs sans opération) et **Détacher / Rattacher / Quitter le plein écran** (`data-planche-detacher`) ; la barre du haut de la Planche ne garde que le menu, la pastille brouillon et le choix étroit. | `atelier-barre.mjs` (Plan, 3D, Documents, Planche) ; `planche-boutons.mjs` (annuler / rétablir de la Planche) |
| Flotte sans redimensionner | `position: fixed`, `z-index` 45 (au-dessus des panneaux flottants, sous les menus ouverts) ; la zone de dessin garde ses dimensions, barre affichée ou non. | `atelier-barre.mjs` (« sans le redimensionner ») |
| Déplacement libre | Poignée : pointeur capturé (souris et doigt, `touch-action: none`), flèches au clavier (16 px, 64 px avec Maj) ; bornage pur `barre-actions-position.ts` (`borner`, marge 4 px) — seule contrainte : la barre reste **entière** dans la zone visible, ramenée au relâchement, au redimensionnement, à la rotation et sous le clavier virtuel (`visualViewport`). | `barre-actions-position.test.ts` (6 tests) ; `atelier-barre.mjs` (glisser hors écran en haut à gauche et en bas à droite, clavier, fenêtre réduite, téléphone 390 × 844 et rotation 844 × 390) |
| Position par défaut | Coin bas droit de la zone de dessin (`.atelier-n-travail` ; Planche : sa racine, au-dessus du pied et hors de la colonne de panneaux si elle descend jusque-là), recalculée au redimensionnement (`ResizeObserver`) tant que rien n'est mémorisé (`data-position="defaut"`). | `atelier-barre.mjs` |
| Mémoire sur l'appareil | `etat-ui.ts` : `barreActions` (`{x, y}` ou `null`) et `barreActionsVisible` dans les préférences persistées (`fadi.atelier.prefs`, relecture défensive `lirePosition`) ; une position mémorisée sur un grand écran est ramenée dans celui du téléphone. | `atelier-barre.mjs` (rechargement, téléphone) |
| ⚙ « Barre d'actions » | Case « Afficher la barre d'actions » (`data-barre-actions-visible`, mémorisée) et « Remettre la barre à sa position par défaut » (`data-barre-actions-defaut`, inactif quand elle y est). | `atelier-barre.mjs`, `planche-detachee-documents.mjs` (Documents : ⚙ ne propose que cette section) |
| Planche détachée | La barre vit dans la racine de la Planche : elle part dans la fenêtre séparée (et dans le plein écran) et en revient ; ses écouteurs sont reposés sur la fenêtre qui la porte (`fenetreCle`). | `atelier-barre.mjs` (cadre de même origine simulant Document Picture-in-Picture), `planche-detachee-documents.mjs` |
| Raccourcis | Ctrl Z, Ctrl Maj Z, 0 inchangés ; Cadrer rend la même échelle que la touche 0. | `atelier-barre.mjs` |
| Messages | `messages.ts` : `reglages.actions`, `reglages.actions.afficher`, `reglages.actions.defaut`, `actions.barre`, `actions.deplacer`, `actions.deplacer.aide`, `actions.cadrer`, `actions.cadrer.niveau`, `actions.cadrer.vue` (FR / EN). | `interface-anglais.mjs` |
| Accessibilité | Rôle `toolbar` nommé, poignée nommée (bouton, focusable, flèches), groupe nommé, boutons nommés (texte visible ou `sr-only`), cibles 44 px au téléphone ; axe-core sans violation critique ou sérieuse (ordinateur et téléphone). | `atelier-barre.mjs` |
| CI | Nouvelle étape « Recette de la barre de l'Atelier » (`apps/web/e2e/atelier-barre.mjs`) après `planche-detachee-documents.mjs`. | `.github/workflows/ci.yml` |

## Contrôles

- Lot B : `npm run typecheck` ✅ · tests web 112 ✅ (6 nouveaux) · `npm run build` ✅ · recettes rejouées en local sur la
  version livrée : `atelier-barre` 55, `planche-detachee-documents` 23, `planche-boutons` 62, `planche` 54 ; les autres
  tournent en CI.
- Lot A : `npm run typecheck` ✅ · tests web 106 ✅ · `npm run build` ✅ · douze recettes rejouées en local sur la version
  livrée (`atelier-nouveau` 41, `atelier-echanges` 17, `atelier-canevas` 71, `planche-boutons` 62, `atelier-complements`
  133, `parcours-scenario` 326, `interface-anglais` 7, `atelier-versions` 28, `atelier-documents` 23, `planche` 54,
  `planche-detachee-documents`, `lib-barre`) ; les autres tournent en CI.

## Non fait (déclaré)

- Déplacement libre des rails d'outils, barres par famille d'outils, personnalisation élément par élément de la barre
  (propositions discutées, hors périmètre de ce lot).
- Les niveaux du mode 3D restent choisis par le bouton Plan (le mode 3D suit le niveau actif) : pas de liste propre à 3D.
- Clavier virtuel : la barre suit la zone visuelle (`visualViewport`) ; sans clavier virtuel dans le navigateur sans écran de
  la CI, ce cas n'est couvert que par le test unitaire du bornage (zone décalée).
