/**
 * Organisations — espace d'organisation (phase 5, Issue #262, concept partie 5). Monté sous `/organizations`.
 *
 * Autorisation serveur à chaque requête, échec fermé : 404 pour qui n'a jamais adhéré à l'organisation (administrateur
 * de la plateforme compris : son rôle n'administre aucune organisation, même logique que D-2) ; 403 avec motif pour un
 * membre dont l'adhésion ou le rôle ne suffit pas. Rien ici n'ouvre un projet : adhésion, groupe, gabarit et mandat ne
 * donnent aucun droit de projet ; l'accès reste `projects.owner_id` / participations du projet (lib/owned-project.ts).
 *
 *   GET    /                                   mes adhésions (toutes périodes) et mes mandats à accepter
 *   POST   /                                   { name, kind?, details?, creationKey? } → l'organisation, le créateur administrateur
 *   POST   /mandates/:mandateId/accept|decline réponse du représentant proposé (lui seul)
 *   POST   /mandates/:mandateId/resign         renonciation du représentant à un mandat actif
 *   GET    /:orgId                             fiche et capacités (résumé seulement pour une adhésion terminée)
 *   PATCH  /:orgId                             { name?, kind?, details? } (administrateur)
 *   POST   /:orgId/status                      { status, confirmName? } suspendre / réactiver / clore (administrateur)
 *   GET    /:orgId/directory                   annuaire interne (membres actifs ; adresses et anciens membres : administrateurs)
 *   PATCH  /:orgId/memberships/:membershipId   { role?, jobTitle?, status? } (administrateur ; garde du dernier administrateur)
 *   GET    /:orgId/memberships/:membershipId/departure  conséquences d'un départ (administrateur, ou la personne elle-même)
 *   POST   /:orgId/memberships/:membershipId/end        départ (administrateur, ou la personne elle-même)
 *   GET    /:orgId/invitations                 invitations d'adhésion en attente (administrateur)
 *   POST   /:orgId/invitations                 { email, role, jobTitle? } invitation `organization_membership` (administrateur)
 *   DELETE /:orgId/invitations/:invitationId   annulation (administrateur)
 *   GET    /:orgId/groups                      groupes et leurs membres (membre actif)
 *   POST   /:orgId/groups, PATCH /:orgId/groups/:groupId, PUT|DELETE /:orgId/groups/:groupId/members/:membershipId
 *   GET    /:orgId/templates                   gabarits et leurs versions (membre actif)
 *   POST   /:orgId/templates                   { name, description?, entries, note? } → gabarit + version 1 (administrateur)
 *   POST   /:orgId/templates/:templateId/versions          { entries, note? } → nouvelle version (administrateur)
 *   POST   /:orgId/templates/:templateId/versions/:version/preview|apply  { projectId, assignments }
 *          (administrateur ET propriétaire du projet) — fiches « contact » seulement, aucun accès, aucune participation modifiée
 *   GET    /:orgId/projects                    vue transversale filtrée (noms visibles selon l'accès du lecteur)
 *   PUT    /:orgId/projects/:projectId/participation       l'organisation partie au projet (administrateur ET propriétaire)
 *   PUT    /:orgId/projects/:projectId/owner   partie propriétaire déclarée (OP-D1 a) (administrateur ET propriétaire)
 *   DELETE /:orgId/projects/:projectId/owner   retrait de la déclaration (propriétaire du projet)
 *   POST   /:orgId/mandates                    { projectId, membershipId, responsibilities?, replacesMandateId?, note? } (administrateur)
 *   POST   /:orgId/mandates/:mandateId/cancel|end           (administrateur)
 *
 * Journal : chaque écriture ajoute son entrée `organization.*` (cible = l'organisation) dans la transaction de l'action ;
 * jamais d'adresse ni de nom de personne dans les métadonnées.
 */
import { projectSideOfMandates } from "../lib/mandate-invitations-db.js";
import type { MandateProjectSide } from "../lib/mandate-invitations.js";
import { Router, type Request, type Response } from "express";
import { and, asc, desc, eq, gt, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import {
  invitations, organizationGroupMembers, organizationGroups, organizationMandates, organizationMemberships, organizations,
  organizationTemplateApplications, organizationTemplates, organizationTemplateVersions, people, projectParticipations, projects, users,
  type TeamResponsibility,
} from "../db/schema.js";
import { audit, clientIp } from "../lib/audit.js";
import { formatDate, mailLocale, PUBLIC_PATHS, publicLink, sendAccountMail } from "../lib/account.js";
import { newId } from "../lib/ids.js";
import { invitationView } from "../lib/invitations.js";
import { loadProjectAccess } from "../lib/owned-project.js";
import {
  createOrRenewOrganizationInvitation, ensurePersonForUser, loadOrganizationAccess, lockActiveAdmins, type OrganizationAccess,
} from "../lib/organizations.js";
import {
  canMandateTransition, canMembershipTransition, canOrganizationTransition, MANDATE_REFUSAL_MESSAGE, mandateAcceptRefusal, mandateResponsibilities,
  normalizeTemplateEntry, ORGANIZATION_REFUSAL_MESSAGE, planTemplateApplication, removesLastOrganizationAdmin, templateEntriesProblems,
  type OrganizationRefusal, type TemplateEntry,
} from "../lib/organizations-rules.js";
import { TEAM_RESPONSIBILITIES } from "../lib/participations.js";
import { requireAuth } from "../middleware/require-auth.js";
import type { Tx } from "../lib/step-rows.js";

export const organizationsRouter = Router();
organizationsRouter.use(requireAuth);

type Need = "summary" | "read" | "manage" | "changeStatus";

/** 404 sans adhésion ; 403 avec motif si l'adhésion ne suffit pas ; sinon l'accès. */
async function orgOr404(req: Request, res: Response, need: Need): Promise<OrganizationAccess | null> {
  const access = await loadOrganizationAccess(String(req.params["orgId"] ?? ""), req.user!.id);
  if (!access) {
    res.status(404).json({ error: "not_found" });
    return null;
  }
  if (!access.can[need]) {
    const refusal: OrganizationRefusal = access.can.refusal ?? "not_admin";
    res.status(403).json({ error: refusal, message: ORGANIZATION_REFUSAL_MESSAGE[refusal] });
    return null;
  }
  return access;
}

function invalid(res: Response, details: unknown, message = "Saisie invalide.") {
  res.status(400).json({ error: "invalid_input", message, details });
}

const text = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) => text(max).optional().nullable().transform((v) => (v ? v : null));
const responsibilitiesSchema = z.array(z.enum(TEAM_RESPONSIBILITIES as [TeamResponsibility, ...TeamResponsibility[]])).max(6);
const today = () => new Date().toISOString().slice(0, 10);
const shownName = (u: { displayName: string | null } | null, p: { displayName: string | null } | null) => u?.displayName || p?.displayName || null;

function orgView(org: typeof organizations.$inferSelect) {
  return { id: org.id, name: org.name, kind: org.kind, details: org.details, status: org.status, createdAt: org.createdAt.toISOString(), updatedAt: org.updatedAt.toISOString() };
}
function membershipSelf(m: typeof organizationMemberships.$inferSelect | null) {
  return m ? { membershipId: m.id, role: m.role, jobTitle: m.jobTitle, status: m.status, startsOn: m.startsOn, endsOn: m.endsOn } : null;
}

/** Noms des projets que le lecteur peut ouvrir ; les autres restent masqués (concept partie 5, vues transversales). */
async function visibleProjectNames(userId: string, ids: readonly string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  for (const id of new Set(ids)) {
    const access = await loadProjectAccess(id, userId);
    if (access) names.set(id, `${access.code} — ${access.name}`);
  }
  return names;
}

// ---------------------------------------------------------------------------------------------------------------------
// Mes organisations, création, mandats à accepter
// ---------------------------------------------------------------------------------------------------------------------

