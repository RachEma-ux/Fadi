# Fadi Concept Axes — Implementation Plan

**Requested filename:** `Fadi-Concept-Axes Pan.md`  
**Plan version:** 1.0  
**Date:** 25 October 2026 — Europe/Zurich  
**Product reference:** Fadi Concept Axes, version 1.0, dated 23 October 2026.  
**Status:** Proposed implementation plan. Work packages and acceptance scenarios below are planned, not executed.  
**Repository checkpoint:** `RachEma-ux/Fadi`, `main@0ff0638c3f6781bb94fce9b22c82c69c7ed7083e`.

## 1 Objective and delivery strategy

Implement a native **Axes et repères** tool family that lets a user change the drawing frame, constrain a workplane, save useful frames and edit component insertion origins without accidentally moving existing geometry or changing geographic coordinates.

Deliver the concept in its four original phases:

1. **A — Foundation:** validated frames, explicit working context, numeric placement, alignment, workplanes, recovery and compact toolbar.
2. **B — Reuse and visibility:** named frames, persistence, orientation overlay and optional scene recall.
3. **C — Component origins:** explicit editing scope, compensating transforms and then batch operations.
4. **D — Associations and exchange:** linked geometric references, controlled 2D/3D relationships and explicit coordinate mappings during export.

Begin with a bounded baseline and contract package. Release each phase through its own evidence and acceptance gate. A blocked linked-reference feature must not stop independent work on numeric placement; incomplete permissions must, however, block shared-frame writes.

The first usable increment is a complete Phase A workflow in an explicitly identified host. Sandbox can be the first host because it already contains the Axes tool. It remains a standalone, project-independent 3D module. Delivery in Sandbox does not establish delivery in Studio Planche 2D or Planche 3D.

This document prepares implementation. It does not itself modify the application, create GitHub issues, approve a schema, merge a pull request or deploy a release.

## 2 Sources and verified starting point

### 2.1 Inspection performed for this plan

The current Axes concept was read and compared with its repository copy. The Git blob of the Markdown on the inspected `main` is `8669e631405ec03a25ac6d30e335fdb8838141f8`, matching the version 1.0 document previously delivered.

The following current files were read at the repository checkpoint: `AGENTS.md`, the Sandbox README, the Sandbox Axes tool, its annotations model, the root `package.json`, and the continuity protocol. The supplied `Studio-Le Concept.md` was reviewed for the 2D/3D, identity, transaction and validation requirements.

This is a focused planning inspection, not a complete current-code audit. No application test suite, browser journey, database migration, extension runtime or deployment was executed for this plan. The earlier concept's failed browser access is historical evidence; it does not establish the current availability of preproduction.

| Verified starting point | Implementation implication |
| --- | --- |
| `machineAxes` implements origin → X → Y placement. | Extend and test the existing state machine if the baseline audit confirms it remains suitable. |
| `repereDepuis` constructs an orthogonal frame but substitutes an arbitrary perpendicular when the Y direction degenerates. | Add an explicit validation contract and a failing regression case before replacing the fallback behavior. |
| The Axes `saisie` event returns an error saying the measurements field is unused. | Implement numeric placement through the tool and parser, not only through new form fields. |
| `poser` calls `modifierAnnotations` and changes `annotations.repere`; annotations participate in undo. | Separate personal working-context history from geometry/document undo through a deliberate transition. |
| `Annotations` contains one optional `repere`; `Scene` contains camera settings without a frame snapshot. | Named frames and frame-aware scenes need versioned schemas and migration tests. |
| Sandbox drawings are local IndexedDB documents; its server boundary currently concerns tool preferences only. | Keep drawing frames local to their Sandbox documents. Do not add server geometry storage through the preferences endpoint. |
| Sandbox explicitly forbids dependencies on Studio, Atelier and their model packages. | Implement equivalent contracts inside allowed boundaries. A new shared package requires a separate architectural decision. |

Previously reported concerns about inclined-plane aiming and transformed-axis clipping remain items to reproduce in AXE-00. Their live behavior was not revalidated for this plan.

### 2.2 Preserve the Studio design method

For every affected host, apply the supplied Studio sequence: define the target → compare with existing behavior → classify gaps → decide the implementation approach. Classify each capability as verified conforming, partly conforming, defective, incompatible, absent or unverified.

Retain suitable existing components with evidence. Do not assume that every current Planche component must be retained, or that every difference requires a rewrite. Preserve independent 2D authoring, independent 3D authoring and explicitly associated views as three separate acceptance paths.

## 3 Non-negotiable implementation rules

