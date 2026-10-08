# Fadi · Parcours

Fadi is the web application that replaces the Parcours V8.19 prototype (a single 18 MB HTML file) for the
project workflow (21 steps), the architectural workshop (Atelier) and the modules around them. The user-facing
application is bilingual French / English (French is the source language; English is chosen per device in the top
bar, the sign-in pages or Settings, see "Languages" below); this file and `docs/architecture.md` are the developer entry
points.

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
  reservation, ownership transfer), in-app notifications (access received, comments, reservations), offline work (local queues replayed on reconnection, persisted query
  cache, service worker, per-field / per-version concurrency control with side-by-side conflict resolution).

Around the modules: a home page (after the supplied mockup: sidebar with icons, « Reprendre mon projet » with a
conceptual preview computed from the real model — an exploded axonometric of the drawn levels, never a rendering —,
« Mon parcours » with the six phases and their steps, « À poursuivre », illustrated quick access), the Harmonie page (state of the choices per project, read from the steps
already served, with links to the step where each decision is taken), a settings page (account, MapTiler key,
data kept by the browser, build version), and an accessibility pass (axe-core, WCAG 2.2 AA) run by the
end-to-end scenario on every screen at desktop and phone widths — no critical or serious violation.

`docs/migration/matrix.md` is the authoritative conformity matrix: every prototype function, its migration
decision (Conserver / Extraire / Adapter / Remplacer), its location in Fadi, its proof and the remaining
limits. `docs/migration/etapes/NN.md` are the per-step sheets (generated), `docs/migration/reference.md` the
verified inventory of the prototype, `docs/migration/captures/` the screenshots (reference vs. webapp).

## Languages

The interface is written in French in the code and displayed in French (default) or English (D-163). The choice is a
per-device preference (`localStorage` key `fadi.langue`), offered in the top bar, on the sign-in and sign-up pages, in
Settings and in the Atelier Canvas bottom bar; changing it reloads the page.

- `apps/web/src/lib/i18n/` — `index.ts` (language, locale for numbers and dates), `traduire.ts` (pure translator: exact
  strings, `{0}` templates taken from the code, composed texts translated piece by piece, guard against rewriting data),
  `dom.ts` (display adapter: text nodes and readable attributes translated as React renders them; `translate="no"`
  blocks are never touched), `demarrer.ts` (loads `en.json` on demand before the first render; browser dialogs too),
  `en.json` (French → English dictionary, about 6,600 entries).
- What is not translated: project data (names, entries, comments), the worked examples and the building library
  content, produced documents (PDF, DXF, SVG, IFC, HTML reports), the prototype Plot tool, server logs.
