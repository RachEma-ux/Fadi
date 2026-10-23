<!-- Source normative du chantier (règle 4 du plan). Copie exacte de « Fadi Concept/Fadi Concept - Users Management.md » v2.2,
     pair Markdown du .docx officiel (parité des mots vérifiée par pandoc le 2026-10-22, voir STATUS.md).
     Ne pas modifier ici : régénérer avec `node scripts/users-concept.mjs --write` ; le test anti-dérive
     (apps/api/src/lib/users-concept-drift.test.ts) échoue si le .docx ou le .md change sans régénération. -->

# Fadi Users Management Concept

**Organizations Internal Teams and Project Participants**

Version 2.2 | 21 October 2026 | Product concept and functional development

Fadi Users Management connects people and organizations to the work they perform, the information they may access and the decisions they are authorized to make. This document defines the intended behavior of that capability and its development in six parts. It provides a basis for functional specifications, interface design and acceptance testing.

| Part | Expected outcome |
| --- | --- |
| 1 The Concept Definition | A shared model for platform staff, organization teams and project participants. |
| 2 Define access and ownership | Explicit stewardship, responsibilities, permissions and transfer rules. |
| 3 Design the journeys | Complete user flows, including exceptions and recovery. |
| 4 Deliver external review | Controlled review of identified material by clients and external contributors. |
| 5 Extend organization management | Memberships, groups, shared resources and assignments across projects. |
| 6 Extend collaboration where needed | Contextual coordination, decisions and notifications that address demonstrated needs. |

## 1 The Concept Definition

### Purpose and scope

Users Management is Fadi's shared capability for identifying people and organizations, organizing teams, assigning responsibilities and controlling access to information and actions. Each project brings together its relevant internal and external contributors through explicit participation, work assignments and permissions.

The capability covers contacts, accounts, organizational memberships, project participation, invitations, access, delegation and participation history. It supports Studio, Parcours, Documents and Collaboration through shared identities and consistent rules. Content production and the formal business workflows remain the responsibility of their respective modules.

A project lead must be able to identify who is involved, whom each participant represents, what they are responsible for, which work awaits them and where a decision is blocked. Each participant must be able to find their own authorized work without searching every module.

### Three connected contexts

| Context | People involved | Responsibilities managed |
| --- | --- | --- |
| Fadi internal platform team | Product leadership, designers, developers, testers, platform administrators and support personnel. | Product decisions, development, validation, releases, maintenance and platform operations. |
| Organization internal team | People belonging to an architectural practice, engineering firm, client organization or another participating organization. | Memberships, working groups, disciplines, shared resources and assignments across projects. |
| Project Team and Participants | Clients, project leads, architects, engineers, consultants, reviewers, contractors, suppliers and relevant stakeholders. | Project responsibilities, deliverables, coordination, communication, reviews, decisions and access to project information. |

These contexts overlap. An architect can belong to a practice, lead Project A and review work on Project B. An engineer from a partner firm can join Project A while remaining external to the coordinating practice. A client can be part of the operational team through a decision or approval responsibility.

Internal or external status describes a relationship. It is not a permanent account type. Fadi platform staff have separate platform roles; customer project access and business authority require explicit assignments.

### Shared records

| Record | Meaning |
| --- | --- |
| Person or contact | An individual with relevant professional information, with or without a login account. |
| Account | The identity used to sign in and attribute actions. Authentication alone grants no project access. |
| Organization | A company, practice, client body, institution or other participating entity. |
| Organization membership | A person's affiliation, organizational responsibilities, status and applicable period. |
| Project participation | A person or organization's involvement in a project, including its business role and represented party. |
| Work assignment | Responsibility for a project, study, discipline, task, deliverable, review or decision. |
| Access assignment | Permission to perform identified actions on specified resources within a defined scope and period. |

A person retains a consistent identity across contexts. Memberships and participation describe the relationships in which that identity is used. Account linkage must be verified; similar names or unverified contact details must not cause automatic merging. Shared identity does not make a person's affiliations or contact details visible to every organization.

