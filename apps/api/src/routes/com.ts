/**
 * Communication (COM, Issue #280, docs/workstreams/communication/PLAN.md) — monté sous `/projects/:projectId/com` :
 *
 *   GET    /conversations[?contexte=type:ref]       → conversations lisibles (audience recalculée), non lues, contexte résolu
 *   POST   /conversations                           → { mode, title?, audience?, participantIds?, context? } : 201
 *   GET    /conversations/:id                       → fil : messages lisibles (depuis l'historique reçu), participants,
 *                                                     destinataires réels, journal, droits
 *   POST   /conversations/:id/lu                    → lecture enregistrée (et ouverture des messages des autres)
 *   PATCH  /conversations/:id/audience              → { audience } : action distincte et journalisée (COM-R1)
 *   POST   /conversations/:id/participants          → { userId, historique: tout | depuis-ajout } (COM-D4)
 *   DELETE /conversations/:id/participants/:userId  → retrait (gestionnaire, ou soi-même)
 *   PUT    /conversations/:id/animateur             → { userId } : transfert de l'animation (journalisé)
 *   POST   /conversations/:id/messages              → { body, replyToId?, refs?, mentions?, ackRequired?, urgent?,
 *                                                     clientRequestId?, capturedAt? } : 201 ; rejeu 200 (COM-6)
 *   PATCH  /messages/:id                            → { body } : modification par l'auteur, version conservée (COM-D6)
 *   DELETE /messages/:id                            → retrait par l'auteur, version conservée
 *   GET    /messages/:id/versions                   → textes remplacés
 *   POST   /messages/:id/accuse                     → accusé de réception (COM-R6)
 *   POST   /conversations/:id/partages/apercu       → { messageIds, cibleId, note? } : destinataires, contenu, empreinte
 *   POST   /conversations/:id/partages              → idem + { empreinte } : 201 ; 409 si l'audience a changé (COM-R4)
 *   POST   /messages/:id/actions/apercu             → action liée : demande | observation-studio (COM-R7)
 *   POST   /messages/:id/actions                    → idem + { empreinte } : 201
 *   GET    /responsabilites                          → propriétaire : responsabilités ouvertes par personne (COM-7)
 *   GET    /activite[?filtre=&auteur=&depuis=&etape=] → activité du projet autorisée (concept « Project activity ») :
 *                                                     messages, demandes, observations, tâches, décisions, revues et
 *                                                     diffusions Studio, chacun avec son libellé et sa source
 *   GET    /revues                                  → revues Studio liées (« Requests and reviews ») : état relu à la source
 *
 * Toute route relit l'accès courant (`loadProjectAccess`) : une conversation illisible est introuvable (404).
 */
import { Router, type NextFunction, type Request, type Response } from "express";
import { and, asc, desc, eq, gt, inArray, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import {
  collabDemandeEvents, studioComments, studioObservationDecisions, studioObservationEvents, studioObservationTaskEvents, studioObservationTasks, studioObservations,
  studioPublicationEvents, studioPublications, studioStudies, studioVariants,
  collabDemandes, comConversations, comEvents, comLinks, comMessageVersions, comMessages, comParticipants, comReads, comReceipts, users,
  type ComAudience, type ComRef,
} from "../db/schema.js";
import { audienceSchema, audienceVisible, seesTeam } from "../lib/audience.js";
import {
  chargerConversation, COM_REF_TYPES, ComError, comptesDuProjet, destinataires, emails, introuvable, lecteur, participationsDe, resoudreRefs, validerContexte,
  type ConversationChargee,
} from "../lib/com.js";
import {
  audiencePermise, COM_AUDIENCES, debutHistorique, empreinteApercu, empreinteEnvoi, extrait, libelleAudience, peutEcrire, peutGerer, peutLire, refusChangementAudience,
  trierMentions, type Lecteur,
} from "../lib/com-audience.js";
import { creerDemande, lireDemandes } from "../lib/demandes.js";
import { aujourdHui, enRetard } from "../lib/demandes-regles.js";
import { newId } from "../lib/ids.js";
import { loadProjectAccess, projectOr404, type AccessibleProject } from "../lib/owned-project.js";
import { StudioRequestError } from "../lib/studio-commands.js";
import { openStudioObservation } from "../lib/studio-observations-suivi.js";
import { requireAuth } from "../middleware/require-auth.js";

export const comRouter = Router({ mergeParams: true });
comRouter.use(requireAuth);

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Nombre de messages renvoyés par la lecture d'un fil : les plus récents (`anterieurs` compte les autres). */
export const FENETRE_MESSAGES = 500;

const endpoint = (f: (req: Request, res: Response) => Promise<void>) => async (req: Request, res: Response, next: NextFunction) => {
  try { await f(req, res); }
  catch (e) {
    if (e instanceof ComError || e instanceof StudioRequestError) res.status(e.status).json(e.body);
    else next(e);
  }
};
const pid = (req: Request) => String((req.params as Record<string, string>)["projectId"] ?? "");
const param = (req: Request, k: string) => String((req.params as Record<string, string>)[k] ?? "");
function corps<S extends z.ZodTypeAny>(schema: S, req: Request): z.infer<S> {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) throw new ComError(400, { error: "invalid_input", details: parsed.error.flatten() });
  return parsed.data as z.infer<S>;
}

const refSchema = z.object({ type: z.enum(COM_REF_TYPES), id: z.string().trim().min(1).max(256) }).strict();
const idSchema = z.string().min(1).max(256);

// ---------------------------------------------------------------------------------------------------------------------
// Vues

async function vueConversation(c: ConversationChargee, projectCode: string, comptes: Awaited<ReturnType<typeof comptesDuProjet>>, nonLus: number) {
  const { conv, participations, moi } = c;
  const dest = destinataires(conv.audience, comptes, participations);
  const actifs = [...participations.entries()].filter(([, p]) => p.removedAt === null).map(([id]) => id);
  const mails = await emails([...actifs, conv.stewardId]);
  const contexte = conv.contextType && conv.contextType !== "projet" && conv.contextRef
    ? (await resoudreRefs(conv.projectId, [{ type: conv.contextType as ComRef["type"], id: conv.contextRef }], moi.userId, moi.role!))[0] ?? null
    : null;
  return {
    id: conv.id, mode: conv.mode, title: conv.title, audience: conv.audience,
    audienceLabel: libelleAudience(conv.audience, { code: projectCode }, conv.audience === "participants" ? actifs.map((id) => mails.get(id) ?? "?").sort() : []),
    context: conv.contextType ? { type: conv.contextType, ref: conv.contextRef, revision: conv.contextRevision, label: contexte?.label ?? (conv.contextType === "projet" ? "Projet" : null), accessible: contexte?.accessible ?? conv.contextType === "projet", lien: contexte?.lien } : null,
    steward: { id: conv.stewardId, email: mails.get(conv.stewardId) ?? "?" },
    destinataires: dest.length,
    lastMessageAt: conv.lastMessageAt.toISOString(), createdAt: conv.createdAt.toISOString(),
    nonLus,
    peut: { ecrire: peutEcrire(conv.audience, moi), gerer: peutGerer(conv.audience, moi, conv.stewardId) },
  };
}

/** Non lus : messages des autres postérieurs à la dernière lecture (et à l'historique reçu). */
async function nonLusDe(conversationId: string, userId: string, depuis: Date | null): Promise<number> {
  const [r] = await db.select({ at: comReads.lastReadAt }).from(comReads).where(and(eq(comReads.conversationId, conversationId), eq(comReads.userId, userId)));
  const borne = [r?.at, depuis].filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0];
  const [n] = await db.select({ n: sql<number>`count(*)::int` }).from(comMessages)
    .where(and(eq(comMessages.conversationId, conversationId), ne(comMessages.authorId, userId), isNull(comMessages.withdrawnAt), ...(borne ? [gt(comMessages.createdAt, borne)] : [])));
  return n?.n ?? 0;
}

// ---------------------------------------------------------------------------------------------------------------------
// Conversations

