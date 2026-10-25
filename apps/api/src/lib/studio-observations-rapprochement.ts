/**
 * Rapprochement des observations Studio avec une nouvelle révision (EX-086) — règles pures :
 * `@parcours/atelier-model` (`rapprochement-observations.ts`). Le serveur l'exécute :
 *  - **automatiquement** à chaque contrôle d'exigences enregistré (`POST …/controles`, même transaction) : les
 *    observations non clôturées de la variante sont rapprochées de la révision contrôlée, règle comprise ;
 *  - sur demande (`POST …/observations/rapprochements`, propriétaire ou éditeur), contre une révision citée (tête par
 *    défaut) et le contrôle le plus récent de cette révision s'il en existe un.
 * Chaque résultat est consigné (`studio_observation_reconciliations`, ajout seul) ; le statut d'une observation n'est
 * **jamais** modifié : un objet disparu est marqué `objet-disparu`, et seule une décision explicite (recontrôle,
 * clôture motivée du propriétaire) peut résoudre l'observation. Un même rapprochement (observation, révision, contrôle)
 * n'est consigné qu'une fois.
 */
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { rapprocherObservations, type ResultatControle, type ResultatRapprochement, type StudioDocument } from "@parcours/atelier-model";
import { db } from "../db/client.js";
import { studioComments, studioObservationLinks, studioObservationReconciliations, studioObservations, studioRequirementChecks, studioRevisions, studioVariants, users } from "../db/schema.js";
import type { Tx } from "./atelier-validation.js";
import { newId } from "./ids.js";
import type { Querier } from "./step-rows.js";
import { notFound, studioArchivedRefusal, studioIdentifierSchema, type StudioScope } from "./studio-commands.js";
import { audienceFilter, lockedVariant, scopedVariant } from "./studio-commentaires.js";

export const studioRapprochementSchema = z.object({ revisionId: studioIdentifierSchema.optional() }).strict();

export interface StudioRapprochementView {
  id: string; observationId: string; revisionId: string; checkId: string | null; observationStatus: string;
  suivi: ResultatRapprochement["suivi"]; elements: ResultatRapprochement["elements"]; actor: { id: string; email: string }; createdAt: string;
}

/**
 * Rapproche les observations non clôturées de la variante de `revision` (avec `controle` de cette révision s'il est
 * donné) et consigne chaque résultat nouveau. Rend les résultats calculés (consignés maintenant ou déjà).
 */
export async function rapprocherVariante(tx: Tx, e: { variantId: string; revision: { id: string; document: StudioDocument }; controle: { id: string; result: ResultatControle } | null; actorId: string; at: Date }): Promise<ResultatRapprochement[]> {
  const obs = await tx.select({ id: studioObservations.commentId, statut: studioObservations.statut }).from(studioObservations).where(eq(studioObservations.variantId, e.variantId));
  if (!obs.length) return [];
  const ids = obs.map((o) => o.id);
  const ancrages = await tx.select({ id: studioComments.id, objectIds: studioComments.objectIds }).from(studioComments).where(inArray(studioComments.id, ids));
  const liens = await tx.select({ observationId: studioObservationLinks.observationId, domaine: studioObservationLinks.domaine, ref: studioObservationLinks.ref })
    .from(studioObservationLinks).where(eq(studioObservationLinks.variantId, e.variantId));
  const resultats = rapprocherObservations(
    [...obs].sort((a, b) => a.id.localeCompare(b.id)).map((o) => ({
      id: o.id, statut: o.statut, objectIds: ancrages.find((c) => c.id === o.id)?.objectIds ?? [],
      liens: liens.filter((l) => l.observationId === o.id).map((l) => ({ domaine: l.domaine, ref: l.ref })),
    })),
    e.revision, e.controle,
  );
  if (!resultats.length) return resultats;
  const deja = await tx.select({ observationId: studioObservationReconciliations.observationId, checkId: studioObservationReconciliations.checkId })
    .from(studioObservationReconciliations).where(and(eq(studioObservationReconciliations.variantId, e.variantId), eq(studioObservationReconciliations.revisionId, e.revision.id)));
  for (const r of resultats) {
    if (deja.some((d) => d.observationId === r.observationId && (d.checkId ?? null) === r.controleId)) continue;
    await tx.insert(studioObservationReconciliations).values({
      id: newId("studio_reconciliation"), variantId: e.variantId, observationId: r.observationId, revisionId: r.revisionId, checkId: r.controleId,
      observationStatus: r.statut, suivi: r.suivi, elements: r.elements.map((x) => ({ ...x })), actorId: e.actorId, createdAt: e.at,
    });
  }
  return resultats;
}

