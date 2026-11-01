/**
 * Collaboration > Équipe et participants (Issue #262, phase 2 ; concept, parties 1 à 3). Monté sous
 * `/projects/:projectId/participants`.
 *
 *   GET    /                          → { project, you, participants, organizations, invitations? } : l'annuaire complet (personnes avec
 *                                       ou sans compte, organisations ; participations terminées comprises) — tout lecteur
 *   GET    /team                      → la vue Équipe : participations en cours portant des responsabilités — tout lecteur
 *   GET    /search?q=&email=          → existant avant création : personnes et organisations visibles, compte par adresse
 *                                       exacte (oui / non seulement) — propriétaire
 *   POST   /contacts                  → contact sans droit (personne sans compte OP-D9, ou organisation) — propriétaire ;
 *                                       409 `existing` avec les fiches proches (aucune fusion automatique)
 *   PATCH  /:participationId          → rôle métier, partie représentée, responsabilités, début ; fiche d'un contact
 *   POST   /:participationId/roles    → rôle par portée (origine `attribution`) ; DELETE /:participationId/roles/:roleId
 *   GET    /:participationId/impact?change=suspendre|reactiver|terminer → aperçu avant confirmation
 *   POST   /:participationId/status   { change, endsOn? } → suspendre, réactiver, terminer
 *   POST   /:participationId/return   → retour : nouvelle participation (contact), anciens droits non restaurés
 *   POST   /:participationId/erase    → effacement d'un contact sans compte (propriétaire ou responsable du projet)
 *   PUT    /closure                   { closed } → clore / rouvrir le projet (déclaratif, aucun droit changé)
 *
 * Droits (choix de la phase 2, PLAN.md tâche 2) : toute écriture est réservée au **propriétaire** (règle actuelle, tant
 * que l'administration déléguée n'est pas décidée — le concept distingue direction de projet et administration),
 * sauf l'effacement d'un contact sur demande, ouvert aussi aux responsables du projet (`isProjectResponsible`) car il
 * ne fait que retirer des données personnelles. Lecture : tout lecteur du projet (accès support compris, lecture
 * seule) ; coordonnées professionnelles des contacts visibles des seuls responsables (OP-D9). Chaque écriture est
 * journalisée dans sa transaction (cible = le projet, jamais une adresse).
 */
import { Router, type Request, type Response } from "express";
import { and, eq, ilike, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { organizations, people, projectParticipations, projectRoleAssignments, projects, users, type ParticipationStatus } from "../db/schema.js";
import { audit, clientIp } from "../lib/audit.js";
import { newId } from "../lib/ids.js";
import { canTransition, roleAssignmentProblems, TEAM_RESPONSIBILITIES, BUSINESS_ROLES, ROLE_SCOPES } from "../lib/participations.js";
import {
  CONTACT_LIMITS, contactProblems, normalizeEmail, normalizeName, roleAssignmentRefusal, STATUS_TARGET, statusChangeRefusal, type StatusChange,
} from "../lib/participants.js";
import {
  applyStatusChange, eraseContactIn, impactOf, listParticipants, lockedParticipation, visibleOrganizationsCondition, visiblePeopleCondition,
} from "../lib/participants-db.js";
import { lockProject, type Tx } from "../lib/step-rows.js";
import { isProjectResponsible } from "../lib/project-responsables.js";
import { projectOrganizations } from "../lib/project-organizations.js";
import { projectOr404, type AccessibleProject } from "../lib/owned-project.js";
import { requireAuth } from "../middleware/require-auth.js";
import { porteeInconnue } from "../lib/portees-db.js";
import { capacitesDePortee, type RoleMetier, type TypePortee } from "@parcours/domain-model";
import { signalerAccesApresEcriture } from "../lib/temps-reel-signaux.js";

export const participantsRouter = Router({ mergeParams: true });
participantsRouter.use(requireAuth);
// Temps réel (Issue #283) : une écriture réussie fait relire tout de suite les droits des connexions du projet (RT-R1).
participantsRouter.use(signalerAccesApresEcriture);

const trimmed = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) => trimmed(max).nullable().optional().transform((v) => (v === undefined ? undefined : v ? v : null));
const responsibilitiesSchema = z.array(z.enum(TEAM_RESPONSIBILITIES as [string, ...string[]])).max(6).transform((v) => [...new Set(v)] as typeof TEAM_RESPONSIBILITIES[number][]);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date AAAA-MM-JJ").nullable().optional();

const contactSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("personne"),
    personId: z.string().max(80).optional(),
    displayName: optionalText(CONTACT_LIMITS.name),
    jobTitle: optionalText(CONTACT_LIMITS.jobTitle),
    workEmail: optionalText(CONTACT_LIMITS.email),
    workPhone: optionalText(CONTACT_LIMITS.phone),
    representedOrganizationId: z.string().max(80).nullable().optional(),
    representedOrganizationName: optionalText(CONTACT_LIMITS.organization),
    businessRole: optionalText(CONTACT_LIMITS.businessRole),
    responsibilities: responsibilitiesSchema.optional(),
    startsOn: dateSchema,
    confirmDistinct: z.boolean().optional(),
  }).strict(),
  z.object({
    kind: z.literal("organisation"),
    organizationId: z.string().max(80).optional(),
    name: optionalText(CONTACT_LIMITS.organization),
    orgKind: optionalText(CONTACT_LIMITS.organization),
    businessRole: optionalText(CONTACT_LIMITS.businessRole),
    responsibilities: responsibilitiesSchema.optional(),
    startsOn: dateSchema,
    confirmDistinct: z.boolean().optional(),
  }).strict(),
]);

const patchSchema = z.object({
  businessRole: optionalText(CONTACT_LIMITS.businessRole),
  representedOrganizationId: z.string().max(80).nullable().optional(),
  representedOrganizationName: optionalText(CONTACT_LIMITS.organization),
  responsibilities: responsibilitiesSchema.optional(),
  startsOn: dateSchema,
  displayName: optionalText(CONTACT_LIMITS.name),
  jobTitle: optionalText(CONTACT_LIMITS.jobTitle),
  workEmail: optionalText(CONTACT_LIMITS.email),
  workPhone: optionalText(CONTACT_LIMITS.phone),
  confirmDistinct: z.boolean().optional(),
}).strict();

const roleSchema = z.object({
  role: z.enum(BUSINESS_ROLES as [string, ...string[]]),
  scopeType: z.enum(ROLE_SCOPES as [string, ...string[]]).default("projet"),
  scopeId: z.string().trim().max(120).nullable().optional(),
}).strict();

const changeSchema = z.enum(["suspendre", "reactiver", "terminer"]);
const statusSchema = z.object({ change: changeSchema, endsOn: dateSchema }).strict();

class HttpError extends Error {
  constructor(readonly status: number, readonly body: Record<string, unknown>) { super(String(body["error"] ?? status)); }
}
const fail = (status: number, error: string, message: string, extra: Record<string, unknown> = {}): never => { throw new HttpError(status, { error, message, ...extra }); };

/** Exécute une écriture : erreurs métier rendues telles quelles, le reste à Express. */
async function write(res: Response, fn: () => Promise<{ status?: number; body: unknown } | null>) {
  try {
    const r = await fn();
    if (!r || res.headersSent) return;  // refus déjà rendu (404 / 403 de `projectOr404`)
    res.status(r.status ?? 200).json(r.body);
  } catch (err) {
    if (err instanceof HttpError) { res.status(err.status).json(err.body); return; }
    throw err;
  }
}

const param = (req: Request, name: string) => (req.params as Record<string, string>)[name] ?? "";

async function readContext(req: Request, res: Response): Promise<{ project: AccessibleProject; responsible: boolean } | null> {
  const project = await projectOr404(req, res, "read");
  if (!project) return null;
  const responsible = project.role !== "support" && await isProjectResponsible(project.id, req.user!.id);
  return { project, responsible };
}

