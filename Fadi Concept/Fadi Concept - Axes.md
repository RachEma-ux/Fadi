# Fadi Concept Axes

Version: 1.0  
Date: 23 October 2026  
Status: Proposed for product and technical validation  
Scope: Native Axes and Reference Frames tools for Fadi Planche 2D and 3D, with application to Studio and an independent Sandbox implementation.

## 1 Purpose and product decision

Fadi should provide a compact **Axes et repères** toolbar that makes the active drawing frame visible, easy to change and safe to restore. An architect should be able to draw along a rotated building wing, work on an inclined roof, return to the model frame and reuse a saved façade frame without rotating the building or losing coordinate meaning.

The proposed feature combines three complementary ideas: SketchUp’s direct placement of drawing axes, the reusable named frames of Axes Manager, and the persistent orientation feedback of Eneroth Axes Overlay. A separate component-origin workflow draws on Axes Tools. These are behavioral references for a native Fadi design, not a proposal to install Ruby extensions in a web application.

The governing invariant is: **changing the working frame changes how the user draws and reads coordinates; it does not move existing geometry**. Editing a component origin is a separate operation with explicit scope and compensating transforms. Changing the camera is another separate operation.

This document defines a proposed product contract and implementation sequence. It does not approve an architecture change, report a deployed feature, or replace existing Studio decisions and acceptance gates. Repository filenames are `Fadi Concept - Axes.md` and `Fadi Concept - Axes.docx`; both carry the same content and version.

## 2 Evidence and research boundaries

The baseline is the Fadi source reviewed at commit `516e2f747c15d84f8c589e5271c015e929dc37e4`, official SketchUp documentation, the three supplied extension archives, and the supplied Studio concept. Source references are listed in section 15.

The live Sandbox URL could not be inspected because the browser returned `ERR_INVALID_AUTH_CREDENTIALS`. Fadi findings below therefore describe inspected source, not a successful live usability test. No extension was executed in SketchUp. The encrypted Ruby files in Axes Manager and Eneroth Axes Overlay could not be audited internally. Their documented behavior must not be confused with verified implementation behavior.

### 2.1 Fadi baseline

| Evidence from inspected code | Consequence for this concept |
| --- | --- |
| Axes placement already follows origin, X direction, then Y direction; the resulting basis is orthogonalized. [S02] | Extend the existing interaction and geometry contract before adding more tools. |
| The inspected annotation model holds a single optional working frame. [S03] | Named frames need an explicit collection, IDs, migration and persistence rules. |
| The Axes tool rejects numeric input, although the general measurements parser understands coordinates relative to an active frame. [S02, S04] | Numeric placement must be implemented deliberately and tested through the actual tool. |
| The command registry includes Axes with the Shift+Y shortcut; rendering distinguishes positive and negative directions. [S05, S06] | Preserve familiar entry points and improve labels and state feedback. |
| The component context menu contains a disabled change-axes entry; inspected scenes preserve camera state without a complete named-frame workflow. [S07] | Component origins and scene/frame recall are proposed additions, not existing capabilities. |
| Sandbox has its own module, model package and local drawing persistence. [S08] | Consistent interaction must not introduce forbidden dependencies on Studio or Atelier. |

Three implementation risks deserve targeted reproduction: collinear placement may fall back to an arbitrary direction; free aiming on an inclined frame may still use a default world normal; and axes clipping may be calculated in canonical directions before a transformed group is applied. These are code-review concerns, not confirmed live defects. [S02, S06, S09]

### 2.2 Lessons from SketchUp and the extensions

