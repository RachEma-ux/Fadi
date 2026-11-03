# Fadi high resolution terrain implementation plan

Version 1.0 — 2 November 2026

## Purpose and delivery decision

Add a modular terrain capability to Fadi GeoData that displays coloured elevations, answers point elevation queries, generates terrain profiles and supports preliminary slope analysis. Deliver a 25 cm bare-earth terrain layer for surveyed project areas, with optional 5 cm detail where acquisition quality supports it. Retain a clearly labelled regional model outside surveyed coverage.

This is an implementation proposal based on the research in this conversation. The current Fadi repository has not been audited for this plan. Component names and API routes below are proposed contracts, not claims about existing code. The first work package reconciles them with the existing application. No supplier has been contacted and no data purchase, survey, implementation or deployment has been performed.

Initial geographic reference: the Benslimane view centred at 33.5315 N, 7.10621 W. This point is not a project boundary. Acquire or draw an explicit area-of-interest polygon before requesting quotations or calculating acquisition quantities. Do not substitute the P.118 parcel without confirming that it is the intended site.

## Requirements and terminology

| Requirement | Decision |
|---|---|
| Default local product | Bare-earth DTM, called MNT in the French interface, with a 0.25 m grid |
| Optional detailed product | 0.05 m grid in approved subareas; retain measured accuracy separately |
| Surface product | Separate DSM or MNS including buildings and vegetation |
| Regional context | Existing licensed regional DEM, such as TessaDEM at approximately 30 m |
| Rendering | Coloured elevations with adjustable opacity and optional hillshade |
| Analysis | Numerical source raster or point cloud, never RGB map tiles |
| Traceability | Source, version, survey date, grid spacing, vertical datum and quality status on every result |
| Existing workflows | Integrate into GeoData and the existing parcel and architectural workflows without renumbering Parcours |
| User language | Preserve existing French product labels; this implementation plan is in English |

Grid spacing, image ground sampling distance, vertical accuracy and contour interval are different properties. No resampling or visual smoothing may upgrade a dataset's quality classification. A 5 cm orthophoto does not establish a 5 cm DTM. A point cloud also requires ground classification and coverage checks before it can support a bare-earth terrain model.

## Work packages and dependencies

| ID | Work package | Depends on | Accountable role | Completion evidence |
|---|---|---|---|---|
| TER-00 | Audit Fadi integration points and define pilot AOI | None | Technical lead and project owner | Architecture note, AOI polygon, existing capabilities mapped |
| TER-01 | Prepare acquisition specification and source comparison | TER-00 | Geomatics lead | Comparable supplier responses or archive metadata, rights and costs |
| TER-02 | Implement catalog and controlled import | TER-00 | Backend lead | Versioned dataset records and repeatable import jobs |
| TER-03 | Implement terrain processing and quality gate | TER-02 | Geomatics and backend leads | Quality report, numeric rasters, masks and processing provenance |
| TER-04 | Publish authorized tiles and numerical APIs | TER-03 | Backend lead | Versioned endpoints, access controls and performance evidence |
| TER-05 | Integrate terrain interface | TER-04 | Frontend lead | Working overlay, legend, query, profile and source panel |
| TER-06 | Validate local 25 cm survey | TER-01, TER-03 | Survey provider and independent reviewer | Accepted AOI coverage and checkpoint report |
| TER-07 | Pilot optional 5 cm detail | TER-06 | Geomatics lead | Demonstrated additional detail, quality and cost assessment |
| TER-08 | Release and operate | TER-05, TER-06 | QA and release owner | Green CI, preproduction acceptance and rollback rehearsal |

TER-02 through TER-05 can progress using a verified reference dataset while local acquisition is arranged. A Lucerne reference dataset must remain labelled as Swiss demonstration data and must never be presented as Benslimane coverage. A functional software demo does not satisfy TER-06.

## TER-00 integration audit

Inspect the actual map engine, GeoData source registry, organization and project permissions, upload services, background-job mechanism, object storage, deployment configuration and automated tests. Reuse those facilities wherever suitable. Record the audited commit and concrete extension points before implementation.

Keep responsibilities in separate modules: terrain catalog and permissions; import and validation; geomatics processing; numeric query services; tile rendering; map controls. React components must not own geospatial processing or provider credentials. Expensive operations run asynchronously outside interactive web requests.

