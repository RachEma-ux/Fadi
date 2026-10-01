# Architecture and migration

## Boundaries

The UI lives in apps/web. Geometry lives in packages/core-geometry. Keep project state, persistence and regulatory checks outside rendering functions. The supplied geometry implementation is preserved for traceability; preserving it does not validate all its behaviours.

## First milestones

1. Foundation complete: root lockfile, reproducible CI, TypeScript checks, 19 passing geometry tests and production build.
2. Add geometric input validation and regression tests for unknown levels, invalid dimensions and inverted openings.
3. Extract the actual column profile catalogue and V14Bridge from the authoritative Parcours HTML.
4. Migrate the actual 21 steps, numbered 01–21, preserving labels, phases and card layout. Integrate Harmonie within relevant steps.
5. Introduce versioned project data and persistence with explicit migration rules.
6. Extend the model with slabs, mezzanine, ramps, lift shaft and coordinated stairs.
7. Validate P.118 end to end, including its 673 m² footprint, setbacks, levels, peripheral columns, basement access and coordinated views.

The authoritative HTML is not part of this initial repository. Do not invent its titles or claim feature parity. Confirm current structural load requirements from source data rather than assuming older values.

## Known geometry limits

Unknown levels resolve to elevation zero; dimensions lack runtime validation; out-of-wall windows can produce inverted surfaces; column extrusion needs an injected resolver; cuts are axis-aligned. Canvas rendering uses approximate depth sorting and mutates the face array. No slabs, arbitrary section planes or structural calculation are implemented.
