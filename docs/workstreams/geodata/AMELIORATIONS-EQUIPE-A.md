# GeoData : améliorations selon l'équipe A (Multi-Arena du 27 novembre 2026)

Feuille de route demandée par le maître d'ouvrage le 27 novembre 2026 (« Exécute pour implémenter », 9 h 32, heure
suisse) : 14 PR en 6 jalons, tirées du plan `dev-4` de l'équipe A (§ 1.5), avec les corrections exigées par les portes de
conformité. Source : dossier Multi-Arena `multi-arena/geodata-fadi/` des fichiers du projet (hors dépôt).

Règles tenues par chaque PR : une nature (extraction ou comportement), tests purs, recette `apps/web/e2e/geodata.mjs`,
axe-core, captures téléphone (Pixel 7) et bureau (1440 px), bilingue, aucun mot « projet » dans le module (GEO 04),
aucune donnée dans le code (D-GD-29).

| PR | Jalon | Objet | État |
| --- | --- | --- | --- |
| P1 | A Arrivée | Contour du découpage en base, consigne, catalogue fermé | livrée (PR #472) |
| P2 | B Carte robuste | État du moteur, avis par couche, restauration du contexte | livrée (PR #482) |
| P3-P5 | C Commandes | Table unique des raccourcis, panneaux extraits, groupes nommés | livrée (PR #487) |
| P6-P7 | D Clavier | Outils extraits, saisie de coordonnées, voie clavier | livrée (PR #491) |
| P8-P10 | E Légende | Version et couverture, légende complète, hachures | livrée (cette PR) |
| P11-P14 | F Site | Sélection extraite, analyse de site, référence copiable | à faire |

## Décisions prises pour avancer (recommandations de la feuille de route, réversibles)

- **D1** : catalogue fermé **à chaque ouverture** de la page (pas seulement la première fois). Le bouton « Données » ou la
  consigne l'ouvrent. Revenir à « première fois seulement » = un repère `geodata.accueil-vu` (une ligne).
- **D2** : axe-core **« moderate » bloquant** sur les écrans nouveaux (ici la consigne) ; l'existant reste à « serious ».
- **D3** (P5) : une entrée d'un groupe nommé vaut « barre appropriée » au sens de la règle d'or ; contrôlé par test.
- **D4** (P5) : raccourci d'un groupe = Alt + lettre du groupe, puis la lettre de l'entrée ; les Alt existants restent inchangés.
- **D5** (P5) : doublons de la mini-barre et « Enregistrer » dans ☰ gardés en l'état.

## P1 · Carte d'arrivée (E-01, Q1, Q9)

- Condition pure par **état**, pas par chemin de démarrage (`apps/web/src/modules/geodata/etat/accueil-ops.ts`) :
  `carteVide` = onglet Cartes, aucune carte enregistrée ouverte, aucune couche visible ; tient au rechargement, à une
  dernière carte disparue et à un thème activé d'office.
- Contour : niveau le plus global du découpage en base qui a une couche publiée (`niveauAccueil`), dessiné sur un calque
  **hors composition** (`afficherAccueil` du moteur : jamais enregistré, masqué à l'export comme le contour territorial) ;
  son attribution entre dans la ligne des sources. Une tuile refusée sur ce calque ne déclare pas la carte en panne.
  Le contour reste tant que la carte est vide ; il disparaît dès qu'une couche est affichée.
- Consigne (`panneaux/ConsigneAccueil.tsx`) : une seule, avec WebGL seulement (sans WebGL, le message de la page en
  tient lieu). Elle n'ajoute aucune commande : « Ouvrir le catalogue » = bouton « Données », « Chercher un lieu » = loupe
  (Alt+R). Elle est écartée pour la session à la première fiche, au premier outil, à la première recherche ou par ×.
- Téléphone : consigne sous les pastilles, ≤ 25 % de la hauteur de la carte, hors de la colonne d'outils et de la mini-barre.
- Écart au plan `dev-4` : le contour ne dépend pas de la consigne écartée (une carte vide garde son contour), et
  `CLE_ACCUEIL_VU` n'est pas créée (D1 « à chaque ouverture »).
- Captures : `captures/p1/` (bureau 1440 px, Pixel 7), instance locale avec le découpage réel du Maroc.
- Recette : contrôles « ARRIVÉE » de `geodata.mjs` (consigne, catalogue fermé, contour nommé depuis la base, attribution,
  axe-core moderate, ouverture du catalogue, téléphone ≤ 25 %, anglais).

## P2 · Carte robuste (E-02)

- État du moteur séparé et pur (`apps/web/src/modules/geodata/carte/etat-moteur.ts`, testé) : chargement (animation
  coupée par la garde de 15 s), prêt, sans WebGL, échec de démarrage, contexte perdu. Avant P2, un seul `erreurCarte`
  recevait ces quatre causes et n'était jamais remis à zéro : une tuile refusée coupait les commandes jusqu'au
  rechargement.
- Une tuile refusée ne change **jamais** l'état du moteur : avis **par couche**, non bloquant, qui nomme la couche
  (comme l'avis du fond), état « refusée » sur la carte de la couche ; l'avis est oublié quand la couche quitte la carte.
- Contexte WebGL restauré : la carte revient sans rechargement.
- Avis sur la carte placés sous les rangées de boutons (Données, Terrain, thèmes), au bureau et au téléphone : avant,
  la première ligne passait sous les pastilles de thèmes (vu sur les captures).
- Captures : `captures/p2/` (bureau 1440 px, Pixel 7), tuiles de « RGPH 2024 — régions » refusées (403) sur l'instance
  locale avec les données réelles du Maroc, build final de la feuille de route.
- Recette : contrôles « P2 » de `geodata.mjs` (contour refusé sans panne, avis non bloquant, outils disponibles, état
  « refusée », avis oublié) et GEO 11 sans WebGL.

## P3-P5 · Commandes (jalon C : E-03, E-04)

- **P3, extraction sans changement visible** : `raccourcis.ts`, table unique des raccourcis qui remplace la cascade de
  conditions de la page ; les tables des barres (`RACCOURCIS_BARRE`, `RACCOURCIS_TERRAIN`, `RACCOURCIS_BARRE_BAS`) en
  sont dérivées ; `commandeDeTouche` pure, testée (même ordre, mêmes conditions que l'ancien gestionnaire).
- **P4, extraction sans changement visible** : `etat/panneaux-ops.ts` (transitions pures des onglets, du volet de droite
  et d'Échap ; le téléphone est un paramètre, un seul panneau à la fois, GEO 12) et `etat/usePanneaux.ts`.
- **P5, comportement** : la colonne d'outils garde zoom avant / arrière et range le reste en deux groupes nommés à
  divulgation, « Mesurer et tracer » (Alt+N) et « Affichage » (Alt+A), avec la lettre d'accès de chaque entrée ; Échap
  ferme le groupe et rend le focus à son bouton. « ? » ouvre l'aide « Raccourcis clavier », lue dans la table unique.
- Revue de la PR #487 : le panneau d'un groupe s'ouvre du côté où il tient dans la carte (`placementPanneauGroupe`,
  testé), même quand la barre est déplacée contre le bord gauche.
- Écart connu : l'ordre de tabulation de la colonne n'a pas été réordonné (inchangé par rapport à l'existant).
- Captures : `captures/p5/` (groupe « Affichage » ouvert et aide des raccourcis au bureau 1440 px ; groupe ouvert sur
  Pixel 7), données réelles du Maroc, build final de la feuille de route.
- Recette : contrôles « P5 » de `geodata.mjs` (colonne, Alt+N et focus, axe-core moderate, Échap, aide « ? »).

## P6-P7 · Clavier (jalon D : E-05)

- **P6, extraction sans changement visible** : `etat/outils-ops.ts` (`voletDeOutil`, `outilTerrain`, `outilQuiEnregistre`,
  `zoneActiveDe`, `zoneARetablir`, purs et testés) et `etat/useOutilsZones.ts` (outil, tracé, zones d'étude, filtre).
- **P7, comportement** : tout outil de tracé se sert sans souris.
  - Saisie de coordonnées (`panneaux/SaisieCoordonnees.tsx`, WGS 84 en degrés décimaux) : longitude et latitude pour
    un outil à un point, un point par ligne sinon ; nombre de sommets vérifié avec son motif (`traceDepuisCoordonnees`,
    pur). Présente dans le volet Études et dans le panneau Terrain.
  - Le tracé saisi suit le chemin commun (même mesure, même formulaire d'enregistrement) ; sa provenance
    (« coordonnées » ou « dessin ») est gardée.
  - Voie clavier sur la carte active : Espace pose un sommet au centre, Retour arrière retire le dernier, avec annonce.
  - Alt+O (altitude) et Alt+U (profil) sans carte (sans WebGL) ouvrent l'outil et mettent le focus sur la saisie.
- Limite inchangée : une mesure terminée n'est pas dessinée sur la carte (comportement antérieur, au clic comme au clavier).
- Captures : `captures/p7/`, distance Casablanca → Rabat saisie par coordonnées (86,8 km), bureau 1440 px et Pixel 7.
- Recette : contrôles « P7 » de `geodata.mjs` (voie clavier, distance, surface, refus motivé, annotation, rien écrit en
  base, axe-core moderate, sans WebGL : Alt+O et altitude par coordonnées).

## P8-P10 · Légende (jalon E : E-06, carto-2 L1-L6)

- **P8, API** : la valeur d'un raster au point joint la version publiée lue (`lireVersion`, avec son empreinte SHA-256) ;
  la proximité d'objets joint la version comptée et la couverture du rayon « non évaluée » (couverture déclarée de la
  source rendue telle quelle, jamais déduite). Rien n'est journalisé de plus.
- **P9, légende lue** (`packages/geodata-model/src/legende-lue.ts`, pur et testé) : identique sur la carte et dans
  l'onglet « Légende » : titre et unité, période (de l'indicateur, sinon de la version, sinon « non évaluée »),
  classification nommée (méthode, nombre de classes, palette et sa nature), classes avec effectifs, valeur absente
  hachurée et ventilée par motif (jamais zéro), entité sélectionnée, source, version et fiche de version dépliable.
  Au téléphone, la légende de la carte reste bornée à 25 % de la hauteur. La synthèse gagne une ligne de lecture (L6).
- **P10, hachures** : la valeur absente est hachurée **sur la carte** (motif généré, couche `-absentes`), pas seulement
  grise (WCAG 1.4.1) ; sans coloration, aucune hachure.
- Écart connu : la légende du téléphone n'est pas repliée par défaut (choix laissé au maître d'ouvrage).
- Captures : `captures/p9/`, régions colorées selon « Population légale » (RGPH 2024), onglet « Légende » au bureau
  1440 px et sur Pixel 7, carte colorée sur Pixel 7.
- Recette : contrôles « P8 », « P9 », « P10 » de `geodata.mjs` (version et couverture, légende complète, pastille
  hachurée, axe-core moderate, hachures sur la carte).
