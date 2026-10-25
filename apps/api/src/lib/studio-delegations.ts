/**
 * Délégations d'approbation des publications Studio (EX-085) — le serveur fait seul autorité. Règles pures :
 * `@parcours/atelier-model` (`delegation-approbation.ts`) ; routes : `routes/studio-publications.ts`.
 *
 * - Créer : le délégant est l'acteur ; il détient lui-même, maintenant, le droit d'approuver sur toute la portée
 *   (projet : rôle de portée projet ; étude, variante, publication : rôle de projet ou portée étroite qui la couvre) ;
 *   le délégué est un autre compte qui lit le projet ; période bornée, motif requis. Journal « creer ».
 * - Révoquer : le délégant ou le propriétaire du projet, motivé, une seule fois. Journal « revoquer ».
 * - Employer : `approuver` ou `refuser` une publication avec `delegationId` (jamais implicite, jamais `diffuser`) ; la
 *   délégation est revérifiée sous la transaction de la transition (délégué, période, révocation, portée, droit actuel
 *   du délégant) ; la réservation d'édition d'un autre compte que le délégué bloque (423). Journal « employer » et
 *   `delegationId` porté par l'évènement de la publication.
 * - Une délégation n'approuve rien par elle-même : aucune publication ne change de statut à sa création, son
 *   expiration ou sa révocation (l'absence d'un approbateur ne vaut pas accord).
 */
import { and, asc, eq, inArray, or } from "drizzle-orm";
import { z } from "zod";
import {
  etatDelegation, MESSAGES_PROBLEME_DELEGATION, problemesNouvelleDelegation, verifierDelegation,
  type CibleApprobation, type DelegationApprobation, type EtatDelegation, type PorteeDelegation,
} from "@parcours/atelier-model";
import type { CiblePortee } from "@parcours/domain-model";
import { db } from "../db/client.js";
import {
  studioApprovalDelegationEvents, studioApprovalDelegations, studioPublications, studioStudies, studioVariants, users,
  type StudioDelegationEventAction, type StudioDelegationScopeType,
} from "../db/schema.js";
import type { Tx } from "./atelier-validation.js";
import { newId } from "./ids.js";
import { activeLock, loadProjectAccess, lockedMessage, projectAccessRefusal, type AccessibleProject } from "./owned-project.js";
import type { Querier } from "./step-rows.js";
import { assertAccess, lockedAccess, notFound, StudioRequestError, studioIdentifierSchema } from "./studio-commands.js";

const iso = z.string().trim().min(1).max(40).refine((v) => !Number.isNaN(Date.parse(v)), "Date ISO 8601 attendue.");
export const studioDelegationCreateSchema = z.object({
  delegateId: studioIdentifierSchema,
  scopeType: z.enum(["projet", "etude", "variante", "publication"]),
  scopeId: studioIdentifierSchema.optional(),
  startsAt: iso,
  endsAt: iso,
  reason: z.string().trim().min(1).max(2000),
  requestId: studioIdentifierSchema.optional(),
}).strict();
export const studioDelegationRevokeSchema = z.object({ reason: z.string().trim().min(1).max(2000) }).strict();
export type StudioDelegationCreateInput = z.infer<typeof studioDelegationCreateSchema>;

type DelegationRow = typeof studioApprovalDelegations.$inferSelect;
type Who = { id: string; email: string };

export interface StudioDelegationEventView { id: string; action: StudioDelegationEventAction; actor: Who; publicationId: string | null; publicationAction: "approuver" | "refuser" | null; comment: string | null; createdAt: string }
export interface StudioDelegationView {
  id: string; projectId: string; delegator: Who; delegate: Who;
  scope: { type: StudioDelegationScopeType; id: string | null };
  startsAt: string; endsAt: string; reason: string; createdAt: string;
  /** État à l'instant de la lecture (a-venir, active, expiree, revoquee). */
  state: EtatDelegation;
  revocation: { by: Who; at: string; reason: string } | null;
  /** Indication d'interface (le serveur revérifie) : l'acteur peut révoquer. */
  canRevoke: boolean;
  events: StudioDelegationEventView[];
}

