# Fadi Concept Prix Plan

Version 1.1 | 31 October 2026 | Implementation plan under execution

Implement the two property-price layers described in Fadi Concept Prix, version 1.1, through separately verifiable lots. Version 1.1 records the results of lots P0 (integration inventory) and P1 (source qualification), fixes the table names in GeoData conventions and adds the go/no-go gate. Execution progress and evidence are tracked in `docs/workstreams/geodata/` (TASKS, STATUS, HANDOFF and the PRIX documents), not in this plan.

## 1 Execution order and prerequisites

Follow Planner, Builder, Reviewer, Tester and Governance responsibilities in that order for each lot. Under the owner's total delegation of 31 October 2026 (D-GD-56), these roles are held by Claude Code sessions and sub-agents; the Reviewer of a lot is an agent that did not write it. Roles do not imply that separate humans have reviewed the work. Follow the repository cycle Issue, short-lived branch, pull request, evidence, STATUS and HANDOFF, then review. Merging follows the GeoData delegation (ADR-GEODATA-02); production release remains the owner's Release.

Before application work, read AGENTS.md, docs/architecture.md, docs/continuity/README.md and the current GeoData workstream handoff, status, tasks and context. Inspect the issue, pull requests, current code and CI. The price capability is part of the existing GeoData workstream; no competing workstream is created.

The integration inventory (lot P0) is recorded in `docs/workstreams/geodata/PRIX-INVENTAIRE.md`. It lists the concrete extension points: GeoData source records, the `geodata_fichiers` archive, the import chain run at start-up, the administrative hierarchy tables, GeoData roles, the API router and the web module. The modular monolith, 21-step Parcours, Sandbox autonomy and Studio design boundary are preserved.

## 2 Delivery lots

| Lot | Deliverable | Dependencies | Exit evidence |
| --- | --- | --- | --- |
| P0 | Integration inventory with actual paths and decisions | Current repository access | `PRIX-INVENTAIRE.md` |
| P1 | Source dossiers, rights, editions, pilot perimeter, go/no-go | P0 | `PRIX-SOURCES.md`, archived authorised sample |
| P2 | Dedicated tables and original-file archive links | P0 | Schema tests on a disposable PostGIS database |
| P3 | Staged import, validation and reconciliation | P2; P1 samples for real adapters | Idempotency, rejection and lineage tests |
| P4 | Official zones and listing locality matching | P3 and boundary edition | Review queue, CRS evidence, spatial tests |
| P5 | Deduplication, segmentation and aggregates | P3 and P4 | Golden dataset with independently computed expectations; reproducibility test |
| P6 | Authorised APIs and atomic publication | P2 and P5 | API contract, permission and publication-concurrency tests |
| P7 | Map layers, filters and details in the GeoData UI | P6 | Desktop and mobile scenarios, French and English interface checks |
| P8 | Validation of the Casablanca pilot and exports | P1 through P7 | Acceptance matrix PRX01–PRX15 with evidence, source audit, restore test |
| P9 | Staged rollout and monitoring | P8 | Merge record, start-up import receipt on preproduction, rollback evidence; production Release by the owner |

P2 and deterministic fixtures proceed while a source remains unqualified. A blocked source prevents its own ingestion and publication, not unrelated development. Fixtures remain test-only and visibly synthetic; they are never shipped as live prices.

Go/no-go after P1 (decided 31 October 2026, D-GD-56): no listing source is authorised for row-level observations and no official edition is authorised. Lots P2 to P9 are therefore executed in full, with the Feenway published barometer as the only real data and the official and observation pipelines delivered empty, tested on synthetic fixtures and displaying their blocking reasons.

## 3 Source dossiers and blockers

One dossier per source is kept in `docs/workstreams/geodata/PRIX-SOURCES.md` with identity, canonical URL, owner contact role, exact data product, sample hash, coverage, fields, dates, licence evidence, access method, limits, permitted outputs, retention rules and review expiry. Each imported edition is linked to its GeoData source record. Blocked work records cause, accountable role, attempted checks, unblock evidence and next action.

DGI requires a current edition, an official copy, its administrative purpose and confirmation of reuse. ANCFCC and the IPAI require their own qualification; they are not substitutes. Mubawab and Avito each require a permitted data route and sample schema. Feenway is qualified: its published barometer is active; its internal APIs remain blocked until a written agreement exists. If no permitted feed exists, offer an administrator import of authorised exports; never replace it with scraping.

The Casablanca pilot boundary is frozen as the commune of Casablanca in the GeoData administrative hierarchy (HCP code, division edition recorded with each result). A published summary report cannot satisfy the requirement for individual observations used by the deduplication engine.

## 4 Logical schema and invariants

