# Fadi Concept Prix Plan

Version 1.0 | 30 October 2026 | Proposed implementation plan

Implement the two property-price layers described in Fadi Concept Prix, version 1.0, through separately verifiable lots. This plan is ready for engineering refinement against the current codebase; proposed names and routes are contracts to reconcile, not claims about existing implementation. The present delivery contains documentation only.

## 1 Execution order and prerequisites

Follow Planner, Builder, Reviewer, Tester and Governance responsibilities in that order for each lot. Roles do not imply that separate agents or reviewers have already run. Follow the repository cycle Issue, short-lived branch, pull request, evidence, STATUS and HANDOFF, then review. Merge and deployment remain separate authorised actions.

Before application work, read AGENTS.md, docs/architecture.md, docs/continuity/README.md and the current GeoData workstream handoff, status, tasks and context. Inspect its issue, pull request, current code and CI. Locate the canonical price workstream if one exists; do not create a competing one. Recheck current instructions before editing.

Inspect apps/api, apps/web and packages/domain-model for GeoData imports, territory identifiers, database migrations, permissions, background jobs, map layers and tests. Record concrete extension points and existing contracts. Preserve the modular monolith, 21-step Parcours, Sandbox autonomy and Studio design boundary. Do not import architecture assumptions from unrelated applications.

## 2 Delivery lots

| Lot | Deliverable and responsibility | Dependencies | Exit evidence |
| --- | --- | --- | --- |
| P0 | Planner maps existing architecture, sources, boundaries and decision register | Current repository access | Reviewed integration inventory with actual paths and unresolved decisions |
| P1 | Data steward qualifies sources, rights, editions and pilot perimeter | P0 | Source dossiers and representative authorised samples |
| P2 | Backend engineer adds dedicated tables, migrations and original-file archive links | P0 | Migration tests and reversible schema procedure on disposable database |
| P3 | Backend and data engineer build staged import, validation and reconciliation | P2; samples from P1 for real adapters | Idempotency, rejection and lineage tests |
| P4 | GIS reviewer qualifies official zones and listing locality matching | P3 and boundary edition | Ambiguity queue, CRS evidence and spatial fixtures |
| P5 | Domain engineer builds deduplication, segmentation and aggregates | P3 and P4 | Independently calculated golden dataset and reproducibility report |
| P6 | Backend engineer exposes authorised APIs and atomic publication | P2 and P5 | API contract, permission and publication-concurrency tests |
| P7 | Frontend engineer integrates map layers and details in existing GeoData UI | P6 | Desktop and mobile scenarios, French and English interface checks |
| P8 | QA and data reviewers validate complete Casablanca pilot and exports | P1 through P7 | Acceptance matrix, source audits and restore test |
| P9 | Release owner stages rollout and monitoring | P8 and deployment authorisation | Deployment record, smoke results and rollback evidence |

P2 and deterministic fixtures can proceed while a source remains unqualified. A blocked source prevents its own ingestion and publication, not unrelated development. Fixtures must remain test-only and visibly synthetic; they must never be shipped as live prices. No calendar estimate is committed before P0 and representative source samples establish the work.

## 3 Source dossiers and blockers

Create one dossier per source with identity, canonical URL, owner contact role, exact data product, sample hash, coverage, fields, dates, licence evidence, access method, limits, permitted outputs, retention rules and review expiry. Link the dossier to each source edition. Record blocked work with cause, accountable role, attempted checks, unblock evidence and next action.

DGI requires a specific reference edition, its administrative purpose and confirmation of applicability. ANCFCC requires its own qualification; it is not automatically a substitute. Mubawab and Avito each require a permitted data route and sample schema. Feenway requires service identification before technical estimates. If no permitted feed exists, offer an administrator import of authorised exports; do not silently replace it with scraping.

Freeze the Casablanca pilot boundary identifier and edition. Confirm whether each official dataset uses polygons, streets or textual zones. A published summary report cannot satisfy the requirement for individual observations used by the deduplication engine.

