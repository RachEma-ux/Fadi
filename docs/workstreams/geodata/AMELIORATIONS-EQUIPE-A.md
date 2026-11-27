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
| P2 | B Carte robuste | État du moteur, avis par couche, restauration du contexte | livrée (cette PR) |
| P3-P5 | C Commandes | Table unique des raccourcis, panneaux extraits, groupes nommés | à faire |
| P6-P7 | D Clavier | Outils extraits, saisie de coordonnées, voie clavier | à faire |
| P8-P10 | E Légende | Version et couverture, légende complète, hachures | à faire |
| P11-P14 | F Site | Sélection extraite, analyse de site, référence copiable | à faire |

## Décisions prises pour avancer (recommandations de la feuille de route, réversibles)

- **D1** : catalogue fermé **à chaque ouverture** de la page (pas seulement la première fois). Le bouton « Données » ou la
  consigne l'ouvrent. Revenir à « première fois seulement » = un repère `geodata.accueil-vu` (une ligne).
- **D2** : axe-core **« moderate » bloquant** sur les écrans nouveaux (ici la consigne) ; l'existant reste à « serious ».

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
