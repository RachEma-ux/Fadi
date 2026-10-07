# Lot Planche 3 — Outils de modification — compte rendu

**Statut : code livré sur la branche `planche/lot-3` (tirée de `planche/lot-1`, qui porte les lots 1 et 2) ; recettes
navigateur exécutées ici ; CI GitHub et acceptation du maître d'ouvrage en attente** (7 octobre 2026). Cadre :
`docs/planche/cahier-planche.md` §8 (lot 3), §4.15–4.21, §4.26, §5.4 ; décisions déléguées : D-167.

## Ce qui est livré

Huit outils de modification, chacun une machine d'états **pure** (`packages/planche-model/src/outils/`) ; l'interface
traduit pointeur et clavier en événements et affiche la vue de l'outil, sans logique d'outil. Le dessin reste un
**brouillon local** (aucune commande, rien d'écrit dans le projet : lot 7).

| Tâche | Contenu | Fichiers | Fiche |
| --- | --- | --- | --- |
| L3.1 | **Pousser/Tirer** (`P`) : face cliquée suit sa normale, 2ᵉ clic ou distance ; signe, Ctrl = nouvelle face de départ, double-clic = répéter la distance, correction après coup en un pas, perçage, aperçu du prisme | `outils/pousser-tirer.ts` | PL-03-01 |
| L3.2 | **Déplacer** (`M`) : clic-clic, sélection ou choix par clic (face, objet, arête, sommet = étirement), flèches → ← ↑ ↓ et Maj, `[x;y;z]` / `<dx;dy;dz>`, **Ctrl = cycle Copier → Tamponner → Déplacer**, réseau `x3` `3x` `/3`, ré-espacement, tampon à un pas par copie | `outils/deplacer.ts` | PL-03-02 |
| L3.3 | **Faire pivoter** (`Q`) : centre, départ, angle ; rapporteur, plan par flèches ← → ↑ ou face survolée, accrochage à 15°, `30` / `1:2`, Ctrl = copie, réseau polaire `x5`, correction après coup | `outils/faire-pivoter.ts` | PL-03-03 |
| L3.4 | **Échelle** (`S`) : boîte englobante et **26 poignées**, ancrage opposé ou centre (Ctrl), uniforme / non uniforme (Maj inverse), facteur au curseur, `2`, `3m`, `2;3;4`, négatif = miroir, correction après coup | `outils/echelle.ts` | PL-03-04 |
| L3.5 | **Décalage** (`F`) : face (anneau + face intérieure, sens = côté du curseur) et arêtes continues (polyligne parallèle sans face), double-clic = même distance, correction après coup | `outils/decalage.ts` | PL-03-05 |
| L3.6 | **Suivez-moi** : profil extrudé sur le périmètre d'une face ou sur des arêtes continues présélectionnées, coins à onglet, faces planes, surface fermée | `outils/suivez-moi.ts` | PL-03-06 |
| L3.7 | **Retourner** : trois plans rouge / vert / bleu, clic = miroir en place, Ctrl = copie, glisser d'un plan en copie + décalage saisi, flèches ← → ↑ | `outils/retourner.ts` | PL-03-07 |
| L3.8 | **Diviser** : « Segments » (5 par défaut), points de division au survol, retour automatique à Sélection | `outils/diviser.ts` | PL-03-07 |
| L3.9 | Noyau : `diviser`, `decalerAretes`, `suivezMoi` (les autres opérations — `pousserTirer`, `deplacer`, `copier`, `tourner`, `mettreAEchelle`, `retourner`, `decaler` — existaient depuis le lot 1) ; `Transition.outil` (outil à activer après une transition) ; aides `commun-modif.ts` ; registre `registre-modification.ts` | `geometrie-libre.ts`, `outils/machine.ts`, `commun-modif.ts`, `registre-modification.ts` | PL-01-01 (extension) |
| L3.10 | Interface : outils de modification disponibles (plus grisés), **Diviser offert dans la grille** (son menu contextuel est au lot 5), `Transition.outil` appliqué, Échap selon P-5, message non effacé au relâchement d'une touche | `Planche.tsx`, `outils-planche.ts`, `planche.test.ts` | PL-02-07 (extension) |
| L3.11 | Recette navigateur : `planche-modification.mjs` (Déplacer, Échelle, Retourner, Faire pivoter, Décalage) inscrite à la CI ; `planche.mjs` étendue (Pousser/Tirer « 2,7 », Diviser « 4 », annuler / rétablir ×2, rechargement) | `apps/web/e2e/`, `.github/workflows/ci.yml` | — |
| L3.12 | Fiches PL-03-01 à PL-03-07, ce compte rendu, D-166 et D-167, état des lots | `docs/planche/`, `docs/atelier/decisions.md` | — |

**Non livré** (déclaré, jamais tu) : Texte 3D (P-7, lot 5) ; panneaux autres que l'Instructeur (lot 5) ; palette
`Ctrl K` et raccourcis attribuables en Planche ; autres écarts par outil ci-dessous.

## Critères du cahier et preuves

| Critère | Preuve (`packages/planche-model/src/outils/…`) |
| --- | --- |
| CA-PPT-1 à -6 | `pousser-tirer.test.ts` (cas nommés « CA-PPT-n ») — boîte 6 faces / 12 arêtes / 32,4 m³, `-3` vers −y, trou traversant, Ctrl + 1, double-clic, une seule opération |
| CA-DEP-1 à -6 | `deplacer.test.ts` — translation exacte (5;0;0), réseau 0-5-10-15 puis 0-2-4-6 en un pas, `/3`, trois Ctrl, tampon 3 pas, arête montée de 1 (trapèzes, planarité 1e-9) |
| CA-ROT-1 à -4 | `faire-pivoter.test.ts` — 30° exact, `1:2` à 1e-12, réseau polaire (6 positions, un pas), ← = axe y |
| CA-ECH-1 à -4 | `echelle.test.ts` — 8 × 6 × 5,4 coin opposé fixe, `3m` = hauteur 3 base fixe, Ctrl = centre fixe, **26 poignées** (8 + 12 + 6) |
| CA-DEC-1 à -3 | `decalage.test.ts` — 3,4 × 2,4 et anneau 3,84 m² ; second anneau ; deux arêtes en L → 2 arêtes, 0 face |
| CA-SUI-1 | `suivez-moi.test.ts` + `modification-noyau.test.ts` — muret fermé : 16 faces de balayage + sol intérieur, planes (1e-9), chaque arête du muret a exactement deux faces, aires 4,96 m² dessus et dessous |
| CA-RET-1, -2 | `retourner.test.ts` — x ↦ 2c − x ; copie par plan à 1 m (y ↦ 5 − y), original inchangé, un pas |
| CA-DIV-1 | `diviser.test.ts`, `modification-noyau.test.ts` — 3 arêtes de 1 m, contour de la face à 6 sommets, outil Sélection rétabli |
| Recette du lot (§8) | `planche.mjs` et `planche-modification.mjs` (voir « Contrôles ») |

Les invariants (planarité, étanchéité) sont contrôlés **dans les tests cités** (CA-DEP-6, CA-SUI-1, sommet monté) ; ils ne
sont pas vérifiés automatiquement après chaque opération de chaque outil.

## Contrôles

| Contrôle | Commande | Résultat |
| --- | --- | --- |
| Modularité (R6) | `npm run typecheck` | Vert : « dépendances conformes aux manifestes » ; `planche-model` sans dépendance |
| Types | `npm run typecheck` | Vert dans tous les espaces de travail |
| Tests unitaires | `npm test` | `core-geometry` 47, `domain-model` 95, `atelier-model` 363, **`planche-model` 399** (330 + 69), **`web` 87** (85 + 2), **`api` 87** : tous verts. L'API a été exécutée ici sur PostgreSQL 16 + PostGIS 3.4 avec `AUTH_RATE_LIMIT=500` et `API_RATE_LIMIT=5000` comme la CI |
| Construction | `npm run build` | Vert ; morceau `Planche-*.js` **231,4 kB, 68,5 kB gzip** (lot 2 : 187,1 kB, 55,9 kB gzip), CSS 7,9 kB |
| Recette Planche (lots 2 et 3) | `node apps/web/e2e/planche.mjs` contre l'API qui sert le build | **Verte** (desktop et mobile émulé, axe-core sans violation critique ou sérieuse, aucune commande émise, aucune erreur JS) |
| Recette des outils de modification | `node apps/web/e2e/planche-modification.mjs` | **Verte** |
| CI GitHub | intégration continue | **Non lancée** (aucune demande de fusion ouverte) |

Premier contrôle réel de la recette `planche.mjs` écrite au lot 2 : elle a révélé **un défaut du lot 2**, corrigé ici —
le relâchement de Ctrl après Ctrl + Z effaçait le message « Annulé : … » (un événement « touche relâchée » vidait le message).

**Mesures** (Chromium sans carte graphique dans un conteneur, ordre de grandeur seulement ; 2ᵉ exécution) : ouverture de la
Planche 652 ms (three.js compris) ; carré de 4 m au champ Mesures 955 ms ; rectangle 4 × 3 595 ms ; recherche d'outil 62 ms ;
Pousser/Tirer « 2,7 » 239 ms ; ouverture au téléphone 634 ms ; carré au toucher 408 ms.

## Décisions prises par délégation du maître d'ouvrage (7 octobre 2026)

Le maître d'ouvrage a délégué les choix (« je te délègue de faire les choix »). Elles sont consignées en **D-167** ; en résumé :
écarts du lot 2 — **Échap : comportement relevé** (P-5), **critère CA-MLV-2 corrigé** (→ ou ←), angle du rectangle tourné
**gardé** (relevé à refaire), **Texte 3D au lot 5**, colonne de panneaux **réduite** jusqu'au lot 5 ; décisions P-1 à P-12 du cahier :
propositions du chef de projet retenues (voir D-167). Choix propres au lot 3 : voir ci-dessous.

## Écarts et choix Fadi déclarés

- **Pousser/Tirer** : Alt (étirement) est une bascule sans effet distinct (identique sur boîte orthogonale, relevé) ; « un clic
  n'importe où reprend la face extrudée » (instr) non livré.
- **Déplacer** : Alt (pliage automatique) est une bascule — le noyau plie toujours une face devenue non plane ; poignées de
  rotation de la boîte (« Show Move tool rotation grips ») non livrées ; après une copie, le mode revient à Déplacer
  (tampon excepté) ; la copie posée devient la sélection ; les entités déplacées sont figées au 1ᵉʳ clic.
- **Faire pivoter** : accrochage de l'angle aux multiples de 15° à ±1,5° (graduations de 15° relevées en doc, tolérance Fadi) ;
  plan = face survolée **seulement** quand le curseur est sur la face (pas sur un sommet), sinon sol ; Maj (verrou du
  rapporteur), flèches après le 1ᵉʳ clic et axe quelconque par glisser du rapporteur (instr) non livrés ; « /3 » en réseau
  polaire divise l'angle (choix Fadi).
- **Échelle** : avec une poignée uniforme, une dimension cible s'applique à la **plus grande** dimension de la boîte ; composants
  verrouillés (contour rouge) non modélisés ; boîte axée sur les axes du monde.
- **Décalage** : le noyau ne traite que le contour extérieur d'une face (pas de trous), sans élagage des recouvrements (Alt
  non modélisé) ; arêtes : le sens est celui du curseur, la distance toujours positive.
