/**
 * Recettes sur base JETABLE : partage simulé directement en base (Issue #262, lot OP-PONT). `project_members` n'est plus
 * qu'une vue de compatibilité en lecture : un partage est une participation non terminée portant le rôle de partage
 * (origine `acces`, portée projet : Lecteur ou Concepteur). Mêmes écritures que `grantShare` / `revokeShare`
 * (apps/api/src/lib/project-access-db.ts). Jamais sur une base de travail : les recettes qui l'emploient vérifient
 * déjà que leur base est locale.
 */

/** Pose un partage (lecteur / editeur) au compte `userId` sur le projet ; un partage existant est remplacé. */
export async function partagerEnBase(sql, projectId, userId, role = "lecteur", invitedBy = "recette") {
  await sql.query("INSERT INTO people (id, user_id) VALUES ('per_' || gen_random_uuid(), $1) ON CONFLICT (user_id) WHERE user_id IS NOT NULL DO NOTHING", [userId]);
  const person = (await sql.query("SELECT id FROM people WHERE user_id = $1", [userId])).rows[0].id;
  let part = (await sql.query("SELECT id FROM project_participations WHERE project_id = $1 AND person_id = $2 AND status <> 'terminee'", [projectId, person])).rows[0]?.id;
  if (!part) {
    part = (await sql.query("INSERT INTO project_participations (id, project_id, person_id, status, starts_on, access_granted_by, access_granted_at) VALUES ('ppa_' || gen_random_uuid(), $1, $2, 'active', current_date, $3, now()) RETURNING id",
      [projectId, person, invitedBy])).rows[0].id;
  } else {
    await sql.query("UPDATE project_participations SET status = CASE WHEN status = 'contact' THEN 'active' ELSE status END, access_granted_by = coalesce(access_granted_by, $2), access_granted_at = coalesce(access_granted_at, now()) WHERE id = $1", [part, invitedBy]);
  }
  const business = role === "editeur" ? "concepteur" : "lecteur";
  await sql.query("DELETE FROM project_role_assignments WHERE participation_id = $1 AND origin = 'acces' AND role <> $2", [part, business]);
  await sql.query("INSERT INTO project_role_assignments (id, participation_id, role, scope_type, origin) VALUES ('pra_' || gen_random_uuid(), $1, $2, 'projet', 'acces') ON CONFLICT DO NOTHING", [part, business]);
  return part;
}

/** Retire tous les partages du projet (participations terminées et datées), propriétaire excepté. */
export async function retirerPartagesEnBase(sql, projectId) {
  await sql.query(`UPDATE project_participations pp SET status = 'terminee', ends_on = greatest(current_date, coalesce(pp.starts_on, current_date)), updated_at = now()
    FROM people pe, projects p WHERE pe.id = pp.person_id AND p.id = pp.project_id AND pp.project_id = $1 AND pp.status <> 'terminee' AND pe.user_id <> p.owner_id
      AND EXISTS (SELECT 1 FROM project_role_assignments ra WHERE ra.participation_id = pp.id AND ra.origin = 'acces')`, [projectId]);
}