| Reference and finding | Proposed Fadi application |
| --- | --- |
| SketchUp distinguishes drawing axes, component axes, placement origins and camera views. Its drawing-axes workflow includes placement, alignment and reset. [S10, S11, S12] | Keep the working frame, object origin and camera independently addressable. |
| CAD import/export documentation highlights units, origin placement and interoperability constraints. [S13, S17] | Expose coordinate mappings and export frames instead of silently relocating the project. |
| Styles control axis presentation. Offset operates on existing geometry; it is not an axes-management command. [S14, S15] | Put visibility in display settings and keep Offset in geometry modification. |
| Axes Tools 1.4.0 exposes three anchor choices on each bounding-box axis and processes component definitions. Its helper dependency is not bundled. [S20, A01] | Offer 27 origin anchors with explicit instance/definition scope. Do not infer complete transform guarantees from the archive alone. |
| Axes Manager 2.0.0 documents world and previous axes, named saved frames, origin and three-point placement, and six orientation presets. Its implementation is encrypted. [S21, A02] | Add named-frame recall, a previous-frame action and explicit orientation presets. Preserve clearer separation of orientation and numeric-coordinate modes. |
| Eneroth Axes Overlay 1.0.0 provides persistent orientation feedback through SketchUp’s overlay system; its main implementation is encrypted. [S22, A03] | Add a small labelled viewport triad. Click-to-orient is a Fadi proposal, not a verified Eneroth capability. |

The most useful synthesis is one coherent interaction model. Reproducing all extension buttons as a large toolbar would obscure the distinction between drawing, object editing and navigation.

## 3 Coordinate concepts and invariants

### 3.1 Terms used by the interface

| Concept | Meaning and permitted effect |
| --- | --- |
| Model frame | Stable coordinate basis of the document. Ordinary Axes commands cannot rewrite it or relocate stored geometry. |
| Working frame | Origin and orthonormal X, Y and Z directions used by drawing tools, inference and coordinate input. Changing it leaves existing geometry fixed. |
| Workplane | Plane on which the current drawing operation is constrained. It has a position and normal and may use XY, XZ or YZ of a chosen frame. |
| Component frame | Local coordinate system of a component definition or instance. Its origin controls insertion and local editing. Redefinition is an object-editing transaction. |
| Camera | Viewpoint and projection. Looking normal to a plane does not redefine that plane or the working frame. |
| Geographic reference | Coordinate reference system, units, north and mappings between local and geographic coordinates. It is not changed by a working-frame rotation. |
| Structural grid | Named construction axes, bays and dimensions used in architectural documentation. It is document geometry/annotation, not the XYZ drawing frame. |

### 3.2 Required invariants

1. The working basis is finite, normalized, orthogonal and right-handed. Coincident or near-collinear inputs produce an explanation and require correction; no arbitrary orientation is silently committed.
2. A frame change preserves model-space geometry, object IDs, constraints, references, quantities and geographic mappings.
3. The workplane and the camera remain independent. “Vue normale au plan” is an explicit navigation command.
4. The coordinate-entry context is visible. Absolute means relative to the selected frame origin; relative means a displacement from the current operation’s reference point, expressed in that frame.
5. A 2D drawing remains an independent 2D document. Its local drawing coordinates do not become a hidden 3D model merely because a view can be associated with a 3D source.
6. Every persistent mutation is validated and reversible. Preview and cancellation leave no partial mutation.
7. An unresolved geometric reference is reported. Fadi must not silently attach a saved frame to a different face after topology changes.

## 4 Toolbar and information hierarchy

### 4.1 Placement and compact form

Place **Axes et repères** in the existing drawing-tools system, alongside guides and precision tools. It should be movable or dockable according to Fadi’s toolbar conventions and retain its position as a user preference. It must not consume a permanent full-width band above the drawing.

The default sequence is: active-frame selector, Placer, Aligner, Plan, Précédent, Modèle, then Plus. The selector displays the frame name and a temporary/modified indicator. Secondary commands open a contextual inspector rather than expanding every option into the toolbar.

| Toolbar area | Visible content | Behavior |
| --- | --- | --- |
| Active frame | Model, temporary frame or saved name | Search and switch among saved frames, favourites and recent frames. |
| Placement | Placer and Aligner | Start placement or align to a face, an edge with a plane, or component directions. |
| Plane | Active plane label and lock state | Choose the drawing plane and whether it remains constrained during the operation. |
| Recovery | Précédent and Modèle | Restore the previous working context or the default model working context. |
| Secondary tools | Plus | Rotate, save, manage, component origins, display and normal view. |

