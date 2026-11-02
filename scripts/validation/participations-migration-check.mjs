/**
 * Organisations, participation et revue externe (Issue #262) : contrôle du schéma sur une base réelle jetable
 * (CI `validate`, après `db:migrate` et `users-migration-check.mjs`). Lot OP-PONT : le pont `op_sync_access` est retiré,
 * `project_members` est une vue de compatibilité en lecture dérivée des participations.
 *
 *   DATABASE_URL=… node scripts/validation/participations-migration-check.mjs
 *
 * 1. retrait du pont sur une base ANTÉRIEURE simulée (vue remplacée par l'ancienne table, déclencheurs du miroir
 *    recréés, partages repris ou non par un miroir) : au rejeu d'init.sql, reprise sans perte — un partage jamais repris
 *    reçoit personne, participation active datée de son partage, export (NULL d'archive = TRUE) et rôle `acces` ; une
 *    participation déjà tenue n'est pas modifiée (une suspension reste, une dérive n'ouvre rien) ; invitant et date
 *    recopiés ; accès effectifs identiques avant / après ; vue de compatibilité identique à l'ancienne table ; plus
 *    aucun déclencheur ni fonction du miroir ; second rejeu sans effet ;
 * 2. vue de compatibilité : une ligne par partage en cours (participation non terminée portant le rôle de partage, hors
 *    propriétaire, suspendu compris), jamais pour un contact, un rôle d'attribution seul ou une participation terminée ;
 *    lecture seule (écritures refusées) ; la participation du propriétaire d'un projet créé hors de l'application est
 *    réparée au rejeu ; suppressions en cascade sans erreur ;
 * 3. contraintes CHECK et unicité de la participation courante ;
 * 4. D-7 : `fadi_app` écrit participations et rôles, lit la vue de compatibilité, sans aucune écriture dans
 *    `project_members` ni DDL ;
 * 5. concurrence : deux créations simultanées de la personne d'un même compte (`ON CONFLICT`, comme
 *    `lib/project-access-db.ts`) n'en créent qu'une, sans échec (seule section validée, nettoyée ensuite) ;
 * 6. phase 2 (bascule de l'accès, OP-D3 c) : la vue `project_effective_access` rend l'accès de chaque partage (lecteur,
 *    éditeur, export accordé) ; aucun droit pour un contact, une participation suspendue, terminée, sans rôle de projet,
 *    à portée plus étroite ou non commencée ; colonnes additives ; second rejeu d'init.sql sans effet ; `fadi_app` lit la
 *    vue sans DDL ;
 * 7. phase 3 (invitations acceptées) : colonnes, contraintes, échéance d'accès appliquée par la vue, rejeu sans effet.
 * Sections 1 à 4, 6 et 7 dans des transactions annulées (ROLLBACK). Refuse une base qui n'est pas locale : jamais la production.
 */
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { partagerEnBase } from '../../apps/web/e2e/lib-partage-sql.mjs';

const url = process.env.DATABASE_URL ?? '';
const host = (() => { try { return new URL(url).hostname; } catch { return ''; } })();
if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(host)) {
  console.error('Refus : DATABASE_URL doit désigner une base locale jetable.');
  process.exit(2);
}
const initSql = readFileSync(new URL('../../apps/api/src/db/init.sql', import.meta.url), 'utf8');
const client = new pg.Client({ connectionString: url });
await client.connect();
const notices = [];
client.on('notice', (n) => notices.push(n.message));
let failures = 0;
const ok = (m) => console.log('✓ ' + m);
const ko = (m) => { failures++; console.log('❌ ' + m); };
const check = (cond, m, detail) => (cond ? ok(m) : ko(`${m} ${detail === undefined ? '' : JSON.stringify(detail)}`));
const one = async (q, p = []) => (await client.query(q, p)).rows[0];
const all = async (q, p = []) => (await client.query(q, p)).rows;
const share = (project, user, role = 'lecteur') => partagerEnBase(client, project, user, role, 'x');

