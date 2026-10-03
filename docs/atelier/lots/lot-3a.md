# Lot 3a — Nouvel Atelier : socle d'interface, dessin 2D, objets d'architecture — compte rendu

Exécuté le 3 octobre 2026 (chef de projet, session unique ; exécution continue décidée en D-010).

Ouvrir : `?module=atelier&version=nouveau` sur n'importe quel projet. L'ancien Atelier reste l'Atelier par défaut
jusqu'à la bascule (lot 4).

## Fait

| Tâche | Résultat |
| --- | --- |
| L3a.1 | `apps/web/src/modules/atelier/nouveau/` : cinq repères stables (barre — niveau actif, annuler / rétablir, palette, niveau d'affichage, accrochages, cadrer, état de synchronisation ; barre d'outils — favoris + familles Modifier / Documenter / Analyser ; navigateur ; zone de travail ; inspecteur + panneau des modifications). Niveaux d'affichage essentiel / contextuel / complet (UX1), favoris épinglables, palette Ctrl/⌘ K avec synonymes d'autres logiciels et raison d'indisponibilité (UX2, UX4), inspecteur typé (paramètres canoniques éditables champ par champ, « non évaluée » pour une valeur absente, calque, type, propriétés avec provenance et statut, références à réparer avec propositions, problèmes de l'objet), panneau des modifications (file des lots avec état et décision rejouer / abandonner, journal, problèmes du modèle par type menant à l'objet, réserves Harmonie, revue à relancer, documents à régénérer). État d'affichage séparé du modèle (`etat-ui.ts`, R10), préférences locales. |
| L3a.2 | Plan 2D SVG (`plan2d/`) : rendu par classe depuis les paramètres canoniques, calques masqués non dessinés, grille, échelle graphique ; molette / pincement / bouton du milieu / Espace + glisser ; accrochages extrémité, milieu, centre, intersection, perpendiculaire, orthogonal 45°, grille avec marque et libellé (rayon 12 px, D-012) ; aperçu du tracé (épaisseur réelle du mur, cote en direct) ; sélection au clic (mur cliquable sur toute son épaisseur), Maj pour ajouter, cadre, Ctrl A ; saisie de précision (longueur dans la direction du pointeur, `dx;dy`, facteur, angle) ; primitives d'esquisse et transformations de l'annexe B émises comme commandes (`outils-2d.ts`, `actions.ts`). |
| L3a.3 | Murs (chaînés, alignement, type, épaisseur / hauteur de l'outil, calque), portes / fenêtres / ouvertures posées sur le mur cliqué et bornées à lui, déplacement le long du mur par l'inspecteur, suppression d'un mur avec ses ouvertures annoncée dans le libellé ; dalles, toitures, zones, espaces, solides par contour ; escalier droit vers le niveau supérieur (hauteur = différence d'altitude) ; pièce proposée par clic dans une boucle fermée de murs (aire calculée, pièce existante resélectionnée) ; niveaux créés depuis le navigateur (altitude obligatoire, jamais inventée) ; type créé depuis un objet (paramètres recopiés) et affecté à d'autres. |
| L3a.4 | Montage dans `ProjectShell` (`?module=atelier&version=nouveau`, chargement paresseux, mode immersif du module) ; P.118 importé dans le modèle typé dès l'import de l'exemple (lot 2) ; clavier : Échap, Entrée, Suppr, Ctrl/⌘ Z / Maj Z / Y, Ctrl/⌘ K, raccourcis d'outil (uniques, testé), chiffres → saisie de précision, + / − / 0 ; 390 px : un panneau à la fois avec onglets Plan / Projet / Inspecteur / Modifications, cibles de 44 px ; axe-core sans violation critique ou sérieuse (ordinateur et téléphone). |

### Corrections du bus de commandes (lot 2) trouvées par la recette

La recette de bout en bout a révélé quatre défauts de concurrence dans `atelier-client.ts`, corrigés :

1. après l'envoi d'un lot, la file était réécrite à partir d'une copie prise avant une attente : un lot ajouté pendant l'envoi disparaissait de la mémoire (il ne repartait qu'au rechargement, après les suivants) ;
2. un lot ajouté pendant la fin d'une séquence d'envoi attendait le déclencheur suivant (réveil perdu) : l'envoi se relance désormais ;
3. le journal local n'était pas relu après un envoi : « Annuler » pouvait viser une entrée plus ancienne que la dernière action ; il est relu après chaque envoi et avant chaque annuler / rétablir ;
4. « Annuler » d'un lot non encore envoyé retirait le lot après une attente (l'envoi pouvait le prendre entre-temps) et ne pouvait pas être rétabli : le retrait est immédiat et une pile locale permet « Rétablir ».

## Contrôles

- `npm run typecheck` ✅ · `npm test` ✅ (core-geometry 47, domain-model 93, atelier-model 33, API 65, **web 19** — nouveau : `apps/web/src/modules/atelier/nouveau/nouveau.test.ts`, accrochages, outils de tracé, saisie de précision, pièce, escalier, cadre, suppression, palette, projection) · `npm run build` ✅.
- Recette dédiée `apps/web/e2e/atelier-nouveau.mjs` (25 contrôles au lot 3a, 36 avec le lot 3b ; lancée aussi par la CI après le scénario ; verte cinq fois de suite après corrections) : sur P.118 importé, plan dessiné depuis le modèle typé ; nouveau niveau ; 4 murs (saisie 4 + Entrée, puis accrochage aux extrémités) ; pièce de 16 m² par clic ; renommage ; Ctrl Z / Ctrl Maj Z ; palette « wall » / « door » ; porte posée ; type créé et affecté ; cadre + Suppr (mur et porte hébergée) ; file synchronisée ; relecture après rechargement et depuis un second navigateur ; 390 px sans défilement horizontal, onglets ; axe ordinateur et téléphone ; aucune erreur JavaScript.
- `⏱` ouverture du nouvel Atelier P.118 → plan affiché : 1,1 à 2,2 s (instance locale, compte neuf) ; tracer un mur (clic + saisie + Entrée) → affiché : 93 à 170 ms.
- Captures : `docs/atelier/captures/3a-*.png`.

## Non fait / reporté

- Sélection au lasso libre et filtre de sélection par classe dans la zone de travail : le filtre par classe existe dans le navigateur (recherche + groupes), le cadre couvre la sélection par zone ; lasso reporté au lot 5 avec les vues.
- Jonctions de murs dessinées (L / T / X) : calculées par `atelier-model` mais le plan dessine encore chaque mur séparément (recouvrement visible aux angles) ; reporté au lot 5 (représentations), voir le compte rendu du lot 3b.
- Glisser un objet sélectionné à la souris (déplacement direct) : livré au lot 3b.
- La vue ne se recadre pas d'elle-même quand la fenêtre change beaucoup de taille (bouton « Cadrer » / touche 0).
- Recette sur l'instance publique : non lancée (Builder Deploy n'est pas déclenché par moi, règle du dépôt).
