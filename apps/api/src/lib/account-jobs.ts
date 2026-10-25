/**
 * Tâches de fond du processus API (docs/workstreams/users-management, phase 4) : envoi de la file de courriels toutes
 * les 5 s, et une fois par heure l'anonymisation des comptes dont la suppression a été demandée il y a 30 jours (D-5).
 *
 * Anonymisation (irréversible) : adresse remplacée par `deleted-<id>@invalid`, nom affiché « Compte supprimé », hachage
 * du mot de passe rendu inutilisable, double authentification, codes de secours, sessions et jetons supprimés ;
 * projets possédés **non partagés** supprimés ; participations retirées ; commentaires et révisions conservés sous
 * « Compte supprimé ». Le journal d'audit garde l'identifiant, jamais l'adresse (il n'en contient pas).
 * « Anonymiser maintenant » de la corbeille d'administration (UM-27) appelle la même `anonymiseAccountIn`.
 * La même boucle horaire efface les contacts sans compte dus (Issue #262, OP-2 : 2 ans après la clôture de tous leurs
 * projets, `runContactRetentionJob`).
 */
import { and, eq, isNotNull, lte, ne, or, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { accountTokens, invitations, mailOutbox, people, projectComments, projectMembers, projects, sessions, userRecoveryCodes, users } from "../db/schema.js";
import { runContactRetentionJob } from "./participants-db.js";
import { contactRetentionEnabled } from "./participants.js";
import { audit } from "./audit.js";
import { processMailOutbox } from "./mailer/outbox.js";
import { anonymisationAt, anonymisedEmail, DELETED_LABEL, DELETION_GRACE_DAYS } from "./security/deletion.js";
import type { Tx } from "./admin-eligibility.js";

/** Auteur de l'anonymisation pour le journal : la tâche des 30 jours (système) ou « Anonymiser maintenant » (UM-27). */
export type AnonymisedBy = { actorId: null; action: "account.anonymized"; ip?: null } | { actorId: string; action: "admin.user.anonymized_now"; ip: string | null };

/** Anonymise un compte dû ; renvoie false si le compte possède encore un projet partagé (rien n'est alors modifié). */
export async function anonymiseAccount(userId: string): Promise<boolean> {
  return db.transaction((tx) => anonymiseAccountIn(tx, userId));
}

/**
 * L'anonymisation elle-même, dans la transaction de l'appelant : la tâche des 30 jours et « Anonymiser maintenant »
 * (route d'administration, sous le verrou d'éligibilité) exécutent exactement ce code. Renvoie false sans rien modifier
 * si le compte est inconnu, déjà anonymisé, hors suppression programmée ou possède encore un projet partagé.
 */
export async function anonymiseAccountIn(tx: Tx, userId: string, by: AnonymisedBy = { actorId: null, action: "account.anonymized" }): Promise<boolean> {
  const [user] = await tx.select().from(users).where(eq(users.id, userId)).limit(1).for("update");
  if (!user || user.status === "closed" || !user.deletionRequestedAt) return false;
  const shared = await tx.selectDistinct({ id: projects.id }).from(projects).innerJoin(projectMembers, eq(projectMembers.projectId, projects.id)).where(eq(projects.ownerId, userId));
  if (shared.length) return false;
  const oldEmail = user.email;
  const deletedProjects = await tx.delete(projects).where(eq(projects.ownerId, userId)).returning({ id: projects.id });
  await tx.delete(projectMembers).where(eq(projectMembers.userId, userId));
  // Fiche de personne liée au compte (Issue #262) : fonction et coordonnées professionnelles effacées avec le compte.
  await tx.update(people).set({ displayName: null, jobTitle: null, workEmail: null, workPhone: null, updatedAt: new Date() }).where(eq(people.userId, userId));
  await tx.update(projectMembers).set({ invitedBy: DELETED_LABEL }).where(eq(projectMembers.invitedBy, oldEmail));
  await tx.update(projectComments).set({ authorEmail: DELETED_LABEL }).where(eq(projectComments.authorId, userId));
  await tx.execute(sql`UPDATE projects SET editing_lock = NULL WHERE editing_lock->>'userId' = ${userId}`);
  await tx.delete(userRecoveryCodes).where(eq(userRecoveryCodes.userId, userId));
  await tx.delete(sessions).where(eq(sessions.userId, userId));
  await tx.delete(accountTokens).where(eq(accountTokens.userId, userId));
  await tx.update(invitations).set({ status: "cancelled", respondedAt: new Date() })
    .where(and(eq(invitations.status, "pending"), or(eq(invitations.invitedBy, userId), eq(invitations.email, oldEmail))));
  await tx.update(invitations).set({ email: anonymisedEmail(userId) }).where(eq(invitations.email, oldEmail));
  await tx.update(mailOutbox).set({ toAddress: anonymisedEmail(userId), payload: {}, status: sql`CASE WHEN ${mailOutbox.status} = 'pending' THEN 'skipped' ELSE ${mailOutbox.status} END` })
    .where(eq(mailOutbox.toAddress, oldEmail));
  await tx.update(users).set({
    email: anonymisedEmail(userId), displayName: DELETED_LABEL, passwordHash: "!anonymised", status: "closed", deletedAt: new Date(),
    totpSecretEnc: null, totpEnabledAt: null, totpLastStep: null, notificationPreferences: null, atelierEnsembles: null, atelierEnsemblesAt: null,
    platformRole: "user", failedLoginCount: 0, lockedUntil: null,
  }).where(eq(users.id, userId));
  await audit(tx, {
    actorId: by.actorId, action: by.action, target: { type: "user", id: userId }, ip: by.ip ?? null,
    metadata: { deletedProjects: deletedProjects.length, ...(by.actorId ? { scheduledFor: anonymisationAt(user.deletionRequestedAt).toISOString() } : {}) },
  });
  return true;
}

/** Comptes dus : suppression demandée depuis 30 jours ou plus. `now` est injectable (horloge simulée des recettes). */
export async function runDeletionJob(now = new Date()): Promise<{ anonymised: number; blocked: number }> {
  const due = await db.select({ id: users.id }).from(users)
    .where(and(isNotNull(users.deletionRequestedAt), ne(users.status, "closed"), lte(users.deletionRequestedAt, new Date(now.getTime() - DELETION_GRACE_DAYS * 24 * 3_600_000))));
  let anonymised = 0, blocked = 0;
  for (const { id } of due) (await anonymiseAccount(id)) ? anonymised++ : blocked++;
  return { anonymised, blocked };
}

/** Démarre les boucles de fond ; renvoie l'arrêt (tests, arrêt propre). */
export function startAccountWorkers(log: (line: string) => void = (l) => console.log(l)): () => void {
  let busy = false;
  const mail = setInterval(() => {
    if (busy) return;
    busy = true;
    processMailOutbox().catch((err: unknown) => log(JSON.stringify({ level: "error", message: "mail_outbox", detail: (err as Error).message })))
      .finally(() => { busy = false; });
  }, 5_000);
  const deletion = async () => {
    try {
      const r = await runDeletionJob();
      if (r.anonymised || r.blocked) log(JSON.stringify({ level: "info", message: "account_deletion_job", ...r }));
    } catch (err) { log(JSON.stringify({ level: "error", message: "account_deletion_job", detail: (err as Error).message })); }
    // Contacts sans compte (Issue #262, OP-D9 / OP-2) : effacés 2 ans après la clôture de tous leurs projets — seulement
    // si l'effacement automatique est activé (OP-4, réserve juridique).
    if (!contactRetentionEnabled()) return;
    try {
      const c = await runContactRetentionJob();
      if (c.erased) log(JSON.stringify({ level: "info", message: "contact_retention_job", ...c }));
    } catch (err) { log(JSON.stringify({ level: "error", message: "contact_retention_job", detail: (err as Error).message })); }
  };
  const daily = setInterval(deletion, 3_600_000);
  void deletion();
  mail.unref(); daily.unref();
  return () => { clearInterval(mail); clearInterval(daily); };
}