Organizations participate as entities, while their representatives act through individual accounts. Changing a representative preserves the organization's participation and the attribution of previous actions.

### Participants and the project team

**Participants** is the complete project directory. It includes people and organizations relevant to the project, including contacts who never sign in. Clients, authorities, suppliers and prospective specialists can be recorded without receiving access.

**Project team** is the operational view of participants with active work or decision responsibilities. It identifies who leads, produces, coordinates, checks, approves and distributes project information.

Both views use the same participation records. Assigning a participant to the team adds responsibilities to that participation. It does not create a second identity or a separate directory.

Each participation record identifies the person or organization, represented party, business role, work responsibilities, permitted actions, resource scope, applicable phase or dates, delegation and participation status. A contact-only record needs only the information appropriate to its purpose.

Professional responsibility, work assignment and permission remain distinct. Naming someone as structural engineer identifies their contribution; assigning a study identifies their work; granting access determines which models, documents and discussions they may use.

### Interface placement

| Location | Management view |
| --- | --- |
| Platform administration | Fadi staff, platform responsibilities and authorized operational controls. |
| Organization workspace | Internal team, working groups, shared resources and assignments across projects. |
| Project > Collaboration > Team and Participants | Participants, team responsibilities, assignments, invitations, access and activity. |
| Studio, Parcours and Documents | Contextual assignments and decisions for the work currently being viewed. |

The project area contains Participants, Team and responsibilities, Assignments, Invitations and access, and Activity. These views use shared records. A contextual action in Studio updates the same assignment or review that appears in the project workspace.

Employment administration and payroll remain outside this capability. Users Management governs participation in Fadi and its projects; it does not produce drawings, models or other domain content.

### Definition deliverables and acceptance

This part produces the vocabulary, shared record model, actor map and interface placement. The concept is ready for detailed design when:

- The three contexts are distinguishable without creating mutually exclusive user categories.
- A person can hold different roles across organizations and projects using the same verified identity.
- Contacts and organizations can appear in a project directory without application access.
- Participants and the operational team remain consistent views of the same records.
- Business responsibility, assigned work and permission can be inspected separately.

## 2 Define access and ownership

### Ownership and administrative continuity

Within Fadi, project ownership means accountability for administering and preserving the project workspace. Each project identifies an owning party, which may be an organization or an individual, and a named primary custodian responsible for administrative continuity. Authorized deputies can support that custodian.

Project ownership is distinct from project leadership, authorship and business approval. Creating a project or uploading a document records an action; it does not determine contractual or intellectual property rights. Those rights may be referenced through project agreements without being inferred from an application role.

| Responsibility | Authority and boundary |
| --- | --- |
| Project custodian | Maintains administrative continuity, appoints administrators within the permitted scope and initiates handover. |
| Organization administrator | Manages the organization's memberships, groups and resources within delegated authority. |
| Project administrator | Manages project participation, settings or access according to an explicit administration assignment. |
| Project lead | Coordinates responsibilities, deliverables and decisions; administrative rights are assigned separately. |
| Business role holder | Performs the assigned production, review, approval or publication action on identified material. |
| Platform operator | Operates Fadi and performs specifically authorized support or recovery actions. |

A participating partner organization does not become the owning party by joining a project. Administrative control over a project does not automatically expose another organization's private resources.

### Action and scope assignments

An access assignment records the account, relevant participation, represented party where applicable, permitted actions, resource scope, effective dates, granting actor and source of authority. The source may be a direct assignment, an explicitly authorized group assignment or a temporary delegation.

Scopes can cover a project, study, variant, revision, selected documents or an identified dossier. Actions include viewing, commenting, contributing, editing, checking, approving, publishing, downloading, exporting, managing participation and managing settings.

The right to perform an action and the right to grant it are separate. An administrator can assign only the capabilities and scopes included in their delegated grant authority. A task assignment alone does not confer the access needed to perform it.

