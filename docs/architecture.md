# Architecture and migration

This document follows the objective brief "Parcours App : transformer le prototype en une plateforme
professionnelle de programmation et de conception architecturale" (provided 2026-10-01). That brief is the
authoritative target; this file translates it into repository structure and sequencing. Where this file and
the brief disagree, the brief wins — fix this file, not the other way round.

## Product objective

An installable web application (desktop, tablet, phone) that durably manages several projects and several
parcels, keeping continuity between site data, programme, architectural design, analyses and decisions. Every
piece of information must be retrievable, editable, checkable and carried forward to later steps with its
provenance. The current Parcours experience (`Parcours_V8_19_Escalier_B_Mezzanine.html`) is the functional
reference, not a file to delete: the 21 numbered steps (01–21), their order, labels, phases and mobile card
grid are preserved, Harmonie stays integrated in the relevant steps, and the Atelier Architectural keeps its
drawing functions, levels, views and Volume/Exploded behaviours. P.118 becomes a fully-populated, duplicable
example project used for testing — its characteristics are project data, never hard-coded defaults for other
buildings.

## Shape: a modular monolith

One application, organised in modules with clearly separated responsibilities — not a premature microservice
split. Shared, reusable calculations are extracted into modules independent of the UI; where a validation must
run both in the browser and on the server, both use the same versioned business logic (this is why
`packages/core-geometry` has zero runtime dependency on React or the DOM beyond `CanvasRenderingContext2D`'s
type).

| Module | Responsibility |
| --- | --- |
| Projets et sources | Projects, parcels, files, versions and provenance |
| Parcours | Steps, progress, decisions and hand-offs |
| Programmation | Needs, headcounts, spaces, areas and functional relationships |
| Atelier Architectural | Building model, drawing, selection, editing and views |
| Analyses métier | Quantities, constraints, checks and scenario comparison |
| Documents | Plans, tables, schedules and reports |
| Collaboration | Access, comments, revisions and synchronisation |

Scaffolded as `apps/web/src/modules/<module>/README.md` (one file per module stating its responsibility and
current status) so the boundary exists in the repository before it exists in the UI, instead of emerging by
accident from a single `main.tsx`.

## Domain model

The centre of the application is a shared, structured, versioned project model, not a collection of per-screen
state. It brings together parcels, buildings, levels, rooms, constructive elements, equipment, requirements,
source documents, scenarios and decisions. Programmed spaces (Programmation) and drawn rooms (Atelier) are
recorded separately, then linked — this is what lets the app compare programme intent against what was
actually designed, instead of silently conflating the two.

| Information | Governance principle |
| --- | --- |
| Objet architectural | Stable identifier, properties, geometry and relations to other objects |
| Donnée source | Origin document, date, unit and verification status |
| Exigence | Regulatory, contractual or programmatic origin made explicit |
| Hypothèse | Retained value, justification and expected validation |
| Résultat calculé | Method, data used and model revision |
| Décision | Choice made, justification, author and date |
| Document produit | Project revision used and freshness state |

An `Exigence` (requirement), a `Hypothèse` and a `Recommandation` are three distinct kinds of statement, never
collapsed into one "note" field. Cadastral coordinates, geographic coordinates and the building's local frame
are three distinct reference systems, explicitly tagged — never silently mixed in a calculation.

`packages/domain-model` carries these entity types today (interfaces + the enumerations they need), with
tests on their invariants. It intentionally does not yet carry persistence, validation rules or UI — those
belong to Lot 2 onward, once the backend exists to enforce them server-side too.