1. **Working-frame changes do not move model geometry.** Vertex positions, stable IDs, quantities, geographic mappings and north remain unchanged.
2. **Frame, plane and camera are separate state.** A normal-view command changes the camera only. Hiding axes changes presentation only.
3. **Working frames are orthonormal and right-handed.** Reject non-finite, singular and ambiguous inputs. Do not silently repair an arbitrary saved basis.
4. **Component origins are object edits.** Show scope, compensate transforms and commit atomically; do not route these operations through a personal view-setting command.
5. **Independent 2D documents remain independent.** An editing coordinate system does not create a hidden authoritative 3D model.
6. **Geographic, cadastral, model and local coordinates remain tagged.** Conversions require explicit mappings and units.
7. **Preview is disposable.** Escape, tool cancellation and rejected validation leave no committed mutation or partial transaction.
8. **History follows ownership.** Personal context history, document undo and camera history have explicit, separate responsibilities.
9. **Shared writes enforce actual permissions and expected revisions.** Hidden buttons and cached roles are not authorization.
10. **Every delivered command follows the Planche golden rule:** its own icon, an appropriate toolbar location and a registered shortcut; touch also has a visible named control.
11. **French is the UI source language, with English translations.** Produced documents may retain their own language.
12. **No new service, framework, database or Ruby-extension runtime is introduced solely for Axes.** Reuse the established stack and validated interfaces.

## 4 Target responsibilities and state ownership

### 4.1 Logical contracts

The names below identify responsibilities. They are proposed contract names, not claims that new files, APIs or tables already exist.

| Contract | Minimum fields and responsibility | Owner |
| --- | --- | --- |
| Frame value | Origin; X/Y/Z basis; coordinate-space tag; schema version; validated finite values. | Pure geometry/model layer. |
| Working context | Active saved-frame reference or temporary snapshot; plane; lock state; modified flag; context revision. | User session for a specific document and viewport. |
| Saved frame | ID; name; frame value; document identity; visibility/ownership scope; revision; source mode. | Sandbox local document or authorized Studio document. |
| Workplane | Origin, normal and in-plane basis; relation to a frame; optional typed source reference. | Working context, or an explicit saved definition. |
| Source reference | Source object/subentity IDs and revision; snapshot/linked mode; valid, stale or missing status. | Document reference system. |
| Scene frame capture | Recall enabled/disabled; frame revision or immutable snapshot; plane settings. | Scene definition. |
| Display preferences | Axis visibility/style; overlay corner and visibility; labels; toolbar position; favourites. | Personal preferences in the permitted host. |
| Component-origin command | Target IDs; edit scope; anchor/orientation; expected revisions; affected definitions/instances; operation ID. | Transactional document command system. |

Frame names are labels, never identity keys. Duplicating a saved definition creates a new ID. Scene snapshots retain the reviewed state even when a similarly named frame changes later.

### 4.2 Permissions and persistence

| Action | Sandbox | Studio |
| --- | --- | --- |
| Change temporary frame or camera | Personal local interaction. | Personal interaction; never broadcast as a forced context switch. |
| Change overlay/tool preferences | Local or existing account-preference adapter where permitted. | Existing personal-preference mechanism. |
| Save a named drawing frame | Persist inside the local Sandbox drawing. | Document-scoped write subject to the actual editing permission and revision checks. |
| Redefine component origins | Atomic edit to the local drawing. | Authorized document mutation with concurrency and dependency validation. |
| Edit shared frames while read-only | Not a new shared/server mode. | Denied by the authoritative operation boundary; personal navigation remains available. |

Resolve actual role names, document membership and API behavior in AXE-00. Do not introduce a parallel roles model. Shared-frame updates may integrate with the existing collaboration service, but Axes must not invent its own real-time infrastructure.

### 4.3 Candidate code locations

| Existing area | Planned intervention |
| --- | --- |
| `packages/sandbox-planche-model/src/outils/axes.ts` | Placement state machine, numeric events and validated preview/commit behavior. |
| `packages/sandbox-planche-model/src/annotations.ts` | Review compatibility of legacy `repere`; versioned saved-frame and scene contracts if adopted here. |
| `packages/sandbox-planche-model/src/` | Pure frame/plane functions, context contracts and invariant tests, following current package conventions. |
| `apps/web/src/modules/sandbox/planche/` | Toolbar integration, inspector, context orchestration, drawing persistence and viewport feedback. |
| Sandbox command registry, preferences and pictograms | Register commands and unique icons; respect the existing API boundary for preferences. |
| Studio and Atelier/Planche host integration | Identify the actual public interfaces during AXE-00. Do not import Sandbox internals as a shortcut. |
| Existing authorized Studio persistence layer | Add revisioned frame commands only after confirming document ownership and compatibility. |

Final filenames and physical schema follow the code audit. A shared geometry abstraction is an option to evaluate, not an approved dependency change.