async function rejects(label, query) {
  await client.query('SAVEPOINT s');
  try { await client.query(query); ko(`${label} : accepté à tort`); }
  catch { ok(`${label} : refusé`); }
  finally { await client.query('ROLLBACK TO SAVEPOINT s'); }
}

/** Participations d'un compte dans un projet, les terminées d'abord (même `now()` dans une transaction), avec leurs rôles. */
async function parts(project, user) {
  return all(`SELECT pp.id, pp.status, pp.starts_on::text AS starts_on, pp.ends_on::text AS ends_on, pp.can_export,
      coalesce(array_agg(ra.role || ':' || ra.origin ORDER BY ra.role) FILTER (WHERE ra.id IS NOT NULL), '{}') AS roles
    FROM project_participations pp JOIN people pe ON pe.id = pp.person_id
    LEFT JOIN project_role_assignments ra ON ra.participation_id = pp.id
    WHERE pp.project_id = $1 AND pe.user_id = $2 GROUP BY pp.id ORDER BY pp.ends_on NULLS LAST, pp.created_at, pp.id`, [project, user]);
}
const users = (...ids) => ids.map((id) => `INSERT INTO users (id, email, password_hash) VALUES ('${id}', '${id}@invalid', 'x');`).join(' ');
const counts = async () => one(`SELECT (SELECT count(*) FROM people)::int AS pe, (SELECT count(*) FROM project_participations)::int AS pp,
  (SELECT count(*) FROM project_role_assignments)::int AS ra`);
const effective = async (project) => Object.fromEntries((await all('SELECT user_id, role, can_export, can_approve, can_publish FROM project_effective_access WHERE project_id = $1', [project]))
  .map((r) => [r.user_id, `${r.role}${r.can_export ? '+export' : ''}${r.can_approve ? '+approbation' : ''}${r.can_publish ? '+diffusion' : ''}`]));
const compat = async (project) => all("SELECT user_id, role, can_export, invited_by, to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI') AS at FROM project_members WHERE project_id = $1 ORDER BY user_id", [project]);
const sorted = (o) => JSON.stringify(Object.entries(o).sort());

/** Ancien état (avant le lot OP-PONT) : la table `project_members` et les déclencheurs du miroir, dans la transaction. */
async function simulerBaseAnterieure() {
  await client.query('DROP VIEW project_members');
  await client.query(`CREATE TABLE project_members (
    project_id text NOT NULL REFERENCES projects (id) ON DELETE CASCADE, user_id text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    role text NOT NULL, invited_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), can_export boolean DEFAULT false,
    PRIMARY KEY (project_id, user_id))`);
  // Déclencheurs du miroir, présents sur une base antérieure : ici inertes (le retrait doit les supprimer avec leurs fonctions).
  await client.query(`CREATE FUNCTION op_sync_access(p_project text, p_user text, p_since date DEFAULT current_date) RETURNS void LANGUAGE sql AS 'SELECT NULL::void';
    CREATE FUNCTION op_project_members_mirror() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$;
    CREATE FUNCTION op_projects_owner_mirror() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$;
    CREATE TRIGGER project_members_op_mirror AFTER INSERT OR UPDATE OR DELETE ON project_members FOR EACH ROW EXECUTE FUNCTION op_project_members_mirror();
    CREATE TRIGGER projects_op_owner_mirror AFTER INSERT OR UPDATE OF owner_id ON projects FOR EACH ROW EXECUTE FUNCTION op_projects_owner_mirror();`);
}

