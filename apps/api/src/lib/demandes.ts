/**
 * Demandes de précision (Collaboration partagée, COM-D10) — écritures et lectures adossées à la base. Règles pures :
 * `demandes-regles.ts`. Audience E1 (`equipe` | `projet`) filtrée par le serveur sur toute lecture ; le répondant doit
 * lire la demande ; question et réponses ne sont jamais réécrites (journal `collab_demande_events`, ajout seulement).
 */
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { collabDemandeEvents, collabDemandes, users, type ComRef, type CommentAudience } from "../db/schema.js";
import { audienceOfNew, audienceSchema, audienceVisible, AudienceError, seesTeam } from "./audience.js";
import { COM_REF_TYPES, ComError, comptesDuProjet, emails, introuvable, resoudreRefs, type RefResolue } from "./com.js";
import { empreinteEnvoi } from "./com-audience.js";
import { aujourdHui, demandeApres, demandeAutorisee, enRetard, REFUS_DEMANDE, refusClotureDemande, type DemandeTransition } from "./demandes-regles.js";
import { newId } from "./ids.js";
import { loadProjectAccess, type AccessibleProject, type ProjectRole } from "./owned-project.js";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export const comRefSchema = z.object({ type: z.enum(COM_REF_TYPES), id: z.string().trim().min(1).max(256) }).strict();
const echeanceSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Échéance au format AAAA-MM-JJ");

export const demandeCreationSchema = z.object({
  question: z.string().trim().min(1, "Question vide").max(4000),
  responderId: z.string().min(1).max(256),
  echeance: echeanceSchema.nullable().optional(),
  audience: audienceSchema.optional(),
  refs: z.array(comRefSchema).max(20).optional(),
  clientRequestId: z.string().min(1).max(128).optional(),
}).strict();
export type DemandeCreation = z.infer<typeof demandeCreationSchema>;

export const demandeTransitionSchema = z.object({
  action: z.enum(["repondre", "cloturer", "rouvrir", "reattribuer"]),
  body: z.string().trim().max(4000).optional(),
  responderId: z.string().min(1).max(256).optional(),
}).strict();

export interface DemandeVue {
  id: string;
  question: string;
  refs: RefResolue[];
  requester: { id: string; email: string };
  responder: { id: string; email: string; aAcces: boolean };
  echeance: string | null;
  enRetard: boolean;
  statut: "ouverte" | "repondue" | "close";
  audience: CommentAudience;
  sourceMessageId: string | null;
  createdAt: string;
  updatedAt: string;
  peut: { repondre: boolean; cloturer: boolean; rouvrir: boolean; reattribuer: boolean };
  journal?: { id: number; action: string; acteur: string; body: string | null; de: string | null; vers: string | null; at: string }[];
  replayed?: boolean;
}

function audienceOuRefus(f: () => CommentAudience): CommentAudience {
  try { return f(); } catch (e) { if (e instanceof AudienceError) throw new ComError(e.status, e.body); throw e; }
}

/** Le répondant doit être membre du projet et lire la demande (jamais l'accès support). */
async function repondantValide(projectId: string, responderId: string, audience: CommentAudience, q: Pick<typeof db, "select"> = db): Promise<void> {
  const comptes = await comptesDuProjet(projectId, q);
  const c = comptes.get(responderId);
  if (!c) throw new ComError(422, { error: "repondant_invalide", message: "Le répondant doit être membre du projet." });
  if (!audienceVisible(c.role, audience)) throw new ComError(422, { error: "repondant_sans_acces", message: "Le répondant ne lirait pas cette demande (réservée à l'équipe) : ouvrez-la aux lecteurs ou choisissez un membre de l'équipe." });
}

/** Création (201) ou rejeu par `clientRequestId` (même demandeur, même contenu ; sinon 409). */
export async function creerDemande(access: AccessibleProject, actorId: string, input: DemandeCreation, sourceMessageId: string | null = null, tx?: Tx): Promise<{ id: string; replayed: boolean }> {
  if (access.role === "support") throw new ComError(403, { error: "support_read_only", message: "Accès support en lecture seule." });
  const audience = audienceOuRefus(() => audienceOfNew(access.role, input.audience));
  const refs: ComRef[] = input.refs ?? [];
  const hash = empreinteEnvoi({ q: input.question, r: input.responderId, e: input.echeance ?? null, a: audience, refs, s: sourceMessageId });
  const run = async (t: Tx) => {
    if (input.clientRequestId) {
      const [prev] = await t.select({ id: collabDemandes.id, hash: collabDemandes.payloadHash }).from(collabDemandes).where(and(eq(collabDemandes.requesterId, actorId), eq(collabDemandes.clientRequestId, input.clientRequestId))).limit(1);
      if (prev) {
        if (prev.hash !== hash) throw new ComError(409, { error: "request_conflict", message: "Cet identifiant de requête est déjà utilisé pour un autre contenu." });
        return { id: prev.id, replayed: true };
      }
    }
    await repondantValide(access.id, input.responderId, audience, t);
    await resoudreRefs(access.id, refs, actorId, access.role, true, t);
    const id = newId("demande");
    await t.insert(collabDemandes).values({ id, projectId: access.id, question: input.question, refs, requesterId: actorId, responderId: input.responderId, echeance: input.echeance ?? null, audience, sourceMessageId, clientRequestId: input.clientRequestId ?? null, payloadHash: hash });
    await t.insert(collabDemandeEvents).values({ demandeId: id, actorId, action: "ouvrir", body: input.question, toUser: input.responderId });
    return { id, replayed: false };
  };
  return tx ? run(tx) : db.transaction(run);
}

