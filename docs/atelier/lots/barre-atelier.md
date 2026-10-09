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

(à compléter à la livraison du lot B)

## Contrôles

- Lot A : `npm run typecheck` ✅ · tests web 106 ✅ · `npm run build` ✅ · douze recettes rejouées en local sur la version
  livrée (`atelier-nouveau` 41, `atelier-echanges` 17, `atelier-canevas` 71, `planche-boutons` 62, `atelier-complements`
  133, `parcours-scenario` 326, `interface-anglais` 7, `atelier-versions` 28, `atelier-documents` 23, `planche` 54,
  `planche-detachee-documents`, `lib-barre`) ; les autres tournent en CI.

## Non fait (déclaré)

- Déplacement libre des rails d'outils, barres par famille d'outils, personnalisation élément par élément de la barre
  (propositions discutées, hors périmètre de ce lot).
- Les niveaux du mode 3D restent choisis par le bouton Plan (le mode 3D suit le niveau actif) : pas de liste propre à 3D.
