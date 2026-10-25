/**
 * Organisations, participation et revue externe — phase 5 (espace d'organisation, Issue #262) : contrôle du schéma sur
 * une base réelle jetable (CI `validate`, après `db:migrate` et `participations-migration-check.mjs`).
 *
 *   DATABASE_URL=… node scripts/validation/organisations-migration-check.mjs
 *
 * 1. idempotence : init.sql rejoué deux fois ne crée ni ne perd rien (adhésions, groupes, gabarits, mandats, invitations),
 *    contraintes et index d'invitation inchangés ; les finalités existantes restent valides ;
 * 2. contraintes : adhésion (rôle, statut, fin datée, une adhésion courante), groupe d'une autre organisation refusé,
 *    version de gabarit immuable, mandat lié à la participation de SON organisation, un seul mandat actif, invitation
 *    `organization_membership` (organisation et rôle exigés, deux organisations pour une même adresse) ;
 * 3. déclencheurs : départ (groupes retirés, mandat actif terminé, proposition annulée, participations de projet
 *    intactes), clôture définitive (adhésions et mandats terminés), groupe refusé à une adhésion terminée, partie
 *    propriétaire (clé étrangère, mise à nul à la suppression de l'organisation) ;
 * 4. aucun droit de projet : adhésion, groupe et mandat n'écrivent ni `project_members` ni participation de personne ;
 * 5. D-7 : `fadi_app` écrit les nouvelles tables, sans DDL, et ne contourne pas l'immutabilité des versions.
 * Chaque section dans une transaction annulée (ROLLBACK). Refuse une base qui n'est pas locale : jamais la production.
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

async function rejects(label, query, expected) {
  await client.query('SAVEPOINT s');
  try { await client.query(query); ko(`${label} : accepté à tort`); }
  catch (e) {
    if (expected && !String(e.message).includes(expected)) ko(`${label} : refusé pour une autre raison (${e.message})`);
    else ok(`${label} : refusé`);
  } finally { await client.query('ROLLBACK TO SAVEPOINT s'); }
}
const users = (...ids) => ids.map((id) => `INSERT INTO users (id, email, password_hash) VALUES ('${id}', '${id}@invalid', 'x');`).join(' ');
const person = (id, user) => `INSERT INTO people (id, user_id) VALUES ('${id}', '${user}');`;

/** Jeu de base : organisation O (deux admins, un membre), projet P où O est partie, groupe, gabarit, mandats. */
async function seed() {
  await client.query(users('og_a', 'og_b', 'og_m', 'og_owner'));
  await client.query(person('og_pa', 'og_a') + person('og_pb', 'og_b') + person('og_pm', 'og_m'));
  await client.query("INSERT INTO organizations (id, name, created_by) VALUES ('og_o', 'Atelier Nord', 'og_a'), ('og_o2', 'Bureau Sud', 'og_b')");
  await client.query(`INSERT INTO organization_memberships (id, organization_id, person_id, role, status) VALUES
    ('og_ma', 'og_o', 'og_pa', 'administrateur', 'active'), ('og_mb', 'og_o', 'og_pb', 'administrateur', 'active'),
    ('og_mm', 'og_o', 'og_pm', 'membre', 'active'), ('og_m2', 'og_o2', 'og_pb', 'administrateur', 'active')`);
  await client.query("INSERT INTO projects (id, owner_id, code, name) VALUES ('og_p', 'og_owner', 'OG1', 'Projet partenaire')");
  await client.query("INSERT INTO project_participations (id, project_id, organization_id, status, starts_on) VALUES ('og_pp', 'og_p', 'og_o', 'active', current_date)");
  await client.query("INSERT INTO organization_groups (id, organization_id, name) VALUES ('og_g', 'og_o', 'Structure'), ('og_g2', 'og_o2', 'Fluides')");
  await client.query("INSERT INTO organization_group_members (group_id, membership_id, organization_id) VALUES ('og_g', 'og_mm', 'og_o'), ('og_g', 'og_mb', 'og_o')");
  await client.query("INSERT INTO organization_templates (id, organization_id, name) VALUES ('og_t', 'og_o', 'Équipe type')");
  await client.query(`INSERT INTO organization_template_versions (id, template_id, version, content) VALUES
    ('og_tv1', 'og_t', 1, '{"entries":[{"label":"BET","responsibilities":["produire"],"proposedRoles":["concepteur"]}]}')`);
  await client.query(`INSERT INTO organization_mandates (id, organization_id, project_id, participation_id, membership_id, status, responsibilities)
    VALUES ('og_md1', 'og_o', 'og_p', 'og_pp', 'og_mm', 'actif', '{coordonner}'), ('og_md2', 'og_o', 'og_p', 'og_pp', 'og_mb', 'propose', '{coordonner}')`);
}
const counts = async () => one(`SELECT (SELECT count(*) FROM organization_memberships)::int AS m, (SELECT count(*) FROM organization_groups)::int AS g,
  (SELECT count(*) FROM organization_group_members)::int AS gm, (SELECT count(*) FROM organization_template_versions)::int AS tv,
  (SELECT count(*) FROM organization_mandates)::int AS md, (SELECT count(*) FROM auth.invitations)::int AS inv,
  (SELECT count(*) FROM project_members)::int AS pm, (SELECT count(*) FROM project_participations)::int AS pp`);