/** Passage du cycle ; droits et motif contrôlés ; ligne relue sous verrou. */
export async function transitionDemande(projectId: string, actorId: string, demandeId: string, input: z.infer<typeof demandeTransitionSchema>): Promise<void> {
  await db.transaction(async (tx) => {
    const access = await loadProjectAccess(projectId, actorId, tx);
    if (!access) return introuvable();
    const [d] = await tx.select().from(collabDemandes).where(and(eq(collabDemandes.id, demandeId), eq(collabDemandes.projectId, projectId))).for("update").limit(1);
    if (!d || !audienceVisible(access.role, d.audience)) return introuvable();
    const action = input.action as DemandeTransition;
    if (!demandeAutorisee(action, { userId: actorId, role: access.role, requesterId: d.requesterId, responderId: d.responderId })) throw new ComError(403, { error: "forbidden", message: REFUS_DEMANDE[action] });
    const vers = demandeApres(d.statut, action);
    if (!vers) throw new ComError(409, { error: "transition_impossible", message: `Passage « ${action} » impossible depuis l'état « ${d.statut} ».`, statut: d.statut });
    if (action === "repondre" && !input.body) throw new ComError(422, { error: "reponse_vide", message: "La réponse est vide." });
    if (action === "cloturer") { const r = refusClotureDemande(d.statut, input.body); if (r) throw new ComError(422, { error: "motif_exige", message: r }); }
    let toUser: string | null = null;
    if (action === "reattribuer") {
      if (!input.responderId || input.responderId === d.responderId) throw new ComError(422, { error: "repondant_invalide", message: "Désignez un autre répondant." });
      await repondantValide(projectId, input.responderId, d.audience, tx);
      toUser = input.responderId;
    }
    await tx.update(collabDemandes).set({ statut: vers, updatedAt: new Date(), ...(toUser ? { responderId: toUser } : {}) }).where(eq(collabDemandes.id, d.id));
    await tx.insert(collabDemandeEvents).values({ demandeId: d.id, actorId, action, body: input.body?.trim() || null, fromUser: toUser ? d.responderId : null, toUser });
  });
}

/** Demandes lisibles (audience E1), éventuellement filtrées ; journal joint pour le détail. */
export async function lireDemandes(projectId: string, userId: string, role: ProjectRole, filtre: { ids?: string[]; aRepondre?: boolean; journal?: boolean } = {}): Promise<DemandeVue[]> {
  const conds = [eq(collabDemandes.projectId, projectId)];
  if (!seesTeam(role)) conds.push(eq(collabDemandes.audience, "projet"));
  if (filtre.ids) conds.push(inArray(collabDemandes.id, filtre.ids.length ? filtre.ids : ["-"]));
  if (filtre.aRepondre) conds.push(eq(collabDemandes.responderId, userId), eq(collabDemandes.statut, "ouverte"));
  const rows = await db.select().from(collabDemandes).where(and(...conds)).orderBy(desc(collabDemandes.createdAt)).limit(200);
  const comptes = await comptesDuProjet(projectId);
  const mails = await emails(rows.flatMap((r) => [r.requesterId, r.responderId]));
  const jour = aujourdHui();
  const out: DemandeVue[] = [];
  for (const r of rows) {
    const resp = comptes.get(r.responderId);
    const acteur = { userId, role, requesterId: r.requesterId, responderId: r.responderId };
    const v: DemandeVue = {
      id: r.id, question: r.question, refs: await resoudreRefs(projectId, r.refs, userId, role),
      requester: { id: r.requesterId, email: mails.get(r.requesterId) ?? "?" },
      responder: { id: r.responderId, email: mails.get(r.responderId) ?? "?", aAcces: !!resp && audienceVisible(resp.role, r.audience) },
      echeance: r.echeance, enRetard: enRetard(r, jour), statut: r.statut, audience: r.audience, sourceMessageId: r.sourceMessageId,
      createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
      peut: {
        repondre: demandeAutorisee("repondre", acteur) && !!demandeApres(r.statut, "repondre"),
        cloturer: demandeAutorisee("cloturer", acteur) && !!demandeApres(r.statut, "cloturer"),
        rouvrir: demandeAutorisee("rouvrir", acteur) && !!demandeApres(r.statut, "rouvrir"),
        reattribuer: demandeAutorisee("reattribuer", acteur) && !!demandeApres(r.statut, "reattribuer"),
      },
    };
    if (filtre.journal) {
      const ev = await db.select({ e: collabDemandeEvents, email: users.email }).from(collabDemandeEvents).innerJoin(users, eq(users.id, collabDemandeEvents.actorId)).where(eq(collabDemandeEvents.demandeId, r.id)).orderBy(asc(collabDemandeEvents.id));
      const m2 = await emails(ev.flatMap(({ e }) => [e.fromUser, e.toUser].filter((x): x is string => !!x)));
      v.journal = ev.map(({ e, email }) => ({ id: e.id, action: e.action, acteur: email, body: e.body, de: e.fromUser ? m2.get(e.fromUser) ?? null : null, vers: e.toUser ? m2.get(e.toUser) ?? null : null, at: e.at.toISOString() }));
    }
    out.push(v);
  }
  return out;
}
