/**
 * Adaptateur d'agents de Studio (MCP) — partie serveur (TEST-033, F.3-01 à F.3-03, INV-010 ; lot F, décision P-12).
 * - **Jetons d'agent** : créés par la personne dans Studio (session humaine), liés à son compte et à un projet, montrés
 *   une seule fois (seule l'empreinte SHA-256 est gardée), expirants et révocables. Un jeton n'ouvre que `/mcp/studio` ;
 *   il n'est jamais une session : il ne confirme rien.
 * - **Mêmes commandes, schémas et droits** : une proposition est une enveloppe `studio-commands/1` lue par le même
 *   schéma (`parseStudioEnvelope`), soumise aux mêmes droits (`modify` du compte, revérifiés à chaque appel), validée sur
 *   la tête par le même noyau (`applyStudioCommands`) — sans rien écrire.
 * - **Même confirmation** : seule la personne, dans Studio, confirme ; la confirmation passe par le point d'entrée commun
 *   `submitStudioCommands` (verrous, révision de base, booléens exacts, idempotence par `requestId`), qui écrit la
 *   révision avec la source `agent-mcp`.
 * - **Journal** `studio_agent_events` : chaque appel d'outil (acteur `agent`, jeton) et chaque décision (acteur `humain`).
 */
import { createHash, createPublicKey, randomBytes, verify } from "node:crypto";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import { applyStudioCommands, STUDIO_CONTRACT, studioElementsModifies, StudioValidationError, type StudioEnvelope } from "@parcours/atelier-model";
import {
  STUDIO_EXTENSION_MCP, studioEvaluerExtension, studioOutilsRegistrePourAgents,
  type StudioContexteConfianceExtension, type StudioGestionnairesMcp, type StudioPermissionExtension, type StudioResultatOutilMcp,
} from "@parcours/atelier-model/studio-agents";
import { db } from "../db/client.js";
import { studioAgentEvents, studioAgentProposals, studioAgentTokens, users, type StudioAgentEventAction } from "../db/schema.js";
import { newId } from "./ids.js";
import { loadProjectAccess } from "./owned-project.js";
import {
  assertAccess, listStudioStudies, notFound, parseStudioEnvelope, readStudioContext, StudioRequestError, studioArchivedRefusal, studioPayloadHash, type StudioScope,
} from "./studio-commands.js";
import { submitStudioCommands } from "./studio-commands.js";

export const STUDIO_JETON_PREFIXE = "fadi_mcp_";
export const STUDIO_PROPOSITION_DUREE_MS = 24 * 3_600_000;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export interface ContexteAgent { projectId: string; userId: string; tokenId: string }

async function journal(projectId: string, actorId: string, kind: "agent" | "humain", action: StudioAgentEventAction, x: { tokenId?: string | null; tool?: string | null; proposalId?: string | null; revisionId?: string | null } = {}, q: Pick<typeof db, "insert"> = db): Promise<void> {
  await q.insert(studioAgentEvents).values({ id: newId("studio_agent_event"), projectId, actorId, actorKind: kind, action, tokenId: x.tokenId ?? null, tool: x.tool ?? null, proposalId: x.proposalId ?? null, revisionId: x.revisionId ?? null });
}

// ——— Extensions (EX-031) : l'adaptateur MCP est une extension intégrée, évaluée comme les autres ———

/** Clés de confiance (`STUDIO_EXTENSIONS_CLES` : JSON { cleId: clé publique Ed25519 PEM }) et autorisations. */
export function contexteConfianceExtensions(env: NodeJS.ProcessEnv = process.env): StudioContexteConfianceExtension {
  let cles: Record<string, string> = {};
  try { const v = JSON.parse(env["STUDIO_EXTENSIONS_CLES"] ?? "{}"); if (v && typeof v === "object") cles = v as Record<string, string>; } catch { cles = {}; }
  const autorisees = new Set((env["STUDIO_EXTENSIONS_AUTORISEES"] ?? "").split(",").map((x) => x.trim()).filter(Boolean));
  // L'adaptateur intégré est autorisé sauf désactivation explicite de l'administrateur.
  if (env["STUDIO_MCP_ACTIF"] !== "0") autorisees.add(`${STUDIO_EXTENSION_MCP.id}@${STUDIO_EXTENSION_MCP.version}`);
  return {
    autorisees,
    verifier: (cleId, message, signature) => {
      const pem = cles[cleId];
      if (typeof pem !== "string") return false;
      try { return verify(null, Buffer.from(message), createPublicKey(pem), Buffer.from(signature, "base64")); } catch { return false; }
    },
  };
}
export function permissionsAdaptateurMcp(env: NodeJS.ProcessEnv = process.env): ReadonlySet<StudioPermissionExtension> {
  const e = studioEvaluerExtension(STUDIO_EXTENSION_MCP, contexteConfianceExtensions(env));
  return new Set(e.etat === "autorisee" ? e.permissions : []);
}