/** Portée pure d'une ligne. */
export const porteeDe = (row: Pick<DelegationRow, "scopeType" | "scopeId">): PorteeDelegation =>
  (row.scopeType === "projet" ? { type: "projet" } : { type: row.scopeType, id: row.scopeId ?? "" });
export const delegationDe = (row: DelegationRow): DelegationApprobation => ({
  id: row.id, delegantId: row.delegatorId, delegueId: row.delegateId, portee: porteeDe(row),
  debut: row.startsAt.toISOString(), fin: row.endsAt.toISOString(), motif: row.reason, revoqueeLe: row.revokedAt?.toISOString() ?? null,
});

async function emails(q: Querier, ids: (string | null)[]): Promise<Map<string, string>> {
  const wanted = [...new Set(ids.filter((x): x is string => !!x))];
  if (!wanted.length) return new Map();
  const rows = await q.select({ id: users.id, email: users.email }).from(users).where(inArray(users.id, wanted));
  return new Map(rows.map((r) => [r.id, r.email]));
}

async function vues(q: Querier, access: AccessibleProject, actorId: string, rows: DelegationRow[]): Promise<StudioDelegationView[]> {
  if (!rows.length) return [];
  const evts = await q.select().from(studioApprovalDelegationEvents).where(inArray(studioApprovalDelegationEvents.delegationId, rows.map((r) => r.id)))
    .orderBy(asc(studioApprovalDelegationEvents.createdAt), asc(studioApprovalDelegationEvents.id));
  const mails = await emails(q, [...rows.flatMap((r) => [r.delegatorId, r.delegateId, r.revokedBy]), ...evts.map((e) => e.actorId)]);
  const who = (id: string) => ({ id, email: mails.get(id) ?? "" });
  const now = new Date();
  return rows.map((r) => ({
    id: r.id, projectId: r.projectId, delegator: who(r.delegatorId), delegate: who(r.delegateId),
    scope: { type: r.scopeType, id: r.scopeId }, startsAt: r.startsAt.toISOString(), endsAt: r.endsAt.toISOString(), reason: r.reason,
    createdAt: r.createdAt.toISOString(), state: etatDelegation(delegationDe(r), now),
    revocation: r.revokedAt && r.revokedBy ? { by: who(r.revokedBy), at: r.revokedAt.toISOString(), reason: r.revokeReason ?? "" } : null,
    canRevoke: r.revokedAt === null && (r.delegatorId === actorId || access.role === "proprietaire"),
    events: evts.filter((e) => e.delegationId === r.id).map((e) => ({
      id: e.id, action: e.action, actor: who(e.actorId), publicationId: e.publicationId, publicationAction: e.publicationAction ?? null, comment: e.comment, createdAt: e.createdAt.toISOString(),
    })),
  }));
}

/**
 * Délégations du projet visibles par l'acteur : toutes pour le propriétaire, sinon celles dont il est délégant ou délégué
 * (une délégation ne se diffuse pas à tous les participants). Droit `read`.
 */
export async function listStudioDelegations(projectId: string, actorId: string): Promise<{ delegations: StudioDelegationView[] }> {
  const access = assertAccess(await loadProjectAccess(projectId, actorId), actorId, "read");
  const rows = await db.select().from(studioApprovalDelegations).where(access.role === "proprietaire"
    ? eq(studioApprovalDelegations.projectId, projectId)
    : and(eq(studioApprovalDelegations.projectId, projectId), or(eq(studioApprovalDelegations.delegatorId, actorId), eq(studioApprovalDelegations.delegateId, actorId))))
    .orderBy(asc(studioApprovalDelegations.createdAt), asc(studioApprovalDelegations.id));
  return { delegations: await vues(db, access, actorId, rows) };
}

const refusEntree = (code: string, message: string): never => { throw new StudioRequestError(400, { error: "invalid_input", code, message }); };

