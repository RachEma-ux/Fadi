# Modules

Fadi is a modular monolith (see `docs/architecture.md`, "Shape: a modular monolith"): one application, one
deployable, with responsibilities kept apart on purpose. Each subfolder here is one module from the brief's
table and owns one responsibility only. Cross-module code goes through an explicit import, never a shared
mutable global.

| Module | Responsibility |
| --- | --- |
| `projets-sources` | Projects, parcels, files, versions and provenance |
| `parcours` | Steps, progress, decisions and hand-offs |
| `programmation` | Needs, headcounts, spaces, areas and functional relationships |
| `atelier` | Building model, drawing, selection, editing and views |
| `analyses` | Quantities, constraints, checks and scenario comparison |
| `documents` | Plans, tables, schedules and reports |
| `collaboration` | Access, comments, revisions and synchronisation |

**Status**: one module (`atelier`) is functionally wired end to end — real auth, real persistence via
`apps/api`, real undo/redo. The 21-step Parcours grid is rendered (in `apps/web/src/routes/ProjectShell.tsx`)
but still placeholder content, and the other five modules are status screens only. See each module's own
`README.md` for its specific status.

Shared business logic that does not belong to the UI (geometry, the domain model, command history) lives in
`packages/*`, not inside a module — a module consumes those packages, it does not reimplement their logic.