## 5 Geometry and interaction contracts

### 5.1 Coordinate conversion

Use one documented matrix convention. With column vectors, let `B` contain the frame's X, Y and Z directions as columns, and `O` be its origin in model coordinates:

- Local point to model point: `p_model = O + B × p_local`.
- Model point to local point: `p_local = transpose(B) × (p_model − O)` for a validated orthonormal basis.
- Local displacement to model displacement: `d_model = B × d_local`; origin is not applied to a displacement.

For plane projection, use its own origin and normal. Reusing world Z is valid only when the chosen plane is actually model XY. Keep screen-pixel picking tolerance separate from model-space geometric tolerance.

Select length, angular and round-trip tolerances from the supported scale and numerical representation. Record their values, units and rationale before implementation acceptance; this plan does not invent a universal tolerance or precision guarantee.

### 5.2 Placement state machine

Required states: Idle → Origin chosen → X direction chosen → Valid orientation preview → Commit or Cancel. Invalid input retains a correctable preview state and does not produce a transaction. A pointer hover must not repeatedly clear a relevant validation message before the user can read it.

Origin-only mode preserves orientation. Face alignment requires both the normal and a determinable in-plane X direction. Edge alignment requires a supporting plane/normal when the result is underdetermined. Rotation specifies a signed angle and whether its rotation axis is local or model-based.

Numeric input must expose its reference frame, absolute/relative mode and units. Handle locale conventions through the established parser; do not implement a competing parser inside the inspector. If a mode cannot be expressed through the existing parser, extend the parser contract and its tests explicitly.

A frame switch during an unfinished drawing operation must follow a defined policy. Recommended first increment: finish or cancel the operation before switching, with a clear message. Do not reinterpret already entered points in a newly selected frame without an explicit conversion contract.

### 5.3 Component-origin compensation

For a validated affine transform convention, define `C` as the transform from the proposed new component-local coordinates to the old component-local coordinates. Then apply:

- `vertex_new = inverse(C) × vertex_old`.
- `instance_transform_new = instance_transform_old × C`.

The composed model-space result must be unchanged. Verify this independently for every affected instance, including parent transforms. This algebra is a proposed implementation invariant; it is not evidence that the current component model already supports the operation.

Changing a shared definition affects its instances, including unselected instances. Editing a single instance must use supported instance-local metadata or Make unique then edit; changing only the instance transform would move the object and is not acceptable.

Evaluate the 27 anchors in the definition's local bounding box. Handle nested, mirrored and non-uniformly scaled instances explicitly. Reject singular or unsupported transforms before committing. Do not normalize an object's affine transform merely to obtain a drawing frame.

## 6 Work packages and dependencies

Work-package identifiers are local to this plan and are not GitHub issue numbers. Roles describe responsibilities; no staff assignment or parallel execution is assumed. Each package must produce its implementation diff, focused tests, verification record and relevant handoff update.

| Package | Phase | Dependency | Primary responsibility |
| --- | --- | --- | --- |
| AXE-00 Baseline and contracts | Preparation | None | Product and technical lead. |
| AXE-01 Frame mathematics and validity | A | AXE-00 | Geometry/model implementation. |
| AXE-02 Working context and history | A | AXE-01 | Model and host integration. |
| AXE-03 Numeric placement and workplanes | A | AXE-02 | Geometry and drawing tools. |
| AXE-04 Toolbar and first usable release | A | AXE-03 | UI, accessibility and QA. |
| AXE-05 Saved frames and persistence | B | Accepted Phase A | Persistence and authorization. |
| AXE-06 Overlay and scene recall | B | AXE-05 for scene recall | Viewport/UI and QA. |
| AXE-07 Single component-origin edit | C | AXE-01, AXE-02, component-scope decision | Component model and transactions. |
| AXE-08 Component-origin batches | C | AXE-07 verified | Component model and QA. |
| AXE-09 Linked frames and associated views | D | AXE-05 and stable reference contracts | Associations and model integrity. |
| AXE-10 Coordinate exchange | D | AXE-01 and explicit format/mapping contracts | Import/export integration. |
| AXE-11 Phase acceptance and release | Each phase | Applicable packages and evidence | QA, release owner and product owner. |

The dependency table permits preparation of independent work. Integrate and expose features in the concept's A → B → C → D release order unless a reviewed scope change establishes another order. AXE-11 is repeated for each release, not deferred until the whole programme is finished.

### AXE-00 — Establish the baseline and resolve contracts

**Goal:** turn the proposed feature into a bounded, implementable first increment.