participantsRouter.get("/", async (req, res) => {
  const ctx = await readContext(req, res);
  if (!ctx) return;
  const { participants, invitations } = await listParticipants(ctx.project.id, { responsible: ctx.responsible, youId: req.user!.id });
  res.json({
    project: { id: ctx.project.id, closedAt: ctx.project.closedAt ? ctx.project.closedAt.toISOString() : null },
    you: { userId: req.user!.id, role: ctx.project.role, responsible: ctx.responsible, canManage: ctx.project.role === "proprietaire", canErase: ctx.responsible },
    participants,
    // Partie propriétaire déclarée et organisations parties (phase 5, OP-D1 a) : lecture seule, aucun droit.
    organizations: await projectOrganizations(ctx.project.id, req.user!.id),
    ...(ctx.responsible ? { invitations } : {}),
  });
});

/** Équipe = vue des participations en cours (non terminées) qui portent des responsabilités ; jamais un second annuaire. */
participantsRouter.get("/team", async (req, res) => {
  const ctx = await readContext(req, res);
  if (!ctx) return;
  const { participants } = await listParticipants(ctx.project.id, { responsible: ctx.responsible, youId: req.user!.id });
  res.json({ team: participants.filter((p) => p.status !== "terminee" && p.responsibilities.length > 0) });
});

participantsRouter.get("/search", async (req, res) => {
  const project = await projectOr404(req, res, "owner");
  if (!project) return;
  const q = typeof req.query["q"] === "string" ? req.query["q"].trim().slice(0, 200) : "";
  const email = typeof req.query["email"] === "string" ? normalizeEmail(req.query["email"].slice(0, 254)) : "";
  res.json(await searchExisting(db, project.id, req.user!.id, q, email));
});

type Matches = Awaited<ReturnType<typeof searchExisting>>;

/**
 * Recherche d'existant (concept 3 « Record participants ») : personnes et organisations VISIBLES du propriétaire (créées
 * par lui ou présentes dans un de ses projets), par nom (casse et accents ignorés) ou par adresse exacte ; pour un compte,
 * seulement son existence (il s'ajoute par le partage, jamais par ressemblance). Rien n'est fusionné.
 */
