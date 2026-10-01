# Fadi · Parcours

Fadi is the web application for the Parcours project workflow and architectural workshop.

## Status

A working full-stack slice, not a complete migration of the brief's 5 delivery lots. What is real today:
registration/login, project creation, server-side ownership checks, and one functional module (Atelier) where
walls are created, persisted to PostgreSQL/PostGIS, listed, deleted, and undo/redo-able. The French interface
still shows the 21-step Parcours grid as placeholders (their real business content is Lot 3, not migrated), and
5 of the 7 modules (Projets et sources, Programmation, Analyses, Documents, Collaboration) are status screens
only — see `apps/web/src/modules/*/README.md` and `docs/architecture.md` for exactly what each one is missing.

## Start

Use Node.js 22.12 or newer, npm, and PostgreSQL 16+ with the PostGIS extension (see `apps/api/README.md` for
one-time local database setup).

```sh
npm ci
cp apps/api/.env.example apps/api/.env   # adjust DATABASE_URL to your local Postgres role/password
npm run db:migrate
npm run typecheck
npm test
npm run build

npm run dev:api     # terminal 1 — API on :3001
npm run dev          # terminal 2 — web app on :5173, proxies /auth,/projects to the API
```

The development URL is printed by Vite. Never put credentials in source files — `apps/api/.env` is gitignored;
only `.env.example`/`.env.test.example` (placeholder values) are committed.

## Structure

- `apps/web`: React, Vite, React Router and TanStack Query frontend. `apps/web/src/modules/` scaffolds the 7
  modules of the target architecture (see `docs/architecture.md`); each has a `README.md` stating its
  responsibility and honest current status. `modules/atelier/AtelierPanel.tsx` is the one module wired end to
  end (API + `@parcours/domain-model`'s `CommandHistory` + `@parcours/core-geometry`'s `wallPolygon`); the
  Parcours 21-step grid is still placeholder content, and the remaining modules are status screens.
- `apps/api`: Express 5 + TypeScript REST API — registration/login/sessions, and project/level/architectural-object
  CRUD with per-resource server-side authorization. See `apps/api/README.md` for the security model and setup.
- `packages/core-geometry`: supplied Parcours geometry extraction (`geometry.ts`, `parcel-geometry.ts`) and its
  41 tests, preserved unchanged, plus the `ProjectRepository` contract (`project-repository.ts`) documenting what
  `V14Bridge` actually does instead of porting it.
- `packages/domain-model`: the versioned project domain model from the authoritative brief — typed entities
  (`entities.ts`: Objet architectural, Donnée source, Exigence, Hypothèse, Recommandation, Résultat calculé,
  Décision, Document produit, Contrôle métier, and the three distinct coordinate frames with runtime guards) plus
  a generic reversible `CommandHistory` (`command-history.ts`, do/undo/redo), now actually used by the Atelier
  module above.
- `docs`: architecture and migration scope, grounded in the product brief, with an honest per-lot status table.
- `.github/workflows/ci.yml`: type checking, a Postgres+PostGIS service, all tests, and the production build.

A root lockfile pins dependencies. `npm audit` is clean on production dependencies; one moderate advisory remains
in a dev-only test-runner dependency (see `apps/api/README.md`, "Limites connues"). CI repeats typecheck, DB
migration, tests (72 across 4 workspaces) and build with `npm ci` on every push.
