# Fadi Concept Prix

Version 1.0 | 30 October 2026 | Proposed product specification

Fadi will provide two independent property-price map layers for Morocco: official property reference values and aggregated asking prices from property listings. Their purpose is to support territorial analysis, site selection and architectural programming with traceable evidence. An official reference value is not a tax bill; an asking price is not a completed transaction price.

## 1 Scope and product boundaries

The initial pilot covers a precisely recorded Casablanca perimeter, preferably the commune rather than an undefined metropolitan area. Expansion to other communes follows source and geography qualification. The geographic scope, boundary edition and observation period accompany every result.

The capability belongs to Fadi's GeoData and business-analysis context. It supplies contextual evidence to projects and the Studio without turning the Studio into a commercial property-management system. It preserves the authoritative 21-step Parcours, the autonomous Sandbox and the existing module architecture. No new top-level module or separate physical database is required by this concept.

Version 1 includes source registration, controlled imports, official zones, listing normalisation, deduplication, geographic matching, published aggregates, a map, comparison cards and traceable exports. It excludes automatic tax calculations, certified property valuations, negotiation estimates, transaction-price claims and predictive price models.

## 2 Source qualification

The following entries are candidates, not certified active feeds. Their current coverage, formats, terms, access rights and publication dates must be established before production ingestion. No public API, reuse licence or current tax applicability is presumed.

| Candidate | Intended contribution | Required evidence |
| --- | --- | --- |
| DGI at https://www.tax.gov.ma/ | Official property reference publications | Issuer, exact document, edition, purpose, validity, geography and authorised reuse |
| ANCFCC at https://www.ancfcc.gov.ma/ | Complementary official reference and geographic information | Exact product and administrative purpose; equivalence with DGI must never be assumed |
| Mubawab at https://www.mubawab.ma/ | Listings or published market summaries | Permitted access, field definitions, dates, geographic precision and reuse terms |
| Avito at https://www.avito.ma/ | Additional listing observations | Permitted access, stable identifiers, update semantics and rights |
| Feenway | Additional candidate named in the brief | Confirm exact service identity and canonical URL before any connector work |

A published market report can provide a contextual indicator but cannot be treated as row-level listing data. Source status progresses through candidate, qualified, authorised, active, suspended and retired. Qualification and authorisation require recorded evidence, a responsible reviewer and a review date. A source may be technically accessible while still not authorised for reuse.

Prefer licensed feeds, partner exports or administrator-imported files with documented rights. Any automated collection must first pass source-specific access and reuse checks. Do not circumvent access restrictions. Store only fields needed for the analysis; seller names, telephone numbers and personal contact details are not part of the public price layer.

## 3 Official reference layer

The user-facing French label is Valeurs immobilières de référence officielles. The English translation is Official property reference values. Each record retains the issuing authority, administrative purpose, document edition, original category, mapped category, value, currency, unit, source page or row, effective dates and verification status.

Official zones retain their original geometry and zone identifier. They must not be replaced by commune or neighbourhood boundaries merely for visual convenience. When a reference only describes a street or zone in text, a reviewer must approve its spatial interpretation. Unresolved zones remain in a review queue; tabular consultation may remain available without a map polygon.

A retired or historical edition is available through an explicit historical filter. An edition with unknown validity is labelled validity unverified and is excluded from a current official comparison. Fadi must never infer that the most recently imported edition is legally current. The administrative purpose and applicability need confirmation by the responsible domain reviewer.

## 4 Advertised market price layer

The French label is Prix immobiliers affichés dans les annonces; the English translation is Advertised property prices. Separate sale from rental and separate apartments, houses, villas, land and commercial premises. Keep new and existing property distinguishable where the source supports that distinction.

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

## 5 Geography and map behaviour

Reuse authoritative territory identifiers and the qualified GeoData hierarchy. Keep source locality labels, geographic precision, match method and boundary version. Geographic, cadastral and local design coordinates remain explicitly tagged; transformations are recorded. A neighbourhood centroid must never masquerade as the property's exact address.