comRouter.get("/conversations", endpoint(async (req, res) => {
  const access = await projectOr404(req, res, "read");
  if (!access) return;
  const userId = req.user!.id;
  const conds = [eq(comConversations.projectId, access.id)];
  const ctx = typeof req.query["contexte"] === "string" ? req.query["contexte"] : null;
  if (ctx) {
    const i = ctx.indexOf(":");
    conds.push(eq(comConversations.contextType, (i < 0 ? ctx : ctx.slice(0, i)) as never));
    if (i >= 0) conds.push(eq(comConversations.contextRef, ctx.slice(i + 1)));
  }
  const rows = await db.select().from(comConversations).where(and(...conds)).orderBy(desc(comConversations.lastMessageAt)).limit(300);
  const comptes = await comptesDuProjet(access.id);
  const out = [];
  for (const conv of rows) {
    const participations = await participationsDe(conv.id);
    const moi = lecteur(userId, access.role, participations);
    if (!peutLire(conv.audience, moi)) continue;
    out.push(await vueConversation({ access, conv, participations, moi }, access.code, comptes, await nonLusDe(conv.id, userId, debutHistorique(conv.audience, moi))));
  }
  res.setHeader("Cache-Control", "private, no-store");
  res.json({ conversations: out, membres: [...comptes.entries()].map(([id, c]) => ({ id, email: c.email, role: c.role })).sort((a, b) => a.email.localeCompare(b.email)) });
}));

const creationSchema = z.object({
  mode: z.enum(["contexte", "groupe", "direct"]),
  title: z.string().trim().max(200).optional(),
  audience: z.enum(COM_AUDIENCES).optional(),
  participantIds: z.array(idSchema).max(100).optional(),
  context: z.object({ type: z.enum(["projet", "etape", "document", "fichier", "studio-variante", "revision-atelier"]), ref: z.string().trim().max(256).nullable().optional(), revision: z.string().trim().max(128).nullable().optional() }).strict().optional(),
}).strict();

comRouter.post("/conversations", endpoint(async (req, res) => {
  const access = await projectOr404(req, res, "comment");
  if (!access) return;
  const input = corps(creationSchema, req);
  const userId = req.user!.id;
  const audience: ComAudience = input.mode === "contexte" ? input.audience ?? "equipe" : "participants";
  if (!audiencePermise(input.mode, audience)) throw new ComError(422, { error: "audience_fixe", message: "Une conversation directe ou de groupe est limitée à ses participants." });
  if (audience === "equipe" && !seesTeam(access.role)) throw new ComError(422, { error: "audience_interdite", message: "Un lecteur n'écrit pas dans une audience réservée à l'équipe qu'il ne lit pas." });
  const comptes = await comptesDuProjet(access.id);
  const autres = [...new Set((input.participantIds ?? []).filter((id) => id !== userId))];
  if (audience === "participants") {
    if (input.mode === "direct" && autres.length !== 1) throw new ComError(422, { error: "participants_invalides", message: "Une conversation directe réunit exactement deux personnes." });
    if (!autres.length) throw new ComError(422, { error: "participants_invalides", message: "Nommez au moins un autre participant." });
    const hors = autres.filter((id) => !comptes.has(id));
    if (hors.length) throw new ComError(422, { error: "participants_hors_projet", message: "Chaque participant doit être membre du projet.", participants: hors });
  } else if (autres.length) throw new ComError(422, { error: "participants_inutiles", message: "Une audience « équipe » ou « projet » suit les rôles du projet : aucun participant à nommer." });
  if (input.mode === "contexte" && !input.context) throw new ComError(422, { error: "contexte_requis", message: "Un fil contextuel déclare son contexte (projet, étape, document, fichier, variante, révision)." });
  if (input.mode !== "contexte" && input.context) throw new ComError(422, { error: "contexte_inutile", message: "Une conversation directe ou de groupe n'a pas de contexte : mentionnez l'élément dans un message." });
  if (input.context) await validerContexte(access.id, input.context.type, input.context.ref, userId, access.role);
  const mails = await emails([userId, ...autres]);
  const title = input.title?.trim() || (input.mode === "direct" ? `${mails.get(userId)} ↔ ${mails.get(autres[0]!)}` : "");
  if (!title) throw new ComError(422, { error: "titre_requis", message: "Donnez un titre à la conversation." });
  const id = newId("com_conversation");
  await db.transaction(async (tx) => {
    await tx.insert(comConversations).values({
      id, projectId: access.id, mode: input.mode, title, audience,
      contextType: input.context?.type ?? null, contextRef: input.context?.ref ?? null, contextRevision: input.context?.revision ?? null,
      stewardId: userId, createdBy: userId,
    });
    if (audience === "participants") for (const u of [userId, ...autres]) await tx.insert(comParticipants).values({ conversationId: id, userId: u, addedBy: userId });
    await tx.insert(comEvents).values({ conversationId: id, actorId: userId, action: "creer", detail: { mode: input.mode, audience, participants: audience === "participants" ? [userId, ...autres] : [] } });
  });
  const c = await chargerConversation(access.id, id, userId);
  res.status(201).json(await vueConversation(c, access.code, comptes, 0));
}));

comRouter.get("/conversations/:conversationId", endpoint(async (req, res) => {
  const userId = req.user!.id;
  const c = await chargerConversation(pid(req), param(req, "conversationId"), userId);
  const { access, conv, participations, moi } = c;
  const comptes = await comptesDuProjet(access.id);
  const debut = debutHistorique(conv.audience, moi);
  // Fenêtre des FENETRE_MESSAGES derniers messages (les plus récents, jamais les seuls plus anciens) ; `anterieurs` dit
  // combien de messages plus anciens ne sont pas renvoyés.
  const filtreFil = and(eq(comMessages.conversationId, conv.id), ...(debut ? [gt(comMessages.createdAt, new Date(debut.getTime() - 1))] : []));
  const rows = (await db.select().from(comMessages).where(filtreFil).orderBy(desc(comMessages.createdAt), desc(comMessages.id)).limit(FENETRE_MESSAGES)).reverse();
  const [{ total } = { total: 0 }] = await db.select({ total: sql<number>`count(*)::int` }).from(comMessages).where(filtreFil);
  const anterieurs = Math.max(0, total - rows.length);
  const ids = rows.map((m) => m.id);
  const receipts = ids.length ? await db.select().from(comReceipts).where(inArray(comReceipts.messageId, ids)) : [];
  const versions = ids.length ? await db.select({ messageId: comMessageVersions.messageId, n: sql<number>`count(*)::int` }).from(comMessageVersions).where(inArray(comMessageVersions.messageId, ids)).groupBy(comMessageVersions.messageId) : [];
  const links = ids.length ? await db.select().from(comLinks).where(inArray(comLinks.messageId, ids)) : [];
  const dest = destinataires(conv.audience, comptes, participations);
  const mails = await emails([...rows.flatMap((m) => [m.authorId, ...m.mentions]), ...participations.keys(), conv.stewardId]);
  const gere = peutGerer(conv.audience, moi, conv.stewardId);
  const messages = [];
  for (const m of rows) {
    const mine = m.authorId === userId;
    const recus = receipts.filter((r) => r.messageId === m.id);
    const moiRecu = recus.find((r) => r.userId === userId);
    const attendus = dest.filter((d) => d.userId !== m.authorId);
    const lien = links.find((l) => l.messageId === m.id);
    const refs = m.withdrawnAt ? [] : await resoudreRefs(access.id, [...m.refs, ...(lien ? [{ type: lien.targetType, id: lien.targetId } as ComRef] : [])], userId, access.role);
    messages.push({
      id: m.id, author: { id: m.authorId, email: mails.get(m.authorId) ?? "?", aAcces: !!comptes.get(m.authorId) && peutLire(conv.audience, lecteur(m.authorId, comptes.get(m.authorId)!.role, participations)) },
      body: m.withdrawnAt ? null : m.body, nature: m.nature, replyToId: m.replyToId,
      refs, mentions: m.mentions.map((id) => ({ id, email: mails.get(id) ?? "?" })),
      ackRequired: m.ackRequired, urgent: m.urgent, capturedAt: m.capturedAt?.toISOString() ?? null, createdAt: m.createdAt.toISOString(),
      editedAt: m.editedAt?.toISOString() ?? null, withdrawn: !!m.withdrawnAt, versions: versions.find((v) => v.messageId === m.id)?.n ?? 0, mine,
      partage: m.nature === "partage" && m.sharedFrom ? { depuis: "une autre conversation" } : null,
      moi: { openedAt: moiRecu?.openedAt?.toISOString() ?? null, acknowledgedAt: moiRecu?.acknowledgedAt?.toISOString() ?? null },
      // États de remise (COM-R6) : visibles de l'auteur et du gestionnaire seulement.
      remise: mine || gere ? {
        destinataires: attendus.length,
        ouverts: attendus.filter((d) => recus.some((r) => r.userId === d.userId && r.openedAt)).length,
        accuses: attendus.filter((d) => recus.some((r) => r.userId === d.userId && r.acknowledgedAt)).length,
        enAttente: m.ackRequired ? attendus.filter((d) => !recus.some((r) => r.userId === d.userId && r.acknowledgedAt)).map((d) => d.email) : [],
      } : null,
    });
  }
  const evts = await db.select({ e: comEvents, email: users.email }).from(comEvents).innerJoin(users, eq(users.id, comEvents.actorId)).where(eq(comEvents.conversationId, conv.id)).orderBy(asc(comEvents.id));
  const evMails = await emails(evts.flatMap(({ e }) => [e.detail["userId"], e.detail["de"], e.detail["vers"]].filter((x): x is string => typeof x === "string")));
  res.setHeader("Cache-Control", "private, no-store");
  res.json({
    ...(await vueConversation(c, access.code, comptes, 0)),
    messages,
    anterieurs,
    participants: [...participations.entries()].map(([id, p]) => ({
      id, email: mails.get(id) ?? "?", addedAt: p.addedAt.toISOString(), historyFrom: p.historyFrom?.toISOString() ?? null, removedAt: p.removedAt?.toISOString() ?? null,
      aAcces: !!comptes.get(id) && comptes.get(id)!.role !== "support",
    })),
    destinatairesListe: dest.map((d) => d.email),
    journal: evts.map(({ e, email }) => ({
      id: e.id, action: e.action, acteur: email, at: e.at.toISOString(),
      detail: { ...e.detail, ...(typeof e.detail["userId"] === "string" ? { email: evMails.get(e.detail["userId"]) } : {}), ...(typeof e.detail["de"] === "string" ? { deEmail: evMails.get(e.detail["de"]) } : {}), ...(typeof e.detail["vers"] === "string" ? { versEmail: evMails.get(e.detail["vers"]) } : {}) },
    })),
  });
}));