// ——— Jetons ———

export const studioJetonSchema = z.object({ nom: z.string().trim().min(1).max(80), joursValidite: z.number().int().min(1).max(90).optional() }).strict();

export async function creerJetonAgent(projectId: string, userId: string, nom: string, jours = 30, maintenant = new Date()) {
  assertAccess(await loadProjectAccess(projectId, userId), userId, "read");
  const jeton = `${STUDIO_JETON_PREFIXE}${randomBytes(32).toString("base64url")}`;
  const id = newId("studio_agent_token");
  const expiresAt = new Date(maintenant.getTime() + jours * 86_400_000);
  await db.insert(studioAgentTokens).values({ id, projectId, userId, name: nom, tokenHash: sha(jeton), createdAt: maintenant, expiresAt });
  await journal(projectId, userId, "humain", "jeton.creer", { tokenId: id });
  // Le jeton n'est rendu qu'ici, une fois.
  return { id, nom, jeton, expireLe: expiresAt.toISOString() };
}
export async function listerJetonsAgent(projectId: string, userId: string) {
  assertAccess(await loadProjectAccess(projectId, userId), userId, "read");
  const rows = await db.select().from(studioAgentTokens).where(and(eq(studioAgentTokens.projectId, projectId), eq(studioAgentTokens.userId, userId))).orderBy(desc(studioAgentTokens.createdAt));
  return { jetons: rows.map((r) => ({ id: r.id, nom: r.name, creeLe: new Date(r.createdAt).toISOString(), expireLe: new Date(r.expiresAt).toISOString(), revoqueLe: r.revokedAt ? new Date(r.revokedAt).toISOString() : null })) };
}
export async function revoquerJetonAgent(projectId: string, userId: string, id: string) {
  assertAccess(await loadProjectAccess(projectId, userId), userId, "read");
  const [r] = await db.select().from(studioAgentTokens).where(and(eq(studioAgentTokens.id, id), eq(studioAgentTokens.projectId, projectId), eq(studioAgentTokens.userId, userId))).limit(1);
  if (!r) return notFound();
  if (!r.revokedAt) {
    await db.update(studioAgentTokens).set({ revokedAt: new Date() }).where(eq(studioAgentTokens.id, id));
    await journal(projectId, userId, "humain", "jeton.revoquer", { tokenId: id });
  }
  return { id, revoque: true };
}

/** Jeton présenté (`Authorization: Bearer …`) → contexte ; null : absent, inconnu, expiré, révoqué ou compte inactif. */
export async function resoudreJetonAgent(entete: string | undefined, maintenant = new Date()): Promise<ContexteAgent | null> {
  const m = /^Bearer\s+(\S+)$/.exec(entete ?? "");
  if (!m || !m[1]!.startsWith(STUDIO_JETON_PREFIXE)) return null;
  const [r] = await db.select().from(studioAgentTokens).where(and(eq(studioAgentTokens.tokenHash, sha(m[1]!)), isNull(studioAgentTokens.revokedAt), gt(studioAgentTokens.expiresAt, maintenant))).limit(1);
  if (!r) return null;
  const [u] = await db.select({ status: users.status }).from(users).where(eq(users.id, r.userId)).limit(1);
  if (!u || u.status !== "active") return null;
  return { projectId: r.projectId, userId: r.userId, tokenId: r.id };
}

// ——— Propositions ———