Studio's role model supplies six business responsibilities, assigned by scope and action. [1]

| Studio role | Assigned capability |
| --- | --- |
| Reader | Consult authorized content. |
| Designer | Create and modify design content and propose corrections. |
| Reviewer | Examine identified work, record findings and request corrections. |
| Coordinator | Organize observations, responsibilities and coordination decisions. |
| Approver | Accept or return identified content for a defined use. |
| Publisher | Issue the approved dossier to authorized recipients. |

These are reusable role definitions rather than permanent user types. One person may be Designer on one study and Reviewer on another. Combining roles follows the project's rules, and self-checking must be identified. Technical administration does not automatically confer business approval authority. [1]

### Effective access rules

Every protected project action is evaluated against the current state:

1. The account is active and authenticated for the operation.
2. The relevant project participation is active.
3. Any membership or representation on which the grant depends remains valid.
4. At least one active grant covers the requested action and resource.
5. No applicable explicit restriction blocks that action or resource.
6. Time limits, workflow conditions and required separation of responsibilities are satisfied.

Organization and platform operations use the corresponding active membership or platform assignment and delegated authority. They do not require participation in a customer project.

Multiple valid grants can combine within their scopes. An explicit restriction takes precedence over a matching grant. A project-wide viewing grant therefore cannot bypass a restriction on a particular dossier. Removing one grant leaves another independent valid grant effective; suspending the person's project participation blocks all access through that participation.

Restrictions must identify their scope. A change concerning one organization or project must not become an unexplained restriction on unrelated participation elsewhere.

The effective-access view explains what a person may do, where, until when and through which assignment. For a blocked action, it identifies the relevant reason without exposing protected information.

The same rules govern screens, direct requests, search results, previews, notifications, downloads and exports. Authority is checked again when an operation is submitted, including from a screen opened before a permission change.

### Ownership transfer and departure

Routine handover identifies the successor, affected responsibilities, owning party and effective date. Fadi presents the proposed changes; the eligible successor accepts the responsibility before the handover takes effect. A transfer between organizations also identifies the authorized representatives accepting the change.

The completed handover records both parties and its effective time. The former custodian's remaining roles are explicitly retained or withdrawn. Authorship, previous approvals, issued dossiers and contribution history retain their original attribution.

Urgent suspension remains possible while a handover is pending. Loss of the last custodian's access must preserve the workspace and activate an authorized recovery process. Administrative continuity must not depend on keeping a departed or compromised account active.

Ending organizational membership withdraws rights derived from that affiliation and identifies affected project representation, tasks and reviews. Independently authorized work for another organization or project remains separate. A new representative receives a new mandate rather than inheriting another person's recorded decisions.

### Visibility and platform support

Information has an identifiable audience: personal profile, organization directory, internal organization discussion, shared project work, designated review package or issued information. External participants receive only the resources explicitly shared with them. Contact details follow their own audience rules.

Download and export rights are explicit. Revocation prevents subsequent access through Fadi; it cannot recall copies already downloaded. Distribution history records issued content and recipients.

Support access identifies the operator, authorizing party, purpose, resources and duration. It expires and remains traceable. Support actions must not impersonate a participant's authorship or business approval. Recovery authority restores administrative continuity within its defined scope.

### Access deliverables and acceptance

This part produces the responsibility matrix, action and scope matrix, effective-access view, transfer procedure and departure procedure. Acceptance requires demonstrations that:

- An administrator can manage invitations without receiving approval authority.
- A broad grant cannot bypass an applicable resource restriction.
- Expiry, membership withdrawal and project suspension produce their defined access consequences.
- Revocation is enforced on the next protected action from an already-open screen.
- Handover preserves authorship and records the successor's acceptance.
- The last custodian can be suspended while an authorized recovery route remains available.
- Support access is attributable, limited and independent of customer approval roles.

## 3 Design the journeys

### Journey design contract