organizationsRouter.get("/", async (req, res) => {
  const userId = req.user!.id;
  const rows = await db.select({ m: organizationMemberships, o: organizations }).from(organizationMemberships)
    .innerJoin(people, eq(people.id, organizationMemberships.personId))
    .innerJoin(organizations, eq(organizations.id, organizationMemberships.organizationId))
    .where(eq(people.userId, userId))
    .orderBy(asc(organizations.name), desc(organizationMemberships.startsOn));
  const pending = await db.select({ mandate: organizationMandates, org: organizations }).from(organizationMandates)
    .innerJoin(organizationMemberships, eq(organizationMemberships.id, organizationMandates.membershipId))
    .innerJoin(people, eq(people.id, organizationMemberships.personId))
    .innerJoin(organizations, eq(organizations.id, organizationMandates.organizationId))
    .where(and(eq(people.userId, userId), inArray(organizationMandates.status, ["propose", "actif"])))
    .orderBy(asc(organizationMandates.proposedAt));
  const names = await visibleProjectNames(userId, pending.map((p) => p.mandate.projectId));
  res.json({
    memberships: rows.map((r) => ({ organization: orgView(r.o), membership: membershipSelf(r.m) })),
    mandates: pending.map((p) => ({ ...mandateView(p.mandate, names), organizationName: p.org.name })),
  });
});

const createSchema = z.object({
  name: text(160).min(1, "Nom requis"),
  kind: optionalText(120),
  details: optionalText(2000),
  creationKey: z.string().trim().min(8).max(64).optional(),
}).strict();

organizationsRouter.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed.error.flatten(), "Le nom de l’organisation est requis.");
  const userId = req.user!.id;
  const result = await db.transaction(async (tx) => {
    if (parsed.data.creationKey) {
      const [replay] = await tx.select().from(organizations).where(and(eq(organizations.createdBy, userId), eq(organizations.creationKey, parsed.data.creationKey))).limit(1);
      if (replay) return { org: replay, replayed: true };
    }
    const id = newId("org");
    const inserted = await tx.insert(organizations).values({
      id, name: parsed.data.name, kind: parsed.data.kind, details: parsed.data.details, createdBy: userId, creationKey: parsed.data.creationKey ?? null,
    }).onConflictDoNothing().returning();
    if (!inserted[0]) {
      // Double soumission concurrente : l'autre requête a créé l'organisation avec la même clé.
      const [replay] = await tx.select().from(organizations).where(and(eq(organizations.createdBy, userId), eq(organizations.creationKey, parsed.data.creationKey ?? ""))).limit(1);
      return { org: replay!, replayed: true };
    }
    const personId = await ensurePersonForUser(tx, userId);
    const membershipId = newId("orm");
    await tx.insert(organizationMemberships).values({ id: membershipId, organizationId: id, personId, role: "administrateur", status: "active", createdBy: userId });
    await audit(tx, { actorId: userId, action: "organization.created", target: { type: "organization", id }, metadata: { kind: parsed.data.kind, membershipId }, ip: clientIp(req) });
    await audit(tx, { actorId: userId, action: "organization.membership.created", target: { type: "organization", id }, metadata: { membershipId, role: "administrateur", via: "creation" }, ip: clientIp(req) });
    return { org: inserted[0], replayed: false };
  });
  res.status(result.replayed ? 200 : 201).json({ organization: orgView(result.org), replayed: result.replayed });
});

function mandateView(m: typeof organizationMandates.$inferSelect, names: Map<string, string>) {
  return {
    id: m.id, organizationId: m.organizationId, projectId: m.projectId, projectName: names.get(m.projectId) ?? null, membershipId: m.membershipId,
    responsibilities: m.responsibilities, status: m.status, startsOn: m.startsOn, endsOn: m.endsOn, endReason: m.endReason,
    replacesMandateId: m.replacesMandateId, note: m.note, proposedAt: m.proposedAt.toISOString(), respondedAt: m.respondedAt?.toISOString() ?? null,
    endedAt: m.endedAt?.toISOString() ?? null,
  };
}

/** Réponse du représentant : il accepte (revalidation complète) ou refuse ; lui seul. */
async function respondMandate(req: Request, res: Response, answer: "accept" | "decline" | "resign") {
  const mandateId = String(req.params["mandateId"] ?? "");
  const userId = req.user!.id;
  const outcome = await db.transaction(async (tx) => {
    const [m] = await tx.select().from(organizationMandates).where(eq(organizationMandates.id, mandateId)).limit(1).for("update");
    if (!m) return { status: 404, body: { error: "not_found", message: MANDATE_REFUSAL_MESSAGE.not_found } };
    const [membership] = await tx.select({ m: organizationMemberships, personUser: people.userId }).from(organizationMemberships)
      .innerJoin(people, eq(people.id, organizationMemberships.personId)).where(eq(organizationMemberships.id, m.membershipId)).limit(1);
    // Non-divulgation : un mandat qui ne vous est pas proposé est introuvable.
    if (!membership || membership.personUser !== userId) return { status: 404, body: { error: "not_found", message: MANDATE_REFUSAL_MESSAGE.not_found } };
    if (answer === "resign") {
      if (!canMandateTransition(m.status, "termine")) return { status: 409, body: { error: "not_active", message: "Ce mandat n’est pas actif." } };
      await tx.update(organizationMandates).set({ status: "termine", endedAt: new Date(), endsOn: today(), endReason: "renonciation" }).where(eq(organizationMandates.id, m.id));
      await audit(tx, { actorId: userId, action: "organization.mandate.ended", target: { type: "organization", id: m.organizationId }, metadata: { mandateId: m.id, projectId: m.projectId, reason: "renonciation" }, ip: clientIp(req) });
      return { status: 200, body: { status: "termine" } };
    }
    if (answer === "decline") {
      if (m.status !== "propose") return { status: 409, body: { error: "not_pending", message: MANDATE_REFUSAL_MESSAGE.not_pending } };
      await tx.update(organizationMandates).set({ status: "refuse", respondedAt: new Date() }).where(eq(organizationMandates.id, m.id));
      await audit(tx, { actorId: userId, action: "organization.mandate.declined", target: { type: "organization", id: m.organizationId }, metadata: { mandateId: m.id, projectId: m.projectId }, ip: clientIp(req) });
      return { status: 200, body: { status: "refuse" } };
    }
    const [org] = await tx.select({ status: organizations.status }).from(organizations).where(eq(organizations.id, m.organizationId)).limit(1).for("update");
    const [participation] = await tx.select({ status: projectParticipations.status }).from(projectParticipations).where(eq(projectParticipations.id, m.participationId)).limit(1);
    const [replaced] = m.replacesMandateId
      ? await tx.select().from(organizationMandates).where(eq(organizationMandates.id, m.replacesMandateId)).limit(1).for("update")
      : [];
    const refusal = mandateAcceptRefusal({
      mandate: { status: m.status, personId: membership.m.personId }, viewerPersonId: membership.m.personId, membershipStatus: membership.m.status,
      organizationStatus: org?.status ?? null, participationStatus: participation?.status ?? null, replaced: m.replacesMandateId ? (replaced ?? { status: "termine" }) : undefined,
    });
    if (refusal) {
      // Idempotence : rejouer une acceptation déjà faite rend le même résultat.
      if (refusal === "not_pending" && m.status === "actif") return { status: 200, body: { status: "actif", replayed: true } };
      return { status: 409, body: { error: refusal, message: MANDATE_REFUSAL_MESSAGE[refusal] } };
    }
    if (replaced) {
      await tx.update(organizationMandates).set({ status: "termine", endedAt: new Date(), endsOn: today(), endReason: "remplace" }).where(eq(organizationMandates.id, replaced.id));
      await audit(tx, { actorId: userId, action: "organization.mandate.ended", target: { type: "organization", id: m.organizationId }, metadata: { mandateId: replaced.id, projectId: m.projectId, reason: "remplace", replacedBy: m.id }, ip: clientIp(req) });
    } else {
      const [other] = await tx.select({ id: organizationMandates.id }).from(organizationMandates)
        .where(and(eq(organizationMandates.organizationId, m.organizationId), eq(organizationMandates.projectId, m.projectId), eq(organizationMandates.status, "actif"))).limit(1);
      if (other) return { status: 409, body: { error: "replaced_changed", message: MANDATE_REFUSAL_MESSAGE.replaced_changed } };
    }
    await tx.update(organizationMandates).set({ status: "actif", respondedAt: new Date(), startsOn: m.startsOn ?? today() }).where(eq(organizationMandates.id, m.id));
    await audit(tx, { actorId: userId, action: "organization.mandate.accepted", target: { type: "organization", id: m.organizationId }, metadata: { mandateId: m.id, projectId: m.projectId, replaces: m.replacesMandateId }, ip: clientIp(req) });
    return { status: 200, body: { status: "actif" } };
  });
  res.status(outcome.status).json(outcome.body);
}

