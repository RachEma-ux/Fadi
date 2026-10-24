/**
 * Organisations, participation et revue externe — phase 4 (revue externe, Issue #262) : contrôle du schéma sur une base
 * réelle jetable (CI `validate`, après `db:migrate` et les contrôles des phases 1 et 5).
 *
 *   DATABASE_URL=… node scripts/validation/revues-migration-check.mjs
 *
 * 1. idempotence : init.sql rejoué deux fois ne crée ni ne perd rien (paquets, affectations, constats, notes,
 *    invitations), contraintes et index d'invitation inchangés ; le bloc unique des finalités admet les quatre finalités
 *    (`platform_account`, `project_participation`, `organization_membership`, `review_package`) ;
 * 2. contraintes : paquet partagé sans copie figée refusé, statut inconnu, version en double, une seule remplaçante ;
 *    affectation (responsabilité, permission de consulter, résultat réservé à une relecture terminée, révocation =
 *    annulation) ; invitation `review_package` exige son affectation (et elle seule) ; deux paquets peuvent inviter la
 *    même adresse ; audience `revue` exige son paquet (et lui seul) ;
 * 3. déclencheurs : paquet partagé figé (manifeste, fichiers, révision), transitions interdites (retour au brouillon),
 *    suppression d'un paquet partagé refusée, suppression d'un brouillon admise, constat immuable ;
 * 4. aucun droit de projet : une participation « revue seule » (sans rôle de projet) n'apparaît pas dans
 *    `project_effective_access` (si la vue existe) ;
 * 5. D-7 : `fadi_app` écrit les nouvelles tables, sans DDL, et ne contourne pas le gel d'un paquet partagé.
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
const H = (c) => c.repeat(64);
const FILES = JSON.stringify([{ format: 'svg', fileName: 'a.svg', mime: 'image/svg+xml', size: 3, sha256: H('a') }]);

/** Jeu de base : propriétaire, relecteur externe (contact puis compte), projet, étude Studio, publication, paquets. */
async function seed() {
  await client.query(`INSERT INTO users (id, email, password_hash) VALUES ('rv_owner', 'rv_owner@invalid', 'x'), ('rv_ext', 'rv_ext@invalid', 'x')`);
  await client.query("INSERT INTO projects (id, owner_id, code, name) VALUES ('rv_p', 'rv_owner', 'RV1', 'Projet revu')");
  await client.query('SET CONSTRAINTS ALL DEFERRED');
  await client.query("INSERT INTO studio_studies (id, project_id, name, initial_variant_id) VALUES ('rv_s', 'rv_p', 'Étude', 'rv_v')");
  await client.query("INSERT INTO studio_variants (id, study_id, name, head_revision_id) VALUES ('rv_v', 'rv_s', 'Variante', 'rv_r')");
  await client.query(`INSERT INTO studio_revisions (id, variant_id, document, request_id, payload_hash, source, author_id, response)
    VALUES ('rv_r', 'rv_v', '{"id":"d","frame":"local-2d","units":"m","objects":[],"schemaVersion":"studio-document/1"}', 'rq', '${H('b')}', 'study-initialization', 'rv_owner', '{}')`);
  await client.query(`INSERT INTO studio_publications (id, project_id, study_id, variant_id, revision_id, document_hash, title, created_by)
    VALUES ('rv_pub', 'rv_p', 'rv_s', 'rv_v', 'rv_r', '${H('c')}', 'Dossier', 'rv_owner')`);
  // Contraintes différées de Studio vérifiées maintenant : le rejeu d'init.sql ne peut pas toucher une table qui en attend.
  await client.query('SET CONSTRAINTS ALL IMMEDIATE');
  await client.query("INSERT INTO people (id, display_name, work_email) VALUES ('rv_per', 'Relecteur', 'rv_ext@invalid')");
  await client.query("INSERT INTO project_participations (id, project_id, person_id, status) VALUES ('rv_pp', 'rv_p', 'rv_per', 'contact')");
  const pkg = (id, status, version, extra = '') => `INSERT INTO review_packages (id, project_id, publication_id, study_id, variant_id, lineage_id, version, title, purpose,
    expected_response, coordinator_id, corrections_owner_id, created_by, status${status === 'brouillon' ? '' : ', revision_id, document_hash, manifest, manifest_hash, files, shared_at, shared_by'}${extra ? ', supersedes_package_id' : ''})
    VALUES ('${id}', 'rv_p', 'rv_pub', 'rv_s', 'rv_v', 'rv_k1', ${version}, 'Paquet', 'Objet', 'Réponse', 'rv_owner', 'rv_owner', 'rv_owner', '${status}'${status === 'brouillon' ? '' : `, 'rv_r', '${H('c')}', '{}', '${H('d')}', '${FILES}', now(), 'rv_owner'`}${extra ? `, '${extra}'` : ''})`;
  await client.query(pkg('rv_k1', 'partage', 1));
  await client.query(pkg('rv_k2', 'brouillon', 2, 'rv_k1'));
  await client.query(`INSERT INTO review_assignments (id, package_id, project_id, participation_id, person_id, responsibility, access_expires_at, created_by)
    VALUES ('rv_a1', 'rv_k1', 'rv_p', 'rv_pp', 'rv_per', 'relecture', now() + interval '30 days', 'rv_owner')`);
  await client.query(`INSERT INTO auth.invitations (id, purpose, email, token_hash, invited_by, expires_at, review_assignment_id)
    VALUES ('rv_inv', 'review_package', 'rv_ext@invalid', 'h_rv_inv', 'rv_owner', now() + interval '7 days', 'rv_a1')`);
  await client.query("INSERT INTO review_package_notes (id, package_id, author_id, body) VALUES ('rv_n', 'rv_k1', 'rv_owner', 'Note interne')");
  return pkg;
}
const counts = async () => one(`SELECT (SELECT count(*) FROM review_packages)::int AS p, (SELECT count(*) FROM review_assignments)::int AS a,
  (SELECT count(*) FROM review_findings)::int AS f, (SELECT count(*) FROM review_package_notes)::int AS n, (SELECT count(*) FROM auth.invitations)::int AS inv,
  (SELECT count(*) FROM studio_comments)::int AS c`);

