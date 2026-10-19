/**
 * Notifications dans l'application — ce que le prototype (mono-utilisateur)
 * n'avait pas et que le partage rend nécessaire, sans service de courriel :
 *
 *   GET  /notifications       → les événements qui vous concernent, relus des
 *                               données datées (aucune table de notifications) :
 *                               accès reçus à un projet (invitation, rôle),
 *                               commentaires des autres sur vos projets et sur
 *                               ceux qui vous sont partagés, réservations
 *                               d'édition en cours posées par quelqu'un d'autre ;
 *                               modifications de l'Atelier par d'autres sur des
 *                               objets que vous avez créés ou modifiés (D-081) ;
 *                               exports de dessin que vous avez produits, périmés
 *                               depuis par une modification d'un autre (D-110) ;
 *                               verrous fins (étage, zone, objet) pris ou
 *                               libérés par un autre membre (D-143) ;
 *                               commentaires des autres sur les variantes
 *                               Studio de ces projets (non supprimés) et
 *                               passages des observations Studio dont vous
 *                               êtes responsable ou auteur ;
 *                               « non lue » = postérieure à votre dernière
 *                               consultation ; types masqués et projets mis
 *                               en sourdine par vos préférences retirés avant
 *                               la limite (`masquees` = combien) ;
 *   POST /notifications/seen  → marque tout comme consulté (date conservée par
 *                               compte).
 *
 * Rien n'est envoyé hors de l'application : un courriel d'invitation reste un
 * service externe, absent (voir docs/migration/matrix.md).
 */
import { Router } from "express";
import { db } from "../db/client.js";
import { and, desc, eq, gt, inArray, isNull, ne, or } from "drizzle-orm";
import { atelierCommands, atelierLockEvents, atelierLocks, drawingExports, projectComments, projectMembers, projects, studioComments, studioObservationEvents, studioObservations, studioStudies, studioVariants, users } from "../db/schema.js";
import { requireAuth } from "../middleware/require-auth.js";
import { activeLock, type ProjectRole } from "../lib/owned-project.js";
import { ROLE_LABEL } from "./members.js";
import { filtrerNotifications, type NotificationKind } from "../lib/notification-preferences.js";
import { lirePreferencesNotification } from "./preferences.js";

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

export interface NotificationItem {
  id: string;
  at: string;
  /** `acces` · `commentaire` · `reservation` · `modification` (objets de l'Atelier, D-081) · `verrou` · `peremption` (D-110) · `commentaire-studio` (variante Studio) */
  kind: NotificationKind;
  projectId: string;
  projectCode: string;
  projectName: string;
  stepNumber: number | null;
  /** Variante Studio commentée (`commentaire-studio` seulement). */
  studio?: { studyId: string; variantId: string };
  text: string;
  unread: boolean;
}

const WINDOW_DAYS = 30;
const LIMIT = 40;

