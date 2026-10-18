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

**État requalifié le 18 octobre 2026 (Mission 003, M06).** Les sept modules sont déclarés dans
`module-registry.ts` et raccordés par `routes/ProjectShell.tsx` ; les routes API et les README propres aux
modules décrivent leurs capacités et limites. Le Parcours comporte 21 étapes et leurs contenus métier ;
il ne s’agit plus d’une simple grille de placeholders. La collaboration possède des membres et des rôles
contrôlés côté serveur (`apps/api/src/routes/members.ts`, `lib/owned-project.ts`). Certains textes de statut
du registre restent à corriger dans un futur lot applicatif autorisé.

Ce constat statique au code de `main@27c0c5a35e2f116752a83a9c66459484488a1975` ne signifie pas que chaque
capacité est complète ou acceptée. Consulter les limites de chaque module, les décisions et les preuves
datées ; les futurs contrats Studio restent à instruire séparément.

Shared business logic that does not belong to the UI (geometry, the domain model, command history) lives in
`packages/*`, not inside a module — a module consumes those packages, it does not reimplement their logic.