try {
  // 1. Idempotence.
  await client.query('BEGIN');
  await seed();
  const defs = async () => one(`SELECT
      (SELECT string_agg(pg_get_constraintdef(oid), ' | ' ORDER BY conname) FROM pg_constraint WHERE conrelid = 'auth.invitations'::regclass) AS checks,
      (SELECT string_agg(pg_get_constraintdef(oid), ' | ' ORDER BY conname) FROM pg_constraint WHERE conrelid = 'studio_comments'::regclass) AS comments,
      (SELECT indexdef FROM pg_indexes WHERE schemaname = 'auth' AND indexname = 'invitations_pending_unique') AS idx`);
  const before = await counts(), defsBefore = await defs();
  await client.query(initSql);
  await client.query(initSql);
  const after = await counts(), defsAfter = await defs();
  check(JSON.stringify(before) === JSON.stringify(after), 'init.sql rejoué deux fois : aucune ligne créée ni perdue', { before, after });
  check(defsBefore.checks === defsAfter.checks && defsBefore.idx === defsAfter.idx && defsBefore.comments === defsAfter.comments, 'contraintes et index (invitations, commentaires Studio) inchangés au rejeu');
  check(/organization_id/.test(defsAfter.idx) && /review_assignment_id/.test(defsAfter.idx), 'index des invitations en attente : par organisation et par affectation de revue', defsAfter.idx);
  const purpose = (await one("SELECT pg_get_constraintdef(oid) AS d FROM pg_constraint WHERE conname = 'invitations_purpose_check'")).d;
  check(['platform_account', 'project_participation', 'organization_membership', 'review_package'].every((p) => purpose.includes(p)), 'bloc unique des finalités : les quatre finalités admises', purpose);
  await client.query('ROLLBACK');

  // 2. Contraintes.
  await client.query('BEGIN');
  const pkg = await seed();
  await rejects('paquet partagé sans copie figée', `INSERT INTO review_packages (id, project_id, publication_id, study_id, variant_id, lineage_id, version, title, purpose, expected_response, coordinator_id, corrections_owner_id, created_by, status)
    VALUES ('rv_x', 'rv_p', 'rv_pub', 'rv_s', 'rv_v', 'rv_x', 1, 'T', 'O', 'R', 'rv_owner', 'rv_owner', 'rv_owner', 'partage')`, 'review_packages_frozen_check');
  await rejects('statut de paquet inconnu', `INSERT INTO review_packages (id, project_id, publication_id, study_id, variant_id, lineage_id, version, title, purpose, expected_response, coordinator_id, corrections_owner_id, created_by, status)
    VALUES ('rv_x', 'rv_p', 'rv_pub', 'rv_s', 'rv_v', 'rv_x', 1, 'T', 'O', 'R', 'rv_owner', 'rv_owner', 'rv_owner', 'publie')`);
  await rejects('deux paquets de la même version dans une lignée', pkg('rv_x', 'brouillon', 1));
  await rejects('deux remplaçantes pour une même version', pkg('rv_x', 'brouillon', 3, 'rv_k1'));
  const assign = (id, values) => `INSERT INTO review_assignments (id, package_id, project_id, participation_id, person_id, responsibility, access_expires_at, created_by${values.cols ?? ''}) VALUES ('${id}', 'rv_k1', 'rv_p', 'rv_pp', 'rv_per', '${values.resp ?? 'approbation'}', now() + interval '1 day', 'rv_owner'${values.vals ?? ''})`;
  await rejects('responsabilité inconnue', assign('rv_x', { resp: 'diffusion' }));
  await rejects('affectation sans permission de consulter', assign('rv_x', { cols: ', can_view', vals: ', false' }), 'review_assignments_view_check');
  await rejects('résultat sur une approbation', assign('rv_x', { cols: ', status, result', vals: ", 'terminee', 'satisfaisante'" }), 'review_assignments_result_check');
  await rejects('résultat d\'une relecture encore attendue', assign('rv_x', { resp: 'relecture', cols: ', result', vals: ", 'constats'" }));
  await rejects('révocation sans annulation', "UPDATE review_assignments SET revoked_at = now(), revoked_by = 'rv_owner' WHERE id = 'rv_a1'", 'review_assignments_revoked_check');
  await rejects('deux affectations courantes de même responsabilité', assign('rv_x', { resp: 'relecture' }));
  await rejects('invitation de revue sans affectation', "INSERT INTO auth.invitations (id, purpose, email, token_hash, invited_by, expires_at) VALUES ('rv_x', 'review_package', 'y@invalid', 'h_x', 'rv_owner', now())", 'invitations_review_check');
  await rejects('affectation de revue sur une invitation de projet', "INSERT INTO auth.invitations (id, purpose, email, token_hash, project_id, project_role, invited_by, expires_at, review_assignment_id) VALUES ('rv_x', 'project_participation', 'y@invalid', 'h_x', 'rv_p', 'lecteur', 'rv_owner', now(), 'rv_a1')");
  await client.query(assign('rv_a2', {}));
  await client.query("INSERT INTO auth.invitations (id, purpose, email, token_hash, invited_by, expires_at, review_assignment_id) VALUES ('rv_inv2', 'review_package', 'rv_ext@invalid', 'h_rv_inv2', 'rv_owner', now() + interval '7 days', 'rv_a2')");
  ok('une même adresse invitée sur deux affectations (relecture et approbation)');
  await rejects('deux invitations en attente pour la même affectation', "INSERT INTO auth.invitations (id, purpose, email, token_hash, invited_by, expires_at, review_assignment_id) VALUES ('rv_x', 'review_package', 'rv_ext@invalid', 'h_x', 'rv_owner', now() + interval '7 days', 'rv_a1')");
  await rejects('fil « revue » sans paquet', "INSERT INTO studio_comments (id, variant_id, author_id, body, audience) VALUES ('rv_x', 'rv_v', 'rv_ext', 'x', 'revue')", 'studio_comments_review_check');
  await rejects('paquet sur un fil de l\'équipe', "INSERT INTO studio_comments (id, variant_id, author_id, body, audience, review_package_id) VALUES ('rv_x', 'rv_v', 'rv_ext', 'x', 'equipe', 'rv_k1')", 'studio_comments_review_check');
  await rejects('audience inconnue', "INSERT INTO studio_comments (id, variant_id, author_id, body, audience) VALUES ('rv_x', 'rv_v', 'rv_ext', 'x', 'public')");
  await client.query("INSERT INTO studio_comments (id, variant_id, revision_id, author_id, body, audience, review_package_id) VALUES ('rv_c', 'rv_v', 'rv_r', 'rv_ext', 'Constat', 'revue', 'rv_k1')");
  ok('constat : fil « revue » rattaché à son paquet');
  await client.query('ROLLBACK');

  // 3. Déclencheurs.
  await client.query('BEGIN');
  await seed();
  await rejects('paquet partagé : manifeste réécrit', `UPDATE review_packages SET manifest_hash = '${H('e')}' WHERE id = 'rv_k1'`, 'review_package_frozen');
  await rejects('paquet partagé : fichiers réécrits', "UPDATE review_packages SET files = '[]' WHERE id = 'rv_k1'", 'review_package_frozen');
  await rejects('paquet partagé : révision réécrite', "UPDATE review_packages SET revision_id = 'autre' WHERE id = 'rv_k1'", 'review_package_frozen');
  await rejects('paquet partagé : retour au brouillon', "UPDATE review_packages SET status = 'brouillon' WHERE id = 'rv_k1'", 'review_package_invalid_transition');
  await client.query("UPDATE review_packages SET due_on = '2099-01-01', updated_at = now() WHERE id = 'rv_k1'");
  ok('paquet partagé : échéance modifiable (réaffectation tracée par l\'API)');
  await rejects('suppression d\'un paquet partagé', "DELETE FROM review_packages WHERE id = 'rv_k1'", 'review_package_undeletable');
  await client.query("UPDATE review_packages SET title = 'Brouillon renommé' WHERE id = 'rv_k2'");
  await client.query("DELETE FROM review_packages WHERE id = 'rv_k2'");
  ok('brouillon : modifiable et supprimable');
  await client.query("INSERT INTO studio_comments (id, variant_id, revision_id, author_id, body, audience, review_package_id) VALUES ('rv_c', 'rv_v', 'rv_r', 'rv_ext', 'Constat', 'revue', 'rv_k1')");
  await client.query("INSERT INTO studio_observations (comment_id, variant_id, responsable_id, statut, created_by) VALUES ('rv_c', 'rv_v', 'rv_owner', 'ouverte', 'rv_ext')");
  await client.query(`INSERT INTO review_findings (observation_id, package_id, assignment_id, revision_id, document_format, document_digest) VALUES ('rv_c', 'rv_k1', 'rv_a1', 'rv_r', 'svg', '${H('a')}')`);
  await rejects('constat : rattachement réécrit', "UPDATE review_findings SET revision_id = 'autre' WHERE observation_id = 'rv_c'", 'review_finding_immutable');
  await rejects('constat : document sans empreinte', "INSERT INTO review_findings (observation_id, package_id, revision_id, document_format) VALUES ('rv_c', 'rv_k1', 'rv_r', 'pdf')");
  await client.query("UPDATE review_packages SET status = 'clos', closed_at = now(), closed_by = 'rv_owner' WHERE id = 'rv_k1'");
  ok('partagé → clos');
  await client.query("DELETE FROM projects WHERE id = 'rv_p'");
  ok('suppression du projet (refusée en amont par la route) : la cascade n\'est pas bloquée par le déclencheur');
  await client.query('ROLLBACK');

  // 4. Aucun droit de projet.
  const view = await one("SELECT to_regclass('public.project_effective_access') AS v");
  if (view.v) {
    await client.query('BEGIN');
    await seed();
    await client.query("UPDATE people SET user_id = 'rv_ext' WHERE id = 'rv_per'");
    await client.query("UPDATE project_participations SET status = 'active', starts_on = current_date WHERE id = 'rv_pp'");
    await client.query("UPDATE review_assignments SET user_id = 'rv_ext', accepted_at = now() WHERE id = 'rv_a1'");
    const access = await one("SELECT count(*)::int AS n FROM project_effective_access WHERE project_id = 'rv_p' AND user_id = 'rv_ext'");
    check(access.n === 0, 'participation « revue seule » active, sans rôle de projet : aucun accès au projet', access);
    await client.query('ROLLBACK');
  } else {
    console.log('… vue project_effective_access absente : section 4 non exécutée');
  }

  // 5. D-7.
  const roles = (await client.query("SELECT rolname FROM pg_roles WHERE rolname IN ('fadi_app', 'fadi_owner')")).rows.map((r) => r.rolname);
  if (roles.length === 2) {
    await client.query('BEGIN');
    await seed();
    await client.query('SET LOCAL ROLE fadi_app');
    try {
      await client.query("INSERT INTO review_package_notes (id, package_id, author_id, body) VALUES ('rv_app', 'rv_k1', 'rv_owner', 'Écrite par fadi_app')");
      await client.query("UPDATE review_assignments SET status = 'en-cours' WHERE id = 'rv_a1'");
      await client.query("UPDATE review_packages SET title = 'Renommé' WHERE id = 'rv_k2'");
      ok('fadi_app : écriture des tables de la phase 4');
    } catch (e) { ko('fadi_app : écriture refusée — ' + e.message); }
    await rejects('fadi_app : paquet partagé réécrit', "UPDATE review_packages SET files = '[]' WHERE id = 'rv_k1'", 'review_package_frozen');
    await rejects('fadi_app : ALTER TABLE des paquets', 'ALTER TABLE review_packages ADD COLUMN intrus int');
    await rejects('fadi_app : DROP du déclencheur de gel', 'DROP TRIGGER review_packages_guard ON review_packages');
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
console.log('✅ schéma de la revue externe (phase 4) vérifié');