comRouter.post("/conversations/:conversationId/lu", endpoint(async (req, res) => {
  const userId = req.user!.id;
  const { conv, moi } = await chargerConversation(pid(req), param(req, "conversationId"), userId);
  const now = new Date();
  const debut = debutHistorique(conv.audience, moi);
  await db.transaction(async (tx) => {
    await tx.insert(comReads).values({ conversationId: conv.id, userId, lastReadAt: now }).onConflictDoUpdate({ target: [comReads.conversationId, comReads.userId], set: { lastReadAt: now } });
    // Ouverture enregistrée pour les seuls messages affichés (la même fenêtre que la lecture du fil), jamais au-delà.
    const fenetre = await tx.select({ id: comMessages.id, authorId: comMessages.authorId }).from(comMessages)
      .where(and(eq(comMessages.conversationId, conv.id), ...(debut ? [gt(comMessages.createdAt, new Date(debut.getTime() - 1))] : [])))
      .orderBy(desc(comMessages.createdAt), desc(comMessages.id)).limit(FENETRE_MESSAGES);
    const autres = fenetre.filter((m) => m.authorId !== userId);
    for (const m of autres) await tx.insert(comReceipts).values({ messageId: m.id, userId, openedAt: now }).onConflictDoUpdate({ target: [comReceipts.messageId, comReceipts.userId], set: { openedAt: sql`coalesce(${comReceipts.openedAt}, ${now.toISOString()}::timestamptz)` } });
  });
  res.json({ lu: now.toISOString() });
}));

/** Rôle courant et participation de chaque auteur (contrôle d'un changement d'audience). */
async function auteursDe(tx: Tx, c: ConversationChargee): Promise<Lecteur[]> {
  const ids = await tx.selectDistinct({ id: comMessages.authorId }).from(comMessages).where(and(eq(comMessages.conversationId, c.conv.id), isNull(comMessages.withdrawnAt)));
  const comptes = await comptesDuProjet(c.access.id, tx);
  return ids.map(({ id }) => lecteur(id, comptes.get(id)?.role ?? null, c.participations));
}

comRouter.patch("/conversations/:conversationId/audience", endpoint(async (req, res) => {
  const userId = req.user!.id;
  const { audience } = corps(z.object({ audience: z.enum(COM_AUDIENCES) }).strict(), req);
  await db.transaction(async (tx) => {
    const c = await chargerConversation(pid(req), param(req, "conversationId"), userId, tx);
    await tx.select({ id: comConversations.id }).from(comConversations).where(eq(comConversations.id, c.conv.id)).for("update");
    if (!peutGerer(c.conv.audience, c.moi, c.conv.stewardId)) throw new ComError(403, { error: "forbidden", message: "Seuls l'animateur de la conversation et le propriétaire du projet changent son audience." });
    if (audience === "participants") throw new ComError(409, { error: "audience_participants", message: "Pour restreindre à des personnes nommées, créez une conversation de groupe et partagez-y un extrait." });
    const refus = refusChangementAudience(c.conv.mode, c.conv.audience, audience, await auteursDe(tx, c));
    if (refus) throw new ComError(refus.status, refus.body);
    if (audience === "equipe" && !seesTeam(c.access.role)) throw new ComError(403, { error: "forbidden", message: "Seul un membre de l'équipe réserve une conversation à l'équipe." });
    await tx.update(comConversations).set({ audience }).where(eq(comConversations.id, c.conv.id));
    if (c.conv.audience === "participants") await tx.update(comParticipants).set({ removedAt: new Date() }).where(and(eq(comParticipants.conversationId, c.conv.id), isNull(comParticipants.removedAt)));
    await tx.insert(comEvents).values({ conversationId: c.conv.id, actorId: userId, action: "audience", detail: { avant: c.conv.audience, apres: audience } });
  });
  const c2 = await chargerConversation(pid(req), param(req, "conversationId"), userId).catch(() => null);
  res.json(c2 ? await vueConversation(c2, c2.access.code, await comptesDuProjet(c2.access.id), 0) : { id: param(req, "conversationId"), audience, retire: true });
}));

comRouter.post("/conversations/:conversationId/participants", endpoint(async (req, res) => {
  const userId = req.user!.id;
  const input = corps(z.object({ userId: idSchema, historique: z.enum(["tout", "depuis-ajout"]) }).strict(), req);
  await db.transaction(async (tx) => {
    const c = await chargerConversation(pid(req), param(req, "conversationId"), userId, tx);
    if (!peutGerer(c.conv.audience, c.moi, c.conv.stewardId)) throw new ComError(403, { error: "forbidden", message: "Seuls l'animateur et le propriétaire ajoutent des participants." });
    if (c.conv.audience !== "participants") throw new ComError(409, { error: "audience_par_roles", message: "Cette conversation suit les rôles du projet : aucun participant à ajouter." });
    if (c.conv.mode === "direct") throw new ComError(409, { error: "conversation_directe", message: "Une conversation directe réunit deux personnes : créez un groupe." });
    const comptes = await comptesDuProjet(c.access.id, tx);
    if (!comptes.has(input.userId)) throw new ComError(422, { error: "participants_hors_projet", message: "Le participant doit être membre du projet." });
    const p = c.participations.get(input.userId);
    if (p && p.removedAt === null) throw new ComError(409, { error: "deja_participant", message: "Cette personne participe déjà." });
    const now = new Date();
    const historyFrom = input.historique === "tout" ? null : now;
    await tx.insert(comParticipants).values({ conversationId: c.conv.id, userId: input.userId, addedBy: userId, addedAt: now, historyFrom })
      .onConflictDoUpdate({ target: [comParticipants.conversationId, comParticipants.userId], set: { addedBy: userId, addedAt: now, historyFrom, removedAt: null } });
    await tx.insert(comEvents).values({ conversationId: c.conv.id, actorId: userId, action: "participant-ajoute", detail: { userId: input.userId, historique: input.historique } });
  });
  res.status(201).json({ ok: true });
}));

comRouter.delete("/conversations/:conversationId/participants/:userId", endpoint(async (req, res) => {
  const userId = req.user!.id;
  const cible = param(req, "userId");
  await db.transaction(async (tx) => {
    const c = await chargerConversation(pid(req), param(req, "conversationId"), userId, tx);
    if (cible !== userId && !peutGerer(c.conv.audience, c.moi, c.conv.stewardId)) throw new ComError(403, { error: "forbidden", message: "Seuls l'animateur et le propriétaire retirent un participant ; chacun peut se retirer." });
    if (c.conv.mode === "direct") throw new ComError(409, { error: "conversation_directe", message: "Une conversation directe garde ses deux participants." });
    const p = c.participations.get(cible);
    if (!p || p.removedAt) return introuvable();
    await tx.update(comParticipants).set({ removedAt: new Date() }).where(and(eq(comParticipants.conversationId, c.conv.id), eq(comParticipants.userId, cible)));
    await tx.insert(comEvents).values({ conversationId: c.conv.id, actorId: userId, action: "participant-retire", detail: { userId: cible } });
  });
  res.status(204).end();
}));

