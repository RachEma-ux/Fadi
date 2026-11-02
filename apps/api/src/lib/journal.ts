/**
 * Lecture du journal d'activité par audience (phase 3 bis, OP-D13 (a)) : chaque requête restreint le périmètre en SQL,
 * puis chaque ligne repasse par la règle pure `journal-audience.ts` (visibilité et projection). Lecture seule : rien
 * n'est jamais écrit, modifié ni supprimé ici (journal append-only, `fadi_app` sans UPDATE ni DELETE).
 */
import { and, desc, eq, gte, ilike, inArray, like, lt, lte, or, sql, type SQL } from "drizzle-orm";
import { db } from "../db/client.js";
import { auditLog, invitations, projectMembers, projects, users } from "../db/schema.js";
import {
  accountIdsOf, paginate, projectEntry, PROJECT_ACTION_PREFIXES, type AccountLabel, type AudienceContext, type JournalEntryView,
  type JournalRow,
} from "./journal-audience.js";

export interface JournalPage {
  entries: JournalEntryView[];
  nextCursor: number | null;
  /** Projets cités par la page, que le lecteur peut ouvrir (code et nom), pour libeller les entrées. */
  projects: Record<string, { code: string; name: string }>;
}

const escapeLike = (s: string) => s.replace(/[%_\\]/g, "\\$&");

/** Conditions SQL des actions d'un projet, tirées de la même liste que la règle pure. */
export function projectActionSql(): SQL {
  return or(...PROJECT_ACTION_PREFIXES.map((p) => (p.endsWith(".") ? like(auditLog.action, `${escapeLike(p)}%`) : eq(auditLog.action, p))))!;
}

async function accountsOf(rows: JournalRow[]): Promise<Map<string, AccountLabel>> {
  const ids = accountIdsOf(rows);
  const map = new Map<string, AccountLabel>();
  if (!ids.length) return map;
  const found = await db.select({ id: users.id, email: users.email, displayName: users.displayName, platformRole: users.platformRole }).from(users).where(inArray(users.id, ids));
  for (const u of found) map.set(u.id, { email: u.email, displayName: u.displayName, platformRole: u.platformRole });
  return map;
}

async function readPage(where: SQL | undefined, cursor: number | undefined, limit: number): Promise<JournalRow[]> {
  const conditions = [where, cursor !== undefined ? lt(auditLog.id, cursor) : undefined].filter((c): c is SQL => !!c);
  const rows = await db.select().from(auditLog).where(conditions.length ? and(...conditions) : undefined).orderBy(desc(auditLog.id)).limit(limit + 1);
  return rows.map((r) => ({ ...r, metadata: r.metadata ?? {} }));
}

async function finish(rows: JournalRow[], limit: number, ctx: AudienceContext, viewerId: string, projectIdsAllowed: (ids: string[]) => Promise<string[]>): Promise<JournalPage> {
  const { page, nextCursor } = paginate(rows, limit);
  const accounts = await accountsOf(page);
  const entries = page.map((r) => projectEntry(r, ctx, accounts, viewerId)).filter((e): e is JournalEntryView => e !== null);
  const cited = [...new Set(entries.map((e) => e.projectId).filter((p): p is string => !!p))];
  const allowed = cited.length ? await projectIdsAllowed(cited) : [];
  const labels: JournalPage["projects"] = {};
  if (allowed.length) {
    for (const p of await db.select({ id: projects.id, code: projects.code, name: projects.name }).from(projects).where(inArray(projects.id, allowed))) labels[p.id] = { code: p.code, name: p.name };
  }
  return { entries, nextCursor, projects: labels };
}

// ---------------------------------------------------------------------------------------------------------------------

export interface AdminJournalFilters {
  actor?: string | undefined;
  action?: string | undefined;
  family?: string | undefined;
  targetType?: string | undefined;
  targetId?: string | undefined;
  from?: Date | undefined;
  to?: Date | undefined;
  cursor?: number | undefined;
  limit: number;
}