The inspector carries precise values: origin coordinates, orientation, workplane, source reference, scope and revision. A persistent status line reads, for example: “Repère : Façade sud · Plan : XY local · Portée : Travail · Unité : m”. This line describes actual state and updates before the next drawing input is accepted.

### 4.2 Command catalogue

French labels are the UI source language. English labels below provide the translation intent. Every command must have its own icon, a discoverable toolbar or overflow position, an accessible name and a registered shortcut. Only the existing Axes shortcut is confirmed here; additional key combinations must be checked against the complete command registry before release.

| French label / English label | Icon intent | Result |
| --- | --- | --- |
| Repère actif / Active frame | Labelled XYZ triad | Select a model, temporary or saved working frame. |
| Placer les axes / Place axes | Origin with two directions | Place using three points, move origin only, or enter precise values. Retain Shift+Y as the existing entry point. |
| Aligner / Align | Triad beside a face | Preview alignment to a selected geometric reference. |
| Faire pivoter le repère / Rotate frame | Rotation arc around triad | Rotate by an angle around an explicitly selected local or model axis. |
| Plan de travail / Workplane | Plane with normal | Choose local XY, XZ, YZ, a face or three points. |
| Verrouiller le plan / Lock plane | Plane and padlock | Constrain eligible drawing inputs to the selected plane. |
| Vue normale au plan / Normal view | Eye perpendicular to plane | Move the camera only. |
| Repère précédent / Previous frame | Triad and return arrow | Restore the previous working context without undoing geometry. |
| Repère du modèle / Model frame | Triad and home | Restore model-aligned working axes and the default drawing plane. Camera and geometry stay fixed. |
| Enregistrer le repère / Save frame | Triad and save mark | Name and persist the current definition in the permitted scope. |
| Gérer les repères / Manage frames | List of triads | Search, rename, duplicate, delete and inspect references. |
| Origine du composant / Component origin | Component and insertion point | Open the separate origin/orientation workflow for an eligible selection. |
| Affichage des axes / Axes display | Eye and triad | Set model axes, overlay, labels and style independently. |

Shortcuts must not fire while the user edits text or numeric fields. Touch users receive named controls for every action, including modifier-key alternatives. Disabled commands explain the missing selection, permission or valid geometry instead of silently doing nothing.

## 5 Working-frame workflows

### 5.1 Place using three points

1. Select Placer les axes. Show the current frame as a reference and a distinct preview frame.
2. Pick the origin using normal inference and snapping. The numeric origin fields remain available.
3. Pick the positive X direction. Show its direction label and the construction ray.
4. Pick the Y side of the intended XY plane. Project the direction perpendicular to X, normalize it and derive Z consistently.
5. Show the resulting orientation and allow an explicit flip or correction. Commit once valid; Escape cancels the whole preview.

Moving the origin only preserves the current orientation. Direct numeric entry supports origin coordinates, units and an explicit reference frame. Rotating a frame uses a selected rotation axis and signed angle; the inspector must say whether the axis is local or model-based. Avoid ambiguous unlabeled Euler-angle fields.

The existing placement implementation can guide interaction details, but shortcut modifiers and double-click semantics must be verified in the live application before being presented as guarantees.

### 5.2 Align to geometry

For a face, preview the plane normal and allow the user to choose or reverse the in-plane X direction. A face normal alone is insufficient to determine the complete frame. For an edge, require an accompanying plane or normal when the orientation is underdetermined. For a component, preview its local directions without modifying the component definition.

Offer two reference modes: **Snapshot**, which stores the current frame independently, and **Linked**, which retains a typed reference to the source geometry. Snapshot is the first-release default. Linked behavior belongs to a later phase because it requires reliable topology identity and explicit update/conflict handling.

