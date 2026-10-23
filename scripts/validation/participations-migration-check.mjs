/**
 * Organisations, participation et revue externe — phase 1 (Issue #262) : contrôle du schéma sur une base réelle jetable
 * (CI `validate`, après `db:migrate` et `users-migration-check.mjs`).
 *
 *   DATABASE_URL=… node scripts/validation/participations-migration-check.mjs
 *
 * 1. reprise de l'existant : propriétaires et membres créés AVANT la phase 1 (déclencheurs désactivés) reçoivent au
 *    rejeu d'init.sql une personne, une participation active datée de leur accès et leur rôle miroir
 *    (lecteur → lecteur, editeur → concepteur) ; un second rejeu ne crée rien ;
 * 2. miroir tenu par déclencheurs : ajout, changement de rôle, retrait (participation terminée et datée), retour
 *    (nouvelle période), transfert de propriété dans l'ordre de la route (participations continues), rôle
 *    d'attribution jamais touché par le miroir, suppressions en cascade sans erreur ;
 * 3. contraintes CHECK et unicité de la participation courante ;
 * 4. D-7 : `fadi_app` écrit les nouvelles tables et déclenche le miroir, sans aucun DDL.
 * Tout se passe dans des transactions annulées (ROLLBACK). Refuse une base qui n'est pas locale : jamais la production.
 */
import { readFileSync } from 'node:fs';
import pg from 'pg';

const url = process.env.DATABASE_URL ?? '';
const host = (() => { try { return new URL(url).hostname; } catch { return ''; } })();
if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(host)) {
  console.error('Refus : DATABASE_URL doit désigner une base locale jetable.');
  process.exit(2);
}
const initSql = readFileSync(new URL('../../apps/api/src/db/init.sql', import.meta.url), 'utf8');
const client = new pg.Client({ connectionString: url });
await client.connect();
let failures = 0;
const ok = (m) => console.log('✓ ' + m);
const ko = (m) => { failures++; console.log('❌ ' + m); };
const check = (cond, m, detail) => (cond ? ok(m) : ko(`${m} ${detail === undefined ? '' : JSON.stringify(detail)}`));
const one = async (q, p = []) => (await client.query(q, p)).rows[0];
const all = async (q, p = []) => (await client.query(q, p)).rows;

async function rejects(label, query) {
  await client.query('SAVEPOINT s');
  try { await client.query(query); ko(`${label} : accepté à tort`); }
  catch { ok(`${label} : refusé`); }
  finally { await client.query('ROLLBACK TO SAVEPOINT s'); }
}

/** Participations d'un compte dans un projet, les terminées d'abord (même `now()` dans une transaction), avec leurs rôles. */
async function parts(project, user) {
  return all(`SELECT pp.id, pp.status, pp.starts_on::text AS starts_on, pp.ends_on::text AS ends_on,
      coalesce(array_agg(ra.role || ':' || ra.origin ORDER BY ra.role) FILTER (WHERE ra.id IS NOT NULL), '{}') AS roles
    FROM project_participations pp JOIN people pe ON pe.id = pp.person_id
    LEFT JOIN project_role_assignments ra ON ra.participation_id = pp.id
    WHERE pp.project_id = $1 AND pe.user_id = $2 GROUP BY pp.id ORDER BY pp.ends_on NULLS LAST, pp.created_at, pp.id`, [project, user]);
}
const users = (...ids) => ids.map((id) => `INSERT INTO users (id, email, password_hash) VALUES ('${id}', '${id}@invalid', 'x');`).join(' ');

