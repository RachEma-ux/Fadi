# Fadi branch consolidation — 20 October 2026

User authorization: merge every Fadi branch into `main`, then delete the branches. Original main: `e3a3d14867ff09a08e3c643797a8b286eeb0497b`.

## Checkpoint and recovery

The consolidation commit includes every branch tip below as a parent (or ancestor). Its first parent is the original main. Branch deletion removes names only: all original commit histories and file versions remain reachable from main after a merge commit. Do not squash or rebase this PR: that would discard the recorded ancestry needed for cleanup verification.

| Original branch | Tip before consolidation |
| --- | --- |
| `ccr-119809c5-an2z9a` | `116ded5bb782568f9dff1048ff41b5aba24eab95` |
| `ccr-2f8810e5-239xsq` | `91403ad8d0b0b37cd5ba9fa1d5fa706ccede6167` |
| `chore/149-production-pr148-controlee` | `9ae63edba6621dcced5d7f54727463a898bd1007` |
| `ci/layout-142-diagnostic` | `8915cdbae1eecfde8c0bbbb0f7accfa0349b3244` |
| `ci/layout-142-regression` | `7e0d24bdc14aef569deb2d9577d9de8ebd4ffff9` |
| `docs/153-chatgpt-codex-handoff` | `76e43d19645dc8a8ffd91282177e6a31d123f73a` |
| `docs/156-m004-checkpoint-sans-db` | `496dcfc7bf80868ef21216d667187087db32a738` |
| `docs/156-qualifier-203-taches-studio` | `6b6139007c532d06a54ca99578967c7a451c321b` |
| `fadifront-static-deploy` | `875b53bb536aa4c404eb7af6434aa1871f43afc8` |
| `feat/167-studio-daily-checklist` | `4ab4fcd70d93a1a935b17189f1b9975ec4909474` |
| `feat/173-studio-cad1` | `e4a212625578df28836e3e8154918cbe06710b99` |
| `feat/173-studio-etudes` | `c8386bca262b878021fb0050582765aa0fb456a2` |
| `feat/173-studio-lot-i` | `04c4cd1281ce0ef912c313fb1f8c6a93ee30f39a` |
| `feat/173-studio-revisions` | `2f65ddacea5cdf05448cbac9684d2bc1184187aa` |
| `feat/173-studio-variantes` | `fb9d7c790b2e232d284781d47f994ba839f122c5` |
| `feat/fadifront-infomaniak` | `34e70e63b56c10c724590cd36f13c0317552acb4` |
| `fix/181-e2e-navigation-studio` | `0eb25a152c3662f563b17b4413a046014c09f263` |
| `ops/preprod-fadimmo` | `6d20ce03c14fe674209a2091968ba4519e9fae70` |

## Conflict resolutions

- Builder Deploy (#203): retain the current workflow outside overlapping hunks; use the PR's separated guarded test steps, remove redundant database truncation, retain readiness-checked tunnel publication and the 75-minute timeout. No deployment was launched.
- Studio reports: restore the registry counter scripts and relative README links; preserve the newer 19 October navigation ADR instead of the older assertion that no Studio UI exists. Preserve the proposed, unaccepted status of that ADR.
- Studio qualification: conflict was a trailing blank line only; retain current text.
- Studio lot I / studies / variants / revisions / CAD1: preserve branch histories, while retaining the current single Studio schema, API and UI. These branches remove the newer implementation and introduce incompatible `studio_etudes` / `studio_variantes` tables and a different revision model. The current `studioStudies` / `studioVariants` / `studioRevisions`, routes, immutable history, tool registry and drawing engine are retained. Evidence: `apps/api/src/db/schema.ts`, `apps/api/src/routes/studio.ts`, `apps/web/src/modules/studio/StudioShell.tsx`, `packages/atelier-model/src/studio/registre/{dessin,modification}.ts`, and `apps/web/src/modules/studio/planche2d/outils/trace.ts`. Rectangle and Move already exist in the current command registry; obsolete parallel implementations are not reactivated.
- Navigation regression: retain the newer selector that includes the collapsible Studio sidebar and checks `Accueil|Projets|Studio|Collaboration`.
- Generated `fadifront-static-deploy`: retain its unrelated commit history, not compiled assets in the main source tree. Integrate its reproducible sources from `feat/fadifront-infomaniak`; AGENTS.md forbids committing generated build outputs.
- FadiFront integration repairs: read canonical reference JSON through a Vite build adapter instead of forbidden browser imports into API source; use a standalone static build configuration because this read-only edition has no Studio engines. The application build and its chunk guards remain unchanged. Manual artifact publication replaces deployment-branch recreation.
- Other branch files merged normally: diagnostic workflows, handoff, daily checklist, preproduction tooling and production verification script. None of these operational scripts were deployed or used against production.

## Verification

- Local typecheck and module-boundary validation: passed.
- Application build (web and API): passed.
- Static FadiFront build: passed after integration repairs.
- Database guard: 173 tests passed; no database target configured.
- Checklist/dashboard: 10 tests passed; registry counter: 12 tests passed.
- Continuity, mission assignment coverage (630/630), isolation and daily snapshot offline dry-run: passed. Assignment coverage is not completion of 630 tasks.
- Full `npm test`: expected closed-database refusal in 12 API suites (`TARGET_REQUIRED`); 326 API assertions passed. Other suites recorded in the PR's CI.
- Local PHP validation unavailable (PHP absent). Local preproduction harness requires non-root execution; the runtime cannot switch user. Dedicated GitHub Actions checks validate PHP, static build and preproduction doubles on a normal runner. No real preproduction or production service was started.

## Cleanup status

Delete only a branch whose observed tip is still the recorded SHA and is an ancestor of the final main. Recheck branch tips immediately before cleanup. The connected GitHub plugin has no branch-delete action and the browser is signed out. The one-time `consolidate-branches-cleanup.yml` workflow uses the repository token after this PR is merged: it checks all 18 recorded tips, ancestry and the consolidation helper tip before any deletion, rechecks each tip immediately before deleting, and confirms deletion through API reads. The helper tip must be the second parent of the two-parent PR merge commit; squash/rebase is refused. GitHub DELETE-ref has no atomic conditional-SHA parameter; concurrent pushes during cleanup are not supported. No unrecorded branch is deleted. Observe workflow success and a fresh branch listing before reporting completion.
