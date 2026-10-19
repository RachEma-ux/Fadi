#!/usr/bin/env node
/**
 * Outil de comparaison avant / après restauration des données Studio (R.1-03). Lit les tables Studio d'un projet dans
 * la base A et dans la base B (même identifiant après `pg_restore`, identifiant différent après import de l'archive
 * JSON), les compare ligne à ligne (identifiants, contenus, empreintes, effectifs), contrôle l'intégrité de chaque côté
 * (empreintes de documents, de paquets et de volumes, chaîne des révisions), vérifie dans B la présence des
 * déclencheurs d'immuabilité et, par une sonde annulée, qu'une UPDATE de révision y est toujours refusée. Écrit un
 * rapport Markdown (et JSON) ; code de sortie 0 seulement sans aucune anomalie.
 *
 * Usage :
 *   node scripts/validation/studio-compare-restore.mjs --a <url A> --b <url B> --project-a <id> [--project-b <id>]
 *        [--out rapport.md] [--json rapport.json] [--commit <sha>] [--no-probe]
 *   node scripts/validation/studio-compare-restore.mjs --a <url A> --b <url B> --all   (tous les projets Studio de A, même identifiant dans B)
 * Lecture seule, sauf la sonde : UPDATE tentée dans une transaction toujours annulée (ROLLBACK).
 */
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import pg from 'pg';
import { IMMUTABILITY_TRIGGERS, TABLES, compareTables, integrityAnomalies, normalizeTables, renderReport } from './studio-compare-lib.mjs';

function args(argv) {
  const out = { probe: true };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--all') out.all = true;
    else if (a === '--no-probe') out.probe = false;
    else if (a.startsWith('--')) { out[a.slice(2)] = argv[i + 1]; i += 1; }
  }
  return out;
}

const SELECTS = {
  studio_studies: 'SELECT to_jsonb(t) AS row FROM studio_studies t WHERE project_id = $1',
  studio_variants: 'SELECT to_jsonb(t) AS row FROM studio_variants t WHERE study_id IN (SELECT id FROM studio_studies WHERE project_id = $1)',
  studio_revisions: 'SELECT to_jsonb(t) AS row FROM studio_revisions t WHERE variant_id IN (SELECT v.id FROM studio_variants v JOIN studio_studies s ON s.id = v.study_id WHERE s.project_id = $1)',
  studio_comments: 'SELECT to_jsonb(t) AS row FROM studio_comments t WHERE variant_id IN (SELECT v.id FROM studio_variants v JOIN studio_studies s ON s.id = v.study_id WHERE s.project_id = $1)',
  studio_observations: 'SELECT to_jsonb(t) AS row FROM studio_observations t WHERE variant_id IN (SELECT v.id FROM studio_variants v JOIN studio_studies s ON s.id = v.study_id WHERE s.project_id = $1)',
  studio_observation_events: 'SELECT to_jsonb(t) AS row FROM studio_observation_events t WHERE observation_id IN (SELECT o.comment_id FROM studio_observations o JOIN studio_variants v ON v.id = o.variant_id JOIN studio_studies s ON s.id = v.study_id WHERE s.project_id = $1)',
  studio_observation_links: 'SELECT to_jsonb(t) AS row FROM studio_observation_links t WHERE observation_id IN (SELECT o.comment_id FROM studio_observations o JOIN studio_variants v ON v.id = o.variant_id JOIN studio_studies s ON s.id = v.study_id WHERE s.project_id = $1)',
  studio_observation_tasks: 'SELECT to_jsonb(t) AS row FROM studio_observation_tasks t WHERE observation_id IN (SELECT o.comment_id FROM studio_observations o JOIN studio_variants v ON v.id = o.variant_id JOIN studio_studies s ON s.id = v.study_id WHERE s.project_id = $1)',
  studio_observation_task_events: 'SELECT to_jsonb(t) AS row FROM studio_observation_task_events t WHERE task_id IN (SELECT ta.id FROM studio_observation_tasks ta WHERE ta.observation_id IN (SELECT o.comment_id FROM studio_observations o JOIN studio_variants v ON v.id = o.variant_id JOIN studio_studies s ON s.id = v.study_id WHERE s.project_id = $1))',
  studio_observation_decisions: 'SELECT to_jsonb(t) AS row FROM studio_observation_decisions t WHERE observation_id IN (SELECT o.comment_id FROM studio_observations o JOIN studio_variants v ON v.id = o.variant_id JOIN studio_studies s ON s.id = v.study_id WHERE s.project_id = $1)',
  studio_study_steps: 'SELECT to_jsonb(t) AS row FROM studio_study_steps t WHERE study_id IN (SELECT id FROM studio_studies WHERE project_id = $1)',
  studio_requirement_sets: 'SELECT to_jsonb(t) AS row FROM studio_requirement_sets t WHERE study_id IN (SELECT id FROM studio_studies WHERE project_id = $1)',
  studio_requirement_checks: 'SELECT to_jsonb(t) AS row FROM studio_requirement_checks t WHERE study_id IN (SELECT id FROM studio_studies WHERE project_id = $1)',
  studio_quantity_adjustments: 'SELECT to_jsonb(t) AS row FROM studio_quantity_adjustments t WHERE study_id IN (SELECT id FROM studio_studies WHERE project_id = $1)',
  studio_publications: 'SELECT to_jsonb(t) AS row FROM studio_publications t WHERE project_id = $1',
  studio_publication_events: 'SELECT to_jsonb(t) AS row FROM studio_publication_events t WHERE publication_id IN (SELECT id FROM studio_publications WHERE project_id = $1)',
  volumes: "SELECT to_jsonb(t) AS row FROM volumes t WHERE id IN (SELECT f->>'sha256' FROM studio_publications p, jsonb_array_elements(coalesce(p.package->'files', '[]'::jsonb)) f WHERE p.project_id = $1)",
  project_members: 'SELECT to_jsonb(t) AS row FROM project_members t WHERE project_id = $1',
  studio_tool_preferences: 'SELECT to_jsonb(t) AS row FROM studio_tool_preferences t WHERE user_id IN (SELECT owner_id FROM projects WHERE id = $1 UNION SELECT user_id FROM project_members WHERE project_id = $1)',
};