Define the AOI as a polygon with a suitable surrounding buffer, document the intended uses, and calculate area in a projected metric coordinate system. Establish whether the first release needs only exploratory visualization or also design-support quantities; detailed engineering acceptance requires the latter to be explicitly specified.

## TER-01 acquisition specification

Investigate ANCFCC archive availability for the exact AOI first, and compare it with survey proposals from SEPRET and GEOMAITRISE. Published supplier accuracies are claims to verify, not accepted measurements. No ready-made 25 cm or 5 cm Benslimane dataset has been confirmed by the research.

Request the following in one consistent specification:

- AOI and buffer coverage, survey date and acquisition method.
- Bare-earth DTM at 0.25 m and a separately priced 0.05 m option for a defined subarea.
- Separate DSM, classified LAS or LAZ point cloud, ground-point density and gap maps, terrain breaklines where relevant, and GeoTIFF elevation rasters.
- Horizontal CRS, vertical datum, elevation units, benchmark information and transformation details.
- Independent checkpoints excluded from adjustment and model fitting; their distribution, ground classes and measurement uncertainty.
- Signed quality report reporting bias, RMSEz, absolute-error percentiles, gaps and limitations by terrain or vegetation class.
- Permitted storage, processing, web display, derived-map publication and export rights, including attribution requirements.
- Itemized acquisition, processing, control, delivery and update costs; schedule and responsibility for required fieldwork permissions.

Prefer LiDAR proposals for ground beneath vegetation, while checking actual ground returns. Photogrammetry is a candidate on visible, sufficiently textured surfaces. Require supplementary ground observations where buildings, water, vegetation or steep terrain prevent reliable ground reconstruction.

### Proposed pilot acceptance targets

These are proposed contractual targets, not published dataset performance or universal surveying standards. A geomatics professional must confirm their suitability before procurement.

| Item | 25 cm pilot | Optional 5 cm detail |
|---|---|---|
| Delivered grid spacing | 0.25 m | 0.05 m |
| Suggested RMSEz target on suitable independently checked bare ground | At most 0.10 m | At most 0.05 m |
| Suggested 95th percentile absolute vertical error | At most 0.20 m | At most 0.10 m |
| Checkpoint plan | At least 30 independent checkpoints for the pilot, distributed across elevations and relevant ground classes; increase for larger or heterogeneous sites | Additional independent checks in the detailed subarea, with count agreed before acquisition |
| Coverage | No undocumented gaps inside the contracted analyzable area | Same, plus evidence that finer measurements support additional detail |
| Vegetation or inaccessible ground | Class-specific results and exclusions; do not transfer bare-ground accuracy claims | Same |

For checkpoint i, define residual e_i = model elevation minus surveyed elevation. Report bias = mean(e_i), RMSEz = sqrt(mean(e_i²)), and the empirical 95th percentile of |e_i|. Do not silently remove outliers or claim a confidence level from RMSE alone. Store checkpoint uncertainty and test method with the report.

## TER-02 data model and import

Use PostgreSQL/PostGIS for footprints, catalog metadata, permissions and job state, subject to the repository audit. Store large point clouds and elevation rasters in the established durable object-storage service. Preserve original deliveries immutably; publish new dataset versions rather than overwriting originals.

Minimum records:

| Record | Required information |
|---|---|
| Dataset | ID, organization/project scope, producer, license, permitted operations, geographic footprint, source reference |
| Dataset version | Acquisition date, import date, source checksums, DTM/DSM type, source grid spacing, delivered grid spacing, units, horizontal CRS, vertical datum, quality state |
| Asset | Original and derived object keys, format, checksum, bounds, NoData value, processing run and access policy |
| Quality report | Checkpoint provenance, bias, RMSEz, percentile errors, sample counts, gap/density summaries, reviewer and decision |
| Processing job | Input versions, parameters, software versions, progress, retries, output references and failure reason |

Lifecycle: uploaded → validating → quarantined or processing → awaiting review → accepted → published → superseded or withdrawn. A failed import must never replace the published version. Jobs must be resumable, idempotent by input checksum plus processing configuration, and observable.

Validate file signatures, size limits, bounds, CRS, units, NoData, raster dimensions and point classifications. Reject malformed inputs. Quarantine unknown vertical datums instead of guessing. Restrict remote ingestion to approved sources and prevent arbitrary backend URL fetching.

## TER-03 processing and numerical integrity