## 4 Logical schema and invariants

| Proposed table family | Minimum fields and constraints |
| --- | --- |
| prix_sources and prix_source_editions | Stable source ID, qualification, rights evidence, product purpose, valid dates, original URL, review status |
| prix_import_batches | Edition ID, original-file archive ID, checksum, parser version, idempotency key, state, counts and errors |
| prix_official_zones and prix_official_values | Zone ID, geometry and CRS, category, amount, currency, unit, area basis, dates, original page or row |
| prix_listing_observations | Source listing ID, observed time, original and normalised amounts, period, area and basis, source locality, batch ID |
| prix_property_clusters and membership | Stable cluster ID, observation links, matching method, confidence category, merge or split audit |
| prix_territory_matches | Territory ID and edition, precision, matching method, review state and unresolved reason |
| prix_aggregate_snapshots and cells | Immutable build ID, inputs, method version, filters, window, median, quartiles, distinct count and exclusions |
| prix_publications and audit | Published snapshot, previous snapshot, approver, timestamp, reason, rights scope and rollback event |

Final table names follow repository conventions. Use decimal-safe monetary representation and explicit units. Missing values are nullable with reasons, never numeric zero. Require positive denominators for unit prices. Enforce observation uniqueness with source, source listing ID and observation identity; import checksums plus parser version prevent unintended duplicate ingestion.

Reference existing territory tables rather than copy their hierarchy. Keep fiscal geometry separate. Use the existing original-file archive where its contract fits; otherwise define a dedicated database archive that preserves bytes and checksums. Apply retention and restricted access to raw data independently of permitted public aggregates. Migrations must not rewrite unrelated tables.

## 5 Ingestion and statistical pipeline

The pipeline is archive, stage, validate, normalise, match geography, resolve duplicates, build candidate aggregate, review, publish. Each transition records its inputs, output counts and error reasons. Failed stages resume idempotently. Re-importing the same content must not multiply observations or change published values.

Validate file type, size and parser bounds; treat uploaded content as data. Quarantine malformed rows, non-positive amounts, invalid area, unknown periods and unsupported currencies. Preserve original text and category for audit without exposing unnecessary personal data. Review mappings before they become active.

For each explicit cohort and window, take the latest eligible observation per distinct property. Compute each property unit price and then the median and quartiles using a pinned quantile convention. Record raw count, eligible count, distinct count, unmatched count, exclusions and source contribution. Merge and split corrections generate a new snapshot rather than mutate historical output.

Start evaluation with a 90-day window and a 20-property publication threshold. Version these parameters and assess stability by neighbourhood and category. An insufficient cell returns insufficient_sample and no value. Coarser aggregation is explicit and labelled with its actual geography. Never infer neighbourhood-level values from commune-only listings.

Build a golden fixture with at least two synthetic sources, duplicate and non-duplicate lookalikes, several property types, mixed area bases, rental periods, currency anomalies, boundary ambiguity and sparse cells. Compute expected medians independently from the production implementation. Changes in listing mix must not be presented as a constant-quality market price index.

## 6 Proposed service contracts

Integrate with the current API conventions after P0; the following operations describe behaviour, not a required replacement router.

| Operation | Input and response requirements |
| --- | --- |
| Read layer catalogue | Available layers, coverage, source editions, rights, dates and status |
| Read aggregate cells | Bounded viewport or territory, geography level, transaction, category, area basis, window and snapshot |
| Read official zone | Zone ID, edition, original category, value, unit, validity and evidence |
| Compare values | Qualified compatible records; otherwise a structured incompatibility reason |
| Import preview and commit | Source edition, file archive reference, mapping version and idempotency key |
| Review and publish | Candidate snapshot, review evidence, expected current publication and authorised actor |
| Export | Snapshot and filters, permitted format, provenance and licence checks |