comRouter.put("/conversations/:conversationId/animateur", endpoint(async (req, res) => {
  const userId = req.user!.id;
  const input = corps(z.object({ userId: idSchema }).strict(), req);
  await db.transaction(async (tx) => {
    const c = await chargerConversation(pid(req), param(req, "conversationId"), userId, tx);
    if (!peutGerer(c.conv.audience, c.moi, c.conv.stewardId)) throw new ComError(403, { error: "forbidden", message: "Seuls l'animateur et le propriétaire transfèrent l'animation." });
    const comptes = await comptesDuProjet(c.access.id, tx);
    const cand = comptes.get(input.userId);
    if (!cand || !peutEcrire(c.conv.audience, lecteur(input.userId, cand.role, c.participations))) throw new ComError(422, { error: "animateur_sans_acces", message: "Le nouvel animateur doit lire et écrire dans la conversation." });
    await tx.update(comConversations).set({ stewardId: input.userId }).where(eq(comConversations.id, c.conv.id));
    await tx.insert(comEvents).values({ conversationId: c.conv.id, actorId: userId, action: "animation", detail: { de: c.conv.stewardId, vers: input.userId } });
  });
  res.json({ ok: true });
}));

// ---------------------------------------------------------------------------------------------------------------------
// Messages

const messageSchema = z.object({
  body: z.string().trim().min(1, "Message vide").max(8000),
  replyToId: idSchema.nullable().optional(),
  refs: z.array(refSchema).max(20).optional(),
  mentions: z.array(idSchema).max(50).optional(),
  ackRequired: z.boolean().optional(),
  urgent: z.boolean().optional(),
  clientRequestId: z.string().min(1).max(128).optional(),
  capturedAt: z.string().datetime({ offset: true }).optional(),
}).strict();

comRouter.post("/conversations/:conversationId/messages", endpoint(async (req, res) => {
  const userId = req.user!.id;
  const input = corps(messageSchema, req);
  const contenu = { body: input.body, replyToId: input.replyToId ?? null, refs: input.refs ?? [], mentions: [...new Set(input.mentions ?? [])].sort(), ackRequired: !!input.ackRequired, urgent: !!input.urgent };
  const hash = empreinteEnvoi({ conversationId: param(req, "conversationId"), ...contenu });
  const r = await db.transaction(async (tx) => {
    if (input.clientRequestId) {
      const [prev] = await tx.select({ id: comMessages.id, hash: comMessages.payloadHash, conversationId: comMessages.conversationId }).from(comMessages).where(and(eq(comMessages.authorId, userId), eq(comMessages.clientRequestId, input.clientRequestId))).limit(1);
      if (prev) {
        // Rejeu (file hors ligne) : l'accès est relu avant de confirmer — un compte révoqué n'apprend rien de plus.
        await chargerConversation(pid(req), prev.conversationId, userId, tx);
        if (prev.hash !== hash) throw new ComError(409, { error: "request_conflict", message: "Cet identifiant de requête est déjà utilisé pour un autre contenu." });
        return { id: prev.id, replayed: true, sansAcces: [] as string[] };
      }
    }
    const c = await chargerConversation(pid(req), param(req, "conversationId"), userId, tx);
    if (!peutEcrire(c.conv.audience, c.moi)) throw new ComError(403, { error: "forbidden", message: "Lecture seule : vous ne pouvez pas écrire dans cette conversation." });
    if (contenu.replyToId) {
      const [parent] = await tx.select({ id: comMessages.id }).from(comMessages).where(and(eq(comMessages.id, contenu.replyToId), eq(comMessages.conversationId, c.conv.id))).limit(1);
      if (!parent) throw new ComError(422, { error: "reponse_invalide", message: "Le message auquel vous répondez n'est pas dans cette conversation." });
    }
    await resoudreRefs(c.access.id, contenu.refs, userId, c.access.role, true, tx);
    const comptes = await comptesDuProjet(c.access.id, tx);
    const lecteurs = new Map([...comptes.entries()].map(([id, cpt]) => [id, lecteur(id, cpt.role, c.participations)]));
    const tri = trierMentions(contenu.mentions, lecteurs, c.conv.audience);
    if (tri.horsProjet.length) throw new ComError(422, { error: "mention_hors_projet", message: "Une mention ne peut viser qu'un membre du projet : elle n'ouvre aucun accès.", mentions: tri.horsProjet });
    const id = newId("com_message");
    const now = new Date();
    await tx.insert(comMessages).values({
      id, conversationId: c.conv.id, authorId: userId, body: contenu.body, nature: "message", replyToId: contenu.replyToId, refs: contenu.refs, mentions: contenu.mentions,
      ackRequired: contenu.ackRequired, urgent: contenu.urgent, capturedAt: input.capturedAt ? new Date(input.capturedAt) : null, clientRequestId: input.clientRequestId ?? null, payloadHash: hash, createdAt: now,
    });
    await tx.update(comConversations).set({ lastMessageAt: now }).where(eq(comConversations.id, c.conv.id));
    await tx.insert(comReads).values({ conversationId: c.conv.id, userId, lastReadAt: now }).onConflictDoUpdate({ target: [comReads.conversationId, comReads.userId], set: { lastReadAt: now } });
    return { id, replayed: false, sansAcces: tri.sansAcces };
  });
  const mails = await emails(r.sansAcces);
  res.setHeader("Idempotent-Replayed", String(r.replayed));
  res.status(r.replayed ? 200 : 201).json({ id: r.id, replayed: r.replayed, mentionsSansAcces: r.sansAcces.map((id) => mails.get(id) ?? "?") });
}));

/** Message de l'utilisateur dans ce projet, conversation lisible, sinon 404. */
async function messageDe(tx: Tx | typeof db, req: Request, userId: string) {
  const [m] = await tx.select().from(comMessages).where(eq(comMessages.id, param(req, "messageId"))).limit(1);
  if (!m) return introuvable();
  const c = await chargerConversation(pid(req), m.conversationId, userId, tx);
  const debut = debutHistorique(c.conv.audience, c.moi);
  if (debut && m.createdAt < debut) return introuvable();
  return { m, c };
}

comRouter.patch("/messages/:messageId", endpoint(async (req, res) => {
  const userId = req.user!.id;
  const { body } = corps(z.object({ body: z.string().trim().min(1).max(8000) }).strict(), req);
  await db.transaction(async (tx) => {
    const { m, c } = await messageDe(tx, req, userId);
    if (m.authorId !== userId) throw new ComError(403, { error: "forbidden", message: "Seul l'auteur modifie son message." });
    if (m.nature !== "message" || m.withdrawnAt) throw new ComError(409, { error: "message_fige", message: "Un message retiré, de partage ou d'action ne se modifie pas." });
    if (!peutEcrire(c.conv.audience, c.moi)) throw new ComError(403, { error: "forbidden", message: "Lecture seule." });
    if (body === m.body) return;
    await tx.insert(comMessageVersions).values({ messageId: m.id, body: m.body, reason: "modification" });
    await tx.update(comMessages).set({ body, editedAt: new Date() }).where(eq(comMessages.id, m.id));
    await tx.insert(comEvents).values({ conversationId: m.conversationId, actorId: userId, action: "modification-message", detail: { messageId: m.id } });
  });
  res.json({ ok: true });
}));

comRouter.delete("/messages/:messageId", endpoint(async (req, res) => {
  const userId = req.user!.id;
  await db.transaction(async (tx) => {
    const { m } = await messageDe(tx, req, userId);
    if (m.authorId !== userId) throw new ComError(403, { error: "forbidden", message: "Seul l'auteur retire son message." });
    if (m.withdrawnAt) return;
    if (m.nature !== "message") throw new ComError(409, { error: "message_fige", message: "Un message de partage ou d'action ne se retire pas." });
    await tx.insert(comMessageVersions).values({ messageId: m.id, body: m.body, reason: "retrait" });
    await tx.update(comMessages).set({ body: "", withdrawnAt: new Date() }).where(eq(comMessages.id, m.id));
    await tx.insert(comEvents).values({ conversationId: m.conversationId, actorId: userId, action: "retrait-message", detail: { messageId: m.id } });
  });
  res.status(204).end();
}));

