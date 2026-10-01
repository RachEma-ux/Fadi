# Fadi · Parcours

Fadi is the web application for the Parcours project workflow and architectural workshop.

## Status

Initial development foundation, not a complete migration. The French interface contains 21 explicitly unfinished step placeholders and a live wall geometry demonstration. No project persistence, authentication, server or deployment is configured.

## Start

Use Node.js 22.12 or newer and npm.

```sh
npm ci
npm run dev
npm run typecheck
npm test
npm run build
```

The development URL is printed by Vite. Never put credentials in source files.

## Structure

- `apps/web`: React, Vite and TypeScript frontend.
- `packages/core-geometry`: supplied Parcours geometry extraction (`geometry.ts`, `parcel-geometry.ts`) and its 41 tests, preserved unchanged, plus the `ProjectRepository` contract (`project-repository.ts`) documenting what `V14Bridge` actually does instead of porting it.
- `docs`: architecture and migration scope.
- `.github/workflows/ci.yml`: type checking, geometry tests and frontend build.

The geometry package exports TypeScript source for consumption through the frontend bundler; it is not a published standalone Node package. A root lockfile pins dependencies. Initialization checks passed: TypeScript checks, all 41 geometry tests, and the production build. CI repeats these checks with `npm ci`.
