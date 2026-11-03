# TER-05 — Interface du terrain dans GeoData (compte rendu de lot)

Date : 3 novembre 2026 (heure suisse). Issue : https://github.com/RachEma-ux/Fadi/issues/381. Branche :
`feat/381-ter-05-interface`, partie de `main@79141f3` (TER-04 fusionné, CI de `main` entièrement verte). Décisions
appliquées : TER-D16 (priorité des sources), TER-D17 (équidistance minimale), TER-D18 ([`DECISIONS.md`](DECISIONS.md)).

État : **implémenté et vérifié** (contrôles ci-dessous) ; **non accepté** ; aucun déploiement.

## Ce que voit l'utilisateur

Un bouton **Terrain** (icône propre, **Alt+H**), posé sur la carte à droite de « Données », ouvre le panneau « Terrain
haute résolution » (volet de droite ; au téléphone, un seul panneau à la fois). Les réglages restent appliqués panneau
fermé. La barre d'outils verticale garde ses seize outils : un dix-septième la faisait déborder sur l'échelle et les
sources de la carte sur un écran de 900 px de haut (constaté par la recette `geodata.mjs`, contrôles de la mini-barre).

| Exigence du plan (§ TER-05) | Réalisation |
| --- | --- |
| Contrôle Terrain dans la carte existante, libellés « Altitude », « Pente », « Ombrage », « Profil du terrain », « Sources et précision », « Couverture disponible » | Panneau `panneaux/Terrain.tsx`, styles du module (`geodata.css`), mêmes boutons, cases et volets que le reste de GeoData |
| MNT et MNS sélectionnables, distincts | Choix MNT / MNS ; changer de produit efface les résultats de l'autre ; un produit sans jeu publié n'affiche rien (aucune valeur estimée) |
| Couverture des levés et message quand seul le modèle régional existe | Contours de toutes les couvertures publiées (case « Couverture disponible ») ; message quand aucun jeu ne couvre la vue, ou quand seul un modèle régional / mondial la couvre (« aucun levé local ici ») ; « Centrer sur la couverture » |
| Opacité et rampe lisible | Altitude, pente, ombrage : case et curseur d'opacité chacun ; palette d'altitude **sans bleu** (le bleu n'évoque pas l'eau), pente 0–45° à échelle fixe, ombrage 315° / 45° dit « rendu seulement » |
| Légende verrouillée pour comparer, légende adaptative clairement étiquetée, portée explicite | Verrouillée sur la plage de la **version** (par défaut) ; « Adapter à la vue » (statistiques de la version sur l'intersection vue × couverture) ou « Adapter à la zone d'étude » (polygone réel de la zone filtrée) ; la portée est toujours écrite sous la légende (« vue courante », « zone d'étude » + son nom, ou « version ») ; jamais une statistique d'une autre étendue présentée comme celle de la parcelle |
| Interroger un point | Outil **Altitude au point** (icône propre, **Alt+O**) : un clic → `GET /terrain/point` ; valeur **arrondie à la précision de la source** (RMSEz mesurée, sinon précision déclarée, sinon au mètre ; valeur complète gardée en mémoire), méthode (bilinéaire ou cellule), coordonnées, étiquette et fiche de la source ; hors couverture : « indisponible », jamais un nombre |
| Tracer un profil | Outil **Profil du terrain** (icône propre, **Alt+U**) : sommets au clic, double-clic ou Entrée → `POST /terrain/profil` au pas natif le plus fin (élargi pour rester ≤ 2 000 points) ; graphique SVG : lacunes grisées et listées (jamais comblées), raccords entre jeux (traits verticaux, jeux nommés), points interpolés en pointillé, jeux écartés pour une autre référence verticale ; le survol du graphique place le point sur la carte |
| Champs à côté du résultat : source, date du levé, pas, qualité mesurée, référence verticale, état de validation | Rubrique « Sources et précision » (jeu choisi, résultat du point, chaque source du profil) : jeu, produit, date des données, pas, référence verticale, RMSEz / P95 / nombre de points, précision déclarée, précision retenue, état de validation, date de publication, attribution, licence |
| Courbes trop fines interdites quand l'incertitude les rend trompeuses | Équidistances proposées = celles que le seuil TER-D17 admet **et** qu'une équidistance calculée divise ; seuil affiché ; maîtresses (une sur cinq) plus épaisses et cotées sur la carte |
| Étiquette des démonstrations | L'étiquette du jeu (« Données suisses de démonstration… », « … test seulement ») est affichée avec chaque jeu, chaque résultat et dans « Sources et précision », et jointe à l'attribution sur la carte |

Règle d'or : bouton Terrain (sur la carte, Alt+H), Altitude au point (Alt+O) et Profil du terrain (Alt+U), commandes du
panneau Terrain, ont chacun leur icône et leur raccourci ; unicité contrôlée par test avec la barre d'outils et la barre du
bas (`panneaux/barre-outils.test.ts`) et dans le navigateur (`geodata-terrain.mjs`). Alt+O et Alt+U agissent sur toute la page (le panneau s'ouvre). Interface bilingue :
80 textes ajoutés à `apps/web/src/lib/i18n/en.json`.

## Fichiers

- Web : `client.ts` (types et appels du terrain, adresses des tuiles et des courbes), `terrain-ops.ts` (logique pure :
  arrondi, portée de légende, équidistances, pas et tracé du profil, emprises, message de couverture) et ses tests,
  `panneaux/Terrain.tsx` (état `useTerrain` gardé par la page, panneau), `carte/moteur.ts` (contrat : outils `altitude` et
  `profil`, `afficherTerrain`), `carte/moteur-maplibre.ts` (tuiles d'image sous les couches, courbes MVT, couvertures,
  point et ligne du profil), `PageGeoData.tsx` (bouton Terrain, volet, raccourcis), `geodata.css` (styles ; les
  groupes de la barre d'outils ne rétrécissent plus : la barre défile si la carte est basse ; bande des thèmes décalée
  après le bouton Terrain).
- API : `GET /terrain/jeux` renvoie en plus `plageAltitude` (plage de la version, celle des tuiles sans portée ; `null` si
  illisible) et `courbes` (`equidistanceMinimale` TER-D17, `calculees`). Test DB-3 complété.
- Recettes : `apps/web/e2e/geodata-terrain.mjs` (nouvelle, CI tranche `complements`).

## Vérifications (3 novembre 2026)

| Contrôle | Résultat |
| --- | --- |
| `npm run typecheck`, `npm run build` | Réussis |
| Tests web du module GeoData (`vitest`) | 8 fichiers, 66 tests (dont 10 de `terrain-ops`, 1 de règle d'or du terrain) |
| Suite DB-3 `geodata-terrain-services.test.ts` (catalogue complété) | 8/8 en local (PostGIS 16 + GDAL 3.8.4, copie à connexion directe) ; en CI sur base attestée |
| Tests web complets (`apps/web`) | 202 fichiers, 1 367 tests réussis (1 ignoré) |
| `npm test` (racine) | Paquets et web réussis ; API : 20 suites DB-3 refusées par la garde sans base attestée (`TARGET_REQUIRED`, attendu en local), exécutées en CI |
| Recette navigateur `geodata-terrain.mjs` (Chromium, WebGL logiciel, API construite locale) | 32 contrôles réussis, 0 échec (après la revue Codex) |
| Recette GeoData complète `geodata.mjs` (non-régression, même API locale) | 265 contrôles réussis, 0 échec |

Limite déclarée de la recette navigateur : les services `/geodata/api/terrain/…` y sont **interceptés** et répondent avec
un jeu **synthétique « test seulement »** (aucune donnée réelle). Elle vérifie l'interface ; la chaîne serveur (import,
traitement, qualité, publication, point, profil, statistiques, tuiles, courbes, droits) est vérifiée sur base réelle par
les suites DB-3 de TER-02 à TER-04. L'essai sur un jeu réel publié (Lucerne, étiqueté démonstration) attend la levée de
quarantaine (Q-TER-02-1 à 3) ; la porte G3 (préproduction, appareil Android réel) reste à passer.

## Revue Codex de la PR #390 (corrigée)

- Export et impression (P1) : le terrain n'appartient pas à la carte enregistrée, dont seuls les droits d'export sont jugés
  par `POST /exports` ; ses calques sont donc **masqués pendant toute capture** (avec le contour territorial), jamais
  exportés ni imprimés.
- Réponses périmées : un changement de produit invalide tout ce qui est en vol (catalogue, point, profil, adaptation) ;
  une nouvelle demande invalide la précédente du même type. Recette : catalogue MNT lent arrivé après le choix du MNS,
  ignoré.
- Adaptation en échec : la plage d'une adaptation précédente est effacée dès la nouvelle demande ; en cas d'échec, couleurs
  et tuiles reviennent réellement à la plage de la version. Recette : adaptation réussie puis en échec → 480 → 620 m,
  tuiles sans portée.

Après correction : recette `geodata-terrain.mjs` 32/0, `geodata.mjs` 265/0, tests web du module 66/66.

## Fusion de `main` (#386) et correctif de préproduction

`main` (#386, préproduction du terrain) fusionné dans la branche. La CI a alors révélé un échec intermittent du script
`deploy/preprod/fadi-preprod` (test « administrateur : terrain --lever consigné ») : avec `set -o pipefail`,
`docker compose config --services | grep -qx` pouvait faire échouer la vérification du service (SIGPIPE quand `grep -q`
s'arrête au premier résultat). Remplacé par `grep -x … > /dev/null` (lecture complète). Le script change donc avec cette
PR (liste `E2E_DEFAUT` et ce correctif) : son SHA-256 n'est plus celui annoncé dans la PR #386 ; la réinstallation de
`/usr/local/sbin/fadi-preprod` par le maître d'ouvrage se fait à partir de `main` après fusion.

## Hors de ce lot (décision du maître d'ouvrage)

Le plan demande aussi, « dans le parcours parcellaire », d'**attacher la version de terrain approuvée au projet**, et dans
l'Atelier une **référence de terrain versionnée** (unités, origine, transformation explicites), sans jamais remplacer en
silence un terrain utilisé par un projet. GeoData est un module **autonome des projets** (aucun `projectId`, aucun contexte
de projet ; tests d'indépendance, ADR-GEODATA-01/02) : ce rattachement touche le Parcours et l'Atelier, hors délégation
GeoData. Question **Q-TER-05-1** consignée dans [`DECISIONS.md`](DECISIONS.md) ; rien n'est engagé.

## Suite

Plus aucun lot de la portée de la session (TER-02 → TER-05 livrés). Restent au maître d'ouvrage : TER-D19 (confirmation du
retour arrière), Q-TER-02-1 à 3 (levées de quarantaine), Q-TER-05-1 (rattachement au projet), TER-01, TER-06 / TER-07 (porte
G2), TER-08 (Release).
