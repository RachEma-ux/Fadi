# GeoData — Vérifications

## Lot documentaire (22 octobre 2026, Issue #243)

Concept 1.0 MD/DOCX : parité de 288 blocs, 18 liens, rendu Word de 10 pages, empreintes Markdown `7c8d8256…53dc` et Word `141181c7…7222`, contrôle de continuité réussi. PR #245 fusionnée le 23 octobre 2026.

## Lot de réalisation V1 (25 octobre 2026, Issue #299)

| Contrôle | Résultat |
| --- | --- |
| `npm run typecheck` (dont `check-module-deps`) | Succès |
| Tests paquets et web (`npm run test` hors API) | Succès ; `@parcours/geodata-model` 18/18 ; module web GeoData 11/11 |
| `npm run test:db-guard` ; `check-api-tests-db3` sans attestation | Succès ; seules les suites DB-3 listées refusées |
| Suite API GeoData + GeoPackage + audit GEO 04 sur PostGIS 16 local | 21/21 (garde contournée localement, non commité) |
| `npm run build` ; carte des morceaux | Succès ; `{"ok":true,"violations":[]}` |
| `init.sql` rejoué deux fois | Succès |
| Recette `apps/web/e2e/geodata.mjs` (Chromium, WebGL logiciel et sans WebGL, 1440 px et 390 px, anglais) | Tout conforme |
| `node scripts/check-continuity.mjs` | Succès |

## Traçabilité GEO

| Critère | Preuve |
| --- | --- |
| GEO 01, 02 | `geodata.test.ts` (compte sans projet, espace idempotent) ; recette (entrée de menu, accès direct, aucun sélecteur de projet) |
| GEO 03 | `geodata.test.ts` : projet créé puis supprimé, carte inchangée |
| GEO 04 | `geodata-independance.test.ts` (API, SQL, paquet) ; `modules/geodata/independance.test.ts` ; `scripts/frontieres.json` |
| GEO 05 | `geodata.test.ts` ; recette (reconnexion, composition identique) |
| GEO 06 | paquet pur, `geodata.test.ts`, recette (légende hachurée, fiche, table) |
| GEO 07 | paquet pur, `geopackage.test.ts`, `geodata.test.ts`, recette (import projeté refusé) |
| GEO 08 | `geodata.test.ts` (cartes, zones, analyses, imports, tuiles, fiches) ; recette |
| GEO 09 | `geodata.test.ts` (droit inconnu → refus motivé) ; recette (PNG + fiche) |
| GEO 10 | `geodata.test.ts` (nouvelle version : analyse « à recalculer », résultat et version conservés) |
| GEO 11 | recette sans WebGL (message, recherche, fiche) |
| GEO 12 | recette téléphone (un panneau), clavier, axe-core ; appareils physiques : **non exécuté** (maître d'ouvrage) |
| GEO 13 | `geodata.test.ts` ; recette deux onglets (409, copie « ma version ») |

## Limites

La suite API GeoData ne s'exécute avec sa garde qu'en CI (DB-3). Aucune vérification sur appareils physiques ni en production.
