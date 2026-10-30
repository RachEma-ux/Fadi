# Fadi Concept Prix

Version 1.1 | 31 October 2026 | Product specification under implementation

Fadi will provide two independent property-price map layers for Morocco: official property reference values and aggregated asking prices from property listings. Their purpose is to support territorial analysis, site selection and architectural programming with traceable evidence. An official reference value is not a tax bill; an asking price is not a completed transaction price.

Version 1.1 incorporates the source qualification of 30–31 October 2026 (lot P1): Feenway is identified as an aggregator, its published barometer is reusable under CC BY 4.0 while its internal APIs are not authorised, official references can take several value forms, the publication geography follows the GeoData administrative hierarchy, and a go/no-go gate follows source qualification. Section 11 lists the changes.

## 1 Scope and product boundaries

The initial pilot covers a precisely recorded Casablanca perimeter: the commune of Casablanca as recorded in the GeoData administrative hierarchy (HCP code and division edition), with its prefectures of arrondissements and arrondissements as finer publication levels. Expansion to other communes follows source and geography qualification. The geographic scope, boundary edition and observation period accompany every result.

The capability belongs to Fadi's GeoData module and business-analysis context. It supplies contextual evidence to projects and the Studio without turning the Studio into a commercial property-management system. It preserves the authoritative 21-step Parcours, the autonomous Sandbox and the existing module architecture. No new top-level module or separate physical database is required: price data lives in dedicated GeoData tables of the existing database.

Version 1 includes source registration, controlled imports, official zones, listing normalisation, deduplication, geographic matching, published aggregates (computed by Fadi or published by a qualified third party), a map, comparison cards and traceable exports. It excludes automatic tax calculations, certified property valuations, negotiation estimates, transaction-price claims and predictive price models.

## 2 Source qualification

The following entries are qualified candidates as of 31 October 2026. Their dossiers, with evidence, blockers and next actions, are kept in `docs/workstreams/geodata/PRIX-SOURCES.md`. No public API, reuse licence or current tax applicability is presumed.

| Source | Intended contribution | Status on 31 October 2026 |
| --- | --- | --- |
| DGI, https://www.tax.gov.ma/ — property transaction price referential for Casablanca | Official reference values by fiscal zone, property type and condition | Blocked: only the January 2015 edition was located, through third-party copies; no reuse statement; validity unverified |
| DGI and ANCFCC common referential (2019) | Official average prices by zone (349 zones) | Blocked: document not located |
| Bank Al-Maghrib and ANCFCC real-estate asset price index (IPAI) | Context only (index and volumes, never a price level) | Candidate: reuse terms and city series to establish |
| Ordre des notaires and Yakeey electronic referential (2024) | Transaction-based price context | Blocked: no data access or licence; partnership candidate |
| Mubawab, https://www.mubawab.ma/ | Listing observations | Blocked: terms of use prohibit extraction and reuse |
| Avito, https://www.avito.ma/ | Listing observations | Blocked: no permitted route |
| Sarouty, Masaken, Agenz, Yakeey, Wafa Immobilier | Listing observations | Candidates: no permitted route identified |
| Feenway, https://www.feenway.com/ — published price barometer | Published aggregate asking-price medians by city, commercial neighbourhood, property type and transaction | Active: page declares CC BY 4.0; attribution "Source : FeenWay" with link |
| Feenway internal APIs | Listings, neighbourhood polygons, price context | Blocked: `robots.txt` disallows `/api/`; no licence for listings; upstream portal terms apply |

A published market report or barometer provides a contextual indicator and cannot be treated as row-level listing data. Source status progresses through candidate, qualified, authorised, active, suspended and retired. Qualification and authorisation require recorded evidence, a responsible reviewer and a review date. A source may be technically accessible while still not authorised for reuse.

An aggregator source (one that republishes listings collected from other portals, such as Feenway) is a derived source. It never counts as an independent source for a multi-source claim, and its observations are never combined with those of the portals it aggregates unless cross-source deduplication is proven on the combined set.

Prefer licensed feeds, partner exports or administrator-imported files with documented rights. Any automated collection must first pass source-specific access and reuse checks, including the site's `robots.txt` and terms. Do not circumvent access restrictions. Store only fields needed for the analysis; seller names, telephone numbers and personal contact details are not part of the public price layer.

## 3 Official reference layer

The user-facing French label is Valeurs immobilières de référence officielles. The English translation is Official property reference values. Each record retains the issuing authority, administrative purpose, document edition, original category, mapped category, condition (old, recent, new) where stated, value form, value, currency, unit, source page or row, effective dates and verification status.

