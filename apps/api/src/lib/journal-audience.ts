/**
 * Journal d'activité et historique (Issue #262, phase 3 bis, OP-D13 (a)) — règle d'audience, pure : aucune base, aucun
 * DOM. Le journal `admin.audit_log` reste append-only et sans adresse en clair ; il est lu par trois audiences, chacune
 * filtrée **côté serveur** :
 *
 *  - `admin` : l'administrateur de la plateforme voit tout (sous l'assurance de session UM-18 de `/admin`), adresse IP
 *    comprise — comme la fiche d'un compte de l'administration ; aucune sortie de fichier (pas de capacité `export`
 *    d'administration, UM-20) ;
 *  - `utilisateur` : « Mon historique » — les entrées dont la personne est l'acteur, celles qui visent son compte
 *    (cible `user` = elle), et les accès support (`support.*`) sur les projets dont elle est propriétaire ;
 *  - `projet` : l'historique de la participation, visible des seuls responsables du projet (`isProjectResponsible`) —
 *    actions des familles `PROJECT_ACTION_PREFIXES` rattachées au projet par leur cible (`project` = ce projet), par
 *    `metadata.projectId`, ou par une invitation de ce projet. Les futures actions `participation.*`, `person.*` et
 *    `review.*` y apparaissent sans changement de code dès qu'elles portent l'un de ces rattachements.
 *
 * Les requêtes SQL des routes restreignent déjà le périmètre ; chaque ligne relue repasse par `visible()` avant d'être
 * projetée (défense en profondeur : un filtre SQL élargi par erreur ne divulgue rien). La projection retire ce que
 * l'audience n'a pas à lire : IP hors administration, identifiants opaques, empreintes, chemins hors projet.
 */

export type JournalAudience = "admin" | "utilisateur" | "projet";

/** Ligne du journal telle que relue (forme de `admin.audit_log`). */
export interface JournalRow {
  id: number;
  actorId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown>;
  ip: string | null;
  createdAt: Date;
}

/** Familles d'actions (premier segment de l'action) proposées au filtre de l'administration. */
export const JOURNAL_FAMILIES = [
  "auth", "account", "admin", "invitation", "support", "project", "comment", "mail", "participation", "person", "review",
] as const;
export type JournalFamily = (typeof JOURNAL_FAMILIES)[number];

export function familyOf(action: string): string {
  return action.split(".")[0] ?? action;
}

/**
 * Actions de l'historique d'un projet : un préfixe terminé par « . » couvre toute la famille (y compris les actions
 * futures), sinon l'action exacte.
 */
export const PROJECT_ACTION_PREFIXES = [
  "project.member.", "project.ownership.", "invitation.", "comment.audience_changed", "support.",
  "participation.", "person.", "review.",
] as const;

export function isProjectAction(action: string): boolean {
  return PROJECT_ACTION_PREFIXES.some((p) => (p.endsWith(".") ? action.startsWith(p) : action === p));
}

export interface UserAudienceContext {
  userId: string;
  /** Projets dont la personne est aujourd'hui propriétaire (accès support qu'elle a accordés ou subis). */
  ownedProjectIds: ReadonlySet<string>;
}

export interface ProjectAudienceContext {
  projectId: string;
  /** Invitations de ce projet (rattachent `invitation.declined`, `invitation.refused`… qui ne portent pas `projectId`). */
  invitationIds: ReadonlySet<string>;
}

export type AudienceContext =
  | { audience: "admin" }
  | ({ audience: "utilisateur" } & UserAudienceContext)
  | ({ audience: "projet" } & ProjectAudienceContext);

export function visibleToUser(row: Pick<JournalRow, "actorId" | "action" | "targetType" | "targetId">, ctx: UserAudienceContext): boolean {
  if (row.actorId !== null && row.actorId === ctx.userId) return true;
  if (row.targetType === "user" && row.targetId === ctx.userId) return true;
  return row.action.startsWith("support.") && row.targetType === "project" && row.targetId !== null && ctx.ownedProjectIds.has(row.targetId);
}