The building model itself is being rebuilt on the DrawAll V4.1 contracts (`docs/drawall/`, decisions D1–D6;
specification `docs/atelier-cahier-des-charges.md`): `packages/atelier-model` is the pure package that owns the
`building.architecture` ontology (storeys, walls, doors, windows, openings, slabs, roofs, stairs, rooms, spaces,
zones; the column of `building.structure`; sketches, generic solids and annotations), the identities
definition / occurrence / representation, typed properties with units and provenance, the typed commands and
their pure reducers, the topological references with the « référence à réparer » state, the quantities, the
one-way P.118 importer, the projection to the analysis input used by the other modules and the pure 3D meshes
(`projection/maillage.ts`, copied as is by the renderer). The new Atelier UI lives in
`apps/web/src/modules/atelier/nouveau/` (display state `etat-ui.ts` kept out of the model, SVG plan editor
`plan2d/`, three.js view `vue3d/` loaded on demand, panels) and talks to the model only through the command bus
`modules/atelier/bus/atelier-client.ts` (since the switch, lot 4, it is the only Atelier).
A capability sheet
(`docs/atelier/fiches/DA-XX-YY.md`) is written and in state « spécifiée » before any function of the Atelier
is coded, and no function is called « disponible » without its linked proof and the owner's acceptance.

## Coherent, reversible operations

A business command (e.g. "move this stair") can touch several objects at once — its position, its landings,
the openings hosted by the walls it crosses. The whole set must be validated and undone/redone as one action,
never as independent field edits that can be half-applied. After a command runs, dependent results (areas,
reports, plans) are either recalculated or explicitly flagged as stale, and every plan/surface/report carries
the model revision it was produced from, so two documents never silently disagree.

Display parameters — camera, current selection, visible level, Volume/Exploded mode — stay separate from the
building's physical data: panning the 3D view must never touch the model's revision number.

`packages/domain-model` also carries a small, generic, tested `CommandHistory` (do/undo/redo over an
application-defined `Command<TState>`) as the mechanical skeleton for this rule. The Atelier commands
themselves follow the transactional cycle of the DrawAll Architecture V4 §6: the client sends an intention
(contract version, commands, targets, `requestId`, `baseRevision`); the server re-reads the role, validates
units, types and preconditions, applies the same pure reducers on a consistent snapshot under the project row
lock, records the business changes, the journal entry (with its inverse) and the outbox events in one
transaction, then advances `projects.model_revision`. A repeated `requestId` returns the recorded answer and
never applies twice; a stale `baseRevision` is a detailed 409, never a silent merge; undo and redo are new
journal entries (microversions), never a rewrite of history; every validated command marks the dependent
views, documents and the Harmonie review « à recalculer ».

## Technology choices

| Layer | Choice |
| --- | --- |
| Interface | React, Vite, TypeScript |
| Routing | React Router |
| UI state | Zustand |
| Server data loading/cache | TanStack Query |
| Model changes | Reversible business commands + transactional validation |
| Architectural rendering | 3D: three.js on WebGL2 by default (DrawAll decision D2), WebGPU only behind a setting with automatic fallback, frame budget measured and published, never promised; 2D plan and technical views: SVG / Canvas 2D in TypeScript from `core-geometry` |
| Background computation | Web Workers |
| Server | Node.js, TypeScript, Express, REST API |
| Database | PostgreSQL + Drizzle |
| Geographic data | PostGIS for the spatial operations actually needed |
| Local storage | IndexedDB with Dexie |
| Attachments and exports | File storage separate from the database |
| Authentication | A maintained library, authorization enforced server-side |

PostGIS is for parcels, footprints and spatial lookups; it needs real migrations and queries matched to the
operations actually used, not a speculative schema. The building's own semantic relations (door hosted by a
wall, stair connecting two levels, shaft tied to a slab) stay in the application's relational/semantic model —
PostGIS is not asked to express those.

The prototype's extracted engine (Canvas 2D) stays in place, untouched, only until the new Atelier passes the
acceptance scenario on P.118; it is then deleted from the product (one Atelier, no « classic » mode). The
canonical geometry of building objects is parametric; solids, symbols and display meshes are derived by an
identified, versioned engine (`core-geometry` today). No B-Rep kernel (OCCT) enters the repository before the
owner's licence decision; it would serve free-form shape operations only, behind the same engine interface.
See `packages/core-geometry/README.md` for exactly which Canvas/SVG functions are kept and why.

## Code reuse: decided function by function

