/**
 * Affectations explicites et fin de participation d'un membre (écarts E5, E6 et E10 des règles communes,
 * `docs/workstreams/collaboration-rules/PLAN.md` § 3 ; décisions CR-D2, CR-D6, CR-D7 et OP-D3 c, OP-D7 a).
 *
 * - **Approbateur / Diffuseur (E5)** : rôles par portée « projet », origine `attribution`, portés par la participation
 *   **active** du membre (`project_role_assignments`, phase 1 d'Organisations). Le propriétaire les donne ou les retire ;
 *   ils ouvrent l'approbation et la diffusion Studio (`baseAutorite`, `studio-publication-statuts.ts`). Un départ termine
 *   la participation (miroir `op_sync_access`) : l'affectation cesse de valoir à la requête suivante ; un retour ouvre une
 *   nouvelle participation, sans affectation (jamais restaurée d'office).
 * - **Gardien du contenu (E10)** : responsabilité d'équipe `garder` déclarée sur la participation, sans aucun droit.
 * - **Fin de participation (E6, CR-D7 a)** : retrait ou départ libèrent dans la même transaction la réservation
 *   d'édition du projet et les verrous fins de l'Atelier du membre ; ses observations et tâches Studio ouvertes sont
 *   listées au propriétaire pour une réattribution explicite (`aReattribuer`) — rien n'est réattribué d'office, l'auteur
 *   historique n'est jamais réécrit.
 */
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { libelleCleReservation } from "@parcours/atelier-model";
import { atelierLockEvents, atelierLocks } from "../db/schema.js";
import { chargerModele } from "./atelier-modele.js";
import type { AffectationPublication, AffectationTenue } from "./studio-publication-statuts.js";
import type { Querier, Tx } from "./step-rows.js";

/** Commandes d'affectation de la ligne du membre : deux affectations (droit) et une responsabilité déclarée (aucun droit). */
export type AffectationMembre = AffectationPublication | "gardien";
export const AFFECTATIONS_MEMBRE: readonly AffectationMembre[] = ["approbateur", "diffuseur", "gardien"];

export interface AffectationsDuMembre { approbateur: boolean; diffuseur: boolean; gardien: boolean }
export const AUCUNE_AFFECTATION: AffectationsDuMembre = Object.freeze({ approbateur: false, diffuseur: false, gardien: false });

const rows = <T>(r: { rows: unknown[] }) => r.rows as T[];

/** Affectations de publication tenues par ce compte sur ce projet (participation active, portée projet). */
export async function affectationsPublication(q: Querier, projectId: string, userId: string): Promise<AffectationTenue[]> {
  const r = await q.execute(sql`
    SELECT pra.id, pra.role FROM project_role_assignments pra
      JOIN project_participations pp ON pp.id = pra.participation_id
      JOIN people pe ON pe.id = pp.person_id
     WHERE pp.project_id = ${projectId} AND pe.user_id = ${userId} AND pp.status = 'active'
       AND pra.origin = 'attribution' AND pra.scope_type = 'projet' AND pra.role IN ('approbateur', 'diffuseur')
     ORDER BY pra.created_at, pra.id`);
  return rows<AffectationTenue>(r);
}

/** Affectations de chaque compte du projet (participations actives), pour l'écran des membres. */
export async function affectationsDuProjet(q: Querier, projectId: string): Promise<Map<string, AffectationsDuMembre>> {
  const r = await q.execute(sql`
    SELECT pe.user_id AS "userId",
           EXISTS (SELECT 1 FROM project_role_assignments a WHERE a.participation_id = pp.id AND a.origin = 'attribution'
                    AND a.scope_type = 'projet' AND a.role = 'approbateur') AS approbateur,
           EXISTS (SELECT 1 FROM project_role_assignments a WHERE a.participation_id = pp.id AND a.origin = 'attribution'
                    AND a.scope_type = 'projet' AND a.role = 'diffuseur') AS diffuseur,
           'garder' = ANY (pp.responsibilities) AS gardien
      FROM project_participations pp JOIN people pe ON pe.id = pp.person_id
     WHERE pp.project_id = ${projectId} AND pp.status = 'active' AND pe.user_id IS NOT NULL`);
  return new Map(rows<AffectationsDuMembre & { userId: string }>(r).map(({ userId, ...a }) => [userId, a]));
}

/**
 * Donne ou retire une affectation au membre (ligne `project_members` déjà verrouillée par l'appelant). Rend l'état
 * avant / après, ou null si le membre n'a pas de participation active (miroir absent : refus, rien n'est écrit).
 */
export async function changerAffectation(tx: Tx, projectId: string, userId: string, affectation: AffectationMembre, valeur: boolean, grantedBy: string): Promise<{ avant: boolean; apres: boolean } | null> {
  const [part] = rows<{ id: string; responsibilities: string[] }>(await tx.execute(sql`
    SELECT pp.id, pp.responsibilities FROM project_participations pp JOIN people pe ON pe.id = pp.person_id
     WHERE pp.project_id = ${projectId} AND pe.user_id = ${userId} AND pp.status = 'active' FOR UPDATE OF pp`));
  if (!part) return null;
  if (affectation === "gardien") {
    const avant = part.responsibilities.includes("garder");
    if (avant !== valeur) {
      await tx.execute(valeur
        ? sql`UPDATE project_participations SET responsibilities = array_append(responsibilities, 'garder'), updated_at = now() WHERE id = ${part.id}`
        : sql`UPDATE project_participations SET responsibilities = array_remove(responsibilities, 'garder'), updated_at = now() WHERE id = ${part.id}`);
    }
    return { avant, apres: valeur };
  }
  const tenues = rows<{ id: string }>(await tx.execute(sql`
    SELECT id FROM project_role_assignments WHERE participation_id = ${part.id} AND origin = 'attribution'
       AND scope_type = 'projet' AND role = ${affectation}`));
  const avant = tenues.length > 0;
  if (valeur && !avant) {
    await tx.execute(sql`INSERT INTO project_role_assignments (id, participation_id, role, scope_type, origin, granted_by)
      VALUES (${`pra_${randomUUID()}`}, ${part.id}, ${affectation}, 'projet', 'attribution', ${grantedBy}) ON CONFLICT DO NOTHING`);
  }
  if (!valeur && avant) {
    await tx.execute(sql`DELETE FROM project_role_assignments WHERE participation_id = ${part.id} AND origin = 'attribution'
       AND scope_type = 'projet' AND role = ${affectation}`);
  }
  return { avant, apres: valeur };
}

/**
 * Fin de participation (E6) : libère la réservation d'édition du projet et les verrous fins de l'Atelier tenus par le
 * compte, dans la transaction du retrait ; chaque verrou libéré est notifié aux autres membres comme une libération
 * ordinaire (D-143), au nom de l'acteur du retrait.
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
  return { reservationEdition: edition.rows.length > 0, verrous: actifs.length };
}

export interface ResponsabiliteOrpheline {
  nature: "observation" | "tache";
  id: string;
  /** Libellé : texte du commentaire d'origine (observation) ou libellé de la tâche. */
  libelle: string;
  /** Compte qui la porte encore, qui n'est plus ni propriétaire ni membre du projet. */
  responsable: { id: string; email: string };
  statut: string;
  studyId: string;
  variantId: string;
  observationId: string;
}

/**
 * Observations Studio ouvertes et tâches à faire dont le responsable n'a plus accès au projet (ni propriétaire, ni
 * membre) : à réattribuer explicitement dans Studio (passage « réattribuer », journalisé). Propriétaire seulement.
 */
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
