# GeoData — Prix immobiliers : dossiers de sources (lot P1)

Relevé du 30 au 31 octobre 2026 (heure suisse). Spécification : `Fadi Concept/Fadi Concept - Prix.md` (v1.1) et
`Fadi Concept - Prix Plan.md` (v1.1). Un dossier = une source ; l'état suit la chaîne du Concept (§2) :
`candidate → qualifiée → autorisée → active → suspendue → retirée`. « Bloqué » est noté avec cause, responsable,
essais, déblocage et prochaine action. Une source techniquement accessible n'est pas pour autant autorisée.

Responsable des dossiers : chef de projet GeoData (délégation totale du maître d'ouvrage, 31 octobre 2026, D-GD-58).
Révision des dossiers : au plus tard le 31 janvier 2027, ou à chaque nouvelle édition d'une source.

## Synthèse

| Source | Produit | Couche | État | Données réelles importées |
| --- | --- | --- | --- | --- |
| FeenWay — baromètre publié | Médianes publiées par ville, quartier, type de bien et transaction | Prix affichés (agrégat publié, contexte) | **Active** | Oui : baromètre de Casablanca du 30 octobre 2026 (64 lignes) |
| FeenWay — API internes (`/api/*`) | Annonces, polygones de quartiers, contexte de prix | Prix affichés (observations) | **Bloqué** | Non |
| Mubawab | Annonces | Prix affichés (observations) | **Bloqué** | Non |
| Avito | Annonces | Prix affichés (observations) | **Bloqué** | Non |
| Sarouty, Masaken, Agenz, Yakeey, Wafa Immobilier | Annonces | Prix affichés (observations) | Candidate | Non |
| DGI — référentiel des prix des transactions immobilières de Casablanca | Prix de référence au m² par zone fiscale, type et état | Valeurs de référence officielles | **Bloqué** | Non |
| DGI–ANCFCC — référentiel commun (2019) | Prix moyens par zone (349 zones) | Valeurs de référence officielles | **Bloqué** | Non |
| Bank Al-Maghrib / ANCFCC — IPAI | Indice trimestriel des prix des actifs immobiliers | Contexte (indice, pas un niveau de prix) | Candidate | Non |
| Ordre des notaires / Yakeey — référentiel électronique (2024) | Carte de prix issus de transactions | Contexte transactionnel | **Bloqué** | Non |

Conséquence au sens du Concept (§9) : livraison **partielle**. La couche des prix affichés existe avec une source
unique et **agrégée** (« source unique, agrégat publié ») ; la couche officielle est construite mais **sans donnée**,
avec la raison affichée. Aucune donnée n'est inventée ; aucune donnée de démonstration n'est livrée.

## 1. FeenWay — baromètre publié (ACTIVE)

- Identité : FeenWay, `https://www.feenway.com/` ; moteur de recherche d'annonces (agrégateur) ; aucune mention légale
  (société, RC, ICE absents des pages « À propos » et « Conditions générales ») ; contact : courriel de la page
  « À propos » (masqué par Cloudflare). Conditions générales soumises au droit marocain, tribunaux de Casablanca.
- Produit exact : page `https://www.feenway.com/prix-immobilier/casablanca` (et une page par ville,
  `/prix-immobilier/<ville>`, 78 villes). Trois tableaux HTML : appartements à vendre par quartier (25 lignes),
  appartements à louer par quartier (25 lignes), autres types de biens au niveau de la ville (14 lignes).
- Droits : métadonnées JSON-LD `Dataset` de la page : licence `https://creativecommons.org/licenses/by/4.0/` ; texte de
  la page : « Reproduction autorisée avec mention « Source : FeenWay » et lien vers cette page », en citant ville, type
  de bien, nombre d'annonces et date des données. Droits retenus : consultation, stockage, calcul, affichage, export
  **avec attribution** ; ne couvrent **ni** les annonces, **ni** les photos, **ni** les API.
- Période : couverture déclarée 2026-02-28 → 2026-10-30 ; tendance = 90 derniers jours contre 90 précédents, affichée
  seulement si chaque période compte au moins 30 annonces. La médiane elle-même n'est pas décrite comme une médiane sur
  90 jours : elle est conservée avec la période déclarée, sans requalification.
- Méthode déclarée : médianes de prix **demandés** après filtres par type, transaction et plages de prix ; effectifs =
  **annonces**, pas biens distincts ; doublons et erreurs de classement possibles (méthode FeenWay).
- Sources amont déclarées : Mubawab, Mubawab Neuf, Sarouty, Masaken, Agenz, Yakeey, Wafa Immobilier, agences ;
  Avito observé dans un échantillon d'annonces. FeenWay est donc une source **dérivée** : elle ne compte pas comme
  source indépendante pour la mention « multi-source » et ne doit jamais être cumulée avec ses sources amont sans
  déduplication prouvée.
- Géographie : « quartiers » commerciaux FeenWay (Racine, Gauthier, Oasis…) sans limites publiées ; ils ne
  correspondent pas aux arrondissements du HCP. Rattachement : la ville au territoire « Casablanca » (commune) ; les
  quartiers restent **non rattachés** (file de revue), consultables en tableau, sans polygone.
- Précision : montants abrégés par FeenWay (« 3,3M DH ») marqués « approximatif » ; prix au m² en entier.
- Échantillon : `docs/geodata/sources/donnees/feenway-barometre-casablanca-2026-10-30.csv`, empreinte SHA-256 dans
  la fiche de source ; extraction depuis le HTML public (une requête, sans compte), contrôlée contre une seconde
  extraction indépendante (64 lignes identiques).
- Limites : pas de quartiles, pas de bien distinct, pas d'échantillon ligne à ligne : le baromètre ne peut pas
  alimenter le moteur de déduplication (Plan §3) ; il est publié comme **agrégat de contexte** et étiqueté ainsi.
- État : **active** pour le baromètre. Prochaine action : relevé périodique de la même page (nouvelle édition = nouvel
  import archivé, jamais d'écrasement).

## 2. FeenWay — API internes (BLOQUÉ)

- Constat : 88 motifs de routes `/api/*` dans le code public ; plusieurs répondent sans compte (`/api/ads`,
  `/api/neighborhoods`, `/api/listings/price-context`…).
- Cause du blocage : `robots.txt` interdit `/api/` à tous les robots et déclare `Content-Signal: ai-train=no,
  use=reference` comme réserve de droits ; aucune licence ne couvre les annonces ; les conditions des sources amont
  (Mubawab, art. 5.1, 7.1, 7.3) interdisent l'extraction et la réutilisation ; la carte publique applique aux prix un
  décalage déterministe (≈ ±150 DH/m²) dont l'objet n'est pas établi.
- Essais : inventaire du code public et lectures bornées par une session tierce (rapport joint au chantier) ; aucune
  collecte, aucun contournement par Fadi.
- Déblocage : accord écrit de FeenWay (licence ou flux convenu) **et** droits des sources amont pour les annonces.
- Prochaine action : demande de partenariat à FeenWay par le maître d'ouvrage (modèle de courriel en annexe A).

## 3. Mubawab (BLOQUÉ)

- Produit : annonces ; aucune API publique trouvée.
- Cause : conditions d'utilisation (`https://www.mubawab.ma/fr/privacy.html`) : art. 5.1 (aucun outil d'extraction,
  aucune réutilisation commerciale), 7.1 (reproduction interdite sans autorisation), 7.3 (extraction substantielle et
  base concurrente interdites).
- Déblocage : contrat de flux ou export autorisé. Prochaine action : demande de partenariat (annexe A).

## 4. Avito (BLOQUÉ)

- Produit : annonces ; aucune API publique ni licence trouvées ; les « scrapers » tiers (Apify) ne sont pas une voie
  autorisée.
- Déblocage : contrat de flux. Prochaine action : demande de partenariat (annexe A).

## 5. Sarouty, Masaken, Agenz, Yakeey, Wafa Immobilier (CANDIDATES)

- Aucune API publique ni donnée ouverte trouvée ; l'« Index Sarouty » est un rapport (contexte seulement).
- Prochaine action : identifier le contact partenariat de chacun (après réponse de FeenWay, pour éviter les doublons de
  source).

## 6. DGI — référentiel des prix de Casablanca (BLOQUÉ)

- Produit : « Référentiel des Prix des Transactions Immobilières de Casablanca », DGI, édition de **janvier 2015**.
  Colonnes : zone (code, ex. `CC-SB1`), type de bien (appartement, villa, maison, terrain ZI loti, terrain ZV loti),
  état (ancien, récent, neuf), prix au m² en DH ; villas et maisons en deux valeurs (prix du terrain PT, prix de la
  construction PC) ; certaines valeurs conditionnelles (hauteur « < R+10 », superficie « ST ≥ 600 m² »).
  Hiérarchie : préfecture, préfecture d'arrondissements, arrondissement, zone. Zones délimitées ou linéaires, décrites
  en texte : aucune géométrie publiée.
- Mention : « Les données de ce référentiel sont opposables uniquement à la Direction Générale des Impôts » ; « ne
  constituent en aucun cas une évaluation directe d'un bien immobilier ».
- Causes du blocage : (1) copie officielle introuvable (le portail `tax.gov.ma` refuse la lecture automatisée ; les
  copies lues sont hébergées par des tiers) ; (2) aucune mention de licence de réutilisation ; (3) édition 2015
  remplacée, selon la presse, par le référentiel commun DGI–ANCFCC de 2019 : validité non vérifiable ;
  (4) zones sans géométrie (relecture humaine obligatoire, Concept §3).
- Déblocage : copie officielle de l'édition en vigueur, confirmation écrite de la réutilisation (DGI,
  `referentiel@tax.gov.ma`), validation de l'interprétation spatiale des zones.