Reuse is not estimated in advance; it is established by inventory, one function at a time, sorted into
*keep*, *adapt* or *replace*. `packages/core-geometry` is this inventory in progress:

- `geometry.ts` — `V14Geometry`, ported faithfully and tested (**keep**, behind a stable interface).
- `parcel-geometry.ts` — the genuinely pure parcel functions found alongside `V14Bridge` (**keep**).
- `V14Bridge` — audited and found to be a `localStorage` facade, not business logic (**replaced**: the API and
  the typed Atelier model; its facade `project-repository.ts` was removed at the Atelier switch-over, lot 4).
- Column profile catalogue (`originalShapeData`, `columnShapeMeta`, `ensureColumnProps`) — not yet located in
  this pass (**pending inventory**).

The reuse percentage and the resulting development effort are established once this inventory is complete, not
assumed ahead of it.

## Sync and offline, designed from the start

Every operation recorded locally sits in a sync queue until the server confirms it. The interface distinguishes
four states, visibly, per change:

- saved locally
- syncing
- saved on the server
- conflict requiring a decision

and, for the Atelier's objects and documents, « à recalculer » (a dependent result is stale after a command)
and « publié » (frozen in a publication). The Atelier also keeps named versions (immutable snapshots of a
revision), variants (a fork of the command journal, merged by validated replay with an explicit list of
affected objects — never an automatic merge) and publications (a revision, the catalogue versions and the
documents frozen together, restorable with their dependencies). Exchanges (IFC 4.3, DXF, PDF, native package)
follow a published exchange matrix and produce a fidelity report per transfer; IFC conformity is tested on a
corpus in CI, never called « certified ».

Dexie handles the IndexedDB plumbing; the sync protocol, revision checks and conflict rules are a separate,
still-open piece of work. A change based on a stale revision can never silently overwrite a newer one. For
geometric conflicts, the application offers an explicit resolution or keeps the work in a variant rather than
discarding it.

Sharing has three roles decided by the server on every request: the owner (shares, deletes), editors (write)
and readers (read everything, comment, export, copy). The plan first targeted a single active editor per
project; the migration kept the simpler rule because the server already serialises writes per project (row
lock in every read-modify-write transaction) and arbitrates stale writes by field and by version (409): several
editors can work on the same project without losing each other's work; the "single active editor" rule is
offered as an optional, expiring reservation rather than imposed at opening (decision recorded in
`docs/migration/matrix.md`).
Offline work covers projects already available on the device; features that need a live service say so when
they are unavailable. Server reachability is tracked apart from the browser's network state: the first request
without an answer (network, 502/503/504) pauses every keyed write as if offline, a `/health` probe retries with
backoff, and the paused writes resume by themselves when the server answers; only a 401 from `/auth/me` forgets
the remembered user. Server-side backups (daily `pg_dump`, rotation), a restore procedure verified on every CI
run (`scripts/verify-restore.sh`) and an exportable project archive complete this; `docs/deploiement.md`
describes the permanent hosting (the API serves the web build; Docker image and compose file with a persistent
PostGIS volume and HTTPS).

## Business expertise as traceable functions

The Programmiste and Dessin de bâtiment skills become structured inputs, methods, calculations, rules and
checks — not prose embedded in the UI. Every check states its domain, its source, its version and its result;
missing data produces an explicit "non évalué" state rather than a guess. A regulatory requirement stays
distinct from a hypothesis or a recommendation (domain model, above).

AI assistance may explain an anomaly, propose a variant, or prepare a change — but every change it prepares
goes through the same controlled, reversible commands as a human-initiated one, and stays reversible. No
AI-initiated write bypasses the command/undo system.

### The rebuilt Atelier after lots 5–8 (DrawAll V4.1)

All of it is pure code in `packages/atelier-model` (no React, no DOM, no three.js), executed identically in the
browser (preview) and on the server (files, checks), and every write goes through the command service:

- **Derived documents (lot 5)** — views (plan per storey with a cut height, section, elevation with face-level
  visibility, site plan with the explicit cadastral → local conversion, detail) and sheets are *definitions* of the
  model; their drawings are derived. Every document carries the revision and the input fingerprint it comes from
  and is « à jour » / « périmé » in the catalogue (`apps/api/src/lib/atelier-documents.ts`); a late production stays
  attached to its own revision and never overwrites a newer one. Renderers: SVG, dependency-free vector PDF, DXF R12;
  schedules as CSV and an HTML quantities report. Bounded sketch constraints (Gauss–Newton, least displacement),
  blocks and components, simple roofs, guardrails and phases are in the same model.
- **Exchanges (lot 6)** — IFC 4.3 (`IFC4X3_ADD2`) written directly (`echanges/ifc.ts`) with `IfcMapConversion` from
  the parcel's CRS, validated in CI by IfcOpenShell on a fixed corpus (`apps/api/test-corpus/ifc/`); IFC import reads
  with web-ifc on the server and turns each product into an *imported representation* (`objet-importe`: original
  class and GlobalId, mesh, footprint; never a parametric object); 2D DXF import as a `reference-plan` frame plus
  sketches; a fidelity report for every exchange; a versioned manifest in the native package (archive v2). Matrix:
  `docs/atelier/matrice-echanges.md`.
- **Versions, variants, publication (lot 7)** — a past revision is rebuilt from the journal's exact inverses
  (`GET …/atelier/model?revision=n`); named versions are immutable snapshots, compared and restored as a new
  revision; a variant is a forked project linked to its trunk, merged by validated replay of its own journal
  (conflicts listed, never silently resolved); a publication freezes a version, the rule-catalogue versions and the
  documents, whose bytes live in content-addressed volumes (SHA-256); fine-grained locks (object or storey, 423);
  architecture collisions; view comparison between versions. Backup/restore verification covers these tables.
- **Automation and assistant (lot 8)** — scripts are declarative command templates (typed parameters, bounded
  loops, a safe arithmetic evaluator; no code is executed) expanded into ordinary commands, so they have exactly the
  user's rights and refusals; the assistant runs a controlled loop (proposal → dry run → bounded self-correction,
  at most 3 iterations → preview → explicit approval) and writes nothing before approval. Without a language-model
  provider (an owner decision), proposals come from Fadi's deterministic rules, including Harmonie's reserves.

Lots, decisions and acceptance records: `docs/atelier/lots/`, `docs/atelier/decisions.md`, `docs/atelier/recette.md`.

## Delivery lots

| Lot | Deliverable | Validation criterion |
| --- | --- | --- |
| 1. Audit et référence | Inventory of active code, dependencies, formats and initial measurements | Reference version identified, reproducible test cases |
| 2. Modèle et commandes | Versioned schema, project import, editing and undo | Data preserved, business operations coherent |
| 3. Application pilote | Modular interface, local + server save, rendering preserved | Full workflow usable on P.118 |
| 4. Continuité du travail | Sync, conflicts, rights and restore | Network-loss and concurrent-edit scenarios handled |
| 5. Mise en production | Remaining functions migrated, exports, monitoring, deployment | Functional, mobile and documentation sign-off |
| 6. Atelier DrawAll V4.1 | Lots 0–9 of `docs/atelier-cahier-des-charges.md`: capability sheets and measurements, typed model, transactional command API, new Atelier (2D, architecture objects, 3D WebGL2), switch (old engine deleted), derived documents and quantities, IFC / DXF / PDF exchanges, versions / variants / publications, scripts and controlled-loop assistant, final acceptance | Each lot accepted by the owner on its verifiable points; one Atelier in the product after the switch |

Budget and schedule are set after Lot 1, from identified tasks and verified dependencies — not guessed up
front.

The Atelier Architectural is being rebuilt on the DrawAll V4.1 contracts (typed transactional commands,
definition / occurrence / representation identities, `building.architecture` ontology, WebGL2 rendering, named
versions and variants, IFC 4.3 exchange matrix): `docs/atelier-drawall.md` is the accepted proposal (clean
rebuild in a new module, one Atelier in the product, the extracted engine deleted at the switch, P.118 imported
one way) and `docs/atelier-cahier-des-charges.md` the execution specification. The amendments to this plan listed
in the proposal's section 10 are applied by its lot 0; until then the sections above describe the repository as
it stands.