Use a reproducible geospatial worker with pinned, supported GDAL and PDAL versions selected during implementation. The proposed sequence is:

1. Preserve original files, checksums and acquisition metadata.
2. Validate georeferencing and select the appropriate local projected metric CRS with the geomatics reviewer.
3. Reconcile height reference systems through an approved transformation; record grid files and transformation accuracy. Never relabel ellipsoidal heights as orthometric heights.
4. Inspect ground classifications, density, gaps and discontinuities. Reclassify only with recorded parameters and QA.
5. Generate or validate DTM and DSM separately. Preserve breaklines and flag interpolated areas.
6. Produce numeric GeoTIFF/COG assets, overviews, coverage and quality masks, hillshade and slope derivatives.
7. Compute acceptance statistics against independent checkpoints and assign the quality state.
8. Publish only reviewed versions; retain all inputs and provenance.

Use suitable aggregation for display overviews; quantitative analysis reads the appropriate numeric source resolution. Keep NoData distinct from zero elevation. Account for horizontal and vertical units in slope calculations. Buffer tile processing to avoid edge artifacts.

Do not blend incompatible vertical datums. When sources overlap, prefer an accepted source suitable for the task using documented priority, quality and acquisition date. Return the chosen source with each result. Mark source transitions in profiles and prevent invisible jumps between local surveys and the regional fallback.

## TER-04 service contracts

Routes are illustrative and must follow existing Fadi conventions after TER-00.

| Operation | Proposed behavior |
|---|---|
| List datasets by extent | Return authorized footprints, quality states, dates and native grid spacing |
| Query point elevation | Return elevation, units, datum, dataset version, spacing, sampling method and availability status |
| Request profile | Validate geometry and sample limit; return chainage, elevations, source changes and gaps |
| Request AOI statistics | Calculate within the actual polygon, not its rectangular bounding box; return valid coverage percentage |
| Request export | Check rights, extent and pixel budget; create an asynchronous job with an expiring authorized download |
| Render tiles | Serve versioned colour or hillshade tiles with authorized caching and no leakage between organizations |

Default to the best accepted local source; make regional fallback explicit. Outside available coverage, return an unavailable result rather than a fabricated elevation. Profiles sampled more densely than the source must be marked as interpolated. Cache keys include dataset version, style, range and authorization scope. Never use a public cache for restricted survey data.

## TER-05 interface and workflow integration

Add a Terrain control within the existing GeoData map. Proposed French labels include “Altitude”, “Pente”, “Ombrage”, “Profil du terrain”, “Sources et précision” and “Couverture disponible”. Reuse the existing design system and responsive map shell.

The user selects a project or area, enables the terrain layer, inspects provenance and queries a point or draws a profile. Display these fields beside the result: source, survey date, grid spacing, measured quality, height reference and validation state. Round displayed values consistently with supported accuracy; retain full numeric values internally.

Provide opacity control and a legible colour ramp. Offer a locked legend for comparison and a clearly labelled adaptive legend for exploration. Adaptive statistics and colours must have an explicit scope: viewport, selected AOI or dataset. Do not show province-wide summary statistics as though they describe the selected plot.

Show local-survey coverage boundaries and a clear message when only the regional model is available. Keep DTM and DSM selectable as distinct products. Restrict very fine contours when measurement uncertainty makes them misleading. Blue elevation colours must not imply water; the water layer is separate.

In the parcel workflow, attach the approved terrain version to the project. In the architectural workspace, provide a versioned terrain reference with explicit units, origin and coordinate transformation. Do not silently replace a terrain surface used by an existing design when a newer survey arrives.

## Capacity and operating costs

For an area A square metres and grid spacing r metres, cell count is approximately A/r². A single Float32 elevation band requires about 4A/r² bytes before compression, overviews, masks or metadata.

| Area | Grid | Approximate cells | Uncompressed single-band size |
|---|---|---|---|
| 1 km² | 0.25 m | 16 million | 64 MB |
| 1 km² | 0.05 m | 400 million | 1.6 GB |
| 10 km² | 0.25 m | 160 million | 640 MB |
| 10 km² | 0.05 m | 4 billion | 16 GB |

Moving from 25 cm to 5 cm creates 25 times as many cells for the same area. Budget separately for point clouds, originals, derivatives, replicas, backups, processing and data transfer. Do not size the service from compressed colour tiles alone.