export function projectOfRow(row: Pick<JournalRow, "targetType" | "targetId" | "metadata">): string | null {
  if (row.targetType === "project" && row.targetId) return row.targetId;
  const p = row.metadata?.["projectId"];
  return typeof p === "string" && p ? p : null;
}

export function visibleToProject(row: Pick<JournalRow, "action" | "targetType" | "targetId" | "metadata">, ctx: ProjectAudienceContext): boolean {
  if (!isProjectAction(row.action)) return false;
  if (projectOfRow(row) === ctx.projectId) return true;
  return row.targetType === "invitation" && row.targetId !== null && ctx.invitationIds.has(row.targetId);
}

export function visible(row: JournalRow, ctx: AudienceContext): boolean {
  if (ctx.audience === "admin") return true;
  if (ctx.audience === "utilisateur") return visibleToUser(row, ctx);
  return visibleToProject(row, ctx);
}

// ---------------------------------------------------------------------------------------------------------------------
// Projection
// ---------------------------------------------------------------------------------------------------------------------

/** Compte connu du serveur (table `users`) : identité affichée selon l'audience. */
export interface AccountLabel {
  email: string;
  displayName: string | null;
  platformRole: "user" | "admin";
}

export type ActorView =
  | { kind: "vous" }
  | { kind: "systeme" }
  | { kind: "administrateur" }
  | { kind: "autre" }
  | { kind: "compte"; id: string; email: string | null; displayName: string | null };

/**
 * Détails lisibles par une audience non administratrice : valeurs d'état, jamais d'identifiant opaque (grantId,
 * commentId, invitationId, variantId), d'empreinte (emailHash) ni de gabarit de courriel.
 */
export const SHARED_DETAIL_KEYS = [
  "purpose", "role", "roleBefore", "roleAfter", "canExport", "canExportBefore", "canExportAfter", "audienceBefore",
  "audienceAfter", "module", "hours", "mfa", "revokedSessions", "count", "exceptCurrent", "remaining", "reason", "from",
  "to", "status", "sent", "unlocked", "via", "previousOwnerRoleAfter", "replies",
] as const;

/** Clés désignant un compte : résolues en identité (`subjects`) selon l'audience, jamais rendues brutes hors administration. */
export const ACCOUNT_KEYS = ["memberId", "adminId", "fromOwnerId", "toOwnerId", "previousOwnerId", "newOwnerId", "userId"] as const;

export type DetailValue = string | number | boolean | null;

export interface JournalEntryView {
  id: number;
  at: string;
  action: string;
  family: string;
  actor: ActorView;
  target: { type: string | null; id: string | null } | null;
  /** Projet rattaché (cible ou `metadata.projectId`), quand l'audience y a droit ; libellé résolu par la route. */
  projectId: string | null;
  details: Record<string, DetailValue>;
  /** Comptes cités par l'entrée (membre visé, administrateur du support…), selon l'audience. */
  subjects: Record<string, ActorView>;
  /** Adresse IP : administration seulement. */
  ip?: string | null;
}

const scalar = (v: unknown): DetailValue | undefined =>
  v === null || typeof v === "string" || typeof v === "number" || typeof v === "boolean" ? v : undefined;

function account(id: string, accounts: ReadonlyMap<string, AccountLabel>): ActorView {
  const a = accounts.get(id);
  return { kind: "compte", id, email: a?.email ?? null, displayName: a?.displayName ?? null };
}

/** Qui a agi, selon l'audience (`accounts` : comptes relus par la route pour cette page du journal). */
export function actorView(row: Pick<JournalRow, "actorId" | "action" | "targetType" | "targetId">, ctx: AudienceContext, accounts: ReadonlyMap<string, AccountLabel>, viewerId: string | null = null): ActorView {
  if (row.actorId === null) return { kind: "systeme" };
  if (ctx.audience === "admin") return account(row.actorId, accounts);
  if (ctx.audience === "utilisateur") {
    if (row.actorId === ctx.userId) return { kind: "vous" };
    // Accès support sur son propre projet : l'administrateur est déjà nommé dans le panneau « Accès support ».
    if (row.action.startsWith("support.") && row.targetType === "project" && row.targetId && ctx.ownedProjectIds.has(row.targetId)) return account(row.actorId, accounts);
    return accounts.get(row.actorId)?.platformRole === "admin" ? { kind: "administrateur" } : { kind: "autre" };
  }
  // Projet : les responsables gèrent la participation et ses coordonnées (OP-D9) ; identité du compte.
  return row.actorId === viewerId ? { kind: "vous" } : account(row.actorId, accounts);
}

