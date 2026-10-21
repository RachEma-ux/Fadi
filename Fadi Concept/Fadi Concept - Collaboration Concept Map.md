# Fadi Concept - Collaboration Concept Map

**Version:** 1.0  
**Status:** Cross-module reference for concept validation  
**Applies to:** Users Management, Communication (COM), Real-time Collaboration, Studio, Documents, Parcours and shared Collaboration.

## Purpose

This map establishes the common definitions and rules governing collaboration in Fadi. It sits above the three specialist concepts, does not replace them, and introduces no new product capabilities.

## 1. Five governing rules

1. **One identity and access system.** Users Management owns accounts, organizations, memberships, project participation, invitations and permissions.
2. **Explicit authority.** Membership, authorship, administration or hosting does not itself confer approval or publication authority.
3. **Deliberate sharing.** Information has an authorized audience; moving it to a wider audience requires an explicit action.
4. **Separate work and decisions.** Working, saving, sharing, adopting a reference, reviewing, approving and publishing are different operations.
5. **Traceability.** Important actions identify the actual actor, material, source revision, time, authority and outcome.

## 2. Shared vocabulary

| Term | Meaning and boundary |
| --- | --- |
| Person/contact | Individual recorded with or without a login. |
| Account | Verified sign-in identity; does not alone grant project access. |
| Organization | Participating firm, practice, institution or client body. |
| Organization membership | Affiliation; not automatic access to organization projects. |
| Project participation | Involvement in a specific project; not unrestricted access. |
| Project team | Operational view of participants with assigned work or decisions. |
| Assignment | Expected work or responsibility; not itself an access grant. |
| Responsibility | What someone is expected to do. |
| Authority | Basis for a formal decision, delegation or administrative action. |
| Permission | Allowed action on a specified resource and scope. |
| Access | Effective ability after current grants, restrictions and status are checked. |
| Audience | Authorized recipients of a particular item; not everyone mentioned. |
| Session | Temporary shared coordination context; not a formal record state. |
| Revision | Identified saved content state; not automatically approved. |
| Coordination package | Exact versions shared for coordination, not approval. |
| Adopted reference | Package accepted as working reference, not formally approved. |
| Fixed review package | Exact material submitted for a defined review. |
| Approved dossier | Identified content approved for a stated use. |
| Published release | Approved material separately issued to authorized recipients. |
| Comment / annotation | Discussion or markup; not automatically an issue or decision. |
| Observation / issue | Finding requiring examination or follow-up. |
| Task | Assigned work; completion is not approval. |
| Review / approval | Examination and findings / authorized formal decision. |

## 3. Responsibility and authority map

| Capability | Authoritative responsibility | Must not duplicate |
| --- | --- | --- |
| Users Management | Accounts, people, organizations, invitations, participation, grants | Messages, design decisions, session records |
| COM | Conversations, audiences, notifications and delivery | Invitation acceptance, permissions, approval |
| Real-time Collaboration | Presence, sessions, shared viewing and live coordination | Account grants, revisions, formal approval |
| Shared Collaboration | Issues, tasks and linked coordination actions | Separate design approval states |
| Studio | Design objects, revisions, checks, applicable approvals and publication | Identities or messaging |
| Documents | Document versions and its domain workflows | Competing decisions for the same material |
| Parcours | Project steps and work context | Separate user or permission systems |

A **project custodian** manages administrative continuity; a **content custodian** stewards identified material; a **session host** organizes a meeting. A **Reviewer** checks, an **Approver** decides and a **Publisher** issues. These responsibilities are not interchangeable. One person may hold several where explicitly authorized.

For a formal action, record the actor, represented party where applicable, authority basis, action, resource and revision, scope, audience and outcome.

## 4. Content and decision boundaries

A typical design path is **working content → saved revision → fixed review package → approved dossier → published release**. A saved revision may also be shared as a **coordination package**, then compared and deliberately **adopted as a reference**. This is not a mandatory universal state machine.

- A live session can generate pointers, markups, discussions and drafts, but does not itself save a revision or approve content.
- Receiving a package is not adopting it. Adopting a reference is not approving it.
- Review attendance, opening, acknowledgment, findings, response, completed review, approval and publication are distinct.
- Approval remains tied to exact material and its intended use. Approval of R03 does not transfer automatically to R04.
- Each record retains its own states: invitations, messages, tasks, sessions and design workflows are not forced into one shared lifecycle.
- Conflicts preserve accepted work and recoverable drafts. Undo is validated, not silent erasure.

## 5. Audience and continuity

- Internal conversations remain internal until an authorized person explicitly shares selected information.
- Mentions, links, invitations, assignments and session attendance do not silently widen resource access.
- Session audiences, content audiences and formal-release audiences may differ.
- Notifications, previews, attachments, search results, exports and AI summaries respect source and destination access.
- An external review exposes the fixed authorized package, not the full project by default.
- Revocation blocks future unauthorized actions and content delivery. Previously downloaded copies follow the defined offline policy.
- Independent valid grants survive unrelated grant withdrawal, subject to applicable restrictions and suspension.
- Departure triggers reassignment and reservation recovery without delaying access withdrawal or rewriting authorship.
- AI output remains source-, revision- and audience-bound draft material; it cannot approve, publish or widen access.

## 6. Cross-module acceptance scenarios

| Scenario | Required result |
| --- | --- |
| Architect creates team | Existing verified identities; work assignments distinct from access. |
| Engineer invited externally | Recipient verification and acceptance grant only the assigned scope; forwarded or expired invitations cannot activate access. |
| Engineer comments on R03 | Correct revision, author and audience are retained. |
| Architect creates R04 | R03 evidence remains unchanged; R04 is a separate revision. |
| Client reviews fixed dossier | No access to internal notes or unrelated material. |
| Approval and publication | Only an authorized Approver decides; a Publisher separately issues exact approved versions. |
| Engineer access revoked mid-session | Future protected actions and delivery stop; unrelated valid grants remain. |
| Package received but not adopted | Existing reference stays in use until explicit adoption. |
| Conflict or offline retry | No silent overwrite or duplicate acceptance; recoverable work remains visible. |
| Host attempts unauthorized approval | Action denied even when the host controls the session. |

## Application

This map is a short, common reference above **Fadi Concept - Users Management**, **Fadi Concept - Communication**, and **Fadi Concept - Real-time Collaboration**. Detailed requirements stay in their respective concepts. Changes to shared definitions require checking all three for consistency.

**Scope control:** Do not introduce a new module, universal workflow engine, advanced BIM co-authoring, enterprise directory sync or AI automation merely to satisfy this map. Validate the complete invitation-to-publication scenario first.