### 5.3 Draw on an inclined plane

An architect selects a roof face, aligns the working frame, chooses its XY plane and locks that plane. Rectangles, offsets, measurements and inference must use that plane consistently. The camera stays unchanged until the architect selects Vue normale au plan. Returning to Modèle restores the default working context while leaving the roof geometry in place.

The plane lock affects drawing constraints, not object permissions or model locking. Tools that cannot operate on the selected plane must report their limitation before accepting the first point.

### 5.4 Recover a previous context

Maintain a short session history of working contexts, including frame and workplane. Précédent navigates this history; it does not call geometry Undo. Cancelling an uncommitted preview creates no history entry. Resetting to Modèle creates a recoverable context change.

Saved-frame creation, renaming and deletion are document mutations and use the appropriate document undo/command system. Camera navigation remains in its own view history where available.

## 6 Named frames and orientation overlay

### 6.1 Frame manager

The manager lists name, scope, source mode, linked-reference health and last revision. Users can save, rename, duplicate, search and delete permitted definitions. Examples are “Aile est”, “Façade sud” and “Toiture atelier”. These are sample names, not inferred project data.

When the active frame differs from its saved definition, display “Modifié” and offer Save changes or Save as new. Switching frames must not silently overwrite a saved definition. Deleting a frame referenced by a scene or linked view requires an explicit resolution of those references; it must not silently substitute the model frame.

An optional scene setting can capture a frame and workplane along with its normal camera settings. The recall option must be visible. Scene data should preserve the referenced frame revision or a snapshot so later edits cannot unexpectedly change a documented view. This extends current behavior and needs its own migration.

### 6.2 Viewport overlay

Display a small screen-size XYZ triad in a configurable viewport corner. Label the letters and distinguish positive and negative directions without relying on colour alone. Show whether it represents the model, working frame or selected component. The active working frame is the default.

The overlay can remain visible while full drawing axes are hidden. It must not intercept ordinary drawing gestures outside its controls. Optional click-to-orient changes only the camera and is separately discoverable. Axes, grid and overlay visibility are separate settings; hiding axes does not disable snapping or change the frame.

For printed drawings and exported images, overlays are excluded by default and can be deliberately included. Structural grid lines and their labels follow their own drawing/export settings.

## 7 Component origin and local axes

### 7.1 Dedicated editing workflow

Component-origin editing belongs to a contextual panel reached from the toolbar or component menu. Show the selected object, affected definition, instance count and exact scope before preview. Provide origin and orientation as separate choices: changing an insertion point does not imply rotating the local basis.

Offer the 27 combinations of minimum, centre and maximum positions along the component’s local bounding-box axes. Provide labelled presets such as base centre and bounding-box centre, plus a custom point for a hinge or connector. Bounding-box centre must never be labelled centre of mass.

Anchor positions are evaluated in the component’s defined local space. A rotated world-aligned bounding box is not an interchangeable substitute. Preview the chosen anchor and all changed local directions directly on the component.

### 7.2 Scope and geometry preservation

The panel distinguishes a selected instance, all instances of a shared definition, and Make unique then edit. Unsupported scopes must be unavailable with an explanation. When a shared definition is changed, the affected count includes instances outside the current selection.

Redefining local coordinates requires compensating both the definition geometry and affected instance transforms so every world-space vertex remains fixed. Treat that operation as one atomic transaction. Preserve stable object identity and update dependent references according to the established Fadi object model.

Nested instances, mirrored transforms and non-uniform scale require explicit handling. A reflected or skewed component transform must not be silently converted into a different geometric object merely to obtain an orthonormal drawing frame. Derive a valid working frame separately or explain why the requested edit is unsupported.

Batch editing comes after single-object correctness. It needs a preview of eligible and skipped objects, reasons for exclusions, affected-definition counts and one clearly defined undo operation. No claim of identical behavior to the supplied Axes Tools helper is made without execution and dependency review.

## 8 Persistence and architecture boundaries