- Prochaine action : demande à la DGI (annexe A). Le modèle de données accueille dès maintenant les valeurs simples, les
  doubles valeurs PT/PC et les conditions, sans rien importer.

## 7. DGI–ANCFCC — référentiel commun (BLOQUÉ)

- Produit annoncé le 12 juin 2019 (entrée en vigueur le 1er juillet 2019) : prix moyens par zone et type de bien, 349
  zones (Casablanca, Nouaceur, Médiouna) ; base de calcul du profit foncier et des droits de conservation.
- Cause : document non localisé ; licence inconnue. Déblocage et prochaine action : comme le §6.

## 8. Bank Al-Maghrib / ANCFCC — IPAI (CANDIDATE)

- Produit : indice trimestriel des prix des actifs immobiliers, fondé sur les transactions enregistrées ; dernière
  publication T2-2026 (27 août 2026), PDF sur `bkam.ma` et `ancfcc.gov.ma`.
- Usage possible : **contexte** (indice, base 100, et volumes), jamais un prix au m² ni une valeur de référence.
- À établir : conditions de réutilisation ; disponibilité d'une série par ville (Casablanca) et par catégorie.

## 9. Ordre des notaires / Yakeey — référentiel électronique (BLOQUÉ)

- Lancé le 16 février 2024 par le Conseil national de l'Ordre des notaires avec Yakeey : carte des prix issue de
  transactions réelles, estimation gratuite limitée, rapports payants. Aucune API ni téléchargement annoncés.