type Proposition = typeof studioAgentProposals.$inferSelect;
const vueProposition = (p: Proposition) => ({
  id: p.id, studyId: p.studyId, variantId: p.variantId, requestId: p.requestId, baseRevisionId: p.baseRevisionId, statut: p.status,
  apercu: p.preview, commandes: p.envelope.commands, revisionId: p.revisionId, echec: p.failure ?? null,
  creeLe: new Date(p.createdAt).toISOString(), expireLe: new Date(p.expiresAt).toISOString(), decideLe: p.decidedAt ? new Date(p.decidedAt).toISOString() : null,
});
export type VueProposition = ReturnType<typeof vueProposition>;

export async function proposerCommandes(ctx: ContexteAgent, args: Record<string, unknown>, maintenant = new Date()) {
  const scope: StudioScope = { projectId: ctx.projectId, studyId: String(args["studyId"]), variantId: String(args["variantId"]) };
  // Même schéma que la route humaine.
  const envelope: StudioEnvelope = parseStudioEnvelope({ contractVersion: STUDIO_CONTRACT, requestId: args["requestId"], baseRevisionId: args["baseRevisionId"], commands: args["commands"] });
  // Mêmes droits : lecture de la variante, puis écriture (`modify`) du compte titulaire.
  const tete = await readStudioContext(db, scope, ctx.userId);
  assertAccess(await loadProjectAccess(scope.projectId, ctx.userId), ctx.userId, "modify", { studyId: scope.studyId, variantIds: [scope.variantId] });
  if (tete.archived) return studioArchivedRefusal();
  const payloadHash = studioPayloadHash(envelope);
  const [deja] = await db.select().from(studioAgentProposals).where(and(eq(studioAgentProposals.variantId, scope.variantId), eq(studioAgentProposals.userId, ctx.userId), eq(studioAgentProposals.requestId, envelope.requestId))).limit(1);
  if (deja) {
    if (deja.payloadHash !== payloadHash) throw new StudioRequestError(409, { error: "request_conflict", message: "Cet identifiant de requête est déjà utilisé pour un autre contenu." });
    return { etat: deja.status === "en-attente" ? "confirmation-requise" : deja.status, rejouee: true, proposition: vueProposition(deja) };
  }
  if (envelope.baseRevisionId !== tete.variant.headRevisionId) throw new StudioRequestError(409, { error: "stale_revision", headRevisionId: tete.variant.headRevisionId, baseRevisionId: envelope.baseRevisionId });
  // Même noyau : la proposition est validée sur la tête, sans rien écrire.
  let apres;
  try { apres = applyStudioCommands(tete.revision.document, envelope.commands); }
  catch (err) {
    if (err instanceof StudioValidationError) throw new StudioRequestError(400, { error: "invalid_commands", code: err.code, path: err.path, message: err.message });
    throw err;
  }
  const modifies = studioElementsModifies(tete.revision.document, apres);
  const preview = { commandes: envelope.commands.length, outils: [...new Set(envelope.commands.map((c) => c.toolId))], elementsModifies: modifies.slice(0, 100), nombreElementsModifies: modifies.length };
  const id = newId("studio_agent_proposal");
  await db.insert(studioAgentProposals).values({
    id, projectId: scope.projectId, studyId: scope.studyId, variantId: scope.variantId, tokenId: ctx.tokenId, userId: ctx.userId, requestId: envelope.requestId,
    payloadHash, envelope, baseRevisionId: envelope.baseRevisionId, preview, status: "en-attente", createdAt: maintenant, expiresAt: new Date(maintenant.getTime() + STUDIO_PROPOSITION_DUREE_MS),
  });
  await journal(scope.projectId, ctx.userId, "agent", "proposition.creer", { tokenId: ctx.tokenId, tool: "studio_proposer_commandes", proposalId: id });
  const [p] = await db.select().from(studioAgentProposals).where(eq(studioAgentProposals.id, id)).limit(1);
  return {
    etat: "confirmation-requise", rejouee: false, proposition: vueProposition(p!),
    message: "Rien n’est écrit : la personne titulaire du jeton doit confirmer cette proposition dans Studio (panneau « Agents (MCP) »).",
  };
}