### 8.1 Logical data contract

This is a logical contract, not an approved physical schema or API design.

| Record | Required information |
| --- | --- |
| Saved frame | Stable ID, name, document/owner scope, origin, basis directions, revision and schema version. |
| Source association | Snapshot or linked mode; typed object/reference IDs; source revision; explicit healthy, stale or missing state. |
| Working context | Active frame ID or temporary snapshot, active workplane, lock state and modified flag. |
| Workplane | Plane origin and normal, in-plane basis or frame/plane relation, source reference and scope. |
| Presentation preferences | Overlay visibility/corner, axis labels/style, toolbar location and favourite ordering. |
| Coordinate mapping | Source coordinate system and units, target system and units, explicit transformation and provenance. |

Validate every frame at creation, deserialization and command boundaries. Define scale-aware tolerances centrally and test both very small geometry and large coordinate magnitudes. Store no NaN, infinity or singular basis. Serialized data must carry enough version information for deterministic migration.

The existing optional working frame should migrate without changing visible geometry. Documents lacking one retain the model frame. Introducing named frames must not discard older annotations or rewrite all coordinate values.

### 8.2 Studio and Sandbox integration

Geometry calculations belong in pure model functions with no React dependency. UI components dispatch explicit commands and render validated state. Frame conversion, plane projection, numeric parsing and inference must consume the same validated context.

Sandbox remains an independent module with its current local persistence boundary. Do not introduce imports from Studio or Atelier into Sandbox, or reverse dependencies, merely to reuse the toolbar. Specify equivalent behavior and tests across the relevant packages; extracting a shared package would require a separate architecture decision. [S08, S23]

Studio integration must respect study/variant/document identity, existing permissions, revisioned persistence and the distinction between independent 2D drawings and linked 3D views. Axes operations do not automatically create BIM semantics, change the Parcours steps or relocate the project.

### 8.3 Collaboration and offline work

The active working frame, temporary previews and overlay preferences are personal working context by default. Another collaborator changing their frame must not rotate everyone’s drawing context. Saved document frames are shared definitions when the document’s permissions allow them.

Persistent edits use expected revisions, permission checks and the existing command journal. A concurrent rename, deletion or linked-source change must produce a resolvable conflict rather than last-write-wins loss. Offline operations retain their reference revisions and revalidate when replayed. Undo cannot silently erase another collaborator’s later changes.

A read-only user may change their personal view and temporary working context if that mode is supported, but cannot save shared frames or redefine component origins. UI disabling and server/model authorization are separate controls.

## 9 Coordinate exchange and drawing output

An imported CAD model may carry large coordinates, a different unit system or a geographic reference. Keep the source-to-model mapping explicit. A user’s temporary drawing frame must never be mistaken for a project relocation or a new geographic north.

Where an exporter supports it, expose an explicit choice of Model coordinates, Current working frame or Original source coordinates. Display the selected origin, orientation and units and retain the mapping needed for round trips. Unsupported mappings must be reported rather than approximated without notice.

Rendering near a local origin can be an implementation strategy for numerical stability, but this concept does not claim that large-coordinate precision is solved. Validate rendering, snapping, dimensions and exchange separately. A numerical rebase must preserve the authoritative model and geographic coordinates.

On a Planche 2D sheet, structural axes, dimensions, north symbols and annotations remain document content. The viewport triad is an editing aid. Export and printing must distinguish these categories so presentation preferences cannot silently remove construction information.

## 10 Accessibility and responsive behavior

Every command needs a visible name or discoverable tooltip, keyboard focus state and accessible label. Axis colours follow familiar red/green/blue conventions where appropriate, supplemented by X/Y/Z labels, line styles and direction marks. Contrast must be checked in both light and dark themes.

On narrow screens, keep the active frame and primary placement command visible, with the remaining actions in a named overflow menu. The inspector becomes a dismissible sheet that preserves the drawing context and does not cover validation/cancel controls. All modifier actions have touch equivalents.