An official value takes one of the following forms, all recorded without transformation: a single unit value; a range with minimum and maximum; a pair of land price and construction price (as in the DGI referential for villas and houses); or a conditional value whose applicability depends on a stated condition such as building height or plot area. The original text of the value is kept.

Official zones retain their original geometry and zone identifier. They must not be replaced by commune or neighbourhood boundaries merely for visual convenience. When a reference only describes a street or zone in text, a reviewer must approve its spatial interpretation. Unresolved zones remain in a review queue; tabular consultation remains available without a map polygon.

A retired or historical edition is available through an explicit historical filter. An edition with unknown validity is labelled validity unverified and is excluded from a current official comparison. Fadi must never infer that the most recently imported edition is legally current. The administrative purpose and applicability need confirmation by the responsible domain reviewer. As long as no edition is authorised, the layer shows an explicit unavailable state with the blocking reason.

## 4 Advertised market price layer

The French label is Prix immobiliers affichés dans les annonces; the English translation is Advertised property prices. Separate sale from rental and separate apartments, houses, villas, land, offices and commercial premises. Keep new and existing property distinguishable where the source supports that distinction.

| Measure | Definition |
| --- | --- |
| Sale unit price | Advertised total sale price divided by comparable stated area, in MAD per square metre |
| Monthly rent | Advertised monthly rent, in MAD per month |
| Rental unit price | Monthly rent divided by comparable stated area, in MAD per square metre per month |
| Central estimate | Median of eligible distinct-property unit prices, not total prices divided by total area |
| Spread | 25th and 75th percentiles using a recorded quantile method |
| Sample size | Number of distinct eligible properties, alongside raw observations and excluded counts |
| Provenance | Source composition, observation window, freshness and method version |

Record the area basis: habitable, built, saleable, parcel or unknown. Never mix parcel area with habitable floor area. Unknown area basis must be a separate cohort or be excluded from comparable unit-price statistics. Preserve original currency and price period; conversions require a dated source and explicit method. Daily, weekly and monthly rentals are distinct segments.

For the initial pilot, use a configurable 90-day observation window and a proposed minimum of 20 distinct comparable properties per published cell. These are starting parameters for evaluation, not established statistical guarantees. Use the latest eligible observation per property in the window. Display the metric as observed asking prices over that window; do not imply that every listing remains available today.

Exact source identifiers remove repeated observations. Cross-platform matching uses documented signals such as locality, category, area, price and permitted content fingerprints. Ambiguous matches remain reviewable. Persist merge and split decisions so results can be reproduced. A disappearing listing is not evidence that a sale occurred.

Quarantine invalid, placeholder and non-positive prices or areas. Flag unusual but plausible observations using versioned rules, retain exclusion reasons and report sensitivity to outlier treatment. Do not silently delete luxury properties or trim away legitimate submarkets. Source concentration and unequal neighbourhood coverage must remain visible; a large sample does not prove market representativeness.

A third-party published aggregate, such as the Feenway barometer, is a distinct product of this layer. Its values are kept exactly as published, with the publisher's own method, period, units and counts (which count listings, not distinct properties), and an approximate flag when the publisher abbreviates amounts. It is never recomputed, never merged with medians computed by Fadi and never presented as a distinct-property statistic. Its label states the publisher and that it is a published aggregate from a single derived source.

## 5 Geography and map behaviour

Reuse authoritative territory identifiers and the qualified GeoData hierarchy: region, province or prefecture, commune, prefecture of arrondissements and arrondissement as recorded in the database. Keep source locality labels, geographic precision, match method and boundary version. Geographic, cadastral and local design coordinates remain explicitly tagged; transformations are recorded. A neighbourhood centroid must never masquerade as the property's exact address.

Publish polygon-based aggregates rather than public listing points. Listings known only to a commune contribute only to that commune or a coarser level. A fiscal zone that intersects several neighbourhoods requires qualified spatial attribution; never allocate a neighbourhood median to every overlapping fiscal zone.

Commercial neighbourhood names used by portals (for example Racine, Gauthier or Maârif) are not administrative units and have no official boundaries. They remain source locality labels. They are matched to an administrative unit only by a reviewed correspondence, and a dedicated neighbourhood geography is added only from a qualified boundary source. Until then, values published by neighbourhood are consultable in a table attached to their commune, without a polygon.

The price layers appear in the GeoData catalogue as their own entry, with independent layer switches and filters for transaction type, property type, area basis, period, source and geographic level. Each legend states the unit, date and classification method. Missing, insufficient, stale, unauthorised and failed data are distinct states. Null never becomes zero. Comparable views use stable legend breaks so a colour change does not falsely suggest a price change.