async function propositionDe(projectId: string, userId: string, id: string): Promise<Proposition> {
  // Accès au projet revérifié à chaque lecture (un membre retiré ne lit plus ses propositions).
  assertAccess(await loadProjectAccess(projectId, userId), userId, "read");
  const [p] = await db.select().from(studioAgentProposals).where(and(eq(studioAgentProposals.id, id), eq(studioAgentProposals.projectId, projectId), eq(studioAgentProposals.userId, userId))).limit(1);
  // La proposition d'un autre compte n'est pas divulguée.
  return p ?? notFound();
}

export async function listerPropositions(projectId: string, userId: string, maintenant = new Date()) {
  assertAccess(await loadProjectAccess(projectId, userId), userId, "read");
  const rows = await db.select().from(studioAgentProposals).where(and(eq(studioAgentProposals.projectId, projectId), eq(studioAgentProposals.userId, userId))).orderBy(desc(studioAgentProposals.createdAt)).limit(100);
  return { propositions: rows.map((r) => vueProposition(r.status === "en-attente" && new Date(r.expiresAt) <= maintenant ? { ...r, status: "expiree" } : r)) };
}

/**
 * Confirmation par la personne (session humaine) : le point d'entrée commun écrit la révision, source `agent-mcp`. La
 * décision est prise DANS la transaction de la révision : la proposition y est verrouillée (`for update`) et doit être
 * encore en attente ; statut, révision et journal sont engagés avec la révision, tout ou rien. Une confirmation et un refus
 * simultanés sont ainsi sérialisés : le second trouve la proposition close (409) et rien n'est écrit en double.
 */
export async function confirmerProposition(projectId: string, userId: string, id: string, maintenant = new Date()) {
  const p = await propositionDe(projectId, userId, id);
  const scope: StudioScope = { projectId, studyId: p.studyId, variantId: p.variantId };
  if (p.status === "refusee" || p.status === "echec") throw new StudioRequestError(409, { error: "proposition_close", statut: p.status, message: "Cette proposition est close : rien n’est écrit." });
  if (p.status === "en-attente" && new Date(p.expiresAt) <= maintenant) {
    await db.update(studioAgentProposals).set({ status: "expiree", decidedAt: maintenant }).where(and(eq(studioAgentProposals.id, id), eq(studioAgentProposals.status, "en-attente")));
    throw new StudioRequestError(409, { error: "proposition_close", statut: "expiree", message: "Cette proposition a expiré : rien n’est écrit." });
  }
  if (p.status === "expiree") throw new StudioRequestError(409, { error: "proposition_close", statut: "expiree", message: "Cette proposition a expiré : rien n’est écrit." });
  const enAttente = p.status === "en-attente";
  let r;
  try {
    r = await submitStudioCommands(scope, userId, structuredClone(p.envelope), "modify", {
      source: "agent-mcp",
      ...(enAttente ? {
        avantEcriture: async (tx) => {
          const [l] = await tx.select({ status: studioAgentProposals.status }).from(studioAgentProposals).where(eq(studioAgentProposals.id, id)).for("update");
          if (l?.status !== "en-attente") throw new StudioRequestError(409, { error: "proposition_close", statut: l?.status ?? "inconnue", message: "Cette proposition n’est plus en attente : rien n’est écrit." });
        },
        apresEcriture: async (tx, revisionId) => {
          await tx.update(studioAgentProposals).set({ status: "confirmee", revisionId, decidedAt: maintenant }).where(eq(studioAgentProposals.id, id));
          await journal(projectId, userId, "humain", "proposition.confirmer", { tokenId: p.tokenId, proposalId: id, revisionId }, tx);
        },
      } : {}),
    });
  } catch (err) {
    if (err instanceof StudioRequestError && enAttente && (err.status === 409 || err.status === 400) && err.body["error"] !== "proposition_close") {
      // Échec de l'écriture (base périmée, lot refusé) : la proposition passe en échec si elle est TOUJOURS en attente.
      const corps = err.body;
      await db.transaction(async (tx) => {
        const [l] = await tx.select({ status: studioAgentProposals.status }).from(studioAgentProposals).where(eq(studioAgentProposals.id, id)).for("update");
        if (l?.status !== "en-attente") return;
        await tx.update(studioAgentProposals).set({ status: "echec", failure: { status: err.status, ...corps }, decidedAt: maintenant }).where(eq(studioAgentProposals.id, id));
        await journal(projectId, userId, "humain", "proposition.echec", { tokenId: p.tokenId, proposalId: id }, tx);
      });
    }
    throw err;
  }
  return { proposition: vueProposition((await propositionDe(projectId, userId, id))), revisionId: r.revision.id, replayed: r.replayed };
}