- [ ] Read current repository instructions, architecture, relevant workstream handoff/status/tasks and existing issue/PR discussions; recheck HEAD and CI before coding.
- [ ] Search for existing Axes implementation work and reuse its tracking instead of opening a competing issue or editing the same files concurrently.
- [ ] Trace tool input → geometry/context → UI render → persistence → undo in Sandbox and each intended Studio host.
- [ ] Build a target/existing/evidence/gap matrix. Reproduce the degenerate-direction, inclined-plane and clipping cases on synthetic fixtures.
- [ ] Inventory every drawing/measurement tool that consumes a frame or plane; identify tools with hard-coded model axes.
- [ ] Confirm ownership scopes, numeric grammar, tolerance policy, frame-history behavior, component edit scopes and shortcuts.
- [ ] Define the first host and which additional hosts must pass before Phase A is called complete for them.
- [ ] Inspect dependency versions only if the chosen change introduces or upgrades a dependency; use current primary advisory sources before that choice. No upgrade is required by this plan.

**Deliverables:** baseline matrix, command contract sheets, decision register and bounded Phase A backlog. **Exit:** no unresolved decision affects the first increment's geometry integrity, state ownership or allowed storage boundaries. Other decisions remain local blockers for their dependent package.

### AXE-01 — Implement validated frame and plane primitives

**Goal:** provide a single mathematical contract inside each permitted model boundary.

- [ ] Implement finite-value, basis-length, orthogonality, handedness and invertibility validation.
- [ ] Return explicit invalid/ambiguous results for coincident and collinear construction points.
- [ ] Implement point/displacement conversions, plane projection, signed rotation and deterministic face/edge alignment.
- [ ] Keep pure calculation independent of React, rendering and persistence.
- [ ] Add identity, round-trip, rotated-frame and inclined-plane tests, including non-finite and extreme-scale inputs.

**Deliverable:** pure functions and regression fixtures. **Exit:** AX01/AX02 foundations and conversion oracles pass; existing vertices remain unchanged when only the frame value changes.

### AXE-02 — Separate working context from document edits

**Goal:** make frame switching personal and recoverable without consuming geometry undo steps.

- [ ] Introduce an explicit working-context owner per document and viewport, with a context revision.
- [ ] Implement temporary preview, committed personal context, Previous and Model reset.
- [ ] Specify history cursor behavior, duplicate-state suppression, document-switch behavior and session lifetime. A cancelled preview adds no history entry.
- [ ] Replace implicit reads of the shared legacy annotation with reads from the resolved current context at defined boundaries.
- [ ] Bootstrap legacy documents from `annotations.repere` once under an explicit migration version. If absent, use the model frame.
- [ ] Preserve legacy data needed for compatibility without maintaining two writable authorities. Old model undo entries must not silently overwrite the new personal context.
- [ ] Record separate dirty states for personal settings and persistent document changes; never report a personal frame switch as a saved shared edit.

**Deliverable:** context lifecycle and migration contract with undo/reopen tests. **Exit:** AX07 and the Phase A portion of AX09 pass; camera, document history and personal context can be exercised independently.

### AXE-03 — Connect numeric placement, alignment and workplanes

**Goal:** make the context control actual drawing behavior.

- [ ] Extend the placement state machine for precise origin entry and origin-only relocation.
- [ ] Connect absolute and relative coordinates, units and locale handling to the established input parser.
- [ ] Implement face, edge-plus-plane and component-direction alignment with visible orientation preview.
- [ ] Add local XY/XZ/YZ, face and three-point workplanes, plus explicit plane locking.
- [ ] Make eligible drawing, snapping, offset and measurement tools consume the same resolved frame/plane.
- [ ] Define and display the reason when a tool cannot operate on the selected plane.
- [ ] Implement explicit cancellation/confirmation and the policy for switching context during an unfinished operation.

**Deliverable:** end-to-end drawing interaction on rotated and inclined fixtures. **Exit:** AX03–AX06 pass for the supported tools and hosts; no silent world-Z substitution remains in those paths.

### AXE-04 — Deliver the compact toolbar and Phase A user journey

**Goal:** expose a complete usable tool family through Fadi's existing command system.

- [ ] Add active frame, Placer, Aligner, Plan, Précédent, Modèle and Plus in the compact layout.
- [ ] Provide a contextual inspector with origin, orientation, plane, scope, units and validation state.
- [ ] Register every command with its own icon, correct toolbar family, shortcut and accessibility label. Preserve Shift+Y unless a reviewed registry change requires otherwise.
- [ ] Add French labels and English translations, keyboard focus, error announcements and touch equivalents.
- [ ] Keep active frame and primary placement reachable on narrow screens and short viewports; test the actual overflow behavior.
- [ ] Implement normal-view navigation independently of frame/plane changes.
- [ ] Verify positive/negative axis rendering and transformed-axis clipping on the agreed fixtures.
- [ ] Complete AXE-11 for Phase A, with host-specific evidence.