organizationsRouter.post("/mandates/:mandateId/accept", (req, res) => respondMandate(req, res, "accept"));
organizationsRouter.post("/mandates/:mandateId/decline", (req, res) => respondMandate(req, res, "decline"));
organizationsRouter.post("/mandates/:mandateId/resign", (req, res) => respondMandate(req, res, "resign"));

// ---------------------------------------------------------------------------------------------------------------------
// Fiche et statut
// ---------------------------------------------------------------------------------------------------------------------

organizationsRouter.get("/:orgId", async (req, res) => {
  const access = await orgOr404(req, res, "summary");
  if (!access) return;
  const admins = access.can.read
    ? await db.select({ id: organizationMemberships.id, displayName: users.displayName, personName: people.displayName }).from(organizationMemberships)
      .innerJoin(people, eq(people.id, organizationMemberships.personId)).leftJoin(users, eq(users.id, people.userId))
      .where(and(eq(organizationMemberships.organizationId, access.org.id), eq(organizationMemberships.role, "administrateur"), eq(organizationMemberships.status, "active")))
    : [];
  res.json({
    organization: access.can.read ? orgView(access.org) : { id: access.org.id, name: access.org.name, status: access.org.status },
    you: { ...membershipSelf(access.membership), can: access.can },
    administrators: admins.map((a) => ({ membershipId: a.id, name: shownName({ displayName: a.displayName }, { displayName: a.personName }) })),
  });
});

const patchOrgSchema = z.object({ name: text(160).min(1).optional(), kind: optionalText(120), details: optionalText(2000) }).strict()
  .refine((v) => Object.keys(v).length > 0, { message: "rien à modifier" });

organizationsRouter.patch("/:orgId", async (req, res) => {
  const access = await orgOr404(req, res, "manage");
  if (!access) return;
  const parsed = patchOrgSchema.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed.error.flatten());
  const changes: Partial<typeof organizations.$inferInsert> = { updatedAt: new Date() };
  if (parsed.data.name !== undefined) changes.name = parsed.data.name;
  if ("kind" in req.body) changes.kind = parsed.data.kind ?? null;
  if ("details" in req.body) changes.details = parsed.data.details ?? null;
  const row = await db.transaction(async (tx) => {
    const [updated] = await tx.update(organizations).set(changes).where(eq(organizations.id, access.org.id)).returning();
    await audit(tx, { actorId: req.user!.id, action: "organization.updated", target: { type: "organization", id: access.org.id }, metadata: { fields: Object.keys(changes).filter((k) => k !== "updatedAt") }, ip: clientIp(req) });
    return updated!;
  });
  res.json({ organization: orgView(row) });
});

const statusSchema = z.object({ status: z.enum(["active", "suspendue", "close"]), confirmName: z.string().optional() }).strict();

organizationsRouter.post("/:orgId/status", async (req, res) => {
  const access = await orgOr404(req, res, "changeStatus");
  if (!access) return;
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed.error.flatten());
  const to = parsed.data.status;
  if (to === "close" && parsed.data.confirmName?.trim() !== access.org.name) {
    res.status(422).json({ error: "confirmation_required", message: "Pour clore l’organisation, saisissez exactement son nom : la clôture termine toutes les adhésions et tous les mandats, définitivement." });
    return;
  }
  const outcome = await db.transaction(async (tx) => {
    const [org] = await tx.select().from(organizations).where(eq(organizations.id, access.org.id)).limit(1).for("update");
    if (!org || !canOrganizationTransition(org.status, to)) return { status: 409, body: { error: "invalid_transition", message: "Changement de statut impossible depuis l’état actuel de l’organisation." } };
    let cancelledInvitations = 0;
    if (to === "close") {
      const cancelled = await tx.update(invitations).set({ status: "cancelled", respondedAt: new Date() })
        .where(and(eq(invitations.organizationId, org.id), eq(invitations.status, "pending"))).returning({ id: invitations.id });
      cancelledInvitations = cancelled.length;
    }
    const [updated] = await tx.update(organizations).set({ status: to, updatedAt: new Date() }).where(eq(organizations.id, org.id)).returning();
    const ownedProjects = (await tx.select({ id: projects.id }).from(projects).where(eq(projects.organizationId, org.id))).length;
    await audit(tx, { actorId: req.user!.id, action: "organization.status_changed", target: { type: "organization", id: org.id }, metadata: { from: org.status, to, cancelledInvitations, ownedProjects }, ip: clientIp(req) });
    return { status: 200, body: { organization: orgView(updated!), cancelledInvitations, ownedProjects } };
  });
  res.status(outcome.status).json(outcome.body);
});

// ---------------------------------------------------------------------------------------------------------------------
// Annuaire interne, adhésions, départ
// ---------------------------------------------------------------------------------------------------------------------

organizationsRouter.get("/:orgId/directory", async (req, res) => {
  const access = await orgOr404(req, res, "read");
  if (!access) return;
  const admin = access.can.manage || access.can.changeStatus;
  const rows = await db.select({ m: organizationMemberships, email: users.email, displayName: users.displayName, personName: people.displayName })
    .from(organizationMemberships)
    .innerJoin(people, eq(people.id, organizationMemberships.personId))
    .leftJoin(users, eq(users.id, people.userId))
    .where(and(eq(organizationMemberships.organizationId, access.org.id), admin ? sql`true` : ne(organizationMemberships.status, "terminee")))
    .orderBy(sql`(${organizationMemberships.status} = 'terminee')`, asc(organizationMemberships.role), asc(users.displayName), asc(organizationMemberships.startsOn));
  const groupRows = await db.select({ membershipId: organizationGroupMembers.membershipId, groupId: organizationGroups.id, name: organizationGroups.name })
    .from(organizationGroupMembers).innerJoin(organizationGroups, eq(organizationGroups.id, organizationGroupMembers.groupId))
    .where(and(eq(organizationGroupMembers.organizationId, access.org.id), eq(organizationGroups.status, "active")));
  const groupsOf = new Map<string, { id: string; name: string }[]>();
  for (const g of groupRows) groupsOf.set(g.membershipId, [...(groupsOf.get(g.membershipId) ?? []), { id: g.groupId, name: g.name }]);
  res.json({
    members: rows.map((r) => ({
      membershipId: r.m.id, personId: r.m.personId, name: shownName({ displayName: r.displayName }, { displayName: r.personName }),
      // L'adresse de connexion n'est montrée qu'aux administrateurs (gestion) ; jamais aux autres membres.
      ...(admin ? { email: r.email } : {}),
      role: r.m.role, jobTitle: r.m.jobTitle, status: r.m.status, startsOn: r.m.startsOn, endsOn: r.m.endsOn, endReason: r.m.endReason,
      groups: groupsOf.get(r.m.id) ?? [], you: r.m.id === access.membership?.id,
    })),
  });
});

const membershipPatchSchema = z.object({
  role: z.enum(["administrateur", "membre"]).optional(),
  jobTitle: optionalText(120),
  status: z.enum(["active", "suspendue"]).optional(),
}).strict().refine((v) => Object.keys(v).length > 0, { message: "rien à modifier" });

organizationsRouter.patch("/:orgId/memberships/:membershipId", async (req, res) => {
  const access = await orgOr404(req, res, "manage");
  if (!access) return;
  const parsed = membershipPatchSchema.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed.error.flatten());
  const outcome = await db.transaction(async (tx) => {
    const admins = await lockActiveAdmins(tx, access.org.id);
    const [before] = await tx.select().from(organizationMemberships)
      .where(and(eq(organizationMemberships.id, String(req.params["membershipId"])), eq(organizationMemberships.organizationId, access.org.id))).limit(1).for("update");
    if (!before) return { status: 404, body: { error: "not_found" } };
    if (before.status === "terminee") return { status: 409, body: { error: "membership_ended", message: "Adhésion terminée : un retour passe par une nouvelle invitation." } };
    const nextStatus = parsed.data.status ?? before.status;
    if (nextStatus !== before.status && !canMembershipTransition(before.status, nextStatus)) return { status: 409, body: { error: "invalid_transition" } };
    const losesAdmin = (parsed.data.role === "membre" && before.role === "administrateur") || (nextStatus !== "active" && before.role === "administrateur");
    if (losesAdmin && removesLastOrganizationAdmin(admins, before.id)) {
      return { status: 409, body: { error: "last_admin", message: "C’est le dernier administrateur actif : nommez d’abord un autre administrateur." } };
    }
    const changes: Partial<typeof organizationMemberships.$inferInsert> = { updatedAt: new Date() };
    if (parsed.data.role) changes.role = parsed.data.role;
    if ("jobTitle" in req.body) changes.jobTitle = parsed.data.jobTitle ?? null;
    if (parsed.data.status) changes.status = parsed.data.status;
    const [after] = await tx.update(organizationMemberships).set(changes).where(eq(organizationMemberships.id, before.id)).returning();
    await audit(tx, {
      actorId: req.user!.id, action: "organization.membership.changed", target: { type: "organization", id: access.org.id },
      metadata: { membershipId: before.id, role: [before.role, after!.role], status: [before.status, after!.status], jobTitleChanged: "jobTitle" in req.body },
      ip: clientIp(req),
    });
    return { status: 200, body: { membership: membershipSelf(after!) } };
  });
  res.status(outcome.status).json(outcome.body);
});