export async function notificationsFor(userId: string, email: string): Promise<{ seenAt: string | null; items: NotificationItem[]; masquees: number }> {
  const [me] = await db.select({ seenAt: users.notificationsSeenAt }).from(users).where(eq(users.id, userId));
  const seenAt = me?.seenAt ?? null;
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 3600 * 1000);
  const items: NotificationItem[] = [];

  // Accès reçus : chaque ligne de membre vous concernant, datée de l'invitation (ou du transfert de propriété qui vous a laissé éditeur).
  const memberships = await db
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
  const owned = await db.select({ id: projects.id }).from(projects).where(eq(projects.ownerId, userId));
  const projectIds = [...new Set([...owned.map((p) => p.id), ...memberships.map((m) => m.project.id)])];
  if (projectIds.length) {
    const comments = await db
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
    const locked = await db
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
  }

  // Commentaires des autres sur les variantes Studio de ces projets (mêmes destinataires que les commentaires du
  // projet : propriétaire et membres, sauf l'auteur), 30 derniers jours ; un commentaire supprimé n'est plus signalé.
  if (projectIds.length) {
    const studio = await db
      .select({ id: studioComments.id, body: studioComments.body, createdAt: studioComments.createdAt, variantId: studioVariants.id, variantName: studioVariants.name, studyId: studioStudies.id, studyName: studioStudies.name, projectId: projects.id, code: projects.code, name: projects.name, email: users.email })
      .from(studioComments)
      .innerJoin(studioVariants, eq(studioVariants.id, studioComments.variantId))
      .innerJoin(studioStudies, eq(studioStudies.id, studioVariants.studyId))
      .innerJoin(projects, eq(projects.id, studioStudies.projectId))
      .innerJoin(users, eq(users.id, studioComments.authorId))
      .where(and(inArray(studioStudies.projectId, projectIds), ne(studioComments.authorId, userId), isNull(studioComments.deletedAt), gt(studioComments.createdAt, since)))
      .orderBy(desc(studioComments.createdAt))
      .limit(LIMIT);
    for (const c of studio) {
      const excerpt = c.body.length > 120 ? `${c.body.slice(0, 120)}…` : c.body;
      items.push({
        id: `commentaire-studio:${c.id}`,
        at: c.createdAt.toISOString(),
        kind: "commentaire-studio",
        projectId: c.projectId,
        projectCode: c.code,
        projectName: c.name,
        stepNumber: null,
        studio: { studyId: c.studyId, variantId: c.variantId },
        text: `${c.email} a commenté la variante « ${c.variantName} » de l’étude Studio « ${c.studyName} » (${c.code}) : « ${excerpt} »`,
        unread: false,
      });
    }
    // Observations Studio (E.2), même type « commentaire-studio » : chaque passage du journal fait par un autre est
    // signalé à son responsable et à l'auteur du commentaire, 30 derniers jours (révision et note : dans le journal).
    const passages = await db
      .select({ id: studioObservationEvents.id, action: studioObservationEvents.action, at: studioObservationEvents.at, responsableId: studioObservations.responsableId, authorId: studioComments.authorId, body: studioComments.body, variantId: studioVariants.id, variantName: studioVariants.name, studyId: studioStudies.id, projectId: projects.id, code: projects.code, name: projects.name, email: users.email })
      .from(studioObservationEvents)
      .innerJoin(studioObservations, eq(studioObservations.commentId, studioObservationEvents.observationId))
      .innerJoin(studioComments, eq(studioComments.id, studioObservations.commentId))
      .innerJoin(studioVariants, eq(studioVariants.id, studioObservations.variantId))
      .innerJoin(studioStudies, eq(studioStudies.id, studioVariants.studyId))
      .innerJoin(projects, eq(projects.id, studioStudies.projectId))
      .innerJoin(users, eq(users.id, studioObservationEvents.actorId))
      .where(and(
        inArray(studioStudies.projectId, projectIds), ne(studioObservationEvents.actorId, userId), gt(studioObservationEvents.at, since),
        or(eq(studioObservations.responsableId, userId), eq(studioComments.authorId, userId)),
      ))
      .orderBy(desc(studioObservationEvents.at))
      .limit(LIMIT);
    const VERBE: Record<string, string> = { ouvrir: "a ouvert l’observation", corriger: "a déclaré corrigée l’observation", recontroler: "a recontrôlé l’observation", cloturer: "a clôturé l’observation", rouvrir: "a rouvert l’observation" };
    for (const p of passages) {
      const excerpt = p.body.length > 80 ? `${p.body.slice(0, 80)}…` : p.body;
      items.push({
        id: `observation-studio:${p.id}`,
        at: p.at.toISOString(),
        kind: "commentaire-studio",
        projectId: p.projectId,
        projectCode: p.code,
        projectName: p.name,
        stepNumber: null,
        studio: { studyId: p.studyId, variantId: p.variantId },
        text: `${p.email} ${VERBE[p.action] ?? p.action} « ${excerpt} » (variante « ${p.variantName} », ${p.code}).`,
        unread: false,
      });
    }
  }

  // Modifications de l'Atelier par d'autres sur vos objets (D-081) : objets que vous avez créés ou modifiés, touchés
  // depuis par un autre compte (30 derniers jours) ; une notification par lot, sans rien inventer.
  if (projectIds.length) {
    const ids = (e: unknown, cles: string[]) => cles.flatMap((k) => (Array.isArray((e as Record<string, unknown>)?.[k]) ? ((e as Record<string, unknown>)[k] as unknown[]).filter((x): x is string => typeof x === "string") : []));
    const miens = await db.select({ projectId: atelierCommands.projectId, effets: atelierCommands.effets, rev: atelierCommands.resultRevision }).from(atelierCommands).where(and(inArray(atelierCommands.projectId, projectIds), eq(atelierCommands.authorId, userId)));
    const mesObjets = new Map<string, Map<string, number>>();
    for (const m of miens) {
      const parProjet = mesObjets.get(m.projectId) ?? new Map<string, number>();
      for (const id of ids(m.effets, ["crees", "modifies"])) parProjet.set(id, Math.max(parProjet.get(id) ?? 0, m.rev));
      mesObjets.set(m.projectId, parProjet);
    }
    if (mesObjets.size) {
      const autres = await db
        .select({ id: atelierCommands.id, projectId: atelierCommands.projectId, label: atelierCommands.label, effets: atelierCommands.effets, rev: atelierCommands.resultRevision, createdAt: atelierCommands.createdAt, email: users.email, code: projects.code, name: projects.name })
        .from(atelierCommands)
        .innerJoin(users, eq(users.id, atelierCommands.authorId))
        .innerJoin(projects, eq(projects.id, atelierCommands.projectId))
        .where(and(inArray(atelierCommands.projectId, [...mesObjets.keys()]), ne(atelierCommands.authorId, userId), gt(atelierCommands.createdAt, since)))
        .orderBy(desc(atelierCommands.createdAt))
        .limit(200);
      let n = 0;
      for (const a of autres) {
        const miensP = mesObjets.get(a.projectId)!;
        const touches = ids(a.effets, ["modifies", "supprimes"]).filter((id) => (miensP.get(id) ?? Infinity) < a.rev);
        if (!touches.length || n >= LIMIT) continue;
        n++;
        items.push({
          id: `modification:${a.id}`,
          at: a.createdAt.toISOString(),
          kind: "modification",
          projectId: a.projectId,
          projectCode: a.code,
          projectName: a.name,
          stepNumber: null,
          text: `${a.email} a modifié ${touches.length} de vos objets dans l'Atelier de ${a.code} (« ${a.label} », révision ${a.rev}) : ${touches.slice(0, 3).join(", ")}${touches.length > 3 ? "…" : ""}.`,
          unread: false,
        });
      }
    }
  }

  // Péremption de vos exports de dessin (D-110) : un export que vous avez produit, dont le modèle a depuis été modifié
  // par un autre compte ; une notification par fichier (le plus récent de ce nom), datée de la première modification.
  if (projectIds.length) {
    const exports = await db
      .select({ id: drawingExports.id, projectId: drawingExports.projectId, fileName: drawingExports.fileName, rev: drawingExports.modelRevision, createdAt: drawingExports.createdAt, code: projects.code, name: projects.name })
      .from(drawingExports)
      .innerJoin(projects, eq(projects.id, drawingExports.projectId))
      .where(and(inArray(drawingExports.projectId, projectIds), eq(drawingExports.createdBy, userId), gt(drawingExports.createdAt, since)))
      .orderBy(desc(drawingExports.createdAt));
    const derniers = new Map<string, (typeof exports)[number]>();
    for (const x of exports) if (!derniers.has(`${x.projectId}|${x.fileName}`)) derniers.set(`${x.projectId}|${x.fileName}`, x);
    for (const x of [...derniers.values()].slice(0, LIMIT)) {
      const [premiere] = await db
        .select({ rev: atelierCommands.resultRevision, label: atelierCommands.label, createdAt: atelierCommands.createdAt, email: users.email })
        .from(atelierCommands)
        .innerJoin(users, eq(users.id, atelierCommands.authorId))
        .where(and(eq(atelierCommands.projectId, x.projectId), ne(atelierCommands.authorId, userId), gt(atelierCommands.resultRevision, x.rev), gt(atelierCommands.createdAt, x.createdAt)))
        .orderBy(atelierCommands.resultRevision)
        .limit(1);
      if (!premiere) continue;
      items.push({
        id: `peremption:${x.id}`,
        at: premiere.createdAt.toISOString(),
        kind: "peremption",
        projectId: x.projectId,
        projectCode: x.code,
        projectName: x.name,
        stepNumber: 10,
        text: `Votre export « ${x.fileName} » (révision ${x.rev}) est périmé : ${premiere.email} a modifié le modèle de ${x.code} (révision ${premiere.rev}, « ${premiere.label} »).`,
        unread: false,
      });
    }
  }

  // Verrous qui vous ont été transmis (D-089), tant qu'ils courent.
  const transmis = await db
    .select({ cle: atelierLocks.cle, par: atelierLocks.transmisPar, at: atelierLocks.createdAt, expiresAt: atelierLocks.expiresAt, projectId: projects.id, code: projects.code, name: projects.name })
    .from(atelierLocks)
    .innerJoin(projects, eq(projects.id, atelierLocks.projectId))
    .where(and(eq(atelierLocks.authorId, userId), gt(atelierLocks.expiresAt, new Date())));
  for (const v of transmis) {
    if (!v.par) continue;
    items.push({
      id: `verrou:${v.projectId}:${v.cle}:${v.at.toISOString()}`,
      at: v.at.toISOString(),
      kind: "verrou",
      projectId: v.projectId,
      projectCode: v.code,
      projectName: v.name,
      stepNumber: null,
      text: `${v.par} vous a transmis le verrou de ${v.cle.startsWith("niveau:") ? `l'étage ${v.cle.slice(7)}` : v.cle} dans ${v.code} (jusqu'à ${v.expiresAt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: process.env["FADI_TZ"] ?? "Europe/Paris" })}).`,
      unread: false,
    });
  }

  // Prises et libérations de verrous fins par d'autres (D-143) : étage, zone ou objet réservé puis libéré.
  if (projectIds.length) {
    const evts = await db
      .select({ e: atelierLockEvents, email: users.email, code: projects.code, name: projects.name })
      .from(atelierLockEvents)
      .innerJoin(users, eq(users.id, atelierLockEvents.authorId))
      .innerJoin(projects, eq(projects.id, atelierLockEvents.projectId))
      .where(and(inArray(atelierLockEvents.projectId, projectIds), ne(atelierLockEvents.authorId, userId), gt(atelierLockEvents.at, since)))
      .orderBy(desc(atelierLockEvents.at))
      .limit(LIMIT);
    const heure = (d: Date) => d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: process.env["FADI_TZ"] ?? "Europe/Paris" });
    for (const { e, email: auteur, code, name } of evts) {
      items.push({
        id: `verrou-${e.kind}:${e.id}`,
        at: e.at.toISOString(),
        kind: "verrou",
        projectId: e.projectId,
        projectCode: code,
        projectName: name,
        stepNumber: null,
        text: e.kind === "prise" ? `${auteur} a réservé ${e.libelle} dans ${code}${e.expiresAt ? ` jusqu'à ${heure(e.expiresAt)}` : ""}.` : `${auteur} a libéré ${e.libelle} dans ${code}.`,
        unread: false,
      });
    }
  }

  const preferences = await lirePreferencesNotification(userId);
  const { items: visibles, masquees } = filtrerNotifications(items, preferences);
  const sorted = visibles.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).slice(0, LIMIT);
  const seenIso = seenAt ? seenAt.toISOString() : null;
  for (const it of sorted) it.unread = seenIso === null || it.at > seenIso;
  return { seenAt: seenIso, items: sorted, masquees };
}

notificationsRouter.get("/", async (req, res) => {
  res.json(await notificationsFor(req.user!.id, req.user!.email));
});

notificationsRouter.post("/seen", async (req, res) => {
  const now = new Date();
  await db.update(users).set({ notificationsSeenAt: now }).where(eq(users.id, req.user!.id));
  res.json({ seenAt: now.toISOString() });
});