All reads return snapshot ID, source or edition identifiers, units, effective window, freshness and explicit data status. Validate viewport and row limits; use spatial indexes and cached aggregate reads. Cache keys include permission scope, filters, geography version and snapshot. Publication changes invalidate the active-snapshot pointer without exposing an incomplete build.

Enforce existing server-side permissions. Import, review, publish and export are distinct capabilities. A stale publish request returns a conflict rather than overwriting another reviewer's publication. Source suspension must prevent new use and withdraw affected outputs when rights require it; cached copies and exports follow the recorded terms.

## 7 Frontend and integration tasks

Add layer controls through the existing map registry rather than a second map stack. Provide the French labels Valeurs immobilières de référence officielles and Prix immobiliers affichés dans les annonces, with English translations in the existing catalogue. Prices and geography are loaded exclusively through the API.

Implement filter persistence using identifiers, not embedded data. A detail card exposes values, sample size, dates, source composition, precision and caveats. Distinguish unavailable, insufficient, historical, stale, loading and failed states. Show a readable incompatibility reason instead of a misleading difference percentage.

On mobile, controls must remain named and reachable with a details sheet that does not obscure essential navigation. Provide keyboard selection, screen-reader labels, non-colour status indicators and a table alternative. Test the user's Android class of device during pilot acceptance. Offline views may use already authorised cached snapshots only when policy permits, clearly labelled with their age.

Project reports reference an immutable snapshot and its filters. Studio access remains contextual and read-only. Do not add sales management, tax calculation or automated property valuation to the Studio.

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
| PRX13 | Source rights suspended | Required withdrawal and cache policy exercised |
| PRX14 | Snapshot rollback and database restore | Prior validated output and source lineage recover correctly |
| PRX15 | Mobile and bilingual UI | Named controls, readable cards and translated interface states |

Run npm run typecheck, npm test and npm run build for relevant code changes, plus applicable database integration and browser tests. Record commands, commit, environment, results and unresolved failures. Documentation publication alone does not require claiming that application tests ran.

## 9 Rollout and monitoring

Use a feature flag and restrict the initial pilot audience. Test migration and restore on a disposable database before preproduction. Validate real-source sample records with the data reviewer and reconcile aggregate counts. Measure query latency, map payload and mobile interaction on a representative dataset; agree performance thresholds before P8 rather than inventing measured targets.

Monitor import failures, excluded-row ratios, unmatched territories, duplicate review backlog, sample coverage, source concentration, stale snapshots, query latency and publication failures. Set alerts against agreed baseline values. Keep the last validated snapshot available while a refresh fails, with a visible stale state. Never silently replace it with partial results.

Production requires source qualification, acceptance evidence and an authorised release. Rollback disables the layer or reselects a previous snapshot; it does not delete audit history. Database rollback follows the tested migration procedure and preserves original files.

## 10 Governance and completion

Maintain decisions for pilot perimeter, source rights, official applicability, area definitions, sample thresholds, statistical method, permissions and performance targets. Requirements, hypotheses and recommendations remain distinct. Review workstream STATUS and HANDOFF in every pull request that changes that workstream, recording completed work and the next ready task.

A technical pilot is complete only when both layers meet their scoped acceptance gates with qualified real data. A single-source market layer must be labelled as such. Multi-source completion requires at least two authorised sources and cross-source deduplication evidence. A source blocker remains blocked with an owner and next action; it is never reclassified as verified.

The immediate next step after documentation review is P0 repository integration inventory, followed by P1 source dossiers. Application implementation, a merge, deployment and source-provider outreach are not performed by publishing this plan.

## 11 References

Companion specification: Fadi Concept Prix, version 1.0. Repository controls: AGENTS.md, docs/architecture.md and Fadi Concept/README.md. Source candidates and qualification requirements are listed in the companion specification. The Markdown master and Word edition must retain substantive parity and the same version.
