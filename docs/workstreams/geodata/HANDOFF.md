# GeoData — Reprise de session

Mis à jour : 2026-10-30 (UTC).
État relevé après la fusion de la PR #339.

## Point de reprise

- Chantier : geodata. Délégation totale (ADR-GEODATA-02).
- Issue : https://github.com/RachEma-ux/Fadi/issues/299.
- Code fusionné dans `main` par la PR #301 (`1d92920`) ; aucune branche de réalisation ouverte.

## Dernier état vérifié

GeoData V1 implémenté : paquet `packages/geodata-model`, schéma `geodata_*` (`apps/api/src/db/init.sql`), API `apps/api/src/routes/geodata/`, page `apps/web/src/modules/geodata/`, CLI `geodata:import-reference` et `geodata:role`, recette `apps/web/e2e/geodata.mjs` (CI, tranche `complements`). Preuves dans `STATUS.md` et `VERIFICATION.md`.

## Dernier checkpoint

- PR #307 fusionnée (outils d'exploitation dans l'image, dossier `RELEASE-V1.md`).
- Préproduction : rôles et geoBoundaries ADM1/ADM2 importés le 25 octobre 2026 ; recette d'usage constatée par le maître
  d'ouvrage (carte, fiche, recherche, enregistrement, export).
- Style « une couleur par entité » (D-GD-11) : PR #314 fusionnée.
- Couches raster (D-GD-13) et 17 rasters de sources d'origine ; communes OSM (1 498) ; sites minéraux USGS (110).
- Catalogue par catégories gérées, barre d'outils verticale flottante (à droite par défaut), bouton « Données », menu ☰ (D-GD-14).
- Population RGPH 2024 du HCP sur 3 niveaux (D-GD-17, lot A, PR #339 fusionnée).
- Lot A2 (D-GD-17 point 5) : 648 indicateurs HCP par niveau (thème, famille, modalité, milieu, sexe) en tableau CSV,
  arrondissements (41/41 contours OSM niveau 10) ; PR en cours sur `ccr-e71fe633-hjxnjf`. Ensuite, un lot à la fois :
  B, E, C, D, F, G (TASKS).
- Import automatique au déploiement (D-GD-23, D-GD-29) : à chaque démarrage, sans réglage ni compte, l'API archive les
  fichiers livrés, importe et publie les fiches nouvelles, applique les retraits et écrit le découpage territorial ;
  quittance serveur : `GET /version/donnees`. Procédure après chaque fusion : suivre la CI de `main` jusqu'au vert
  (relance unique d'un job tué par l'infrastructure), déposer la quittance sur la PR fusionnée.
- Fiche territoriale (lot E, D-GD-22) : ventilations, arrondissements, douars (annexe de la fiche des communes :
  `preparer_hcp.py … --douars <base des douars>`), impression Alt+P.
- Libellés sur la carte (lot C, D-GD-24) : case « Libellés » par couche, bouton de la barre d'outils (Alt+L), valeur
  abrégée en thématique, glyphes Noto Sans hébergés (latin).
- Palettes et classes (lot D, D-GD-25) : méthodes dont seuils naturels de Jenks, 2 à 10 classes, palettes ColorBrewer,
  inversion, couleur par classe depuis la légende.
- Arbre d'indicateurs (lot F, D-GD-26) : thèmes, familles, recherche sans accents.
- Mini-carte de situation (Alt+M) et impression directe (Alt+I, mêmes droits que l'export) (lot G, D-GD-27). Lots A2 à G
  livrés.
- Navigation territoriale permanente (lot H, D-GD-28) : barre pays › niveaux toujours affichée, découpage en base
  (`geodata_pays`, `geodata_territoires`) chargé depuis les fiches qui déclarent `territoire` ; Maroc (HCP, 4 niveaux)
  d'abord. En préproduction, le découpage arrive avec l'import automatique au démarrage, sans réglage (D-GD-29).
- Rubrique « Indicateurs » du catalogue (D-GD-31, étape 1) : un indicateur actif pour toutes les couches chargées qui le
  portent ; hors périmètre : entité par la barre, multi-indicateurs. Consolidation D-GD-32 : l'indicateur n'est jamais une
  coloration (liste « Coloration » = couleur unie / une couleur par entité seulement), sa valeur s'affiche en texte propre
  sur chaque entité, case « Afficher l'indicateur — [nom] » cochée par défaut, indépendante de « Libellés (nom) ».
- Sélection par nombre de clics (D-GD-34) : 1 clic → plus petit niveau, clics rapides suivants → niveaux au-dessus ;
  couches chargées ou, carte vierge, découpage du pays courant en base ; double-clic sans zoom.
  Correctifs téléphone du 28 octobre 2026 : fiche différée après la série de tapes (#358, `d921230`) ; fenêtre de la
  série à 600 ms et clic daté à l'événement d'entrée (#359) — vérifié Pixel 7, cadence humaine, couches HCP chargées.
- Recherche de la carte en mini-barre (D-GD-35) : loupe sous la barre d'outils (Alt+R), barre flottante, même logique ;
  champ retiré de la barre au-dessus de la carte.
- Collections de cartes (D-GD-36) : ensemble ordonné de références, plusieurs collections par carte, menu ☰ « Cartes »,
  mini-barre Enregistrer / Fond ; « Partager » attend une spécification (`COLLECTIONS.md`).
- Onglets et tableau de bord RGPH 2024 (D-GD-37) : `TABLEAU-DE-BORD.md` ; données manquantes (séries 1960–2014,
  concepts en arabe, emplois CEE par secteur) affichées « Donnée non disponible » en attendant des fiches qualifiées.
- Fil de navigation administrative dans la mini-barre (D-GD-38) : ≡ entre Enregistrer et Fond, panneau flottant ;
  un seul panneau de la mini-barre ouvert à la fois (`panneauMini` de la page).
- Fiche : tableaux croisés Milieu × Sexe (D-GD-39, `tableau-croise.ts`) ; palette partagée `--gd-cat-*` (tableaux et
  graphiques) ; écarts de cohérence de 1 publiés par le HCP signalés, jamais corrigés.
- Régions et provinces construites par union des communes (D-GD-33) : plus aucun contour geoBoundaries livré ;
  `construire_niveaux.py` après `preparer_hcp.py` (ou seul) ; 16 communes HCP sans contour OSM à reprendre à la source
  (liste dans `CONTOURS-NIVEAUX.md`) ; deux lacunes de couverture (Ifrane 105 km², Kénitra 13 km²) signalées.
- Une seule source par niveau administratif (D-GD-30) : couches HCP sous « Limites administratives », geoBoundaries
  retiré du catalogue (fiches dans `sources/references/`), métadonnées de source suivies par la fiche.
- Règle permanente (D-GD-29, `AGENTS.md`) : interface et base de données toujours distinctes ; aucune donnée dans
  l'application. Tous les fichiers de données livrés sont archivés en base (`geodata_fichiers`) à chaque démarrage de
  l'API, et toutes les fiches livrées sont préparées et publiées par la livraison elle-même (aucun compte, aucun réglage :
  `PREPROD_GEODATA_IMPORT_AUTO_PAR` est devenu facultatif), retraits appliqués, découpage territorial écrit. Aucune suite
  engagée sans demande du maître d'ouvrage.
- Arabe là où il est nécessaire (D-GD-21) : une donnée publiée seulement en arabe (noms des douars) est affichée en
  arabe (rtl, jamais traduite) ; sinon le français seul.
- Indicateurs communaux complémentaires (D-GD-20) : logement urbain, transport domicile – travail, CEE ; régénération :
  `preparer_hcp.py --excel … --indicateurs … --logement … --transport … --cee …` (fichiers HCP hors dépôt, empreintes
  dans les fiches).
- Navigation par niveaux (lot B, D-GD-19) : fil « Maroc › … », Retour (Alt+↑), « Voir ses … » dans la fiche (Alt+↓).
  Prochain lot : E (fiche territoriale par thème, ventilations, impression).
- Priorité HCP (D-GD-18) : couche `hcp-rgph2024-villes` (258/338 villes avec les effectifs du HCP), extraits OSM des
  communes / villes / arrondissements sans fiche importable (`donnees/osm-extraits.json`), recherche HCP d'abord.
- Contours colorés et hiérarchie des limites administratives (D-GD-16).
- Fournisseurs de fonds dans Paramètres, MapTiler par défaut (D-GD-15).
- Sources ouvertes (D-GD-12) : 29 couches OpenStreetMap / OurAirports livrées avec leur fiche (15332 objets).

- Analyse de la carte FeenWay (30 octobre 2026) : `ANALYSE-FEENWAY.md`, pistes P1 à P3.
- Lot « Lecture de l'emprise » (D-GD-40, demandé par le maître d'ouvrage le 30 octobre 2026) : synthèse de la vue
  (Alt+V), regroupement des points dans les tuiles (Alt+G), état de la carte dans l'adresse et « Copier l'adresse de
  cette vue » (Alt+K), zoom affiché. Fusionné par la PR #367 (`603504f`), CI verte. Suites possibles de l'analyse, non engagées : P1-6
  (Plan / Satellite), P2, P3.
- Lot « Zone d'étude qui filtre » (D-GD-41, demandé le 30 octobre 2026) : filtre de zone sur la carte, la table et la
  synthèse ; puce et Alt+Z ; `z=` dans l'adresse ; tableau de bord non filtré, signalé. Branche
  `ccr-9ee33f24-q1rmt0` repartie de `main` après la fusion de #367.
- Données du MTNRA (D-GD-43, 30 octobre 2026) : administrations et services publics de maps.service-public.ma
  (data.gov.ma, 2022, ODbL), fusionnés depuis avec OSM (D-GD-45), importés au démarrage comme les autres fiches, avec
  rapprochement provincial du RGPH. Le fichier des douars fourni le même jour (même empreinte que l'annexe livrée) est
  repris en entier : 22 compléments par douar, trois tableaux dans la fiche ; originaux archivés. En attente : contrôle
  par commune (contours communaux complets) et « Concept Prix » (module à spécifier).
- Services publics fusionnés (D-GD-45) : au déploiement, 13 couches `services-publics-*` (MTNRA + OSM, 19 797 objets)
  sont publiées, puis les couches OSM administrations, santé et gares sont retirées du catalogue (leurs objets sont tous
  dans la base fusionnée).
- Alignement des contours (D-GD-44, 30 octobre 2026) : `ALIGNEMENT-CONTOURS.md`. Après déploiement, vérifier en
  préproduction autour de Tétouan qu'une carte récente ne montre aucun décalage, et qu'une carte ancienne affiche
  l'alerte de version antérieure.

## Prochaine action

Catégories (D-GD-14) : en préproduction, menu ☰ → « Données » avec un compte « gestionnaire-donnees » pour créer,
renommer, ordonner ou supprimer une catégorie et y ranger des couches ; les autres comptes voient les catégories en
lecture seule.

HCP (lots A et A2), après déploiement de `main` en préproduction : importer les 4 fiches
`hcp-rgph2024-population-regions`, `-provinces`, `-communes`, `hcp-rgph2024-arrondissements` et `hcp-rgph2024-villes`
(même commande, une
fiche à la fois avec `--fiche <clé>`). Régénération : `python3 scripts/geodata/preparer_hcp.py --excel <population
légale> --indicateurs <indicateurs>` (fichiers hcp.ma, empreintes consignées dans les fiches). Puis, avec un compte
« gestionnaire-donnees », retirer du catalogue `osm-mar-communes` et `osm-mar-villes` (doublons des couches HCP, D-GD-18).

Préproduction, après déploiement de `main` : importer les sources ouvertes en une commande
(`sudo docker exec fadi-preprod-app-1 node apps/api/dist/geodata-reference.js --fiche toutes --preparateur <compte>
--publier-par <compte>`), puis recette d'usage. Mise à jour des couches OpenStreetMap : relancer
`scripts/geodata/extraire_sources.py` sur des extraits récents (nouvelle empreinte = nouvelle version). Production selon
`RELEASE-V1.md` (phase B `fadi-prod-auto` absente : une Release seule ne met rien en production).

## Tests et preuves

Voir `VERIFICATION.md`. La suite API `apps/api/src/routes/geodata.test.ts` ne tourne qu'avec la base attestée DB-3 de la CI.

## Risques et blocages

Aucun blocage technique. Droits des indicateurs officiels non qualifiés (aucun publié). Aucun fond externe ni géocodeur configuré par défaut.

## Arrêt sûr

Tables additives ; retour arrière par `GEODATA_ENABLED=false`, sans perte de cartes. Aucune migration destructive, aucune production touchée.
