# Lot Planche 4 — Mesure, annotation, caméra — compte rendu

**Statut : code livré sur la branche `planche/lots-4-6` (tirée de `main` après l'audit, D-169), avec les lots 5 et 6 ;
recettes navigateur exécutées ici ; CI GitHub et acceptation du maître d'ouvrage en attente** (7 octobre 2026). Cadre :
`docs/planche/cahier-planche.md` §8 (lot 4), §4.27–4.32, §4.34 ; décisions déléguées : D-170. Le maître d'ouvrage a demandé
l'implémentation des 20 outils « prévus » (grisés avec leur lot) en une fois ; les trois lots sont livrés ensemble mais
restent trois comptes rendus et trois jeux de critères.

## Ce qui est livré

Onze outils : six machines d'états **pures** (`packages/planche-model/src/outils/`) et cinq outils de caméra tenus par la vue
(état de vue, jamais une donnée, R10). Les annotations (guides, cotes, textes, plans de coupe, repère de saisie) sont des
**données de la Planche** (`Modele.annotations`, `annotations.ts`), versionnées avec la géométrie : un pas d'annulation
chacune, effacées par Suppr comme une entité, à l'échelle avec le redimensionnement. Le dessin reste un **brouillon local**.

| Tâche | Contenu | Fichiers | Fiche |
| --- | --- | --- | --- |
| L4.1 | **Mètre** (`T`) : aire au survol d'une face, distance au survol, ligne de guide infinie depuis une arête, guide fini entre deux points, point de guide (Ctrl), mode Mesure (Ctrl ×2), redimensionnement de la Planche entière après confirmation (Entrée), lecteur = mesure seule | `outils/metre.ts` | PL-04-01 |
| L4.2 | **Cotes** : cote d'arête, cote entre deux points (associée aux sommets : la valeur suit un déplacement), cote de diamètre « ⌀ » sur un cercle ; étiquettes posées par la vue | `outils/cotation.ts` | PL-04-02 |
| L4.3 | **Rapporteur** : centre, début, angle au curseur ou saisi (`30`, pente `4:12`), ligne de guide ; Ctrl = bascule de création des guides | `outils/rapporteur.ts` | PL-04-02 |
| L4.4 | **Axes** : origine, rouge, vert → **repère de saisie** (R5 : les coordonnées stockées ne changent pas) ; double-clic = axes tels qu'orientés ; Alt = orientation alternative ; retour à l'outil précédent ; `[x;y;z]` et `<dx;dy;dz>` lus dans ce repère par tous les outils (`saisie-vcb.ts`) ; inférences d'axes alignées sur le repère | `outils/axes.ts`, `saisie-vcb.ts`, `inference.ts` | PL-04-03 |
| L4.5 | **Texte** : texte avec repère (épingle sur une face / arête / point, texte proposé : aire, longueur ou coordonnées) et texte écran (clic dans le vide, en pixels) ; la saisie est faite par l'interface (`Transition.editerTexte`), Échap garde le texte proposé | `outils/texte.ts` | PL-04-04 |
| L4.6 | **Plan de coupe** : aperçu du plan sur la face survolée (couleur de l'axe), Maj = verrou, flèches = orientation, pose → plan actif sélectionné, outil Sélection ; barre « Inverser / Coupe active / Effacer » ; coupe rendue par `clippingPlanes` | `outils/plan-de-coupe.ts`, `vue-planche.ts`, `Planche.tsx` | PL-04-05 |
| L4.7 | **Zoom étendu** (`Ctrl+Maj+E`, immédiat), **Zoom fenêtre** (`Maj+W`, temporaire), **Positionner la caméra** (décalage de hauteur 1,68 m, puis Regarder autour), **Regarder autour** (pivot sur place, Hauteur d'œil au champ Mesures), **Marcher** (avancer / tourner, Maj = vertical et latéral, Ctrl = courir) | `vue-planche.ts`, `outils-planche.ts`, `Planche.tsx` | PL-04-06 |
| L4.8 | Noyau : `Annotations` (`annotations.ts`), `modifierAnnotations`, `redimensionner`, annotations dans `aplatir` / `effacerEntites` ; `ContexteOutil.repere` / `lecture` ; `Transition.outilPrecedent` / `editerTexte` ; `VueOutil.apercu.etiquettes` / `plan` / `rapporteur` ; `viserAnnotation` (sélection et Suppr d'une annotation) ; registre `registre-mesure.ts` | `geometrie-libre.ts`, `outils/machine.ts`, `outils/selection.ts` | PL-01-01 (extension) |
| L4.9 | Rendu : guides en pointillé, cotes avec lignes d'attache et étiquettes DOM (`.planche-etiquette`), textes, rectangles des plans de coupe, repère de saisie (axes déplacés), étiquettes d'aperçu ; `cadrer`, `zoomFenetre`, `positionnerCamera`, `regarder`, `marcher`, `hauteurOeil`, `emprise` | `vue-planche.ts`, `planche.css` | PL-02-07 (extension) |
| L4.10 | Recette navigateur `planche-lots-4-6.mjs` (inscrite à la CI après `planche-outils.mjs`) ; `planche-outils.mjs` : plus aucun outil grisé ; `planche.test.ts` : les 20 outils disponibles | `apps/web/e2e/`, `.github/workflows/ci.yml` | — |

**Non livré** (déclaré) : Info entité des cotes et textes (police, taille, extrémités : lot 5, panneaux) ; menu contextuel des axes
(Aligner, Déplacer, Réinitialiser, Masquer) — Ctrl + Z retire le repère ; nom et symbole du plan de coupe à la pose (boîte doc, non
vue) — nom « Plan de coupe N » ; détection de collision de Marcher (Alt sans effet) ; l'aire d'un texte avec repère est figée à la
création (CA-TXT-1, choix déclaré).

## Critères du cahier et preuves

| Critère | Preuve |
| --- | --- |
| CA-MET-1 à -4 | `outils/mesure.test.ts` — aire « 10,8 m² » au survol, guide infini à 1 m depuis une arête, mode Mesure sans guide, lecteur sans guide ; redimensionnement « 8 » + Entrée × 2 ; e2e : mètre (9 vérifications) |
| CA-COT-1, -2 | `mesure.test.ts` — cote « 4,00 m » associée qui suit un sommet déplacé (1e-9), « ⌀ 1,20 m » ; e2e : cotes (8) |
| CA-RAP-1 | `mesure.test.ts` — direction (cos 30° ; sin 30° ; 0), aucun guide quand Ctrl désactive la création ; e2e : rapporteur (5) |
| CA-AXE-1, -2 | `mesure.test.ts` — `[1;0;0]` lu dans le repère → (1;3;0) ; annuler rétablit ; e2e : axes (5) |
| CA-TXT-1 | `mesure.test.ts` — texte par défaut « 10,8 m² » puis remplacé ; texte écran ; e2e : texte (8) |
| CA-CPE-1, -2 | `mesure.test.ts` — plan actif de normale +z, outil Sélection, plan sélectionné ; Inverser et Coupe active ; e2e : plan de coupe (6) |
| CA-CAM-3, -4 | e2e : Zoom étendu cadre le rectangle dans la zone non couverte (marges mesurées sur la barre d'outils, la colonne et le pied) ; Positionner la caméra → œil en P + (0;0;1,68), Regarder autour actif (10 vérifications caméra) |
| R10 / R13 | Les caméras ne touchent pas au modèle (`pas` inchangé) ; `ContexteOutil.lecture` = lecteur : Mètre mesure sans créer (CA-MET-4), les autres outils du lot sont refusés en lecture seule (`planche.test.ts`) |

## Contrôles

| Contrôle | Commande | Résultat |
| --- | --- | --- |
| Types | `npm run typecheck` | Vert dans tous les espaces de travail |
| Tests unitaires | `npm test` | `core-geometry` 47, `domain-model` 95, `atelier-model` 363, **`planche-model` 442** (399 + 43), **`web` 98** (87 + 11 dont 4 avec manifold-3d en Node), **`api` 87** (PostgreSQL 16 + PostGIS, `AUTH_RATE_LIMIT=500`, `API_RATE_LIMIT=5000`) : tous verts |
| Construction | `npm run build` | Vert ; manifold-3d dans un morceau séparé chargé à la demande (voir lot 6) |
| Recettes Planche | `planche.mjs`, `planche-modification.mjs`, `planche-outils.mjs`, `planche-boutons.mjs`, `interface-anglais.mjs` | Vertes ici (contre l'API qui sert le build) |
| Recette des lots 4 à 6 | `node apps/web/e2e/planche-lots-4-6.mjs` | **Verte : 117 vérifications**, aucune erreur JS ; captures `planche-lot4-*.png` |
| CI GitHub | intégration continue | À confirmer sur la demande de fusion |

## Écarts et choix Fadi déclarés

- **Mètre** : la ligne de guide depuis une arête est infinie (relevé) ; entre deux points libres, le guide est fini (segment) ;
  entre deux points accrochés (extrémités) il n'y a pas de guide mais une mesure, qui ouvre le redimensionnement ; le
  redimensionnement demande une confirmation par Entrée et agit sur **toute** la Planche (géométrie, occurrences, annotations).
- **Cotes** : étiquette « 4,00 m » (deux décimales, virgule) ; pas d'Info entité ; la cote suit ses sommets quand elle leur est associée.
- **Rapporteur** : accrochage à 15° à ±1,5° comme Faire pivoter ; Ctrl bascule la création des guides.
- **Axes** : le repère est une donnée de la Planche (annulable, R5) ; les inférences d'axes et les couleurs suivent le repère.
- **Texte** : la saisie se fait dans une zone de texte flottante (Entrée valide, Maj + Entrée = retour à la ligne, Échap garde le
  texte proposé) ; texte écran proposé « Saisissez le texte ».
- **Plan de coupe** : rectangle du plan = étendue de la face visée (ou 1 m autour du point) ; une seule coupe rendue à la fois
  (le dernier plan actif) ; la barre Inverser / Coupe active / Effacer remplace le menu contextuel.
- **Caméra** : Zoom étendu ne change pas l'outil actif ; Zoom fenêtre rend l'outil précédent ; Positionner la caméra enchaîne
  sur Regarder autour (l'outil « précédent » reste celui d'avant Positionner) ; Marcher sans collision.

## Ce que le maître d'ouvrage pourra vérifier lui-même

- Planche → `R`, un clic, `4;3` Entrée ; `T`, clic sur une arête puis dans le vide → un guide ; « … » → Cotation, clic sur une
  arête puis à côté → « 4,00 m » ; « … » → Rapporteur, trois clics ou `30` Entrée ; « … » → Axes, trois clics ; Texte, clic sur
  la face puis à côté → « 12,0 m² » proposé ; Plan de coupe sur une boîte, puis Inverser dans la barre ;
- « … » → Zoom étendu ; Zoom fenêtre (glisser) ; Positionner la caméra (clic au sol) puis glisser (Regarder autour), `2` Entrée ;
  Marcher (glisser vers le haut) ; Échap rend Sélection ;
- `npm test --workspace=@parcours/planche-model` : cas nommés « CA-MET… CA-CPE… » ;
- `BASE_URL=http://localhost:3001 node apps/web/e2e/planche-lots-4-6.mjs`.