try {
  // 1. Idempotence.
  await client.query('BEGIN');
  await seed();
  await client.query(`INSERT INTO auth.invitations (id, purpose, email, token_hash, organization_id, organization_role, invited_by, expires_at)
    VALUES ('og_inv', 'organization_membership', 'x@invalid', 'h_og_inv', 'og_o', 'membre', 'og_a', now() + interval '1 day')`);
  await client.query(`INSERT INTO auth.invitations (id, purpose, email, token_hash, project_id, project_role, invited_by, expires_at)
    VALUES ('og_inv_p', 'project_participation', 'x@invalid', 'h_og_inv_p', 'og_p', 'lecteur', 'og_owner', now() + interval '1 day')`);
  ok('finalités existante (project_participation) et nouvelle (organization_membership) côte à côte');
  const defs = async () => one(`SELECT
      (SELECT string_agg(pg_get_constraintdef(oid), ' | ' ORDER BY conname) FROM pg_constraint WHERE conrelid = 'auth.invitations'::regclass) AS checks,
      (SELECT indexdef FROM pg_indexes WHERE schemaname = 'auth' AND indexname = 'invitations_pending_unique') AS idx`);
  const before = await counts(), defsBefore = await defs();
  await client.query(initSql);
  await client.query(initSql);
  const after = await counts(), defsAfter = await defs();
  check(JSON.stringify(before) === JSON.stringify(after), 'init.sql rejoué deux fois : aucune ligne créée ni perdue', { before, after });
  check(defsBefore.checks === defsAfter.checks && defsBefore.idx === defsAfter.idx, 'contraintes et index des invitations inchangés au rejeu');
  check(/organization_id/.test(defsAfter.idx), 'index des invitations en attente : par organisation aussi', defsAfter.idx);
  // Reliquat de la phase 5 : invitation de projet d'un représentant mandaté (`mandate_id`), réservée à cette finalité.
  await client.query("UPDATE auth.invitations SET mandate_id = 'og_md1' WHERE id = 'og_inv_p'");
  ok('invitation de projet portant un mandat (mandate_id) acceptée');
  await client.query('SAVEPOINT og_mdt');
  const mdtRefused = await client.query("UPDATE auth.invitations SET mandate_id = 'og_md1' WHERE id = 'og_inv'").then(() => false, () => true);
  await client.query('ROLLBACK TO SAVEPOINT og_mdt');
  check(mdtRefused, 'mandate_id refusé hors de la finalité project_participation (invitations_mandate_check)');
  check((await one("SELECT count(*)::int AS n FROM project_members WHERE project_id = 'og_p'")).n === 0, 'invitation d\'un représentant : aucun membre de projet avant acceptation');
  await client.query('ROLLBACK');

  // 2. Contraintes.
  await client.query('BEGIN');
  await seed();
  await rejects('rôle d\'organisation inconnu', "INSERT INTO organization_memberships (id, organization_id, person_id, role) VALUES ('og_x', 'og_o2', 'og_pa', 'chef')");
  await rejects('statut d\'adhésion inconnu', "INSERT INTO organization_memberships (id, organization_id, person_id, status) VALUES ('og_x', 'og_o2', 'og_pa', 'radie')");
  await rejects('adhésion terminée sans date de fin', "INSERT INTO organization_memberships (id, organization_id, person_id, status) VALUES ('og_x', 'og_o2', 'og_pa', 'terminee')");
  await rejects('fin d\'adhésion avant son début', "INSERT INTO organization_memberships (id, organization_id, person_id, status, starts_on, ends_on) VALUES ('og_x', 'og_o2', 'og_pa', 'terminee', '2026-10-02', '2026-10-01')");
  await rejects('deux adhésions courantes de la même personne', "INSERT INTO organization_memberships (id, organization_id, person_id) VALUES ('og_x', 'og_o', 'og_pa')");
  await client.query("INSERT INTO organization_memberships (id, organization_id, person_id) VALUES ('og_pa_o2', 'og_o2', 'og_pa')");
  ok('une personne membre de deux organisations, sans seconde identité');
  await rejects('groupe d\'une autre organisation', "INSERT INTO organization_group_members (group_id, membership_id, organization_id) VALUES ('og_g2', 'og_mm', 'og_o')");
  await rejects('membre d\'une autre organisation dans un groupe', "INSERT INTO organization_group_members (group_id, membership_id, organization_id) VALUES ('og_g', 'og_m2', 'og_o')");
  await rejects('deux groupes actifs du même nom', "INSERT INTO organization_groups (id, organization_id, name) VALUES ('og_x', 'og_o', ' structure ')");
  await rejects('version de gabarit modifiée', "UPDATE organization_template_versions SET note = 'x' WHERE id = 'og_tv1'", 'organization_template_version_immutable');
  await rejects('deux versions du même numéro', `INSERT INTO organization_template_versions (id, template_id, version, content) VALUES ('og_x', 'og_t', 1, '{"entries":[]}')`);
  await rejects('version sans lignes', "INSERT INTO organization_template_versions (id, template_id, version, content) VALUES ('og_x', 'og_t', 2, '{}')");
  await client.query("INSERT INTO projects (id, owner_id, code, name) VALUES ('og_p2', 'og_owner', 'OG2', 'Autre')");
  await client.query("INSERT INTO project_participations (id, project_id, organization_id, status) VALUES ('og_pp2', 'og_p2', 'og_o2', 'active')");
  await rejects('mandat sur la participation d\'une autre organisation', "INSERT INTO organization_mandates (id, organization_id, project_id, participation_id, membership_id) VALUES ('og_x', 'og_o', 'og_p2', 'og_pp2', 'og_ma')", 'organization_mandate_participation_mismatch');
  await rejects('deux mandats actifs dans le même projet', "INSERT INTO organization_mandates (id, organization_id, project_id, participation_id, membership_id, status) VALUES ('og_x', 'og_o', 'og_p', 'og_pp', 'og_ma', 'actif')");
  await rejects('mandat terminé sans date', "UPDATE organization_mandates SET status = 'termine' WHERE id = 'og_md1'");
  await rejects('responsabilité de mandat inconnue', "INSERT INTO organization_mandates (id, organization_id, project_id, participation_id, membership_id, responsibilities) VALUES ('og_x', 'og_o', 'og_p', 'og_pp', 'og_ma', '{commander}')");
  await rejects('invitation d\'adhésion sans organisation', "INSERT INTO auth.invitations (id, purpose, email, token_hash, organization_role, invited_by, expires_at) VALUES ('og_x', 'organization_membership', 'y@invalid', 'h_x', 'membre', 'og_a', now())");
  await rejects('invitation d\'adhésion au rôle inconnu', "INSERT INTO auth.invitations (id, purpose, email, token_hash, organization_id, organization_role, invited_by, expires_at) VALUES ('og_x', 'organization_membership', 'y@invalid', 'h_x', 'og_o', 'chef', 'og_a', now())");
  await rejects('organisation sur une invitation de projet', "INSERT INTO auth.invitations (id, purpose, email, token_hash, project_id, project_role, organization_id, organization_role, invited_by, expires_at) VALUES ('og_x', 'project_participation', 'y@invalid', 'h_x', 'og_p', 'lecteur', 'og_o', 'membre', 'og_owner', now())");
  await rejects('finalité inconnue', "INSERT INTO auth.invitations (id, purpose, email, token_hash, invited_by, expires_at) VALUES ('og_x', 'inconnue', 'y@invalid', 'h_x', 'og_a', now())");
  await client.query(`INSERT INTO auth.invitations (id, purpose, email, token_hash, organization_id, organization_role, invited_by, expires_at) VALUES
    ('og_i1', 'organization_membership', 'z@invalid', 'h_i1', 'og_o', 'membre', 'og_a', now() + interval '1 day'),
    ('og_i2', 'organization_membership', 'z@invalid', 'h_i2', 'og_o2', 'membre', 'og_b', now() + interval '1 day')`);
  ok('une même adresse invitée par deux organisations');
  await rejects('deux invitations en attente pour la même organisation', "INSERT INTO auth.invitations (id, purpose, email, token_hash, organization_id, organization_role, invited_by, expires_at) VALUES ('og_x', 'organization_membership', 'z@invalid', 'h_x', 'og_o', 'administrateur', 'og_a', now() + interval '1 day')");
  await rejects('partie propriétaire inconnue', "UPDATE projects SET organization_id = 'og_inconnue' WHERE id = 'og_p'");
  await client.query('ROLLBACK');

  // 3 et 4. Déclencheurs, aucun droit de projet.
  await client.query('BEGIN');
  await seed();
  const rights0 = await one("SELECT (SELECT count(*) FROM project_members)::int AS pm, (SELECT count(*) FROM project_participations WHERE person_id IS NOT NULL AND project_id = 'og_p')::int AS pp");
  check(rights0.pm === 0 && rights0.pp === 1, 'adhésions, groupes et mandats : aucun membre de projet, seule la participation du propriétaire', rights0);
  await client.query("INSERT INTO project_participations (id, project_id, person_id, represented_organization_id, status) VALUES ('og_rep', 'og_p', 'og_pm', 'og_o', 'contact')");
  await client.query("UPDATE organization_memberships SET status = 'terminee', ends_on = current_date, end_reason = 'depart' WHERE id = 'og_mm'");
  const dep = await one(`SELECT (SELECT count(*) FROM organization_group_members WHERE membership_id = 'og_mm')::int AS g,
    (SELECT status || ':' || end_reason FROM organization_mandates WHERE id = 'og_md1') AS md,
    (SELECT status FROM project_participations WHERE id = 'og_rep') AS rep`);
  check(dep.g === 0 && dep.md === 'termine:depart' && dep.rep === 'contact', 'départ : groupes retirés, mandat terminé, participation de projet intacte', dep);
  await rejects('adhésion terminée ajoutée à un groupe', "INSERT INTO organization_group_members (group_id, membership_id, organization_id) VALUES ('og_g', 'og_mm', 'og_o')", 'organization_group_member_ended');
  await client.query("UPDATE organization_memberships SET status = 'terminee', ends_on = current_date WHERE id = 'og_mb'");
  check((await one("SELECT status FROM organization_mandates WHERE id = 'og_md2'")).status === 'annule', 'départ : mandat proposé annulé');
  await client.query("INSERT INTO organization_memberships (id, organization_id, person_id, role) VALUES ('og_mm2', 'og_o', 'og_pm', 'membre')");
  ok('retour : nouvelle adhésion, nouvelle période (l\'ancienne reste terminée)');
  await client.query(`INSERT INTO organization_mandates (id, organization_id, project_id, participation_id, membership_id, status) VALUES ('og_md3', 'og_o', 'og_p', 'og_pp', 'og_mm2', 'actif')`);
  await client.query("UPDATE projects SET organization_id = 'og_o' WHERE id = 'og_p'");
  await client.query("UPDATE organizations SET status = 'close' WHERE id = 'og_o'");
  const closed = await one(`SELECT (SELECT count(*) FROM organization_memberships WHERE organization_id = 'og_o' AND status <> 'terminee')::int AS open,
    (SELECT string_agg(DISTINCT end_reason, ',') FROM organization_memberships WHERE id IN ('og_ma', 'og_mm2')) AS reasons,
    (SELECT status || ':' || end_reason FROM organization_mandates WHERE id = 'og_md3') AS md,
    (SELECT organization_id FROM projects WHERE id = 'og_p') AS owner_org,
    (SELECT count(*) FROM project_participations WHERE project_id = 'og_p')::int AS pp`);
  check(closed.open === 0 && closed.reasons === 'cloture' && closed.md === 'termine:cloture', 'clôture : adhésions et mandats terminés', closed);
  check(closed.owner_org === 'og_o' && closed.pp === 3, 'clôture : participations et partie propriétaire conservées (décision de continuité explicite)', closed);
  await rejects('organisation close rouverte', "UPDATE organizations SET status = 'active' WHERE id = 'og_o'", 'organization_closed_final');
  const rights1 = await one("SELECT (SELECT count(*) FROM project_members)::int AS pm");
  check(rights1.pm === 0, 'aucun membre de projet créé par une adhésion, un groupe, un mandat ou une clôture', rights1);
  await client.query("DELETE FROM organizations WHERE id = 'og_o'");
  check((await one("SELECT organization_id FROM projects WHERE id = 'og_p'")).organization_id === null, 'suppression de l\'organisation : partie propriétaire remise à nul, projet conservé');
  await client.query('ROLLBACK');

  // 5. D-7.
  const roles = (await client.query("SELECT rolname FROM pg_roles WHERE rolname IN ('fadi_app', 'fadi_owner')")).rows.map((r) => r.rolname);
  if (roles.length === 2) {
    await client.query('BEGIN');
    await seed();
    await client.query('SET LOCAL ROLE fadi_app');
    try {
      await client.query("INSERT INTO organization_groups (id, organization_id, name) VALUES ('og_app', 'og_o', 'Écrit par fadi_app')");
      await client.query("INSERT INTO organization_group_members (group_id, membership_id, organization_id) VALUES ('og_app', 'og_ma', 'og_o')");
      await client.query("UPDATE organization_memberships SET job_title = 'Architecte' WHERE id = 'og_ma'");
      await client.query("INSERT INTO organization_template_versions (id, template_id, version, content) VALUES ('og_app_v', 'og_t', 2, '{\"entries\":[]}')");
      ok('fadi_app : écriture des tables de la phase 5');
    } catch (e) { ko('fadi_app : écriture refusée — ' + e.message); }
    await rejects('fadi_app : version de gabarit modifiée', "UPDATE organization_template_versions SET note = 'x' WHERE id = 'og_tv1'", 'organization_template_version_immutable');
    await rejects('fadi_app : ALTER TABLE des adhésions', 'ALTER TABLE organization_memberships ADD COLUMN intrus int');
    await rejects('fadi_app : DROP du déclencheur d\'immutabilité', 'DROP TRIGGER organization_template_versions_no_update ON organization_template_versions');
    await client.query('ROLLBACK');
  } else {
    console.log('… D-7 : rôles fadi_* absents, section 5 non exécutée');
  }
} catch (e) {
  ko('erreur inattendue : ' + e.message);
  await client.query('ROLLBACK').catch(() => {});
} finally {
  await client.end();
}
if (failures) { console.log(`❌ ${failures} contrôle(s) en échec`); process.exit(1); }
console.log('✅ schéma des organisations (phase 5) vérifié');