Each journey specifies the actor, entry point, prerequisites, main actions, resulting state, exceptions and evidence of completion. Screens must show the current organization, project and represented party where relevant. Switching context must not carry permissions from the previous context.

The interface uses clear action labels, keyboard access, readable errors and explicit saved or pending states. Confirmations identify the actual consequence of access changes, delegation, publication and ownership transfer. A failed action must preserve recoverable input and must not appear completed.

### Establish an organization and project

An authorized user creates or selects an organization, identifies its responsible administrator and records the necessary professional details. A project creator then selects the owning party, names the custodian and identifies the project lead. These roles may be held by the same person where permitted.

The initial project view displays the owning party and responsible people. Fadi creates or reuses participation records for the initial authorized custodian, project lead and administrators. Additional team members are added explicitly. Organizational membership alone does not populate project permissions.

The journey must handle a user who cannot create projects for the selected organization, a missing eligible custodian and a request interrupted before completion. Repeated submission must not create duplicate projects or duplicate administrative assignments.

### Record participants and prepare invitations

From Team and Participants, an authorized user searches existing records or records a new person or organization. They specify the represented party and business role, then choose whether the record remains a contact or receives an invitation.

An invitation identifies the intended recipient, context, proposed responsibilities, permitted actions, resource scope and invitation expiry. The sender previews the resulting access before confirming. Organization membership and project participation are distinct invitation purposes, even when offered in one onboarding flow.

Existing participation and pending invitations are shown before a new invitation is created. Resending replaces or reuses the intended invitation according to a visible rule and does not multiply participants. An invitation request must not silently create an account for its recipient.

### Accept an invitation and enter the correct workspace

The recipient sees the inviting party, project or organization, requested participation and access scope. They sign in or create an account, complete the required verification and accept or decline. Acceptance links the verified account to the correct existing person and participation record.

If the recipient is signed in as another person, the interface requires the appropriate identity. Forwarding an invitation must not transfer its intended authority. Expired, cancelled or previously declined invitations cannot activate access; a new authorized invitation is required.

Before activation, Fadi revalidates the invitation's current authorization, recipient eligibility, scope and proposed permissions. An earlier invitation cannot activate a grant whose authorization has been withdrawn; an authorized person must review or reissue it.

After successful activation, the participant enters the permitted workspace or review package and sees the work awaiting them. Joining a project does not make an external contributor an internal member of the coordinating organization.

### Assign work and manage the personal work view

A project lead selects an existing participant, defines the expected result, links the study or deliverable and sets a due date where needed. The assignment identifies one accountable person, with additional contributors or a coordinating group where appropriate.

Fadi checks whether the assignee has the necessary access. If rights are missing, the lead can request an authorized grant or choose another assignee. The assignment remains visibly blocked until its prerequisites are satisfied.

The participant's work view groups authorized tasks, reviews and decisions by project, deadline and status. Opening an item leads to its exact context. Reassignment preserves the former responsibility period and the new accountable person.

### Submit review and record a decision

A Designer submits an identified revision for checking. The Reviewer records findings, the Coordinator assigns corrections and the responsible contributors present revised material with evidence of treatment. The authorized Approver examines the identified result and records a decision for a stated use.

The Publisher performs a separate release action after the relevant checks and approval conditions are satisfied. A draft comment, an acknowledgement or a notification does not perform these transitions. External participation follows the controlled review journey in Part 4.

### Delegate responsibility and end participation

An authorized person selects the delegate, actions, material, start date and end date. The delegate's eligibility and access are checked. Actions performed during delegation identify the actual actor and the authority used; they are not attributed to the absent person.

When participation is suspended or ended, Fadi shows the affected grants, unfinished assignments, pending reviews and administrative responsibilities. Access withdrawal takes effect independently of completing the handover. Outstanding work is marked for reassignment or recorded delegation.

If the person returns later, Fadi reuses the verified identity and records a new participation period. Old permissions are reassessed rather than automatically restored.

### Separate states and exception handling