/** Projection d'une ligne visible pour l'audience ; `null` si la ligne n'est pas de son périmètre. */
export function projectEntry(row: JournalRow, ctx: AudienceContext, accounts: ReadonlyMap<string, AccountLabel>, viewerId: string | null = null): JournalEntryView | null {
  if (!visible(row, ctx)) return null;
  const meta = row.metadata ?? {};
  const details: Record<string, DetailValue> = {};
  const subjects: Record<string, ActorView> = {};
  if (ctx.audience === "admin") {
    for (const [k, v] of Object.entries(meta)) {
      const s = scalar(v);
      if (s !== undefined) details[k] = s;
    }
  } else {
    for (const k of SHARED_DETAIL_KEYS) {
      const s = scalar(meta[k]);
      if (s !== undefined) details[k] = s;
    }
    if (ctx.audience === "projet" && typeof meta["path"] === "string") details["path"] = meta["path"].slice(0, 200);
  }
  const me = ctx.audience === "utilisateur" ? ctx.userId : viewerId;
  for (const k of ACCOUNT_KEYS) {
    const id = meta[k];
    if (typeof id !== "string" || !id) continue;
    if (id === me) subjects[k] = { kind: "vous" };
    else if (ctx.audience === "utilisateur") {
      // Son propre geste (membre ajouté, accès accordé) : la personne a choisi ce compte ; sinon, rien d'identifiant.
      if (row.actorId === ctx.userId) subjects[k] = account(id, accounts);
    } else subjects[k] = account(id, accounts);
  }
  const projectId = projectOfRow(row);
  const view: JournalEntryView = {
    id: row.id,
    at: row.createdAt.toISOString(),
    action: row.action,
    family: familyOf(row.action),
    actor: actorView(row, ctx, accounts, viewerId),
    target: ctx.audience === "admin" || (row.targetType !== "user" && row.targetType !== "session") || row.targetId === me
      ? { type: row.targetType, id: ctx.audience === "admin" || row.targetType === "project" ? row.targetId : null }
      : { type: row.targetType, id: null },
    projectId: ctx.audience === "projet" ? ctx.projectId : projectId,
    details,
    subjects,
  };
  if (ctx.audience === "admin") view.ip = row.ip;
  return view;
}

/** Comptes à relire pour projeter une page : acteurs et comptes cités. */
export function accountIdsOf(rows: readonly Pick<JournalRow, "actorId" | "metadata">[]): string[] {
  const ids = new Set<string>();
  for (const r of rows) {
    if (r.actorId) ids.add(r.actorId);
    for (const k of ACCOUNT_KEYS) {
      const v = r.metadata?.[k];
      if (typeof v === "string" && v) ids.add(v);
    }
  }
  return [...ids];
}

// ---------------------------------------------------------------------------------------------------------------------
// Pagination par curseur (identifiant décroissant : récent d'abord)
// ---------------------------------------------------------------------------------------------------------------------

export const JOURNAL_PAGE_DEFAULT = 50;
export const JOURNAL_PAGE_MAX = 100;

/** Page relue avec `limit + 1` lignes : la ligne de trop dit qu'il en reste ; le curseur est le dernier identifiant rendu. */
export function paginate<T extends { id: number }>(rows: readonly T[], limit: number): { page: T[]; nextCursor: number | null } {
  const page = rows.slice(0, limit);
  return { page, nextCursor: rows.length > limit && page.length ? page[page.length - 1]!.id : null };
}
