/**
 * Auto-contrôle (lot OP-AUTOCONTROLE, OP-6) — lectures en base de la règle pure `auto-controle.ts` : option du compte,
 * révisions des sources du dossier, révisions déjà approuvées de l'étude, dernier soumetteur ; et les autres
 * approbateurs nommés du projet, proposés quand une approbation est refusée. Lecture seule : rien n'est écrit ici.
 * Appelé par la transition Studio `approuver` (route Studio et revue externe : `appliquerTransition`) et par l'aperçu
 * `controle-approbation`, sous la même règle.
 */
import { and, desc, eq, gt, inArray, isNotNull, isNull, ne, or } from "drizzle-orm";
import {
  projectEffectiveAccess, reviewAssignments, reviewPackages, studioPublicationEvents, studioPublications, studioRevisions, users,
} from "../db/schema.js";
import { evaluerAutoControle, perimetreRevisions, type ResultatAutoControle, type RevisionAuteur } from "./auto-controle.js";
import type { Querier } from "./step-rows.js";

type PublicationRow = typeof studioPublications.$inferSelect;

/** Sources du dossier : celles du manifeste figé, sinon (dossier antérieur au lot E.4) la révision de la variante. */
const sourcesDe = (row: Pick<PublicationRow, "manifest" | "variantId" | "revisionId">) =>
  row.manifest?.sources.map((s) => ({ variantId: s.variantId, revisionId: s.revisionId })) ?? [{ variantId: row.variantId, revisionId: row.revisionId }];

/**
 * Option « Auto-contrôle » du compte ; un compte introuvable n'est jamais autorisé (échec fermé). Ligne lue FOR SHARE :
 * un changement simultané par l'administration (FOR UPDATE) se sérialise avec l'approbation.
 */
export async function autoControleAutorise(q: Querier, userId: string): Promise<boolean> {
  const [u] = await q.select({ allowed: users.selfControlAllowed }).from(users).where(eq(users.id, userId)).limit(1).for("share");
  return u?.allowed ?? false;
}

/**
 * Révisions déjà approuvées de l'étude : révision de chaque évènement `approuver` du journal (approbations passées,
 * même actualisées depuis) et sources des manifestes approuvés en vigueur des AUTRES dossiers (variantes coordonnées).
 */
async function revisionsApprouvees(q: Querier, row: Pick<PublicationRow, "id" | "studyId">): Promise<Set<string>> {
  const pubs = await q.select({ id: studioPublications.id, manifest: studioPublications.manifest, manifestHash: studioPublications.manifestHash, approvedManifestHash: studioPublications.approvedManifestHash, approvedRevisionId: studioPublications.approvedRevisionId })
    .from(studioPublications).where(eq(studioPublications.studyId, row.studyId));
  const out = new Set<string>();
  for (const p of pubs) {
    if (p.id === row.id) continue;
    if (p.approvedRevisionId) out.add(p.approvedRevisionId);
    if (p.manifest && p.approvedManifestHash && p.approvedManifestHash === p.manifestHash) for (const s of p.manifest.sources) out.add(s.revisionId);
  }
  if (pubs.length) {
    const events = await q.select({ revisionId: studioPublicationEvents.revisionId }).from(studioPublicationEvents)
      .where(and(inArray(studioPublicationEvents.publicationId, pubs.map((p) => p.id)), eq(studioPublicationEvents.action, "approuver")));
    for (const e of events) out.add(e.revisionId);
  }
  return out;
}

/** Contrôle d'auto-contrôle d'une approbation de `row` par `approverId`, sous la transaction appelante. */
export async function controleApprobation(q: Querier, row: PublicationRow, approverId: string): Promise<ResultatAutoControle> {
  const sources = sourcesDe(row);
  const rows = await q.select({ id: studioRevisions.id, parentRevisionId: studioRevisions.parentRevisionId, authorId: studioRevisions.authorId, source: studioRevisions.source })
    .from(studioRevisions).where(inArray(studioRevisions.variantId, [...new Set(sources.map((s) => s.variantId))]));
  const revisions = new Map<string, RevisionAuteur>(rows.map((r) => [r.id, r]));
  const perimetre = perimetreRevisions(revisions, sources.map((s) => s.revisionId), await revisionsApprouvees(q, row));
  const [soumission] = await q.select({ authorId: studioPublicationEvents.authorId }).from(studioPublicationEvents)
    .where(and(eq(studioPublicationEvents.publicationId, row.id), eq(studioPublicationEvents.action, "soumettre")))
    .orderBy(desc(studioPublicationEvents.createdAt), desc(studioPublicationEvents.id)).limit(1);
  return evaluerAutoControle({ approbateurId: approverId, perimetre, dernierSoumetteurId: soumission?.authorId ?? null, autoControleAutorise: await autoControleAutorise(q, approverId) });
}

export interface ApprobateurPossible {
  /** Nom affiché ; l'adresse n'est donnée qu'à un membre interne, et jamais pour un destinataire de revue externe. */
  name: string | null;
  role: "proprietaire" | "approbateur" | "approbateur-revue";
}

/**
 * Autres approbateurs nommés du dossier : le propriétaire et les Approbateurs de portée projet (accès effectif), puis les
 * destinataires d'une affectation d'approbation ouverte et acceptée sur un paquet de revue de cette publication. Comptes
 * actifs seulement, sans l'approbateur refusé. `externe` (demande venue de l'espace de revue) : aucun e-mail.
 */
export async function autresApprobateurs(q: Querier, projectId: string, publicationId: string, approverId: string, externe: boolean): Promise<ApprobateurPossible[]> {
  const internes = await q.select({ id: users.id, email: users.email, displayName: users.displayName, role: projectEffectiveAccess.role })
    .from(projectEffectiveAccess).innerJoin(users, eq(users.id, projectEffectiveAccess.userId))
    .where(and(
      eq(projectEffectiveAccess.projectId, projectId), ne(projectEffectiveAccess.userId, approverId),
      or(eq(projectEffectiveAccess.role, "proprietaire"), eq(projectEffectiveAccess.canApprove, true)),
      eq(users.status, "active"), isNull(users.deletionRequestedAt),
    ));
  const revue = await q.select({ id: users.id, displayName: users.displayName }).from(reviewAssignments)
    .innerJoin(reviewPackages, eq(reviewPackages.id, reviewAssignments.packageId)).innerJoin(users, eq(users.id, reviewAssignments.userId))
    .where(and(
      eq(reviewPackages.publicationId, publicationId), eq(reviewAssignments.responsibility, "approbation"), isNotNull(reviewAssignments.userId),
      ne(reviewAssignments.userId, approverId), inArray(reviewAssignments.status, ["en-attente", "en-cours"]), isNull(reviewAssignments.revokedAt),
      gt(reviewAssignments.accessExpiresAt, new Date()), eq(users.status, "active"),
    ));
  const vus = new Set<string>();
  const out: ApprobateurPossible[] = [];
  for (const u of internes.sort((a, b) => (a.role === "proprietaire" ? -1 : 0) - (b.role === "proprietaire" ? -1 : 0))) {
    if (vus.has(u.id)) continue;
    vus.add(u.id);
    out.push({ name: u.displayName || (externe ? null : u.email), role: u.role === "proprietaire" ? "proprietaire" : "approbateur" });
  }
  for (const u of revue) {
    if (vus.has(u.id)) continue;
    vus.add(u.id);
    out.push({ name: u.displayName || null, role: "approbateur-revue" });
  }
  return out;
}