- Adding a text: write it in French, add its English to `en.json`, run `apps/web/e2e/interface-anglais.mjs`, which lists
  any interface text still in French (`residus-anglais.txt`) and fails above 2 %.

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
npm run dev          # terminal 2 — web app on :5173, proxies /auth, /projects, /examples, /library, /notifications to the API
```

End-to-end scenario (Playwright, Chromium), against the built API serving the built web app itself (production mode —
`WEB_DIST`; `vite preview` is no longer needed):

```sh
WEB_DIST=apps/web/dist node apps/api/dist/server.js &   # DATABASE_URL, WEB_ORIGIN=http://localhost:3001, PORT=3001
BASE_URL=http://localhost:3001 node apps/web/e2e/parcours-scenario.mjs   # ~330 checks incl. axe-core and the P.118 Atelier acceptance; writes docs/migration/captures/webapp/
BASE_URL=http://localhost:3001 node apps/web/e2e/atelier-nouveau.mjs     # Atelier (plan, 3D, sync, exports)
BASE_URL=http://localhost:3001 node apps/web/e2e/atelier-documents.mjs   # derived documents (views, sheets, PDF, schedules)
BASE_URL=http://localhost:3001 node apps/web/e2e/atelier-echanges.mjs    # IFC 4.3 export / import, DXF import, exchange reports
BASE_URL=http://localhost:3001 node apps/web/e2e/atelier-versions.mjs    # named versions, variants and merge, publications, fine locks
BASE_URL=http://localhost:3001 node apps/web/e2e/atelier-automatisation.mjs # scripts and the controlled-loop assistant
BASE_URL=http://localhost:3001 node apps/web/e2e/atelier-complements.mjs    # object history, past states, model reuse, external references
```

IFC corpus (lot 6), validated with IfcOpenShell (`pip install ifcopenshell==0.9.0 pytest`), as in CI:

```sh
npx --workspace=@fadi/api tsx test-corpus/ifc/generer.ts ../../ifc-sortie
for f in petit p118 p118-reimporte; do python3 apps/api/test-corpus/ifc/valider.py ifc-sortie/$f.ifc ifc-sortie/$f.attendus.json; done
```

Permanent hosting (stable URL, persistent PostGIS database, daily backups, verified restore procedure, HTTPS):
`docs/deploiement.md` — `Dockerfile`, `docker-compose.yml`, `scripts/backup.sh`, `scripts/restore.sh`,
`scripts/verify-restore.sh` (also run by CI on the scenario's database). What the repository cannot contain is a
machine or hosting account and a domain name.

Atelier rebuild (DrawAll V4.1): `docs/atelier-drawall.md` is the accepted proposal (clean rebuild, one Atelier, P.118
imported one way), `docs/atelier-cahier-des-charges.md` the execution specification for Claude Code (rules, contracts,
lots, acceptance, team organisation), `docs/drawall/` the DrawAll V4.1 reference documents and `docs/atelier/` the
follow-up folder (capability sheets, decisions, measurements, lot reports). `CLAUDE.md` is the entry point for Claude Code. P1 lots (Atelier 0–9, Planche 1–7) were accepted on 8 October 2026 (D-174); `docs/atelier-cahier-p2.md` is the
P2 specification (structure, mechanical, timber, sheet metal, MEP, surfaces, coordination), validated on 8 October 2026 (D-176);
lot P2-0 (framing, sheets, OCCT / solver / mixed-scene benches, reduced P1 gate) is delivered and accepted, lot P2-1 (exact kernel: `packages/geometry-exact` on occt-wasm, `solide-exact` class, server-side recomputation, STEP export / import) and lot P2-2 (mechanical ontology activated per project: parts, assemblies, joints solved by the assembly solver, numbering, bill of materials, exploded views, families and rules; P1 → P2 gate played on P.118-M, D-184) are delivered; P2 continues under delegated decisions (D-183).

Temporary public instance (`.github/workflows/builder-deploy.yml`, "Builder Deploy"): launched by hand from
GitHub → Actions → Builder Deploy → *Run workflow* (pick the branch and the duration, 5–30 min). The run builds
**the branch as it is at launch time**, migrates a fresh PostGIS service (data is truncated at each run), starts
the API (which serves the web build), and publishes a Cloudflare quick-tunnel URL (`*.trycloudflare.com`) as a job
annotation ("Fadi en ligne") and in the logs, once the new hostname resolves on public resolvers and the app answers
through the tunnel (up to 150 s; the chosen duration starts then). A phone that opens the URL within the first minute
may still see "DNS_PROBE_FINISHED_NXDOMAIN" (negative DNS cache): wait a minute and reload, or switch between Wi-Fi and
mobile data. A running instance never picks up later commits — relaunch the workflow after pushing to see the current
build.

Never put credentials in source files — `apps/api/.env` is gitignored; only `.env.example` /
`.env.test.example` (placeholder values) are committed. The reference HTML itself is not committed either
(its SHA-256 is recorded in `docs/migration/reference.md`); `apps/api/scripts/extract-prototype-data.mjs <html>`
regenerates every extracted dataset from it.

## Structure

- `apps/web` — React 19, Vite, React Router, TanStack Query (persisted), Dexie (IndexedDB queues), a service
  worker. `src/modules/<module>/` holds one folder per module with a `README.md` stating its responsibility and
  current status; `src/lib/` the API client, access rules, mutations and offline plumbing; `e2e/` the
  Playwright scenarios (`parcours-scenario.mjs`, `atelier-nouveau.mjs`); `public/parcelle/` the prototype's
  parcel tool, extracted by script (SHA-256 checked). The Atelier (`src/modules/atelier/nouveau/`) is the
  rebuilt one (typed model, command bus, SVG plan, three.js view loaded on demand).
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
- `.github/workflows/ci.yml` — typecheck, migrations, ~200 tests across the workspaces, production build, the full
  Playwright scenario against a PostGIS service in production serving mode (captures published as an artifact), the
  backup → restore verification on the scenario's database, and the Docker image built and probed.

Checks that cannot run here are stated rather than assumed: the MapTiler service is simulated in the scenario
(no real call from CI), notifications exist in the application only (no mail service), and regulatory checks beyond the
prototype's own rules are not invented.
