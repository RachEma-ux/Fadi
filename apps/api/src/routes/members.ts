/**
 * Module Collaboration — partage du projet. Monté sous `/projects/:projectId/members`.
 *
 *   GET    /          → { owner, you, members } : le propriétaire, votre rôle, les personnes invitées (tout lecteur)
 *   POST   /          { email, role } → 201 : invitation (ou changement de rôle) d'un compte existant — propriétaire seulement
 *   PATCH  /:userId   { role } → le rôle d'un membre — propriétaire seulement
 *   DELETE /:userId   → 204 : retrait d'un membre par le propriétaire, ou départ du membre lui-même
 *   POST   /:userId/propriete → transfert de la propriété à ce membre (propriétaire seulement) : l'ancien propriétaire
 *                      devient éditeur, le nouveau quitte la liste des membres ; rien d'autre ne change (réservation, données)
 *
 * Rôles (`lib/owned-project.ts`) : `lecteur` lit tout et commente ;
 * `editeur` lit, commente et modifie (saisies, arbitrages, programme,
 * Atelier, sources…) ; le propriétaire seul partage, retire et supprime le
 * projet. Chaque droit est vérifié par le serveur à chaque requête : le
 * partage ne crée aucune copie, les membres travaillent sur le même projet
 * et le contrôle de concurrence (409) s'applique entre eux comme entre deux
 * appareils d'un même compte.
 *
 * L'invitation vise un compte existant, par son adresse : l'application
 * n'envoie pas de courriel et n'invente pas de compte.
 */
import { Router } from "express";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { projectMembers, projects, users } from "../db/schema.js";
import { requireAuth } from "../middleware/require-auth.js";
import { projectOr404, type ProjectRole } from "../lib/owned-project.js";
import { lockProject } from "../lib/step-rows.js";

export const membersRouter = Router({ mergeParams: true });
membersRouter.use(requireAuth);

export interface MemberView {
  userId: string;
  email: string;
  role: "lecteur" | "editeur";
  invitedBy: string;
  createdAt: string;
}

export const ROLE_LABEL: Record<ProjectRole, string> = {
  proprietaire: "propriétaire",
  editeur: "éditeur",
  lecteur: "lecteur",
};

const roleSchema = z.enum(["lecteur", "editeur"]);
const inviteSchema = z.object({ email: z.string().trim().toLowerCase().email("Adresse invalide").max(254), role: roleSchema });
const roleBody = z.object({ role: roleSchema });

/** Les membres d'un projet (hors propriétaire), avec leur adresse, par date d'invitation. */
export async function listMembers(projectId: string): Promise<MemberView[]> {
  const rows = await db
    .select({ userId: projectMembers.userId, email: users.email, role: projectMembers.role, invitedBy: projectMembers.invitedBy, createdAt: projectMembers.createdAt })
    .from(projectMembers)
    .innerJoin(users, eq(users.id, projectMembers.userId))
    .where(eq(projectMembers.projectId, projectId))
    .orderBy(asc(projectMembers.createdAt), asc(users.email));
  return rows.map((r) => ({ userId: r.userId, email: r.email, role: r.role, invitedBy: r.invitedBy, createdAt: r.createdAt.toISOString() }));
}

export async function ownerEmailOf(ownerId: string): Promise<string> {
  const [owner] = await db.select({ email: users.email }).from(users).where(eq(users.id, ownerId)).limit(1);
  return owner?.email ?? "";
}

membersRouter.get("/", async (req, res) => {
  const project = await projectOr404(req, res, "read");
  if (!project) return;
  res.json({ owner: { userId: project.ownerId, email: await ownerEmailOf(project.ownerId) }, you: { userId: req.user!.id, role: project.role }, members: await listMembers(project.id) });
});

