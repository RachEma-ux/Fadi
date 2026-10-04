/**
 * Notifications dans l'application — ce que le prototype (mono-utilisateur)
 * n'avait pas et que le partage rend nécessaire, sans service de courriel :
 *
 *   GET  /notifications       → les événements qui vous concernent, relus des
 *                               données datées (aucune table de notifications) :
 *                               accès reçus à un projet (invitation, rôle),
 *                               commentaires des autres sur vos projets et sur
 *                               ceux qui vous sont partagés, réservations
 *                               d'édition en cours posées par quelqu'un d'autre,
 *                               modifications du modèle par d'autres dans le
 *                               nouvel Atelier (événements traités de la boîte
 *                               de sortie, une notification par projet) ;
 *                               « non lue » = postérieure à votre dernière
 *                               consultation ;
 *   POST /notifications/seen  → marque tout comme consulté (date conservée par
 *                               compte).
 *
 * Rien n'est envoyé hors de l'application : un courriel d'invitation reste un
 * service externe, absent (voir docs/migration/matrix.md).
 */
import { Router } from "express";
import { and, desc, eq, gt, inArray, isNotNull, ne, or } from "drizzle-orm";
import { db } from "../db/client.js";
import { atelierOutbox, projectComments, projectMembers, projects, users } from "../db/schema.js";
import { requireAuth } from "../middleware/require-auth.js";
import { activeLock, type ProjectRole } from "../lib/owned-project.js";
import { ROLE_LABEL } from "./members.js";
import { EVENEMENT_COMMANDE_VALIDEE, regrouperModifications } from "../lib/atelier-events.js";
import type { Querier } from "../lib/step-rows.js";

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

export interface NotificationItem {
  id: string;
  at: string;
  /** `acces` · `commentaire` · `reservation` · `modele` (lots validés dans le nouvel Atelier, regroupés par projet) */
  kind: "acces" | "commentaire" | "reservation" | "modele";
  projectId: string;
  projectCode: string;
  projectName: string;
  stepNumber: number | null;
  text: string;
  unread: boolean;
}

const WINDOW_DAYS = 30;
const LIMIT = 40;