async function vues(q: Querier, rows: (typeof studioObservationReconciliations.$inferSelect)[]): Promise<StudioRapprochementView[]> {
  const wanted = [...new Set(rows.map((r) => r.actorId))];
  const mails = wanted.length ? new Map((await q.select({ id: users.id, email: users.email }).from(users).where(inArray(users.id, wanted))).map((u) => [u.id, u.email])) : new Map<string, string>();
  return [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id)).map((r) => ({
    id: r.id, observationId: r.observationId, revisionId: r.revisionId, checkId: r.checkId, observationStatus: r.observationStatus,
    suivi: r.suivi, elements: r.elements as ResultatRapprochement["elements"], actor: { id: r.actorId, email: mails.get(r.actorId) ?? "" }, createdAt: r.createdAt.toISOString(),
  }));
}

/** Rapprochements consignés des observations visibles de la variante (droit `read`, audience du fil respectée). */
export async function listStudioRapprochements(scope: StudioScope, actorId: string): Promise<{ rapprochements: StudioRapprochementView[] }> {
  const variant = await scopedVariant(scope, actorId, "read");
  const visibles = await db.select({ id: studioComments.id }).from(studioComments).where(and(eq(studioComments.variantId, variant.id), audienceFilter(variant.access.role)));
  const ok = new Set(visibles.map((v) => v.id));
  const rows = (await db.select().from(studioObservationReconciliations).where(eq(studioObservationReconciliations.variantId, variant.id))).filter((r) => ok.has(r.observationId));
  return { rapprochements: await vues(db, rows) };
}

/** Rapprochement sur demande (propriétaire ou éditeur) contre la révision citée (tête par défaut). */
export async function rapprocherSurDemande(scope: StudioScope, actorId: string, input: z.infer<typeof studioRapprochementSchema>): Promise<{ revisionId: string; checkId: string | null; resultats: ResultatRapprochement[] }> {
  return db.transaction(async (tx) => {
    const variant = await lockedVariant(tx, scope, actorId, "write");
    if (variant.lecteur.archived) return studioArchivedRefusal();
    const [v] = await tx.select({ head: studioVariants.headRevisionId }).from(studioVariants).where(eq(studioVariants.id, variant.id)).limit(1);
    if (!v) return notFound();
    const revisionId = input.revisionId ?? v.head;
    const [revision] = await tx.select({ id: studioRevisions.id, document: studioRevisions.document }).from(studioRevisions)
      .where(and(eq(studioRevisions.id, revisionId), eq(studioRevisions.variantId, variant.id))).limit(1);
    if (!revision) return notFound();
    const controles = await tx.select().from(studioRequirementChecks).where(and(eq(studioRequirementChecks.variantId, variant.id), eq(studioRequirementChecks.revisionId, revision.id)));
    const dernier = [...controles].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id))[0];
    const resultats = await rapprocherVariante(tx, {
      variantId: variant.id, revision: { id: revision.id, document: revision.document as StudioDocument },
      controle: dernier ? { id: dernier.id, result: dernier.result } : null, actorId, at: new Date(),
    });
    return { revisionId: revision.id, checkId: dernier?.id ?? null, resultats };
  });
}
