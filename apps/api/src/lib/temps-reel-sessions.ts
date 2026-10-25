/**
 * Temps réel — sessions en direct (RTC-1, Issue #283, RT-D3 à RT-D5) : création, lecture et transitions journalisées.
 *
 * Une session n'est ni une révision ni une approbation (RT-R3) : elle épingle une révision Studio existante (portée
 * `studio-revision`) ou une publication figée (portée `paquet-revue`, RTC-4) et n'écrit rien dans le Studio. Son hôte
 * et son présentateur n'en tirent aucun droit (RT-R2) : chaque route relit le droit du projet (`comment`) avant d'agir,
 * et les gestes réservés à l'hôte ne touchent que la session elle-même. Chaque transition est journalisée, en ajout seul
 * (`rt_session_events`).
 */
import { and, desc, eq, inArray } from "drizzle-orm";
import type { StudioDocument } from "@parcours/atelier-model";
import { db } from "../db/client.js";
import { rtSessionEvents, rtSessions, studioPublications, studioRevisions, studioStudies, studioVariants, users, type RtActionSession } from "../db/schema.js";
import { newId } from "./ids.js";
import { isProjectResponsible } from "./project-responsables.js";
import { BORNES_TEMPS_REEL, repriseAutorisee, type SessionPublique } from "./temps-reel-protocole.js";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Querier = Pick<typeof db, "select">;
export type SessionRow = typeof rtSessions.$inferSelect;

export class TempsReelErreur extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
  }
}

/** Le drapeau serveur (RT-D5 § 2) : absent, aucune route ni aucun canal du temps réel. */
export function tempsReelActif(): boolean {
  return process.env["FADI_TEMPS_REEL"] === "1";
}

export function sessionPublique(s: SessionRow): SessionPublique {
  return {
    id: s.id, portee: s.scopeType, titre: s.title, studyId: s.studyId, variantId: s.variantId, revisionId: s.revisionId,
    publicationId: s.publicationId, hoteId: s.hostId, presentateurId: s.presenterId, statut: s.status, expireLe: s.expiresAt.toISOString(),
  };
}

/** Identifiants des objets du document épinglé : les seuls qu'une sélection relayée peut citer (RT-R7). */
export function objetsDuDocument(doc: StudioDocument): Set<string> {
  const ids = new Set<string>();
  for (const liste of [doc.objects, doc.dimensions, doc.solides, doc.annotations, doc.architecture] as (readonly { id: string }[] | undefined)[]) {
    for (const o of liste ?? []) ids.add(o.id);
  }
  return ids;
}

async function journaliser(tx: Pick<typeof db, "insert">, sessionId: string, action: RtActionSession, actorId: string | null, extra: { targetId?: string | null; revisionId?: string | null } = {}): Promise<void> {
  await tx.insert(rtSessionEvents).values({ id: newId("rtevt"), sessionId, action, actorId, targetId: extra.targetId ?? null, revisionId: extra.revisionId ?? null });
}

export interface CreationSession {
  studyId: string;
  variantId: string;
  /** Absent : la tête de la variante au moment de l'ouverture. */
  revisionId?: string | undefined;
  titre?: string | undefined;
  requestId: string;
}

