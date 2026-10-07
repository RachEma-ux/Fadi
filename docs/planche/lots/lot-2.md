# Lot Planche 2 — Rendu three.js, outils de dessin et champ Mesures — compte rendu

**Statut : code livré et commité sur la branche `planche/lot-1` ; recette navigateur exécutée et verte (lot 3, 7 octobre 2026) ;
écarts tranchés par délégation du maître d'ouvrage (D-167) ; acceptation formelle non consignée (le lot 3 a été demandé)** (7 octobre
2026). Cadre : `docs/planche/cahier-planche.md` §8 (lot 2), §4.1–4.14, §4.34–4.35, §5 ; décisions MO-1 à MO-5 (§1.2) ;
décisions ouvertes §10.

## Ce qui est livré

Le mode **Planche** s'ouvre depuis l'Atelier (bouton « Planche » à côté de Plan / 3D / Documents). Il dessine la
géométrie libre du lot 1 avec three.js et offre 13 outils de dessin dont la logique est entièrement dans des machines
d'états **pures** (`packages/planche-model/src/outils/`), l'interface ne faisant que traduire pointeur et clavier en
événements et afficher la vue de l'outil. Le dessin est un **brouillon local** déclaré comme tel : aucune commande
n'est émise, rien n'est enregistré dans le projet (lot 7).