/** Cible de la portée, relue dans CE projet (étude, variante ou publication inconnue : 400). */
async function cibleDeLaPortee(tx: Tx, projectId: string, type: StudioDelegationScopeType, id: string | undefined): Promise<CiblePortee | undefined> {
  if (type === "projet") {
    if (id !== undefined) refusEntree("portee_invalide", MESSAGES_PROBLEME_DELEGATION["portee-invalide"]);
    return undefined;
  }
  if (id === undefined) return refusEntree("portee_invalide", MESSAGES_PROBLEME_DELEGATION["portee-invalide"]);
  if (type === "etude") {
    const [s] = await tx.select({ id: studioStudies.id }).from(studioStudies).where(and(eq(studioStudies.id, id), eq(studioStudies.projectId, projectId))).limit(1);
    if (!s) refusEntree("portee_inconnue", "Étude inconnue dans ce projet.");
    return { studyId: id };
  }
  if (type === "variante") {
    const [v] = await tx.select({ id: studioVariants.id, studyId: studioVariants.studyId }).from(studioVariants).innerJoin(studioStudies, eq(studioStudies.id, studioVariants.studyId))
      .where(and(eq(studioVariants.id, id), eq(studioStudies.projectId, projectId))).limit(1);
    if (!v) return refusEntree("portee_inconnue", "Variante inconnue dans ce projet.");
    return { variantIds: [v.id] };
  }
  const [p] = await tx.select().from(studioPublications).where(and(eq(studioPublications.id, id), eq(studioPublications.projectId, projectId))).limit(1);
  if (!p) return refusEntree("portee_inconnue", "Publication inconnue dans ce projet.");
  return ciblePublicationDe(p);
}

/** Périmètre d'une publication pour les portées : son étude, toutes ses variantes et sa révision. */
export function ciblePublicationDe(row: Pick<typeof studioPublications.$inferSelect, "studyId" | "variantId" | "revisionId" | "manifest">): CiblePortee {
  return { studyId: row.studyId, variantIds: [...new Set([row.variantId, ...(row.manifest?.sources.map((s) => s.variantId) ?? [])])], revisionId: row.revisionId };
}
const cibleApprobation = (row: Pick<typeof studioPublications.$inferSelect, "id" | "studyId" | "variantId" | "revisionId" | "manifest">): CibleApprobation =>
  ({ publicationId: row.id, studyId: row.studyId, variantIds: ciblePublicationDe(row).variantIds ?? [] });

/** Le compte détient-il lui-même le droit d'approuver la cible ? La réservation d'édition n'est pas un droit : ignorée ici. */
function approuveLuiMeme(access: AccessibleProject | null, userId: string, cible: CiblePortee | undefined): boolean {
  const r = projectAccessRefusal(access, userId, "approve", cible);
  return r === null || r.status === 423;
}