Announce placement steps, invalid geometry and committed state changes to assistive technology without repeatedly announcing pointer movement. Numeric fields support the application’s locale and unit conventions. Escape cancels preview, Enter confirms only valid input, and focus returns to the initiating control when a panel closes.

## 11 Acceptance scenarios

These are required future checks, not tests claimed to have passed during this research. Record results against an exact implementation commit and environment. Geometry comparisons must use agreed scale-aware tolerances, while IDs and revision behavior use exact assertions.

| ID | Scenario | Expected result |
| --- | --- | --- |
| AX01 | Place a frame along a wing rotated 27 degrees. | New drawing follows local directions; existing vertices and geographic north are unchanged. |
| AX02 | Place three coincident or nearly collinear points. | Clear error; no committed frame, silent fallback or partial history entry. |
| AX03 | Move the origin numerically with explicit units. | Exact intended context is used; orientation and existing geometry remain fixed. |
| AX04 | Enter absolute and relative coordinates in a rotated frame. | Results match the displayed reference mode and locale conventions. |
| AX05 | Draw and measure on an inclined roof plane. | Inference, shapes and dimensions agree on the plane; no world-Z fallback. |
| AX06 | Toggle plane lock, normal view and axes visibility independently. | Each changes only its declared constraint or presentation state. |
| AX07 | Switch frames, use Previous, then geometry Undo. | Context history and geometry history remain distinct and predictable. |
| AX08 | Save, rename and reopen a frame after application restart. | ID, basis, name, scope and revision persist in the correct storage boundary. |
| AX09 | Open an older document with one optional frame or none. | Deterministic migration; no geometry change or lost annotations. |
| AX10 | Edit a component origin with unselected sibling instances. | Preview names affected scope; all affected world geometry stays fixed. |
| AX11 | Repeat origin editing on nested, mirrored and scaled instances. | Supported cases preserve geometry; unsupported cases fail clearly and atomically. |
| AX12 | Cancel and undo a component-origin batch. | No partial definitions, orphaned references or unintended instance changes. |
| AX13 | Edit or delete the face behind a linked frame. | Stale/missing reference is explicit; no guessed replacement attachment. |
| AX14 | Recall a scene with and without its frame option. | Camera and working context follow the documented recall settings. |
| AX15 | Two users edit the same saved frame, including offline replay. | Permissions and revision conflicts are enforced; personal contexts remain separate. |
| AX16 | Export model, working and source-coordinate variants. | Chosen units and mappings are explicit and round-trip behavior is verified. |
| AX17 | Use keyboard, touch, screen reader and a narrow viewport. | All commands and cancellation remain reachable; no colour-only state. |
| AX18 | Run equivalent tools in Sandbox and Studio/Planche. | Behavior is consistent while module boundaries and persistence scopes remain intact. |
| AX19 | Change the frame in an independent 2D drawing and a linked view. | The former stays independent; the latter follows explicit association rules only. |
| AX20 | View axes near viewport limits and at large coordinates. | Clipping, labels, overlay and picking remain coherent with the transformed frame. |

## 12 Delivery sequence

| Phase | Deliverable | Exit condition |
| --- | --- | --- |
| A Foundation | Explicit working context; compact toolbar; origin/three-point/numeric placement; plane controls; Previous and Model; validity feedback. | AX01–AX07, AX17 and relevant AX18/AX20 cases verified. Existing drawing tools consume the same context. |
| B Reuse and visibility | Saved-frame manager, migration, personal overlay preferences and optional scene recall. | AX08–AX09, AX14–AX15 pass for supported persistence and collaboration modes. |
| C Component origins | Single-component origin/orientation workflow, scope preview and compensating transforms; then bounded batch support. | AX10–AX12 pass, including nesting, shared definitions and explicit unsupported cases. |
| D Associations and exchange | Linked frames, reference health, 2D/3D association integration and explicit export mappings. | AX13, AX16 and AX19 pass against supported formats and stable source references. |