/** Conséquences d'un départ : groupes quittés, mandats terminés ou annulés, représentations de projet à revoir. */
async function departureImpact(executor: Pick<typeof db, "select">, orgId: string, membershipId: string, personId: string, viewerId: string) {
  const groups = await executor.select({ id: organizationGroups.id, name: organizationGroups.name }).from(organizationGroupMembers)
    .innerJoin(organizationGroups, eq(organizationGroups.id, organizationGroupMembers.groupId)).where(eq(organizationGroupMembers.membershipId, membershipId));
  const mandates = await executor.select().from(organizationMandates)
    .where(and(eq(organizationMandates.membershipId, membershipId), inArray(organizationMandates.status, ["propose", "actif"])));
  const represented = await executor.select({ id: projectParticipations.id, projectId: projectParticipations.projectId, status: projectParticipations.status })
    .from(projectParticipations)
    .where(and(eq(projectParticipations.personId, personId), eq(projectParticipations.representedOrganizationId, orgId), ne(projectParticipations.status, "terminee")));
  const names = await visibleProjectNames(viewerId, [...mandates.map((m) => m.projectId), ...represented.map((r) => r.projectId)]);
  return {
    groups,
    mandates: mandates.map((m) => ({ id: m.id, projectId: m.projectId, projectName: names.get(m.projectId) ?? null, status: m.status, consequence: m.status === "actif" ? "termine" : "annule" })),
    // Les participations de projet ne sont pas modifiées : le projet décide (concept partie 2, travail autorisé indépendamment).
    representations: represented.map((r) => ({ participationId: r.id, projectId: r.projectId, projectName: names.get(r.projectId) ?? null, status: r.status, consequence: "a-revoir" })),
    projectAccessChanged: false,
  };
}

async function membershipForDeparture(req: Request, res: Response) {
  const access = await loadOrganizationAccess(String(req.params["orgId"] ?? ""), req.user!.id);
  if (!access) { res.status(404).json({ error: "not_found" }); return null; }
  const [target] = await db.select().from(organizationMemberships)
    .where(and(eq(organizationMemberships.id, String(req.params["membershipId"])), eq(organizationMemberships.organizationId, access.org.id))).limit(1);
  const self = !!target && target.id === access.membership?.id;
  // La personne elle-même peut partir (adhésion non terminée) ; sinon il faut gérer l'organisation.
  if (!target || (!self && !access.can.manage)) {
    if (!access.can.read) { res.status(404).json({ error: "not_found" }); return null; }
    if (!target) { res.status(404).json({ error: "not_found" }); return null; }
    const refusal = access.can.refusal ?? "not_admin";
    res.status(403).json({ error: refusal, message: ORGANIZATION_REFUSAL_MESSAGE[refusal] });
    return null;
  }
  if (self && access.org.status === "close") { res.status(403).json({ error: "organization_closed", message: ORGANIZATION_REFUSAL_MESSAGE.organization_closed }); return null; }
  return { access, target, self };
}

organizationsRouter.get("/:orgId/memberships/:membershipId/departure", async (req, res) => {
  const found = await membershipForDeparture(req, res);
  if (!found) return;
  res.json({ membershipId: found.target.id, status: found.target.status, impact: await departureImpact(db, found.access.org.id, found.target.id, found.target.personId, req.user!.id) });
});

organizationsRouter.post("/:orgId/memberships/:membershipId/end", async (req, res) => {
  const found = await membershipForDeparture(req, res);
  if (!found) return;
  const parsed = z.object({ reason: optionalText(200) }).strict().safeParse(req.body ?? {});
  if (!parsed.success) return invalid(res, parsed.error.flatten());
  const outcome = await db.transaction(async (tx) => {
    const admins = await lockActiveAdmins(tx, found.access.org.id);
    const [before] = await tx.select().from(organizationMemberships).where(eq(organizationMemberships.id, found.target.id)).limit(1).for("update");
    if (!before || before.status === "terminee") return { status: 409, body: { error: "membership_ended", message: "Cette adhésion a déjà pris fin." } };
    if (before.role === "administrateur" && removesLastOrganizationAdmin(admins, before.id)) {
      return { status: 409, body: { error: "last_admin", message: "C’est le dernier administrateur actif : nommez d’abord un autre administrateur, ou procédez à la clôture de l’organisation." } };
    }
    const impact = await departureImpact(tx, found.access.org.id, before.id, before.personId, req.user!.id);
    // Le déclencheur `op_org_membership_ended` retire les groupes et termine / annule les mandats.
    await tx.update(organizationMemberships).set({ status: "terminee", endsOn: today() < before.startsOn ? before.startsOn : today(), endReason: found.self ? "depart" : "fin-par-administrateur", updatedAt: new Date() })
      .where(eq(organizationMemberships.id, before.id));
    await audit(tx, {
      actorId: req.user!.id, action: "organization.membership.ended", target: { type: "organization", id: found.access.org.id },
      metadata: { membershipId: before.id, self: found.self, groupsLeft: impact.groups.length, mandatesEnded: impact.mandates.map((m) => m.id), representationsToReview: impact.representations.length },
      ip: clientIp(req),
    });
    return { status: 200, body: { ended: true, impact } };
  });
  res.status(outcome.status).json(outcome.body);
});

// ---------------------------------------------------------------------------------------------------------------------
// Invitations d'adhésion (finalité `organization_membership`)
// ---------------------------------------------------------------------------------------------------------------------

organizationsRouter.get("/:orgId/invitations", async (req, res) => {
  const access = await orgOr404(req, res, "manage");
  if (!access) return;
  const rows = await db.select().from(invitations)
    .where(and(eq(invitations.organizationId, access.org.id), eq(invitations.status, "pending"), gt(invitations.expiresAt, new Date())))
    .orderBy(asc(invitations.createdAt));
  res.json({ invitations: rows.map((r) => invitationView(r, { organizationName: access.org.name })) });
});

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("Adresse invalide").max(254),
  role: z.enum(["administrateur", "membre"]),
  jobTitle: optionalText(120),
  locale: z.enum(["fr", "en"]).optional(),
}).strict();

organizationsRouter.post("/:orgId/invitations", async (req, res) => {
  const access = await orgOr404(req, res, "manage");
  if (!access) return;
  const parsed = inviteSchema.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed.error.flatten(), "Adresse ou rôle invalide.");
  // Personne déjà membre (adhésion non terminée) : aucune invitation, renvoi à la fiche existante.
  const [already] = await db.select({ id: organizationMemberships.id }).from(organizationMemberships)
    .innerJoin(people, eq(people.id, organizationMemberships.personId)).innerJoin(users, eq(users.id, people.userId))
    .where(and(eq(organizationMemberships.organizationId, access.org.id), ne(organizationMemberships.status, "terminee"), eq(users.email, parsed.data.email))).limit(1);
  if (already) {
    res.status(409).json({ error: "already_member", message: "Cette personne est déjà membre de l’organisation.", membershipId: already.id });
    return;
  }
  const locale = mailLocale(req);
  const result = await db.transaction(async (tx) => {
    const created = await createOrRenewOrganizationInvitation(tx, {
      email: parsed.data.email, organizationId: access.org.id, role: parsed.data.role, jobTitle: parsed.data.jobTitle ?? null, invitedBy: req.user!.id, ip: clientIp(req),
    });
    const link = publicLink(PUBLIC_PATHS.invitation, created.token);
    const mail = await sendAccountMail(parsed.data.email, "invitation", {
      link, organizationName: access.org.name, role: parsed.data.role === "administrateur" ? (locale === "en" ? "administrator" : "administrateur") : (locale === "en" ? "member" : "membre"),
      expiresAt: formatDate(created.invitation.expiresAt, locale),
    }, locale, tx);
    return { ...created, link, mail };
  });
  res.status(202).json({
    invitation: invitationView(result.invitation, { organizationName: access.org.name }), resent: result.resent,
    mail: { queued: result.mail.queued, reason: result.mail.reason, ...(result.mail.queued ? {} : { link: result.link }) },
  });
});