Keep national or regional context at its available resolution. Use 25 cm for acquired project areas and 5 cm only where finer detail has a demonstrated use. Establish import size limits, worker resource limits, quotas and export pixel budgets before pilot release. Benchmark the real hosting environment; do not assume it can process multi-billion-cell rasters in memory.

## Verification and release gates

| Gate | Required evidence |
|---|---|
| G0 scope | Audited integration points, AOI, intended use and agreed acquisition targets |
| G1 software readiness | Deterministic imports, correct datum handling, numeric queries and permissions verified with reference data |
| G2 local data acceptance | Benslimane survey coverage and independent checkpoint report accepted; licensing documented |
| G3 preproduction | Map, point query, profiles, AOI statistics, exports and rollback pass on desktop and an actual Android device |
| G4 release | Required CI on main entirely green; version pinned; backup and restore checked; release record complete |

Meaningful automated tests must include a known synthetic plane for slope and profiles, an AOI with a hole for statistics, NoData boundaries, a datum mismatch, a seam between datasets, unauthorized access, and a failed import preserving the published version. Verify exports retain CRS, datum metadata and numeric values. Use a genuine reference dataset for geospatial integration tests; synthetic fixtures must be labelled test-only.

Proposed performance budgets for the agreed pilot and documented test conditions: cached point-query p95 under 1 second; cached terrain viewport visible within 3 seconds; interactive pan and zoom without freezing on the test Android device. Benchmark a fixed profile workload and move larger requests to background jobs. Record network, device, data extent, cache state and concurrency with results before accepting these budgets.

Rollback must switch the published dataset pointer and application feature flag to the previous accepted version without deleting originals. Cache invalidation must follow version changes. Restore a sample raster and catalog entry from backup and confirm their checksums and access controls.

## Delivery sequence and planning estimate

Suggested engineering effort is 5–8 weeks for a small team with backend, frontend and geomatics capability, after TER-00 confirms scope. This is an estimate, not a delivery commitment, and excludes supplier lead times and field acquisition.

1. Week 1: audit, AOI, source specification, metadata design and reference-data selection.
2. Weeks 2–3: controlled ingestion, worker pipeline, quality states and numerical checks.
3. Weeks 3–5: numerical APIs, tile serving and interface integration.
4. Weeks 5–6: local data acceptance when delivered, mobile verification, security and performance checks.
5. Weeks 6–8: optional 5 cm pilot, corrections, release evidence and operational handover.

If local data arrives late, complete and demonstrate software capability using clearly labelled reference coverage. Keep the Benslimane high-resolution layer unavailable until G2 passes. The optional 5 cm product must not block delivery of an accepted 25 cm product.

## Definition of done

- An authorized user can display an accepted 25 cm survey over its actual coverage and distinguish it from regional fallback.
- Every numerical result identifies its source version, grid spacing, datum and quality state.
- Point queries, profiles and AOI statistics use numeric elevation data and handle gaps correctly.
- Fine-grid imagery or interpolation is never misrepresented as measured terrain precision.
- The local survey satisfies its agreed acceptance targets or is explicitly rejected or restricted in use.
- Rights, access controls, quotas, monitoring, backups and rollback are operational.
- Repository-specific implementation documentation, QA evidence and the release record are delivered.

## Source register

Research references inspected in the preceding conversation on 2 November 2026. Recheck commercial terms and product availability during procurement. No vendor is endorsed or contracted by this plan.

1. TessaDEM — resolution, vertical reference, licensing and access: https://tessadem.com/
2. TessaDEM elevation API — formats and numerical access: https://tessadem.com/elevation-api/
3. SEPRET airborne laser — provider description and advertised accuracy: https://sepret.ma/laser-aeroporte/
4. SEPRET Moroccan project references — evidence of local LiDAR work: https://sepret.ma/natio/
5. GEOMAITRISE drone surveys — provider methods and advertised accuracy: https://www.geomaitrise.ma/services/leves-par-drone/
6. ANCFCC cartography catalogue — indexed listing includes terrain models; detailed access and resolution unverified because the page returned an access error: https://www.ancfcc.gov.ma/produits-et-formalit%C3%A9s/produits/cartographie/
7. Canton of Lucerne — 25 cm terrain and surface models, point-cloud specifications and access: https://geoportal.lu.ch/3D/geodaten

The Lucerne dataset is a reference for testing, not a source for Moroccan elevations. Supplier performance statements must be replaced by project-specific independent validation before local data is accepted.
