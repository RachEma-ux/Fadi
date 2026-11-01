# GeoData — Analyse de la carte FeenWay et pistes d'amélioration

Relevé du 30 octobre 2026, vers 17 h 25 (heure suisse), navigateur Chromium automatisé (bureau 1440 × 900 et
téléphone 412 × 915), sur :

- `https://www.feenway.com/search?s=appartement à vendre dans l'éco citée Zenata&type=SALE&propertyTypes=APPARTEMENT&city=Zenata&lng=-7.46828&lat=33.64643&z=14.30`
- `https://www.feenway.com/` (accueil, sans carte).

Ce document est une **analyse et une proposition** : il ne décide rien. Les valeurs citées sont celles affichées par
FeenWay ce jour-là ; elles ne sont pas des données de GeoData et ne doivent pas y entrer (aucune fiche de source
qualifiée).

## 1. Ce que fait la carte FeenWay

### 1.1 Socle technique

| Élément | Constat |
| --- | --- |
| Moteur | Mapbox GL JS **3.18.1** (classes `mapboxgl-*`), dans une application Next.js (Turbopack). |
| Fond | Style `mapbox://styles/mapbox/streets-v12` (tuiles vectorielles `mapbox-streets-v8` + `terrain-v2` + `bathymetry-v2`), projection `globe`, brouillard (`fog`). Bascule **Satellite / Vue plan** en un bouton. |
| Texte arabe | Greffon `mapbox-gl-rtl-text` chargé à la demande au premier libellé arabe. |
| État dans l'adresse | `lng`, `lat`, `z`, filtres (`type`, `propertyTypes`, `city`) et texte de recherche `s` : toute vue est partageable par son URL. |
| Clé | Jeton public Mapbox (`pk.…`) dans le navigateur ; télémétrie `events.mapbox.com` active. |
| Mesure d'audience | Google Analytics, Meta Pixel, Microsoft Clarity (enregistrement de session), Cloudflare RUM, et `/api/events` propre. |
| Défaut visible | Des **cartouches de routes vides** (rectangles blancs) : les icônes du style (`iconset.pbf`) ne sont pas rendues. |

### 1.2 Couches et données servies

Toutes les couches métier passent par l'API du site, interrogée **par emprise visible** (bbox) et rechargée à chaque
déplacement :

| Couche | Requête | Forme de la réponse | Rendu |
| --- | --- | --- | --- |
| Annonces | `GET /api/ads?…&mode=map` (+ `/api/listings`) | Liste complète (157 objets) : lat/lon, prix, surface, chambres, source (Mubawab, Avito…), photos, 13 booléens d'équipement. | Marqueurs **HTML** : grappes noires numérotées (`cluster-marker`) et points (`ad-dot-marker`), regroupement côté client. |
| Prix Quartier | `GET /api/neighborhoods?north&south&east&west` | GeoJSON de polygones de quartiers : `price` (moyenne DH/m²), `min`, `max`, `confidence` 0–5. | Choroplèthe ; clic → carte « Max / Moyenne / Min » sur une échelle verticale, « ± 300 DH/m² ». |
| Qualité de l'air | `GET /api/air-quality?bounds=…` | Grille régulière (≈ 8 × 8 points) : `aqi`, `pm2_5`, `pm10`, `no2`, `o3`. | Voile coloré + légende « Indice européen » (Bon → Extrême) avec **moyenne à l'écran** et **pire point**. |
| Commodités | `POST /api/commodities` ×15 (une par catégorie) | Points d'intérêt (transport, écoles, santé, mosquées, parcs…). | Pastilles colorées à icône SVG, une couleur par catégorie, panneau à cases « Tout sélectionner ». |
| Signaux | `GET /api/signals?perPage=50`, `/api/signals/categories` | Signalements citoyens géolocalisés (photo, audio, commune et province en français et en arabe, confirmations). | Liste en feuille modale, onglets par province, bouton « voir sur la carte ». |
| Recherche assistée | `POST /api/landing/suggest` | Trois reformulations de la requête en langue naturelle. | Bouton « Trouver avec moi ». |

### 1.3 Interactions

- **Compteur d'emprise** : « 155 sur 157 annonces » se met à jour au déplacement ; avec une zone dessinée,
  « 57 sur 157 annonces ».
- **Dessiner Zone** : tracé à la souris, la zone filtre la liste et le compteur ; puce « Zone × » pour l'effacer.
- **Fiche au survol / clic** : vignette photo, prix, surface, pictogrammes d'équipement, favori.
- **Indicateur de zoom** affiché en permanence (« Zoom 14 »).
- **Couches en pastilles** à gauche, chacune avec un **badge de synthèse** (« Qualité de l'air 40 »,
  « Commodités 15 »).
- **Liste ⇄ carte** synchronisées ; « Masquer la liste » ; sur téléphone, barre inférieure **Carte · Chercher ·
  Filtres · Sauver**.