Selecting a zone opens a readable card, consistent with the GeoData information panel, with value, spread, sample size, source composition, geography precision, last observation, method version and exclusions. Mobile users receive named controls and a full-width details sheet. Keyboard access, non-colour status cues and accessible tables are required. Empty database tables produce an honest empty state, never embedded demonstration prices.

## 6 Comparison rules

A comparison is permitted only when territory or qualified spatial attribution, property category, condition where stated, transaction type, area basis, currency, unit and relevant dates are compatible, and when both values are current and authorised. Otherwise the card explains which dimensions prevent the comparison. Historical official references may be displayed separately but cannot silently stand in for current values. A third-party published aggregate is compared only with its own published dimensions and never with a value whose basis is undocumented.

When compatibility is established and the official reference is a positive single value, the descriptive difference is 100 multiplied by (asking-price median minus official reference) divided by official reference. Label it Asking-price difference from official reference. When the official reference is a range, show the position of the median relative to the range (below, within or above) without a percentage. A land and construction pair or a conditional value is compared only when the condition and the decomposition are applicable to the cohort; otherwise no comparison is shown. The result is neither overvaluation, a tax assessment, a negotiation discount nor a realised market premium.

The interface retains both underlying values and dates. It must not blend them into one composite price. No automatic parcel or building valuation is produced from an area-wide median.

## 7 Data ownership and architecture

Follow Fadi's modular monolith and the mandatory UI to dedicated database pattern (D-GD-29). Dedicated GeoData price tables hold qualified data; the API performs validated reads and writes; the browser contains no built-in price or territorial reference dataset. Reuse the existing database, GeoData roles, source qualification records, file archive and import mechanisms rather than creating a parallel platform.

The logical entities are source edition, original file, import batch, official zone, official value, listing observation, property cluster, territory match, published third-party aggregate, aggregate snapshot and publication audit. Sources are registered through the existing GeoData source records. All imported files are archived unchanged in the database, in `geodata_fichiers`, with checksums and lineage.

An aggregate snapshot records its input editions, geography version, filter set, time window, methodology version, exclusions and build identifier. Build and validate a candidate snapshot before atomically publishing it. Readers always see a complete published version. Rollback reselects a previous validated snapshot without destroying import history.

## 8 Permissions and administration

Define capabilities for consultation, source management, import, review, publication and export through the existing GeoData permission system. Enforce permissions on the server. Public aggregates must not expose restricted source rows. Exports must obey each source's licence and preserve provenance and attribution.

The administration surface provides source qualification, import previews, field mapping, geometry review, duplicate review, quality reports, publication history and rollback. Import errors remain actionable: show affected rows, reason and next step. Jobs use idempotent batch keys, bounded retries and a failed-job queue. Record who approved each publication and why.

## 9 Acceptance and delivery boundaries

Acceptance requires two independently labelled layers, reproducible values, traceable source editions, valid spatial matching, no mixed units, no duplicate weighting, explicit missing-data states, protected publication and a tested rollback. A pilot may contain a useful listing layer while the official layer remains unavailable with a documented reason; this is partial delivery, not completion of both layers.

A go/no-go gate follows source qualification: when no listing source is authorised for row-level observations, the market layer is delivered with authorised published aggregates only, labelled as such, and the observation pipeline is delivered and tested with synthetic test fixtures that are never shipped as data. When no official edition is authorised, the official layer is delivered empty with its blocking reason.

The first complete production release requires at least one qualified official dataset for its stated pilot scope and at least one authorised listing dataset. Calling the market result multi-source additionally requires two independently ingested, non-derived sources with cross-source deduplication tested.

## 10 References and document control

Repository references: AGENTS.md; docs/architecture.md; Fadi Concept/README.md; docs/workstreams/geodata/PRIX-SOURCES.md (source dossiers); ADR-GEODATA-02 (GeoData decisions). Product boundary reference: Studio-Le Concept.md, supplied project source. External URLs identify organisations and pages, not verified data-download endpoints. No numeric property prices or legal conclusions are asserted by this concept.

The Markdown file is the editable master; the Word edition preserves the same substantive content and version. Delivery of this specification does not establish source approval or deployment. The companion Fadi Concept Prix Plan defines the execution lots and evidence gates.

## 11 Changes from version 1.0

- Section 2: source statuses established; Feenway identified as an aggregator; barometer authorised under CC BY 4.0; internal APIs blocked; notarial referential and IPAI added; rule on derived sources.
- Section 3: official value forms (single, range, land and construction pair, conditional) and condition attribute.
- Section 4: third-party published aggregates as a distinct product.
- Section 5: publication geography aligned on the GeoData hierarchy; commercial neighbourhoods kept as source labels.
- Section 6: comparison rules per official value form.
- Sections 7 and 8: integration in existing GeoData tables, roles and archive.
- Section 9: go/no-go gate after source qualification.