try {
  // 1. Reprise de l'existant.
  await client.query('BEGIN');
  await client.query('ALTER TABLE project_members DISABLE TRIGGER project_members_op_mirror');
  await client.query('ALTER TABLE projects DISABLE TRIGGER projects_op_owner_mirror');
  await client.query(users('op_a', 'op_b', 'op_c'));
  await client.query("INSERT INTO projects (id, owner_id, code, name, created_at) VALUES ('op_p1', 'op_a', 'P1', 'Reprise', '2026-01-15T10:00:00Z')");
  await client.query(`INSERT INTO project_members (project_id, user_id, role, invited_by, created_at) VALUES
    ('op_p1', 'op_b', 'lecteur', 'op_a@invalid', '2026-02-01T10:00:00Z'), ('op_p1', 'op_c', 'editeur', 'op_a@invalid', '2026-03-01T10:00:00Z')`);
  check((await one("SELECT count(*)::int AS n FROM project_participations WHERE project_id = 'op_p1'")).n === 0, 'avant reprise : aucune participation (base historique simulée)');
  await client.query('ALTER TABLE project_members ENABLE TRIGGER project_members_op_mirror');
  await client.query('ALTER TABLE projects ENABLE TRIGGER projects_op_owner_mirror');
  await client.query(initSql);
  const a = await parts('op_p1', 'op_a'), b = await parts('op_p1', 'op_b'), c = await parts('op_p1', 'op_c');
  check(a.length === 1 && a[0].status === 'active' && a[0].starts_on === '2026-01-15' && a[0].roles.length === 0,
    'reprise : propriétaire actif depuis la création du projet, sans rôle miroir', a);
  check(b.length === 1 && b[0].starts_on === '2026-02-01' && b[0].roles.join() === 'lecteur:acces', 'reprise : lecteur → lecteur, daté de son accès', b);
  check(c.length === 1 && c[0].starts_on === '2026-03-01' && c[0].roles.join() === 'concepteur:acces', 'reprise : editeur → concepteur, daté de son accès', c);
  const counts = async () => one(`SELECT (SELECT count(*) FROM people)::int AS pe, (SELECT count(*) FROM project_participations)::int AS pp,
    (SELECT count(*) FROM project_role_assignments)::int AS ra`);
  const before = await counts();
  await client.query(initSql);
  const after = await counts();
  check(JSON.stringify(before) === JSON.stringify(after), 'reprise rejouée : aucune ligne créée deux fois', { before, after });
  check((await one("SELECT count(*)::int AS n FROM people WHERE user_id IN ('op_a', 'op_b', 'op_c')")).n === 3, 'une seule personne par compte');
  await client.query('ROLLBACK');

  // 2. Miroir tenu par les déclencheurs.
  await client.query('BEGIN');
  await client.query(users('op_o', 'op_m', 'op_n'));
  await client.query("INSERT INTO projects (id, owner_id, code, name) VALUES ('op_p2', 'op_o', 'P2', 'Miroir')");
  check((await parts('op_p2', 'op_o')).length === 1, 'création du projet : participation du propriétaire');
  await client.query("INSERT INTO project_members (project_id, user_id, role, invited_by) VALUES ('op_p2', 'op_m', 'lecteur', 'x')");
  let m = await parts('op_p2', 'op_m');
  check(m.length === 1 && m[0].status === 'active' && m[0].roles.join() === 'lecteur:acces', 'ajout d\'un membre : participation active, rôle lecteur', m);
  await client.query(`INSERT INTO project_role_assignments (id, participation_id, role, scope_type, scope_id, origin)
    VALUES ('op_ra1', '${m[0].id}', 'relecteur', 'revision', 'rev_3', 'attribution')`);
  await client.query("UPDATE project_members SET role = 'editeur' WHERE project_id = 'op_p2' AND user_id = 'op_m'");
  m = await parts('op_p2', 'op_m');
  check(m.length === 1 && m[0].roles.join() === 'concepteur:acces,relecteur:attribution', 'changement de rôle : miroir concepteur, attribution intacte', m);
  await client.query("DELETE FROM project_members WHERE project_id = 'op_p2' AND user_id = 'op_m'");
  m = await parts('op_p2', 'op_m');
  check(m.length === 1 && m[0].status === 'terminee' && m[0].ends_on !== null && m[0].roles.includes('relecteur:attribution'),
    'retrait : participation terminée et datée, historique conservé', m);
  await client.query("INSERT INTO project_members (project_id, user_id, role, invited_by) VALUES ('op_p2', 'op_m', 'lecteur', 'x')");
  m = await parts('op_p2', 'op_m');
  check(m.length === 2 && m[0].status === 'terminee' && m[1].status === 'active' && m[1].roles.join() === 'lecteur:acces',
    'retour : nouvelle période, anciens rôles d\'attribution non restaurés', m);

  // Transfert de propriété, ordre de la route (members.ts) : ancien propriétaire éditeur, propriété, retrait du membre.
  await client.query("INSERT INTO project_members (project_id, user_id, role, invited_by) VALUES ('op_p2', 'op_n', 'lecteur', 'x')");
  const oBefore = (await parts('op_p2', 'op_o')).map((p) => p.id), nBefore = (await parts('op_p2', 'op_n')).map((p) => p.id);
  await client.query("INSERT INTO project_members (project_id, user_id, role, invited_by) VALUES ('op_p2', 'op_o', 'editeur', 'x')");
  await client.query("UPDATE projects SET owner_id = 'op_n' WHERE id = 'op_p2'");
  await client.query("DELETE FROM project_members WHERE project_id = 'op_p2' AND user_id = 'op_n'");
  const o = await parts('op_p2', 'op_o'), n = await parts('op_p2', 'op_n');
  check(o.map((p) => p.id).join() === oBefore.join() && o[0].status === 'active' && o[0].roles.join() === 'concepteur:acces',
    'transfert : l\'ancien propriétaire garde sa participation, devenu concepteur', o);
  check(n.map((p) => p.id).join() === nBefore.join() && n[0].status === 'active' && n[0].roles.length === 0,
    'transfert : le nouveau propriétaire garde sa participation, sans rôle miroir', n);

  await client.query("INSERT INTO projects (id, owner_id, code, name) VALUES ('op_p2b', 'op_o', 'P2B', 'Second projet')");
  await client.query("INSERT INTO project_members (project_id, user_id, role, invited_by) VALUES ('op_p2b', 'op_m', 'editeur', 'x')");
  const twice = await one(`SELECT count(DISTINCT pe.id)::int AS personnes, count(DISTINCT pp.project_id)::int AS projets,
      array_agg(DISTINCT ra.role ORDER BY ra.role) AS roles
    FROM people pe JOIN project_participations pp ON pp.person_id = pe.id AND pp.status = 'active'
    JOIN project_role_assignments ra ON ra.participation_id = pp.id WHERE pe.user_id = 'op_m'`);
  check(twice.personnes === 1 && twice.projets === 2 && twice.roles.join() === 'concepteur,lecteur',
    'une même personne dans deux projets, avec deux rôles', twice);
  await client.query("DELETE FROM users WHERE id = 'op_m'");
  ok('suppression d\'un compte membre : cascade sans erreur');
  await client.query("DELETE FROM projects WHERE id = 'op_p2'");
  check((await one("SELECT count(*)::int AS n FROM project_participations WHERE project_id = 'op_p2'")).n === 0, 'suppression du projet : participations supprimées en cascade');
  await client.query('ROLLBACK');

  // 3. Contraintes.
  await client.query('BEGIN');
  await client.query(users('op_k'));
  await client.query("INSERT INTO projects (id, owner_id, code, name) VALUES ('op_p3', 'op_k', 'P3', 'Contraintes')");
  await client.query("INSERT INTO organizations (id, name) VALUES ('op_org', 'Bureau d''études')");
  await client.query("INSERT INTO people (id, display_name) VALUES ('op_contact', 'Claire Martin')");
  await client.query("INSERT INTO project_participations (id, project_id, person_id, status) VALUES ('op_pc', 'op_p3', 'op_contact', 'contact')");
  ok('contact sans compte, participation « contact » acceptée');
  await rejects('contact sans nom', "INSERT INTO people (id, display_name) VALUES ('op_x', '  ')");
  await rejects('organisation sans nom', "INSERT INTO organizations (id, name) VALUES ('op_x', '')");
  await rejects('organisation au statut inconnu', "INSERT INTO organizations (id, name, status) VALUES ('op_x', 'X', 'fermee')");
  await rejects('participation sans partie', "INSERT INTO project_participations (id, project_id, status) VALUES ('op_x', 'op_p3', 'contact')");
  await rejects('participation personne ET organisation', "INSERT INTO project_participations (id, project_id, person_id, organization_id, status) VALUES ('op_x', 'op_p3', 'op_contact', 'op_org', 'contact')");
  await rejects('statut inconnu', "INSERT INTO project_participations (id, project_id, organization_id, status) VALUES ('op_x', 'op_p3', 'op_org', 'invite')");
  await rejects('responsabilité inconnue', "INSERT INTO project_participations (id, project_id, organization_id, status, responsibilities) VALUES ('op_x', 'op_p3', 'op_org', 'contact', '{diriger,chef}')");
  await rejects('terminée sans date de fin', "INSERT INTO project_participations (id, project_id, organization_id, status) VALUES ('op_x', 'op_p3', 'op_org', 'terminee')");
  await rejects('date de fin d\'une participation en cours', "INSERT INTO project_participations (id, project_id, organization_id, status, ends_on) VALUES ('op_x', 'op_p3', 'op_org', 'active', '2026-10-01')");
  await rejects('fin avant le début', "INSERT INTO project_participations (id, project_id, organization_id, status, starts_on, ends_on) VALUES ('op_x', 'op_p3', 'op_org', 'terminee', '2026-10-02', '2026-10-01')");
  await rejects('deux participations courantes de la même personne', "INSERT INTO project_participations (id, project_id, person_id, status) VALUES ('op_x', 'op_p3', 'op_contact', 'active')");
  await rejects('rôle inconnu', "INSERT INTO project_role_assignments (id, participation_id, role) VALUES ('op_x', 'op_pc', 'editeur')");
  await rejects('portée inconnue', "INSERT INTO project_role_assignments (id, participation_id, role, scope_type, scope_id) VALUES ('op_x', 'op_pc', 'relecteur', 'phase', 'x')");
  await rejects('portée révision sans identifiant', "INSERT INTO project_role_assignments (id, participation_id, role, scope_type) VALUES ('op_x', 'op_pc', 'relecteur', 'revision')");
  await rejects('portée projet avec identifiant', "INSERT INTO project_role_assignments (id, participation_id, role, scope_type, scope_id) VALUES ('op_x', 'op_pc', 'relecteur', 'projet', 'x')");
  await client.query("INSERT INTO project_role_assignments (id, participation_id, role) VALUES ('op_r1', 'op_pc', 'approbateur')");
  await rejects('même rôle, même portée, deux fois', "INSERT INTO project_role_assignments (id, participation_id, role) VALUES ('op_r2', 'op_pc', 'approbateur')");
  await client.query('ROLLBACK');

  // 4. D-7 : fadi_app écrit les nouvelles tables et déclenche le miroir, sans DDL.
  const roles = (await all("SELECT rolname FROM pg_roles WHERE rolname IN ('fadi_app', 'fadi_owner')")).map((r) => r.rolname);
  if (roles.length < 2) ok('D-7 : rôles fadi_* absents, contrôle des droits non exécuté');
  else {
    await client.query('BEGIN');
    await client.query(users('op_u', 'op_v'));
    await client.query("INSERT INTO projects (id, owner_id, code, name) VALUES ('op_p4', 'op_u', 'P4', 'Droits')");
    await client.query('SET LOCAL ROLE fadi_app');
    try {
      await client.query("INSERT INTO project_members (project_id, user_id, role, invited_by) VALUES ('op_p4', 'op_v', 'editeur', 'x')");
      await client.query("INSERT INTO organizations (id, name) VALUES ('op_org4', 'Client'); INSERT INTO people (id, display_name) VALUES ('op_pe4', 'Contact')");
      await client.query("INSERT INTO project_participations (id, project_id, organization_id, status) VALUES ('op_pp4', 'op_p4', 'op_org4', 'contact')");
      ok('fadi_app : ajout d\'un membre (miroir déclenché) et écriture des nouvelles tables');
    } catch (e) { ko('fadi_app : écriture refusée — ' + e.message); }
    await rejects('fadi_app : ALTER TABLE des participations', 'ALTER TABLE project_participations ADD COLUMN intrus int');
    await rejects('fadi_app : DROP du déclencheur', 'DROP TRIGGER project_members_op_mirror ON project_members');
    await client.query('ROLLBACK');
  }
} catch (e) {
  ko('erreur inattendue : ' + e.message);
  await client.query('ROLLBACK').catch(() => undefined);
} finally {
  await client.end();
}
if (failures) { console.log(`❌ ${failures} contrôle(s) en échec`); process.exit(1); }
console.log('✅ schéma de participation (phase 1) vérifié');