comRouter.get("/messages/:messageId/versions", endpoint(async (req, res) => {
  const { m } = await messageDe(db, req, req.user!.id);
  const rows = await db.select().from(comMessageVersions).where(eq(comMessageVersions.messageId, m.id)).orderBy(asc(comMessageVersions.id));
  // Le texte d'un message retiré n'est jamais redonné, ni sa dernière version ni aucune version modifiée avant le
  // retrait : seules la date et la nature de chaque remplacement le sont.
  res.json(rows.map((v) => ({ replacedAt: v.replacedAt.toISOString(), reason: v.reason, body: m.withdrawnAt || v.reason === "retrait" ? null : v.body })));
}));

comRouter.post("/messages/:messageId/accuse", endpoint(async (req, res) => {
  const userId = req.user!.id;
  const { m, c } = await messageDe(db, req, userId);
  if (!m.ackRequired) throw new ComError(409, { error: "accuse_non_demande", message: "Ce message ne demande pas d'accusé de réception." });
  if (m.authorId === userId) throw new ComError(409, { error: "accuse_auteur", message: "L'auteur n'accuse pas réception de son propre message." });
  if (!peutEcrire(c.conv.audience, c.moi)) throw new ComError(403, { error: "forbidden", message: "Lecture seule." });
  const now = new Date();
  await db.insert(comReceipts).values({ messageId: m.id, userId, openedAt: now, acknowledgedAt: now })
    .onConflictDoUpdate({ target: [comReceipts.messageId, comReceipts.userId], set: { acknowledgedAt: sql`coalesce(${comReceipts.acknowledgedAt}, ${now.toISOString()}::timestamptz)`, openedAt: sql`coalesce(${comReceipts.openedAt}, ${now.toISOString()}::timestamptz)` } });
  res.json({ acknowledgedAt: now.toISOString() });
}));

// ---------------------------------------------------------------------------------------------------------------------
// Partage d'extraits (COM-R4, COM-D9)

const partageSchema = z.object({ messageIds: z.array(idSchema).min(1).max(50), cibleId: idSchema, note: z.string().trim().max(2000).optional(), empreinte: z.string().max(64).optional() }).strict();

async function preparerPartage(req: Request, userId: string, input: z.infer<typeof partageSchema>) {
  const source = await chargerConversation(pid(req), param(req, "conversationId"), userId);
  if (input.cibleId === source.conv.id) throw new ComError(422, { error: "cible_identique", message: "Choisissez une autre conversation." });
  const cible = await chargerConversation(pid(req), input.cibleId, userId);
  if (!peutEcrire(cible.conv.audience, cible.moi)) throw new ComError(403, { error: "forbidden", message: "Vous ne pouvez pas écrire dans la conversation cible." });
  const debut = debutHistorique(source.conv.audience, source.moi);
  const rows = await db.select({ m: comMessages, email: users.email }).from(comMessages).innerJoin(users, eq(users.id, comMessages.authorId))
    .where(and(eq(comMessages.conversationId, source.conv.id), inArray(comMessages.id, input.messageIds), isNull(comMessages.withdrawnAt))).orderBy(asc(comMessages.createdAt));
  const lisibles = rows.filter(({ m }) => !debut || m.createdAt >= debut);
  if (lisibles.length !== new Set(input.messageIds).size) throw new ComError(422, { error: "messages_invalides", message: "Chaque extrait doit être un message lisible (non retiré) de cette conversation." });
  const contenu = lisibles.map(({ m, email }) => ({ id: m.id, auteur: email, at: m.createdAt.toISOString(), texte: m.body }));
  const comptes = await comptesDuProjet(cible.access.id);
  const dest = destinataires(cible.conv.audience, comptes, cible.participations).map((d) => d.email);
  const empreinte = empreinteApercu(dest, { contenu, note: input.note ?? "", cible: cible.conv.id });
  return { source, cible, contenu, dest, empreinte };
}

comRouter.post("/conversations/:conversationId/partages/apercu", endpoint(async (req, res) => {
  const userId = req.user!.id;
  const p = await preparerPartage(req, userId, corps(partageSchema, req));
  const mails = await emails([...p.cible.participations.keys()].filter((id) => p.cible.participations.get(id)!.removedAt === null));
  res.json({
    cible: { id: p.cible.conv.id, title: p.cible.conv.title, audienceLabel: libelleAudience(p.cible.conv.audience, { code: p.cible.access.code }, [...mails.values()].sort()) },
    destinataires: p.dest, contenu: p.contenu, empreinte: p.empreinte,
  });
}));

comRouter.post("/conversations/:conversationId/partages", endpoint(async (req, res) => {
  const userId = req.user!.id;
  const input = corps(partageSchema, req);
  const p = await preparerPartage(req, userId, input);
  if (!input.empreinte || input.empreinte !== p.empreinte) throw new ComError(409, { error: "apercu_perime", message: "L'audience ou le contenu ont changé depuis l'aperçu : relisez-le avant de confirmer.", empreinte: p.empreinte });
  const corpsPartage = [input.note?.trim(), ...p.contenu.map((c) => `« ${c.texte} »\n— ${c.auteur}, ${new Date(c.at).toLocaleString("fr-FR", { timeZone: process.env["FADI_TZ"] ?? "Europe/Paris" })}`)].filter(Boolean).join("\n\n");
  const id = newId("com_message");
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.insert(comMessages).values({ id, conversationId: p.cible.conv.id, authorId: userId, body: corpsPartage, nature: "partage", sharedFrom: { conversationId: p.source.conv.id, messageIds: p.contenu.map((c) => c.id) }, createdAt: now });
    await tx.update(comConversations).set({ lastMessageAt: now }).where(eq(comConversations.id, p.cible.conv.id));
    // La source n'est jamais nommée dans la cible ; la cible ne l'est pas dans la source (audiences différentes).
    await tx.insert(comEvents).values({ conversationId: p.cible.conv.id, actorId: userId, action: "partage-recu", detail: { messageId: id, extraits: p.contenu.length } });
    await tx.insert(comEvents).values({ conversationId: p.source.conv.id, actorId: userId, action: "partage-envoye", detail: { extraits: p.contenu.length } });
  });
  res.status(201).json({ id, conversationId: p.cible.conv.id });
}));

// ---------------------------------------------------------------------------------------------------------------------
// Actions liées (COM-R7, COM-D11) : l'enregistrement est créé par son propriétaire ; COM garde le lien seulement.

const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("demande"), question: z.string().trim().min(1).max(4000).optional(), responderId: idSchema, echeance: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(), audience: audienceSchema, empreinte: z.string().max(64).optional() }).strict(),
  z.object({ type: z.literal("observation-studio"), studyId: idSchema, variantId: idSchema, responsableId: idSchema, audience: audienceSchema, body: z.string().trim().min(1).max(4000).optional(), empreinte: z.string().max(64).optional() }).strict(),
]);

async function preparerAction(req: Request, userId: string, input: z.infer<typeof actionSchema>) {
  const { m, c } = await messageDe(db, req, userId);
  if (m.withdrawnAt) throw new ComError(409, { error: "message_retire", message: "Un message retiré ne se transforme pas." });
  if (!peutEcrire(c.conv.audience, c.moi)) throw new ComError(403, { error: "forbidden", message: "Lecture seule." });
  if (input.audience === "equipe" && !seesTeam(c.access.role)) throw new ComError(422, { error: "audience_interdite", message: "Un lecteur crée pour tout le projet." });
  const comptes = await comptesDuProjet(c.access.id);
  const dest = [...comptes.entries()].filter(([, cpt]) => audienceVisible(cpt.role, input.audience)).map(([, cpt]) => cpt.email).sort();
  const texte = input.type === "demande" ? input.question ?? m.body : input.body ?? m.body;
  const cibleParams = input.type === "demande" ? { r: input.responderId, e: input.echeance ?? null } : { s: input.studyId, v: input.variantId, r: input.responsableId };
  const empreinte = empreinteApercu(dest, { type: input.type, texte, audience: input.audience, cibleParams, message: m.id });
  return { m, c, dest, texte, empreinte };
}

comRouter.post("/messages/:messageId/actions/apercu", endpoint(async (req, res) => {
  const input = corps(actionSchema, req);
  const p = await preparerAction(req, req.user!.id, input);
  res.json({ type: input.type, audienceLabel: input.audience === "equipe" ? `Visible par : équipe du projet ${p.c.access.code} (propriétaire et éditeurs)` : `Visible par : tous les membres du projet ${p.c.access.code}, lecteurs compris`, destinataires: p.dest, contenu: p.texte, empreinte: p.empreinte });
}));