/** Ouvre une session sur une révision Studio du projet ; rejeu idempotent par `requestId` (même auteur, même portée). */
export async function ouvrirSession(projectId: string, actorId: string, input: CreationSession, maintenant = new Date()): Promise<{ session: SessionRow; rejoue: boolean }> {
  return db.transaction(async (tx) => {
    const [deja] = await tx.select().from(rtSessions)
      .where(and(eq(rtSessions.projectId, projectId), eq(rtSessions.createdBy, actorId), eq(rtSessions.requestId, input.requestId))).limit(1);
    if (deja) {
      if (deja.studyId !== input.studyId || deja.variantId !== input.variantId || (input.revisionId !== undefined && deja.revisionId !== input.revisionId)) {
        throw new TempsReelErreur(409, "request_id_reutilise", "Cet identifiant de requête a déjà servi à ouvrir une autre session.");
      }
      return { session: deja, rejoue: true };
    }
    const [etude] = await tx.select({ id: studioStudies.id }).from(studioStudies).where(and(eq(studioStudies.id, input.studyId), eq(studioStudies.projectId, projectId))).limit(1);
    if (!etude) throw new TempsReelErreur(404, "not_found", "Étude introuvable dans ce projet.");
    const [variante] = await tx.select({ id: studioVariants.id, head: studioVariants.headRevisionId, nom: studioVariants.name }).from(studioVariants)
      .where(and(eq(studioVariants.id, input.variantId), eq(studioVariants.studyId, etude.id))).limit(1);
    if (!variante) throw new TempsReelErreur(404, "not_found", "Variante introuvable dans cette étude.");
    const revisionId = input.revisionId ?? variante.head;
    const [revision] = await tx.select({ id: studioRevisions.id }).from(studioRevisions).where(and(eq(studioRevisions.id, revisionId), eq(studioRevisions.variantId, variante.id))).limit(1);
    if (!revision) throw new TempsReelErreur(404, "not_found", "Révision introuvable dans cette variante.");
    const id = newId("rtses");
    const [session] = await tx.insert(rtSessions).values({
      id, projectId, scopeType: "studio-revision", studyId: etude.id, variantId: variante.id, revisionId,
      title: (input.titre?.trim() || `Session — ${variante.nom}`).slice(0, 120), hostId: actorId, presenterId: actorId,
      requestId: input.requestId, createdBy: actorId, expiresAt: new Date(maintenant.getTime() + BORNES_TEMPS_REEL.dureeMaxMs), lastActivityAt: maintenant,
    }).returning();
    await journaliser(tx, id, "ouvrir", actorId, { revisionId });
    return { session: session!, rejoue: false };
  });
}

export async function lireSession(q: Querier, projectId: string, sessionId: string): Promise<SessionRow | null> {
  const [s] = await q.select().from(rtSessions).where(and(eq(rtSessions.id, sessionId), eq(rtSessions.projectId, projectId))).limit(1);
  return s ?? null;
}

/** Lecture par le canal (le projet est lu dans la ligne, puis le droit de la personne y est vérifié). */
export async function lireSessionParId(sessionId: string): Promise<SessionRow | null> {
  const [s] = await db.select().from(rtSessions).where(eq(rtSessions.id, sessionId)).limit(1);
  return s ?? null;
}

/** Session ouverte et non échue, sinon `null` (une session échue est expirée à la lecture suivante par le canal). */
export function sessionOuverte(s: SessionRow | null, maintenant = new Date()): s is SessionRow {
  return !!s && s.status === "ouverte" && s.expiresAt.getTime() > maintenant.getTime();
}

export async function listerSessions(projectId: string, filtre: { variantId?: string | undefined; ouvertes?: boolean }): Promise<SessionRow[]> {
  const conditions = [eq(rtSessions.projectId, projectId)];
  if (filtre.variantId) conditions.push(eq(rtSessions.variantId, filtre.variantId));
  if (filtre.ouvertes !== false) conditions.push(eq(rtSessions.status, "ouverte"));
  return db.select().from(rtSessions).where(and(...conditions)).orderBy(desc(rtSessions.createdAt)).limit(100);
}

export async function journalSession(sessionId: string) {
  return db.select({ action: rtSessionEvents.action, actorId: rtSessionEvents.actorId, targetId: rtSessionEvents.targetId, revisionId: rtSessionEvents.revisionId, createdAt: rtSessionEvents.createdAt })
    .from(rtSessionEvents).where(eq(rtSessionEvents.sessionId, sessionId)).orderBy(rtSessionEvents.createdAt, rtSessionEvents.id);
}

/** Noms affichables des participants (nom choisi, sinon adresse) : uniquement des membres du projet en session. */
export async function nomsDe(ids: readonly string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const rows = await db.select({ id: users.id, nom: users.displayName, email: users.email }).from(users).where(inArray(users.id, [...new Set(ids)]));
  return new Map(rows.map((r) => [r.id, r.nom?.trim() || r.email]));
}

/** Document de la révision épinglée (les révisions sont immuables : le canal le garde en mémoire). */
export async function documentRevision(variantId: string, revisionId: string): Promise<StudioDocument | null> {
  const [r] = await db.select({ document: studioRevisions.document }).from(studioRevisions).where(and(eq(studioRevisions.variantId, variantId), eq(studioRevisions.id, revisionId))).limit(1);
  return r?.document ?? null;
}