**Deliverable:** first usable Axes release. **Exit:** AX01–AX07, AX17, applicable AX18/AX20 and basic independent-2D checks pass in every host included in the release claim.

### AXE-05 — Add named frames and safe persistence

**Goal:** reliably save and reuse frame definitions in the correct ownership scope.

- [ ] Implement save, rename, duplicate, delete, search, favourites and modified-state detection.
- [ ] Persist IDs, frame values, revision, schema version and source mode; start with snapshot references.
- [ ] Keep Sandbox frame data in its local drawing store. Use existing authorized document commands for Studio.
- [ ] Implement expected-revision checks, idempotent retry and explicit conflicts for shared mutations.
- [ ] Recheck permissions on writes and offline replay; distinguish pending local work from confirmed persistence.
- [ ] Prevent deletion from silently breaking scene/view references; expose dependent items and resolution choices.
- [ ] Verify save/reopen, crash recovery at write boundaries, malformed input and old-document migration.

**Deliverable:** manager plus storage adapters and migration evidence. **Exit:** AX08/AX09 and relevant AX15 scenarios pass. If shared command infrastructure is unavailable, shared editing stays disabled and is reported as incomplete; local Sandbox delivery can still proceed within its own scope.

### AXE-06 — Add the overlay and explicit scene recall

**Goal:** make orientation continuously legible and view recall predictable.

- [ ] Add a screen-size XYZ triad with positive/negative direction cues and a visible model/working/component mode.
- [ ] Keep overlay, full drawing axes and grid visibility independent.
- [ ] Store personal corner/style preferences through the permitted host adapter; avoid accidental drawing-gesture interception.
- [ ] If included, make click-to-orient a camera-only command with keyboard/touch access.
- [ ] Add an explicit scene option to recall a frame/plane snapshot or pinned revision. Keep old scenes camera-only by default.
- [ ] Define export/print inclusion as a separate option, disabled by default for viewport aids.
- [ ] Complete AXE-11 for Phase B.

**Deliverable:** orientation overlay and versioned scene recall. **Exit:** AX06/AX14/AX17/AX20 pass for the new behaviors, including hiding full axes while keeping the overlay visible.

### AXE-07 — Implement one component-origin edit correctly

**Goal:** change insertion semantics while preserving all affected model-space geometry.

- [ ] Resolve supported instance/definition/Make unique scopes and show affected object and instance counts before confirmation.
- [ ] Implement local bounding-box anchors, base centre, bounding-box centre and custom insertion points; keep orientation a separate choice.
- [ ] Preview changes and validate the compensation described in section 5.3.
- [ ] Update definition data, every affected instance transform and dependent references in one atomic transaction.
- [ ] Cover nested, mirrored and non-uniformly scaled instances, or reject each unsupported case explicitly before mutation.
- [ ] Preserve eligible object identities; Make unique creates a new definition identity with explicit provenance.
- [ ] Verify geometric equivalence, dimensions and quantities independently, plus undo/redo and save/reopen.

**Deliverable:** single-edit workflow with transform invariants. **Exit:** AX10/AX11 pass; no accepted operation moves an unselected sibling instance or leaves partially updated references.

### AXE-08 — Extend to component batches

**Goal:** process multiple components without duplicate definition edits or ambiguous partial results.

- [ ] Build an operation plan grouped by definition, distinguishing selected instances from all affected instances.
- [ ] Preview supported/skipped targets with specific reasons and a complete affected count.
- [ ] Use one atomic transaction for the approved batch within supported limits. A preflight validation failure commits nothing.
- [ ] Define a workload limit from measurements; reject oversized work clearly rather than silently changing atomicity.
- [ ] Test duplicate selections, shared definitions, cancellation, concurrent changes, failure injection and one-step undo.
- [ ] Complete AXE-11 for Phase C.

**Deliverable:** bounded batch editing. **Exit:** AX12 and the batch variants of AX10/AX11 pass; every affected definition is transformed exactly once.

### AXE-09 — Add linked frames and associated-view behavior

**Goal:** preserve provenance without guessing replacements after topology changes.

- [ ] Confirm stable object/subentity identity and revision contracts with the existing association system.
- [ ] Distinguish snapshot from linked definitions and define the update policy explicitly.
- [ ] On source changes, recompute valid links or mark stale/missing; ambiguous replacements require user resolution.
- [ ] Pin source revisions for asynchronous updates and discard stale results from the current active calculation.
- [ ] Preserve independent 2D drawings; associated views use the existing authority and propagation rules.
- [ ] Test source splitting, deletion, undo, revision conflicts and deletion of referenced saved frames.