comRouter.post("/messages/:messageId/actions", endpoint(async (req, res) => {
  const userId = req.user!.id;
  const input = corps(actionSchema, req);
  const p = await preparerAction(req, userId, input);
  if (!input.empreinte || input.empreinte !== p.empreinte) throw new ComError(409, { error: "apercu_perime", message: "L'audience ou le contenu ont changé depuis l'aperçu : relisez-le avant de confirmer.", empreinte: p.empreinte });
  let targetId: string;
  let scope: Record<string, string> = {};
  let libelle: string;
  if (input.type === "demande") {
    const r = await creerDemande(p.c.access, userId, { question: p.texte, responderId: input.responderId, echeance: input.echeance ?? null, audience: input.audience, refs: [{ type: "message", id: p.m.id }], clientRequestId: `com:${p.m.id}:${p.empreinte.slice(0, 16)}` }, p.m.id);
    targetId = r.id;
    libelle = "a créé une demande de précision à partir de ce message";
  } else {
    const o = await openStudioObservation({ projectId: p.c.access.id, studyId: input.studyId, variantId: input.variantId }, userId, {
      body: p.texte, responsableId: input.responsableId, audience: input.audience, requestId: `com:${p.m.id}:${p.empreinte.slice(0, 16)}`,
    });
    targetId = o.id;
    scope = { studyId: input.studyId, variantId: input.variantId };
    libelle = "a ouvert une observation Studio à partir de ce message";
  }
  const [deja] = await db.select({ id: comLinks.id, messageId: comLinks.messageId }).from(comLinks).where(and(eq(comLinks.targetType, input.type), eq(comLinks.targetId, targetId))).limit(1);
  if (deja) { res.status(200).json({ targetType: input.type, targetId, replayed: true }); return; }
  const id = newId("com_message");
  const now = new Date();
  await db.transaction(async (tx) => {
    const [auteur] = await tx.select({ email: users.email }).from(users).where(eq(users.id, userId));
    await tx.insert(comMessages).values({ id, conversationId: p.c.conv.id, authorId: userId, body: `${auteur?.email ?? ""} ${libelle}.`, nature: "action", replyToId: p.m.id, createdAt: now });
    await tx.insert(comLinks).values({ id: newId("com_link"), messageId: id, projectId: p.c.access.id, targetType: input.type, targetId, targetScope: scope, createdBy: userId });
    await tx.update(comConversations).set({ lastMessageAt: now }).where(eq(comConversations.id, p.c.conv.id));
    await tx.insert(comEvents).values({ conversationId: p.c.conv.id, actorId: userId, action: "action-liee", detail: { type: input.type, messageId: p.m.id } });
  });
  res.status(201).json({ targetType: input.type, targetId, messageId: id, replayed: false });
}));

// ---------------------------------------------------------------------------------------------------------------------
// Continuité (COM-7) : responsabilités ouvertes par personne, y compris celles qui n'ont plus accès.

comRouter.get("/responsabilites", endpoint(async (req, res) => {
  const access = await projectOr404(req, res, "owner");
  if (!access) return;
  const comptes = await comptesDuProjet(access.id);
  const demandes = await db.select().from(collabDemandes).where(and(eq(collabDemandes.projectId, access.id), ne(collabDemandes.statut, "close")));
  const convs = await db.select({ id: comConversations.id, title: comConversations.title, stewardId: comConversations.stewardId, audience: comConversations.audience }).from(comConversations).where(eq(comConversations.projectId, access.id));
  const acks = await db.select({ m: comMessages, title: comConversations.title, audience: comConversations.audience }).from(comMessages).innerJoin(comConversations, eq(comConversations.id, comMessages.conversationId))
    .where(and(eq(comConversations.projectId, access.id), eq(comMessages.ackRequired, true), isNull(comMessages.withdrawnAt)));
  const recus = acks.length ? await db.select().from(comReceipts).where(inArray(comReceipts.messageId, acks.map((a) => a.m.id))) : [];
  const personnes = new Map<string, { demandesARepondre: { id: string; question: string; enRetard: boolean }[]; demandesOuvertes: { id: string; question: string; statut: string }[]; conversationsAnimees: { id: string; title: string }[]; accusesAttendus: { messageId: string; conversation: string }[] }>();
  const de = (id: string) => { if (!personnes.has(id)) personnes.set(id, { demandesARepondre: [], demandesOuvertes: [], conversationsAnimees: [], accusesAttendus: [] }); return personnes.get(id)!; };
  const jour = aujourdHui();
  for (const d of demandes) {
    if (d.statut === "ouverte") de(d.responderId).demandesARepondre.push({ id: d.id, question: extrait(d.question, 80), enRetard: enRetard(d, jour) });
    de(d.requesterId).demandesOuvertes.push({ id: d.id, question: extrait(d.question, 80), statut: d.statut });
  }
  for (const c of convs) de(c.stewardId).conversationsAnimees.push({ id: c.id, title: c.title });
  for (const a of acks) {
    const parts = await participationsDe(a.m.conversationId);
    for (const d of destinataires(a.audience, comptes, parts)) {
      if (d.userId !== a.m.authorId && !recus.some((r) => r.messageId === a.m.id && r.userId === d.userId && r.acknowledgedAt)) de(d.userId).accusesAttendus.push({ messageId: a.m.id, conversation: a.title });
    }
  }
  const mails = await emails([...personnes.keys()]);
  res.setHeader("Cache-Control", "private, no-store");
  res.json([...personnes.entries()].map(([id, r]) => ({ userId: id, email: mails.get(id) ?? "?", aAcces: comptes.has(id), role: comptes.get(id)?.role ?? null, ...r }))
    .filter((p) => p.demandesARepondre.length + p.demandesOuvertes.length + p.conversationsAnimees.length + p.accusesAttendus.length > 0)
    .sort((a, b) => Number(a.aAcces) - Number(b.aAcces) || a.email.localeCompare(b.email)));
}));

// ---------------------------------------------------------------------------------------------------------------------
// Activité du projet (concept « Project activity and personal inbox ») : événements autorisés d'un projet, filtrés par les
// droits de chacun ; chaque entrée nomme sa source et son sens (un commentaire, une tâche terminée et une approbation ont
// des libellés distincts). Le fil sert à naviguer : l'enregistrement d'origine reste la référence.

export type FamilleActivite = "message" | "demande" | "observation" | "tache" | "decision" | "revue" | "diffusion";
export interface EntreeActivite {
  id: string;
  famille: FamilleActivite;
  libelle: string;
  at: string;
  /** Heure de capture (hors ligne) quand elle diffère de la réception par le serveur. */
  capturedAt: string | null;
  auteur: { id: string; email: string };
  titre: string;
  texte: string;
  lien: { conversationId?: string; demandeId?: string; studyId?: string; variantId?: string };
  aTraiter: boolean;
  /** Étape du Parcours concernée (contexte de la conversation ou étape citée) : filtre « lieu », jamais renvoyé. */
  etape?: string | null;
}

const LIBELLE_DEMANDE: Record<string, string> = { ouvrir: "Question posée", repondre: "Réponse", cloturer: "Clôture de la demande", rouvrir: "Réouverture de la demande", reattribuer: "Réattribution de la demande" };
const LIBELLE_OBSERVATION: Record<string, string> = { ouvrir: "Observation ouverte", corriger: "Observation déclarée corrigée", recontroler: "Observation recontrôlée", cloturer: "Observation clôturée", rouvrir: "Observation rouverte", reattribuer: "Observation réattribuée" };
const LIBELLE_TACHE: Record<string, string> = { creer: "Tâche confiée", terminer: "Tâche terminée", annuler: "Tâche annulée", rouvrir: "Tâche rouverte", reattribuer: "Tâche réattribuée" };
const LIBELLE_PUBLICATION: Record<string, string> = { creer: "Dossier préparé", soumettre: "Soumis à approbation", approuver: "Approbation enregistrée", refuser: "Refus enregistré", diffuser: "Diffusion", retirer: "Retrait de la diffusion", actualiser: "Dossier actualisé", remplacer: "Dossier remplacé" };