Each phase needs its own scoped implementation issue, review and evidence. The documentation pair does not authorize all phases to be implemented or accepted at once. Shared-frame collaboration must be delivered with its permission/revision behavior, not temporarily exposed as an unsafe global setting.

## 13 Proposed decisions and open design items

The following choices are recommendations for review, not numbered architecture decisions already adopted by Fadi.

| Item | Proposal or remaining decision |
| --- | --- |
| Primary experience | Approve a compact Axes et repères toolbar with a contextual inspector. |
| Model integrity | Adopt the no-geometry-motion invariant for working-frame changes. |
| Object editing | Keep component origins separate and require explicit scope plus atomic compensation. |
| Coordinate model | Keep model, working, plane, component, camera, geographic reference and structural grid distinct. |
| Storage scope | Confirm which named frames belong to each Studio document/variant and which remain personal; keep Sandbox local scope explicit. |
| Shortcuts | Assign and conflict-test every new command before release; retain the existing Shift+Y entry unless a reviewed registry change requires otherwise. |
| Geometry policy | Define tolerances and behavior for reflected/skewed transforms before component editing and inclined-plane release. |
| Associations | Confirm topology reference guarantees before enabling linked frames and linked-view updates. |
| Exchange | Specify supported coordinate systems, file formats and round-trip guarantees per exporter. |
| Acceptance | Product owner validates the interaction concept; technical review validates contracts and phase scope. Neither is implied by document creation. |

## 14 Document control and verification

This is the first Axes concept pair, version 1.0. No predecessor archive is required. Subsequent revisions must archive both previous formats together under the repository’s naming policy, keep current filenames stable and update the index. [S24]

The Markdown and Word versions are generated from the same content. Delivery checks cover substantive parity, internal version, source links, filename compliance and Word rendering. They do not constitute execution of the acceptance scenarios in section 11.

The GitHub change is documentation only. It must be reviewed through the repository workflow. It does not merge itself, deploy Fadi, alter database schemas, modify the 630-obligation Studio register or promote existing product acceptance states.

## 15 Sources and traceability

Research date: 23 October 2026. Fadi source links are pinned to the inspected commit. Official documentation is a behavioral reference; extension listing access was limited, so supplied archives and their readable documentation were used where possible. Some requested French help routes required an English equivalent.

### 15.1 Fadi sources