- **Ma position**, **Souhait**, **Signaler** (contribution).

### 1.4 Faiblesses relevées

1. **Géolocalisation grossière** : 157 annonces pour **32 coordonnées distinctes** — les programmes neufs sont posés
   sur un même point ; les grappes ne s'éclatent jamais et la position n'a pas de précision déclarée.
2. **Prix sans provenance** : aucune source, date, nombre d'annonces ni méthode n'accompagne le prix au m² ; la
   « confiance » 0–5 n'est pas expliquée et un quartier à `confidence: 0` est affiché comme les autres (min = max).
3. **Qualité de l'air sans source ni horodatage** visibles ; grille trop lâche pour l'échelle du quartier (même valeur
   sur toute la vue).
4. **Marqueurs DOM** (un `<div>` par objet) : coût élevé au-delà de quelques centaines d'objets ; un appel par
   catégorie de commodité (15 requêtes au lieu d'une).
5. **Commodités** : `{"commodities": []}` au premier appel puis remplissage ; aucune indication de chargement ni
   d'absence.
6. Pastilles et menus de la carte se recouvrent (le panneau Commodités masque les autres pastilles) ; boutons
   inopérants pendant la feuille « Signaux ».
7. Traqueurs tiers nombreux (dont enregistrement de session) sans bandeau de consentement visible.

## 2. Ce que GeoData a déjà (rappel)

MapLibre chargé à la demande, tuiles vectorielles servies par l'API (`/couches/:id/tuiles`), couches raster, catalogue par
catégories, fonds réglés dans Paramètres (MapTiler par défaut), contours administratifs HCP sur quatre niveaux, indicateurs
RGPH 2024 affichés en valeur (D-GD-32), palettes et classes (Jenks, ColorBrewer), libellés (Alt+L), mini-carte (Alt+M),
mesures distance / surface, zone d'étude, Ma position, recherche en mini-barre (Alt+R), collections, tableau de bord,
fiches de source, versions immuables, export PNG et impression.

GeoData est déjà **plus rigoureux** que FeenWay sur la provenance (fiches qualifiées, empreintes, « non évalué » au lieu
de zéro) : c'est l'avantage à garder. FeenWay est en revanche **plus direct à l'usage** sur cinq points : synthèse de
l'emprise, regroupement des points, couche thématique d'un clic, zone qui filtre, état dans l'adresse.

## 3. Améliorations proposées pour GeoData

Classées par rapport valeur / effort. Chacune respecte les règles du chantier : aucune donnée dans l'application,
données en base depuis une fiche qualifiée, une valeur absente reste « non évaluée », icône + barre + raccourci pour
chaque commande nouvelle.

### Priorité 1 — gains d'usage immédiats, sans nouvelle donnée

| # | Proposition | Inspiré de | Mise en œuvre envisagée |
| --- | --- | --- | --- |
| P1-1 | **Synthèse de l'emprise visible** : « 412 objets sur 2 978 » par couche chargée, et pour un indicateur la moyenne / le min / le max des entités visibles (« non évalué » si aucune valeur). | Compteur « 155 sur 157 », « Moyenne à l'écran / Pire point ». | `queryRenderedFeatures` après `moveend` (débit limité) ; calcul pur dans `geodata-model` ; pastille dans la mini-barre. |
| P1-2 | **Regroupement des points** (grappes numérotées qui s'éclatent au zoom) pour les couches ponctuelles denses (hôtels 2 978, sites patrimoniaux 1 818, administrations 1 575…). | Grappes `cluster-marker`. | Agrégation **côté serveur dans les tuiles** (`ST_SnapToGrid`/`ST_ClusterDBSCAN` par niveau de zoom) plutôt que marqueurs DOM : reste en WebGL, réutilise `/tuiles`. Case « Regrouper » par couche. |
| P1-3 | **État de la carte dans l'adresse** : centre, zoom, couches, indicateur, territoire sélectionné (`/geodata#@lon,lat,z&c=…`). Rend possible un « Partager » minimal par lien sans compte (GEO-PARTAGE-CARTE reste à spécifier). | Paramètres `lng/lat/z` et filtres dans l'URL. | `hash` MapLibre + sérialisation pure de la composition (déjà en `composition-ops.ts`). |
| P1-4 | **Zone d'étude qui filtre** : la zone tracée (déjà disponible) restreint la table attributaire, le tableau de bord et la synthèse P1-1, avec une puce « Zone × ». | « Dessiner Zone » → « 57 sur 157 ». | Intersection côté API (`ST_Intersects`) sur la version publiée ; résultat non enregistré tant que l'étude n'est pas figée. |
| P1-5 | **Indicateur de zoom** permanent et échelle graphique. | « Zoom 14 ». | Contrôles MapLibre `ScaleControl` + étiquette. |
| P1-6 | **Bascule Plan / Satellite** en un bouton de la mini-barre (fond imagerie du fournisseur réglé, MapTiler `satellite` si la clé le permet ; sinon bouton désactivé avec raison). | Bouton « Satellite / Vue plan ». | Réutilise `fonds-navigateur.ts` ; aucun fond imposé (D-GD-15). |

### Priorité 2 — lecture thématique « d'un clic »

| # | Proposition | Inspiré de | Mise en œuvre envisagée |
| --- | --- | --- | --- |
| P2-1 | **Pastilles thématiques** : raccourcis de catalogue en pastilles sur la carte (ex. « Santé », « Éducation », « Transport », « Limites ») avec badge du nombre d'objets visibles. Les pastilles sont des **catégories gérées** (D-GD-14), pas une liste codée. | Pastilles Commodités / Qualité de l'air / Prix Quartier. | Lecture de `geodata_categories` ; une requête par pastille, pas par sous-catégorie. |
| P2-2 | **Carte de synthèse d'une entité** au clic (min / moyenne / max de l'indicateur dans l'entité et ses enfants, avec la source et la date), sous forme d'échelle verticale. | Carte « Max / Moyenne / Min » de Prix Quartier. | Données déjà en base (RGPH 2024 sur 4 niveaux) ; composant de la fiche territoriale. |
| P2-3 | **Indice de confiance / qualité déclarée** par entité (couverture, nombre d'observations, date), affiché à côté de la valeur — ce que FeenWay montre sans l'expliquer. | `confidence` 0–5. | Champ de la fiche de source, jamais calculé par l'application ; « non évalué » sinon. |
| P2-4 | **Couches de grille ou de champ continu** (raster ou maillage) avec légende normalisée et valeur au point survolé. | Voile Qualité de l'air. | Couches raster existantes (D-GD-13) + lecture de valeur côté API ; seulement depuis une source qualifiée (ex. CAMS / Copernicus, droits à établir — GEO-SRC-02). |
| P2-5 | **Proximité des équipements** : pour un point ou une entité, nombre d'équipements de chaque couche à moins de N m / N min, à partir des couches OSM déjà livrées. | Commodités autour des annonces. | `ST_DWithin` côté API sur les couches publiées ; résultat daté de la version des couches. |

### Priorité 3 — téléphone et performance

| # | Proposition | Inspiré de |
| --- | --- | --- |
| P3-1 | Barre inférieure sur téléphone (**Carte · Chercher · Couches · Enregistrer**) au lieu de la barre d'outils flottante seule ; feuille glissante pour la fiche. | Barre « Carte · Chercher · Filtres · Sauver ». |
| P3-2 | Chargement par emprise et par zoom pour les couches non tuilées (annotations, imports personnels) ; une seule requête groupée par pastille. | Requêtes `bounds` — mais sans répéter les 15 appels de FeenWay. |
| P3-3 | Greffon d'écriture de droite à gauche chargé à la demande pour les noms en arabe (douars, D-GD-21) si les glyphes hébergés ne suffisent pas. | `mapbox-gl-rtl-text`. |
| P3-4 | Indication explicite « chargement… / aucun objet dans la vue » par couche. | Absence d'état chez FeenWay (constat négatif). |

### Ce qu'il ne faut **pas** reprendre

- Valeurs sans source, date ni méthode (prix au m², qualité de l'air) : contraire à la règle « jamais de donnée
  inventée » et au principe de fiche qualifiée.
- Positions mutualisées sur un point sans précision déclarée : GeoData doit porter une **précision de position**
  (exacte / adresse / centroïde de programme / centroïde de commune) dans la fiche et l'afficher.
- Marqueurs HTML par objet et un appel par catégorie (coût sur téléphone).
- Jeton de fond en clair imposé par l'application et traqueurs tiers ; GeoData garde les clés dans le navigateur de
  l'utilisateur (D-GD-15) et aucune mesure d'audience tierce.
- Données de marché immobilier (prix, annonces) **reprises de FeenWay, Mubawab ou Avito** : droits non établis ; si le
  maître d'ouvrage souhaite une couche de prix, elle exige une fiche de source qualifiée (ex. indice des prix des
  actifs immobiliers de Bank Al-Maghrib / ANCFCC, droits à vérifier).
  **Décision du maître d'ouvrage du 31 octobre 2026 (D-GD-54)** : les prix des quartiers de FeenWay sont repris
  **provisoirement**, pour l'étape de développement seulement (source marquée provisoire, jamais en production, export
  refusé), et le circuit est préparé pour une source qualifiée (schéma commun, `scripts/geodata/sources-prix/`).

## 4. Suite proposée

Lot unique « Lecture de l'emprise » regroupant P1-1, P1-2, P1-3, P1-5 (aucune donnée nouvelle, purement interface +
API sur les versions publiées), puis P1-4 et P1-6. Les points P2-3 à P2-5 et toute couche de prix ou de qualité de
l'air attendent une source qualifiée. Rien n'est engagé sans demande du maître d'ouvrage.