membersRouter.post("/", async (req, res) => {
  const project = await projectOr404(req, res, "owner");
  if (!project) return;
  const parsed = inviteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    return;
  }
  const [account] = await db.select({ id: users.id, email: users.email }).from(users).where(eq(users.email, parsed.data.email)).limit(1);
  if (!account) {
    res.status(404).json({ error: "user_not_found", message: "Aucun compte Fadi n’a cette adresse : la personne doit d’abord créer son compte, puis vous l’invitez." });
    return;
  }
  if (account.id === project.ownerId) {
    res.status(422).json({ error: "sharing_rule", message: "Le propriétaire du projet a déjà tous les droits." });
    return;
  }
  const [row] = await db
    .insert(projectMembers)
    .values({ projectId: project.id, userId: account.id, role: parsed.data.role, invitedBy: req.user!.email })
    .onConflictDoUpdate({ target: [projectMembers.projectId, projectMembers.userId], set: { role: parsed.data.role } })
    .returning();
  res.status(201).json({ userId: account.id, email: account.email, role: row!.role, invitedBy: row!.invitedBy, createdAt: row!.createdAt.toISOString() } satisfies MemberView);
});

membersRouter.patch("/:userId", async (req, res) => {
  const project = await projectOr404(req, res, "owner");
  if (!project) return;
  const parsed = roleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    return;
  }
  const userId = req.params["userId"] as string;
  const [row] = await db
    .update(projectMembers)
    .set({ role: parsed.data.role })
    .where(and(eq(projectMembers.projectId, project.id), eq(projectMembers.userId, userId)))
    .returning();
  if (!row) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const [account] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  res.json({ userId, email: account?.email ?? "", role: row.role, invitedBy: row.invitedBy, createdAt: row.createdAt.toISOString() } satisfies MemberView);
});

membersRouter.delete("/:userId", async (req, res) => {
  const userId = req.params["userId"] as string;
  // Un membre peut quitter le projet lui-même ; retirer quelqu'un d'autre est réservé au propriétaire.
  const project = await projectOr404(req, res, userId === req.user!.id ? "read" : "owner");
  if (!project) return;
  const deleted = await db
    .delete(projectMembers)
    .where(and(eq(projectMembers.projectId, project.id), eq(projectMembers.userId, userId)))
    .returning({ userId: projectMembers.userId });
  if (!deleted.length) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.status(204).end();
});

/**
 * Transfert de propriété : le membre désigné devient propriétaire (il partage,
 * libère et supprime désormais), l'ancien propriétaire reste éditeur. Le
 * projet, ses données, ses membres et une éventuelle réservation d'édition
 * ne changent pas ; la provenance et l'historique non plus.
 */
membersRouter.post("/:userId/propriete", async (req, res) => {
  const project = await projectOr404(req, res, "owner");
  if (!project) return;
  const userId = req.params["userId"] as string;
  const result = await db.transaction(async (tx) => {
    await lockProject(tx, project.id);
    const [member] = await tx
      .select({ userId: projectMembers.userId, email: users.email })
      .from(projectMembers)
      .innerJoin(users, eq(users.id, projectMembers.userId))
      .where(and(eq(projectMembers.projectId, project.id), eq(projectMembers.userId, userId)))
      .limit(1);
    if (!member) return null;
    await tx.delete(projectMembers).where(and(eq(projectMembers.projectId, project.id), eq(projectMembers.userId, userId)));
    await tx.insert(projectMembers).values({ projectId: project.id, userId: project.ownerId, role: "editeur", invitedBy: member.email });
    await tx.update(projects).set({ ownerId: userId, updatedAt: new Date() }).where(eq(projects.id, project.id));
    return member;
  });
  if (!result) {
    res.status(404).json({ error: "not_found", message: "La propriété ne peut être transférée qu'à un membre du projet : invitez d'abord ce compte." });
    return;
  }
  res.json({ owner: { userId: result.userId, email: result.email }, you: { userId: req.user!.id, role: "editeur" as ProjectRole }, members: await listMembers(project.id) });
});