| State family | Example states |
| --- | --- |
| Account | Active, locked, suspended or closed. |
| Organization membership | Active, suspended or ended. |
| Project participation | Contact only, active, suspended or ended. |
| Invitation | Pending, accepted, declined, expired or cancelled. |
| Work assignment | Open, in progress, blocked, completed or cancelled. |

These states do not substitute for each other. An expired invitation can leave a contact record intact. An unresolved task can outlive its assignee's participation. Studio review and publication states remain attached to the identified work.

If a session expires, authorization changes or a connection is interrupted, the user sees whether the operation was recorded. Retrying an invitation, assignment or decision must not create duplicates. A conflict requires a visible resolution instead of silently replacing a newer change.

### Journey deliverables and acceptance

This part produces screen flows, wireframes, interaction specifications and a prototype covering ordinary and exceptional cases. Validation uses an internal administrator, a project contributor and an external participant to demonstrate that:

- New and existing account holders can accept the correct invitation without duplicate identities.
- Wrong-account, expired, declined and cancelled invitation cases have clear outcomes.
- Context switching exposes only the authority available in the selected context.
- Assignments with missing access are visibly blocked and can be resolved.
- Delegation and departure preserve history while withdrawing the intended rights.
- Interrupted actions recover without duplicate records or false success messages.

## 4 Deliver external review

### Purpose and first delivery scope

External review enables a named client, consultant, specialist or other participant to examine a selected revision or candidate dossier and provide the requested response. A guest is an identified participant with limited project access. Guest access uses an account and does not require membership of the host organization.

The first complete delivery supports selecting material, inviting a named recipient, opening the permitted package, recording findings, responding to corrections and completing the applicable decision. It includes the internal team's preparation and follow-up as well as the recipient's experience.

Sharing a candidate for review and publishing an approved dossier are separate operations. Review material can be examined before approval and must be labelled with its purpose and status. Studio's workflow attaches review states to an identified revision or candidate dossier. [1]

### Define the review package

A review package is a named, stable selection of material. Before sharing it, the authorized sender records:

- The project, study, revision or candidate dossier and the reason for review.
- A manifest identifying the exact versions of documents, models and supporting references.
- The expected response and the questions or checks to address.
- Named recipients, represented parties and assigned review or approval responsibilities.
- Viewing, commenting, attachment, download and export permissions.
- The review due date, access duration and invitation expiry.
- The coordinator responsible for follow-up and the internal owner of any required corrections.

The sender previews the recipient's permitted view before sharing. The package exposes only material authorized for sharing, even while its design content remains unapproved. It does not provide general navigation into unrelated project resources.

### External review journey

1. **Prepare the candidate.** Select and preserve the exact material to be examined.
2. **Assign responsibility.** Name reviewers and any approver, with their distinct actions and scopes.
3. **Invite and verify.** Send recipient-specific access and activate it through the correct account.
4. **Examine and respond.** Record observations against the relevant document, object and revision.
5. **Coordinate corrections.** Assign findings to responsible contributors and record their responses.
6. **Present revised material.** Identify the new versions and connect them to the earlier observations.
7. **Recheck and decide.** Complete the required verification before the authorized approval decision.
8. **Release separately.** Publish the approved package only when the publication conditions are met.

The recipient sees the package identity, purpose, deadline, authorized actions and current status. The internal project lead sees recipients, responses received, unresolved findings, blocked decisions and overdue work.

### Review state and evidence

A review assignment records whether it is awaiting response, in progress, completed, cancelled or superseded. Its outcome records findings or a satisfactory review for the specified scope. Completion of one person's review does not establish approval of the package.

The underlying work follows the applicable Studio transitions: submitted for checking, corrections requested, resubmitted for checking, submitted for approval and approved. Publication has a separate state. The review interface displays these recorded states rather than maintaining a competing approval status. [1]

Each observation retains the original evidence and context. A contributor can report a correction as completed, but closure requires the verification defined by the review process. A deleted object or a newer revision does not automatically resolve the observation.