| Tâche | Contenu | Fichiers | Fiche |
| --- | --- | --- | --- |
| L2.1 | Contrat des machines d'états (`EvenementOutil`, `VueOutil`, `ContexteOutil`, `Transition`, `MachineOutil`), registre `machineParId`, export depuis le point d'entrée du paquet | `outils/machine.ts`, `outils/index.ts`, `outils/registre-trace.ts`, `outils/registre-formes.ts`, `src/index.ts` | — |
| L2.2 | Sélection (clic, double, triple, fenêtre / croisée, Maj / Ctrl / Maj + Ctrl, Échap, Suppr, contexte d'édition) et Lasso (polygonal, libre, sens horaire / anti-horaire) | `outils/selection.ts`, `outils/lasso.ts` | PL-02-01 |
| L2.3 | Gomme (clic, glisser en un pas, adoucir / masquer / réafficher maintenus) | `outils/gomme.ts` | PL-02-02 |
| L2.4 | Ligne (chaîne, longueur et coordonnées, fermeture → face, flèches, Maj, cycle Alt, correction après coup) et Main levée | `outils/ligne.ts`, `outils/main-levee.ts` | PL-02-03 |
| L2.5 | Rectangle (dimensions, quadrant, mode centre, plans, « Carré », correction) et Rectangle tourné | `outils/rectangle.ts`, `outils/rectangle-pivote.ts`, `outils/commun-formes.ts` | PL-02-04 |
| L2.6 | Cercle et Polygone (côtés, `Ns`, Ctrl ±, bornes 3–999, inscrit / circonscrit, correction) | `outils/cercle.ts`, `outils/polygone.ts` | PL-02-05 |
| L2.7 | Arc par le centre, Arc 2 points (tangent, double-clic, Alt), Arc 3 points, Secteur | `outils/arc.ts`, `outils/arc-2-points.ts`, `outils/arc-3-points.ts`, `outils/secteur.ts` | PL-02-06 |
| L2.8 | Noyau complété pour les outils : `ajouterArc`, `ajouterSecteur`, `ajouterCourbeLibre`, `effacerAretes` (plusieurs en un pas), `effacerEntites`, `modifierAretes`, `aretesDeLaCourbe`, `aretesDeFace`, `facesDeLArete`, `entitesConnectees`, `matriceMonde` | `src/geometrie-libre.ts` | PL-01-01 (extension) |
| L2.9 | Interface : mode `planche` (`ModeTravail`), bouton, vue three.js, barre d'outils, grille, outil récent, recherche `Maj + -`, Instructeur, barre d'état `aria-live`, champ Mesures, clavier, Orbite / Panoramique / Zoom (D-157), barre de modificateurs au toucher, annuler / rétablir local, brouillon local IndexedDB | `apps/web/src/modules/atelier/nouveau/planche/` (`Planche.tsx`, `vue-planche.ts`, `outils-planche.ts`, `historique.ts`, `brouillon.ts`, `planche.css`, `planche.test.ts`), `AtelierNouveau.tsx`, `etat-ui.ts`, `messages.ts`, `atelier-nouveau.css`, `apps/web/package.json` | PL-02-07 |
| L2.10 | Recette Playwright desktop 1536 px + émulation mobile 390 px, inscrite au job e2e ; sélecteurs « Plan » des recettes existantes rendus exacts (`text-is`, le bouton « Planche » contenant « Plan ») | `apps/web/e2e/planche.mjs`, `.github/workflows/ci.yml`, `apps/web/e2e/*.mjs` | PL-02-07 |
| L2.11 | Fiches PL-02-01 à PL-02-07 (« prototype »), ce compte rendu, état des lots | `docs/planche/fiches/`, `docs/planche/lots/lot-2.md`, `docs/planche/README.md` | — |

**Non livré** : Texte 3D (§4.14, décision P-7 sur les polices — affiché « prévu au lot 2 ou 5 (décision P-7) »,
jamais actif) ; panneaux autres que l'Instructeur (§3.4, §6 : lot 5) ; palette `Ctrl K` en mode Planche ; raccourcis
attribuables (CA-RCH-2). Les outils des lots 3 à 6 sont présents dans la grille, grisés avec leur lot (R20).

## Critères du cahier et preuves

| Critère | Preuve |
| --- | --- |
| CA-SEL-1 à -7 | `selection.test.ts` (cas nommés « CA-SEL-n ») |
| CA-LAS-1, -2 | `lasso.test.ts` |
| CA-GOM-1 à -5 | `gomme.test.ts` |
| CA-LIG-1 à -6 | `ligne.test.ts` ; CA-LIG-2 aussi par `planche.mjs` (desktop et toucher) |
| CA-MLV-1 ; CA-MLV-2 **adapté** | `main-levee.test.ts` (→ au lieu de ↑, voir écarts) |
| CA-REC-1 à -4 | `rectangle.test.ts` ; CA-REC-1 aussi par `planche.mjs` (`4;3`) |
| CA-RTO-1 | `rectangle-pivote.test.ts` |
| CA-CER-1 à -5 | `cercle.test.ts` |
| CA-POL-1 à -3 | `polygone.test.ts` |
| CA-ARC-1, CA-A2P-1 à -3, CA-A3P-1, CA-SEC-1 | `arc.test.ts`, `arc-2-points.test.ts`, `arc-3-points.test.ts`, `secteur.test.ts` |
| CA-T3D-1, -2 | **Non livrés** (P-7) |
| CA-RCH-1 ; CA-RCH-2 | `planche.mjs` (« push », « pousser ») ; CA-RCH-2 **non livré** |
| CA-CAM-1, -2 | `planche.mjs` (Zoom `60`, Échap → outil précédent ; aucune requête de commande) |
| Recette du lot (§8) | `planche.mjs` : Planche ouverte, L, carré `4` Entrée × 4 → 1 face ; au toucher, barre de modificateurs visible, cibles ≥ 44 px, carré tracé ; aucun `POST /commands` ; axe-core desktop et mobile ; retour en Plan |

## Contrôles

| Contrôle | Commande | Résultat |
| --- | --- | --- |
| Modularité (R6) | `npm run typecheck` (`scripts/check-module-deps.mjs`) | Vert : « dépendances conformes aux manifestes » ; `planche-model` sans dépendance |
| Types | `npm run typecheck` | Vert dans tous les espaces de travail |
| Tests unitaires | `npm test` | `core-geometry` 47, `domain-model` 95, `atelier-model` 363, **`planche-model` 330** (177 du lot 1 + 153 des machines d'outils), **`web` 85** (dont `planche.test.ts` 13) : verts. **`api` : non exécuté** — `app.test.ts` et `atelier-commands.test.ts` exigent `DATABASE_URL` (aucune base PostgreSQL / PostGIS dans l'environnement de développement) |
| Construction | `npm run build` | Vert ; la Planche est un morceau chargé à la demande (`Planche-*.js` 187,1 kB, 55,9 kB gzip ; CSS 8,1 kB) |
| Syntaxe de la recette | `node --check apps/web/e2e/planche.mjs` | Vert |
| Recette Planche et recettes existantes | job `e2e` de la CI | **Non exécutées** (pas de base PostGIS ici) : à faire tourner en CI avant la demande d'acceptation (R19) ; aucun chiffre ⏱ n'est donc encore disponible |
| CI | intégration continue | **Non lancée** (aucun commit ni push demandé) |
| Hygiène (R18) | relecture | Ni secret, ni `node_modules`, ni `dist/`, ni HTML de référence parmi les fichiers du lot |

Un contrôle qui n'a pas pu tourner est déclaré ci-dessus, jamais tu.

## Écarts et décisions à trancher (maître d'ouvrage)

1. **Échap sans opération en cours** — l'interface livrée suit **D-156** (retour à l'outil précédent, sinon
   Sélection) ; le cahier propose le comportement **relevé** (C23, P-5 : un outil de dessin reste actif à l'étape 1 ;
   seules les caméras rendent l'outil précédent). Pendant un tracé, les deux s'accordent (l'opération est annulée,
   l'outil gardé). La recette vérifie le comportement livré et le signale comme écart. À trancher : P-5 (relevé, ou
   D-156 étendu à la Planche).
2. **Flèche ↑ de la Main levée (CA-MLV-2)** — le cahier écrit « ↑ avant le tracé → plan vertical » ; le catalogue et
   la machine donnent ↑ = plan perpendiculaire à l'axe bleu, donc **horizontal**, comme pour Rectangle et Cercle
   (→ et ← donnent les plans verticaux). Le test est adapté (→ → plan x = constante). À trancher : corriger le critère
   du cahier (→ ou ←) ou changer la convention de l'outil.
3. **Rectangle tourné, angle de l'étape 3** — l'angle du 2ᵉ côté est mesuré depuis la normale du plan de départ
   autour du 1ᵉʳ côté (90° = dans le plan, ce qui satisfait CA-RTO-1 `2;90` → posé au sol) ; le relevé affiche `0,0`
   au survol de l'étape 3, ce qui suggère une autre référence. Référence exacte non établie : relevé à refaire, ou
   convention retenue à confirmer.
4. **Texte 3D (P-7)** — non livré tant que la licence des polices n'est pas tranchée ; CA-T3D reportés au lot 5 selon
   la proposition du chef de projet.
5. **Panneaux** — seule l'Instructeur est livrée dans la colonne de droite ; Info entité, Composants, Matériaux,
   Styles, Balises, Ombres, Scènes, Affichage… sont au lot 5 (§8). À confirmer que la colonne réduite convient au lot 2.

Autres écarts déclarés (sans décision bloquante) :

- **Recherche** : `Maj + -` et bouton livrés ; la palette `Ctrl K` de l'Atelier n'est pas disponible en Planche (le
  clavier de l'Atelier y est coupé, sauf Ctrl + S), alors que §4.35 prévoit les deux ; raccourcis attribuables
  (CA-RCH-2) non livrés.
- **Locale du champ Mesures** : proposition P-3 appliquée (virgule décimale, point-virgule de liste) ; la forme
  `4,3` du relevé anglais y est **une** longueur (4,3 m) et la recette tape `4;3`. Unités anglo-saxonnes : le champ Mesures
  les accepte déjà (`5'`, `10"`, `2 ft`) — P-4 tranchée dans ce sens (D-167).
- **Comportements documentés ou de l'Instructor livrés comme choix Fadi déclarés** (C3, à confirmer par un relevé) :
  coordonnées `[x;y;z]` et `<dx;dy;dz>` (L-3), composante vide et valeurs négatives du Rectangle (L-20), `Ns` du
  Polygone et `Nr` de l'Arc 2 points (L-34), boucle fermée de Main levée → face et Ctrl ± (L-19), Ctrl + Maj de la
  Gomme (L-18), contour libre du Lasso (L-35), double-clic sur une arête, flèches ← ↑ ↓ et Maj des formes.
- **Choix Fadi d'interface** : tolérance d'accrochage 10 px (PL-01-03 proposait 12 px), glisser au-delà de 3 px
  (machines) / 4 px (vue), double-clic 400 ms et 6 px, historique local borné à 200 pas, couleurs et pictogrammes.
- **Main levée** enregistrée avec le genre de courbe `arc` (rayon 0) faute de genre `main-levee` au modèle (écart à
  PL-01-01, à reprendre au noyau).
- **Erreur de bornes des côtés** (3–999) annoncée dans la barre d'état, sans la boîte modale relevée.
- Le `README.md` de `packages/planche-model` ne décrit pas encore `src/outils/` ; la décision du lot 2 (D-165
  proposée) n'est pas encore consignée dans `docs/atelier/decisions.md`.

## Fiches du lot 1

Les fiches PL-01-01 à PL-01-04 restent à l'état **« spécifiée »** : `lots/lot-1.md` est toujours le compte rendu
**prévisionnel** (tâche L1.7 « fiches passées à prototype » et compte rendu définitif non faits) ; il ne justifie donc
ni « prototype » ni « vérifiée ». Le code du lot 1 est commité (`c8a863a`, D-164, 177 tests) : le passage à
« prototype » avec la preuve liée, puis à « vérifiée » après une CI verte et l'acceptation, reste à faire.

## Ce que le maître d'ouvrage pourra vérifier lui-même

- Ouvrir un projet, l'Atelier, « Planche » : bandeau « Brouillon local — non enregistré dans le projet (lot 7) » ;
  taper `L`, cliquer, orienter la souris, taper `4` Entrée quatre fois en tournant → un carré et sa face ;
- `R`, un clic, `4;3` Entrée → rectangle 4 × 3 ; Ctrl + Z / Ctrl + Y ; `Maj + -` puis « push » ;
- au téléphone : barre de touches Maj, Ctrl, Alt, flèches au-dessus de la barre du bas ;
- `npm test --workspace=@parcours/planche-model` : cas nommés « CA-… » comme dans les fiches PL-02-xx ;
- recette `BASE_URL=http://localhost:3001 node apps/web/e2e/planche.mjs` (API et base démarrées).

## Demande d'acceptation (à envoyer une fois la CI verte)

> Lot Planche 2 : mode Planche dans l'Atelier, rendu three.js, 13 outils de dessin (Sélection, Lasso, Gomme, Ligne,
> Main levée, Rectangle, Rectangle tourné, Cercle, Polygone, Arc, Arc 2 points, Arc 3 points, Secteur) en machines
> d'états pures, champ Mesures, recherche, Orbite / Panoramique / Zoom, barre de modificateurs au toucher, brouillon
> local sans aucune commande. Contrôles : typecheck, tests (hors `api`, sans base ici) et build verts ; recette
> Playwright et CI à faire tourner. Décisions demandées : écarts 1 à 5 ci-dessus (P-5, CA-MLV-2, angle du rectangle
> tourné, P-7, panneaux) et confirmation de P-2, P-3, P-4, P-11, P-12 telles qu'appliquées. Acceptez-vous le lot 2 et
> l'ouverture du lot 3 (outils de modification) ?


## Suite (7 octobre 2026)

Écarts 1 à 5 tranchés par délégation, voir D-167 : Échap = comportement relevé (appliqué au lot 3), CA-MLV-2 corrigé, angle du
rectangle tourné gardé, Texte 3D au lot 5, panneaux au lot 5. La recette `planche.mjs`, jamais lancée au lot 2, a été exécutée au
lot 3 : elle a révélé un défaut (message « Annulé : … » effacé au relâchement de Ctrl) corrigé dans `Planche.tsx`.
