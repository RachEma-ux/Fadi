# Fadi · Parcours

Fadi is the web application for the Parcours project workflow and architectural workshop.

## Status

Initial development foundation, not a complete migration. The French interface contains 21 explicitly unfinished step placeholders and a live wall geometry demonstration. No project persistence, authentication, server or deployment is configured.

## Start

Use Node.js 22.12 or newer and npm.

```sh
npm install
npm run dev
npm run typecheck
npm test
npm run build
```

The development URL is printed by Vite. Never put credentials in source files.

## Structure

- `apps/web`: React, Vite and TypeScript frontend.
- `packages/core-geometry`: supplied Parcours geometry extraction and its 19 tests, preserved unchanged.
- `docs`: architecture and migration scope.
- `.github/workflows/ci.yml`: type checking, geometry tests and frontend build.

The geometry package exports TypeScript source for consumption through the frontend bundler; it is not a published standalone Node package. Dependency installation and the full build must be verified in CI. A root lockfile is not yet generated; once installation succeeds, commit it and change CI to `npm ci`.