organizationsRouter.delete("/:orgId/invitations/:invitationId", async (req, res) => {
  const access = await orgOr404(req, res, "manage");
  if (!access) return;
  const id = String(req.params["invitationId"]);
  const done = await db.transaction(async (tx) => {
    const rows = await tx.update(invitations).set({ status: "cancelled", respondedAt: new Date() })
      .where(and(eq(invitations.id, id), eq(invitations.organizationId, access.org.id), eq(invitations.status, "pending"))).returning({ id: invitations.id });
    if (rows.length) await audit(tx, { actorId: req.user!.id, action: "invitation.cancelled", target: { type: "invitation", id }, metadata: { organizationId: access.org.id }, ip: clientIp(req) });
    return rows.length > 0;
  });
  if (!done) { res.status(404).json({ error: "not_found" }); return; }
  res.status(204).end();
});

// ---------------------------------------------------------------------------------------------------------------------
// Groupes (aucun droit implicite)
// ---------------------------------------------------------------------------------------------------------------------

/** Ce que l'ajout ou le retrait d'un membre change aux projets : rien, aucun projet n'accorde de droit par un groupe. */
const NO_PROJECT_ACCESS = { projectAccess: "aucun", message: "Un groupe n’ouvre aucun projet : aucun accès n’est accordé ni retiré." } as const;

organizationsRouter.get("/:orgId/groups", async (req, res) => {
  const access = await orgOr404(req, res, "read");
  if (!access) return;
  const groups = await db.select().from(organizationGroups).where(eq(organizationGroups.organizationId, access.org.id)).orderBy(asc(organizationGroups.status), asc(organizationGroups.name));
  const members = await db.select({ groupId: organizationGroupMembers.groupId, membershipId: organizationGroupMembers.membershipId }).from(organizationGroupMembers)
    .where(eq(organizationGroupMembers.organizationId, access.org.id));
  res.json({
    groups: groups.map((g) => ({ id: g.id, name: g.name, description: g.description, status: g.status, members: members.filter((m) => m.groupId === g.id).map((m) => m.membershipId) })),
    ...NO_PROJECT_ACCESS,
  });
});

const groupSchema = z.object({ name: text(120).min(1, "Nom requis"), description: optionalText(500) }).strict();
const groupPatchSchema = z.object({ name: text(120).min(1).optional(), description: optionalText(500), status: z.enum(["active", "archive"]).optional() }).strict()
  .refine((v) => Object.keys(v).length > 0, { message: "rien à modifier" });

function uniqueViolation(e: unknown): boolean {
  return (e as { code?: string; cause?: { code?: string } })?.code === "23505" || (e as { cause?: { code?: string } })?.cause?.code === "23505";
}

organizationsRouter.post("/:orgId/groups", async (req, res) => {
  const access = await orgOr404(req, res, "manage");
  if (!access) return;
  const parsed = groupSchema.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed.error.flatten(), "Le nom du groupe est requis.");
  try {
    const group = await db.transaction(async (tx) => {
      const [row] = await tx.insert(organizationGroups).values({ id: newId("org_grp"), organizationId: access.org.id, name: parsed.data.name, description: parsed.data.description, createdBy: req.user!.id }).returning();
      await audit(tx, { actorId: req.user!.id, action: "organization.group.created", target: { type: "organization", id: access.org.id }, metadata: { groupId: row!.id }, ip: clientIp(req) });
      return row!;
    });
    res.status(201).json({ group: { id: group.id, name: group.name, description: group.description, status: group.status, members: [] }, ...NO_PROJECT_ACCESS });
  } catch (e) {
    if (!uniqueViolation(e)) throw e;
    res.status(409).json({ error: "duplicate_group", message: "Un groupe actif porte déjà ce nom." });
  }
});

organizationsRouter.patch("/:orgId/groups/:groupId", async (req, res) => {
  const access = await orgOr404(req, res, "manage");
  if (!access) return;
  const parsed = groupPatchSchema.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed.error.flatten());
  const changes: Partial<typeof organizationGroups.$inferInsert> = { updatedAt: new Date() };
  if (parsed.data.name) changes.name = parsed.data.name;
  if ("description" in req.body) changes.description = parsed.data.description ?? null;
  if (parsed.data.status) changes.status = parsed.data.status;
  try {
    const row = await db.transaction(async (tx) => {
      const [updated] = await tx.update(organizationGroups).set(changes)
        .where(and(eq(organizationGroups.id, String(req.params["groupId"])), eq(organizationGroups.organizationId, access.org.id))).returning();
      if (updated) await audit(tx, { actorId: req.user!.id, action: "organization.group.updated", target: { type: "organization", id: access.org.id }, metadata: { groupId: updated.id, fields: Object.keys(changes).filter((k) => k !== "updatedAt"), status: updated.status }, ip: clientIp(req) });
      return updated;
    });
    if (!row) { res.status(404).json({ error: "not_found" }); return; }
    res.json({ group: { id: row.id, name: row.name, description: row.description, status: row.status } });
  } catch (e) {
    if (!uniqueViolation(e)) throw e;
    res.status(409).json({ error: "duplicate_group", message: "Un groupe actif porte déjà ce nom." });
  }
});

async function groupAndMembership(tx: Tx, orgId: string, groupId: string, membershipId: string) {
  const [group] = await tx.select().from(organizationGroups).where(and(eq(organizationGroups.id, groupId), eq(organizationGroups.organizationId, orgId))).limit(1);
  const [membership] = await tx.select().from(organizationMemberships).where(and(eq(organizationMemberships.id, membershipId), eq(organizationMemberships.organizationId, orgId))).limit(1);
  return { group, membership };
}

organizationsRouter.put("/:orgId/groups/:groupId/members/:membershipId", async (req, res) => {
  const access = await orgOr404(req, res, "manage");
  if (!access) return;
  const outcome = await db.transaction(async (tx) => {
    const { group, membership } = await groupAndMembership(tx, access.org.id, String(req.params["groupId"]), String(req.params["membershipId"]));
    if (!group || !membership) return { status: 404, body: { error: "not_found" } };
    if (group.status !== "active") return { status: 409, body: { error: "group_archived", message: "Groupe archivé : réactivez-le pour y ajouter des membres." } };
    if (membership.status === "terminee") return { status: 409, body: { error: "membership_ended", message: "Adhésion terminée : la personne ne peut pas entrer dans un groupe." } };
    const inserted = await tx.insert(organizationGroupMembers).values({ groupId: group.id, membershipId: membership.id, organizationId: access.org.id, addedBy: req.user!.id })
      .onConflictDoNothing().returning({ groupId: organizationGroupMembers.groupId });
    if (inserted.length) await audit(tx, { actorId: req.user!.id, action: "organization.group.member_added", target: { type: "organization", id: access.org.id }, metadata: { groupId: group.id, membershipId: membership.id }, ip: clientIp(req) });
    return { status: inserted.length ? 201 : 200, body: { added: inserted.length > 0, ...NO_PROJECT_ACCESS } };
  });
  res.status(outcome.status).json(outcome.body);
});

organizationsRouter.delete("/:orgId/groups/:groupId/members/:membershipId", async (req, res) => {
  const access = await orgOr404(req, res, "manage");
  if (!access) return;
  const removed = await db.transaction(async (tx) => {
    const rows = await tx.delete(organizationGroupMembers).where(and(
      eq(organizationGroupMembers.groupId, String(req.params["groupId"])), eq(organizationGroupMembers.membershipId, String(req.params["membershipId"])),
      eq(organizationGroupMembers.organizationId, access.org.id),
    )).returning({ groupId: organizationGroupMembers.groupId });
    if (rows.length) await audit(tx, { actorId: req.user!.id, action: "organization.group.member_removed", target: { type: "organization", id: access.org.id }, metadata: { groupId: req.params["groupId"], membershipId: req.params["membershipId"] }, ip: clientIp(req) });
    return rows.length > 0;
  });
  if (!removed) { res.status(404).json({ error: "not_found" }); return; }
  res.json({ removed: true, ...NO_PROJECT_ACCESS });
});