- Intérêt : seule source repérée de **prix de transactions** ; meilleur candidat de partenariat.
- Prochaine action : demande de partenariat (annexe A).

## Périmètre du pilote (gelé)

- Territoire : commune de Casablanca, code géographique HCP de la commune tel qu'en base au découpage en vigueur
  (`geodata_entites_administratives`, D-GD-42), édition « RGPH 2024 — découpage HCP » ; les niveaux inférieurs
  (préfectures d'arrondissements, arrondissements) servent de maille de publication des observations dès qu'une source
  autorisée existera.
- Fenêtre : 90 jours, configurable et versionnée ; seuil : 20 biens distincts par cellule publiée, versionné.

## Annexe A — Modèle de demande (à envoyer par le maître d'ouvrage)

Objet : Fadi — demande d'autorisation de réutilisation de données de prix immobiliers

Bonjour,

Fadi est une application d'analyse territoriale et de programmation architecturale (module GeoData). Nous souhaitons
afficher, à titre d'information et avec citation de la source, [préciser : vos médianes de prix publiées / vos annonces
agrégées par quartier / votre référentiel de prix] pour la commune de Casablanca, puis d'autres villes.

Nous demandons : (1) l'autorisation écrite de cette réutilisation et ses conditions (attribution, durée, usage
commercial) ; (2) le cas échéant, un accès convenu (fichier, flux ou API documentée) et ses limites ; (3) la
définition des champs (surface, prix, période, géographie). Fadi ne publie aucune donnée personnelle (noms, téléphones)
et conserve la provenance de chaque valeur.

Cordialement,
[Maître d'ouvrage de Fadi]
