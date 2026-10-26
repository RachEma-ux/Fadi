# GeoData — Reprise de session

Mis à jour : 2026-10-26 (UTC).
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
- Contours colorés et hiérarchie des limites administratives (D-GD-16).
- Fournisseurs de fonds dans Paramètres, MapTiler par défaut (D-GD-15).
- Sources ouvertes (D-GD-12) : 29 couches OpenStreetMap / OurAirports livrées avec leur fiche (15332 objets).

## Prochaine action

Catégories (D-GD-14) : en préproduction, menu ☰ → « Données » avec un compte « gestionnaire-donnees » pour créer,
renommer, ordonner ou supprimer une catégorie et y ranger des couches ; les autres comptes voient les catégories en
lecture seule.

HCP (lots A et A2), après déploiement de `main` en préproduction : importer les 4 fiches
`hcp-rgph2024-population-regions`, `-provinces`, `-communes` et `hcp-rgph2024-arrondissements` (même commande, une
fiche à la fois avec `--fiche <clé>`). Régénération : `python3 scripts/geodata/preparer_hcp.py --excel <population
légale> --indicateurs <indicateurs>` (fichiers hcp.ma, empreintes consignées dans les fiches).

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
