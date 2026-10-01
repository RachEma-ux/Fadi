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

- `apps/web`: React, Vite and TypeScript frontend. `apps/web/src/modules/` scaffolds the 7 modules of the target architecture (see `docs/architecture.md`); each has a `README.md` stating its responsibility and honest current status. The live UI still lives in `main.tsx` as a placeholder — moving it into these modules is Lot 3 work, not yet done.
- `packages/core-geometry`: supplied Parcours geometry extraction (`geometry.ts`, `parcel-geometry.ts`) and its 41 tests, preserved unchanged, plus the `ProjectRepository` contract (`project-repository.ts`) documenting what `V14Bridge` actually does instead of porting it.
- `packages/domain-model`: the versioned project domain model from the authoritative brief — typed entities (`entities.ts`: Objet architectural, Donnée source, Exigence, Hypothèse, Recommandation, Résultat calculé, Décision, Document produit, Contrôle métier, and the three distinct coordinate frames with runtime guards) plus a generic reversible `CommandHistory` (`command-history.ts`, do/undo/redo). No business rules are wired yet — that is module work.
- `docs`: architecture and migration scope, now explicitly grounded in the product brief.
- `.github/workflows/ci.yml`: type checking, tests and frontend build.

The geometry and domain-model packages export TypeScript source for consumption through the frontend bundler; neither is a published standalone Node package. A root lockfile pins dependencies. Initialization checks passed: TypeScript checks, all tests (core-geometry + domain-model), and the production build. CI repeats these checks with `npm ci`.