- [S01] Supplied `02-Studio-Le-Concept.md`, plus the supplied module-creation and design-process documents. These are design inputs, not proof of deployed behavior.
- [S02] [Fadi Sandbox axes tool](https://github.com/RachEma-ux/Fadi/blob/516e2f747c15d84f8c589e5271c015e929dc37e4/packages/sandbox-planche-model/src/outils/axes.ts).
- [S03] [Fadi Sandbox annotations model](https://github.com/RachEma-ux/Fadi/blob/516e2f747c15d84f8c589e5271c015e929dc37e4/packages/sandbox-planche-model/src/annotations.ts).
- [S04] [Fadi measurements and coordinate parser](https://github.com/RachEma-ux/Fadi/blob/516e2f747c15d84f8c589e5271c015e929dc37e4/packages/sandbox-planche-model/src/saisie-vcb.ts).
- [S05] [Fadi Sandbox command registry](https://github.com/RachEma-ux/Fadi/blob/516e2f747c15d84f8c589e5271c015e929dc37e4/packages/sandbox-planche-model/src/registre-sandbox.ts).
- [S06] [Fadi Planche rendering](https://github.com/RachEma-ux/Fadi/blob/516e2f747c15d84f8c589e5271c015e929dc37e4/apps/web/src/modules/sandbox/planche/vue-planche.ts).
- [S07] [Fadi Sandbox Planche interface](https://github.com/RachEma-ux/Fadi/blob/516e2f747c15d84f8c589e5271c015e929dc37e4/apps/web/src/modules/sandbox/planche/Planche.tsx).
- [S08] [Fadi Sandbox architecture and scope](https://github.com/RachEma-ux/Fadi/blob/516e2f747c15d84f8c589e5271c015e929dc37e4/apps/web/src/modules/sandbox/README.md).
- [S09] [Fadi shared drawing-tool helpers](https://github.com/RachEma-ux/Fadi/blob/516e2f747c15d84f8c589e5271c015e929dc37e4/packages/sandbox-planche-model/src/outils/commun-formes.ts).

### 15.2 SketchUp documentation

- [S10] [Adjusting the Drawing Axes](https://help.sketchup.com/en/sketchup/adjusting-drawing-axes).
- [S11] [Component Axes](https://help.sketchup.com/fr/sketchup/component-axes).
- [S12] [Axes and Origin Points](https://help.sketchup.com/fr/3d-warehouse/axes-and-origin-points).
- [S13] [Troubleshooting Exporting and Importing CAD Files](https://help.sketchup.com/en/troubleshooting-exporting-importing-cad-files), English equivalent of the requested French route.
- [S14] [Styles in SketchUp for Web](https://help.sketchup.com/fr/styles-sketchup-web).
- [S15] [Offsetting a Line from Existing Geometry](https://help.sketchup.com/en/sketchup/offsetting-line-existing-geometry), English equivalent of the requested French route.
- [S16] [Introducing Drawing Basics and Concepts](https://help.sketchup.com/en/sketchup/introducing-drawing-basics-and-concepts).
- [S17] [Importing and Exporting CAD Files](https://help.sketchup.com/en/sketchup/importing-and-exporting-cad-files).
- [S18] [Creating Scenes](https://help.sketchup.com/en/sketchup/creating-scenes).
- [S19] [SketchUp Ruby API Axes reference](https://ruby.sketchup.com/Sketchup/Axes.html).

### 15.3 Extension and governance references

- [S20] [Axes Tools listing](https://extensions.sketchup.com/extension/446870d8-0755-4d0b-963d-7219ef236c7a/axes-tools) and [author repository](https://github.com/thomthom/axes-tools).
- [S21] [Axes Manager listing](https://extensions.sketchup.com/extension/13e533c2-ebf7-4d86-805f-59dd2254564b/axes-manager), supplemented by the PDF manual inside the supplied archive.
- [S22] [Eneroth Axes Overlay listing](https://extensions.sketchup.com/extension/32a34a22-c4c9-4aad-8420-1e4b78f25442/eneroth-axes-overlay), supplemented by the readable extension registration file.
- [S23] [Fadi repository rules](https://github.com/RachEma-ux/Fadi/blob/516e2f747c15d84f8c589e5271c015e929dc37e4/AGENTS.md) and [continuity protocol](https://github.com/RachEma-ux/Fadi/blob/516e2f747c15d84f8c589e5271c015e929dc37e4/docs/continuity/README.md).
- [S24] [Fadi Concept document management policy](https://github.com/RachEma-ux/Fadi/blob/516e2f747c15d84f8c589e5271c015e929dc37e4/Fadi%20Concept/README.md).

### 15.4 Supplied archive identification

- [A01] `tt_axes-1.4.0.rbz`. Readable main Ruby source; helper dependency not bundled. SHA-256: `a01adc10ff095b0cf28334988d61488a67e6380552831e1e7646fe327bac5e80`.
- [A02] `DBUR_AxesManager v2.0.0.rbz`. Included six-page PDF manual inspected; main Ruby implementation encrypted. SHA-256: `3803d94c37c60745f98937fb28d372652ec369b377edc5433e70b3251e3420d2`.
- [A03] `ene_axes_overlay_v1.0.0.rbz`. Registration metadata readable; main Ruby implementation encrypted. SHA-256: `8644d7a7f2b6314e9668f8937fca1cf2e33068fb51e0c9c93cb7ef15f64562e4`.

Archive inspection supports the limited claims recorded above. It is not a runtime compatibility test, a full security audit or permission to reuse extension code. Any code reuse would require a separate dependency and licence review.
