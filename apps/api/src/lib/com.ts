/**
 * Communication (COM, Issue #280) — lectures et contrôles adossés à la base. Les règles elles-mêmes sont pures
 * (`com-audience.ts`, `demandes-regles.ts`) ; ce module relit l'accès COURANT de chaque personne au projet, résout les
 * références pour un lecteur donné et calcule les destinataires réels d'une audience.
 *
 * Aucune lecture ne fait confiance au client : une conversation illisible est introuvable (404), une référence
 * inaccessible n'a pas de libellé, une mention n'ouvre rien (COM-R2, COM-R3).
 */
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  collabDemandes, comConversations, comMessages, comParticipants, producedDocuments, projectEffectiveAccess, stepFiles, studioComments, studioObservations,
  studioStudies, studioVariants, users, type ComAudience, type ComRef, type ComRefType,
} from "../db/schema.js";
import { PARCOURS_STEPS } from "../data/parcours.js";
import { audienceVisible } from "./audience.js";
import { extrait, peutLire, type Lecteur, type Participation } from "./com-audience.js";
import { loadProjectAccess, type AccessibleProject, type ProjectRole } from "./owned-project.js";

type Querier = Pick<typeof db, "select">;

export class ComError extends Error {
  constructor(public readonly status: number, public readonly body: { error: string; message?: string; [k: string]: unknown }) {
    super(body.message ?? body.error);
  }
}
export const introuvable = (): never => { throw new ComError(404, { error: "not_found" }); };

export const COM_REF_TYPES = ["etape", "document", "fichier", "studio-variante", "observation-studio", "message", "demande", "revision-atelier"] as const satisfies readonly ComRefType[];

/**
 * Comptes ayant aujourd'hui un rôle sur le projet (propriétaire, éditeurs, lecteurs) — jamais l'accès support. Lus dans la
 * vue `project_effective_access` (Issue #262, phase 2), source unique des droits : un participant actif avec un rôle de
 * portée projet en fait partie, une participation suspendue, terminée ou « revue seule » jamais.
 */
export async function comptesDuProjet(projectId: string, q: Querier = db): Promise<Map<string, { email: string; role: ProjectRole }>> {
  const rows = await q.select({ userId: projectEffectiveAccess.userId, role: projectEffectiveAccess.role, email: users.email })
    .from(projectEffectiveAccess).innerJoin(users, eq(users.id, projectEffectiveAccess.userId)).where(eq(projectEffectiveAccess.projectId, projectId));
  const out = new Map<string, { email: string; role: ProjectRole }>();
  for (const r of rows) out.set(r.userId, { email: r.email, role: r.role });
  return out;
}

/** Participations (y compris retirées) d'une conversation, par compte. */
export async function participationsDe(conversationId: string, q: Querier = db): Promise<Map<string, Participation & { addedAt: Date }>> {
  const rows = await q.select().from(comParticipants).where(eq(comParticipants.conversationId, conversationId));
  return new Map(rows.map((r) => [r.userId, { historyFrom: r.historyFrom, removedAt: r.removedAt, addedAt: r.addedAt }]));
}

/** Lecteur d'une conversation : rôle courant au projet et participation. */
export function lecteur(userId: string, role: ProjectRole | null, participations: ReadonlyMap<string, Participation>): Lecteur {
  return { userId, role, participation: participations.get(userId) ?? null };
}

/** Destinataires réels d'une audience : membres du projet qui la lisent aujourd'hui (l'accès support n'est jamais destinataire). */
export function destinataires(audience: ComAudience, comptes: ReadonlyMap<string, { email: string; role: ProjectRole }>, participations: ReadonlyMap<string, Participation>): { userId: string; email: string }[] {
  return [...comptes.entries()]
    .filter(([id, c]) => peutLire(audience, lecteur(id, c.role, participations)))
    .map(([userId, c]) => ({ userId, email: c.email }))
    .sort((a, b) => a.email.localeCompare(b.email));
}