- **Suivez-moi** : le chemin doit être **présélectionné** (face ou arêtes continues) — sans présélection le relevé ne décrit
  rien, un message le dit ; révolution autour d'un cercle et Alt (périmètre) (doc) non livrés ; les arêtes d'**onglet** restent
  visibles sur les faces coplanaires, et l'arête du chemin reste en place (elle divise le dessous) ; la face du profil est
  consommée.
- **Retourner** : le décalage du plan miroir est mesuré **depuis le centre** de la boîte vers le côté du glisser (choix Fadi) ;
  Alt (axes de l'objet) et plan magenta d'une face survolée (doc) non livrés ; fiche Instructeur absente du relevé.
- **Diviser** : l'arête cliquée est divisée (une courbe se divise arête par arête) ; bornes 1 à 9999 (choix Fadi) ; offert dans
  la grille tant que le menu contextuel (lot 5) n'existe pas.
- **Collage après transformation** : les **copies** (Ctrl) sont insérées avec collage (chevauchements découpés). Pour un
  **déplacement / rotation / échelle sur place**, seuls les sommets confondus fusionnent : l'intersection avec la géométrie
  traversée n'est pas recalculée (limite du noyau du lot 1, §5.4 incomplet).
- **Le noyau accepte les unités anglo-saxonnes** (`5'`, `10"`, `2 ft`, P-4) ; la phrase « refusées » du compte rendu du lot 2
  était inexacte.

## Ce que le maître d'ouvrage pourra vérifier lui-même

- Planche → `R`, un clic, `4;3` Entrée ; `P`, un clic sur la face, `2,7` Entrée → une boîte ; `Maj + -` « diviser », un clic sur
  une arête, `4` Entrée ;
- `M`, un clic, `→`, `2` Entrée ; `S`, une poignée de coin, `2` Entrée ; `Q`, centre, départ, `90` Entrée ; `F`, un clic sur
  la face, `0,3` Entrée ; `Retourner` par la recherche puis `→` ; Ctrl + Z / Ctrl + Y après chaque opération ;
- `npm test --workspace=@parcours/planche-model` : cas nommés « CA-… » comme dans les fiches PL-03-xx ;
- `BASE_URL=http://localhost:3001 node apps/web/e2e/planche.mjs` puis `planche-modification.mjs` (API et base démarrées).

## Demande d'acceptation (après CI verte)

> Lot Planche 3 : huit outils de modification en machines d'états pures — Pousser/Tirer, Déplacer (copie, tampon, réseau,
> étirement d'arête et de sommet), Faire pivoter (réseau polaire, pente), Échelle (26 poignées), Décalage (face et arêtes),
> Suivez-moi, Retourner, Diviser — dans le mode Planche, en brouillon local. Contrôles : typecheck, 399 + 87 + 87 tests, build,
> recettes navigateur desktop et mobile verts ; CI à confirmer. Décisions prises par délégation : D-167. Acceptez-vous le lot 3
> et l'ouverture du lot 4 (Mètre, Cotes, Rapporteur, Axes, Texte, Plan de coupe, caméras) ?