/** Données Studio d'un projet et adresses des comptes cités. */
export async function dumpStudio(client, projectId) {
  const tables = {};
  for (const t of TABLES) tables[t] = (await client.query(SELECTS[t], [projectId])).rows.map((r) => r.row);
  const users = await client.query('SELECT id, email FROM users');
  const project = (await client.query('SELECT id, owner_id FROM projects WHERE id = $1', [projectId])).rows[0] ?? null;
  return { tables, emails: new Map(users.rows.map((u) => [u.id, u.email])), project };
}

async function triggersOf(client) {
  const rows = (await client.query("SELECT c.relname AS table, t.tgname AS trigger, t.tgenabled AS enabled FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid WHERE NOT t.tgisinternal")).rows;
  return IMMUTABILITY_TRIGGERS.map((x) => ({ ...x, present: rows.some((r) => r.table === x.table && r.trigger === x.trigger && r.enabled !== 'D') }));
}

/** UPDATE d'une révision du projet dans une transaction annulée : doit être refusée par `studio_revision_immutable`. */
async function probeImmutability(client, revisionId) {
  if (!revisionId) return { refused: false, message: 'aucune révision à sonder' };
  await client.query('BEGIN');
  try {
    await client.query('UPDATE studio_revisions SET request_id = request_id WHERE id = $1', [revisionId]);
    return { refused: false, message: 'UPDATE acceptée' };
  } catch (error) {
    return { refused: /studio_revision_immutable/.test(String(error.message)), message: String(error.message) };
  } finally {
    await client.query('ROLLBACK');
  }
}

