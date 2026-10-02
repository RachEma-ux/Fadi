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

## Coherent, reversible operations

A business command (e.g. "move this stair") can touch several objects at once — its position, its landings,
the openings hosted by the walls it crosses. The whole set must be validated and undone/redone as one action,
never as independent field edits that can be half-applied. After a command runs, dependent results (areas,
reports, plans) are either recalculated or explicitly flagged as stale, and every plan/surface/report carries
the model revision it was produced from, so two documents never silently disagree.

Display parameters — camera, current selection, visible level, Volume/Exploded mode — stay separate from the
building's physical data: panning the 3D view must never touch the model's revision number.

`packages/domain-model` also carries a small, generic, tested `CommandHistory` (do/undo/redo over an
application-defined `Command<TState>`) as the mechanical skeleton for this rule. It does not yet know about
walls or stairs — wiring real Atelier commands (move a stair + its openings as one unit) is Atelier module
work, not domain-model work, and is still open.

## Technology choices

| Layer | Choice |
| --- | --- |
| Interface | React, Vite, TypeScript |
| Routing | React Router |
| UI state | Zustand |
| Server data loading/cache | TanStack Query |
| Model changes | Reversible business commands + transactional validation |
| Architectural rendering | Keep the existing Canvas/SVG engines initially |
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

Three.js is a possible evolution of the rendering layer, decided later from real measurements (fluidity, model
size, the specific 3D features actually needed) — not a prerequisite for turning the prototype into an
application. See `packages/core-geometry/README.md` for exactly which Canvas/SVG functions are kept as-is and
why.

## Code reuse: decided function by function

Reuse is not estimated in advance; it is established by inventory, one function at a time, sorted into
*keep*, *adapt* or *replace*. `packages/core-geometry` is this inventory in progress:

- `geometry.ts` — `V14Geometry`, ported faithfully and tested (**keep**, behind a stable interface).
- `parcel-geometry.ts` — the genuinely pure parcel functions found alongside `V14Bridge` (**keep**).
- `project-repository.ts` — `V14Bridge` audited and found to be a `localStorage` facade, not business logic
  (**replace**, by a real backend implementing the documented `ProjectRepository` contract).
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
they are unavailable. Server-side backups, restore drills and an exportable project archive complete this.

## Business expertise as traceable functions

The Programmiste and Dessin de bâtiment skills become structured inputs, methods, calculations, rules and
checks — not prose embedded in the UI. Every check states its domain, its source, its version and its result;
missing data produces an explicit "non évalué" state rather than a guess. A regulatory requirement stays
distinct from a hypothesis or a recommendation (domain model, above).

AI assistance may explain an anomaly, propose a variant, or prepare a change — but every change it prepares
goes through the same controlled, reversible commands as a human-initiated one, and stays reversible. No
AI-initiated write bypasses the command/undo system.

## Delivery lots

| Lot | Deliverable | Validation criterion |
| --- | --- | --- |
| 1. Audit et référence | Inventory of active code, dependencies, formats and initial measurements | Reference version identified, reproducible test cases |
| 2. Modèle et commandes | Versioned schema, project import, editing and undo | Data preserved, business operations coherent |
| 3. Application pilote | Modular interface, local + server save, rendering preserved | Full workflow usable on P.118 |
| 4. Continuité du travail | Sync, conflicts, rights and restore | Network-loss and concurrent-edit scenarios handled |
| 5. Mise en production | Remaining functions migrated, exports, monitoring, deployment | Functional, mobile and documentation sign-off |

Budget and schedule are set after Lot 1, from identified tasks and verified dependencies — not guessed up
front.

### Where this repository stands

Lot 1 is done for the active code: `docs/migration/reference.md` inventories the prototype's scripts, data
blocks and formats (verified by execution, captures in `docs/migration/captures/reference/`), and
`apps/api/scripts/extract-prototype-data.mjs` regenerates every extracted dataset from the reference HTML
(SHA-256 checked). `packages/core-geometry` keeps the rendering engine's pure geometry, with reproducible tests.

Lot 2 is in place: `apps/api` (Express + PostgreSQL/PostGIS) owns projects, the 21 steps and their Harmonie
decisions, programme cases (revisioned), parcels, the Atelier's native store (revision per key, 409 on a stale
write, derived `levels` / `architectural_objects` projection, `projects.model_revision` advancing with each
write), step files, produced documents and comments. Project import covers the P.118 example and the
prototype's own exports (archive module); undo/redo runs inside the native Atelier engine and is persisted.
`packages/domain-model` carries the entity types, the frames, and the business logic as pure functions
(Harmonie rules and staleness, site zoning, programme library, model analysis, design review, Harmony engine
tables, business checks, documents) — the API executes them server-side, the client only renders.

Lot 3 is the pilot as it stands: the seven modules have real screens (Projets et sources, Parcours with the 21
real steps and tools, Programmation, Atelier — the prototype's engine, encapsulated unchanged —, Analyses
métier, Documents, Collaboration). The conformity matrix (`docs/migration/matrix.md`) is the authoritative
record of what is ported, with what decision, which proof (domain / API tests, the Playwright scenario,
captures) and which limits remain. The e2e scenario runs the full workflow on P.118 (import, steps, Atelier
drawing with undo, parcel tool, Harmonie arbitrations and staleness, library and programme, links to the drawn
model, transfers, reports, archive, copy, analyses, documents, comments).

Lot 4 has its first slices: the Atelier's writes go through a local IndexedDB queue (Dexie) replayed on
reconnection and on the next opening, with the four visible states and a conflict backup; form answers,
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
decision and version, model backup key) and offers to keep the server's version or to re-apply one's own on the
current state — never an automatic merge. The service-worker cache is versioned per build and purged on
activation, and the Playwright scenario runs in CI. The "single active editor" rule is an optional, expiring
reservation (30 min, renewed while the holder keeps the project open, releasable by the owner): other accounts
read and comment while it lasts, their writes are refused with the reason and the deadline (423). Still open:
ownership transfer, invitation notifications.
Lot 5 items still open are listed under « Limites restantes » in the matrix (regulatory checks, MapTiler /
altimetry, lazy loading of the Atelier engine, deployment hardening).

## Acceptance target: "Parcours App — Pilote P.118"

The first real deliverable, per the brief: open P.118, find the 21 steps, modify an architectural element,
undo then redo that change, save it, retrieve it on a second device, and produce a plan with surfaces that
match the same revision. Reaching this, observably, is the gate before continuing the full migration — not an
estimate, a demonstrated run.

Acceptance also measures reliability, not only speed: preservation of identifiers, coordinates, levels,
object relations and attachments; undo, restore, sync conflicts, and agreement between produced documents.
Performance is measured on the same project, on a reference computer and an Android phone, covering opening,
selection, moving an element, 3D navigation and saving — acceptance thresholds are set after the first
measurements, not assumed.

## Known geometry limits (packages/core-geometry)

Unknown levels resolve to elevation zero; dimensions lack runtime validation; out-of-wall windows can produce
inverted surfaces; column extrusion needs an injected resolver (profile catalogue not yet located); cuts are
axis-aligned. Canvas rendering uses approximate depth sorting and mutates the face array. No slabs, arbitrary
section planes or structural calculation are implemented. `inwardOffset` (parcel setback) has no
self-intersection guard: a setback beyond half the polygon's width flips the polygon instead of failing —
documented and tested, not fixed, because the source has the same behaviour.

The authoritative HTML is not part of this repository. Do not invent its titles or claim feature parity.
Confirm current structural load requirements from source data rather than assuming older values.
