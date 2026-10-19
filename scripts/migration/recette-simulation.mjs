#!/usr/bin/env node
/**
 * Recette de la simulation de migration (CI, tranche « complements ») sur une base NEUVE peuplée du jeu synthétique
 * (`jeu-synthetique.mjs`). Elle prouve que l'outil n'écrit rien et que son rapport dit ce qu'il doit dire :
 *
 * 1. garde : la base ne contient que des projets « SYNTH- » (jamais une base existante) ;
 * 2. un rôle `fadi_mig_lecteur` qui n'a que SELECT est créé ; l'outil tourne sous ce rôle ;
 * 3. empreinte de chaque table du schéma public (nombre de lignes + MD5 du contenu) avant et après : identiques ;
 * 4. écritures tentées : dans la session de l'outil (sous le rôle lecteur ET sous le rôle propriétaire, qui aurait le
 *    droit d'écrire) → refus 25006 (transaction en lecture seule) ; sous le rôle lecteur hors session → refus 42501 ;
 * 5. attendus du jeu synthétique : erreurs partielles nommées, non-convertibles conservés, correspondances,
 *    publications rompues, éléments en attente, une seule chaîne d'écriture, documents conformes au validateur Studio.
 *
 *   MIG_ADMIN_URL=postgresql://proprietaire@hote/fadi_mig MIG_BASE=fadi_mig MIG_SORTIE=rapport-migration \
 *     npx tsx scripts/migration/recette-simulation.mjs
 */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { ouvrirSessionLecture } from './lecture.mjs';
import { executer } from './simuler-migration.mjs';
import { OBJETS_P1, PROJETS } from './jeu-synthetique.mjs';

const ADMIN = process.env.MIG_ADMIN_URL;
const BASE = process.env.MIG_BASE;
const SORTIE = process.env.MIG_SORTIE ?? 'rapport-migration';
const ROLE = 'fadi_mig_lecteur';
if (!ADMIN || !BASE) { console.error('MIG_ADMIN_URL et MIG_BASE attendus'); process.exit(2); }

const verifs = [];
const ok = (texte) => { verifs.push(texte); console.log(`  ✓ ${texte}`); };

async function avecClient(url, f) {
  const c = new pg.Client({ connectionString: url, application_name: 'fadi-migration-recette' });
  await c.connect();
  try { return await f(c); } finally { await c.end(); }
}