**Deliverable:** reference-health handling and associated-view integration. **Exit:** AX13/AX19 pass. If stable topology references are unavailable, retain snapshot-only behavior and keep this package blocked with a specific dependency.

### AXE-10 — Add explicit coordinate exchange

**Goal:** export the selected coordinate interpretation without relocating authoritative data.

- [ ] Inventory actual importer/exporter capabilities, units and coordinate metadata by format.
- [ ] Define supported Model, Working and Original-source coordinate choices per format; unavailable choices explain the missing mapping.
- [ ] Preserve source mapping provenance and distinguish geographic transforms from drawing-frame transforms.
- [ ] Test units, precision, handedness, large coordinates and round trips against declared tolerances.
- [ ] Keep structural grids and annotations as document content; treat viewport overlays as presentation aids.
- [ ] Report unsupported elements and losses before export; never invent a CRS or missing source origin.
- [ ] Complete AXE-11 for Phase D after AXE-09 and the supported exchange paths are verified.

**Deliverable:** per-format mapping and verification matrix. **Exit:** AX16 and relevant AX20 scenarios pass for every advertised choice. Local renderer rebasing alone is not evidence of correct geographic exchange.

### AXE-11 — Verify and release each bounded increment

**Goal:** distinguish implemented code, verified behavior, deployed behavior and user acceptance.

- [ ] Run focused tests, required repository checks and the relevant host journeys on the exact candidate commit.
- [ ] Review the final diff, module boundaries, permissions, data migrations, rollback and user-visible limitations.
- [ ] Update the existing workstream's TASKS, STATUS and HANDOFF together; record the next authorized action.
- [ ] Inspect the current merge/deployment workflow. If merging automatically triggers preproduction, include that effect in release preparation rather than assuming merge is documentation-only.
- [ ] Deploy only when authorized; verify the served revision and the relevant Axes journeys in preproduction.
- [ ] Record product-owner acceptance of the exact scope demonstrated. Passing CI is evidence, not acceptance.

**Deliverable:** phase verification and release record. **Exit:** all included acceptance scenarios have evidence; unsupported or deferred capabilities remain explicit.

## 7 Acceptance traceability

Keep the original AX01–AX20 identifiers. The following are proposed tests, not claimed results. Each run records host, revision, fixture, action, expected result, actual result and evidence location.

| Concept ID | Observable acceptance condition | Packages / test layers |
| --- | --- | --- |
| AX01 | A frame rotated 27° changes new drawing directions while existing geometry and north remain fixed. | AXE-01–04; unit + E2E. |
| AX02 | Coincident/collinear points are rejected without a silent fallback or committed state. | AXE-01/03; unit + interaction. |
| AX03 | Numeric origin relocation respects units and preserves orientation and geometry. | AXE-03; parser + E2E. |
| AX04 | Absolute/relative coordinates use the displayed rotated frame and locale. | AXE-03; unit + E2E. |
| AX05 | Inclined-plane drawing, snapping and measurement agree on one plane. | AXE-03; geometry + E2E. |
| AX06 | Plane lock, normal view and axis/overlay visibility affect only their declared state. | AXE-02/04/06; component + E2E. |
| AX07 | Previous context and geometry Undo operate on separate histories. | AXE-02/04; integration + E2E. |
| AX08 | Named frame ID, basis, name, scope and revision survive restart. | AXE-05; storage integration + E2E. |
| AX09 | Legacy documents with one frame or none migrate without geometry or annotation loss. | AXE-02/05; migration + reopen. |
| AX10 | Origin editing reports all affected instances and preserves their model-space vertices. | AXE-07/08; transform + integration. |
| AX11 | Nested, mirrored and scaled instances are preserved or rejected atomically with reasons. | AXE-07/08; property/boundary tests. |
| AX12 | Batch cancel, failure and undo leave no partial definitions or references. | AXE-08; transaction fault tests + E2E. |
| AX13 | Broken linked references become stale/missing instead of attaching to guessed geometry. | AXE-09; association integration. |
| AX14 | Scene recall obeys its frame option and pinned snapshot/revision. | AXE-06; persistence + E2E. |
| AX15 | Concurrent/offline shared edits enforce revision conflicts and permissions without switching others' personal context. | AXE-05; real authorization/storage integration + multi-session E2E. |
| AX16 | Each supported export coordinate choice has explicit units and a verified mapping/round trip. | AXE-10; file exchange integration. |
| AX17 | Keyboard, touch, screen reader, narrow and short viewports retain command access and cancellation. | AXE-04/06 and subsequent UI; accessibility + E2E. |
| AX18 | Equivalent workflows pass independently in each supported host without forbidden dependencies. | AXE-00–11; boundary checks + host matrix. |
| AX19 | Independent 2D stays independent; linked views use explicit association authority. | AXE-04 baseline, AXE-09 full; model + dual-view E2E. |
| AX20 | Transformed/clipped axes and large-coordinate picking remain coherent with the active frame. | AXE-01/04/06/10; numeric + rendered verification. |