// ---------------------------------------------------------------------------------------------------------------------
// Gabarits versionnés
// ---------------------------------------------------------------------------------------------------------------------

function versionView(v: typeof organizationTemplateVersions.$inferSelect) {
  return { id: v.id, version: v.version, entries: (v.content.entries ?? []) as TemplateEntry[], note: v.note, createdAt: v.createdAt.toISOString() };
}

organizationsRouter.get("/:orgId/templates", async (req, res) => {
  const access = await orgOr404(req, res, "read");
  if (!access) return;
  const templates = await db.select().from(organizationTemplates).where(eq(organizationTemplates.organizationId, access.org.id)).orderBy(asc(organizationTemplates.name));
  const versions = templates.length
    ? await db.select().from(organizationTemplateVersions).where(inArray(organizationTemplateVersions.templateId, templates.map((t) => t.id))).orderBy(asc(organizationTemplateVersions.version))
    : [];
  const applications = versions.length
    ? await db.select().from(organizationTemplateApplications).where(inArray(organizationTemplateApplications.templateVersionId, versions.map((v) => v.id))).orderBy(asc(organizationTemplateApplications.appliedAt))
    : [];
  const names = await visibleProjectNames(req.user!.id, applications.map((a) => a.projectId));
  res.json({
    templates: templates.map((t) => ({
      id: t.id, name: t.name, description: t.description, status: t.status,
      versions: versions.filter((v) => v.templateId === t.id).map((v) => ({
        ...versionView(v),
        applications: applications.filter((a) => a.templateVersionId === v.id).map((a) => ({ id: a.id, projectId: a.projectId, projectName: names.get(a.projectId) ?? null, appliedAt: a.appliedAt.toISOString() })),
      })),
    })),
  });
});

const entrySchema = z.object({
  label: z.string(), businessRole: z.string().nullable().optional(), responsibilities: z.array(z.string()), proposedRoles: z.array(z.string()), groupId: z.string().nullable().optional(),
}).strict();
const templateSchema = z.object({ name: text(120).min(1, "Nom requis"), description: optionalText(500), entries: z.array(entrySchema), note: optionalText(500) }).strict();
const versionSchema = z.object({ entries: z.array(entrySchema), note: optionalText(500) }).strict();

/** Lignes validées et normalisées, ou les motifs de refus (groupes vérifiés : de cette organisation). */
async function checkedEntries(orgId: string, raw: unknown[]): Promise<{ entries: TemplateEntry[] } | { problems: string[] }> {
  const problems = templateEntriesProblems(raw);
  if (problems.length) return { problems };
  const entries = (raw as TemplateEntry[]).map(normalizeTemplateEntry);
  const groupIds = [...new Set(entries.map((e) => e.groupId).filter((g): g is string => !!g))];
  if (groupIds.length) {
    const found = await db.select({ id: organizationGroups.id }).from(organizationGroups).where(and(eq(organizationGroups.organizationId, orgId), inArray(organizationGroups.id, groupIds)));
    if (found.length !== groupIds.length) return { problems: ["groupe inconnu dans cette organisation"] };
  }
  return { entries };
}

organizationsRouter.post("/:orgId/templates", async (req, res) => {
  const access = await orgOr404(req, res, "manage");
  if (!access) return;
  const parsed = templateSchema.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed.error.flatten(), "Nom et lignes du gabarit requis.");
  const checked = await checkedEntries(access.org.id, parsed.data.entries);
  if ("problems" in checked) return invalid(res, checked.problems, checked.problems.join(" ; "));
  const out = await db.transaction(async (tx) => {
    const id = newId("org_tpl");
    const [template] = await tx.insert(organizationTemplates).values({ id, organizationId: access.org.id, name: parsed.data.name, description: parsed.data.description, createdBy: req.user!.id }).returning();
    const [version] = await tx.insert(organizationTemplateVersions).values({ id: newId("org_tplv"), templateId: id, version: 1, content: { entries: checked.entries }, note: parsed.data.note, createdBy: req.user!.id }).returning();
    await audit(tx, { actorId: req.user!.id, action: "organization.template.created", target: { type: "organization", id: access.org.id }, metadata: { templateId: id, version: 1, entries: checked.entries.length }, ip: clientIp(req) });
    return { template: template!, version: version! };
  });
  res.status(201).json({ template: { id: out.template.id, name: out.template.name, description: out.template.description, status: out.template.status, versions: [{ ...versionView(out.version), applications: [] }] } });
});

organizationsRouter.post("/:orgId/templates/:templateId/versions", async (req, res) => {
  const access = await orgOr404(req, res, "manage");
  if (!access) return;
  const parsed = versionSchema.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed.error.flatten());
  const checked = await checkedEntries(access.org.id, parsed.data.entries);
  if ("problems" in checked) return invalid(res, checked.problems, checked.problems.join(" ; "));
  const outcome = await db.transaction(async (tx) => {
    const [template] = await tx.select().from(organizationTemplates)
      .where(and(eq(organizationTemplates.id, String(req.params["templateId"])), eq(organizationTemplates.organizationId, access.org.id))).limit(1).for("update");
    if (!template) return { status: 404, body: { error: "not_found" } };
    const [last] = await tx.select({ version: organizationTemplateVersions.version }).from(organizationTemplateVersions)
      .where(eq(organizationTemplateVersions.templateId, template.id)).orderBy(desc(organizationTemplateVersions.version)).limit(1);
    const next = (last?.version ?? 0) + 1;
    const [version] = await tx.insert(organizationTemplateVersions).values({ id: newId("org_tplv"), templateId: template.id, version: next, content: { entries: checked.entries }, note: parsed.data.note, createdBy: req.user!.id }).returning();
    await tx.update(organizationTemplates).set({ updatedAt: new Date() }).where(eq(organizationTemplates.id, template.id));
    await audit(tx, { actorId: req.user!.id, action: "organization.template.version_created", target: { type: "organization", id: access.org.id }, metadata: { templateId: template.id, version: next, entries: checked.entries.length }, ip: clientIp(req) });
    // Aucune application rétroactive : les projets où une version antérieure a été appliquée ne changent pas.
    return { status: 201, body: { version: { ...versionView(version!), applications: [] }, retroactive: false } };
  });
  res.status(outcome.status).json(outcome.body);
});

const applySchema = z.object({ projectId: z.string().min(1).max(200), assignments: z.record(z.string(), z.string().nullable()).default({}) }).strict();

/** Plan d'application (aperçu ou exécution) : administrateur de l'organisation ET propriétaire du projet. */
async function applicationContext(req: Request, res: Response) {
  const access = await orgOr404(req, res, "manage");
  if (!access) return null;
  const parsed = applySchema.safeParse(req.body);
  if (!parsed.success) { invalid(res, parsed.error.flatten()); return null; }
  const project = await loadProjectAccess(parsed.data.projectId, req.user!.id);
  if (!project) { res.status(404).json({ error: "project_not_found" }); return null; }
  if (project.role !== "proprietaire") {
    // Gestion des participants réservée au propriétaire du projet (règle actuelle, PLAN phase 2 tâche 2).
    res.status(403).json({ error: "project_owner_required", message: "Seul le propriétaire du projet peut y appliquer un gabarit." });
    return null;
  }
  const [row] = await db.select({ v: organizationTemplateVersions }).from(organizationTemplateVersions)
    .innerJoin(organizationTemplates, eq(organizationTemplates.id, organizationTemplateVersions.templateId))
    .where(and(eq(organizationTemplates.id, String(req.params["templateId"])), eq(organizationTemplates.organizationId, access.org.id), eq(organizationTemplateVersions.version, Number(req.params["version"]))))
    .limit(1);
  if (!row) { res.status(404).json({ error: "not_found" }); return null; }
  return { access, project, version: row.v, assignments: parsed.data.assignments };
}

async function computePlan(executor: Pick<typeof db, "select">, orgId: string, projectId: string, entries: TemplateEntry[], assignments: Record<string, string | null>) {
  const eligible = await executor.select({ personId: organizationMemberships.personId }).from(organizationMemberships)
    .where(and(eq(organizationMemberships.organizationId, orgId), eq(organizationMemberships.status, "active")));
  const current = await executor.select({ personId: projectParticipations.personId }).from(projectParticipations)
    .where(and(eq(projectParticipations.projectId, projectId), isNotNull(projectParticipations.personId), ne(projectParticipations.status, "terminee")));
  return planTemplateApplication(entries, assignments, new Set(eligible.map((e) => e.personId)), new Set(current.map((c) => c.personId!)));
}

