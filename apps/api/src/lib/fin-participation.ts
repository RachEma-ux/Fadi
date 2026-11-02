/**
 * Fin de participation d'un membre (écart E6 des règles communes, `docs/workstreams/collaboration-rules/PLAN.md` § 3 ;
 * décision CR-D7 (a)) : un retrait, un départ, une suspension ou une fin de participation libèrent dans la même
 * transaction la réservation d'édition du projet tenue par ce membre et ses verrous fins de l'Atelier (libérations
 * journalisées dans `atelier_lock_events`). Ses observations et tâches Studio encore ouvertes restent à lui : elles sont
 * listées au propriétaire pour une réattribution explicite (`aReattribuer`) — rien n'est réattribué d'office, l'auteur
 * historique n'est jamais réécrit.
 */
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { libelleCleReservation } from "@parcours/atelier-model";
import { atelierLockEvents, atelierLocks } from "../db/schema.js";
import { chargerModele } from "./atelier-modele.js";
import type { Querier, Tx } from "./step-rows.js";

const rows = <T>(r: unknown): T[] => ((r as { rows?: T[] }).rows ?? []);

/**
 * Libère la réservation d'édition et les verrous fins du membre ; renvoie ce qui a été libéré (journal). L'appelant tient
 * le verrou du projet (`lockProject`) : la libération ne s'interbloque pas avec une écriture concurrente du membre.
 */
export async function libererReservations(tx: Tx, projectId: string, userId: string, actorId: string): Promise<{ reservationEdition: boolean; verrous: number }> {
  const edition = await tx.execute(sql`UPDATE projects SET editing_lock = NULL WHERE id = ${projectId} AND editing_lock->>'userId' = ${userId} RETURNING id`);
  const liberes = await tx.delete(atelierLocks).where(and(eq(atelierLocks.projectId, projectId), eq(atelierLocks.authorId, userId)))
    .returning({ cle: atelierLocks.cle, expiresAt: atelierLocks.expiresAt });
  const maintenant = new Date();
  const actifs = liberes.filter((v) => v.expiresAt > maintenant);
  if (actifs.length) {
    const charge = await chargerModele(tx, projectId);
    await tx.insert(atelierLockEvents).values(actifs.map((v) => ({
      id: randomUUID(), projectId, cle: v.cle, libelle: libelleCleReservation(charge?.etat ?? null, v.cle), kind: "liberation" as const, authorId: actorId, expiresAt: null, at: maintenant,
    })));
  }
  return { reservationEdition: rows(edition).length > 0, verrous: actifs.length };
}

/** Observation ou tâche Studio ouverte dont le responsable n'a plus accès au projet : à réattribuer explicitement. */
export interface ResponsabiliteOrpheline {
  nature: "observation" | "tache";
  id: string;
  libelle: string;
  statut: string;
  responsable: { id: string; email: string };
  studyId: string;
  variantId: string;
  observationId: string;
}

/** Responsabilités Studio ouvertes de personnes sans accès au projet (ni propriétaire, ni membre). */
export async function aReattribuer(q: Querier, projectId: string): Promise<ResponsabiliteOrpheline[]> {
  const sansAcces = (col: string) => sql.raw(`${col} <> p.owner_id AND NOT EXISTS (SELECT 1 FROM project_members m WHERE m.project_id = p.id AND m.user_id = ${col})`);
  const r = await q.execute(sql`
    SELECT 'observation' AS nature, o.comment_id AS id, c.body AS libelle, o.responsable_id AS "responsableId", u.email,
           o.statut, s.id AS "studyId", v.id AS "variantId", o.comment_id AS "observationId", o.created_at AS at
      FROM studio_observations o
      JOIN studio_comments c ON c.id = o.comment_id
      JOIN studio_variants v ON v.id = o.variant_id
      JOIN studio_studies s ON s.id = v.study_id
      JOIN projects p ON p.id = s.project_id
      JOIN users u ON u.id = o.responsable_id
     WHERE p.id = ${projectId} AND o.statut <> 'cloturee' AND ${sansAcces("o.responsable_id")}
    UNION ALL
    SELECT 'tache', t.id, t.libelle, t.assignee_id, u.email, t.statut, s.id, v.id, o.comment_id, t.created_at
      FROM studio_observation_tasks t
      JOIN studio_observations o ON o.comment_id = t.observation_id
      JOIN studio_variants v ON v.id = o.variant_id
      JOIN studio_studies s ON s.id = v.study_id
      JOIN projects p ON p.id = s.project_id
      JOIN users u ON u.id = t.assignee_id
     WHERE p.id = ${projectId} AND t.statut = 'a-faire' AND ${sansAcces("t.assignee_id")}
     ORDER BY at, id`);
  return rows<{ nature: "observation" | "tache"; id: string; libelle: string; responsableId: string; email: string; statut: string; studyId: string; variantId: string; observationId: string }>(r)
    .map(({ responsableId, email, ...x }) => ({ ...x, responsable: { id: responsableId, email } }));
}