## 8 Fixtures, measurements and verification commands

### 8.1 Required synthetic fixtures

- **F01 Rotated wing:** a simple plan rotated 27°, with a known point, line and rectangular face.
- **F02 Inclined face:** a roof-like face with a normal distinct from model Z and known in-plane dimensions.
- **F03 Invalid frame inputs:** coincident points, almost-collinear directions, zero vectors and non-finite values.
- **F04 Legacy documents:** one with no frame, one with a non-default legacy frame, one with camera-only scenes and one with malformed frame data.
- **F05 Components:** shared definitions with selected and unselected instances, nesting, reflection and non-uniform scale; a singular-transform rejection case.
- **F06 Permissions and concurrency:** editor, viewer, outsider and revoked membership; two independent sessions and offline replay.
- **F07 Coordinate exchange:** explicit units and a known mapping, including a local model at large coordinate magnitudes; no inferred geographic system.
- **F08 Studio drawing modes:** an independent 2D drawing, independent 3D geometry and an explicitly linked view with stable object identities.

Use fresh disposable stores and synthetic data. Browser profiles, credentials and private geometry are not deliverables. If database behavior is involved, use the project's approved disposable instance of the actual database; in-memory mocks do not prove its transactions or authorization.

### 8.2 Test selection

Use the existing runner and package scripts. The root scripts below were confirmed to exist; inspect their current implementation, environment and affected workspaces before running them during implementation.

```bash
# First run the focused pure model suite and relevant new regressions.
npm run test --workspace=@parcours/sandbox-planche-model

# Run repository checks applicable to the implementation change.
npm run typecheck
npm run build

# Root test includes API workspaces: inspect database guards and use
# the approved disposable test environment before running it.
npm test

# When checkpoint documents are changed, validate their structure.
node scripts/check-continuity.mjs
```

Execute host E2E journeys through the repository's current harness after inspecting its setup. Do not present a guessed command as a tested recipe. No commands in this section were executed to validate application behavior while writing this plan.

For performance, establish a profile covering device/browser, model size, instance depth, number of saved frames and concurrent editors where relevant. Measure preview latency, context switching, save/reopen time and batch memory. Agree thresholds before declaring performance acceptance; no arbitrary timing budget is asserted here.

## 9 Migration, recovery and compatibility

1. **Read old data:** validate absent/legacy frames and camera-only scenes without changing geometry.
2. **Create new context:** initialize personal context from the validated legacy value; record the migration/schema version so reopening does not overwrite a newer personal setting.
3. **Introduce saved definitions:** migrate deliberately with stable IDs and a deterministic policy; do not reinterpret every legacy frame as a shared approved definition.
4. **Preserve unrelated content:** retain existing annotations, component identities, revisions and geographic mappings.
5. **Write atomically:** a failed local save or server transaction leaves a valid previous document. Expose pending versus confirmed state.
6. **Handle unsupported schema:** older clients must not silently strip new frame or scene fields. Choose compatibility reads or refuse unsafe writes with a clear explanation.
7. **Recover safely:** rehearse interruption/reopen and retries. Keep a suitable pre-migration copy where a persistent format change needs it, and demonstrate restoration on disposable data.
8. **Separate code rollback from data rollback:** disabling the toolbar must preserve saved definitions. Restoring an older application is safe only if its decoder can read the newer data or writes are blocked.

In collaborative Studio contexts, replay and undo must revalidate permission, expected revision and dependent references. A historical approval or publication must not be rewritten by an Axes command.

## 10 Decisions and local blockers

| Decision | Recommendation to review | Blocks |
| --- | --- | --- |
| First host and supported release matrix | Start with Sandbox as an independently testable host, then integrate selected Studio hosts through their own boundaries. | Phase A scope claim. |
| Legacy frame/history transition | One personal working-context authority; legacy `repere` is a migration input, not a competing live writer. | AXE-02. |
| Geometric tolerances | Central, documented length/angular policies tied to supported model scale. | AXE-01 acceptance. |
| Numeric grammar and active-operation policy | Use the established parser; finish/cancel an in-progress operation before a frame switch in the first increment. | AXE-03. |
| Shared ownership and permissions | Document-scoped definitions; existing authoritative permissions and revision commands. | Studio shared part of AXE-05. |
| Scene capture | Explicit opt-in, preserving a revision or snapshot; legacy scenes remain camera-only. | AXE-06 scene recall. |
| Component edit scope | Explicit shared-definition or supported instance operation; Make unique when required. | AXE-07/08. |
| Stable references | Snapshot first; linked mode only with verifiable identity and stale-reference handling. | AXE-09. |
| Coordinate formats and mappings | Publish a format-by-format support matrix; expose no unsupported source-coordinate option. | AXE-10. |
| Release automation | Inspect actual merge/preproduction triggers and obtain the applicable release authorization. | Deployment portion of AXE-11. |