organizationsRouter.post("/:orgId/templates/:templateId/versions/:version/preview", async (req, res) => {
  const ctx = await applicationContext(req, res);
  if (!ctx) return;
  const entries = (ctx.version.content.entries ?? []) as TemplateEntry[];
  const [previous] = await db.select({ id: organizationTemplateApplications.id, appliedAt: organizationTemplateApplications.appliedAt }).from(organizationTemplateApplications)
    .where(and(eq(organizationTemplateApplications.templateVersionId, ctx.version.id), eq(organizationTemplateApplications.projectId, ctx.project.id))).limit(1);
  res.json({ version: ctx.version.version, plan: await computePlan(db, ctx.access.org.id, ctx.project.id, entries, ctx.assignments), alreadyApplied: previous ? previous.appliedAt.toISOString() : null, grantsAccess: false });
});

organizationsRouter.post("/:orgId/templates/:templateId/versions/:version/apply", async (req, res) => {
  const ctx = await applicationContext(req, res);
  if (!ctx) return;
  const entries = (ctx.version.content.entries ?? []) as TemplateEntry[];
  const outcome = await db.transaction(async (tx) => {
    // Une version s'applique une fois à un projet : rejouer rend l'application existante, sans rien créer.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`org-template:${ctx.version.id}:${ctx.project.id}`}))`);
    const [previous] = await tx.select().from(organizationTemplateApplications)
      .where(and(eq(organizationTemplateApplications.templateVersionId, ctx.version.id), eq(organizationTemplateApplications.projectId, ctx.project.id))).limit(1);
    if (previous) return { status: 200, body: { application: { id: previous.id, plan: previous.plan, appliedAt: previous.appliedAt.toISOString() }, replayed: true, grantsAccess: false } };
    const plan = await computePlan(tx, ctx.access.org.id, ctx.project.id, entries, ctx.assignments);
    const recorded: (typeof plan[number] & { participationId: string | null })[] = [];
    for (const line of plan) {
      if (line.outcome !== "creer") { recorded.push({ ...line, participationId: null }); continue; }
      const id = newId("ppa");
      // Fiche contact : aucun accès ; une participation existante n'est jamais modifiée (index d'unicité respecté).
      const inserted = await tx.insert(projectParticipations).values({
        id, projectId: ctx.project.id, personId: line.personId, representedOrganizationId: ctx.access.org.id, businessRole: line.businessRole,
        responsibilities: line.responsibilities, status: "contact", createdBy: req.user!.id,
      }).onConflictDoNothing().returning({ id: projectParticipations.id });
      recorded.push({ ...line, outcome: inserted.length ? "creer" : "deja-present", participationId: inserted[0]?.id ?? null });
    }
    const [application] = await tx.insert(organizationTemplateApplications).values({
      id: newId("org_tpla"), templateVersionId: ctx.version.id, organizationId: ctx.access.org.id, projectId: ctx.project.id, appliedBy: req.user!.id, plan: recorded,
    }).returning();
    await audit(tx, {
      actorId: req.user!.id, action: "organization.template.applied", target: { type: "organization", id: ctx.access.org.id },
      metadata: { templateVersionId: ctx.version.id, version: ctx.version.version, projectId: ctx.project.id, created: recorded.filter((l) => l.outcome === "creer").length, unchanged: recorded.filter((l) => l.outcome === "deja-present").length },
      ip: clientIp(req),
    });
    return { status: 201, body: { application: { id: application!.id, plan: recorded, appliedAt: application!.appliedAt.toISOString() }, replayed: false, grantsAccess: false } };
  });
  res.status(outcome.status).json(outcome.body);
});

// ---------------------------------------------------------------------------------------------------------------------
// Projets : vue transversale, organisation partie au projet, partie propriétaire, mandats
// ---------------------------------------------------------------------------------------------------------------------

organizationsRouter.get("/:orgId/projects", async (req, res) => {
  const access = await orgOr404(req, res, "read");
  if (!access) return;
  const orgId = access.org.id;
  const userId = req.user!.id;
  const owned = await db.select({ id: projects.id }).from(projects).where(eq(projects.organizationId, orgId));
  const participations = await db.select({ id: projectParticipations.id, projectId: projectParticipations.projectId, status: projectParticipations.status, businessRole: projectParticipations.businessRole, responsibilities: projectParticipations.responsibilities })
    .from(projectParticipations).where(and(eq(projectParticipations.organizationId, orgId), ne(projectParticipations.status, "terminee")));
  const mandates = await db.select({ m: organizationMandates, displayName: users.displayName, personName: people.displayName, personId: people.id, userId: people.userId }).from(organizationMandates)
    .innerJoin(organizationMemberships, eq(organizationMemberships.id, organizationMandates.membershipId))
    .innerJoin(people, eq(people.id, organizationMemberships.personId)).leftJoin(users, eq(users.id, people.userId))
    .where(and(eq(organizationMandates.organizationId, orgId), inArray(organizationMandates.status, ["propose", "actif"])))
    .orderBy(asc(organizationMandates.proposedAt));
  // État côté projet de chaque mandat (reliquat de la phase 5), en lecture seule et pour les administrateurs seuls : non
  // invité, invitation en attente, participation active, terminée. Le mandat lui-même n'ouvre toujours aucun accès.
  const sides = access.can.manage
    ? await projectSideOfMandates(db, mandates.map((m) => ({ mandateId: m.m.id, projectId: m.m.projectId, personId: m.personId, userId: m.userId ?? null })))
    : new Map<string, MandateProjectSide>();
  const representations = await db.select({ projectId: projectParticipations.projectId, membershipId: organizationMemberships.id, status: projectParticipations.status })
    .from(projectParticipations)
    .innerJoin(organizationMemberships, and(eq(organizationMemberships.personId, projectParticipations.personId), eq(organizationMemberships.organizationId, orgId), ne(organizationMemberships.status, "terminee")))
    .where(and(eq(projectParticipations.representedOrganizationId, orgId), ne(projectParticipations.status, "terminee")));
  const ids = [...owned.map((p) => p.id), ...participations.map((p) => p.projectId), ...mandates.map((m) => m.m.projectId), ...representations.map((r) => r.projectId)];
  const names = await visibleProjectNames(userId, ids);
  const yours = await db.select({ id: projects.id, code: projects.code, name: projects.name, organizationId: projects.organizationId }).from(projects)
    .where(eq(projects.ownerId, userId)).orderBy(asc(projects.code));
  const projectIds = [...new Set(ids)];
  res.json({
    projects: projectIds.map((id) => ({
      projectId: id,
      // Nom masqué si le lecteur n'a pas accès au projet (aucune découverte par l'organisation).
      name: names.get(id) ?? null,
      owned: owned.some((p) => p.id === id),
      participation: participations.find((p) => p.projectId === id) ?? null,
      mandates: mandates.filter((m) => m.m.projectId === id).map((m) => ({
        ...mandateView(m.m, names), representativeName: shownName({ displayName: m.displayName }, { displayName: m.personName }),
        projectSide: access.can.manage ? sides.get(m.m.id) ?? "non_invite" : null,
      })),
      representedBy: representations.filter((r) => r.projectId === id).map((r) => ({ membershipId: r.membershipId, status: r.status })),
    })),
    // Les projets dont VOUS êtes propriétaire : déclarer cette organisation comme partie propriétaire (OP-D1 a).
    yourProjects: access.can.manage ? yours.map((p) => ({ projectId: p.id, name: `${p.code} — ${p.name}`, owningOrganizationId: p.organizationId, owningIsThis: p.organizationId === orgId })) : [],
  });
});

/** Propriétaire du projet ET administrateur de l'organisation ; 404 sans accès au projet. */
async function ownerAndAdmin(req: Request, res: Response) {
  const access = await orgOr404(req, res, "manage");
  if (!access) return null;
  const project = await loadProjectAccess(String(req.params["projectId"] ?? ""), req.user!.id);
  if (!project) { res.status(404).json({ error: "project_not_found" }); return null; }
  if (project.role !== "proprietaire") {
    res.status(403).json({ error: "project_owner_required", message: "Réservé au propriétaire du projet." });
    return null;
  }
  return { access, project };
}

