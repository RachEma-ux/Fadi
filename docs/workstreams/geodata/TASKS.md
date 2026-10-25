# GeoData — Tâches

## À faire

- [ ] GEO-REC-01 — Recette métier par le maître d'ouvrage sur appareils physiques (GEO 12) et validation d'usage.
- [ ] GEO-PROD-01 — Publication en production : Release GitHub du maître d'ouvrage (hors délégation), puis rôles GeoData et import geoBoundaries sur l'environnement.
- [ ] GEO-DATA-01 — Qualifier les droits HCP (population RGPH 2024) avant toute publication d'indicateur officiel.
- [ ] GEO-V11 — Extensions V1.1 : partage nominatif, espaces collectifs, KML/KMZ/Shapefile, analyses avancées.

## En cours

- Aucune au checkpoint (voir HANDOFF).

## Terminé

- [x] GEO-DOC-01 à 04 — Concept 1.0 et ADR-GEODATA-01 (Issue #243, PR #245 fusionnée).
- [x] GEO-I1 — Évaluation du plan fourni, plan retenu, ADR-GEODATA-02, paquet `@parcours/geodata-model` (Issue #299).
- [x] GEO-I2 — Schéma `geodata_*`, API `/geodata/api`, chaîne d'import de référence (GeoJSON/GeoPackage), pilote geoBoundaries.
- [x] GEO-I3 — Page `/geodata` (MapLibre à la demande), catalogue, couches, légende, recherche, fiche, table, Mes cartes, conflits.
- [x] GEO-I4 — Import GeoJSON personnel, zones et annotations, mesures, analyse figée, export PNG + fiche de sources.
- [x] GEO-I5 — Suite API DB-3, audit GEO 04, recette `apps/web/e2e/geodata.mjs` en CI, traductions, documentation.
- [x] GEO-MERGE — Revue Codex traitée, CI verte, PR #301 fusionnée (`1d92920`).

## Bloqué

Rien de bloqué dans la délégation. La production et la recette sur appareils physiques attendent le maître d'ouvrage.

## Critères de sortie

GEO 01–13 prouvés par tests et recette sur le HEAD ; CI verte ; fusion dans `main` ; production par Release du maître d'ouvrage.