export interface ConversationChargee {
  access: AccessibleProject;
  conv: typeof comConversations.$inferSelect;
  participations: Map<string, Participation & { addedAt: Date }>;
  moi: Lecteur;
}

/** Conversation lisible par l'utilisateur dans ce projet, sinon 404 (sans distinguer absence et audience). */
export async function chargerConversation(projectId: string, conversationId: string, userId: string, q: Querier = db): Promise<ConversationChargee> {
  const access = await loadProjectAccess(projectId, userId, q);
  if (!access) return introuvable();
  const [conv] = await q.select().from(comConversations).where(and(eq(comConversations.id, conversationId), eq(comConversations.projectId, projectId))).limit(1);
  if (!conv) return introuvable();
  const participations = await participationsDe(conv.id, q);
  const moi = lecteur(userId, access.role, participations);
  if (!peutLire(conv.audience, moi)) return introuvable();
  return { access, conv, participations, moi };
}

export interface RefResolue extends ComRef {
  /** Libellé seulement si l'élément est accessible au lecteur (COM-D8). */
  label: string | null;
  accessible: boolean;
  /** État relu à la source (demande, observation) — jamais tenu par COM. */
  statut?: string;
  /** Contexte de navigation (variante Studio, étape) pour l'interface. */
  lien?: Record<string, string>;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * Résout les références pour un lecteur (rôle courant `role`, compte `userId`) : libellé et état si l'élément lui est
 * accessible, sinon `accessible: false` et aucun libellé. `strict` (écriture) : une référence absente du projet ou
 * inaccessible à l'auteur → 422.
 */
export async function resoudreRefs(projectId: string, refs: readonly ComRef[], userId: string, role: ProjectRole, strict = false, q: Querier = db): Promise<RefResolue[]> {
  const out: RefResolue[] = [];
  for (const r of refs) {
    const res = await resoudreRef(projectId, r, userId, role, q);
    if (strict && !res.accessible) throw new ComError(422, { error: "reference_invalide", message: "Référence absente du projet ou inaccessible.", ref: r });
    out.push(res);
  }
  return out;
}

async function resoudreRef(projectId: string, r: ComRef, userId: string, role: ProjectRole, q: Querier): Promise<RefResolue> {
  const ferme: RefResolue = { ...r, label: null, accessible: false };
  switch (r.type) {
    case "etape": {
      const n = Number(r.id);
      const def = PARCOURS_STEPS.find((s) => s.number === n);
      return def ? { ...r, label: `Étape ${pad2(n)} — ${def.title}`, accessible: true, lien: { etape: String(n) } } : ferme;
    }
    case "revision-atelier": {
      const n = Number(r.id);
      return Number.isInteger(n) && n >= 0 ? { ...r, label: `Atelier, révision ${n}`, accessible: true } : ferme;
    }
    case "document": {
      const [d] = await q.select({ label: producedDocuments.label, fileName: producedDocuments.fileName }).from(producedDocuments).where(and(eq(producedDocuments.projectId, projectId), eq(producedDocuments.kind, r.id))).limit(1);
      return d ? { ...r, label: `${d.label} (${d.fileName})`, accessible: true } : ferme;
    }
    case "fichier": {
      const [f] = await q.select({ name: stepFiles.name, step: stepFiles.stepNumber }).from(stepFiles).where(and(eq(stepFiles.projectId, projectId), eq(stepFiles.id, r.id))).limit(1);
      return f ? { ...r, label: `${f.name} (étape ${pad2(f.step)})`, accessible: true, lien: { etape: String(f.step) } } : ferme;
    }
    case "studio-variante": {
      const [v] = await q.select({ name: studioVariants.name, studyId: studioStudies.id, study: studioStudies.name }).from(studioVariants).innerJoin(studioStudies, eq(studioStudies.id, studioVariants.studyId))
        .where(and(eq(studioVariants.id, r.id), eq(studioStudies.projectId, projectId))).limit(1);
      return v ? { ...r, label: `${v.study} · ${v.name}`, accessible: true, lien: { studyId: v.studyId, variantId: r.id } } : ferme;
    }
    case "observation-studio": {
      const [o] = await q.select({ body: studioComments.body, audience: studioComments.audience, statut: studioObservations.statut, variantId: studioVariants.id, studyId: studioStudies.id })
        .from(studioObservations).innerJoin(studioComments, eq(studioComments.id, studioObservations.commentId))
        .innerJoin(studioVariants, eq(studioVariants.id, studioObservations.variantId)).innerJoin(studioStudies, eq(studioStudies.id, studioVariants.studyId))
        .where(and(eq(studioObservations.commentId, r.id), eq(studioStudies.projectId, projectId), isNull(studioComments.deletedAt))).limit(1);
      if (!o || !audienceVisible(role, o.audience)) return ferme;
      return { ...r, label: `Observation « ${extrait(o.body, 80)} »`, accessible: true, statut: o.statut, lien: { studyId: o.studyId, variantId: o.variantId } };
    }
    case "demande": {
      const [d] = await q.select({ question: collabDemandes.question, audience: collabDemandes.audience, statut: collabDemandes.statut }).from(collabDemandes).where(and(eq(collabDemandes.id, r.id), eq(collabDemandes.projectId, projectId))).limit(1);
      if (!d || !audienceVisible(role, d.audience)) return ferme;
      return { ...r, label: `Demande de précision « ${extrait(d.question, 80)} »`, accessible: true, statut: d.statut };
    }
    case "message": {
      const [m] = await q.select({ conversationId: comMessages.conversationId, authorEmail: users.email, createdAt: comMessages.createdAt, withdrawnAt: comMessages.withdrawnAt, title: comConversations.title, audience: comConversations.audience })
        .from(comMessages).innerJoin(comConversations, eq(comConversations.id, comMessages.conversationId)).innerJoin(users, eq(users.id, comMessages.authorId))
        .where(and(eq(comMessages.id, r.id), eq(comConversations.projectId, projectId))).limit(1);
      if (!m) return ferme;
      const parts = await participationsDe(m.conversationId, q);
      const l = lecteur(userId, role, parts);
      if (!peutLire(m.audience, l)) return ferme;
      const debut = m.audience === "participants" ? l.participation?.historyFrom ?? null : null;
      if (debut && m.createdAt < debut) return ferme;
      return { ...r, label: `Message de ${m.authorEmail} dans « ${m.title} »${m.withdrawnAt ? " (retiré)" : ""}`, accessible: true, lien: { conversationId: m.conversationId } };
    }
  }
  return ferme;
}

/** Valide le contexte déclaré d'un fil contextuel (existe dans le projet et est accessible à son auteur). */
export async function validerContexte(projectId: string, type: string | null | undefined, ref: string | null | undefined, userId: string, role: ProjectRole): Promise<void> {
  if (!type || type === "projet") return;
  if (!ref) throw new ComError(422, { error: "contexte_invalide", message: "Le contexte déclaré exige sa référence." });
  const map: Record<string, ComRefType> = { etape: "etape", document: "document", fichier: "fichier", "studio-variante": "studio-variante", "revision-atelier": "revision-atelier" };
  const t = map[type];
  if (!t) throw new ComError(422, { error: "contexte_invalide", message: "Type de contexte inconnu." });
  await resoudreRefs(projectId, [{ type: t, id: ref }], userId, role, true);
}

/** Emails des comptes demandés (participants, mentions), qu'ils soient membres ou non (affichage de l'historique). */
export async function emails(ids: readonly string[], q: Querier = db): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const rows = await q.select({ id: users.id, email: users.email }).from(users).where(inArray(users.id, [...new Set(ids)]));
  return new Map(rows.map((r) => [r.id, r.email]));
}
