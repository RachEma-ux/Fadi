# Design Historique — Fadi

**Date:** 12 October 2026 (`2026-10-12`)

**Reference time zone:** Europe/Zurich — CEST (UTC+02:00 on this date)

**Decision status:** all three design tasks explicitly validated by the user.

**Implementation status at creation of this record:** implementation in the Fadi application authorized and in progress.

**Repository:** [RachEma-ux/Fadi](https://github.com/RachEma-ux/Fadi)

**Archived interactive reference:** [Fadi-Accueil-Selecteur-Projets.html](./Fadi-Accueil-Selecteur-Projets.html)

This document records the agreed design, the evolution of the local prototype and the evidence available before implementation in Fadi. The latest explicit validation of all three tasks was recorded in the conversation at approximately **23:21 CEST on 12 October 2026**. Earlier exchanges are documented in their design sequence; exact timestamps are not reconstructed.

## 1. What is approved, demonstrated and still being implemented

The user has approved the complete design of **Tâche 1 — Dossier explicitement choisi**, **Tâche 2 — États fiables** and **Tâche 3 — Action utile avant l’aperçu**, and has instructed the work to proceed into Fadi. The earlier practice of preparing, adjusting and validating each task has therefore reached its implementation handoff.

The archived HTML is the existing, unchanged reference for Tasks 1 and 2. **It does not yet implement the newly approved Task 3 action area or its full Parcours destination.** Its current “Poursuivre le Parcours” control remains in the overview card footer and opens a demonstration dialog for one step. That behavior must not be mistaken for the approved final requirement. Fadi implementation must put the contextual primary action before the preview and open the complete Parcours with the appropriate step selected.

| Item | Status at this handoff |
|---|---|
| Tasks 1 and 2 design | Explicitly approved; represented in the archived prototype. |
| Task 3 design | Explicitly approved; specified in Section 7 of this document. |
| Existing HTML | Preserved as the examined reference, without a Task 3 retrofit. |
| Prototype verification | 135 state, routing, callback and generated-markup checks passed. |
| Fadi application changes | Authorized; in progress. Actual changes and verification belong in Section 12. |
| Browser rendering and assistive technology verification | Not established by the 135 programmatic checks; must be recorded separately when performed. |

### Archived reference identity

| Property | Value |
|---|---|
| File in the repository | `Design/Fadi-Accueil-Selecteur-Projets.html` |
| Reference artifact revision | 11 |
| File size | **346,134 bytes** |
| SHA-256 | `cbb5956a4211a61d1333d12bfbfafc9d61953aa07c660d991599edea79c4db39` |
| Format | Self-contained HTML with inline styles, scripts, fictional fixtures and illustrations. |
| Data and responses | Simulated; no real project edits, server acknowledgements or authentication are demonstrated by this file. |

The hash identifies the exact HTML covered by this record. Its neighboring Markdown file is a design and implementation record, not a claim that the reference HTML already contains every approved requirement.

## 2. Product brief and scope

Fadi is a modular web platform for architectural programming, design and real-estate decision support. Its central object is an evolving project dossier connecting the site, requirements, programme, drawings, analyses, decisions and documents. The Parcours structures this work into 21 steps. These principles come from the user-provided **Définition de produit — Fadi**.

The purpose of this design work is to help a returning user identify the correct dossier, understand what is known about its current state and perform the next useful action. A project name, a progress counter and an attractive preview are insufficient if their scope, freshness or next destination is ambiguous.

The work covers the application Home, the dedicated project Home, navigation between them, project selection and remembrance, scoped search, history, the shared overview card, reliable states and recovery, and the contextual action preceding the preview. The implementation target is the [Fadi repository](https://github.com/RachEma-ux/Fadi). Changes to unrelated architectural drawing or CAD features are outside this design record.

The working process used three conversation tasks as the thread of the review. They were not requests to create external issue-tracker tickets. Each task received a concrete proposal, revisions following user feedback and explicit validation before progression.

## 3. Consolidated evolution of the prototype

The following sequence preserves the changes discussed and reviewed during this design work. It records design evolution rather than inventing an exact timestamp for each edit.

| Stage | Request or finding | Decision and resulting reference behavior |
|---|---|---|
| Product framing | Improve the actual Fadi experience using the five installed design skills. | Frame the work around dossier selection, trustworthy states and a useful next action. |
| Three tasks | Keep the design tasks as the conversation’s working thread. | Prepare and validate them one by one before implementation. |
| Project selection | Use the vertical “Projets” menu as the dossier selector. | Selecting a project explicitly determines the dossier context. Three fictional projects make this testable. |
| Two distinct homes | Selecting a project should open its own Home, while updating the application Home in the background. | Separate application and project destinations; stop leaving “Accueil” active while a project page is displayed. |
| Persistent navigation | Retain the vertical bar on desktop and mobile, collapsed by default. | A visible icon rail expands or collapses horizontally. Its project flyout is a separate interaction. |
| Menu hierarchy | “Collaboration” must not be nested beneath “Projets”; an inline project list is unsuitable. | Keep global items at the same level and open project items in a conventional submenu to the right. |
| Trustworthy states | Loading, empty, failed, cached and conflicting data must have distinct meanings. | Add per-dossier states, local simulation controls and explicit recovery actions. |
| Header refinement | Move project identity to the top bar and scope search to the open project. | Display the project code and name above its type and location. Replace the permanently visible search field with a magnifying-glass launcher. |
| Shared visual language | Format the top bar like the vertical navigation. | Use a consistent dark treatment and typography; remove redundant body labels. |
| Review control | Replace the earlier blue control with “État du Dossier”. | Keep the same scenario form and explain that the tool simulates data, errors, rights and server responses. |
| Dossier traceability | The dossier did not expose a useful modification history. | Add “H” beside search, a four-column filterable journal, event details and links to affected content. |
| Application context | The application Home needs its own header search, journal and state controls. | Provide platform-level search and history, distinguish their scope from dossier controls, and isolate their resets and requests. |
| Shared overview | The last dossier on application Home should show the same “Vue d’ensemble” card as project Home. | Replace the earlier compact summary with the complete shared overview, keeping identity above it and excluding the rest of the project dashboard. |
| Final Task 2 refinements | Important conditions could coexist, and one date could imply excessive freshness. | Show simultaneous dossier-coded notices on application Home; track successful reads per resource; preserve cached dates after reconnecting; clarify the reference-programme footer. |
| Task 3 approval | A useful action must precede the preview and reach the correct workspace. | Approve the policy and placement in Section 7, including a real complete Parcours destination. The archived HTML still has the previous footer/dialog behavior. |
| Implementation authorization | All three design tasks are now accepted. | Archive the reference and this record under `Design/`, then implement the validated behavior in Fadi. |

## 4. Task 1 — “Dossier explicitement choisi”

### 4.1 Two homes with different purposes

| Page | Purpose | Main content |
|---|---|---|
| **Accueil de l’application** | Welcome the user to Fadi and provide an overview of the workspace. | General welcome in the top bar, application entry points, platform search and history, and the last consulted dossier’s identity, notices and shared “Vue d’ensemble” card. |
| **Accueil du projet** | Provide the entry point to one specific project dossier. | Project identity, its overview, progress, relevant notices, documents, Parcours and access to its modules. |

The early idea of a compact last-dossier presentation was subsequently refined: the final Task 2 prototype reuses the **full overview card** on application Home. It does not duplicate the entire project dashboard, journey, module grid or document list there. The same dossier data and card presentation are used in both places. See the [archived reference](./Fadi-Accueil-Selecteur-Projets.html).

Selecting a project opens its dedicated Home and records that visit. Returning through “Accueil” shows the application Home, including the last consulted dossier. The application greeting and general entry points do not become part of the project page. A global page does not acquire an implicit editable project merely because a recent dossier exists.

### 4.2 Navigation and explicit selection

The vertical navigation contains **Accueil**, **Projets**, **Collaboration**, **Bibliothèque** and **Paramètres**, followed by a separation and the **Rochdoch** account entry. “Collaboration” is a sibling of “Projets”.

The bar remains visible on desktop and mobile. It begins as a collapsed rail and expands toward the right. Expanding the bar and opening the project submenu are independent actions. “Projets” opens a submenu to the right with projects as native navigation items. The selected/current marker describes the displayed destination, so application “Accueil” is not marked current on a dedicated project page. The small house icon is the application Home shortcut.

The reference provides three fictional dossiers:

| Project | Demonstration identity | Known sequential fixture progress | Task 3 fixture continuation |
|---|---|---:|---:|
| P.101 | Résidence des Tilleuls | 8 of 21 steps complete | 09 — Compatibilité Parcelle ↔ Programme |
| P.202 | Atelier des Quais | 12 of 21 steps complete | 13 — Faisabilité technique |
| P.303 | Maison des Cèdres | 3 of 21 steps complete | 04 — Idée & stratégie |

These are examples for comparison and state testing. Production selection must use the user’s actual accessible projects. The fixture step numbers are not a general algorithm for determining continuation in nonsequential real work.

### 4.3 Identity, correspondence and remembrance

The project top bar shows its code and full title, for example **“P.303 — Maison des Cèdres”**, with **“Équipement de quartier · Nyon”** immediately beneath. Redundant “Accueil du projet” and “Dossier” body labels were removed. The top bar shares the navigation bar’s visual treatment.

Every dossier-specific information block, module action, recovery control, history entry and search result carries the same explicit project scope. The last-dossier overview on application Home passes its dossier explicitly to its actions; it does not depend on a hidden globally selected project.

The reference preserves these rules:

- The first visit without a previous choice shows “Aucun dossier consulté”; no project is silently selected.
- A deliberate project visit updates the last consulted dossier. Opening a search control or viewing platform history does not.
- Reloading a dedicated project retains its URL and dossier. Returning to application Home displays the last consulted dossier.
- A project tab remains on its own dossier when another tab visits a different one. The application Home can reflect the newer last consultation without switching an open project page.
- Missing, removed or inaccessible project identifiers receive an explicit unavailable state. Another dossier is never substituted to conceal the failure.
- Storage restrictions retain the available in-session context without claiming that it has been saved durably.

The reference’s hash routes demonstrate these distinctions; Fadi must map them to its actual router and project identifiers:

| Reference destination | Prototype URL example |
|---|---|
| Application Home | `#accueil` |
| Dedicated project Home | `#projet?projet=cedres` |
| Dossier history | `#projet?projet=cedres&vue=historique` |
| Platform history | `#accueil?vue=historique` |

### 4.4 Scoped search

The project magnifying glass has the tooltip and accessible name **“Rechercher dans ce projet”**. It expands a search field for the current dossier’s available steps, modules, programme and documents. Search does not reach into another dossier, and partial availability is disclosed.

On application Home, the equivalent control is **“Rechercher un projet”**. Results open explicit project destinations. Typing, filtering or opening search does not change the last dossier until the user actually selects a result. The reference supports accent-insensitive text matching and escapes entered text in its generated markup.

## 5. Task 2 — “États fiables”

### 5.1 Three independent kinds of information

| Indicator | Meaning | What it must not imply |
|---|---|---|
| **Avancement du Parcours** | Known completed steps and the state of work within the 21-step process. | Technical approval, saved changes or a successful synchronization. |
| **Revue technique** | Recorded documentary review, current calculated observations and choices requiring examination. | Human approval, automatic removal of concerns or completion of the Parcours. |
| **Synchronisation** | Connection, confirmed local saving, pending changes, accepted transmission and conflicts. | Freshness of every displayed resource or technical validation of the dossier. |

Updating a review retains its concerns and decisions requiring re-examination unless a separate supported action actually resolves them. An accepted synchronization does not complete a step or make the dossier technically approved.

### 5.2 State presentation

Each resource has its own state. Failure to read the Parcours must not remove a preview or documents that are already available for the same dossier.

| Situation | Required presentation | Available response |
|---|---|---|
| Initial loading | Explicit loading text and placeholders; no fabricated zero, empty document list or invented next step. | Wait for the current attempt; a failed attempt must become an actionable error. |
| Successfully loaded empty dossier | State what is actually absent. A confirmed zero completed steps is legitimate; an absent model or programme is described as such. | Enter the relevant work area or start the Parcours when its state is known. |
| Failed resource reading | Identify the unavailable resource; preserve independent available content. | Retry that reading, after reconnecting if required. |
| Refresh in progress with a copy | Keep the previous content visible and label the ongoing refresh. | Wait for the attempt without replacing the content with fictitious freshness. |
| Refresh failed with a copy | Retain the content and previous successful-read date; say that the refresh failed. | Retry the same resource. |
| Offline with a copy | Keep readable cached information, its dates, pending work and conflicts visible. | Restore connection where necessary; then refresh resources separately. |
| Offline without a copy | Preserve dossier identity, but withhold unavailable dossier content. | Restore connection and complete the first successful read. |
| Local saving unconfirmed | **“Enregistrement non confirmé”**; the current input remains in the page, and durable saving is not claimed. | **“Réessayer la sauvegarde”**, when actual permissions allow it. |
| Conflicting modification | Show the server value, retained local value and reason for the conflict. | Compare; explicitly reapply the retained input or keep the server version. |
| Read-only dossier | Keep authorized consultation available and explain unavailable writing. | Consult, view sharing information or follow the authorized access route. |
| Reserved editing | Explain that editing is reserved while preserving consultation. | Refresh actual availability; the prototype reservation is fictional. |
| Expired session | Explain the expired session without silently selecting another dossier. | Reconnect to the same intended dossier. |
| Missing or inaccessible dossier | State the limited known fact: unavailable with the current context/account. | Return to projects; preserve the last chosen identity. |
| Reference programme | Clearly qualify illustrative surfaces as unregistered reference values. | The card footer reads **“Programme de référence · Non enregistré”**. |
| Uncomputable review | Explain the missing model/data; do not convert missing checks into zero concerns. | Supply or recover the necessary input. |

The overview footer follows the actual programme state: **“Chargement du programme…”** during loading, **“Programme à renseigner”** for confirmed empty content, and **“Programme indisponible”** for failed/unavailable reading. Loading must not simultaneously be described as failure.

### 5.3 Per-resource freshness

The reference now maintains a last successful read for **Parcours progress, technical review, preview, programme, documents and site/parcel** independently. The “Dates des informations” disclosure in “Vue d’ensemble” exposes the parcel, programme and progress readings with their own state and recovery actions.

A successful refresh changes only the resource actually read. Failed or interrupted attempts retain the previous confirmed timestamp. A resource without a confirmed read displays **“Aucune date de lecture réussie confirmée.”** rather than inheriting another resource’s date.

The preview’s generation date is distinct from its last successful reading. The recorded review date is distinct from the review resource’s reading. Journal reading dates and synchronization acknowledgements also retain their own meaning. In particular, restoring connection or sending saved changes does **not** freshen an existing cached preview, programme or progress reading. Those resources remain identified as cached until independently refreshed.

The reference uses explicitly marked example/simulation times. Its deterministic timestamps support repeatable demonstrations; they are not evidence of real server readings.

### 5.4 Simultaneous notices on application Home

The recent dossier’s identity is followed by conditional notices, before its shared overview. Every notice title includes the dossier code. A failed local save, an unresolved conflict, a connection problem, unavailable progress, an old review and read-only access can be shown together.

A single overall status must not conceal the other conditions. Recovering one condition removes or updates only that condition. For example, saving locally does not resolve a conflict; reconnecting does not repair failed progress reading; refreshing progress does not approve an old review.

Recovery actions remain scoped to the displayed recent dossier. **“Comparer les versions”** from application Home opens that dossier’s project Home and moves focus and the viewport to the conflict comparison heading. Review and sharing actions open information for that same dossier. The overview stays available when its underlying resources remain readable.

### 5.5 Recovery and accepted-change rules

Every asynchronous operation belongs to one dossier and one attempt. Busy controls prevent duplicate submission. Obsolete, duplicate and wrong-dossier completions do not alter current state. Reloading an unfinished operation does not manufacture success; it retains recoverable state and any previous copy.

Connection recovery acknowledges pending changes only when their local saving is confirmed and current write permission allows the operation. Otherwise the pending count and conflict are retained. No pending changes means no invented successful batch. A write or save operation cannot refresh an unrelated resource merely because a resource identifier was supplied.

Conflict failure retains the edited input, server value and unresolved condition. Keeping the server version is an explicit choice that abandons that attempted local value; unrelated pending changes remain. Reapplying the user’s value becomes accepted only after a successful permitted response.

### 5.6 Review controls and simulation boundary

On a project page, **“État du Dossier”** opens the existing review form. Its requested explanatory tooltip is:

> Outil de revue de la maquette : les données, les erreurs, les droits et les réponses du serveur sont simulés. Choisissez un état, essayez sa reprise, puis comparez l’accueil du projet et celui de Fadi.

On application Home, **“État de la plateforme”** controls the project list and platform journal. It does not reset dossier states or the last consultation. Dossier simulation controls are unavailable in an application-only context. A recovery launched from the last dossier’s Home card still uses that dossier’s selected simulated outcome, not the platform outcome.

These controls exist to review the local prototype. Production behavior must be connected to real data, permissions and responses; fictional scenario selectors and invented audit receipts are not evidence of working production services.

## 6. Traceability: dossier and platform history

### 6.1 Dossier history

An **H** control beside the project search icon has the tooltip **“Historique du Dossier”**. It opens a dedicated journal of the selected dossier. Four semantic columns expose **Date et heure**, **Auteur**, **Domaine** and **Modification enregistrée**, with filtering in each column.

The date column provides inclusive from/to filters in Europe/Zurich time. Author and domain filter the corresponding fields; text filters the recorded change. Filters combine with AND semantics. Reversed date ranges produce an explicit validation error. An empty result after filtering is distinguished from a successfully read empty journal and from a failed journal read.

The requested P.303 examples are preserved as fictional records:

| Date and time — 12 October 2026, CEST | Author | Domaine | Modification enregistrée |
|---|---|---|---|
| 19:05 | Roch Doch | Programme | Surface cible modifiée : 980 → 1 040 m² |
| 18:50 | Camille | Documents | Plan du RDC — V3 ajouté |
| 18:20 | Roch Doch | Décisions | Une entrée indépendante pour l’atelier a été retenue |

These times are example event values, separate from the time of the user’s design approval. Event details expose recorded before/after values and reasons when known. Missing earlier values remain unknown. Affected-content links stay within the event’s dossier and explain unavailable targets instead of borrowing another dossier’s content.

The accepted target for the P.303 example is **1,040 m²**, while its illustrated programme allocation remains **980 m²**. The remaining **60 m²** must be allocated explicitly; a target change does not silently rewrite the programme distribution.

The reference records accepted simulated synchronization changes, successful conflict reapplication and successful documentary review. Failed writes, mere reading and local saving are not presented as accepted shared changes. Duplicate completion does not duplicate history. Keeping the server version updates the shown target without inventing a newly accepted modification.

Loading, error, empty, cached and partially available journal scenarios have distinct messages. Partial coverage is disclosed. An empty demonstration hides earlier examples but permits subsequently accepted events to appear; it does not reveal old seed events simply because a later event is accepted. Filters, accepted events and current targets survive reload within the simulated persistence model.

The example journal discloses coverage beginning on 1 October 2026 for the represented domains. It does not claim complete coverage of earlier changes or every module. An event is a recorded change, not a restorable snapshot of the entire dossier; no version-restore capability is implied. Production coverage and retention must describe the real history service.

### 6.2 Platform history

The application’s **H** control is **“Historique de la plateforme”**. Its columns are **Date et heure**, **Auteur**, **Dossier** and **Événement**, with date, author, dossier and event-type filters.

This journal tracks project creation examples and accepted synchronization batches at workspace level. One successful accepted batch produces one receipt for its dossier. Failed attempts, duplicate responses, local saving, reads, review changes and direct conflict reapplication do not become platform synchronization receipts.

Opening platform history does not select a dossier. Its event links explicitly open the referenced project or dossier history. Platform reset preserves dossier state, dossier journals and last consultation. Project-list requests and journal requests have independent state and response tokens, so an old list response cannot overwrite a newer scenario or reset. Refreshing a list also cannot clear a journal error notice.

On small screens the journals retain their four-column relationship in a horizontally scrollable region. Redraws preserve the journal’s horizontal position and return focus to a meaningful remaining control or heading when necessary. These callback behaviors were checked programmatically; actual mobile rendering remains a separate verification activity.

## 7. Task 3 — “Action utile avant l’aperçu”

**Status: approved design, awaiting implementation in Fadi at the creation of this record.** The following requirement takes precedence over the archived HTML’s footer-based step dialog.

### 7.1 Placement and composition

Use one compact contextual action area **inside the shared “Vue d’ensemble” card, after its title and description and before the preview**. Application Home and project Home use the same component and policy, passing the dossier explicitly.

On desktop, explanatory text is on the left and the primary control on the right. On mobile, preserve the same source order: text, a full-width primary control with a target at least **44 CSS pixels high**, then the preview. There is one primary action in the card. The existing Atelier entry may remain a secondary action in the footer.

A loading or busy action keeps its place and understandable state. No automatic click, route change, step completion or silent replacement of the user’s chosen work follows from merely displaying the card.

### 7.2 Action policy

Determine the action from actual access, necessary recovery and identified work. A visually prominent warning does not automatically become the primary task. Conditions that genuinely prevent continuation take priority; information that remains safely consultable should remain useful.

| Actual situation | Primary presentation/action | Destination or confirmed result |
|---|---|---|
| Expired session | **Se reconnecter** | Re-establish the session and retain the intended dossier. |
| Missing or inaccessible dossier | **Retour aux projets** | Open the project list without substituting another dossier. |
| Dossier unreadable and no local copy | **Rétablir la connexion** | Obtain a successful first read before presenting unavailable content. |
| Local saving unconfirmed, with permission to save | **Réessayer la sauvegarde** | Confirm local saving; retain the input on failure. If not permitted, explain the restriction. |
| Connection is a prerequisite to resolving a conflict | **Rétablir la connexion** | Confirm recovery before offering the next required resolution action. |
| Unresolved conflict, with necessary access available | **Comparer les versions** | Open the actual dossier comparison; retain both versions until explicit resolution. |
| Progress loading | Clear waiting state; no invented step or usable continuation target | Continue only after a successful reading establishes the next work. |
| Progress read failed | **Réessayer l’avancement** | Recover that resource without claiming unrelated data is current. |
| Explicit current work is the programme | **Ouvrir le programme** | Open the current dossier’s programme. |
| Explicit current work is the Atelier | **Ouvrir l’Atelier** | Open the current dossier’s Atelier. |
| Explicit current work/prerequisite is review | **Consulter la revue** | Open the applicable review. A stale-review warning alone is insufficient to choose this action. |
| Confirmed new/empty Parcours | **Commencer le Parcours** | Open the full 21-step Parcours with step 01 selected. |
| Known work in progress | **Poursuivre le Parcours**, with the exact known step identified nearby | Open the full 21-step Parcours with the appropriate step selected. |
| All 21 steps complete | **Consulter le Parcours** | Open the full Parcours for consultation. |

Read-only or reserved editing does not prohibit authorized consultation of the Parcours, programme, Atelier or review. Filter any writing or recovery action by real permission and explain its unavailability. The action area must not promise an operation the current user cannot perform.

An old preview copy, an old recorded review or locally saved changes waiting for transmission may remain nonblocking. Keep the relevant notices and preserve the useful primary work action when its prerequisites are satisfied.

For the combined condition **failed local saving + offline connection + unresolved conflict**, the approved sequence is: **confirm local saving → confirm connection recovery → compare the versions → explicitly resolve the conflict → resume known work**. Each stage depends on its real outcome. A failed stage preserves the remaining conditions; reconnecting alone does not resolve the conflict.

### 7.3 A real complete Parcours destination

“Poursuivre le Parcours” must open the actual **Parcours page containing all 21 steps**, with the known relevant step selected or brought into view. A single-step modal is not completion of this requirement. For the sequential demonstration fixtures the expected selections are P.101 → **09**, P.202 → **13** and P.303 → **04**.

Production continuation must use actual step state, sequencing and identified current work. Do not generalize the fixture’s `completed count + 1` shortcut to projects whose steps are completed nonsequentially. Opening a step is consultation/navigation; it does not mark that step complete or trigger synchronization.

The application must retain dossier scope when entering the Parcours from either Home and when returning. Known progress, review, saving and permission state remain independent throughout this navigation.

## 8. Design system, responsiveness and accessibility

The requested design workflow follows the five installed skills in this order:

| Order | Skill | Responsibility in this work |
|---:|---|---|
| 1 | `get-context` | Product brief, user need, dossier model, scope, decisions and acceptance criteria. |
| 2 | `frontend-app-builder` | Interactive structure, two-home routing, prototype behavior and implementation mapping. |
| 3 | `design-system` | Shared top bar/sidebar language, typography, spacing, panels, controls and status presentation. |
| 4 | `responsive-accessibility` | Persistent navigation on both screen sizes, source order, focus, accessible controls and table behavior. |
| 5 | `visual-qa-testing` | Review against the agreed design and truthful reporting of which verification has actually been performed. |

The shared overview is a reusable component, not two independently maintained copies. Its values, action scope, visual dimensions and reference labels must remain consistent between Homes. The top bar and navigation use coherent colors and typography. Status meaning is conveyed in text as well as visual treatment.

Use native links for destinations, buttons for operations, programmatically named icon controls, labeled filters, visible focus and meaningful headings. Search and history tooltips do not replace accessible names. Menu dismissal must leave a useful focus destination. A focused project-menu item must not disappear on asynchronous list replacement without focus returning to the menu trigger.

The vertical rail remains visible on small screens. Expanded navigation and the project flyout must fit the viewport. History may scroll horizontally within its identified region; the main page should remain usable. Task 3 preserves the text/action/preview order in both layouts.

These are agreed requirements and behaviors represented in the reference. Passing generated-markup and callback tests is not a claim of complete accessibility or visual conformance.

### Technical capabilities for implementation

The implementation requires repository/source inspection; component and router integration; project-scoped state and persistence; asynchronous request/error handling; real permission checks; accepted-event/history integration; and targeted regression, accessibility and browser verification. The existing Fadi framework, data services and test tools should determine the concrete implementation.

Relevant installed technical skill capabilities include `frontend-development`, `architecture-and-design-patterns`, `backend-and-apis`, `testing`, `code-review-and-refactor`, and `git-and-version-control`, alongside the five design skills above. This is a capability mapping for the work, not a claim that every skill has been invoked or that a new framework/service is required. Actual technical choices must be recorded with the implementation evidence below.

## 9. Verification performed on the archived reference

The final reference passed **135 focused programmatic checks**:

| Suite | Checks passed | Principal coverage |
|---|---:|---|
| `check-prototype.cjs` | 34 | Dossier selection, route independence, last consultation, reload/cross-tab rules, native links, rail and submenu callbacks. |
| `task2-checks.cjs` | 33 | Declared states, recovery, pending writes, conflicts, review, persistence, loading/empty/error markup and scoped Home actions. |
| `history-checks.cjs` | 27 | Dossier journal routing, filters, accepted events, failures, details, affected content, isolation and focus/scroll callbacks. |
| `platform-checks.cjs` | 28 | Platform routes, search, journal/list independence, receipts, filters, reset scope and asynchronous race protection. |
| `task2-reliability-checks.cjs` | 13 | Independent read dates, cached-state preservation, simultaneous Home notices, recovery chains, reference qualification and unknown data. |
| **Total** | **135** | **All passed on the reference identified in Section 1.** |

The checks execute application code and registered callbacks with a VM and minimal DOM stubs. They inspect generated markup and state. They do **not** run a real browser, measure CSS layout, use a physical keyboard, exercise a screen reader or connect to real server services. The conflict focus/scroll checks establish that the callbacks are invoked with the intended target; they do not establish the rendered viewport result.

Two test expectations were updated to reflect intentional copy changes: the generic cache wording became **“Aperçu · Copie en cache”**, and Home’s failed-saving notice was checked through **“Enregistrement non confirmé”**, its durable-saving explanation and recovery action. The DOM stub gained `scrollIntoView` for the new comparison behavior. These were test/harness adjustments, not suppressed application failures.

The Task 3 action policy, placement and full Parcours destination require implementation-specific tests. They are approved requirements, not features proven by the archived reference’s 135 checks.

## 10. Acceptance matrix

“Prototype checked” below means the state/callback/generated-markup evidence described in Section 9. All rows are approved design requirements. Fadi status is deliberately left pending verification until actual implementation evidence is entered in Section 12.

| ID | Acceptance requirement | Archived prototype | Fadi implementation evidence |
|---|---|---|---|
| T1-01 | Choose a dossier explicitly through the right-opening “Projets” submenu. | Represented; selection and menu callbacks checked. | Pending. |
| T1-02 | Project selection opens its dedicated Home; application Home stays a separate destination. | Represented and checked. | Pending. |
| T1-03 | Project code/name and all actions correspond to the same dossier. | Represented and checked, including recent-dossier actions. | Pending. |
| T1-04 | Return/reload preserve the intended dossier and last consultation without silent substitution. | Represented; storage, cross-tab and invalid-ID cases checked. | Pending. |
| T1-05 | Keep the collapsed vertical rail on desktop/mobile; global menu items retain their hierarchy. | Markup and interaction logic checked; browser layout not established. | Pending. |
| T1-06 | Application and project search have explicit distinct scope. | Represented; search/selection behavior checked. | Pending. |
| T2-01 | Loading, confirmed empty and errors do not fabricate counters or content. | Represented and checked, including programme footer wording. | Pending. |
| T2-02 | Progress, review and synchronization express independent facts. | Represented and checked. | Pending. |
| T2-03 | Preserve available content and input during partial failure, cache refresh and failed saving. | Represented and checked. | Pending. |
| T2-04 | Reconnect/sync do not freshen cached resources; successful-read dates are independent. | Represented; resource, reload and migration cases checked. | Pending. |
| T2-05 | Home presents simultaneous scoped notices; each recovery changes only its own condition. | Represented and checked. | Pending. |
| T2-06 | Comparison from Home opens and targets the correct dossier’s unresolved conflict. | Routing and focus/scroll calls checked. | Pending. |
| T2-07 | Respect read-only, reservation, session and inaccessible-dossier conditions. | Simulated states and callbacks checked. | Real access integration pending. |
| T2-08 | Dossier/platform histories distinguish accepted changes, partial coverage, empty results and errors. | Simulated events, filters, isolation and races checked. | Real history integration pending. |
| T2-09 | Reference programme and unknown dates remain explicitly qualified on both Homes. | Represented and checked. | Pending. |
| T3-01 | Place one shared contextual primary action inside the overview before the preview. | **Not yet implemented; old footer controls remain.** | Required now; pending verification. |
| T3-02 | Choose the useful action from actual blockers, access and identified work. | **Approved policy; current HTML does not implement the complete policy.** | Required now; pending verification. |
| T3-03 | Open the full 21-step Parcours with the correct known step selected. | **Not yet implemented; current control opens a step dialog.** | Required now; pending verification. |
| T3-04 | New/complete/read-only cases use start/consultation actions appropriately. | Full Task 3 behavior not yet implemented. | Required now; pending verification. |
| T3-05 | Handle combined save/connection/conflict blockers by confirmed successive outcomes. | Underlying Task 2 recovery behavior checked; contextual action progression pending. | Required now; pending verification. |
| T3-06 | Preserve text/action/preview order, full-width mobile action and stable busy placement. | Task 3 layout not yet present. | Browser and interaction verification required. |

## 11. Sources and reading this record

- **User decisions:** the Fadi design conversation of 12 October 2026, including explicit validation of all three tasks and authorization to implement them. No public permalink or exact timestamp for earlier individual decisions is asserted.
- **Product source:** user-provided *Définition de produit — Fadi*, defining the evolving dossier, connected modules and 21-step Parcours.
- **Process source:** user-provided *Méthodologie du processus de design dans ChatGPT*, emphasizing concrete reviewable outcomes, explicit decisions and separation of observed facts from proposed or unverified behavior.
- **Interactive/source reference:** [Fadi-Accueil-Selecteur-Projets.html](./Fadi-Accueil-Selecteur-Projets.html), the exact archived file identified by size and hash in Section 1. Its embedded JavaScript, styles and fixtures support the statements about current prototype behavior.
- **Implementation target:** [RachEma-ux/Fadi on GitHub](https://github.com/RachEma-ux/Fadi). Actual implementation files, revision and tests are to be recorded below after the work is performed.
- **Verification evidence:** the five named local regression suites and their successful executions summarized in Section 9. Their 135 checks concern the reference; no result is transferred automatically to production code.

The fictional journal events are design fixtures. This document’s design decisions are user-approved requirements. Real repository changes and their tests are a third category, recorded next so that these kinds of evidence remain distinguishable.

## 12. Fadi implementation log — implementation written, CI pending

**Authorized scope:** implement the validated Tasks 1, 2 and 3 in Fadi and archive the unchanged reference HTML together with this design record. Sections 1–11 preserve the design handoff and its prototype evidence; this section records the subsequent application work. The earlier acceptance matrix is not a claim that browser verification has since passed.

**Current checkpoint:** the React implementation, data integration, translations and CI recipes have been written in the repository. Local checks have produced the results below. Full CI, database-backed integration, rendered behavior and accessibility verification remain pending. No completed commit, pull request, deployment or production migration is asserted by this checkpoint.

### 12.1 Repository and archived reference

| Item | Recorded value |
|---|---|
| Repository | [RachEma-ux/Fadi](https://github.com/RachEma-ux/Fadi) |
| Working branch | `feat/home-design-2026-10-12` |
| Base revision | `54c9af4436fe9dc792ffa3acd3dc95173e4883b9` |
| Application change revision | Working-tree changes at this checkpoint; the implementation commit is to be recorded after it exists. |
| Design record, actual repository path | `Design/Design Historique.md` |
| Archived HTML | `Design/Fadi-Accueil-Selecteur-Projets.html` — reference revision 11 |
| Verified HTML size | **346,134 bytes** |
| Verified HTML SHA-256 | `cbb5956a4211a61d1333d12bfbfafc9d61953aa07c660d991599edea79c4db39` |

The archived HTML remains byte-identical to the approved Tasks 1/2 reference. **Task 3 was implemented in the React application from the approved prose; the archived HTML was not retrofitted.** Its former footer control and single-step demonstration dialog remain in that historical file. The React overview instead contains the primary action before the preview, with links to the actual Parcours routes.

### 12.2 Implemented structure and navigation

| Area | Files and implemented behavior |
|---|---|
| Application routing and shell | [App.tsx](../apps/web/src/App.tsx), [AppShell.tsx](../apps/web/src/routes/AppShell.tsx), [ProjectShell.tsx](../apps/web/src/routes/ProjectShell.tsx), [CollaborationPage.tsx](../apps/web/src/routes/CollaborationPage.tsx) and [workspace-navigation.ts](../apps/web/src/lib/workspace-navigation.ts). `/accueil` is the application Home. `/projets/:projectId` without a module opens that project's dedicated Home. Existing module and step destinations remain explicit URL state. |
| Vertical navigation | `AppShell.tsx` implements a rail collapsed by default, an expand/collapse control, an independent “Collaboration” entry and the “Projets” flyout to the right. Project items are native links. Keyboard movement, Escape, focus return and small-screen positioning are implemented. The rail remains part of the application and Parcours shell; existing immersive Atelier/drawing contexts retain their established treatment. Rendered behavior awaits CI verification. |
| Last consultation | [last-dossier.ts](../apps/web/src/lib/last-dossier.ts) stores the last dossier, known step and explicitly visited work area per user, with per-project step/work remembrance. Safe enum validation ignores invalid work values, and storage events refresh the remembered maps across tabs. A deliberate project visit records that preference. Project creation/modification dates do not select a dossier. Application Home reads the remembered identifier; it does not substitute another project when access or loading fails. A persistence limitation is disclosed when the browser cannot confirm storage. |
| Shared overview and separate Homes | [AccueilPage.tsx](../apps/web/src/routes/AccueilPage.tsx) and [DossierDashboard.tsx](../apps/web/src/modules/accueil/DossierDashboard.tsx). Both Homes use the same scoped overview card. Application Home adds the last dossier's identity and explicit project-Home link above it, application entry points and a contextual side panel. Phases, the project module grid and the document list belong to project Home. |
| Top bar and search | [HomeTopbar.tsx](../apps/web/src/modules/accueil/HomeTopbar.tsx), [SearchDialog.tsx](../apps/web/src/modules/accueil/SearchDialog.tsx), [Dialog.tsx](../apps/web/src/modules/accueil/Dialog.tsx) and [user-display.ts](../apps/web/src/lib/user-display.ts). Application Home carries the greeting and editable display name; project Home carries the project identity and available subtitle. The magnifier searches projects at application level and the current project's modules, steps and documents at project level. Search alone does not change the last consultation. |
| Presentation | [accueil.css](../apps/web/src/modules/accueil/accueil.css), [history.css](../apps/web/src/modules/accueil/history.css) and the existing [Icon.tsx](../apps/web/src/components/Icon.tsx). Shared colors, typography, card dimensions, visible focus treatment, mobile layout and action/preview order are implemented in source. |

### 12.3 Reliable states and recovery integrated with application data

[Dossier queries](../apps/web/src/modules/accueil/dossier-data.ts) read the actual project, steps, programme, review, documents and preview through Fadi's existing API and query cache. Loading, failed reading, retained content and confirmed empty data are distinguished. Missing progress does not become `0 / 21`; an unread programme does not fabricate a target area. The programme footer distinguishes loading from unavailable data and qualifies the reference programme as **“Programme de référence · Non enregistré”**.

The status strip separates **“Avancement du Parcours”**, **“Revue technique”** and **“Synchronisation”**. Review counts and dates come from the review data, while local pending counts come from the supported dossier-scoped queues and mutations. An unavailable queue count is not zero. The absence of pending uploads is labelled **“Aucun envoi en attente”**; that label does not certify the freshness of all resources or provide technical approval.

The **“Dates des informations”** disclosure records the independently successful reads of **Dossier et droits**, **Parcelle et avancement**, **Programme**, **Revue technique**, **Documents** and **Aperçu**. A retained resource keeps its successful reading date when a refresh fails. Preview generation and review recording remain distinct from those read dates. Restoring connectivity is not itself a new reading timestamp. Accepted changes can invalidate relevant cached resources; any later fresh reading must come from its own completed request.

[Dossier synchronization](../apps/web/src/modules/accueil/use-dossier-sync.ts), [access.ts](../apps/web/src/lib/access.ts), [local-store.ts](../apps/web/src/lib/local-store.ts), [query-persister.ts](../apps/web/src/lib/query-persister.ts), [mutations.ts](../apps/web/src/lib/mutations.ts) and the existing Atelier state/client integration connect the UI to actual permissions, local persistence, queued work and server responses. Unknown permissions do not grant owner access. Manual recovery is scoped to the current dossier. Local saving, reconnection, conflict resolution and server acceptance remain separate operations.

Simultaneous notices can identify failed saving, unavailable connectivity, unresolved versions, stale or failed readings, and review/choice conditions without hiding each other. [ConflictPanel.tsx](../apps/web/src/components/ConflictPanel.tsx) preserves the current entry after failed retries and rejects replay when the server values needed for the comparison are missing. The final guard is explicit: **“La version du serveur est indisponible. Ouvrez l’étape pour la relire avant de reprendre votre saisie.”** Session renewal and inaccessible dossiers have their own recovery destinations.

[StatusDialog.tsx](../apps/web/src/modules/accueil/StatusDialog.tsx) provides **“État du Dossier”** and **“État de la plateforme”** from those real readings and operations. These production dialogs are not the HTML prototype's state simulator. The archived simulated server outcomes, fixtures and review controls were not installed as production data.

### 12.4 Task 3 in React and preservation of the authoritative Parcours

[Dossier-state.ts](../apps/web/src/modules/accueil/dossier-state.ts) resolves the primary action using the dossier's actual access, current operation, local-save condition, conflicts, complete step list and last explicitly visited work area. `DossierDashboard.tsx` places that action **inside “Vue d’ensemble”, after its heading/description and before `.dossier-preview`**. Both Homes pass an explicit project identifier to the same component and resolver.

The implemented destinations and known cases are:

- **“Poursuivre le Parcours”** opens `/projets/:projectId?module=parcours&etape=N`, where `N` is a valid unfinished remembered step, otherwise a step actually in progress, otherwise the first unfinished step in the complete list. The number of completed steps is not used as `N = completed + 1`.
- **“Commencer le Parcours”** is reserved for a confirmed new dossier; its actual first unfinished step is selected.
- **“Consulter le Parcours”** is the default journey destination when all 21 steps are complete or consultation is the permitted behavior, including a reservation held by another editor, unless an explicitly remembered Programme, Atelier or review workspace supplies the current work destination.
- Missing progress waits or offers **“Réessayer l’avancement”**. Unknown access offers **“Vérifier l’accès au dossier”**. Unconfirmed saving and unresolved versions take their corresponding recovery priority; comparison waits for the connection when necessary.
- Opening the page or clicking a consultation link does not complete a step. The original 21-step definitions, labels, phases and original Parcours module remain the authority.

The approved alternate actions are also implemented from an **explicitly visited work area**, rather than inferred from a warning or an unread resource. `ProjectShell.tsx` records Programme (`module=programmation`), Atelier (`module=atelier`), review (`module=parcours&etape=11&bilan=1`) or Parcours as a per-user, per-project navigation preference. Returning to either Home retains that preference. After the access/recovery/progress gates, the resolver can offer:

| Explicitly visited work | Primary action | Actual destination |
|---|---|---|
| Programme | “Ouvrir le programme” | `/projets/:projectId?module=programmation` |
| Atelier | “Ouvrir l’Atelier” | `/projets/:projectId?module=atelier` |
| Technical review | “Consulter la revue” | `/projets/:projectId?module=parcours&etape=11&bilan=1` |

These links preserve permitted consultation for read-only or reserved dossiers. Recovery still precedes the remembered workspace when saving, connectivity or unresolved versions require it. A review warning alone does not choose the review action. Invalid or unrelated stored work values do not fabricate a destination.

Source order and CSS implement text, action, then preview on desktop and mobile, with a full-width mobile action and tactile target sizing. Browser verification of the actual geometry, focus, disabled-operation behavior and responsive layout is pending.

### 12.5 Real history, coverage and production qualifications

The new [API history routes](../apps/api/src/routes/history.ts), [history normalization](../apps/api/src/lib/history.ts), the existing [collaboration journal integration](../apps/api/src/routes/collaboration.ts), [HistoryDialog.tsx](../apps/web/src/modules/accueil/HistoryDialog.tsx) and [history-view-model.ts](../apps/web/src/modules/accueil/history-view-model.ts) read available recorded data. They do not replay the fictional HTML events.

Dossier history combines retained dated records, comments and accepted Atelier batches. Platform history is restricted to accessible project creations and accepted model batches. Both disclose source limits, bounded coverage, missing authors and unavailable dates. Failed writes, pending uploads and conflicts are not fabricated as accepted events; a model batch receipt does not certify synchronization of the whole dossier. Explicit access refusal hides any previously cached journal for that scope.

The dossier table has four columns: **Date et heure**, **Auteur**, **Domaine** and **Changement enregistré**. Platform history adds **Dossier** so events can be identified and filtered across projects. Filters combine with AND semantics and apply to the loaded, bounded history. Reversed dates, a filtered result with no matches, an empty successful response and a failed read remain distinct. Links open the dossier's current information, not a restorable historical version.

History display and filtering now both use **Europe/Zurich**, preserving the design requirement independently of the device's local zone. The UI states **“Dates et filtres : heure de Zurich (Europe/Zurich).”**, with **“Depuis · inclus”** and **“Jusqu’à · inclus”** labels. Filter boundaries include the complete civil minute. The pure view-model tests cover boundary/midnight cases, the skipped spring hour and both repeated autumn minutes. Browser rendering of these controls remains part of the pending CI recipe.

The retained-record limitation remains explicit: snapshots and available journal sources are not a complete immutable audit or a complete set of recoverable versions. Missing authors and historical states cannot be reconstructed from absent data.

### 12.6 Local verification evidence at this checkpoint

Results below are recorded from the actual local task runs. The repository-wide typecheck, build and test counts were reported by the implementation coordinator; translation and recipe checks were also performed on the owned files. The counts overlap and **must not be added together as independent coverage totals**.

| Check | Actual observed result | Meaning and remaining limit |
|---|---|---|
| `npm run typecheck` | Passed once during this implementation. | Establishes that checkpoint's type correctness; later edits still need the final CI gate. |
| `npm run build` | Passed during implementation and the subsequent full build completed with exit code 0. | Establishes those checkpoint builds; it is not a browser test or deployment. |
| Repository-wide `npm test` | **1,541 tests passed, 1 test skipped; 12 database-dependent suites were blocked at import because `DATABASE_URL` was missing.** | The full test command was not green. This environment did not supply the disposable database required by those suites. |
| Subsequent scoped state/access/persistence/mutation run | **41 tests passed.** | Checks the relevant state and scope logic at that run; does not replace the blocked database suites or browser coverage. |
| Subsequent full web unit suite | **206 tests passed.** | The web suite passed at that checkpoint; final navigation and timezone refinements still require the final CI run. |
| Explicit-work action resolver refinement | **21 resolver tests passed**, including the newly added workspace cases. | Confirms the pure action policy, not the rendered round trip through the application. |
| Zurich history filtering refinement | **4/4 history view-model tests passed; web typecheck passed.** | Covers civil-minute inclusivity, boundary/midnight cases and spring/autumn clock transitions. This is not a browser rendering result. |
| Translator unit tests, `npm run test --workspace=@fadi/web -- src/lib/i18n/traduire.test.ts` | **7/7 passed.** | Checks the existing translator and dictionary parameter rules. |
| Direct translation checks against all authoritative step definitions | **42/42 passed**: 21 action descriptions and 21 compact numbered labels. | Corrects the actual composition issue affecting titles containing an em dash; no step definition was changed. |
| New and updated browser recipe syntax | `node --check` passed for `accueils-design.mjs`, `parcours-scenario.mjs` and `interface-anglais.mjs`. | Syntax validation only; these results do not say the browser recipes passed. |
| Dictionary and CI configuration | EN JSON parses without duplicate keys; CI YAML parses and includes one new accueil recipe. | The new labels, states, recovery messages and history coverage are mapped into the existing FR/EN system. |
| Whitespace/error scan of owned QA files | `git diff --check` passed. | Does not validate behavior. |
| Archived reference | Byte count and SHA-256 match the revision-11 reference above. | Preserves the exact prior HTML and its separate 135-check evidence. |

No browser, local preview server or database service was started for this checkpoint. No browser installation or database mutation was used to bypass that environment limitation.

### 12.7 CI recipe and pending final evidence

The new [accueils-design.mjs](../apps/web/e2e/accueils-design.mjs) is wired into [ci.yml](../.github/workflows/ci.yml) before the existing [parcours-scenario.mjs](../apps/web/e2e/parcours-scenario.mjs). It uses a dedicated CI account and three created project fixtures. It checks explicit choice, keyboard/menu behavior, the two Homes, remembered selection and reload, per-user isolation, native Parcours routing, nonsequential continuation, preservation of all 21 steps, loading/error recovery, unknown permissions, independent resource freshness, mobile layout and axe accessibility. Its retained-programme failure scenario checks the old value and read date while the preview keeps its own date. Captures, results and axe output are written under the existing CI artifact tree.

The existing Parcours recipe was adjusted for intentional Home changes: project links now open project Home, while tests requiring the complete workflow use `?module=parcours`; phase assertions belong to the project Home; the display-name flow remains covered. The original workflow cases and 21-step definitions were preserved. [Interface-anglais.mjs](../apps/web/e2e/interface-anglais.mjs) now audits both Homes and their search, history and status dialogs.

**Pending:** run the normal GitHub CI with its disposable PostGIS service, review any failures, inspect the produced desktop/mobile screenshots and axe results, and record the final commit and CI run links. No rendered layout, assistive-technology result, deployment or production approval is claimed until that evidence exists. The coordinator will append the final CI evidence to this section.
