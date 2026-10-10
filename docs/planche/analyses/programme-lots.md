# Programme de réalisation — améliorations des outils de la Planche (lots Planche 8 à 18)

**10 octobre 2026.** Engagé par la demande du maître d'ouvrage du 10 octobre 2026 (« Refais tout le travail dans la
Planche de Fadi et implémente les mêmes fonctions dans la Planche de Fadi », D-200). Sources : `rapport-metalfab-par-categorie.md`
(fonctions F1–F16 de DBS MetalFab 2.2), `table-ameliorations-outils.md` (une ligne par outil, colonne « Lot proposé »),
la critique externe transmise par le maître d'ouvrage, le code de `main` et des PR #109 et #110 (comptées comme état
courant). DrawAll est hors périmètre sur instruction du maître d'ouvrage.

## Principes

- **Un lot = une PR**, petite, livrable seule, avec ses tests ; **un lot à la fois** ; acceptation du maître d'ouvrage
  entre deux lots (`CLAUDE.md`). La numérotation continue celle de la Planche (lots 1 à 7 acceptés, D-174) : **lot 8**,
  **lot 9**… ; fiches `docs/planche/fiches/PL-08-01.md`, etc., écrites à l'état « spécifiée » **avant** le code (R8) ;
  compte rendu `docs/planche/lots/lot-N.md` à la livraison ; décision consignée dans `docs/atelier/decisions.md`.
- **Valeur d'abord** : les deux premiers lots corrigent ce que la critique a relevé sur l'existant (modes de
  Pousser/Tirer, registre et clavier) parce que tous les outils suivants en dépendent ; viennent ensuite Suivez-moi, puis
  la chaîne « profilés » (noyau, outils, assemblages, débit), la révolution et le Texte 3D.
- **Règles tenues dans chaque lot** : géométrie dans `packages/planche-model` (aucune dépendance, aucun import de React,
  three.js ou du DOM) ; textes en français dans `apps/web/src/modules/atelier/nouveau/messages.ts` avec leur traduction
  anglaise (et `en.json` pour ce qui passe par le traducteur du DOM), recette `interface-anglais.mjs` verte ; **aucune
  donnée inventée** : dimensions de profilés, masses linéiques et masses volumiques viennent d'un catalogue importé
  sourcé (D-180) ou d'une saisie, sinon « non évaluée » ; chaque nouvel outil est un **écart Fadi déclaré** (statut
  `fadi`) dans le cahier de la Planche ; une opération = un pas d'annulation = une commande `planche.operation` (lot 7) ;
  `npm run typecheck`, `npm test`, `npm run build` avant commit, recette Playwright du lot ajoutée à la CI, un contrôle
  qui n'a pas pu tourner est déclaré.
- **Décisions réservées** au maître d'ouvrage, non engagées par ce programme : coûts et prix, imbrication en barres,
  conversion d'une pièce de la Planche en objet d'une ontologie de l'Atelier (P-10), nouvelle forme de section (C à
  bords tombés). Elles sont rappelées en fin de document.

## Vue d'ensemble

| Ordre | Lot | Contenu | Priorité | Dépend de |
| --- | --- | --- | --- | --- |
| 1 | **L8** | Pousser/Tirer : modes explicites, événement de configuration commun (clavier, barre, toucher), vrai Étirement | Haute | PR #109, #110 fusionnées |
| 2 | **L9** | Registre unique des commandes, raccourcis générés, conflits, identités distinctes, focus (Tab, flèches), nature des options | Haute | L8 |
| 3 | **L10** | Suivez-moi complet : profils à trous, chemin interactif, aperçu, Alt = périmètre | Haute | L9 |
| 4 | **L11** | Noyau « pièce de profilé » : balayage d'une section le long d'arêtes, placement 5 points, rotation 90°, décalage de longueur, liens | Haute | L10 |
| 5 | **L12** | Outils « Profilé » et « Profilés depuis arêtes », sections saisies ou de catalogue sourcé | Haute | L11 |
| 6 | **L13** | Onglet, coupe par profil, allonger / raccourcir une pièce | Haute | L12 |
| 7 | **L14** | Liste de débit de la Planche, repères, étiquettes, sélection depuis la liste, masse sourcée seulement | Haute | L13 |
| 8 | **L15** | Révolution (axe + angle) | Haute | L9, L10 (aperçu) |
| 9 | **L16** | Texte 3D : aperçu en volume, alignement, pose sur une face | Moyenne | L9 |
| 10 | **L17** | Édition et régénération d'une pièce, rotation axiale, alignement de face, échelle de pièce, accrochage à l'axe | Moyenne | L12 |
| 11 | **L18** | Compléments des outils de modification (Décalage à trous et Alt, Faire pivoter, Retourner, poignées de Déplacer) | Moyenne / Basse | L9 |

