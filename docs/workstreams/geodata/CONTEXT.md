# GeoData — Contexte

## Objectif

GeoData : module autonome de données géographiques (9ᵉ module de Fadi), dont l'entrée `/geodata` ouvre directement une carte inspirée de Kharita, sans aucun projet requis.

## Périmètre

- Lot documentaire (Issue #243, PR #245, fusionnée) : concept 1.0 MD/DOCX, ADR-GEODATA-01.
- Lot de réalisation (Issue #299) sous délégation totale (ADR-GEODATA-02) : paquet pur, schéma `geodata_*`, API `/geodata/api`, page `/geodata`, chaîne d'import de référence, cartes, études, import, export, tests et recette.
- Exclus : mise en production (Release du maître d'ouvrage), paramètres GitHub, secrets, données réelles non qualifiées.

## Sources canoniques

- `AGENTS.md`, `docs/architecture.md`, `docs/continuity/README.md`.
- [Concept GeoData](../../../Fadi%20Concept/Fadi%20Concept%20-%20GeoData.md), [ADR-GEODATA-01](../../continuity/decisions/ADR-GEODATA-01.md), [ADR-GEODATA-02](../../continuity/decisions/ADR-GEODATA-02.md).
- [Plan retenu et évaluation du plan fourni](PLAN-IMPLEMENTATION.md) ; [exploitation](../../geodata/README.md).
- Issues : https://github.com/RachEma-ux/Fadi/issues/243 et https://github.com/RachEma-ux/Fadi/issues/299.

## Contraintes

- Aucun `projectId`, rôle ou contexte de projet dans le noyau (tests d'indépendance API et web, `scripts/frontieres.json`).
- Une valeur absente n'est jamais zéro ; version publiée immuable ; droits par usage, un droit inconnu bloque.
- Interface bilingue (D-163) : textes français traduits dans `en.json`.

## Hypothèses et questions ouvertes

Population HCP et autres indicateurs officiels : droits de réutilisation à qualifier avant publication. Fonds raster et géocodeur externes : aucun fournisseur qualifié, rien n'est configuré par défaut.