async function verrouiller(tx: Tx, projectId: string, sessionId: string, maintenant: Date): Promise<SessionRow> {
  const [s] = await tx.select().from(rtSessions).where(and(eq(rtSessions.id, sessionId), eq(rtSessions.projectId, projectId))).for("update").limit(1);
  if (!s) throw new TempsReelErreur(404, "not_found", "Session introuvable.");
  if (!sessionOuverte(s, maintenant)) throw new TempsReelErreur(409, "session_close", "Cette session est close.");
  return s;
}

const reserveeHote = () => new TempsReelErreur(403, "reserve_hote", "Geste réservé à l’hôte de la session : il ne donne aucun droit sur le projet.");

/** Le présentateur partage sa vue ; l'hôte le désigne (lui-même ou un participant qui a le droit de rejoindre). */
export async function designerPresentateur(projectId: string, sessionId: string, actorId: string, cibleId: string | null, cibleAutorisee: (userId: string) => Promise<boolean>, maintenant = new Date()): Promise<SessionRow> {
  return db.transaction(async (tx) => {
    const s = await verrouiller(tx, projectId, sessionId, maintenant);
    if (s.hostId !== actorId) throw reserveeHote();
    if (cibleId && !(await cibleAutorisee(cibleId))) throw new TempsReelErreur(422, "cible_sans_acces", "Cette personne ne peut pas rejoindre la session.");
    const [maj] = await tx.update(rtSessions).set({ presenterId: cibleId, lastActivityAt: maintenant }).where(eq(rtSessions.id, s.id)).returning();
    await journaliser(tx, s.id, "presentateur", actorId, { targetId: cibleId });
    return maj!;
  });
}

/** Transmission de l'animation par l'hôte. */
export async function transmettreHote(projectId: string, sessionId: string, actorId: string, cibleId: string, cibleAutorisee: (userId: string) => Promise<boolean>, maintenant = new Date()): Promise<SessionRow> {
  return db.transaction(async (tx) => {
    const s = await verrouiller(tx, projectId, sessionId, maintenant);
    if (s.hostId !== actorId) throw reserveeHote();
    if (!(await cibleAutorisee(cibleId))) throw new TempsReelErreur(422, "cible_sans_acces", "Cette personne ne peut pas rejoindre la session.");
    const [maj] = await tx.update(rtSessions).set({ hostId: cibleId, lastActivityAt: maintenant }).where(eq(rtSessions.id, s.id)).returning();
    await journaliser(tx, s.id, "hote", actorId, { targetId: cibleId });
    return maj!;
  });
}

/**
 * Reprise de l'animation (RT-D5 § 5) : hôte absent depuis plus de 2 minutes, par le propriétaire ou un responsable du
 * projet, journalisée. Aucun participant n'est promu automatiquement.
 */
export async function reprendreAnimation(projectId: string, sessionId: string, actorId: string, hoteAbsentDepuisMs: number | null, maintenant = new Date()): Promise<SessionRow> {
  return db.transaction(async (tx) => {
    const s = await verrouiller(tx, projectId, sessionId, maintenant);
    if (s.hostId === actorId) return s;
    if (!(await isProjectResponsible(projectId, actorId, tx))) throw new TempsReelErreur(403, "reserve_responsable", "Reprise réservée au propriétaire et aux responsables du projet.");
    if (!repriseAutorisee(hoteAbsentDepuisMs)) throw new TempsReelErreur(409, "hote_present", "L’hôte est présent : demandez-lui de vous transmettre l’animation.");
    const [maj] = await tx.update(rtSessions).set({ hostId: actorId, presenterId: s.presenterId === s.hostId ? actorId : s.presenterId, lastActivityAt: maintenant }).where(eq(rtSessions.id, s.id)).returning();
    await journaliser(tx, s.id, "reprendre", actorId, { targetId: s.hostId });
    return maj!;
  });
}