### Changes during review

The reviewed material remains fixed while the design team develops subsequent revisions. A replacement review package has a new identity or version and explicitly indicates which previous package it supersedes. Recipients can distinguish the original findings from the later recheck.

Approval records the exact content, actor, date, scope and intended use. It does not transfer automatically to changed material. Publication verifies that the released versions correspond to the approved set. Earlier releases and decisions remain traceable when replaced or withdrawn. [1]

A check that was not performed remains not executed; a technical failure is recorded as such. Neither establishes conformity. Missing responses, absence and elapsed deadlines do not constitute consent. Any authorized exception records its reason, actor, scope and affected results. [1]

### Time limits and external visibility

Invitation expiry controls when an invitation may be accepted. Access expiry controls how long accepted access remains valid. The review due date defines when the response is expected. These dates are independent and have visibly different effects.

Expiry or revocation ends the access provided by that review grant. Independently authorized access through another valid role remains subject to its own scope. Blocking all access to the material requires the applicable restriction or participation suspension. Earlier observations and decisions remain attributed to their authors, and unrelated project roles remain intact.

External reviewers see the permitted package and exchanges. Internal notes, unrelated drafts, staff directories and private organization discussions remain outside that audience. Notifications, previews, attachments, searches and exported review reports follow the same boundary.

Replacing an absent reviewer or approver requires a recorded reassignment or delegation. A replacement receives the applicable context and unresolved work, while earlier decisions remain linked to their actual authors.

### Review deliverables and acceptance

This part delivers the package preparation view, external review workspace, invitation flow, response tracking, correction loop and review history. Acceptance requires a complete scenario in which:

- An external participant reviews a package without joining the host organization.
- A forwarded invitation cannot confer the named recipient's authority on another person.
- Internal notes and unrelated material remain inaccessible, including through links and exports.
- An expired or revoked review grant cannot authorize access, and an overdue response remains incomplete.
- Observations retain the exact original material and link to subsequent corrections.
- A Reviewer cannot approve or publish without the corresponding separate assignment.
- A changed package requires the applicable new checks and approval.
- The released dossier matches the approved versions and preserves the release history.

## 5 Extend organization management

### Purpose and management scope

Organization management gives each participating organization a workspace for maintaining its internal team, groups, shared resources and work across projects. This extends the individual membership and project rules without absorbing all project teams into the coordinating organization.

| Area | Required behavior |
| --- | --- |
| Organization record | Maintain the organization's identity, professional details, responsible administrators and status. |
| Internal membership | Record affiliation, organizational role, dates and status against the verified person. |
| Working groups | Organize disciplines, departments and working groups without automatically granting project access. |
| Project assignments | Show authorized projects, responsibilities and work associated with the organization's members. |
| Delegated administration | Limit administrators to their assigned organizational functions and grant authority. |
| Shared resources | Maintain controlled templates, references and reusable role definitions with an identified owner and version. |

A person may belong to several organizations. Each membership retains its own role, period and status. A partner organization stays a separate participating entity, with its representatives and mandates identified.

### Groups and project access

A working group can help select contributors and distribute responsibilities. Group membership alone does not create project participation or project permissions.

Where a project explicitly grants rights through a group, the assignment identifies the project, resources, permitted actions and the group's role in supplying eligible members. Adding a person to the group shows the proposed project access and requires the applicable grant authority before that access becomes effective.

Removing a person withdraws grants derived from the group. Independent direct assignments remain visible and follow their own rules. The effective-access view explains these sources so administrators can distinguish removal from a group from suspension of project participation.

A group can coordinate an assignment, but tasks and approval responsibilities must identify the accountable person or an explicit assignment procedure before work begins.

### Onboarding and organizational change

Onboarding identifies the organization being joined, the person's organizational role and proposed group memberships. Project invitations and assignments remain explicit, even if prepared during the same flow.