/** Administration : tout le journal, filtré (acteur par identifiant, adresse ou nom du compte ; action ou famille ; cible ; période). */
export async function adminJournal(adminId: string, f: AdminJournalFilters): Promise<JournalPage> {
  const conditions: SQL[] = [];
  if (f.actor) {
    const q = `%${escapeLike(f.actor)}%`;
    const matched = db.select({ id: users.id }).from(users).where(or(ilike(users.email, q), ilike(users.displayName, q)));
    conditions.push(or(eq(auditLog.actorId, f.actor), inArray(auditLog.actorId, matched))!);
  }
  if (f.action) conditions.push(eq(auditLog.action, f.action));
  if (f.family) conditions.push(like(auditLog.action, `${escapeLike(f.family)}.%`));
  if (f.targetType) conditions.push(eq(auditLog.targetType, f.targetType));
  if (f.targetId) conditions.push(eq(auditLog.targetId, f.targetId));
  if (f.from) conditions.push(gte(auditLog.createdAt, f.from));
  if (f.to) conditions.push(lte(auditLog.createdAt, f.to));
  const rows = await readPage(conditions.length ? and(...conditions) : undefined, f.cursor, f.limit);
  // L'administration nomme le projet cité (code et nom) comme sa fiche d'un compte : jamais son contenu (D-2).
  return finish(rows, f.limit, { audience: "admin" }, adminId, async (ids) => ids);
}

/** « Mon historique » : actions de la personne, entrées qui visent son compte, accès support sur ses projets. */
export async function userHistory(userId: string, cursor: number | undefined, limit: number): Promise<JournalPage> {
  const owned = await db.select({ id: projects.id }).from(projects).where(eq(projects.ownerId, userId));
  const ownedIds = owned.map((p) => p.id);
  const where = or(
    eq(auditLog.actorId, userId),
    and(eq(auditLog.targetType, "user"), eq(auditLog.targetId, userId)),
    ownedIds.length ? and(like(auditLog.action, "support.%"), eq(auditLog.targetType, "project"), inArray(auditLog.targetId, ownedIds)) : undefined,
  );
  const rows = await readPage(where, cursor, limit);
  const ctx: AudienceContext = { audience: "utilisateur", userId, ownedProjectIds: new Set(ownedIds) };
  // Projet nommé seulement s'il est encore ouvert à la personne (propriétaire ou membre) : sinon l'entrée reste anonyme.
  return finish(rows, limit, ctx, userId, async (ids) => {
    const readable = await db.select({ id: projects.id }).from(projects)
      .leftJoin(projectMembers, and(eq(projectMembers.projectId, projects.id), eq(projectMembers.userId, userId)))
      .where(and(inArray(projects.id, ids), or(eq(projects.ownerId, userId), sql`${projectMembers.userId} IS NOT NULL`)));
    return readable.map((r) => r.id);
  });
}

/** Historique de la participation d'un projet (lecteur déjà reconnu responsable par la route). */
export async function projectJournal(projectId: string, viewerId: string, cursor: number | undefined, limit: number, family?: string): Promise<JournalPage> {
  const projectInvitations = await db.select({ id: invitations.id }).from(invitations).where(eq(invitations.projectId, projectId));
  const invitationIds = projectInvitations.map((i) => i.id);
  const attached = or(
    and(eq(auditLog.targetType, "project"), eq(auditLog.targetId, projectId)),
    sql`${auditLog.metadata}->>'projectId' = ${projectId}`,
    invitationIds.length ? and(eq(auditLog.targetType, "invitation"), inArray(auditLog.targetId, invitationIds)) : undefined,
  );
  const conditions = [projectActionSql(), attached!];
  if (family) conditions.push(like(auditLog.action, `${escapeLike(family)}.%`));
  const rows = await readPage(and(...conditions), cursor, limit);
  const ctx: AudienceContext = { audience: "projet", projectId, invitationIds: new Set(invitationIds) };
  return finish(rows, limit, ctx, viewerId, async (ids) => ids.filter((i) => i === projectId));
}