/** Nouvelle délégation (201 ; rejeu par `requestId`). */
export async function createStudioDelegation(projectId: string, actorId: string, input: StudioDelegationCreateInput): Promise<StudioDelegationView & { replayed: boolean }> {
  return db.transaction(async (tx) => {
    const access = await lockedAccess(tx, projectId, actorId);
    if (input.requestId !== undefined) {
      const [previous] = await tx.select().from(studioApprovalDelegations).where(and(
        eq(studioApprovalDelegations.projectId, projectId), eq(studioApprovalDelegations.delegatorId, actorId), eq(studioApprovalDelegations.requestId, input.requestId),
      )).limit(1);
      if (previous) {
        const meme = previous.delegateId === input.delegateId && previous.scopeType === input.scopeType && (previous.scopeId ?? undefined) === input.scopeId
          && previous.startsAt.getTime() === Date.parse(input.startsAt) && previous.endsAt.getTime() === Date.parse(input.endsAt) && previous.reason === input.reason;
        if (!meme) throw new StudioRequestError(409, { error: "request_conflict", message: "Cet identifiant de requête est déjà utilisé pour une autre délégation." });
        return { ...(await vues(tx, access, actorId, [previous]))[0]!, replayed: true };
      }
    }
    const now = new Date();
    // Ordre des refus : portée inconnue (400) → droit du délégant (403) → contenu de la délégation (400).
    const cible = await cibleDeLaPortee(tx, projectId, input.scopeType, input.scopeId);
    // Le délégant délègue un droit qu'il détient lui-même sur toute la portée (jamais en chaîne par une délégation).
    if (!approuveLuiMeme(access, actorId, cible)) {
      throw new StudioRequestError(403, { error: "forbidden", code: "delegation_sans_droit", message: "Vous ne détenez pas le droit d’approuver sur cette portée : vous ne pouvez pas le déléguer.", role: access.role });
    }
    const problemes = problemesNouvelleDelegation({
      delegantId: actorId, delegueId: input.delegateId, debut: input.startsAt, fin: input.endsAt, motif: input.reason,
      portee: input.scopeType === "projet" ? { type: "projet" } : { type: input.scopeType, id: input.scopeId ?? "" },
    }, now);
    if (problemes.length) {
      throw new StudioRequestError(400, { error: "invalid_input", code: `delegation_${problemes[0]!.replace(/-/g, "_")}`, problemes, message: MESSAGES_PROBLEME_DELEGATION[problemes[0]!] });
    }
    const delegue = await loadProjectAccess(projectId, input.delegateId, tx);
    if (projectAccessRefusal(delegue, input.delegateId, "read") !== null) {
      throw new StudioRequestError(400, { error: "invalid_input", code: "delegue_inconnu", message: "Le délégué doit être un participant qui lit ce projet." });
    }
    const row = {
      id: newId("studio_delegation"), projectId, delegatorId: actorId, delegateId: input.delegateId, scopeType: input.scopeType,
      scopeId: input.scopeType === "projet" ? null : input.scopeId!, startsAt: new Date(input.startsAt), endsAt: new Date(input.endsAt),
      reason: input.reason, requestId: input.requestId ?? null, createdAt: now, revokedAt: null, revokedBy: null, revokeReason: null,
    };
    await tx.insert(studioApprovalDelegations).values(row);
    await journalDelegation(tx, row.id, "creer", actorId, now, { comment: input.reason });
    return { ...(await vues(tx, access, actorId, [row]))[0]!, replayed: false };
  });
}

/** Révocation motivée, par le délégant ou le propriétaire du projet ; une délégation déjà révoquée : 409. */
export async function revokeStudioDelegation(projectId: string, delegationId: string, actorId: string, reason: string): Promise<StudioDelegationView> {
  return db.transaction(async (tx) => {
    const access = await lockedAccess(tx, projectId, actorId);
    const [row] = await tx.select().from(studioApprovalDelegations)
      .where(and(eq(studioApprovalDelegations.id, delegationId), eq(studioApprovalDelegations.projectId, projectId))).for("update");
    if (!row) return notFound();
    if (row.delegatorId !== actorId && access.role !== "proprietaire") {
      throw new StudioRequestError(403, { error: "forbidden", message: "Seuls le délégant et le propriétaire du projet révoquent une délégation.", role: access.role });
    }
    if (row.revokedAt !== null) throw new StudioRequestError(409, { error: "delegation_revoquee", message: "Cette délégation est déjà révoquée." });
    const now = new Date();
    await tx.update(studioApprovalDelegations).set({ revokedAt: now, revokedBy: actorId, revokeReason: reason }).where(eq(studioApprovalDelegations.id, row.id));
    await journalDelegation(tx, row.id, "revoquer", actorId, now, { comment: reason });
    const [stored] = await tx.select().from(studioApprovalDelegations).where(eq(studioApprovalDelegations.id, row.id)).limit(1);
    return (await vues(tx, access, actorId, [stored!]))[0]!;
  });
}