A change of discipline, group or employer presents the affected access and responsibilities. Leaving an organization withdraws affiliation-derived rights and triggers review of unfinished tasks, pending approvals and project representation. The organization may appoint a new representative while keeping its project participation intact.

Routine administrative handover identifies an accepted successor. Urgent suspension is applied immediately, with recovery and reassignment following the rules in Part 2.

Organization suspension blocks organizational operations other than authorized recovery and immediately disables grants derived from that organization. Closure ends its memberships and mandates. Independently authorized participation for other parties and historical project records are preserved. Projects owned by the affected organization require an explicit continuity or handover decision.

### Shared templates and directory visibility

An organization may maintain templates for typical project teams, disciplines and role assignments. Applying a template previews the proposed participants, responsibilities and scopes before confirmation. Named people must be selected or verified in the target project.

Templates are versioned starting configurations. Updating one does not silently alter existing project teams or permissions. Applying a new version to an existing project is a separate action showing its proposed changes.

The internal personnel directory, project directory and personal profile have different audiences. A project participant receives the professional contact information shared for that project, without discovering the organization's entire personnel directory.

Cross-project views filter project names, assignments, workload information and linked content according to the viewer's authority. Managers see only the details they are authorized to inspect. Organizational seniority does not itself provide unrestricted access.

### Organization deliverables and acceptance

This part delivers organization settings, membership and group management, an authorized cross-project assignment view, lifecycle flows and reusable templates. Acceptance demonstrates that:

- One person can hold several organizational memberships without duplicate identities.
- An external partner joins a project without becoming an internal member of the host organization.
- Group changes show their access consequences and cannot silently widen project access.
- Membership departure removes dependent rights while preserving independently authorized work.
- A replacement representative inherits assigned responsibilities through an explicit mandate.
- Directory, search and dashboard visibility follow the same access boundaries.
- Template updates leave existing projects unchanged until an authorized application.

The initial extension focuses on membership, groups, visibility and handover. More detailed capacity planning and organizational reporting require a defined operational need and their own functional scope.

## 6 Extend collaboration where needed

### Purpose and shared records

Collaboration connects participants to the material and actions requiring their attention. Its initial scope supports contextual exchanges, issue follow-up, assignments, decisions and essential notifications across Fadi's modules.

Studio distinguishes annotations, observations, tasks and decisions. Fadi's shared collaboration capability preserves those differences and the exact context of each record. [1]

| Record | Purpose and required information |
| --- | --- |
| Comment or annotation | A remark with author, date, audience and project, task or material context; the revision is identified when versioned content is involved. |
| Observation or issue | A finding requiring examination, with original evidence, affected material, priority and follow-up status. |
| Task | An action with an accountable person, expected result, due date where relevant and linked work. |
| Decision | An authorized choice with rationale, decision maker, date, scope and supporting material. |
| Review or approval | The formal business workflow record for the identified revision or dossier. |
| Notification | Notice of a recorded event or expected action for an eligible recipient. |

A comment may lead to an issue or task; an issue may lead to a decision. These records remain linked without becoming interchangeable or independently maintained copies.

### Coordination and closure

The team records a finding against identified material, assigns any resulting action, tracks the response and performs the required verification. The responsible reviewer closes or reopens the observation according to the applicable workflow. Completing a task does not automatically approve its deliverable.

Later revisions extend the issue history while preserving the original evidence. If a referenced object changes or disappears, the earlier context remains recoverable and the follow-up identifies the new material.

Collaboration views display the formal review and publication states maintained by Studio or Documents. They do not create a second approval mechanism. A meeting note or assisted summary becomes a formal decision only through an authorized decision action. [1]

### Audiences and notifications

The author sees the audience before sharing a comment, attachment or decision. Internal organization discussions, shared project exchanges and external review exchanges have distinct visibility boundaries.

Mentioning a person, assigning a task or subscribing them to an issue does not grant access to the linked material. If a recipient lacks permission, an authorized sharing action is required. A conversation must not expose the content or metadata of a restricted resource.

