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

**Status**: scaffolding only. The current UI (21-step placeholder grid and the geometry demonstration) still
lives in `apps/web/src/main.tsx`; moving it here, split by module, is Lot 3 ("Application pilote") work, not
done yet. See each module's own `README.md` for its specific status.

Shared business logic that does not belong to the UI (geometry, the domain model, command history) lives in
`packages/*`, not inside a module — a module consumes those packages, it does not reimplement their logic.