Record decisions in Fadi's existing decision journal or a correctly scoped ADR. These rows do not create new accepted ADR numbers. If a required decision remains unresolved, mark only the dependent package blocked and continue other authorized work.

## 11 Definition of ready and definition of done

### Ready for a work package

- [ ] Existing issue/PR work and baseline have been checked.
- [ ] Inputs, outputs, state ownership, permissions, errors and undo behavior are explicit.
- [ ] Relevant open decisions are resolved or the package avoids their dependency.
- [ ] Fixtures and expected acceptance results are defined.
- [ ] Files/interfaces to change, migration impact and module boundaries are identified.
- [ ] The requested implementation scope is authorized.

### Done for a work package

- [ ] User-visible workflow is connected; no placeholder business logic is presented as delivered.
- [ ] Focused regression cases and applicable required checks pass on the actual candidate revision.
- [ ] Included host/scenario coverage is stated, with failures, skips and blocked checks reported.
- [ ] Persistence, cancellation and failure atomicity are verified where relevant.
- [ ] French/English UI, icons, toolbar placement, shortcuts and touch access meet the command contract.
- [ ] Diff and evidence are reviewed; no unrelated changes or confidential artifacts are included.
- [ ] TASKS/STATUS/HANDOFF and the implementation issue reflect the real result.
- [ ] Acceptance and deployment remain separate recorded states.

### Done for the complete Axes concept

All four phases are implemented in their declared hosts; AX01–AX20 have current evidence; unresolved references, migration failures and concurrent edits are handled explicitly; supported exchange modes are documented; and the product owner has accepted the delivered scope. A partial Phase A release must be named as such.

## 12 Immediate next implementation action

Start **AXE-00** on the current repository, locating any existing Axes implementation issue or branch first. Produce the short baseline/gap matrix and resolve the context/history transition. Then implement AXE-01 and AXE-02 before adding toolbar controls that would expose inconsistent context behavior.

Before a future GitHub publication of this plan, select its location through the existing workstream/document rules. This is an implementation companion to the concept; it does not replace either file of the canonical concept MD/DOCX pair.

## 13 Sources

All repository links below are pinned to the checkpoint inspected on 25 October 2026. Recheck current HEAD before implementation.

- [Fadi Concept Axes v1.0](https://github.com/RachEma-ux/Fadi/blob/0ff0638c3f6781bb94fce9b22c82c69c7ed7083e/Fadi%20Concept/Fadi%20Concept%20-%20Axes.md): product behavior, four phases and AX01–AX20.
- Supplied `Studio-Le Concept.md`: sections 3, 8, 9 and 10, especially independent drawing modes, identity/association contracts, transactions and proof-based implementation decisions.
- [Fadi development rules](https://github.com/RachEma-ux/Fadi/blob/0ff0638c3f6781bb94fce9b22c82c69c7ed7083e/AGENTS.md): geometry isolation, coordinate tagging, bilingual UI and command golden rule.
- [Sandbox module boundary and storage](https://github.com/RachEma-ux/Fadi/blob/0ff0638c3f6781bb94fce9b22c82c69c7ed7083e/apps/web/src/modules/sandbox/README.md).
- [Current Sandbox Axes state machine](https://github.com/RachEma-ux/Fadi/blob/0ff0638c3f6781bb94fce9b22c82c69c7ed7083e/packages/sandbox-planche-model/src/outils/axes.ts).
- [Current annotations and scenes](https://github.com/RachEma-ux/Fadi/blob/0ff0638c3f6781bb94fce9b22c82c69c7ed7083e/packages/sandbox-planche-model/src/annotations.ts).
- [Root package scripts](https://github.com/RachEma-ux/Fadi/blob/0ff0638c3f6781bb94fce9b22c82c69c7ed7083e/package.json).
- [Continuity and checkpoint protocol](https://github.com/RachEma-ux/Fadi/blob/0ff0638c3f6781bb94fce9b22c82c69c7ed7083e/docs/continuity/README.md).

**Document checks:** original acceptance IDs retained; phase and package dependencies mapped; proposed contracts distinguished from existing code; current source inspection distinguished from future application tests. This file is a planning deliverable, not an implementation completion report.