try {
  // 1. Retrait du pont sur une base antérieure simulée.
  await client.query('BEGIN');
  await client.query(users('op_a', 'op_b', 'op_c', 'op_d', 'op_s', 'op_t', 'op_w', 'op_q'));
  await client.query("INSERT INTO projects (id, owner_id, code, name, created_at) VALUES ('op_p1', 'op_a', 'P1', 'Reprise', '2026-01-15T10:00:00Z')");
  await client.query("INSERT INTO projects (id, owner_id, code, name, created_at) VALUES ('op_p1b', 'op_a', 'P1B', 'Déjà tenu', '2026-01-15T10:00:00Z')");
  await simulerBaseAnterieure();
  // Partages jamais repris par un miroir (base antérieure à la phase 1) : lecteur sans export, éditeur, lecteur d'archive (NULL).
  await client.query(`INSERT INTO project_members (project_id, user_id, role, invited_by, created_at, can_export) VALUES
    ('op_p1', 'op_b', 'lecteur', 'op_a@invalid', '2026-02-01T10:00:00Z', false), ('op_p1', 'op_c', 'editeur', 'op_a@invalid', '2026-03-01T10:00:00Z', false),
    ('op_p1', 'op_d', 'lecteur', 'recette', '2026-03-02T10:00:00Z', NULL),
    ('op_p1', 'op_a', 'owner', 'x', '2026-01-15T10:00:00Z', NULL), ('op_p1', 'op_q', 'editor', 'x', '2026-03-03T10:00:00Z', NULL)`);
  // Partages déjà tenus par le miroir (phase 1 à 3) : lecteur suspendu, éditeur, et une dérive (rôle de partage retiré par SQL).
  await client.query(`INSERT INTO project_members (project_id, user_id, role, invited_by, created_at, can_export) VALUES
    ('op_p1b', 'op_s', 'lecteur', 'op_a@invalid', '2026-04-01T10:00:00Z', true), ('op_p1b', 'op_t', 'editeur', 'op_a@invalid', '2026-04-02T10:00:00Z', false),
    ('op_p1b', 'op_w', 'lecteur', 'op_a@invalid', '2026-04-03T10:00:00Z', false)`);
  for (const [u, role, exp] of [['op_s', 'lecteur', true], ['op_t', 'concepteur', false], ['op_w', null, false]]) {
    await client.query("INSERT INTO people (id, user_id) VALUES ('per_' || $1, $1) ON CONFLICT DO NOTHING", [u]);
    await client.query("INSERT INTO project_participations (id, project_id, person_id, status, starts_on, can_export) VALUES ('ppa_' || $1, 'op_p1b', 'per_' || $1, 'active', '2026-04-01', $2)", [u, exp]);
    if (role) await client.query("INSERT INTO project_role_assignments (id, participation_id, role, origin) VALUES ('pra_' || $1, 'ppa_' || $1, $2, 'acces')", [u, role]);
  }
  await client.query("UPDATE project_participations SET status = 'suspendue' WHERE id = 'ppa_op_s'");
  const avant1b = await effective('op_p1b');
  notices.length = 0;
  await client.query(initSql);
  const a = await parts('op_p1', 'op_a'), b = await parts('op_p1', 'op_b'), c = await parts('op_p1', 'op_c'), d = await parts('op_p1', 'op_d'), q = await parts('op_p1', 'op_q');
  check(a.length === 1 && a[0].status === 'active' && a[0].starts_on === '2026-01-15' && a[0].roles.length === 0,
    'reprise : propriétaire actif depuis la création du projet, sans rôle de partage (ligne « owner » ignorée)', a);
  check(b.length === 1 && b[0].starts_on === '2026-02-01' && b[0].roles.join() === 'lecteur:acces' && !b[0].can_export, 'reprise : lecteur → lecteur, daté de son partage, sans export', b);
  check(c.length === 1 && c[0].starts_on === '2026-03-01' && c[0].roles.join() === 'concepteur:acces', 'reprise : editeur → concepteur, daté de son partage', c);
  check(d.length === 1 && d[0].can_export === true, 'reprise : lecteur d\'archive (export NULL) → export accordé', d);
  check(q.length === 0, 'reprise : rôle inconnu (« editor ») sans participation ni accès, comme l\'ancien miroir', q);
  check(sorted(await effective('op_p1')) === sorted({ op_a: 'proprietaire+export+approbation+diffusion', op_b: 'lecteur', op_c: 'editeur+export', op_d: 'lecteur+export' }),
    'reprise : chaque partage repris a exactement son accès', await effective('op_p1'));
  check(sorted(await effective('op_p1b')) === sorted(avant1b) && !('op_s' in avant1b) && !('op_w' in avant1b),
    'déjà tenu : accès effectifs identiques avant / après (suspension conservée, dérive sans accès)', { avant1b, apres: await effective('op_p1b') });
  check((await parts('op_p1b', 'op_s'))[0].status === 'suspendue', 'déjà tenu : une participation suspendue le reste');
  check(JSON.stringify(await compat('op_p1')) === JSON.stringify([
    { user_id: 'op_b', role: 'lecteur', can_export: false, invited_by: 'op_a@invalid', at: '2026-02-01 10:00' },
    { user_id: 'op_c', role: 'editeur', can_export: false, invited_by: 'op_a@invalid', at: '2026-03-01 10:00' },
    { user_id: 'op_d', role: 'lecteur', can_export: true, invited_by: 'recette', at: '2026-03-02 10:00' },
  ]), 'vue de compatibilité : mêmes partages, rôles, export, invitant et date que l\'ancienne table', await compat('op_p1'));
  check(JSON.stringify((await compat('op_p1b')).map((r) => [r.user_id, r.role, r.invited_by, r.at])) === JSON.stringify([
    ['op_s', 'lecteur', 'op_a@invalid', '2026-04-01 10:00'], ['op_t', 'editeur', 'op_a@invalid', '2026-04-02 10:00'],
  ]), 'vue de compatibilité : partage suspendu listé, invitant et date recopiés ; dérive sans rôle de partage non listée', await compat('op_p1b'));
  check(notices.some((n) => /1 partage\(s\) dont la participation diffère/.test(n)) && notices.some((n) => /2 ligne\(s\) de partage sans accès de base/.test(n))
    && notices.some((n) => /pont retiré/.test(n)), 'retrait : dérive et lignes sans accès de base signalées (NOTICE)', notices.filter((n) => n.includes('OP-PONT')));
  const pont = await one(`SELECT (SELECT relkind FROM pg_class WHERE oid = 'public.project_members'::regclass) AS kind,
    (SELECT count(*) FROM pg_trigger WHERE tgname IN ('project_members_op_mirror', 'projects_op_owner_mirror'))::int AS triggers,
    (SELECT count(*) FROM pg_proc WHERE proname IN ('op_sync_access', 'op_project_members_mirror', 'op_projects_owner_mirror'))::int AS functions`);
  check(pont.kind === 'v' && pont.triggers === 0 && pont.functions === 0, 'retrait : table remplacée par la vue, plus aucun déclencheur ni fonction du miroir', pont);
  const before = await counts();
  notices.length = 0;
  await client.query(initSql);
  const after = await counts();
  check(JSON.stringify(before) === JSON.stringify(after) && !notices.some((n) => n.includes('OP-PONT')), 'retrait rejoué : aucune ligne créée deux fois, rien de repris', { before, after });
  check((await one("SELECT count(*)::int AS n FROM people WHERE user_id IN ('op_a', 'op_b', 'op_c', 'op_d')")).n === 4, 'une seule personne par compte');
  await client.query('ROLLBACK');

  // 2. Vue de compatibilité et participation du propriétaire.
  await client.query('BEGIN');
  await client.query(users('op_o', 'op_m', 'op_n', 'op_r'));
  await client.query("INSERT INTO projects (id, owner_id, code, name) VALUES ('op_p2', 'op_o', 'P2', 'Vue')");
  check((await parts('op_p2', 'op_o')).length === 0, 'projet créé hors de l\'application : plus aucun déclencheur n\'écrit de participation');
  await client.query(initSql);
  const o2 = await parts('op_p2', 'op_o');
  check(o2.length === 1 && o2[0].status === 'active' && o2[0].roles.length === 0, 'rejeu : participation du propriétaire réparée, sans rôle de partage', o2);
  await share('op_p2', 'op_m', 'lecteur');
  await share('op_p2', 'op_n', 'editeur');
  await client.query(`INSERT INTO project_role_assignments (id, participation_id, role, scope_type, scope_id, origin)
    VALUES ('op_ra1', '${(await parts('op_p2', 'op_m'))[0].id}', 'relecteur', 'revision', 'rev_3', 'attribution')`);
  // Rôle d'attribution seul (sans partage) et contact : jamais une ligne de partage.
  await client.query("INSERT INTO people (id, user_id) VALUES ('per_op_r', 'op_r')");
  await client.query("INSERT INTO project_participations (id, project_id, person_id, status) VALUES ('ppa_op_r', 'op_p2', 'per_op_r', 'active')");
  await client.query("INSERT INTO project_role_assignments (id, participation_id, role, origin) VALUES ('pra_op_r', 'ppa_op_r', 'approbateur', 'attribution')");
  await client.query("INSERT INTO people (id, display_name) VALUES ('op_ct', 'Contact')");
  await client.query("INSERT INTO project_participations (id, project_id, person_id, status) VALUES ('ppa_op_ct', 'op_p2', 'op_ct', 'contact')");
  let rows = (await compat('op_p2')).map((r) => `${r.user_id}:${r.role}`);
  check(rows.join() === 'op_m:lecteur,op_n:editeur', 'vue : une ligne par partage (lecteur, éditeur), ni propriétaire, ni attribution seule, ni contact', rows);
  await client.query("UPDATE project_participations SET status = 'suspendue' WHERE id = $1", [(await parts('op_p2', 'op_m'))[0].id]);
  check((await compat('op_p2')).some((r) => r.user_id === 'op_m') && !('op_m' in await effective('op_p2')), 'vue : partage suspendu listé (comme l\'ancienne table), sans accès effectif');
  await client.query("UPDATE project_participations SET status = 'terminee', ends_on = current_date WHERE id = $1", [(await parts('op_p2', 'op_n'))[0].id]);
  rows = (await compat('op_p2')).map((r) => r.user_id);
  check(!rows.includes('op_n'), 'vue : participation terminée hors de la vue', rows);
  await rejects('vue : INSERT refusé', "INSERT INTO project_members (project_id, user_id, role, invited_by) VALUES ('op_p2', 'op_r', 'lecteur', 'x')");
  await rejects('vue : UPDATE refusé', "UPDATE project_members SET role = 'editeur' WHERE project_id = 'op_p2'");
  await rejects('vue : DELETE refusé', "DELETE FROM project_members WHERE project_id = 'op_p2'");
  await client.query("DELETE FROM users WHERE id = 'op_m'");
  ok('suppression d\'un compte partagé : cascade sans erreur');
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

  // 4. D-7 : fadi_app écrit participations et rôles, lit la vue de compatibilité, jamais d'écriture dans la vue ni de DDL.
  const roles = (await all("SELECT rolname FROM pg_roles WHERE rolname IN ('fadi_app', 'fadi_owner')")).map((r) => r.rolname);
  if (roles.length < 2) ok('D-7 : rôles fadi_* absents, contrôle des droits non exécuté');
  else {
    const priv = await one(`SELECT has_table_privilege('fadi_app', 'public.project_members', 'SELECT') AS s, has_table_privilege('fadi_app', 'public.project_members', 'INSERT') AS i,
      has_table_privilege('fadi_app', 'public.project_members', 'UPDATE') AS u, has_table_privilege('fadi_app', 'public.project_members', 'DELETE') AS d`);
    check(priv.s && !priv.i && !priv.u && !priv.d, 'D-7 : fadi_app lit la vue de compatibilité, sans INSERT / UPDATE / DELETE', priv);
    await client.query('BEGIN');
    await client.query(users('op_u', 'op_v'));
    await client.query("INSERT INTO projects (id, owner_id, code, name) VALUES ('op_p4', 'op_u', 'P4', 'Droits')");
    await client.query('SET LOCAL ROLE fadi_app');
    try {
      await share('op_p4', 'op_v', 'editeur');
      await client.query("INSERT INTO organizations (id, name) VALUES ('op_org4', 'Client'); INSERT INTO people (id, display_name) VALUES ('op_pe4', 'Contact')");
      await client.query("INSERT INTO project_participations (id, project_id, organization_id, status) VALUES ('op_pp4', 'op_p4', 'op_org4', 'contact')");
      check((await compat('op_p4')).map((r) => r.user_id).join() === 'op_v', 'fadi_app : partage écrit dans les participations, lu par la vue');
    } catch (e) { ko('fadi_app : écriture refusée — ' + e.message); }
    await rejects('fadi_app : INSERT dans project_members', "INSERT INTO project_members (project_id, user_id, role, invited_by) VALUES ('op_p4', 'op_u', 'lecteur', 'x')");
    await rejects('fadi_app : ALTER TABLE des participations', 'ALTER TABLE project_participations ADD COLUMN intrus int');
    await rejects('fadi_app : remplacement de la vue de compatibilité', 'CREATE OR REPLACE VIEW project_members AS SELECT 1');
    await client.query('ROLLBACK');
  }

  // 6. Phase 2 : bascule de l'accès sur les participations.
  await client.query('BEGIN');
  await client.query(users('op6_o', 'op6_l', 'op6_e', 'op6_x', 'op6_n'));
  await client.query("INSERT INTO projects (id, owner_id, code, name) VALUES ('op_p6', 'op6_o', 'P6', 'Bascule')");
  for (const [u, r] of [['op6_l', 'lecteur'], ['op6_e', 'editeur'], ['op6_x', 'lecteur'], ['op6_n', 'lecteur']]) await share('op_p6', u, r);
  await client.query(`UPDATE project_participations SET can_export = true WHERE project_id = 'op_p6'
    AND person_id IN (SELECT id FROM people WHERE user_id IN ('op6_x', 'op6_n'))`);
  const attendu = { op6_o: 'proprietaire+export+approbation+diffusion', op6_l: 'lecteur', op6_e: 'editeur+export', op6_x: 'lecteur+export', op6_n: 'lecteur+export' };
  check(sorted(await effective('op_p6')) === sorted(attendu), 'chaque partage a exactement son accès (export accordé compris)', await effective('op_p6'));
  const before6 = await counts();
  await client.query(initSql);
  const after6 = await counts();
  // Le rejeu répare la participation du propriétaire (projet créé par SQL) : sa personne et sa participation, rien d'autre.
  check(after6.pe === before6.pe + 1 && after6.ra === before6.ra && after6.pp === before6.pp + 1 && sorted(await effective('op_p6')) === sorted(attendu),
    'rejeu : seules la personne et la participation du propriétaire sont ajoutées, vue intacte', { before6, after6 });
  const before6b = await counts();
  await client.query(initSql);
  check(JSON.stringify(before6b) === JSON.stringify(await counts()), 'second rejeu : aucune ligne créée deux fois');
  const cols = (await all(`SELECT table_name || '.' || column_name AS c FROM information_schema.columns
    WHERE (table_name, column_name) IN (('projects', 'closed_at'), ('people', 'erased_at'), ('project_participations', 'can_export'),
      ('project_participations', 'access_granted_by'), ('project_participations', 'access_granted_at')) ORDER BY 1`)).map((r) => r.c);
  check(cols.join() === 'people.erased_at,project_participations.access_granted_at,project_participations.access_granted_by,project_participations.can_export,projects.closed_at',
    'colonnes additives des phases 2 et OP-PONT présentes', cols);
  const partOf6 = async (u) => (await one(`SELECT pp.id FROM project_participations pp JOIN people pe ON pe.id = pp.person_id
    WHERE pp.project_id = 'op_p6' AND pe.user_id = $1 AND pp.status <> 'terminee'`, [u])).id;
  const pl = await partOf6('op6_l');
  await client.query("UPDATE project_participations SET status = 'suspendue' WHERE id = $1", [pl]);
  check(!('op6_l' in await effective('op_p6')), 'participation suspendue : aucun accès');
  await client.query("UPDATE project_participations SET status = 'active' WHERE id = $1", [pl]);
  check((await effective('op_p6')).op6_l === 'lecteur', 'réactivation : l\'accès des rôles portés revient', await effective('op_p6'));
  const px = await partOf6('op6_x');
  await client.query("DELETE FROM project_role_assignments WHERE participation_id = $1", [px]);
  check(!('op6_x' in await effective('op_p6')), 'participation active sans rôle de projet (revue seule) : aucun accès');
  await client.query("INSERT INTO project_role_assignments (id, participation_id, role, scope_type, scope_id) VALUES ('op6_r1', $1, 'approbateur', 'etude', 's1')", [px]);
  check(!('op6_x' in await effective('op_p6')), 'rôle de portée étude seul : aucun accès au projet');
  await client.query("INSERT INTO project_role_assignments (id, participation_id, role) VALUES ('op6_r2', $1, 'approbateur')", [px]);
  check((await effective('op_p6')).op6_x === 'lecteur+export+approbation', 'Approbateur de portée projet : lecture, approbation (export accordé conservé)', await effective('op_p6'));
  const pe = await partOf6('op6_e');
  await client.query("UPDATE project_participations SET status = 'terminee', ends_on = current_date WHERE id = $1", [pe]);
  check(!('op6_e' in await effective('op_p6')), 'participation terminée : aucun accès');
  await client.query("UPDATE project_participations SET starts_on = current_date + 30 WHERE id = $1", [await partOf6('op6_n')]);
  check(!('op6_n' in await effective('op_p6')), 'participation qui n\'a pas commencé : aucun accès');
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
  //    partage (rôle `acces`) ouvrant l'accès, second rejeu sans effet. Transaction annulée.
  await client.query('BEGIN');
  const cols7 = await all(`SELECT table_schema || '.' || table_name || '.' || column_name AS c FROM information_schema.columns
    WHERE (table_schema = 'auth' AND table_name = 'invitations' AND column_name IN ('participation_id', 'proposed_roles'))
       OR (table_schema = 'public' AND table_name = 'project_participations' AND column_name = 'access_expires_at')`);
  check(cols7.length === 3, 'phase 3 : colonnes additives participation_id, proposed_roles, access_expires_at', cols7);
  await client.query(users('op7_o', 'op7_m'));
  await client.query("INSERT INTO projects (id, owner_id, code, name) VALUES ('op_p7', 'op7_o', 'P7', 'Invitations')");
  await share('op_p7', 'op7_m', 'lecteur');
  const p7 = (await parts('op_p7', 'op7_m'))[0];
  check(!!(await one("SELECT 1 AS x FROM project_effective_access WHERE project_id = 'op_p7' AND user_id = 'op7_m'")), 'phase 3 : le partage (rôle `acces`) ouvre l\'accès');
  await client.query("UPDATE project_participations SET access_expires_at = now() + interval '1 day' WHERE id = $1", [p7.id]);
  check(!!(await one("SELECT 1 AS x FROM project_effective_access WHERE project_id = 'op_p7' AND user_id = 'op7_m'")), 'phase 3 : échéance d\'accès future — accès conservé');
  await client.query("UPDATE project_participations SET access_expires_at = now() - interval '1 second' WHERE id = $1", [p7.id]);
  check(!(await one("SELECT 1 AS x FROM project_effective_access WHERE project_id = 'op_p7' AND user_id = 'op7_m'")), 'phase 3 : échéance d\'accès passée — plus aucun accès (vue)');
  check((await compat('op_p7')).some((r) => r.user_id === 'op7_m'), 'phase 3 : partage échu toujours listé par la vue de compatibilité (comme l\'ancienne table)');
  check(!!(await one("SELECT 1 AS x FROM project_effective_access WHERE project_id = 'op_p7' AND user_id = 'op7_o'")), 'phase 3 : le propriétaire garde tout');
  await rejects('phase 3 : participation_id sur une invitation de compte', `INSERT INTO auth.invitations (id, purpose, email, token_hash, invited_by, expires_at, grant_platform_role, participation_id)
    VALUES ('op7_i1', 'platform_account', 'a@invalid', 'h1', 'op7_o', now() + interval '1 day', NULL, '${p7.id}')`);
  await rejects('phase 3 : rôles proposés hors tableau JSON', `INSERT INTO auth.invitations (id, purpose, email, token_hash, project_id, project_role, invited_by, expires_at, proposed_roles)
    VALUES ('op7_i2', 'project_participation', 'b@invalid', 'h2', 'op_p7', 'lecteur', 'op7_o', now() + interval '1 day', '{"role":"lecteur"}')`);
  await client.query(`INSERT INTO auth.invitations (id, purpose, email, token_hash, project_id, project_role, invited_by, expires_at, participation_id, proposed_roles)
    VALUES ('op7_i3', 'project_participation', 'c@invalid', 'h3', 'op_p7', 'lecteur', 'op7_o', now() + interval '1 day', '${p7.id}', '[{"role":"lecteur","scopeType":"projet","scopeId":null}]')`);
  ok('phase 3 : invitation de projet liée à une participation, rôles proposés enregistrés');
  await client.query(initSql);  // répare la participation du propriétaire (projet créé par SQL)
  const before7 = await one('SELECT (SELECT count(*) FROM auth.invitations)::int AS i, (SELECT count(*) FROM project_participations)::int AS pp');
  await client.query(initSql);
  const after7 = await one('SELECT (SELECT count(*) FROM auth.invitations)::int AS i, (SELECT count(*) FROM project_participations)::int AS pp');
  check(JSON.stringify(before7) === JSON.stringify(after7), 'phase 3 : rejeu d\'init.sql sans effet', { before7, after7 });
  check(!(await one("SELECT 1 AS x FROM project_effective_access WHERE project_id = 'op_p7' AND user_id = 'op7_m'")), 'phase 3 : après rejeu, l\'échéance passée s\'applique toujours');
  await client.query('ROLLBACK');

  // 5. Concurrence : la personne d'un même compte créée par deux transactions simultanées (`ON CONFLICT`, comme
  //    `ensurePerson` de lib/project-access-db.ts) — la seconde attend la première puis ne crée rien, sans échouer.
  await client.query(users('op_par'));
  const second = new pg.Client({ connectionString: url });
  await second.connect();
  const person = "INSERT INTO people (id, user_id) VALUES ('per_' || gen_random_uuid(), 'op_par') ON CONFLICT (user_id) WHERE user_id IS NOT NULL DO NOTHING";
  try {
    await client.query('BEGIN');
    await client.query(person);
    await second.query('BEGIN');
    const pending = second.query(person);
    await new Promise((r) => setTimeout(r, 300));
    await client.query('COMMIT');
    await pending;
    await second.query('COMMIT');
    const par = await one("SELECT count(*)::int AS personnes FROM people WHERE user_id = 'op_par'");
    check(par.personnes === 1, 'deux créations simultanées de la personne d\'un même compte : une seule personne', par);
  } catch (e) {
    ko('deux créations simultanées de la personne d\'un même compte : ' + e.message);
    await second.query('ROLLBACK').catch(() => undefined);
    await client.query('ROLLBACK').catch(() => undefined);
  } finally {
    await second.end();
    await client.query("DELETE FROM users WHERE id = 'op_par'");  // personne en cascade
  }
} catch (e) {
  ko('erreur inattendue : ' + e.message);
  await client.query('ROLLBACK').catch(() => undefined);
} finally {
  await client.end();
}
if (failures) { console.log(`❌ ${failures} contrôle(s) en échec`); process.exit(1); }
console.log('✅ schéma de participation (phases 1, 2, 3 et retrait du pont OP-PONT) vérifié');