export async function notificationsFor(userId: string, email: string, q: Querier = db): Promise<{ seenAt: string | null; items: NotificationItem[] }> {
  const [me] = await q.select({ seenAt: users.notificationsSeenAt }).from(users).where(eq(users.id, userId));
  const seenAt = me?.seenAt ?? null;
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 3600 * 1000);
  const items: NotificationItem[] = [];

  // Accès reçus : chaque ligne de membre vous concernant, datée de l'invitation (ou du transfert de propriété qui vous a laissé éditeur).
  const memberships = await q
    .select({ project: projects, role: projectMembers.role, invitedBy: projectMembers.invitedBy, createdAt: projectMembers.createdAt })
    .from(projectMembers)
    .innerJoin(projects, eq(projects.id, projectMembers.projectId))
    .where(eq(projectMembers.userId, userId));
  for (const m of memberships) {
    items.push({
      id: `acces:${m.project.id}`,
      at: m.createdAt.toISOString(),
      kind: "acces",
      projectId: m.project.id,
      projectCode: m.project.code,
      projectName: m.project.name,
      stepNumber: null,
      text: `${m.invitedBy} vous a donné accès à ${m.project.code} — ${m.project.name} (${ROLE_LABEL[m.role as ProjectRole]}).`,
      unread: false,
    });
  }

  // Commentaires des autres sur vos projets et sur ceux qui vous sont partagés, 30 derniers jours.
  const owned = await q.select({ id: projects.id }).from(projects).where(eq(projects.ownerId, userId));
  const projectIds = [...new Set([...owned.map((p) => p.id), ...memberships.map((m) => m.project.id)])];
  if (projectIds.length) {
    const comments = await q
      .select({ comment: projectComments, code: projects.code, name: projects.name })
      .from(projectComments)
      .innerJoin(projects, eq(projects.id, projectComments.projectId))
      .where(and(inArray(projectComments.projectId, projectIds), ne(projectComments.authorId, userId), gt(projectComments.createdAt, since)))
      .orderBy(desc(projectComments.createdAt))
      .limit(LIMIT);
    for (const { comment: c, code, name } of comments) {
      const excerpt = c.body.length > 120 ? `${c.body.slice(0, 120)}…` : c.body;
      items.push({
        id: `commentaire:${c.id}`,
        at: c.createdAt.toISOString(),
        kind: "commentaire",
        projectId: c.projectId,
        projectCode: code,
        projectName: name,
        stepNumber: c.stepNumber,
        text: `${c.authorEmail} a commenté ${code}${c.stepNumber ? ` · étape ${String(c.stepNumber).padStart(2, "0")}` : ""} : « ${excerpt} »`,
        unread: false,
      });
    }
    // Réservations d'édition en cours posées par quelqu'un d'autre sur ces projets (visibles tant qu'elles durent).
    const locked = await q
      .select({ id: projects.id, code: projects.code, name: projects.name, editingLock: projects.editingLock })
      .from(projects)
      .where(or(eq(projects.ownerId, userId), inArray(projects.id, projectIds)));
    for (const p of locked) {
      const lock = activeLock(p);
      if (lock && lock.userId !== userId && lock.email !== email)
        items.push({
          id: `reservation:${p.id}:${lock.since}`,
          at: lock.since,
          kind: "reservation",
          projectId: p.id,
          projectCode: p.code,
          projectName: p.name,
          stepNumber: null,
          text: `${lock.email} a réservé l’édition de ${p.code} — ${p.name} jusqu’à ${new Date(lock.expiresAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: process.env["FADI_TZ"] ?? "Europe/Paris" })} : lecture et commentaires seulement d’ici là.`,
          unread: false,
        });
    }
    // Modifications du modèle par d'autres (nouvel Atelier) : événements `atelier.commande.validee` traités, 30 derniers
    // jours, regroupés en une notification par projet (révision la plus haute, auteurs, nombre de lots non consultés).
    const evenements = await q
      .select({ projectId: atelierOutbox.projectId, payload: atelierOutbox.payload, createdAt: atelierOutbox.createdAt, code: projects.code, name: projects.name })
      .from(atelierOutbox)
      .innerJoin(projects, eq(projects.id, atelierOutbox.projectId))
      .where(and(inArray(atelierOutbox.projectId, projectIds), eq(atelierOutbox.event, EVENEMENT_COMMANDE_VALIDEE), isNotNull(atelierOutbox.processedAt), gt(atelierOutbox.createdAt, since)))
      .orderBy(desc(atelierOutbox.createdAt))
      .limit(500);
    if (evenements.length) {
      const ids = [...new Set(evenements.map((e) => e.payload["auteur"]).filter((a): a is string => typeof a === "string"))];
      const auteurs = ids.length ? await q.select({ id: users.id, email: users.email }).from(users).where(inArray(users.id, ids)) : [];
      const courriel = new Map(auteurs.map((u) => [u.id, u.email]));
      const groupes = regrouperModifications(
        evenements.map((e) => ({ projectId: e.projectId, projectCode: e.code, projectName: e.name, payload: e.payload, at: e.createdAt.toISOString() })),
        { userId, seenAt: seenAt ? seenAt.toISOString() : null },
        (a) => (a === null ? "Un import" : (courriel.get(a) ?? a)),
      );
      for (const g of groupes) {
        items.push({ id: g.id, at: g.at, kind: "modele", projectId: g.projectId, projectCode: g.projectCode, projectName: g.projectName, stepNumber: null, text: g.text, unread: false });
      }
    }
  }

  const sorted = items.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).slice(0, LIMIT);
  const seenIso = seenAt ? seenAt.toISOString() : null;
  for (const it of sorted) it.unread = seenIso === null || it.at > seenIso;
  return { seenAt: seenIso, items: sorted };
}

notificationsRouter.get("/", async (req, res) => {
  res.json(await notificationsFor(req.user!.id, req.user!.email));
});

notificationsRouter.post("/seen", async (req, res) => {
  const now = new Date();
  await db.update(users).set({ notificationsSeenAt: now }).where(eq(users.id, req.user!.id));
  res.json({ seenAt: now.toISOString() });
});