L15 et L16 ne dépendent pas de la chaîne profilés : le maître d'ouvrage peut les avancer avant L11 s'il le souhaite.

---

## L8 — Pousser/Tirer : modes explicites et vrai Étirement

**Portée.**
- Nouvel événement de machine `{ genre: "configurer", option: string, valeur: string | boolean }` dans
  `EvenementOutil` (`machine.ts`) et nouveau champ `VueOutil.options` (liste déclarée par l'outil : identifiant, libellé
  du catalogue de messages, valeurs, valeur courante, nature). **Un seul chemin** : la touche Alt / Ctrl / Maj / ↓, le
  bouton de la barre d'opérations et le bouton de la barre de touches au toucher émettent tous `configurer` (la machine
  ne reçoit plus de bascule implicite pour ces modes).
- Pousser/Tirer déclare l'option `mode` : **Normal**, **Nouvelle face** (Ctrl, relevé), **Étirement** (Alt sur une face,
  relevé « instr »), **Tube sans fond** (D-199), **Des deux côtés** (arêtes, D-196), **Allonger** (↓ sur une arête,
  D-197). Les modes valables dépendent de la cible survolée (face ou arête) ; un mode non valable est grisé avec son motif.
- **Alt n'a plus deux sens** : sur une face, Alt choisit Étirement ; sur une arête, « Des deux côtés » prend une autre
  touche ou seulement son bouton — choix à arrêter dans la fiche PL-08-01 (proposition : Alt reste « Des deux côtés » sur
  une arête, puisque l'Étirement n'a pas de sens pour une arête ; les deux sont des entrées distinctes du registre).