export async function activiteDuProjet(access: AccessibleProject, userId: string): Promise<EntreeActivite[]> {
  const out: EntreeActivite[] = [];
  const role = access.role;
  const studioVisible = seesTeam(role) ? undefined : sql`coalesce(${studioComments.audience}, 'projet') = 'projet'`;
  // Messages des conversations lisibles (depuis l'historique reçu).
  const convs = await db.select().from(comConversations).where(eq(comConversations.projectId, access.id));
  for (const conv of convs) {
    const parts = await participationsDe(conv.id);
    const moi = lecteur(userId, role, parts);
    if (!peutLire(conv.audience, moi)) continue;
    const debut = debutHistorique(conv.audience, moi);
    const msgs = await db.select({ m: comMessages, email: users.email }).from(comMessages).innerJoin(users, eq(users.id, comMessages.authorId))
      .where(and(eq(comMessages.conversationId, conv.id), isNull(comMessages.withdrawnAt), ...(debut ? [gt(comMessages.createdAt, new Date(debut.getTime() - 1))] : []))).orderBy(desc(comMessages.createdAt)).limit(200);
    const recus = msgs.length ? await db.select().from(comReceipts).where(and(inArray(comReceipts.messageId, msgs.map((x) => x.m.id)), eq(comReceipts.userId, userId))) : [];
    for (const { m, email } of msgs) {
      const accuseAttendu = m.ackRequired && m.authorId !== userId && role !== "support" && !recus.some((r) => r.messageId === m.id && r.acknowledgedAt);
      out.push({
        id: `message:${m.id}`, famille: "message", libelle: m.nature === "partage" ? "Extrait partagé" : m.nature === "action" ? "Action liée" : m.ackRequired ? "Message — accusé de réception demandé" : "Message",
        at: m.createdAt.toISOString(), capturedAt: m.capturedAt && Math.abs(m.capturedAt.getTime() - m.createdAt.getTime()) > 60_000 ? m.capturedAt.toISOString() : null,
        auteur: { id: m.authorId, email }, titre: conv.title, texte: extrait(m.body, 160),
        lien: { conversationId: conv.id }, aTraiter: accuseAttendu,
        etape: conv.contextType === "etape" ? conv.contextRef : m.refs.find((r) => r.type === "etape")?.id ?? null,
      });
    }
  }
  // Demandes de précision (audience E1).
  const demandes = await db.select({ e: collabDemandeEvents, d: collabDemandes, email: users.email }).from(collabDemandeEvents)
    .innerJoin(collabDemandes, eq(collabDemandes.id, collabDemandeEvents.demandeId)).innerJoin(users, eq(users.id, collabDemandeEvents.actorId))
    .where(and(eq(collabDemandes.projectId, access.id), ...(seesTeam(role) ? [] : [eq(collabDemandes.audience, "projet")]))).orderBy(desc(collabDemandeEvents.at)).limit(300);
  for (const { e, d, email } of demandes) {
    out.push({
      id: `demande:${e.id}`, famille: "demande", libelle: LIBELLE_DEMANDE[e.action] ?? e.action, at: e.at.toISOString(), capturedAt: null, auteur: { id: e.actorId, email },
      titre: extrait(d.question, 80), texte: e.body ? extrait(e.body, 160) : "", lien: { demandeId: d.id },
      aTraiter: e.action === "ouvrir" && d.statut === "ouverte" && d.responderId === userId,
    });
  }
  // Observations, tâches et décisions Studio (audience du fil d'origine).
  const obs = await db.select({ e: studioObservationEvents, body: studioComments.body, email: users.email, variantId: studioVariants.id, studyId: studioStudies.id, variant: studioVariants.name })
    .from(studioObservationEvents).innerJoin(studioObservations, eq(studioObservations.commentId, studioObservationEvents.observationId))
    .innerJoin(studioComments, eq(studioComments.id, studioObservations.commentId)).innerJoin(studioVariants, eq(studioVariants.id, studioObservations.variantId))
    .innerJoin(studioStudies, eq(studioStudies.id, studioVariants.studyId)).innerJoin(users, eq(users.id, studioObservationEvents.actorId))
    .where(and(eq(studioStudies.projectId, access.id), studioVisible)).orderBy(desc(studioObservationEvents.at)).limit(200);
  for (const o of obs) out.push({ id: `observation:${o.e.id}`, famille: "observation", libelle: LIBELLE_OBSERVATION[o.e.action] ?? o.e.action, at: o.e.at.toISOString(), capturedAt: null, auteur: { id: o.e.actorId, email: o.email }, titre: `Variante « ${o.variant} »`, texte: extrait(o.body, 160), lien: { studyId: o.studyId, variantId: o.variantId }, aTraiter: false });
  const taches = await db.select({ e: studioObservationTaskEvents, libelle: studioObservationTasks.libelle, assignee: studioObservationTasks.assigneeId, statut: studioObservationTasks.statut, email: users.email, variantId: studioVariants.id, studyId: studioStudies.id, variant: studioVariants.name })
    .from(studioObservationTaskEvents).innerJoin(studioObservationTasks, eq(studioObservationTasks.id, studioObservationTaskEvents.taskId))
    .innerJoin(studioObservations, eq(studioObservations.commentId, studioObservationTasks.observationId)).innerJoin(studioComments, eq(studioComments.id, studioObservations.commentId))
    .innerJoin(studioVariants, eq(studioVariants.id, studioObservations.variantId)).innerJoin(studioStudies, eq(studioStudies.id, studioVariants.studyId)).innerJoin(users, eq(users.id, studioObservationTaskEvents.actorId))
    .where(and(eq(studioStudies.projectId, access.id), studioVisible)).orderBy(desc(studioObservationTaskEvents.at)).limit(200);
  for (const t of taches) out.push({ id: `tache:${t.e.id}`, famille: "tache", libelle: LIBELLE_TACHE[t.e.action] ?? t.e.action, at: t.e.at.toISOString(), capturedAt: null, auteur: { id: t.e.actorId, email: t.email }, titre: `Variante « ${t.variant} »`, texte: t.libelle, lien: { studyId: t.studyId, variantId: t.variantId }, aTraiter: t.e.action === "creer" && t.assignee === userId && t.statut === "a-faire" });
  const decisions = await db.select({ e: studioObservationDecisions, body: studioComments.body, email: users.email, variantId: studioVariants.id, studyId: studioStudies.id, variant: studioVariants.name })
    .from(studioObservationDecisions).innerJoin(studioObservations, eq(studioObservations.commentId, studioObservationDecisions.observationId))
    .innerJoin(studioComments, eq(studioComments.id, studioObservations.commentId)).innerJoin(studioVariants, eq(studioVariants.id, studioObservations.variantId))
    .innerJoin(studioStudies, eq(studioStudies.id, studioVariants.studyId)).innerJoin(users, eq(users.id, studioObservationDecisions.actorId))
    .where(and(eq(studioStudies.projectId, access.id), studioVisible)).orderBy(desc(studioObservationDecisions.at)).limit(200);
  for (const d of decisions) out.push({ id: `decision:${d.e.id}`, famille: "decision", libelle: d.e.nature === "decision" ? "Décision consignée" : "Proposition", at: d.e.at.toISOString(), capturedAt: null, auteur: { id: d.e.actorId, email: d.email }, titre: `Variante « ${d.variant} »`, texte: extrait(d.body, 160), lien: { studyId: d.studyId, variantId: d.variantId }, aTraiter: false });
  // Revues et diffusions Studio : l'état formel reste celui de Studio, COM l'affiche seulement.
  const pubs = await db.select({ e: studioPublicationEvents, p: studioPublications, email: users.email }).from(studioPublicationEvents)
    .innerJoin(studioPublications, eq(studioPublications.id, studioPublicationEvents.publicationId)).innerJoin(users, eq(users.id, studioPublicationEvents.authorId))
    .where(eq(studioPublications.projectId, access.id)).orderBy(desc(studioPublicationEvents.createdAt)).limit(200);
  for (const { e, p, email } of pubs) out.push({
    id: `publication:${e.id}`, famille: e.action === "diffuser" || e.action === "retirer" ? "diffusion" : "revue", libelle: LIBELLE_PUBLICATION[e.action] ?? e.action,
    at: e.createdAt.toISOString(), capturedAt: null, auteur: { id: e.authorId, email }, titre: p.title, texte: e.comment ? extrait(e.comment, 160) : "",
    lien: { studyId: p.studyId, variantId: p.variantId }, aTraiter: false,
  });
  return out.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}

const FILTRES_ACTIVITE = ["tout", "a-traiter", "questions-ouvertes", "messages", "demandes", "observations", "revues", "decisions"] as const;

