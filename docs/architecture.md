# Architecture and migration

## Boundaries

The UI lives in apps/web. Geometry lives in packages/core-geometry. Keep project state, persistence and regulatory checks outside rendering functions. The supplied geometry implementation is preserved for traceability; preserving it does not validate all its behaviours. Where the authoritative source turns out to be stateful glue rather than business logic (see milestone 3), the right move is a documented contract (`ProjectRepository`), not a mechanical port.

## First milestones

1. Foundation complete: root lockfile, reproducible CI, TypeScript checks, 19 passing geometry tests and production build.
2. Add geometric input validation and regression tests for unknown levels, invalid dimensions and inverted openings.
3. V14Bridge audited: it is a thin localStorage facade (`domainGet`/`domainSet`), not a business-logic module — see `packages/core-geometry/src/project-repository.ts` for the resulting `ProjectRepository` contract and `parcel-geometry.ts` for the genuinely pure functions extracted from the same source file (`inwardOffset`, `buildingFootprint`, `projectCode`, …). Still open: extract the actual column profile catalogue (`originalShapeData`, `columnShapeMeta`, `ensureColumnProps`) from the authoritative Parcours HTML.
4. Migrate the actual 21 steps, numbered 01–21, preserving labels, phases and card layout. Integrate Harmonie within relevant steps.
5. Introduce versioned project data and persistence with explicit migration rules.
6. Extend the model with slabs, mezzanine, ramps, lift shaft and coordinated stairs.
7. Validate P.118 end to end, including its 673 m² footprint, setbacks, levels, peripheral columns, basement access and coordinated views.

The authoritative HTML is not part of this initial repository. Do not invent its titles or claim feature parity. Confirm current structural load requirements from source data rather than assuming older values.

## Known geometry limits

Unknown levels resolve to elevation zero; dimensions lack runtime validation; out-of-wall windows can produce inverted surfaces; column extrusion needs an injected resolver; cuts are axis-aligned. Canvas rendering uses approximate depth sorting and mutates the face array. No slabs, arbitrary section planes or structural calculation are implemented. `inwardOffset` (parcel setback) has no self-intersection guard: a setback beyond half the polygon's width flips the polygon instead of failing — documented and tested, not fixed, because the source has the same behaviour.