/** Refus : décision conditionnelle sous verrou de ligne ; une proposition confirmée entre-temps n'est jamais déclarée refusée. */
export async function refuserProposition(projectId: string, userId: string, id: string, maintenant = new Date()) {
  await propositionDe(projectId, userId, id);
  const statut = await db.transaction(async (tx) => {
    const [l] = await tx.select({ status: studioAgentProposals.status, tokenId: studioAgentProposals.tokenId }).from(studioAgentProposals).where(eq(studioAgentProposals.id, id)).for("update");
    if (l?.status !== "en-attente") return l?.status ?? "inconnue";
    await tx.update(studioAgentProposals).set({ status: "refusee", decidedAt: maintenant }).where(eq(studioAgentProposals.id, id));
    await journal(projectId, userId, "humain", "proposition.refuser", { tokenId: l.tokenId, proposalId: id }, tx);
    return "refusee";
  });
  if (statut !== "refusee") throw new StudioRequestError(409, { error: "proposition_close", statut, message: "Cette proposition n’est plus en attente." });
  return { proposition: vueProposition(await propositionDe(projectId, userId, id)) };
}

/** Journal agent / humain du compte sur le projet (lecture du titulaire). */
export async function journalAgents(projectId: string, userId: string) {
  assertAccess(await loadProjectAccess(projectId, userId), userId, "read");
  const rows = await db.select().from(studioAgentEvents).where(and(eq(studioAgentEvents.projectId, projectId), eq(studioAgentEvents.actorId, userId))).orderBy(desc(studioAgentEvents.createdAt)).limit(200);
  return { evenements: rows.map((r) => ({ id: r.id, acteur: r.actorKind, action: r.action, jetonId: r.tokenId, outil: r.tool, propositionId: r.proposalId, revisionId: r.revisionId, le: new Date(r.createdAt).toISOString() })) };
}

// ——— Gestionnaires MCP ———

const resultat = async (f: () => Promise<unknown>): Promise<StudioResultatOutilMcp> => {
  try { return { contenu: (await f()) as object, erreur: false }; }
  catch (err) { if (err instanceof StudioRequestError) return { contenu: { status: err.status, ...err.body }, erreur: true }; throw err; }
};

export function gestionnairesMcp(ctx: ContexteAgent, env: NodeJS.ProcessEnv = process.env): StudioGestionnairesMcp {
  return {
    permissions: permissionsAdaptateurMcp(env),
    appelerOutil: async (nom, args) => {
      if (nom !== "studio_proposer_commandes") await journal(ctx.projectId, ctx.userId, "agent", "outil.appeler", { tokenId: ctx.tokenId, tool: nom });
      switch (nom) {
        case "studio_lister_etudes": return resultat(() => listStudioStudies(ctx.projectId, ctx.userId));
        case "studio_lire_variante": return resultat(async () => {
          const c = await readStudioContext(db, { projectId: ctx.projectId, studyId: String(args["studyId"]), variantId: String(args["variantId"]) }, ctx.userId, args["revisionId"] === undefined ? undefined : String(args["revisionId"]));
          return { study: c.study, variant: c.variant, revision: c.revision, canWrite: c.canWrite, archived: c.archived };
        });
        case "studio_outils": return resultat(async () => ({ contrat: STUDIO_CONTRACT, outils: studioOutilsRegistrePourAgents() }));
        case "studio_proposer_commandes": return resultat(() => proposerCommandes(ctx, args));
        case "studio_etat_proposition": return resultat(async () => ({ proposition: vueProposition(await propositionDe(ctx.projectId, ctx.userId, String(args["propositionId"]))) }));
        default: return { contenu: { error: "outil_inconnu" }, erreur: true };
      }
    },
  };
}
