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
 * 4. D-7 : `fadi_app` écrit les nouvelles tables et déclenche le miroir, sans aucun DDL ;
 * 5. concurrence : deux accès simultanés d'un même compte créent une seule personne, sans échec (seule section validée,
 *    nettoyée ensuite par suppression du compte de test) ;
 * 6. phase 2 (bascule de l'accès, OP-D3 c) : la vue `project_effective_access`, seule source de la décision d'accès, rend
 *    l'accès de chaque membre repris (lecteur, éditeur, export accordé ou d'archive NULL) sans perte ; aucun droit pour un
 *    contact, une participation suspendue, terminée, sans rôle de projet ou à portée plus étroite ; le pont (miroir) ne
 *    réactive pas une participation suspendue ; colonnes additives `projects.closed_at`, `people.erased_at`,
 *    `project_participations.can_export` ; second rejeu d'init.sql sans effet ; `fadi_app` lit la vue sans DDL.
 * Sections 1 à 4 et 6 dans des transactions annulées (ROLLBACK). Refuse une base qui n'est pas locale : jamais la production.
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
  await rejects('portée étude à identifiant vide', "INSERT INTO project_role_assignments (id, participation_id, role, scope_type, scope_id) VALUES ('op_x', 'op_pc', 'relecteur', 'etude', '  ')");
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

  // 6. Phase 2 : bascule de l'accès sur les participations.
  await client.query('BEGIN');
  await client.query('ALTER TABLE project_members DISABLE TRIGGER project_members_op_mirror');
  await client.query('ALTER TABLE projects DISABLE TRIGGER projects_op_owner_mirror');
  await client.query(users('op6_o', 'op6_l', 'op6_e', 'op6_x', 'op6_n'));
  await client.query("INSERT INTO projects (id, owner_id, code, name) VALUES ('op_p6', 'op6_o', 'P6', 'Bascule')");
  await client.query(`INSERT INTO project_members (project_id, user_id, role, invited_by, can_export) VALUES
    ('op_p6', 'op6_l', 'lecteur', 'x', false), ('op_p6', 'op6_e', 'editeur', 'x', false), ('op_p6', 'op6_x', 'lecteur', 'x', true),
    ('op_p6', 'op6_n', 'lecteur', 'x', NULL)`);
  await client.query('ALTER TABLE project_members ENABLE TRIGGER project_members_op_mirror');
  await client.query('ALTER TABLE projects ENABLE TRIGGER projects_op_owner_mirror');
  await client.query(initSql);
  const acces = async () => Object.fromEntries((await all("SELECT user_id, role, can_export, can_approve, can_publish FROM project_effective_access WHERE project_id = 'op_p6'"))
    .map((r) => [r.user_id, `${r.role}${r.can_export ? '+export' : ''}${r.can_approve ? '+approbation' : ''}${r.can_publish ? '+diffusion' : ''}`]));
  const attendu = { op6_o: 'proprietaire+export+approbation+diffusion', op6_l: 'lecteur', op6_e: 'editeur+export', op6_x: 'lecteur+export', op6_n: 'lecteur+export' };
  check(JSON.stringify(Object.entries(await acces()).sort()) === JSON.stringify(Object.entries(attendu).sort()),
    'reprise : chaque membre garde exactement son accès (export accordé et export d\'archive NULL compris)', await acces());
  const before6 = await one(`SELECT (SELECT count(*) FROM people)::int AS pe, (SELECT count(*) FROM project_participations)::int AS pp,
    (SELECT count(*) FROM project_role_assignments)::int AS ra`);
  await client.query(initSql);
  const after6 = await one(`SELECT (SELECT count(*) FROM people)::int AS pe, (SELECT count(*) FROM project_participations)::int AS pp,
    (SELECT count(*) FROM project_role_assignments)::int AS ra`);
  check(JSON.stringify(before6) === JSON.stringify(after6) && JSON.stringify(await acces()) !== '{}', 'phase 2 rejouée : aucune ligne créée deux fois, vue intacte', { before6, after6 });
  const cols = (await all(`SELECT table_name || '.' || column_name AS c FROM information_schema.columns
    WHERE (table_name, column_name) IN (('projects', 'closed_at'), ('people', 'erased_at'), ('project_participations', 'can_export')) ORDER BY 1`)).map((r) => r.c);
  check(cols.join() === 'people.erased_at,project_participations.can_export,projects.closed_at', 'colonnes additives de la phase 2 présentes', cols);
  const partOf6 = async (u) => (await one(`SELECT pp.id FROM project_participations pp JOIN people pe ON pe.id = pp.person_id
    WHERE pp.project_id = 'op_p6' AND pe.user_id = $1 AND pp.status <> 'terminee'`, [u])).id;
  const pl = await partOf6('op6_l');
  await client.query("UPDATE project_participations SET status = 'suspendue' WHERE id = $1", [pl]);
  check(!('op6_l' in await acces()), 'participation suspendue : aucun accès');
  await client.query("UPDATE project_members SET role = 'editeur' WHERE project_id = 'op_p6' AND user_id = 'op6_l'");
  check((await one('SELECT status FROM project_participations WHERE id = $1', [pl])).status === 'suspendue' && !('op6_l' in await acces()),
    'pont : un changement de partage ne réactive pas une participation suspendue');
  await client.query("UPDATE project_participations SET status = 'active' WHERE id = $1", [pl]);
  check((await acces()).op6_l === 'editeur+export', 'réactivation : l\'accès des rôles portés revient (rôle de partage tenu à jour)', await acces());
  const px = await partOf6('op6_x');
  await client.query("DELETE FROM project_role_assignments WHERE participation_id = $1", [px]);
  check(!('op6_x' in await acces()), 'participation active sans rôle de projet (revue seule) : aucun accès');
  await client.query("INSERT INTO project_role_assignments (id, participation_id, role, scope_type, scope_id) VALUES ('op6_r1', $1, 'approbateur', 'etude', 's1')", [px]);
  check(!('op6_x' in await acces()), 'rôle de portée étude seul : aucun accès au projet');
  await client.query("INSERT INTO project_role_assignments (id, participation_id, role) VALUES ('op6_r2', $1, 'approbateur')", [px]);
  check((await acces()).op6_x === 'lecteur+export+approbation', 'Approbateur de portée projet : lecture, approbation (export accordé conservé)', await acces());
  const pe = await partOf6('op6_e');
  await client.query("UPDATE project_participations SET status = 'terminee', ends_on = current_date WHERE id = $1", [pe]);
  check(!('op6_e' in await acces()), 'participation terminée : aucun accès');
  await client.query("UPDATE project_participations SET starts_on = current_date + 30 WHERE id = $1", [await partOf6('op6_n')]);
  check(!('op6_n' in await acces()), 'participation qui n\'a pas commencé : aucun accès');
  await client.query("INSERT INTO people (id, display_name) VALUES ('op6_c', 'Contact')");
  await client.query("INSERT INTO project_participations (id, project_id, person_id, status) VALUES ('op6_pc', 'op_p6', 'op6_c', 'active')");
  await client.query("INSERT INTO project_role_assignments (id, participation_id, role) VALUES ('op6_r3', 'op6_pc', 'concepteur')");
  check((await one("SELECT count(*)::int AS n FROM project_effective_access WHERE project_id = 'op_p6' AND user_id IS NULL")).n === 0, 'contact sans compte, même actif et doté d\'un rôle : aucune ligne d\'accès');
  if (roles.length >= 2) {
    await client.query('SAVEPOINT droits');
    await client.query('SET LOCAL ROLE fadi_app');
    try {
      await client.query("SELECT count(*) FROM project_effective_access");
      await client.query("UPDATE projects SET closed_at = now() WHERE id = 'op_p6'");
      await client.query("UPDATE people SET erased_at = now(), display_name = 'Contact effacé', work_email = NULL WHERE id = 'op6_c'");
      ok('fadi_app : lecture de la vue, clôture du projet, effacement d\'un contact');
    } catch (e) { ko('fadi_app : phase 2 refusée — ' + e.message); }
    await rejects('fadi_app : remplacement de la vue', 'CREATE OR REPLACE VIEW project_effective_access AS SELECT 1');
    await client.query('ROLLBACK TO SAVEPOINT droits');
  }
  await client.query('ROLLBACK');

  // 7. Phase 3 (invitations acceptées, OP-D2 a) : colonnes additives, contraintes, échéance d'accès appliquée par la vue,
  //    pont du partage intact (aucun accès perdu), second rejeu sans effet. Transaction annulée.
  await client.query('BEGIN');
  const cols7 = await all(`SELECT table_schema || '.' || table_name || '.' || column_name AS c FROM information_schema.columns
    WHERE (table_schema = 'auth' AND table_name = 'invitations' AND column_name IN ('participation_id', 'proposed_roles'))
       OR (table_schema = 'public' AND table_name = 'project_participations' AND column_name = 'access_expires_at')`);
  check(cols7.length === 3, 'phase 3 : colonnes additives participation_id, proposed_roles, access_expires_at', cols7);
  await client.query(users('op7_o', 'op7_m'));
  await client.query("INSERT INTO projects (id, owner_id, code, name) VALUES ('op_p7', 'op7_o', 'P7', 'Invitations')");
  await client.query("INSERT INTO project_members (project_id, user_id, role, invited_by) VALUES ('op_p7', 'op7_m', 'lecteur', 'x')");
  const p7 = (await parts('op_p7', 'op7_m'))[0];
  check(!!(await one("SELECT 1 AS x FROM project_effective_access WHERE project_id = 'op_p7' AND user_id = 'op7_m'")), 'phase 3 : le pont du partage ouvre toujours l\'accès (aucune perte)');
  await client.query("UPDATE project_participations SET access_expires_at = now() + interval '1 day' WHERE id = $1", [p7.id]);
  check(!!(await one("SELECT 1 AS x FROM project_effective_access WHERE project_id = 'op_p7' AND user_id = 'op7_m'")), 'phase 3 : échéance d\'accès future — accès conservé');
  await client.query("UPDATE project_participations SET access_expires_at = now() - interval '1 second' WHERE id = $1", [p7.id]);
  check(!(await one("SELECT 1 AS x FROM project_effective_access WHERE project_id = 'op_p7' AND user_id = 'op7_m'")), 'phase 3 : échéance d\'accès passée — plus aucun accès (vue)');
  check(!!(await one("SELECT 1 AS x FROM project_effective_access WHERE project_id = 'op_p7' AND user_id = 'op7_o'")), 'phase 3 : le propriétaire garde tout');
  await rejects('phase 3 : participation_id sur une invitation de compte', `INSERT INTO auth.invitations (id, purpose, email, token_hash, invited_by, expires_at, grant_platform_role, participation_id)
    VALUES ('op7_i1', 'platform_account', 'a@invalid', 'h1', 'op7_o', now() + interval '1 day', NULL, '${p7.id}')`);
  await rejects('phase 3 : rôles proposés hors tableau JSON', `INSERT INTO auth.invitations (id, purpose, email, token_hash, project_id, project_role, invited_by, expires_at, proposed_roles)
    VALUES ('op7_i2', 'project_participation', 'b@invalid', 'h2', 'op_p7', 'lecteur', 'op7_o', now() + interval '1 day', '{"role":"lecteur"}')`);
  await client.query(`INSERT INTO auth.invitations (id, purpose, email, token_hash, project_id, project_role, invited_by, expires_at, participation_id, proposed_roles)
    VALUES ('op7_i3', 'project_participation', 'c@invalid', 'h3', 'op_p7', 'lecteur', 'op7_o', now() + interval '1 day', '${p7.id}', '[{"role":"lecteur","scopeType":"projet","scopeId":null}]')`);
  ok('phase 3 : invitation de projet liée à une participation, rôles proposés enregistrés');
  const before7 = await one('SELECT (SELECT count(*) FROM auth.invitations)::int AS i, (SELECT count(*) FROM project_participations)::int AS pp');
  await client.query(initSql);
  const after7 = await one('SELECT (SELECT count(*) FROM auth.invitations)::int AS i, (SELECT count(*) FROM project_participations)::int AS pp');
  check(JSON.stringify(before7) === JSON.stringify(after7), 'phase 3 : rejeu d\'init.sql sans effet', { before7, after7 });
  check(!(await one("SELECT 1 AS x FROM project_effective_access WHERE project_id = 'op_p7' AND user_id = 'op7_m'")), 'phase 3 : après rejeu, l\'échéance passée s\'applique toujours');
  await client.query('ROLLBACK');

  // 5. Concurrence : un même compte obtient deux accès en parallèle (deux projets créés en même temps, aucune personne
  //    encore) — la seconde transaction attend la première puis relit la personne, sans échouer.
  await client.query(users('op_par'));
  const second = new pg.Client({ connectionString: url });
  await second.connect();
  try {
    await client.query('BEGIN');
    await client.query("INSERT INTO projects (id, owner_id, code, name) VALUES ('op_par1', 'op_par', 'PA1', 'Parallèle 1')");
    await second.query('BEGIN');
    const pending = second.query("INSERT INTO projects (id, owner_id, code, name) VALUES ('op_par2', 'op_par', 'PA2', 'Parallèle 2')");
    await new Promise((r) => setTimeout(r, 300));
    await client.query('COMMIT');
    await pending;
    await second.query('COMMIT');
    const par = await one("SELECT count(DISTINCT pe.id)::int AS personnes, count(pp.id)::int AS participations FROM people pe JOIN project_participations pp ON pp.person_id = pe.id WHERE pe.user_id = 'op_par'");
    check(par.personnes === 1 && par.participations === 2, 'deux accès simultanés du même compte : une personne, deux participations', par);
  } catch (e) {
    ko('deux accès simultanés du même compte : ' + e.message);
    await second.query('ROLLBACK').catch(() => undefined);
    await client.query('ROLLBACK').catch(() => undefined);
  } finally {
    await second.end();
    await client.query("DELETE FROM users WHERE id = 'op_par'");  // projets, personne et participations en cascade
  }
} catch (e) {
  ko('erreur inattendue : ' + e.message);
  await client.query('ROLLBACK').catch(() => undefined);
} finally {
  await client.end();
}
if (failures) { console.log(`❌ ${failures} contrôle(s) en échec`); process.exit(1); }
console.log('✅ schéma de participation (phases 1, 2 et 3) vérifié');
