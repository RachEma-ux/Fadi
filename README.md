# Fadi · Parcours

Fadi is the web application that replaces the Parcours V8.19 prototype (a single 18 MB HTML file) for the
project workflow (21 steps), the architectural workshop (Atelier) and the modules around them. The user-facing
application is in French; this file and `docs/architecture.md` are the developer entry points.

## Status

The migration is a working modular monolith with the seven modules of the brief, each with real screens and
server-owned data:

- **Parcours** — the 21 real steps (01–21, original phases, labels and mobile cards), their business forms
  (17 steps) with the finance / score KPIs and the GO decision, the Harmonie panel inside every step
  (computed proposals, arbitrations with history and versions, staleness « à réexaminer », upstream /
  downstream effects, reports), the step sources and comments.
- **Projets et sources** — projects, the P.118 example (reference presentation and editable copies), the
  Parcelle tool (the prototype's document, served by Fadi with per-file revisions and transmission to the
  model), MapTiler background and altimetry on request with the user's key, files per step, the base documents
  of the example, archive export / import (Fadi, prototype V6/V7 exports, V5 databases).
- **Programmation** — repartition by building type, the building library (10 types, 21 cases, 3 variants,
  HTML report, CSV / JSON / SVG exports), applied cases with revisions, links to the drawn model, hypotheses,
  surface transfers at constant total.
- **Atelier architectural** — the prototype's native engine, extracted unchanged and encapsulated (3D, plans,
  sections, levels, drawing tools, undo / redo), persisted per key with revisions and a derived projection;
  the building review (flow-v62: analysis, audit, plans, report, directional references, declared site
  observation).
- **Analyses métier** — derived quantities, traceable checks (prototype rules only), declared structure and
  circulations, programme variants.
- **Documents** — catalogue of producible documents with production records and freshness (« à jour /
  périmé »).
- **Collaboration** — comments with threaded replies, revision journal read from dated data, sharing
  (owner / editor / reader roles enforced by the server on every request, optional expiring editing
  reservation, ownership transfer), offline work (local queues replayed on reconnection, persisted query
  cache, service worker, per-field / per-version concurrency control with side-by-side conflict resolution).

`docs/migration/matrix.md` is the authoritative conformity matrix: every prototype function, its migration
decision (Conserver / Extraire / Adapter / Remplacer), its location in Fadi, its proof and the remaining
limits. `docs/migration/etapes/NN.md` are the per-step sheets (generated), `docs/migration/reference.md` the
verified inventory of the prototype, `docs/migration/captures/` the screenshots (reference vs. webapp).

## Start

Node.js 22.12 or newer, npm, PostgreSQL 16+ with PostGIS (one-time database setup in `apps/api/README.md`).

```sh
npm ci
cp apps/api/.env.example apps/api/.env   # adjust DATABASE_URL to your local Postgres role / password
npm run db:migrate                        # idempotent (apps/api/src/db/init.sql)
npm run typecheck
npm test
npm run build

npm run dev:api      # terminal 1 — API on :3001
npm run dev          # terminal 2 — web app on :5173, proxies /auth, /projects, /examples, /library to the API
```

End-to-end scenario (Playwright, Chromium), against the built API and `vite preview` on :4173:

```sh
node apps/api/dist/server.js &                       # DATABASE_URL, WEB_ORIGIN=http://localhost:4173, PORT=3001
npm run preview --workspace=@fadi/web -- --port 4173 &
node apps/web/e2e/parcours-scenario.mjs              # ~190 checks; writes docs/migration/captures/webapp/
```

Never put credentials in source files — `apps/api/.env` is gitignored; only `.env.example` /
`.env.test.example` (placeholder values) are committed. The reference HTML itself is not committed either
(its SHA-256 is recorded in `docs/migration/reference.md`); `apps/api/scripts/extract-prototype-data.mjs <html>`
regenerates every extracted dataset from it.

## Structure

- `apps/web` — React 19, Vite, React Router, TanStack Query (persisted), Dexie (IndexedDB queues), a service
  worker. `src/modules/<module>/` holds one folder per module with a `README.md` stating its responsibility and
  current status; `src/lib/` the API client, access rules, mutations and offline plumbing; `e2e/` the
  Playwright scenario; `public/atelier-native/` and `public/parcelle/` the prototype's engine and tool,
  extracted by script (SHA-256 checked).
- `apps/api` — Express 5 + TypeScript strict, PostgreSQL / PostGIS via Drizzle, bundled by esbuild. Routes per
  module, server-side authorization on every request (roles, reservation), transactions serialised per project,
  documents generated on demand. `src/data/` holds the datasets extracted from the prototype (steps, forms,
  library, Harmonie profiles, Harmony engine tables, the P.118 example and its base documents).
- `packages/domain-model` — the versioned domain model and the business logic as pure functions (Harmonie
  rules and staleness, site zoning and proposals, programme library, model analysis, design review, Harmony
  engine, business checks, documents, archive formats, reversible command history). Hypotheses, requirements
  and recommendations are distinct types; coordinates carry their frame.
- `packages/core-geometry` — the supplied geometry extraction (preserved, tested) plus the site zoning geometry.
- `docs` — `architecture.md` (the plan and where the repository stands), `migration/` (matrix, step sheets,
  reference inventory, captures).
- `.github/workflows/ci.yml` — typecheck, migrations, 184 tests across the workspaces, production build, and
  the full Playwright scenario against a PostGIS service (captures published as an artifact).

Checks that cannot run here are stated rather than assumed: the MapTiler service is simulated in the scenario
(no real call from CI), e-mail notifications do not exist (no mail service), and regulatory checks beyond the
prototype's own rules are not invented.