/** Empreinte de chaque table du schéma public : lignes et MD5 du contenu trié. */
async function empreinte(c) {
  const tables = (await c.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename")).rows.map((r) => r.tablename);
  const out = {};
  for (const t of tables) {
    const r = (await c.query(`SELECT count(*)::int AS n, md5(coalesce(string_agg(x::text, E'\\n' ORDER BY x::text), '')) AS h FROM public."${t}" x`)).rows[0];
    out[t] = `${r.n}:${r.h}`;
  }
  return out;
}

const urlRole = (url, role, motDePasse) => { const u = new URL(url); u.username = role; u.password = motDePasse; return u.toString(); };

async function tenterEcriture(session) {
  try {
    await session.client.query("INSERT INTO projects (id, owner_id, code, name) VALUES ('mig-intrus', 'synth-u1', 'X', 'X')");
    return null;
  } catch (err) { return err.code; }
}

async function main() {
  console.log(`Recette de la simulation de migration sur ${BASE}`);
  const motDePasse = randomBytes(18).toString('hex');
  const avant = await avecClient(ADMIN, async (c) => {
    const base = (await c.query('SELECT current_database() AS nom')).rows[0].nom;
    assert.equal(base, BASE, 'MIG_ADMIN_URL doit viser MIG_BASE');
    const codes = (await c.query('SELECT code FROM projects ORDER BY code')).rows.map((r) => r.code);
    assert.ok(codes.length > 0 && codes.every((x) => x.startsWith('SYNTH-')), `base non synthétique : ${codes.join(', ')}`);
    ok(`base neuve peuplée du jeu synthétique déclaré (${codes.join(', ')})`);
    await c.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${ROLE}') THEN CREATE ROLE ${ROLE} LOGIN; END IF; END $$`);
    await c.query(`ALTER ROLE ${ROLE} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '${motDePasse}'`);
    await c.query(`GRANT CONNECT ON DATABASE "${BASE}" TO ${ROLE}`);
    await c.query(`GRANT USAGE ON SCHEMA public TO ${ROLE}`);
    await c.query(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${ROLE}`);
    const droits = (await c.query(`SELECT DISTINCT privilege_type FROM information_schema.role_table_grants WHERE grantee = '${ROLE}' ORDER BY 1`)).rows.map((r) => r.privilege_type);
    assert.deepEqual(droits, ['SELECT']);
    ok(`rôle ${ROLE} : SELECT seulement`);
    return empreinte(c);
  });
  const LECTEUR = urlRole(ADMIN, ROLE, motDePasse);

  // Écritures tentées (aucune ne doit passer).
  for (const [nom, url] of [['rôle lecteur', LECTEUR], ['rôle propriétaire', ADMIN]]) {
    const s = await ouvrirSessionLecture({ connectionString: url, copieDeclaree: BASE });
    try {
      assert.equal(await tenterEcriture(s), '25006', `session de l'outil (${nom}) : écriture non refusée`);
      await s.client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      assert.equal(await tenterEcriture(s), '25006');
      await s.client.query('ROLLBACK');
    } finally { await s.fermer(); }
    ok(`session de l'outil sous le ${nom} : écriture refusée (25006, transaction en lecture seule)`);
  }
  await avecClient(LECTEUR, async (c) => {
    const code = await tenterEcriture({ client: c });
    assert.equal(code, '42501', 'rôle lecteur hors session : écriture non refusée');
  });
  ok('rôle lecteur hors session de l\'outil : écriture refusée (42501, droit absent)');
  await assert.rejects(ouvrirSessionLecture({ connectionString: LECTEUR, copieDeclaree: `${BASE}_autre` }), /n'est pas la copie déclarée/);
  ok('copie déclarée différente de la base connectée : lecture refusée');

  // Simulations : sans hypothèse (défaut conservateur), puis sous les deux hypothèses déclarées.
  const env = { ...process.env, DATABASE_URL: LECTEUR };
  const fichierLocal = path.join(SORTIE, 'file-locale.json');
  const filesLocales = fs.existsSync(fichierLocal) ? ['--file-locale', fichierLocal] : [];
  const defaut = await executer(['--copie', BASE, '--sortie', path.join(SORTIE, 'sans-hypothese'), '--valider-studio', ...filesLocales], env);
  const r = await executer(['--copie', BASE, '--sortie', path.join(SORTIE, 'hypotheses-declarees'), '--valider-studio', '--hypothese', 'repere-local-identite', '--hypothese', 'base-elevation-niveau', ...filesLocales], env);

  const apres = await avecClient(ADMIN, empreinte);
  assert.deepEqual(apres, avant);
  ok(`aucune table modifiée : ${Object.keys(avant).length} tables, empreintes identiques avant et après`);

  // Attendus — sans hypothèse : rien de géométrique n'est converti.
  assert.equal(defaut.correspondances.filter((c) => c.ancienne.startsWith('atelier_objets')).length, 0);
  assert.equal(defaut.documentsSimules.length, 0);
  assert.ok(defaut.ambiguites.some((a) => a.element === `atelier_objets:${PROJETS.P1}/l1` && a.hypothesesManquantes.includes('repere-local-identite')));
  ok('sans hypothèse déclarée : géométrie ambiguë, hypothèse manquante nommée, aucun document simulé');

  // MIG-01 à 04 : recensement.
  const p1 = r.projets.find((p) => p.id === PROJETS.P1);
  assert.equal(p1.inventaire['MIG-01'].objets, OBJETS_P1.length);
  assert.equal(p1.inventaire['MIG-01'].niveaux.length, 2);
  assert.ok(p1.inventaire['MIG-01'].unites.m > 0 && p1.inventaire['MIG-01'].unites.deg >= 2);
  assert.deepEqual([p1.inventaire['MIG-01'].unitesNonReconnues, p1.inventaire['MIG-01'].reperesNonLocaux], [[], []]);
  assert.equal(p1.inventaire['MIG-01'].formesDessin.ligne, 5);
  assert.deepEqual(p1.inventaire['MIG-02'].associations, { 'heberge-par': 3, 'joint-a': 1, reference: 1 });
  assert.equal(p1.inventaire['MIG-02'].cotes, 1);
  assert.deepEqual(p1.inventaire['MIG-03'].historique.contrats, ['atelier-commands/2', 'atelier-commands/3']);
  assert.deepEqual(p1.inventaire['MIG-03'].commandesHorsLigne.serveur, { enAttente: 1, traitees: 1 });
  assert.deepEqual(p1.inventaire['MIG-04'].publications, { atelier: 2, studio: 0 });
  assert.equal(p1.inventaire['MIG-04'].referencesExternes, 1);
  ok('MIG-01 à MIG-04 : objets, formes, unités, niveaux, associations, cotes, composants, historique, en attente, références, publications');

  // MIG-05 : classement attendu élément par élément.
  const statut = (id) => p1.elements.find((e) => e.ancienne === `atelier_objets:${PROJETS.P1}/${id}`)?.statut;
  const attendus = {
    convertible: ['l1', 'pl1', 'pg1', 'c1', 'a1', 'r1', 'm1', 'm4', 'f1', 'l2'],
    ambigu: ['r2', 't1', 'k1', 'm3', 'd1', 'o1', 'x1', 'bad1', 'deg1', 'sn1'],
    'non-convertible': ['s1', 'e1', 'h1', 'm2', 'dl1', 'po1', 'bo1', 'pm1'],
  };
  for (const [s, ids] of Object.entries(attendus)) for (const id of ids) assert.equal(statut(id), s, `${id} : ${statut(id)} au lieu de ${s}`);
  assert.equal(Object.values(attendus).flat().length, OBJETS_P1.length, 'chaque objet du jeu a son attendu');
  ok(`MIG-05 : ${OBJETS_P1.length} objets classés comme attendu (règles sourcées ou non évaluées)`);

  // MIG-07 : une correspondance par transformation.
  const convertis = r.projets.flatMap((p) => p.elements).filter((e) => e.statut === 'convertible');
  assert.equal(r.correspondances.length, convertis.length);
  for (const e of convertis) assert.ok(r.correspondances.some((c) => c.ancienne === e.ancienne && c.nouvelle && c.filiation?.regle === e.regle), e.ancienne);
  ok(`MIG-07 : ${r.correspondances.length} correspondances ancienne → nouvelle identité avec filiation`);

  // MIG-08/09/10.
  assert.deepEqual(r.erreursPartielles.map((e) => `${e.element.split('/').pop()}:${e.code}`).sort(), ['bad1:parametres-illisibles', 'deg1:refus-validateur-studio', 'x1:classe-inconnue']);
  assert.equal(r.synthese.parProjet.find((p) => p.projet === PROJETS.P1).erreurs, 3);
  for (const id of attendus['non-convertible']) assert.match(r.nonConvertibles.find((n) => n.element === `atelier_objets:${PROJETS.P1}/${id}`).traitement, /jamais supprimé/);
  assert.ok(r.pertes.some((p) => p.element.endsWith('/l1') && /groupe/.test(p.perte)));
  assert.ok(r.pertes.some((p) => p.element.endsWith('/l2') && /propriétés/.test(p.perte)));
  const md = fs.readFileSync(path.join(SORTIE, 'hypotheses-declarees', 'simulation-migration.md'), 'utf8');
  for (const e of r.erreursPartielles) assert.ok(md.includes(e.element));
  ok('MIG-08/09/10 : pertes et ambiguïtés listées, non-convertibles conservés, 3 erreurs partielles rattachées et comptées par projet');

  // Contrôles prévus.
  const pubs = r.controles['MIG-COEX-03'];
  assert.equal(pubs.find((p) => p.publication === 'synth-pub-ok').etat, 'lien intact');
  assert.deepEqual(pubs.find((p) => p.publication === 'synth-pub-rompue').pieces.map((x) => x.etat), ['lien intact', 'pièce absente', 'empreinte divergente']);
  ok('MIG-COEX-03 : publication intacte et publication rompue (pièce absente, empreinte divergente) distinguées');
  assert.deepEqual(r.controles['MIG-COEX-04'].basculeBloquee, filesLocales.length ? [PROJETS.P1, PROJETS.P2] : [PROJETS.P1]);
  ok('MIG-COEX-04 : évènement en attente et brouillon local bloquent la bascule, rien n\'est supprimé');
  for (const c of r.controles['MIG-COEX-06']) assert.ok(c.ecrivains.length <= 1 && c.refus.length === 0, c.projet);
  assert.match(r.controles['MIG-COEX-06'].find((c) => c.projet === PROJETS.P2).verdict, /bascule bloquée/);
  ok('MIG-COEX-06 : jamais deux chaînes d\'écriture sur une étude ; propriété non décidée → bascule bloquée, consultation conservée');
  for (const d of r.documentsSimules) assert.equal(d.conformite, 'conforme (validateStudioDocument)');
  ok(`${r.documentsSimules.length} documents Studio simulés conformes à validateStudioDocument`);

  fs.writeFileSync(path.join(SORTIE, 'recette.txt'), `${verifs.join('\n')}\n`);
  console.log(`Recette réussie : ${verifs.length} vérifications ; rapports dans ${SORTIE}/`);
}

main().catch((err) => { console.error(`recette en échec : ${err.stack ?? err.message}`); process.exit(1); });