An external response derived from an internal discussion contains only the information explicitly selected for release. Sending the response does not reveal the full internal thread.

A personal work view collects authorized tasks, reviews, decisions awaiting action and relevant changes. Notifications identify the expected action and link to the exact record. The system checks the recipient's access when generating a notification, before dispatching queued content and when its link is opened.

Notification preferences can change delivery frequency or channel. They do not cancel assignments or change recorded workflow states. Reminders and overdue indicators support follow-up; they never imply that an absent response is an approval.

### Extend against a demonstrated need

Additional collaboration capabilities are introduced when a recurring problem and an acceptance scenario justify them.

| Observed need | Possible extension |
| --- | --- |
| Meeting actions are repeatedly lost | Link meeting records to named tasks and tracked decisions. |
| Dependencies repeatedly block delivery | Add dependency views and targeted alerts for affected assignees. |
| Teams duplicate issue entry between tools | Add structured issue exchange with preserved identities and revision context. |
| Review volume obscures unresolved matters | Add filtered summaries and assisted drafting subject to participant confirmation. |

Each extension records the user problem, affected roles, required data, permission effects, expected outcome and verification method. Success is assessed through observed use, such as completing a review without duplicate issue entry or recovering an action directly from a meeting record.

The initial scope does not require general-purpose chat, payroll, broad enterprise planning or automated business decisions. Those capabilities need separate justification rather than being implied by team management.

### Collaboration deliverables and acceptance

This part delivers contextual collaboration panels, linked issue and task records, a personal work view, notification rules and a prioritized extension backlog. Acceptance requires that:

- Each exchange, issue and decision retains its exact project, task or material context, including the revision when versioned content is involved.
- Corrections and rechecks extend the history without rewriting earlier evidence.
- Tasks have clear accountability and explicit completion conditions.
- Internal exchanges remain hidden from external participants.
- Mentions, subscriptions and notifications cannot silently grant access.
- Revocation is enforced in collaboration views and future notification content.
- Formal decisions remain distinguishable from discussion, task completion and summaries.
- Collaboration summaries remain consistent with the source module's workflow.

### Development sequence and completion

Define the shared records and access rules before validating the user journeys. Deliver external review as the first complete operational scenario, then extend organization administration and add collaboration capabilities against observed needs.

Final acceptance combines all six parts: an organization forms a project team, an external participant reviews identified material, authorized contributors resolve findings, an approver accepts a dossier and a publisher releases its approved versions. Membership and access changes must preserve history and enforce the intended audiences.

## Reference

[1] **Studio-Le Concept.md**, sections 4.4 to 4.5, 6.3, 6.5, 7.1 to 7.6 and 8.1 to 8.4: checks, observations and correction, contextual collaboration, coordinated publication, workflow states, roles, permissions, exceptions, revision identity and exchange behavior.

## v2.2 — Canonical alignment and invitations

Users Management is the authority for verified identities, organizations, project participation, invitations and grants. COM delivers invitations; Real-time Collaboration enforces session access; Studio/Documents own review, approval and publication. An invitation is a proposal, not a grant. Five purposes are supported: organization membership, project participation, restricted resource, fixed review package and live-session access. Record recipient, inviting authority, represented party, actions, exact scope, invitation expiry, access expiry, status and history. On acceptance, verify the intended identity, recheck current inviter authority and resource restrictions, then activate grants idempotently. A forwarded, expired, cancelled or declined link cannot grant access. Wrong-account, delivery failure, interrupted acceptance, duplicate submission, changed package and revoked inviter require clear recovery. Revocation withdraws dependent access without erasing authorship or unrelated valid grants. Invitations, acknowledgments, reviews, approvals and publications are distinct events.

### Acceptance

Test existing and new users, internal team assignment, external engineer, restricted R03 review while R04 develops, forwarded/expired link, inviter revocation, mid-session access loss, organizational departure and retries without duplicates.