| Table family (GeoData convention) | Minimum fields and constraints |
| --- | --- |
| `geodata_sources` (existing) | Source identity, qualification, rights, product purpose, licence and attribution |
| `geodata_prix_editions` | Source edition: source key, layer, product, edition label, valid dates, original URL, status, validity flag, review status |
| `geodata_prix_lots` | Import batch: edition, original-file archive ID (`geodata_fichiers`), checksum, parser version, idempotency key, state, counts, errors |
| `geodata_prix_zones` and `geodata_prix_valeurs_officielles` | Zone ID, geometry and CRS or textual description, review state; category, condition, value form, amounts, currency, unit, area basis, dates, original text, page or row |
| `geodata_prix_observations` and `geodata_prix_quarantaine` | Source listing ID, observed time, original and normalised amounts, period, area and basis, source locality, batch; rejected rows with reasons |
| `geodata_prix_biens` and `geodata_prix_biens_observations` | Stable property cluster, observation links, matching method, confidence category, merge or split audit |
| `geodata_prix_rattachements` | Territory reference and edition, precision, method, review state, unresolved reason |
| `geodata_prix_agregats_publies` | Third-party published aggregate rows: edition, geography label and territory match, property type, transaction, count, published amounts with approximate flag, unit, trend, period |
| `geodata_prix_instantanes` and `geodata_prix_cellules` | Immutable build ID, inputs, method version, filters, window, median, quartiles, distinct count, exclusions, status per cell |
| `geodata_prix_publications` | Active snapshot pointer, previous snapshot, approver, timestamp, reason, rights scope, rollback events |

Monetary amounts use a decimal-safe representation with explicit currency and unit. Missing values are nullable with reasons, never numeric zero. Unit prices require positive denominators. Observation uniqueness is enforced by source, source listing ID and observation identity; import checksums plus parser version prevent unintended duplicate ingestion.

Territories reference the existing administrative hierarchy rather than copy it. Fiscal geometry stays separate. Raw data has restricted access independently of permitted public aggregates. Schema changes only add tables and never rewrite unrelated ones.

## 5 Ingestion and statistical pipeline

The pipeline is archive, stage, validate, normalise, match geography, resolve duplicates, build candidate aggregate, review, publish. Each transition records its inputs, output counts and error reasons. Failed stages resume idempotently. Re-importing the same content does not multiply observations or change published values.

Validate file type, size and parser bounds; treat uploaded content as data. Quarantine malformed rows, non-positive amounts, invalid area, unknown periods and unsupported currencies. Preserve original text and category for audit without exposing personal data. Review mappings before they become active.

For each explicit cohort and window, take the latest eligible observation per distinct property, compute each property unit price, then the median and quartiles with the pinned quantile convention (linear interpolation between order statistics, Hyndman–Fan type 7). Record raw, eligible, distinct and unmatched counts, exclusions and source contribution. Merge and split corrections generate a new snapshot rather than mutate historical output.

Start evaluation with a 90-day window and a 20-property publication threshold, both versioned in the method. An insufficient cell returns `insufficient_sample` and no value. Coarser aggregation is explicit and labelled with its actual geography. Never infer neighbourhood-level values from commune-only listings.

The golden fixture contains at least two synthetic sources, duplicate and non-duplicate lookalikes, several property types, mixed area bases, rental periods, currency anomalies, boundary ambiguity and sparse cells, with expected medians computed independently of the production implementation. Changes in listing mix are never presented as a constant-quality price index.

Third-party published aggregates follow a separate, shorter path: archive, stage, validate structure and units, match geography (city to commune; commercial neighbourhoods unmatched unless a reviewed correspondence exists), publish as an immutable edition.

## 6 Service contracts

Routes live under the existing GeoData API (`/geodata/api/prix/…`).

| Operation | Input and response requirements |
| --- | --- |
| Read layer catalogue | Available layers, coverage, source editions, rights, dates and status, including blocked reasons |
| Read aggregate cells | Territory or viewport, geography level, transaction, category, area basis, window and snapshot |
| Read published aggregates | Territory, transaction, category; publisher, edition, period, attribution |
| Read official zone | Zone ID, edition, original category, value form, value, unit, validity and evidence |
| Compare values | Qualified compatible records; otherwise a structured incompatibility reason |
| Import preview and commit | Source edition, archived file reference, mapping version and idempotency key |
| Review and publish | Candidate snapshot, review evidence, expected current publication and authorised actor |
| Export | Snapshot or edition and filters, permitted format, provenance, attribution and licence checks |