export async function compareProject({ a, b, projectA, projectB = projectA, probe = true }) {
  const da = await dumpStudio(a, projectA);
  const db = await dumpStudio(b, projectB);
  const na = normalizeTables(da.tables, { projectId: projectA, emails: da.emails });
  const nb = normalizeTables(db.tables, { projectId: projectB, emails: db.emails });
  const { anomalies, summary } = compareTables(na, nb);
  if (!da.project) anomalies.push({ table: 'projects', key: projectA, kind: 'manquante', detail: 'projet absent de la base A' });
  if (!db.project) anomalies.push({ table: 'projects', key: projectB, kind: 'manquante', detail: 'projet absent de la base B' });
  else if (da.project && (da.emails.get(da.project.owner_id) ?? '').toLowerCase() !== (db.emails.get(db.project.owner_id) ?? '').toLowerCase()) {
    anomalies.push({ table: 'projects', key: projectB, kind: 'differente', detail: 'propriétaire différent' });
  }
  anomalies.push(...integrityAnomalies(da.tables, 'A'), ...integrityAnomalies(db.tables, 'B'));
  const triggers = await triggersOf(b);
  for (const t of triggers) if (!t.present) anomalies.push({ table: t.table, key: t.trigger, kind: 'immuabilite', detail: 'déclencheur absent ou désactivé dans B' });
  let probeResult = null;
  if (probe && db.tables.studio_revisions.length) {
    probeResult = await probeImmutability(b, db.tables.studio_revisions[0].id);
    if (!probeResult.refused) anomalies.push({ table: 'studio_revisions', key: db.tables.studio_revisions[0].id, kind: 'immuabilite', detail: probeResult.message });
  }
  return { summary, anomalies, triggers, probe: probeResult };
}

const label = (url) => { try { const u = new URL(url); return `${u.hostname}:${u.port || 5432}/${u.pathname.slice(1)}`; } catch { return 'base'; } };

async function main() {
  const o = args(process.argv.slice(2));
  if (!o.a || !o.b || (!o['project-a'] && !o.all)) {
    console.error('usage : studio-compare-restore.mjs --a <url A> --b <url B> (--project-a <id> [--project-b <id>] | --all) [--out rapport.md] [--json rapport.json]');
    process.exit(2);
  }
  const a = new pg.Client({ connectionString: o.a });
  const b = new pg.Client({ connectionString: o.b });
  await a.connect(); await b.connect();
  let commit = o.commit;
  if (!commit) { try { commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { commit = 'inconnu'; } }
  const pairs = o.all
    ? (await a.query('SELECT DISTINCT project_id AS id FROM studio_studies UNION SELECT DISTINCT project_id FROM studio_publications ORDER BY 1')).rows.map((r) => [r.id, r.id])
    : [[o['project-a'], o['project-b'] ?? o['project-a']]];
  const reports = [];
  let total = 0;
  try {
    for (const [pa, pb] of pairs) {
      const r = await compareProject({ a, b, projectA: pa, projectB: pb, probe: o.probe });
      total += r.anomalies.length;
      reports.push({ projectA: pa, projectB: pb, ...r });
      console.log(`${r.anomalies.length ? '✗' : '✓'} Studio ${pa} → ${pb} : ${r.summary.reduce((n, s) => n + s.countA, 0)} ligne(s), ${r.anomalies.length} anomalie(s)`);
      for (const x of r.anomalies.slice(0, 20)) console.log(`   [${x.kind}] ${x.table} ${x.key} : ${x.detail}`);
    }
  } finally {
    await a.end(); await b.end();
  }
  const date = new Date().toISOString();
  const md = reports.map((r) => renderReport({ date, commit, a: { label: label(o.a), projectId: r.projectA }, b: { label: label(o.b), projectId: r.projectB }, summary: r.summary, anomalies: r.anomalies, triggers: r.triggers, probe: r.probe })).join('\n---\n\n');
  if (o.out) fs.writeFileSync(o.out, md || '# Comparaison Studio\n\nAucun projet Studio dans la base A.\n');
  if (o.json) fs.writeFileSync(o.json, JSON.stringify({ date, commit, projects: reports.length, anomalies: total, reports }, null, 2));
  console.log(`${total ? '❌' : '✅'} comparaison Studio : ${reports.length} projet(s), ${total} anomalie(s)`);
  process.exit(total ? 1 : 0);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