async function searchExisting(q: Pick<typeof db, "select">, projectId: string, actorId: string, name: string, email: string) {
  const pattern = name ? `%${name.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
  const peopleRows = (pattern || email)
    ? await q.select({ id: people.id, displayName: people.displayName, jobTitle: people.jobTitle, workEmail: people.workEmail, userId: people.userId, accountName: users.displayName, accountEmail: users.email, erasedAt: people.erasedAt })
      .from(people).leftJoin(users, eq(users.id, people.userId))
      .where(and(visiblePeopleCondition(actorId), sql`${people.erasedAt} IS NULL`, or(
        pattern ? ilike(people.displayName, pattern) : sql`false`,
        pattern ? ilike(users.displayName, pattern) : sql`false`,
        email ? sql`lower(${people.workEmail}) = ${email}` : sql`false`,
        email ? sql`lower(${users.email}) = ${email}` : sql`false`,
      ))).limit(25)
    : [];
  const orgRows = pattern
    ? await q.select({ id: organizations.id, name: organizations.name, kind: organizations.kind, status: organizations.status }).from(organizations)
      .where(and(visibleOrganizationsCondition(actorId), ilike(organizations.name, pattern))).limit(25)
    : [];
  const here = peopleRows.length || orgRows.length
    ? await q.select({ personId: projectParticipations.personId, organizationId: projectParticipations.organizationId, id: projectParticipations.id, status: projectParticipations.status })
      .from(projectParticipations).where(and(eq(projectParticipations.projectId, projectId), ne(projectParticipations.status, "terminee")))
    : [];
  const [account] = email ? await q.select({ id: users.id }).from(users).where(and(sql`lower(${users.email}) = ${email}`, ne(users.status, "closed"))).limit(1) : [];
  return {
    people: peopleRows.map((p) => {
      const current = here.find((h) => h.personId === p.id);
      const emailMatch = Boolean(email) && [p.workEmail, p.accountEmail].some((a) => a && normalizeEmail(a) === email);
      return { id: p.id, displayName: p.userId ? (p.accountName || p.accountEmail) : p.displayName, jobTitle: p.jobTitle, hasAccount: Boolean(p.userId), participationId: current?.id ?? null, participationStatus: current?.status ?? null, emailMatch };
    }),
    organizations: orgRows.map((o) => {
      const current = here.find((h) => h.organizationId === o.id);
      return { ...o, participationId: current?.id ?? null, participationStatus: current?.status ?? null };
    }),
    accountExists: Boolean(account),
  };
}

/** Organisation représentée : une fiche visible existante, ou une nouvelle (refusée si un homonyme exact existe). */
async function representedOrganization(tx: Tx, req: Request, projectId: string, input: { id?: string | null | undefined; name?: string | null | undefined }, confirmDistinct: boolean): Promise<string | null | undefined> {
  if (input.id) {
    const [org] = await tx.select({ id: organizations.id }).from(organizations).where(and(eq(organizations.id, input.id), visibleOrganizationsCondition(req.user!.id))).limit(1);
    if (!org) fail(404, "not_found", "Organisation introuvable.");
    return input.id;
  }
  if (input.id === null) return null;
  if (!input.name) return undefined;
  return createOrganization(tx, req, projectId, input.name, null, confirmDistinct);
}

async function createOrganization(tx: Tx, req: Request, projectId: string, name: string, kind: string | null, confirmDistinct: boolean): Promise<string> {
  const matches = await searchExisting(tx, projectId, req.user!.id, name, "");
  const exact = matches.organizations.filter((o) => normalizeName(o.name) === normalizeName(name));
  if (exact.length && !confirmDistinct) fail(409, "existing", "Une organisation porte déjà ce nom : choisissez-la, ou confirmez qu'il s'agit d'une autre organisation.", { matches: { ...matches, people: [] } });
  const id = newId("org");
  await tx.insert(organizations).values({ id, name, kind, createdBy: req.user!.id });
  await audit(tx, { actorId: req.user!.id, action: "organization.created", target: { type: "project", id: projectId }, metadata: { organizationId: id }, ip: clientIp(req) });
  return id;
}

/** Refus 409 d'un doublon probable de personne : même nom normalisé ou même adresse (compte ou e-mail professionnel). */
function duplicatePeople(matches: Matches, name: string, email: string): Matches["people"] {
  return matches.people.filter((p) => (name && normalizeName(p.displayName ?? "") === normalizeName(name)) || (email && p.emailMatch));
}

participantsRouter.post("/contacts", (req, res) => write(res, async () => {
  const project = await projectOr404(req, res, "owner");
  if (!project) return null;
  const parsed = contactSchema.safeParse(req.body);
  if (!parsed.success) fail(400, "invalid_input", "Saisie invalide.", { details: parsed.error!.flatten() });
  const input = parsed.data!;
  return db.transaction(async (tx) => {
    await lockProject(tx, project.id);
    const actor = req.user!.id;
    const ip = clientIp(req);
    let personId: string | null = null;
    let organizationId: string | null = null;
    let created = false;
    let represented: string | null | undefined;
    if (input.kind === "personne") {
      if (input.personId) {
        const [p] = await tx.select({ id: people.id }).from(people).where(and(eq(people.id, input.personId), visiblePeopleCondition(actor), sql`${people.erasedAt} IS NULL`)).limit(1);
        if (!p) fail(404, "not_found", "Fiche introuvable.");
        personId = input.personId;
      } else {
        const problems = contactProblems(input);
        if (problems.length) fail(422, "contact_rule", problems.join(" ; "), { problems });
        const email = input.workEmail ? normalizeEmail(input.workEmail) : "";
        const matches = await searchExisting(tx, project.id, actor, input.displayName!, email);
        const dup = duplicatePeople(matches, input.displayName!, email);
        if (email && matches.people.some((p) => p.participationId && dup.includes(p))) {
          fail(409, "existing", "Cette personne figure déjà dans l'annuaire du projet : ouvrez sa fiche.", { matches, blocking: true });
        }
        if ((dup.length || matches.accountExists) && !input.confirmDistinct) {
          fail(409, "existing", matches.accountExists
            ? "Un compte Fadi existe pour cette adresse : donnez-lui accès par le partage (Membres) plutôt que de créer un contact, ou confirmez un contact distinct."
            : "Une fiche proche existe déjà : réutilisez-la, ou confirmez qu'il s'agit d'une autre personne.", { matches });
        }
        personId = newId("per");
        await tx.insert(people).values({ id: personId, displayName: input.displayName!, jobTitle: input.jobTitle ?? null, workEmail: input.workEmail ? normalizeEmail(input.workEmail) : null, workPhone: input.workPhone ?? null, createdBy: actor });
        created = true;
      }
      represented = await representedOrganization(tx, req, project.id, { id: input.representedOrganizationId, name: input.representedOrganizationName }, Boolean(input.confirmDistinct));
    } else {
      if (input.organizationId) {
        const [o] = await tx.select({ id: organizations.id }).from(organizations).where(and(eq(organizations.id, input.organizationId), visibleOrganizationsCondition(actor))).limit(1);
        if (!o) fail(404, "not_found", "Organisation introuvable.");
        organizationId = input.organizationId;
      } else {
        if (!input.name) fail(422, "contact_rule", "nom : requis pour une organisation", { problems: ["nom : requis pour une organisation"] });
        organizationId = await createOrganization(tx, req, project.id, input.name!, input.orgKind ?? null, Boolean(input.confirmDistinct));
      }
    }
    const [current] = await tx.select({ id: projectParticipations.id }).from(projectParticipations).where(and(
      eq(projectParticipations.projectId, project.id), ne(projectParticipations.status, "terminee"),
      personId ? eq(projectParticipations.personId, personId) : eq(projectParticipations.organizationId, organizationId!),
    )).limit(1);
    if (current) fail(409, "existing", "Déjà dans l'annuaire du projet : ouvrez sa fiche.", { participationId: current.id, blocking: true });
    const id = newId("ppa");
    await tx.insert(projectParticipations).values({
      id, projectId: project.id, personId, organizationId, representedOrganizationId: represented ?? null, businessRole: input.businessRole ?? null,
      responsibilities: input.responsibilities ?? [], status: "contact", startsOn: input.startsOn ?? null, createdBy: actor,
    });
    if (created) await audit(tx, { actorId: actor, action: "person.contact_created", target: { type: "project", id: project.id }, metadata: { personId, participationId: id }, ip });
    await audit(tx, { actorId: actor, action: "participation.created", target: { type: "project", id: project.id }, metadata: { participationId: id, personId, organizationId, status: "contact", responsibilities: input.responsibilities ?? [] }, ip });
    return { status: 201, body: { id, personId, organizationId, status: "contact" } };
  });
}));

participantsRouter.patch("/:participationId", (req, res) => write(res, async () => {
  const project = await projectOr404(req, res, "owner");
  if (!project) return null;
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) fail(400, "invalid_input", "Saisie invalide.", { details: parsed.error!.flatten() });
  const input = parsed.data!;
  return db.transaction(async (tx) => {
    const row = await lockedParticipation(tx, project.id, param(req, "participationId"));
    if (!row) fail(404, "not_found", "Participation introuvable.");
    const r = row!;
    if (r.p.status === "terminee") fail(409, "participation_ended", "Participation terminée : son historique est figé ; ouvrez une nouvelle participation.");
    const contactFields = (["displayName", "jobTitle", "workEmail", "workPhone"] as const).filter((k) => input[k] !== undefined);
    if (contactFields.length) {
      if (!r.pe || r.pe.userId) fail(422, "contact_rule", "Seule la fiche d'un contact sans compte se modifie ici ; un compte garde l'identité de son compte.");
      if (r.pe!.erasedAt) fail(409, "contact_erased", "Contact effacé : sa fiche ne se modifie plus.");
      const next = { displayName: input.displayName ?? r.pe!.displayName, jobTitle: input.jobTitle === undefined ? r.pe!.jobTitle : input.jobTitle, workEmail: input.workEmail === undefined ? r.pe!.workEmail : input.workEmail, workPhone: input.workPhone === undefined ? r.pe!.workPhone : input.workPhone };
      const problems = contactProblems(next);
      if (problems.length) fail(422, "contact_rule", problems.join(" ; "), { problems });
      await tx.update(people).set({ ...next, workEmail: next.workEmail ? normalizeEmail(next.workEmail) : null, updatedAt: new Date() }).where(eq(people.id, r.pe!.id));
    }
    const represented = await representedOrganization(tx, req, project.id, { id: input.representedOrganizationId, name: input.representedOrganizationName }, Boolean(input.confirmDistinct));
    if (input.startsOn && r.p.status !== "contact" && r.userId && !r.isOwner && input.startsOn > new Date().toISOString().slice(0, 10)) {
      fail(422, "period_rule", "Un début futur suspendrait l'accès en cours : suspendez la participation si c'est voulu.");
    }
    const set: Partial<typeof projectParticipations.$inferInsert> = { updatedAt: new Date() };
    const fields: string[] = [...contactFields];
    if (input.businessRole !== undefined) { set.businessRole = input.businessRole; fields.push("businessRole"); }
    if (represented !== undefined) { set.representedOrganizationId = represented; fields.push("representedOrganization"); }
    if (input.responsibilities !== undefined) { set.responsibilities = input.responsibilities; fields.push("responsibilities"); }
    if (input.startsOn !== undefined) { set.startsOn = input.startsOn; fields.push("startsOn"); }
    if (!fields.length) fail(400, "invalid_input", "Aucun changement demandé.");
    await tx.update(projectParticipations).set(set).where(eq(projectParticipations.id, r.p.id));
    await audit(tx, { actorId: req.user!.id, action: "participation.updated", target: { type: "project", id: project.id }, metadata: { participationId: r.p.id, personId: r.p.personId, organizationId: r.p.organizationId, fields, ...(input.responsibilities ? { responsibilities: input.responsibilities } : {}) }, ip: clientIp(req) });
    return { body: { id: r.p.id, fields } };
  });
}));

participantsRouter.post("/:participationId/roles", (req, res) => write(res, async () => {
  const project = await projectOr404(req, res, "owner");
  if (!project) return null;
  const parsed = roleSchema.safeParse(req.body);
  if (!parsed.success) fail(400, "invalid_input", "Saisie invalide.", { details: parsed.error!.flatten() });
  const input = { ...parsed.data!, scopeId: parsed.data!.scopeType === "projet" ? null : parsed.data!.scopeId ?? null };
  const problems = roleAssignmentProblems(input);
  if (problems.length) fail(422, "role_rule", problems.join(" ; "), { problems });
  return db.transaction(async (tx) => {
    await lockProject(tx, project.id);
    const row = await lockedParticipation(tx, project.id, param(req, "participationId"));
    if (!row) fail(404, "not_found", "Participation introuvable.");
    const r = row!;
    const refusal = roleAssignmentRefusal({ isOwner: r.isOwner, hasAccount: Boolean(r.userId), isOrganization: !r.pe, status: r.p.status });
    if (refusal) fail(422, "role_rule", refusal);
    // Portée étroite : l'élément désigné (étude, variante, révision, documents) doit exister dans CE projet.
    const scopeProblem = await porteeInconnue(tx, project.id, input.scopeType as TypePortee, input.scopeId);
    if (scopeProblem) fail(422, "scope_rule", scopeProblem);
    const id = newId("pra");
    const inserted = await tx.insert(projectRoleAssignments).values({ id, participationId: r.p.id, role: input.role as never, scopeType: input.scopeType as never, scopeId: input.scopeId, origin: "attribution", grantedBy: req.user!.id })
      .onConflictDoNothing().returning({ id: projectRoleAssignments.id });
    if (!inserted.length) fail(409, "existing", "Ce rôle est déjà attribué à cette portée.");
    await audit(tx, { actorId: req.user!.id, action: "participation.role_assigned", target: { type: "project", id: project.id }, metadata: { participationId: r.p.id, memberId: r.userId, roleId: id, role: input.role, scopeType: input.scopeType, scopeId: input.scopeId }, ip: clientIp(req) });
    return { status: 201, body: { id, role: input.role, scopeType: input.scopeType, scopeId: input.scopeId, origin: "attribution", capacites: capacitesDePortee(input.role as RoleMetier, input.scopeType as TypePortee) } };
  });
}));

participantsRouter.delete("/:participationId/roles/:roleId", (req, res) => write(res, async () => {
  const project = await projectOr404(req, res, "owner");
  if (!project) return null;
  return db.transaction(async (tx) => {
    await lockProject(tx, project.id);
    const row = await lockedParticipation(tx, project.id, param(req, "participationId"));
    if (!row) fail(404, "not_found", "Participation introuvable.");
    const r = row!;
    if (r.p.status === "terminee") fail(409, "participation_ended", "Participation terminée : son historique est figé.");
    const [role] = await tx.select().from(projectRoleAssignments).where(and(eq(projectRoleAssignments.id, param(req, "roleId")), eq(projectRoleAssignments.participationId, r.p.id))).limit(1);
    if (!role) fail(404, "not_found", "Rôle introuvable.");
    if (role!.origin === "acces") fail(422, "role_rule", "Ce rôle vient du partage du projet : changez-le ou retirez l'accès depuis « Membres du projet ».");
    await tx.delete(projectRoleAssignments).where(eq(projectRoleAssignments.id, role!.id));
    await audit(tx, { actorId: req.user!.id, action: "participation.role_removed", target: { type: "project", id: project.id }, metadata: { participationId: r.p.id, memberId: r.userId, roleId: role!.id, role: role!.role, scopeType: role!.scopeType, scopeId: role!.scopeId }, ip: clientIp(req) });
    return { body: { removed: role!.id } };
  });
}));

participantsRouter.get("/:participationId/impact", async (req, res) => {
  const project = await projectOr404(req, res, "owner");
  if (!project) return;
  const change = changeSchema.safeParse(req.query["change"]);
  if (!change.success) { res.status(400).json({ error: "invalid_input", message: "change : suspendre, reactiver ou terminer." }); return; }
  const impact = await impactOf(db, project.id, param(req, "participationId"), change.data);
  if (!impact) { res.status(404).json({ error: "not_found" }); return; }
  res.json(impact);
});

participantsRouter.post("/:participationId/status", (req, res) => write(res, async () => {
  const project = await projectOr404(req, res, "owner");
  if (!project) return null;
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) fail(400, "invalid_input", "Saisie invalide.", { details: parsed.error!.flatten() });
  const change: StatusChange = parsed.data!.change;
  return db.transaction(async (tx) => {
    await lockProject(tx, project.id);
    const row = await lockedParticipation(tx, project.id, param(req, "participationId"));
    if (!row) fail(404, "not_found", "Participation introuvable.");
    const r = row!;
    const to: ParticipationStatus = STATUS_TARGET[change];
    const refusal = statusChangeRefusal(change, { status: r.p.status, isOwner: r.isOwner }) ?? (canTransition(r.p.status, to) ? null : `Transition impossible : ${r.p.status} → ${to}.`);
    if (refusal) fail(409, "invalid_transition", refusal, { status: r.p.status });
    if (parsed.data!.endsOn && r.p.startsOn && parsed.data!.endsOn < r.p.startsOn) fail(422, "period_rule", "La fin précède le début de la participation.");
    const impact = await impactOf(tx, project.id, r.p.id, change);
    const { invitationsCancelled } = await applyStatusChange(tx, { projectId: project.id, participationId: r.p.id, userId: r.userId, accountEmail: r.accountEmail, workEmail: r.pe?.workEmail ?? null, to, endsOn: parsed.data!.endsOn ?? null });
    await audit(tx, {
      actorId: req.user!.id, action: "participation.status_changed", target: { type: "project", id: project.id },
      metadata: { participationId: r.p.id, personId: r.p.personId, organizationId: r.p.organizationId, memberId: r.userId, from: r.p.status, to, accessWithdrawn: impact?.accessWithdrawn ?? false, invitationsCancelled },
      ip: clientIp(req),
    });
    return { body: { id: r.p.id, status: to, invitationsCancelled } };
  });
}));

/** Retour d'un participant : même identité, nouvelle participation (contact), aucun ancien droit restauré d'office. */
participantsRouter.post("/:participationId/return", (req, res) => write(res, async () => {
  const project = await projectOr404(req, res, "owner");
  if (!project) return null;
  return db.transaction(async (tx) => {
    await lockProject(tx, project.id);
    const row = await lockedParticipation(tx, project.id, param(req, "participationId"));
    if (!row) fail(404, "not_found", "Participation introuvable.");
    const r = row!;
    if (r.p.status !== "terminee") fail(409, "invalid_transition", "Seule une participation terminée ouvre un retour.");
    if (r.pe?.erasedAt) fail(409, "contact_erased", "Contact effacé : enregistrez une nouvelle fiche.");
    const [current] = await tx.select({ id: projectParticipations.id }).from(projectParticipations).where(and(
      eq(projectParticipations.projectId, project.id), ne(projectParticipations.status, "terminee"),
      r.p.personId ? eq(projectParticipations.personId, r.p.personId) : eq(projectParticipations.organizationId, r.p.organizationId!),
    )).limit(1);
    if (current) fail(409, "existing", "Une participation en cours existe déjà : ouvrez sa fiche.", { participationId: current.id });
    const id = newId("ppa");
    await tx.insert(projectParticipations).values({
      id, projectId: project.id, personId: r.p.personId, organizationId: r.p.organizationId, representedOrganizationId: r.p.representedOrganizationId,
      businessRole: r.p.businessRole, responsibilities: [], status: "contact", createdBy: req.user!.id,
    });
    await audit(tx, { actorId: req.user!.id, action: "participation.created", target: { type: "project", id: project.id }, metadata: { participationId: id, personId: r.p.personId, organizationId: r.p.organizationId, status: "contact", returnOf: r.p.id }, ip: clientIp(req) });
    return { status: 201, body: { id, status: "contact", returnOf: r.p.id } };
  });
}));

/** Effacement sur demande d'un contact sans compte (OP-D9) : propriétaire ou responsable du projet. */
participantsRouter.post("/:participationId/erase", (req, res) => write(res, async () => {
  const project = await projectOr404(req, res, "read");
  if (!project) return null;
  if (project.role === "support" || !(await isProjectResponsible(project.id, req.user!.id))) {
    fail(403, "forbidden", "Effacement réservé au propriétaire et aux responsables du projet.");
  }
  return db.transaction(async (tx) => {
    const [row] = await tx.select({ personId: projectParticipations.personId, userId: people.userId, erasedAt: people.erasedAt }).from(projectParticipations)
      .leftJoin(people, eq(people.id, projectParticipations.personId))
      .where(and(eq(projectParticipations.id, param(req, "participationId")), eq(projectParticipations.projectId, project.id))).limit(1);
    if (!row) fail(404, "not_found", "Participation introuvable.");
    if (!row!.personId || row!.userId) fail(422, "contact_rule", "Seul un contact sans compte s'efface ici ; les données d'un compte suivent la suppression du compte.");
    if (row!.erasedAt) fail(409, "contact_erased", "Ce contact est déjà effacé.");
    await eraseContactIn(tx, row!.personId!, { actorId: req.user!.id, via: "demande", ip: clientIp(req) });
    return { body: { personId: row!.personId, erased: true } };
  });
}));

/** Clore / rouvrir le projet : déclaratif (aucun droit changé) ; date le départ du délai de conservation des contacts. */
participantsRouter.put("/closure", (req, res) => write(res, async () => {
  const project = await projectOr404(req, res, "owner");
  if (!project) return null;
  const parsed = z.object({ closed: z.boolean() }).strict().safeParse(req.body);
  if (!parsed.success) fail(400, "invalid_input", "closed : vrai ou faux.");
  const closed = parsed.data!.closed;
  return db.transaction(async (tx) => {
    const [before] = await tx.select({ closedAt: projects.closedAt }).from(projects).where(eq(projects.id, project.id)).limit(1).for("update");
    if (Boolean(before?.closedAt) === closed) return { body: { closedAt: before?.closedAt ? before.closedAt.toISOString() : null, unchanged: true } };
    const [row] = await tx.update(projects).set({ closedAt: closed ? new Date() : null }).where(eq(projects.id, project.id)).returning({ closedAt: projects.closedAt });
    await audit(tx, { actorId: req.user!.id, action: closed ? "project.closed" : "project.reopened", target: { type: "project", id: project.id }, metadata: {}, ip: clientIp(req) });
    return { body: { closedAt: row?.closedAt ? row.closedAt.toISOString() : null } };
  });
}));