All reads return snapshot or edition identifiers, units, effective window, freshness and explicit data status. Viewport and row limits are validated. Import, review, publish and export are distinct capabilities mapped onto GeoData roles. A stale publish request returns a conflict rather than overwriting another reviewer's publication. Source suspension prevents new use and withdraws affected outputs.

## 7 Frontend and integration tasks

Add a catalogue entry « Prix immobiliers » with the two layers through the existing GeoData catalogue and layer registry, never a second map stack. French labels Valeurs immobilières de référence officielles and Prix immobiliers affichés dans les annonces, with English translations in `apps/web/src/lib/i18n/en.json`. Prices and geography are loaded exclusively through the API.

Filters persist identifiers, not data. A detail card exposes values, sample size, dates, source composition, precision and caveats, and a table alternative lists published rows, including neighbourhood rows without a polygon. Unavailable, insufficient, historical, stale, loading and failed states are distinct. An incompatibility reason replaces any misleading difference percentage.

On mobile, controls remain named and reachable, with a details sheet that does not obscure essential navigation. Keyboard selection, screen-reader labels, non-colour status indicators and the table alternative are provided. Project reports reference an immutable snapshot and its filters. Studio access remains contextual and read-only.

## 8 Acceptance matrix

| Test ID | Scenario | Pass condition |
| --- | --- | --- |
| PRX01 | No database data | Empty state; no fallback price or territory catalogue in the bundle |
| PRX02 | Same file imported twice | No duplicated observations or changed aggregates |
| PRX03 | One property appears on two platforms | One statistical contribution; retained source lineage |
| PRX04 | Similar but distinct properties | No automatic false merge without reviewable evidence |
| PRX05 | Mixed floor and parcel areas or daily and monthly rent | Separate cohorts or explicit exclusion |
| PRX06 | Only commune-level location known | No neighbourhood or fiscal-zone precision invented |
| PRX07 | Fewer than configured minimum properties | Suppressed value and explicit insufficient sample |
| PRX08 | Official edition has unknown validity | Not represented as a current applicable reference |
| PRX09 | Incompatible layer comparison | No percentage; reason identifies mismatched dimensions |
| PRX10 | Unauthorised user requests raw data or publication | Server denies access; no leak through cache or export |
| PRX11 | Failed or competing publication | Previous complete snapshot remains available; conflict recorded |
| PRX12 | Recompute with same inputs and method | Identical values and reproducible input manifest |
| PRX13 | Source rights suspended | Withdrawal and cache policy exercised |
| PRX14 | Snapshot rollback and database restore | Prior validated output and source lineage recover correctly |
| PRX15 | Mobile and bilingual UI | Named controls, readable cards and translated interface states |

Run npm run typecheck, npm test and npm run build, plus the database integration and browser tests. Record commands, commit, environment, results and unresolved failures in STATUS.

## 9 Rollout and monitoring

The layers are delivered behind the GeoData catalogue; the observation and official pipelines carry no data until a source is authorised. Schema and restore are tested on a disposable database before preproduction. Real-source records are reconciled with the published counts. Query latency and payload are measured on the preproduction dataset before thresholds are fixed.

Monitor import failures, excluded-row ratios, unmatched territories, duplicate review backlog, sample coverage, source concentration, stale snapshots, query latency and publication failures. Keep the last validated snapshot available while a refresh fails, with a visible stale state. Never silently replace it with partial results.

Production requires source qualification, acceptance evidence and the owner's Release. Rollback disables the layer or reselects a previous snapshot; it does not delete audit history.

## 10 Governance and completion

Decisions for pilot perimeter, source rights, official applicability, area definitions, sample thresholds, statistical method, permissions and performance targets are recorded in ADR-GEODATA-02. Requirements, hypotheses and recommendations remain distinct. Every pull request that changes the workstream updates STATUS and HANDOFF.

A technical pilot is complete only when both layers meet their scoped acceptance gates with qualified real data. A single-source market layer is labelled as such. Multi-source completion requires at least two authorised, non-derived sources and cross-source deduplication evidence. A source blocker remains blocked with an owner and next action; it is never reclassified as verified.

## 11 References

Companion specification: Fadi Concept Prix, version 1.1. Repository controls: AGENTS.md, docs/architecture.md, Fadi Concept/README.md, ADR-GEODATA-02, `docs/workstreams/geodata/PRIX-INVENTAIRE.md` and `PRIX-SOURCES.md`. The Markdown master and Word edition retain substantive parity and the same version.

## 12 Changes from version 1.0

- P0 and P1 results recorded; go/no-go gate added and decided.
- Table names aligned on GeoData conventions; published third-party aggregates and quarantine tables added.
- Quantile convention pinned (type 7).
- Roles held by Claude Code sessions under the owner's delegation; merge per GeoData delegation, production per owner Release.