export async function journalDelegation(tx: Tx, delegationId: string, action: StudioDelegationEventAction, actorId: string, at: Date, e: { publicationId?: string; publicationAction?: "approuver" | "refuser"; comment?: string | null } = {}): Promise<void> {
  await tx.insert(studioApprovalDelegationEvents).values({
    id: newId("studio_delegation_event"), delegationId, action, actorId, publicationId: e.publicationId ?? null,
    publicationAction: e.publicationAction ?? null, comment: e.comment ?? null, createdAt: at,
  });
}

/**
 * Délégation employée par `actorId` pour `approuver` ou `refuser` la publication `row`, revérifiée sous la transaction
 * de la transition : inconnue (404), refus du modèle (403, motif nommé), réservation d'édition d'un autre compte (423).
 */
export async function delegationEmployable(tx: Tx, access: AccessibleProject, row: typeof studioPublications.$inferSelect, actorId: string, delegationId: string, now: Date): Promise<DelegationRow> {
  const [d] = await tx.select().from(studioApprovalDelegations)
    .where(and(eq(studioApprovalDelegations.id, delegationId), eq(studioApprovalDelegations.projectId, row.projectId))).limit(1);
  if (!d) return notFound();
  const delegant = await loadProjectAccess(row.projectId, d.delegatorId, tx);
  const verdict = verifierDelegation(delegationDe(d), { acteurId: actorId, maintenant: now, cible: cibleApprobation(row), delegantApprouve: approuveLuiMeme(delegant, d.delegatorId, ciblePublicationDe(row)) });
  if (!verdict.ok) throw new StudioRequestError(403, { error: "forbidden", code: verdict.motif.replace(/-/g, "_"), message: verdict.message, delegationId: d.id });
  const lock = activeLock(access);
  if (lock && lock.userId !== actorId) throw new StudioRequestError(423, { error: "locked", message: lockedMessage(lock), lock });
  return d;
}

/**
 * Pour les vues : délégation que l'acteur pourrait employer sur chaque publication (sans droit propre), sinon absente.
 * Mêmes règles que `delegationEmployable` à l'instant de la lecture ; le serveur revérifie à la transition.
 */
export async function delegationsUtilisables(q: Querier, actorId: string, rows: (typeof studioPublications.$inferSelect)[]): Promise<Map<string, { id: string; delegatorId: string; delegatorEmail: string; endsAt: string; reason: string }>> {
  const out = new Map<string, { id: string; delegatorId: string; delegatorEmail: string; endsAt: string; reason: string }>();
  const projectIds = [...new Set(rows.map((r) => r.projectId))];
  if (!projectIds.length) return out;
  const delegs = await q.select().from(studioApprovalDelegations)
    .where(and(inArray(studioApprovalDelegations.projectId, projectIds), eq(studioApprovalDelegations.delegateId, actorId)));
  if (!delegs.length) return out;
  const now = new Date();
  const actives = delegs.filter((d) => etatDelegation(delegationDe(d), now) === "active");
  if (!actives.length) return out;
  const mails = await emails(q, actives.map((d) => d.delegatorId));
  const accesDelegants = new Map<string, AccessibleProject | null>();
  for (const d of actives) {
    const cle = `${d.projectId}\u0000${d.delegatorId}`;
    if (!accesDelegants.has(cle)) accesDelegants.set(cle, await loadProjectAccess(d.projectId, d.delegatorId, q));
  }
  for (const row of rows) {
    for (const d of actives) {
      if (d.projectId !== row.projectId) continue;
      const verdict = verifierDelegation(delegationDe(d), {
        acteurId: actorId, maintenant: now, cible: cibleApprobation(row), delegantApprouve: approuveLuiMeme(accesDelegants.get(`${d.projectId}\u0000${d.delegatorId}`) ?? null, d.delegatorId, ciblePublicationDe(row)),
      });
      if (verdict.ok) { out.set(row.id, { id: d.id, delegatorId: d.delegatorId, delegatorEmail: mails.get(d.delegatorId) ?? "", endsAt: d.endsAt.toISOString(), reason: d.reason }); break; }
    }
  }
  return out;
}