comRouter.get("/activite", endpoint(async (req, res) => {
  const access = await projectOr404(req, res, "read");
  if (!access) return;
  const q = req.query as Record<string, unknown>;
  const filtre = (FILTRES_ACTIVITE as readonly string[]).includes(String(q["filtre"] ?? "tout")) ? String(q["filtre"] ?? "tout") : null;
  if (!filtre) throw new ComError(400, { error: "invalid_input", message: `Filtre inconnu : ${FILTRES_ACTIVITE.join(", ")}.` });
  const depuis = typeof q["depuis"] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(q["depuis"]) ? q["depuis"] : null;
  const auteur = typeof q["auteur"] === "string" && q["auteur"] ? q["auteur"] : null;
  const etape = typeof q["etape"] === "string" && q["etape"] ? q["etape"] : null;
  let items = await activiteDuProjet(access, req.user!.id);
  const ouvertes = filtre === "questions-ouvertes" ? new Set((await db.select({ id: collabDemandes.id }).from(collabDemandes).where(and(eq(collabDemandes.projectId, access.id), eq(collabDemandes.statut, "ouverte")))).map((r) => r.id)) : null;
  items = items.filter((i) => {
    if (filtre === "a-traiter" && !i.aTraiter) return false;
    if (filtre === "questions-ouvertes" && !(i.famille === "demande" && i.lien.demandeId && ouvertes!.has(i.lien.demandeId) && i.libelle === LIBELLE_DEMANDE["ouvrir"])) return false;
    if (filtre === "messages" && i.famille !== "message") return false;
    if (filtre === "demandes" && i.famille !== "demande") return false;
    if (filtre === "observations" && !(i.famille === "observation" || i.famille === "tache")) return false;
    if (filtre === "revues" && !(i.famille === "revue" || i.famille === "diffusion")) return false;
    if (filtre === "decisions" && !(i.famille === "decision" || i.libelle === LIBELLE_PUBLICATION["approuver"])) return false;
    if (auteur && i.auteur.id !== auteur) return false;
    if (depuis && i.at.slice(0, 10) < depuis) return false;
    if (etape && i.etape !== etape) return false;
    return true;
  });
  const comptes = await comptesDuProjet(access.id);
  res.setHeader("Cache-Control", "private, no-store");
  res.json({ items: items.slice(0, 300).map(({ etape: _etape, ...i }) => i), auteurs: [...comptes.entries()].map(([id, c]) => ({ id, email: c.email })).sort((a, b) => a.email.localeCompare(b.email)) });
}));

/** Revues Studio liées (« Requests and reviews ») : dossiers soumis, approuvés, refusés, diffusés ou retirés ; état relu à Studio. */
comRouter.get("/revues", endpoint(async (req, res) => {
  const access = await projectOr404(req, res, "read");
  if (!access) return;
  const rows = await db.select({ p: studioPublications, study: studioStudies.name, variant: studioVariants.name }).from(studioPublications)
    .innerJoin(studioStudies, eq(studioStudies.id, studioPublications.studyId)).innerJoin(studioVariants, eq(studioVariants.id, studioPublications.variantId))
    .where(eq(studioPublications.projectId, access.id)).orderBy(desc(studioPublications.updatedAt)).limit(200);
  const mails = await emails(rows.flatMap(({ p }) => [p.createdBy, p.approvedBy, p.diffusedBy].filter((x): x is string => !!x)));
  res.setHeader("Cache-Control", "private, no-store");
  res.json(rows.map(({ p, study, variant }) => ({
    id: p.id, title: p.title, statut: p.status, studyId: p.studyId, variantId: p.variantId, etude: study, variante: variant, revisionId: p.revisionId,
    preparePar: mails.get(p.createdBy) ?? "?", approuvePar: p.approvedBy ? mails.get(p.approvedBy) ?? "?" : null, approuveLe: p.approvedAt?.toISOString() ?? null,
    diffusePar: p.diffusedBy ? mails.get(p.diffusedBy) ?? "?" : null, diffuseLe: p.diffusedAt?.toISOString() ?? null, majLe: p.updatedAt.toISOString(),
  })));
}));

// ---------------------------------------------------------------------------------------------------------------------
// Boîte personnelle (Global > Ma boîte), montée sous `/com` : ce qui demande votre attention dans tous vos projets.

export const comGlobalRouter = Router();
comGlobalRouter.use(requireAuth);

export interface ElementBoite {
  id: string;
  kind: "message" | "mention" | "accuse" | "demande-a-repondre" | "demande-repondue";
  at: string;
  projectId: string;
  projectCode: string;
  conversationId: string | null;
  demandeId: string | null;
  titre: string;
  texte: string;
  urgent: boolean;
  enRetard: boolean;
}

/** Projets accessibles (vue `project_effective_access`, phase 2 de l'Issue #262 ; l'accès support n'a pas de boîte). */
async function mesProjets(userId: string): Promise<AccessibleProject[]> {
  const ids = await db.execute<{ id: string }>(sql`SELECT project_id AS id FROM project_effective_access WHERE user_id = ${userId}`);
  const out: AccessibleProject[] = [];
  for (const r of ids.rows) { const a = await loadProjectAccess(r.id, userId); if (a && a.role !== "support") out.push(a); }
  return out;
}

export async function boiteDe(userId: string): Promise<ElementBoite[]> {
  const items: ElementBoite[] = [];
  const jour = aujourdHui();
  for (const access of await mesProjets(userId)) {
    const convs = await db.select().from(comConversations).where(eq(comConversations.projectId, access.id));
    for (const conv of convs) {
      const parts = await participationsDe(conv.id);
      const moi = lecteur(userId, access.role, parts);
      if (!peutLire(conv.audience, moi)) continue;
      const debut = debutHistorique(conv.audience, moi);
      const [lu] = await db.select({ at: comReads.lastReadAt }).from(comReads).where(and(eq(comReads.conversationId, conv.id), eq(comReads.userId, userId)));
      const borne = [lu?.at, debut].filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0];
      const msgs = await db.select({ m: comMessages, email: users.email }).from(comMessages).innerJoin(users, eq(users.id, comMessages.authorId))
        .where(and(eq(comMessages.conversationId, conv.id), ne(comMessages.authorId, userId), isNull(comMessages.withdrawnAt), ...(debut ? [gt(comMessages.createdAt, new Date(debut.getTime() - 1))] : [])))
        .orderBy(desc(comMessages.createdAt)).limit(200);
      const recus = msgs.length ? await db.select().from(comReceipts).where(and(inArray(comReceipts.messageId, msgs.map((x) => x.m.id)), eq(comReceipts.userId, userId))) : [];
      const nonLus = msgs.filter(({ m }) => !borne || m.createdAt > borne);
      for (const { m, email } of msgs) {
        const base = { at: m.createdAt.toISOString(), projectId: access.id, projectCode: access.code, conversationId: conv.id, demandeId: null, titre: conv.title, urgent: m.urgent, enRetard: false };
        if (m.ackRequired && !recus.some((r) => r.messageId === m.id && r.acknowledgedAt)) items.push({ ...base, id: `accuse:${m.id}`, kind: "accuse", texte: `${email} demande un accusé de réception : « ${extrait(m.body)} »` });
        else if (m.mentions.includes(userId) && nonLus.some((x) => x.m.id === m.id)) items.push({ ...base, id: `mention:${m.id}`, kind: "mention", texte: `${email} vous a mentionné : « ${extrait(m.body)} »` });
      }
      // Messages directs et de groupe non lus : un élément par conversation.
      if (conv.audience === "participants" && nonLus.length) {
        const dernier = nonLus[0]!;
        if (!items.some((i) => i.id === `mention:${dernier.m.id}` || i.id === `accuse:${dernier.m.id}`)) {
          items.push({ id: `message:${conv.id}`, kind: "message", at: dernier.m.createdAt.toISOString(), projectId: access.id, projectCode: access.code, conversationId: conv.id, demandeId: null, titre: conv.title, urgent: nonLus.some((x) => x.m.urgent), enRetard: false, texte: `${nonLus.length} message(s) non lu(s) — dernier de ${dernier.email} : « ${extrait(dernier.m.body)} »` });
        }
      }
    }
    for (const d of await lireDemandes(access.id, userId, access.role)) {
      if (d.statut === "ouverte" && d.responder.id === userId) items.push({ id: `demande:${d.id}`, kind: "demande-a-repondre", at: d.updatedAt, projectId: access.id, projectCode: access.code, conversationId: null, demandeId: d.id, titre: `Demande de ${d.requester.email}`, texte: d.question, urgent: false, enRetard: enRetard(d, jour) });
      if (d.statut === "repondue" && d.requester.id === userId) items.push({ id: `repondue:${d.id}`, kind: "demande-repondue", at: d.updatedAt, projectId: access.id, projectCode: access.code, conversationId: null, demandeId: d.id, titre: `Réponse de ${d.responder.email}`, texte: d.question, urgent: false, enRetard: false });
    }
  }
  return items.sort((a, b) => Number(b.urgent) - Number(a.urgent) || Number(b.enRetard) - Number(a.enRetard) || (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).slice(0, 200);
}

comGlobalRouter.get("/boite", async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  res.json({ items: await boiteDe(req.user!.id) });
});