organizationsRouter.put("/:orgId/projects/:projectId/participation", async (req, res) => {
  const ctx = await ownerAndAdmin(req, res);
  if (!ctx) return;
  const parsed = z.object({ businessRole: optionalText(120) }).strict().safeParse(req.body ?? {});
  if (!parsed.success) return invalid(res, parsed.error.flatten());
  const outcome = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`org-participation:${ctx.access.org.id}:${ctx.project.id}`}))`);
    const [existing] = await tx.select().from(projectParticipations)
      .where(and(eq(projectParticipations.projectId, ctx.project.id), eq(projectParticipations.organizationId, ctx.access.org.id), ne(projectParticipations.status, "terminee"))).limit(1);
    if (existing) return { status: 200, body: { participationId: existing.id, status: existing.status, created: false } };
    const id = newId("ppa");
    // Une participation d'organisation n'a pas de compte : elle n'ouvre aucun accès ; ses représentants agissent par leur compte.
    await tx.insert(projectParticipations).values({ id, projectId: ctx.project.id, organizationId: ctx.access.org.id, businessRole: parsed.data.businessRole, status: "active", startsOn: today(), createdBy: req.user!.id });
    await audit(tx, { actorId: req.user!.id, action: "organization.project.participation_recorded", target: { type: "organization", id: ctx.access.org.id }, metadata: { projectId: ctx.project.id, participationId: id }, ip: clientIp(req) });
    return { status: 201, body: { participationId: id, status: "active", created: true } };
  });
  res.status(outcome.status).json(outcome.body);
});

organizationsRouter.put("/:orgId/projects/:projectId/owner", async (req, res) => {
  const ctx = await ownerAndAdmin(req, res);
  if (!ctx) return;
  const before = ctx.project.organizationId;
  await db.transaction(async (tx) => {
    await tx.update(projects).set({ organizationId: ctx.access.org.id }).where(eq(projects.id, ctx.project.id));
    await audit(tx, { actorId: req.user!.id, action: "organization.project.owner_declared", target: { type: "organization", id: ctx.access.org.id }, metadata: { projectId: ctx.project.id, before, after: ctx.access.org.id }, ip: clientIp(req) });
  });
  // Aucun droit ne change : la personne propriétaire reste le gardien du projet (OP-D1 a).
  res.json({ projectId: ctx.project.id, owningOrganizationId: ctx.access.org.id, accessChanged: false });
});

organizationsRouter.delete("/:orgId/projects/:projectId/owner", async (req, res) => {
  const project = await loadProjectAccess(String(req.params["projectId"] ?? ""), req.user!.id);
  if (!project) { res.status(404).json({ error: "not_found" }); return; }
  if (project.role !== "proprietaire") { res.status(403).json({ error: "project_owner_required", message: "Réservé au propriétaire du projet." }); return; }
  const orgId = String(req.params["orgId"]);
  if (project.organizationId !== orgId) { res.status(404).json({ error: "not_found" }); return; }
  await db.transaction(async (tx) => {
    await tx.update(projects).set({ organizationId: null }).where(and(eq(projects.id, project.id), eq(projects.organizationId, orgId)));
    await audit(tx, { actorId: req.user!.id, action: "organization.project.owner_declared", target: { type: "organization", id: orgId }, metadata: { projectId: project.id, before: orgId, after: null }, ip: clientIp(req) });
  });
  res.json({ projectId: project.id, owningOrganizationId: null, accessChanged: false });
});

const mandateSchema = z.object({
  projectId: z.string().min(1).max(200),
  membershipId: z.string().min(1).max(200),
  responsibilities: responsibilitiesSchema.optional(),
  replacesMandateId: z.string().min(1).max(200).optional(),
  startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  note: optionalText(500),
}).strict();

organizationsRouter.post("/:orgId/mandates", async (req, res) => {
  const access = await orgOr404(req, res, "manage");
  if (!access) return;
  const parsed = mandateSchema.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed.error.flatten());
  const orgId = access.org.id;
  const outcome = await db.transaction(async (tx) => {
    const [participation] = await tx.select().from(projectParticipations)
      .where(and(eq(projectParticipations.projectId, parsed.data.projectId), eq(projectParticipations.organizationId, orgId), ne(projectParticipations.status, "terminee"))).limit(1);
    if (!participation) return { status: 409, body: { error: "not_a_party", message: "L’organisation n’est pas partie à ce projet : le propriétaire du projet doit d’abord l’y enregistrer." } };
    const [membership] = await tx.select({ m: organizationMemberships, userId: people.userId }).from(organizationMemberships)
      .innerJoin(people, eq(people.id, organizationMemberships.personId))
      .where(and(eq(organizationMemberships.id, parsed.data.membershipId), eq(organizationMemberships.organizationId, orgId))).limit(1);
    if (!membership) return { status: 404, body: { error: "not_found" } };
    if (membership.m.status !== "active" || !membership.userId) return { status: 409, body: { error: "membership_inactive", message: MANDATE_REFUSAL_MESSAGE.membership_inactive } };
    const [active] = await tx.select().from(organizationMandates)
      .where(and(eq(organizationMandates.organizationId, orgId), eq(organizationMandates.projectId, parsed.data.projectId), eq(organizationMandates.status, "actif"))).limit(1).for("update");
    if (active && active.id !== parsed.data.replacesMandateId) {
      return { status: 409, body: { error: "representative_exists", message: "Un représentant est déjà mandaté : proposez un remplacement de son mandat.", activeMandateId: active.id } };
    }
    if (parsed.data.replacesMandateId && !active) return { status: 409, body: { error: "replaced_changed", message: MANDATE_REFUSAL_MESSAGE.replaced_changed } };
    if (active && active.membershipId === membership.m.id) return { status: 409, body: { error: "same_representative", message: "Cette personne représente déjà l’organisation dans ce projet." } };
    const id = newId("org_mdt");
    const inserted = await tx.insert(organizationMandates).values({
      id, organizationId: orgId, projectId: parsed.data.projectId, participationId: participation.id, membershipId: membership.m.id,
      responsibilities: mandateResponsibilities(parsed.data.responsibilities, active ?? null), replacesMandateId: active?.id ?? null,
      startsOn: parsed.data.startsOn ?? null, note: parsed.data.note, proposedBy: req.user!.id,
    }).onConflictDoNothing().returning();
    if (!inserted[0]) return { status: 409, body: { error: "already_proposed", message: "Un mandat est déjà proposé à cette personne pour ce projet." } };
    await audit(tx, { actorId: req.user!.id, action: "organization.mandate.proposed", target: { type: "organization", id: orgId }, metadata: { mandateId: id, projectId: parsed.data.projectId, membershipId: membership.m.id, replaces: active?.id ?? null }, ip: clientIp(req) });
    return { status: 201, body: { mandate: mandateView(inserted[0], new Map()), grantsAccess: false } };
  });
  res.status(outcome.status).json(outcome.body);
});

async function adminMandate(req: Request, res: Response, to: "annule" | "termine") {
  const access = await orgOr404(req, res, "manage");
  if (!access) return;
  const outcome = await db.transaction(async (tx) => {
    const [m] = await tx.select().from(organizationMandates)
      .where(and(eq(organizationMandates.id, String(req.params["mandateId"])), eq(organizationMandates.organizationId, access.org.id))).limit(1).for("update");
    if (!m) return { status: 404, body: { error: "not_found" } };
    if (!canMandateTransition(m.status, to)) return { status: 409, body: { error: "invalid_transition", message: to === "annule" ? "Seule une proposition en attente s’annule." : "Seul un mandat actif prend fin." } };
    const set = to === "annule" ? { status: to, respondedAt: new Date(), endReason: "annulation" } : { status: to, endedAt: new Date(), endsOn: today(), endReason: "retrait" };
    await tx.update(organizationMandates).set(set).where(eq(organizationMandates.id, m.id));
    await audit(tx, { actorId: req.user!.id, action: to === "annule" ? "organization.mandate.cancelled" : "organization.mandate.ended", target: { type: "organization", id: access.org.id }, metadata: { mandateId: m.id, projectId: m.projectId, reason: set.endReason }, ip: clientIp(req) });
    return { status: 200, body: { status: to } };
  });
  res.status(outcome.status).json(outcome.body);
}

organizationsRouter.post("/:orgId/mandates/:mandateId/cancel", (req, res) => adminMandate(req, res, "annule"));
organizationsRouter.post("/:orgId/mandates/:mandateId/end", (req, res) => adminMandate(req, res, "termine"));