Publish polygon-based aggregates rather than public listing points. Listings known only to a commune contribute only to that commune or a coarser level. A fiscal zone that intersects several neighbourhoods requires qualified spatial attribution; never allocate a neighbourhood median to every overlapping fiscal zone.

The map offers independent layer switches, transaction type, property type, area basis, period, source and geographic level. Each legend states the unit, date and classification method. Missing, insufficient, stale, unauthorised and failed data are distinct states. Null never becomes zero. Comparable views use stable legend breaks so a colour change does not falsely suggest a price change.

Selecting a zone opens a readable card with value, spread, sample size, source composition, geography precision, last observation, method version and exclusions. Mobile users receive named controls and a full-width details sheet. Keyboard access, non-colour status cues and accessible tables are required. Empty database tables produce an honest empty state, never embedded demonstration prices.

## 6 Comparison rules

A comparison is permitted only when territory or qualified spatial attribution, property category, transaction type, area basis, currency, unit and relevant dates are compatible. Otherwise the card explains why the values cannot be compared. Historical official references may be displayed separately but cannot silently stand in for current values.

When compatibility is established and the reference is positive, the descriptive difference is 100 multiplied by (asking-price median minus official reference) divided by official reference. Label it Asking-price difference from official reference. It is neither overvaluation, a tax assessment, a negotiation discount nor a realised market premium.

The interface retains both underlying values and dates. It must not blend them into one composite price. No automatic parcel or building valuation is produced from an area-wide median.

## 7 Data ownership and architecture

Follow Fadi's modular monolith and the mandatory UI to dedicated database pattern. Dedicated price tables hold qualified data; the API performs validated reads and writes; the browser contains no built-in price or territorial reference dataset. Reuse existing database, permission, GeoData and import mechanisms after code inspection rather than creating a parallel platform.

Suggested logical entities are source, source edition, original file, import batch, official zone, official value, listing observation, property cluster, territory match, aggregate snapshot and publication audit. Names are proposals to reconcile with current schemas. All imported files are archived unchanged in the database, using geodata_fichiers where appropriate, with checksums and lineage.

An aggregate snapshot records its input editions, geography version, filter set, time window, methodology version, exclusions and build identifier. Build and validate a candidate snapshot before atomically publishing it. Readers always see a complete published version. Rollback reselects a previous validated snapshot without destroying import history.

## 8 Permissions and administration

Define capabilities for consultation, source management, import, review, publication and export through the existing permission system. Enforce permissions on the server, including project and organisation scope where applicable. Public aggregates must not expose restricted source rows. Exports must obey each source's licence and preserve provenance.

The administration surface provides source qualification, import previews, field mapping, geometry review, duplicate review, quality reports, publication history and rollback. Import errors remain actionable: show affected rows, reason and next step. Jobs use idempotent batch keys, bounded retries and a failed-job queue. Record who approved each publication and why.

## 9 Acceptance and delivery boundaries

Acceptance requires two independently labelled layers, reproducible values, traceable source editions, valid spatial matching, no mixed units, no duplicate weighting, explicit missing-data states, protected publication and a tested rollback. A pilot may contain a useful listing layer while the official layer remains unavailable with a documented reason; this is partial delivery, not completion of both layers.

The first production release requires at least one qualified official dataset for its stated pilot scope and at least one authorised listing dataset. Calling the market result multi-source additionally requires two independently ingested sources with cross-source deduplication tested. Feenway remains optional until identity, rights and technical access are confirmed.

## 10 References and document control

Repository references: AGENTS.md; docs/architecture.md; Fadi Concept/README.md. Product boundary reference: Studio-Le Concept.md, supplied project source. External URLs in section 2 identify candidate organisations and portals, not verified data-download endpoints. No numeric property prices or legal conclusions are asserted by this concept.

The Markdown file is the editable master; the Word edition must preserve the same substantive content and version. Delivery of this specification does not establish implementation, source approval, acceptance or deployment. The companion Fadi Concept Prix Plan defines the execution lots and evidence gates.