/** Changement explicite de la révision affichée (session de travail), par l'hôte ; une revue figée ne change jamais. */
export async function changerRevision(projectId: string, sessionId: string, actorId: string, revisionId: string, maintenant = new Date()): Promise<SessionRow> {
  return db.transaction(async (tx) => {
    const s = await verrouiller(tx, projectId, sessionId, maintenant);
    if (s.hostId !== actorId) throw reserveeHote();
    if (s.scopeType !== "studio-revision") throw new TempsReelErreur(409, "revue_figee", "Une revue reste sur sa révision publiée : ouvrez une nouvelle revue pour une autre révision.");
    const [revision] = await tx.select({ id: studioRevisions.id }).from(studioRevisions).where(and(eq(studioRevisions.id, revisionId), eq(studioRevisions.variantId, s.variantId))).limit(1);
    if (!revision) throw new TempsReelErreur(404, "not_found", "Révision introuvable dans cette variante.");
    const [maj] = await tx.update(rtSessions).set({ revisionId, lastActivityAt: maintenant }).where(eq(rtSessions.id, s.id)).returning();
    await journaliser(tx, s.id, "changer-revision", actorId, { revisionId });
    return maj!;
  });
}

/** Clôture par l'hôte, le propriétaire ou un responsable du projet. */
export async function clore(projectId: string, sessionId: string, actorId: string, maintenant = new Date()): Promise<SessionRow> {
  return db.transaction(async (tx) => {
    const s = await verrouiller(tx, projectId, sessionId, maintenant);
    if (s.hostId !== actorId && !(await isProjectResponsible(projectId, actorId, tx))) throw new TempsReelErreur(403, "reserve_hote", "Clôture réservée à l’hôte, au propriétaire et aux responsables du projet.");
    const [maj] = await tx.update(rtSessions).set({ status: "close", closedAt: maintenant }).where(eq(rtSessions.id, s.id)).returning();
    await journaliser(tx, s.id, "clore", actorId);
    return maj!;
  });
}

/** Expiration (inactivité de 30 minutes ou durée maximale) : sans auteur, journalisée. */
export async function expirer(sessionId: string, maintenant = new Date()): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [s] = await tx.select().from(rtSessions).where(eq(rtSessions.id, sessionId)).for("update").limit(1);
    if (!s || s.status !== "ouverte") return false;
    await tx.update(rtSessions).set({ status: "expiree", closedAt: maintenant }).where(eq(rtSessions.id, s.id));
    await journaliser(tx, s.id, "expirer", null);
    return true;
  });
}

/** Entrée et sortie d'une personne (journal de présence nominative, RT-D5 § 9) et activité de la session. */
export async function journaliserPresence(sessionId: string, userId: string, action: "rejoindre" | "quitter", maintenant = new Date()): Promise<void> {
  await db.transaction(async (tx) => {
    await journaliser(tx, sessionId, action, userId);
    await tx.update(rtSessions).set({ lastActivityAt: maintenant }).where(and(eq(rtSessions.id, sessionId), eq(rtSessions.status, "ouverte")));
  });
}

export async function toucherActivite(sessionIds: readonly string[], maintenant = new Date()): Promise<void> {
  if (!sessionIds.length) return;
  await db.update(rtSessions).set({ lastActivityAt: maintenant }).where(and(inArray(rtSessions.id, [...sessionIds]), eq(rtSessions.status, "ouverte")));
}

/** Sessions ouvertes échues (durée maximale) ou inactives (aucune connexion depuis 30 minutes). */
export async function sessionsAExpirer(sansConnexion: (sessionId: string) => boolean, maintenant = new Date()): Promise<string[]> {
  const ouvertes = await db.select({ id: rtSessions.id, expiresAt: rtSessions.expiresAt, lastActivityAt: rtSessions.lastActivityAt }).from(rtSessions).where(eq(rtSessions.status, "ouverte")).limit(1000);
  return ouvertes.filter((s) => s.expiresAt.getTime() <= maintenant.getTime()
    || (sansConnexion(s.id) && maintenant.getTime() - s.lastActivityAt.getTime() > BORNES_TEMPS_REEL.inactiviteMs)).map((s) => s.id);
}

/** Publication épinglée d'une revue (RTC-4) : utilisée par l'ouverture d'une session `paquet-revue`. */
export async function publicationDuProjet(projectId: string, publicationId: string) {
  const [p] = await db.select().from(studioPublications).where(and(eq(studioPublications.id, publicationId), eq(studioPublications.projectId, projectId))).limit(1);
  return p ?? null;
}