### Where this repository stands

Lot 1 is done for the active code: `docs/migration/reference.md` inventories the prototype's scripts, data
blocks and formats (verified by execution, captures in `docs/migration/captures/reference/`), and
`apps/api/scripts/extract-prototype-data.mjs` regenerates every extracted dataset from the reference HTML
(SHA-256 checked). `packages/core-geometry` keeps the rendering engine's pure geometry, with reproducible tests.

Lot 2 is in place: `apps/api` (Express + PostgreSQL/PostGIS) owns projects, the 21 steps and their Harmonie
decisions, programme cases (revisioned), parcels, the Atelier's typed model (`packages/atelier-model`:
typed, idempotent commands journalled per project in `atelier_commands`, revision per project, detailed 409 on
a stale lot, server-side undo / redo through the journal's inverses, `projects.model_revision` advancing with
each lot), step files, produced documents and comments. Project import covers the P.118 example and the
prototype's own exports (archive module, read in v1 and v2). The prototype's Atelier engine, first
encapsulated unchanged, was replaced by the rebuilt Atelier at the DrawAll V4.1 switch-over (Atelier lot 4,
`docs/atelier/lots/lot-4.md`); its key/value store was migrated into the typed model and dropped.
`packages/domain-model` carries the entity types, the frames, and the business logic as pure functions
(Harmonie rules and staleness, site zoning, programme library, model analysis, design review, Harmony engine
tables, business checks, documents) — the API executes them server-side, the client only renders.

Lot 3 is the pilot as it stands: the seven modules have real screens (Projets et sources, Parcours with the 21
real steps and tools, Programmation, Atelier — rebuilt on the typed model since the DrawAll V4.1 switch-over —, Analyses
métier, Documents, Collaboration). The conformity matrix (`docs/migration/matrix.md`) is the authoritative
record of what is ported, with what decision, which proof (domain / API tests, the Playwright scenario,
captures) and which limits remain. The e2e scenario runs the full workflow on P.118 (import, steps, Atelier
drawing with undo, parcel tool, Harmonie arbitrations and staleness, library and programme, links to the drawn
model, transfers, reports, archive, copy, analyses, documents, comments).