- **Tube sans fond quitte Maj** (Maj est la touche des raccourcis Fadi, PR #110) : bouton de la barre et option
  `mode=tube` ; la touche de remplacement éventuelle est fixée au registre (L9). Écart à D-199 déclaré.
- **Étirement réel** (noyau `etirerFace` dans `geometrie-libre.ts`) : les sommets du contour de la face sont translatés
  selon sa normale ; chaque face voisine qui reste plane est étirée (ses sommets suivent) ; si une voisine deviendrait
  non plane, refus nommé (« L'étirement rendrait la face … non plane ») — aucune face ajoutée, aucune correction.
- Barre d'opérations (PR #110) : section **« Options »** en tête quand l'outil actif en déclare.

**Fichiers probables.** `packages/planche-model/src/outils/machine.ts`, `outils/pousser-tirer.ts`,
`src/geometrie-libre.ts`, `src/catalogue-outils.ts` (modificateurs de Pousser/Tirer), `apps/web/.../planche/Planche.tsx`
(barre de touches → `configurer`), `BarreOutilsFlottante.tsx`, `BoutonOutils.tsx`, `barres-outils.ts`, `messages.ts`,
`apps/web/src/lib/i18n/en.json`, `docs/planche/cahier-planche.md` §4.15, fiche `PL-08-01.md`.

**Tests.** Vitest : `etirerFace` (prisme à face voisine inclinée : même nombre de faces, voisine étirée ; voisine qui
deviendrait gauche → refus, modèle inchangé) ; machine : les trois sources d'un même mode donnent le même état ; Normal,
Nouvelle face, Tube, Des deux côtés, Allonger inchangés (tests existants de `pousser-tirer.test.ts` et
`etirer-aretes.test.ts` verts). Playwright `apps/web/e2e/planche-pousser-modes.mjs` : bouton « Étirement » puis tirage,
Alt puis tirage, bouton au toucher (390 px) → même géométrie ; Maj+P depuis Pousser/Tirer choisit Polygone sans changer
de mode.

**Critères d'acceptation.** Les modes sont visibles et nommés dans la barre ; `aria-pressed` sur le mode courant ;
l'Étirement a un effet géométrique distinct de Normal sur un prisme à face inclinée ; un pas d'annulation par tirage ;
aucune régression des CA-PPT-1 à 13.

**Risques.** Changer la touche du tube sans fond contredit D-199 (à déclarer et faire accepter) ; l'étirement de faces non
orthogonales peut gauchir des voisines (refus nommé plutôt que correction).

**Dépendances.** PR #109 et #110 fusionnées sur `main`.

---

## L9 — Registre unique des commandes et clavier

**Portée.**
- `packages/planche-model/src/registre-commandes.ts` (pur) : une entrée par commande — outil, option d'outil, commande
  de la Planche (G, K, Ctrl+G, Ctrl+A, Ctrl+Maj+I…) — avec `id`, clé de libellé, **portée** (`planche`, `outil:<id>`,
  `liste-outils`, `champ-mesures`), raccourci relevé, raccourci Fadi, **nature** (`creation`, `accrochage-temporaire`,
  `contrainte-persistante`, `option`, `commande`), statut de relevé. Le catalogue relevé reste intouché ; la couche
  `RACCOURCIS_FADI` et les touches codées en dur de `Planche.tsx` y sont reportées.
- **Conflits** détectés par test : deux commandes, une touche, une portée → échec ; une touche d'activation (Maj + lettre)
  ne peut pas être un modificateur en cours d'opération de l'outil actif (règle de la critique) ; deux libellés affichés
  identiques dans une même portée → échec (« Ajuster (solides) » distinct de tout futur rognage d'arêtes).
- Le clavier de la Planche lit le registre (une fonction de résolution pure : événement + focus → commande) ; la table des
  raccourcis de la documentation est **générée** (`scripts/` + test d'égalité) au lieu d'être tenue à la main.
- **Focus** : motif de barre d'outils W3C pour la barre de gauche, les barres flottantes et la barre de touches (un seul
  arrêt de tabulation, flèches à l'intérieur, Origine / Fin) ; **Tab** ne sert qu'à déplacer le focus ; les flèches
  vont à l'outil seulement quand le focus est sur le dessin ou le champ Mesures.
- Instructeur : chaque modificateur et option affiche sa nature.

**Fichiers probables.** `packages/planche-model/src/registre-commandes.ts` (+ test), `src/index.ts`,
`apps/web/.../planche/outils-planche.ts`, `barres-outils.ts`, `Planche.tsx`, `BarreOutilsFlottante.tsx`,
`BoutonOutils.tsx`, `messages.ts`, `docs/planche/lots/barre-outils.md` (table générée), fiche `PL-09-01.md`.

**Tests.** Vitest : registre complet (45 outils + options + commandes), aucun conflit, table générée identique ;
résolution clavier selon le focus. Playwright `planche-clavier-focus.mjs` : Tab traverse chaque barre en un arrêt,
flèches dans la barre sans verrou d'axe, flèche sur le dessin = verrou ; axe-core sans violation sur les barres.

**Critères d'acceptation.** Chaque raccourci affiché vient du registre ; aucun conflit ; comportement des raccourcis
relevés inchangé ; les recettes `planche-*.mjs` existantes restent vertes.

**Risques.** Recettes existantes qui pressent des flèches avec le focus sur un bouton (à adapter) ; volume du report.

**Dépendances.** L8 (l'événement `configurer` et les options sont des entrées du registre).

---

## L10 — Suivez-moi complet

**Portée.**
- **Profils à trous** : `suivezMoi` balaie le contour extérieur **et** chaque trou (faces latérales intérieures, capuchons
  annulaires aux extrémités d'un chemin ouvert) ; la condition « Le profil ne doit pas avoir de trou » disparaît.
- **Chemin interactif** : sans présélection, un clic sur la face du profil puis le déplacement du curseur le long des
  arêtes connectées construit le chemin (arêtes suivies depuis l'arête survolée la plus proche) ; clic final ou Entrée
  pour valider ; la présélection reste possible.
- **Aperçu** : fil de fer du balayage (`VueOutil.apercu`) avant validation, identique au résultat.
- **Alt = périmètre** de la face du chemin (relevé « doc », livré comme choix déclaré) — option de l'outil (L8).
- Arêtes d'onglet coplanaires fusionnées quand les faces le sont (limite déclarée au lot 3).

**Fichiers probables.** `packages/planche-model/src/geometrie-libre.ts` (`suivezMoi`), `outils/suivez-moi.ts`,
`catalogue-outils.ts` (consignes de l'état interactif), `messages.ts`, `en.json`, cahier §4.20, fiche `PL-10-01.md`.

**Tests.** Vitest : anneau r 0,10 / 0,08 sur L ouvert 2 + 1 m → solide fermé, volume = aire × longueur médiane ± 1e-9 ;
anneau sur chemin fermé (carré) → tore à onglets, aucune face de capuchon ; chemin interactif simulé (survols successifs)
= même résultat que la présélection ; aperçu = résultat. Playwright `planche-suivez-moi.mjs` : tube creux le long d'un
rectangle, aperçu visible avant le clic, un pas d'annulation.

**Critères d'acceptation.** Un profil creux est accepté ; le chemin se choisit sans présélection ; l'aperçu s'affiche ;
aucune régression des CA du lot 3.

**Risques.** Trous proches du contour aux coins serrés (auto-intersection) : refus nommé, jamais un solide faux.

**Dépendances.** L9 (option Alt au registre).

---

## L11 — Noyau « pièce de profilé »

**Portée (noyau seulement, sans interface).**
- `packages/planche-model/src/profiles.ts` (nom de fichier à confirmer en fiche) : `poserPiece(m, segment, section,
  placement, o)` et `poserPiecesSurAretes(m, aretes, section, placement, o)`. La **section** est un contour 2D (extérieur
  + trous, en mètres, repère local y = largeur, z = hauteur) ; le noyau ne connaît **aucune forme ni aucune dimension**.
- **Placement** : 5 points (centre, haut gauche, haut droite, bas droite, bas gauche) ; rotation de 90° autour de l'axe ;
  décalage de longueur à chaque extrémité (valeur signée) ; pour une boucle d'arêtes, position **centre / extérieur /
  intérieur** par rapport au plan de la boucle.
- **Pièce** = composant (`creerGroupeDepuisFaces`, genre `composant`) dont la définition porte des **métadonnées de
  pièce** : désignation, contour de section, source (ligne de catalogue : source, édition, page ; ou « saisie »),
  placement, repère local. Ces métadonnées **régénèrent** la géométrie sur commande explicite (C8) ; elles ne sont pas une
  seconde géométrie. L'arête source n'est **pas** portée par la définition, partagée entre les copies d'un composant.
- **Lien** pièce ↔ arête source (comme les liens d'extrusion de D-197) porté par l'**occurrence** (table d'annotations
  indexée par l'identifiant d'occurrence) : la pièce suit son arête tant qu'elle n'est pas modifiée elle-même. Si la
  régénération change la section ou la longueur et que la définition est partagée, l'occurrence liée est d'abord rendue
  unique (`rendreUnique`) : une copie qui n'est pas issue de cette arête ne change jamais. Test : deux occurrences d'une
  même définition, seule la première liée ; déplacer l'arête ne modifie que la première.
- Onglets aux sommets partagés de `poserPiecesSurAretes` (plans bissecteurs, comme `suivezMoi`) — option.

**Fichiers probables.** `packages/planche-model/src/profiles.ts` (+ test), `geometrie-libre.ts`
(`MetadonneesDefinition` étendu), `annotations.ts` (liens), `delta.ts` (différence), `index.ts`, fiche `PL-11-01.md`.

**Tests.** Vitest : contour rectangle 0,10 × 0,05 sur segment de 3 m → composant solide, volume 0,015 m³ ± 1e-12 ;
chaque position de placement décale l'axe de la valeur attendue ; rotation 90° échange largeur et hauteur ; décalage
± 0,05 → longueur 3,10 / 2,90 ; rectangle de 4 arêtes « extérieur » → aucune pièce dans l'intérieur ; arête source
allongée → pièce allongée ; lien rompu si la pièce est éditée ; aucun nombre de dimension dans le code du noyau (test de
texte, comme celui de l'ontologie `structure`).

**Critères d'acceptation.** Noyau pur (contrôle `check-module-deps`), différence exacte (un pas d'annulation),
métadonnées relues après sérialisation `planche.operation`.

**Risques.** Volume du modèle (une pièce = un composant par arête) : mesurer (`⏱`) sur 200 arêtes et le déclarer.

**Dépendances.** L10 (balayage de profils à trous).

---

## L12 — Outils « Profilé » et « Profilés depuis arêtes »

**Portée.**
- Deux nouveaux outils, famille **Dessin**, statut `fadi` au catalogue (avec étapes, consignes, modificateurs, options) :
  **Profilé** (deux clics ou longueur tapée ; flèches = verrou d'axe ; aperçu sous le curseur ; dessin dans le contexte
  d'édition courant) et **Profilés depuis arêtes** (sélection d'arêtes, bouton « Poser » ; options centre / extérieur /
  intérieur, rotation 90°, décalage, fusion des arêtes colinéaires, coupe après pose réservée à L13).
- **Source de la section**, au choix dans la barre d'options :
  1. **ligne d'un catalogue du projet** : la Planche lit les définitions `catalogue` de l'Atelier (importées par
     `catalogue.importer`, gabarit `profils-acier.csv` ; `sections-bois.csv` pour des pièces de bois) ; colonnes `_mm`
     converties en mètres explicitement ; la source (titre, édition, page) est copiée dans la pièce ; sans catalogue
     importé, la liste dit « Aucun catalogue importé — importez un CSV sourcé dans l'Atelier ou saisissez les
     dimensions » ;
  2. **dimensions saisies** : forme (rectangle, rond, rond creux, tube rectangulaire, I, H, T, L, U) puis largeur,
     hauteur, épaisseurs — aucune valeur par défaut ; un champ vide bloque la pose (« dimension manquante ») ;
  3. **contour personnalisé** : une face de la Planche choisie comme section.
- Contours : `apps/web` appelle `contourSection` / `trousSection` de `@parcours/atelier-model` pour les formes
  polygonales ; rond et rond creux sont facettisés avec le nombre de segments saisi (`24s`, défaut relevé du Cercle) ;
  le noyau reçoit seulement le contour.
- **Placement** : 5 boutons radio (dessin propre à Fadi) ; **Ctrl** fait défiler les positions, **Alt** bascule la
  rotation de 90° (Maj reste le verrou d'inférence) — écart déclaré par rapport à MetalFab ; matière d'apparence (C15).
- Raccourcis Fadi attribués au registre (L9).

**Fichiers probables.** `packages/planche-model/src/outils/profile.ts`, `outils/profiles-aretes.ts`,
`registre-trace.ts` ou nouveau `registre-profiles.ts`, `catalogue-outils.ts`, `saisie-vcb.ts` (contexte « longueur de
pièce »), `apps/web/.../planche/sections-planche.ts` (adaptateur pur catalogue → contour), `Planche.tsx`,
`barres-outils.ts`, `outils-planche.ts` (pictogrammes), `messages.ts`, `en.json`, cahier (nouvelle section « Écarts
Fadi — profilés »), fiches `PL-12-01.md`, `PL-12-02.md`.

**Tests.** Vitest : adaptateur (ligne de catalogue sourcée → contour, cellule vide → refus nommé, jamais zéro ; aucune
valeur de profilé dans le code) ; machine Profilé (deux clics, longueur tapée, placement, rotation) ; machine depuis
arêtes. Playwright `planche-profiles.mjs` : import d'un CSV **d'essai fabriqué pour la recette** (marqué « données
d'essai, non contractuelles » dans la colonne `source`), pose d'une pièce, pose sur un rectangle d'arêtes, aperçu,
téléphone 390 px, `interface-anglais.mjs`.

**Critères d'acceptation.** Une pièce de 3,00 m à la section sourcée ou saisie ; source visible dans l'Info entité ;
sans catalogue, aucune valeur proposée ; un pas d'annulation par pose (une pose depuis arêtes = un pas).

**Risques.** Les données d'essai de la recette ne doivent jamais apparaître comme un catalogue du produit (fichier sous
`apps/web/e2e/`, source explicite) ; ergonomie du choix de forme au téléphone.

**Dépendances.** L11.

---

## L13 — Onglet, coupe par profil, allonger / raccourcir

**Portée.**
- **Onglet** (nouvel outil `fadi`, famille Modification) : deux pièces qui se rejoignent → chacune recoupée par le plan
  bissecteur de leurs axes ; angle de coupe de chaque extrémité enregistré en métadonnée (dérivé, jamais saisi).
- **Coupe par profil** : une pièce coupée par le volume d'une autre (soustraction manifold-3d du lot 6, outil de coupe
  conservé, métadonnées de la pièce coupée gardées) ; option « couper après pose » de Profilés depuis arêtes.
- **Allonger / raccourcir une pièce** : extrémité cliquée, valeur saisie ou « demi-section » (demi-largeur ou
  demi-hauteur selon l'orientation), sens par le signe ou le bouton « + / − » (pas Maj).

**Fichiers probables.** `packages/planche-model/src/profiles.ts`, `outils/onglet.ts`, `outils/coupe-profil.ts`,
`outils/allonger-piece.ts`, `outils/solides.ts` (variante qui garde l'outil), `catalogue-outils.ts`, `Planche.tsx`,
`messages.ts`, `en.json`, fiches `PL-13-01.md` à `PL-13-03.md`.

**Tests.** Vitest : deux pièces carrées à 90° → coupes à 45°, longueurs sur arête extérieure exactes ; à 120° → 30° ;
coupe par profil avec le vrai moteur en Node (volume V − V∩ ± 1e-6) ; allongement demi-section et valeur signée.
Playwright `planche-assemblages.mjs` : cadre de quatre pièces en onglet, coupe d'un poteau par une poutre, Ctrl + Z.

**Critères d'acceptation.** Angles listés en métadonnée ; volumes vérifiés ; booléen de maillage déclaré (MO-4) ; un pas
d'annulation par opération.

**Risques.** Pièces non coplanaires (axes gauches) : refus nommé pour l'onglet ; temps du moteur booléen mesuré.

**Dépendances.** L12.

---

## L14 — Liste de débit de la Planche, repères et étiquettes

**Portée.**
- **Liste de débit** (panneau de la Planche et export CSV « ; ») : pièces groupées par **section** (définition de profil,
  ou ligne de catalogue avec sa **source, édition, page** — deux catalogues portant la même désignation ne fusionnent
  jamais), désignation, longueur et angles de coupe ; colonnes repère(s), désignation, nombre, longueur unitaire, longueur
  totale, angles, source ; portée « tout » ou « sélection » (imbrications comprises) ; tri par colonne. Chaque ligne
  **retient les identifiants des occurrences** qu'elle regroupe : un clic sur la ligne sélectionne **exactement** ces
  occurrences (aucune extension par désignation ni par définition, qui sélectionnerait d'autres longueurs ou d'autres
  coupes). Test : même désignation, deux longueurs → deux lignes ; clic sur l'une → seules ses occurrences ; même
  désignation dans deux catalogues sourcés différents → deux lignes, masses distinctes.
- **Masse** : seulement si la ligne de catalogue porte une `masse_kg_m` sourcée, **ou** si l'utilisateur déclare une
  masse volumique **avec sa source** (masse = aire dérivée du contour × longueur × masse volumique, règle de
  `inerties.ts`) ; sinon « non évaluée ». Aucune masse volumique fournie par Fadi.
- **Repères** : renumérotation explicite (préfixe, départ, ordre de la liste), un pas d'annulation ; une copie garde son
  repère. **Étiquettes** : un texte par pièce portant son repère, effaçables ensemble.
- Présentation alignée sur la « Liste de débit » de l'Atelier (`tableaux.ts`) : même règle « aucune chute ni surlongueur
  supposée ».

**Fichiers probables.** `packages/planche-model/src/debit.ts` (pur, + test), `outils/selection.ts`, `annotations.ts`,
`apps/web/.../planche/panneaux-objets.tsx` (panneau), `Planche.tsx`, `messages.ts`, `en.json`, fiche `PL-14-01.md`.

**Tests.** Vitest : cadre 4 × 3 → 2 lignes, total 14 m ; masse « non évaluée » sans source, exacte avec `masse_kg_m`
sourcée ; renumérotation ordonnée et annulable ; CSV conforme (séparateur, BOM). Playwright `planche-debit.mjs` :
panneau, tri, clic sur une ligne → sélection, export CSV.

**Critères d'acceptation.** Aucune valeur de masse sans source ; les longueurs égalent celles des pièces à 1e-9 ; la
sélection depuis la liste est exacte.

**Risques.** Confusion entre liste de la Planche et tableau de l'Atelier : libellés distincts au registre.

**Dépendances.** L13 (angles de coupe).

---

## L15 — Révolution (axe + angle)

**Portée.** Nouvel outil `fadi` « Révolution » (famille Modification), distinct de Suivez-moi : face du profil, **axe**
(deux clics, ou une arête), **angle** (360° par défaut, saisi au champ Mesures) et **segments** (`24s`) ; aperçu ;
profil traversant l'axe refusé ; 360° → solide fermé sans capuchon, angle partiel → deux faces d'extrémité ; profil à
trous admis (même balayage que L10).

**Fichiers probables.** `packages/planche-model/src/geometrie-libre.ts` (`revolution`), `outils/revolution.ts`,
`saisie-vcb.ts` (contexte angle puis segments), `catalogue-outils.ts`, `messages.ts`, `en.json`, fiche `PL-15-01.md`.

**Tests.** Vitest : rectangle 1 × 2 à 1 m de l'axe, 360°, 24 segments → volume égal à celui du prisme polygonal attendu
(formule exacte de la facettisation, pas l'anneau lisse) ; 90° → quart avec 2 faces d'extrémité ; profil coupant l'axe →
refus. Playwright `planche-revolution.mjs`.

**Critères d'acceptation.** Résultat solide, aperçu = résultat, un pas d'annulation, refus nommés.

**Risques.** Faces dégénérées quand un sommet du profil est sur l'axe : sommet fusionné (cône), test dédié.

**Dépendances.** L9 ; L10 (balayage de trous et aperçu).

---

## L16 — Texte 3D : aperçu en volume

**Portée.** Aperçu = mêmes faces que la pose (extrusion comprise) ; alignement gauche / centre / droite ; pose sur la
face survolée (plan de la face) en plus du sol. La police reste la police géométrique Fadi (P-7).

**Fichiers probables.** `packages/planche-model/src/outils/texte-3d.ts`, `police-geometrique.ts`,
`apps/web/.../planche/Planche.tsx` (boîte), `messages.ts`, `en.json`, fiche `PL-05-03.md` (mise à jour).

**Tests.** Vitest : aperçu et pose ont le même nombre de faces et la même boîte englobante ± 1e-9 ; alignement centre →
boîte centrée sur le point ; pose sur une face verticale → normale du texte = normale de la face. Playwright : capture
de l'aperçu en volume.

**Critères d'acceptation.** L'aperçu montre le volume ; aucune régression de CA-T3D.

**Risques.** Coût de l'aperçu à chaque survol : mise en cache des faces du texte, mesure `⏱` déclarée.

**Dépendances.** L9.

---

## L17 — Édition des pièces

**Portée.** Info entité d'une pièce : changer de section (catalogue ou saisie) → géométrie **régénérée** depuis les
métadonnées (même axe, même longueur) ; **rotation axiale** (axe = axe de la pièce, angle saisi) ; **alignement de face**
(face de la pièce sur une face cible) ; **Échelle** d'une pièce limitée à son axe (refus nommé en transversal) ;
inférence « axe de pièce » pour Déplacer.

**Fichiers probables.** `packages/planche-model/src/profiles.ts`, `outils/echelle.ts`, `outils/deplacer.ts`,
`inference.ts`, `outils/aligner-face.ts`, `apps/web/.../planche/panneaux-objets.tsx`, `messages.ts`, `en.json`, fiche
`PL-17-01.md`.

**Tests.** Vitest : 80 × 40 → 100 × 50 régénéré ; rotation axiale 90° ; alignement coplanaire ± 1e-9 ; échelle
transversale refusée. Playwright `planche-pieces-edition.mjs`.

**Critères d'acceptation.** Une régénération = un pas d'annulation ; la source de la nouvelle section est enregistrée.

**Risques.** Pièces recoupées (onglet, coupe) : la régénération doit rejouer les coupes ou refuser avec motif — à trancher
dans la fiche.

**Dépendances.** L12 (et L13 pour les pièces recoupées).

---

## L18 — Compléments des outils de modification

**Portée.** Décalage d'une face à trous et Alt (chevauchements) ; Faire pivoter : Maj (verrou du rapporteur), flèches après
le 1er clic, axe quelconque par glisser ; Retourner : Alt (axes de l'objet) ; Déplacer : poignées de rotation de la boîte.
Comportements « instr » ou « doc » : livrés comme choix Fadi déclarés tant qu'un relevé ne les confirme pas.

**Fichiers probables.** `packages/planche-model/src/geometrie-libre.ts` (`decaler`), `outils/decalage.ts`,
`outils/faire-pivoter.ts`, `outils/retourner.ts`, `outils/deplacer.ts`, `catalogue-outils.ts`, `messages.ts`, fiches
`PL-03-0x.md` mises à jour.

**Tests.** Vitest par outil ; recette `planche-modification.mjs` étendue.

**Critères d'acceptation.** Chaque complément a son test chiffré ; statut de relevé affiché dans l'Instructeur.

**Risques.** Divergence possible avec un futur relevé : statut `fadi` explicite, révisable.

**Dépendances.** L9.

---

## Décisions réservées au maître d'ouvrage (non engagées)

| Sujet | Pourquoi | Ce qui serait nécessaire |
| --- | --- | --- |
| Coûts et prix des pièces | Donnée commerciale, aucune source fournie | Règle de saisie et de source des prix ; devise |
| Imbrication en barres (débit optimisé) | Exige longueur de barre, trait de scie et règle d'optimisation déclarés | Décision de périmètre et paramètres déclarés |
| Conversion d'une pièce en `poutre` / `element-bois` de l'Atelier | P-10 : jamais deux géométries canoniques (R15), conversion explicite seulement | Réouverture de P-10 et choix du sens (Planche → Atelier seulement) |
| Profilé C à bords tombés (gabarit `C.skp` de MetalFab) | Absent de `FormeSection` ; forme nouvelle de l'ontologie `structure` | Demande explicite ; sinon contour personnalisé |
| `ms_c2c_line_2p` | Fichier non reçu | Fournir le fichier pour analyse |
| SU Splat | Fichier non téléchargé (93 Mo) | Le fournir par un moyen accessible (moins de 10 Mo par fichier, ou dépôt) |