Lot 4 has its first slices: the Atelier's command lots go through a local IndexedDB queue (Dexie), sent in order and rebased on
reconnection and at the next opening, with the four visible states and lots in conflict kept until decided; form answers,
Harmonie decisions and comments are keyed mutations paused offline, persisted, restored after a reload and
replayed with the value or version they were based on (the server refuses a replay that would overwrite a
newer write — 409 shown, never silent); the query cache is persisted (offline reading of what was already
read), a service worker serves the app shell and the engines offline, and the project header shows the sync
state and conflicts. Sharing is in place: the owner invites existing accounts by e-mail as `lecteur` (reads
everything, comments, exports, copies) or `editeur` (also writes), can change or remove them, and a member can
leave; every route declares the access it needs (`read` / `comment` / `write` / `owner`) and the server re-reads
the role on each request (404 without access, 403 with the reason otherwise) — the client only hides what would
be refused (read-only forms, Atelier in read-only mode, "Projets partagés avec vous"). Members work on the same
project: every read-modify-write transaction first locks the project row (`FOR UPDATE`), so simultaneous
writes are serialised instead of overwriting each other, then the per-field / per-version checks (409) apply.
Conflicts are resolved explicitly: every 409 keeps what was attempted next to the server's state (field values,
decision and version, the Atelier lot refused) and offers to keep the server's version or to re-apply one's own on the
current state — never an automatic merge. The service-worker cache is versioned per build and purged on
activation, and the Playwright scenario runs in CI. The "single active editor" rule is an optional, expiring
reservation (30 min, renewed while the holder keeps the project open, releasable by the owner): other accounts
read and comment while it lasts, their writes are refused with the reason and the deadline (423). Ownership can be transferred to a member (the former owner stays as editor). Notifications exist in the
application (access received, comments by others, editing reservations — read from dated data, with an
unread count per account); e-mail remains an external service, absent.
The app loads in pieces (shell, project, Atelier engine, library) and the service worker precaches every piece
at install so offline opening does not depend on what was visited online. Around the modules, the navigation's
Harmonie page shows the state of each project's choices (read from the steps already served) and the settings
page what is really configurable (account, MapTiler key, data kept by the browser, build version); the
protected P.118 reference behaves as in the prototype in the Atelier (the first committed modification goes
to an automatic working copy through the engine's own `P118Resolved` seam). MapTiler (satellite background,
altimetry) is called from the browser with the user's key, on request, and simulated in CI. The Playwright
scenario also runs axe-core on every screen at desktop and phone widths (no critical or serious violation).
Items still open are listed under « Limites restantes » in the matrix (regulatory checks beyond the
prototype's rules, e-mail notifications, deployment hardening) and, for the Atelier, in `docs/atelier/recette.md`.

## Acceptance target: "Parcours App — Pilote P.118"

The first real deliverable, per the brief: open P.118, find the 21 steps, modify an architectural element,
undo then redo that change, save it, retrieve it on a second device, and produce a plan with surfaces that
match the same revision. Reaching this, observably, is the gate before continuing the full migration — not an
estimate, a demonstrated run. The Playwright scenario replays it on every CI run: the P.118 example imported
(21 steps), a wall drawn in the Atelier (into the automatic working copy), undone and redone with each state
persisted (revisions 2, 3, 4), the model re-read from a second browser context at the same key revision, and
the reading plan (SVG) and the surfaces table produced from the current revision in the Documents module.
The acceptance block of the scenario then exercises the working copy further: every level × view mode (volume,
exploded, plan = 2D, section) and every technical drawing rendered without an empty view or a JavaScript
error, the mezzanine edited in plan and re-read in volume and exploded views, a wall height changed through
the properties panel, push/pull activated, undo and redo persisted, the copy reopened from a third browser
context at the same revision, and DXF / SVG / CSV / PNG exports registered in the documents catalogue at that
revision together with the surfaces table.

Acceptance also measures reliability, not only speed: preservation of identifiers, coordinates, levels,
object relations and attachments; undo, restore, sync conflicts, and agreement between produced documents.
Performance is measured on the same project, on a reference computer and an Android phone, covering opening,
selection, moving an element, 3D navigation and saving — acceptance thresholds are set after the first
measurements, not assumed.

First indicative measurements (the scenario prints them as `⏱` lines; headless Chromium, the development
sandbox, API and PostgreSQL on the same machine — the GitHub runner is faster): import of the P.118 example
to the overview ≈ 2.3 s; opening step 02 (form and Harmonie panel) ≈ 0.7 s; opening the Atelier (engine,
P.118 model, geometry drawn) ≈ 3.2 s; undoing a wall until the server confirms the write (350 ms
debounce included) ≈ 1.6 s; reloading the Atelier page ≈ 3.2 s. The measurements on a reference computer
and an Android phone, with selection, moving an element and 3D navigation, remain to be taken on real
devices before any threshold is set.

## Known geometry limits (packages/core-geometry)

Unknown levels resolve to elevation zero; dimensions lack runtime validation; out-of-wall windows can produce
inverted surfaces; column extrusion needs an injected resolver (profile catalogue not yet located); cuts are
axis-aligned. Canvas rendering uses approximate depth sorting and mutates the face array. No slabs, arbitrary
section planes or structural calculation are implemented. `inwardOffset` (parcel setback) has no
self-intersection guard: a setback beyond half the polygon's width flips the polygon instead of failing —
documented and tested, not fixed, because the source has the same behaviour.

The authoritative HTML is not part of this repository. Do not invent its titles or claim feature parity.
Confirm current structural load requirements from source data rather than assuming older values.
