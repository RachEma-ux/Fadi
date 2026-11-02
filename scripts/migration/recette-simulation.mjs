#!/usr/bin/env node
/**
 * Recette de la simulation de migration (CI, tranche « organisations ») sur une base NEUVE peuplée du jeu synthétique
 * (`jeu-synthetique.mjs`). Elle prouve que l'outil n'écrit rien et que son rapport dit ce qu'il doit dire :
 *
 * 1. garde : la base ne contient que des projets « SYNTH- » (jamais une base existante) ;
 * 2. un rôle `fadi_mig_lecteur` (ou `MIG_ROLE`) est RECRÉÉ à neuf : supprimé s'il existe (DROP OWNED + DROP ROLE), créé
 *    NOLOGIN sans aucun attribut puis passé LOGIN ; pg_roles (ni SUPERUSER, BYPASSRLS, REPLICATION, CREATEROLE,
 *    CREATEDB) et pg_auth_members (aucune appartenance) sont vérifiés ; il n'a que SELECT ; l'outil tourne sous ce
 *    rôle ; il est révoqué et supprimé en fin de recette (`finally`), même en échec. Mot de passe : aléatoire, transmis
 *    au serveur sous forme de vérificateur SCRAM-SHA-256 calculé ici (`PASSWORD 'SCRAM-SHA-256$…'`) — le mot de passe
 *    en clair n'apparaît jamais dans une instruction SQL, donc jamais dans un journal (`log_statement`). L'URL
 *    d'administration doit avoir le droit CREATEROLE (en CI : le rôle propriétaire du service ; en local : postgres) ;
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
import { createHash, createHmac, pbkdf2Sync, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { geometrieMur, placerOuverture } from '../../packages/atelier-model/src/studio/architecture/geometrie.ts';
import { ouvrirSessionLecture } from './lecture.mjs';
import { executer } from './simuler-migration.mjs';
import { OBJETS_P1, PROJETS } from './jeu-synthetique.mjs';

const ADMIN = process.env.MIG_ADMIN_URL;
const BASE = process.env.MIG_BASE;
const SORTIE = process.env.MIG_SORTIE ?? 'rapport-migration';
const ROLE = process.env.MIG_ROLE ?? 'fadi_mig_lecteur';
if (!ADMIN || !BASE) { console.error('MIG_ADMIN_URL et MIG_BASE attendus'); process.exit(2); }
const R = pg.escapeIdentifier(ROLE);
const B = pg.escapeIdentifier(BASE);

/** Vérificateur SCRAM-SHA-256 (RFC 5802 / 7677, format PostgreSQL) : le serveur ne reçoit jamais le mot de passe. */
function verificateurScram(motDePasse, sel = randomBytes(16), iterations = 4096) {
  const sale = pbkdf2Sync(motDePasse.normalize('NFKC'), sel, iterations, 32, 'sha256');
  const cleClient = createHmac('sha256', sale).update('Client Key').digest();
  const cleStockee = createHash('sha256').update(cleClient).digest();
  const cleServeur = createHmac('sha256', sale).update('Server Key').digest();
  return `SCRAM-SHA-256$${iterations}:${sel.toString('base64')}$${cleStockee.toString('base64')}:${cleServeur.toString('base64')}`;
}

/** Retire le rôle lecteur de la base (droits, objets) puis le supprime ; rend vrai s'il existait. */
async function supprimerRole(c) {
  const existe = (await c.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [ROLE])).rowCount > 0;
  if (!existe) return false;
  await c.query(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${R}`);
  await c.query(`REVOKE ALL ON SCHEMA public FROM ${R}`);
  await c.query(`REVOKE ALL ON DATABASE ${B} FROM ${R}`);
  await c.query(`DROP OWNED BY ${R}`);
  try { await c.query(`DROP ROLE ${R}`); } catch (err) {
    throw new Error(`le rôle ${ROLE} ne peut pas être supprimé (${err.message}) : il a des droits dans une autre base ; choisir un autre MIG_ROLE ou le nettoyer`);
  }
  return true;
}

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
    const r = (await c.query(`SELECT count(*)::int AS n, md5(coalesce(string_agg(x::text, E'\\n' ORDER BY x::text), '')) AS h FROM public.${pg.escapeIdentifier(t)} x`)).rows[0];
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
    const ancien = await supprimerRole(c);
    await c.query(`CREATE ROLE ${R} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT`);
    await c.query(`ALTER ROLE ${R} LOGIN PASSWORD ${pg.escapeLiteral(verificateurScram(motDePasse))}`);
    const { oid, ...attributs } = (await c.query('SELECT oid, rolsuper, rolbypassrls, rolreplication, rolcreaterole, rolcreatedb, rolcanlogin FROM pg_roles WHERE rolname = $1', [ROLE])).rows[0];
    assert.deepEqual(attributs, { rolsuper: false, rolbypassrls: false, rolreplication: false, rolcreaterole: false, rolcreatedb: false, rolcanlogin: true }, `attributs du rôle ${ROLE}`);
    const appartenances = (await c.query('SELECT roleid::regrole::text AS role FROM pg_auth_members WHERE member = $1', [oid])).rows;
    assert.deepEqual(appartenances, [], `${ROLE} ne doit appartenir à aucun rôle`);
    await c.query(`GRANT CONNECT ON DATABASE ${B} TO ${R}`);
    await c.query(`GRANT USAGE ON SCHEMA public TO ${R}`);
    await c.query(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${R}`);
    const droits = (await c.query('SELECT DISTINCT privilege_type FROM information_schema.role_table_grants WHERE grantee = $1 ORDER BY 1', [ROLE])).rows.map((r) => r.privilege_type);
    assert.deepEqual(droits, ['SELECT']);
    ok(`rôle ${ROLE} recréé à neuf${ancien ? ' (ancien supprimé)' : ''} : aucun attribut, aucune appartenance, SELECT seulement, mot de passe transmis en vérificateur SCRAM`);
    return empreinte(c);
  });
  try {
    await recette(avant, motDePasse);
  } finally {
    await avecClient(ADMIN, supprimerRole).then(() => console.log(`  rôle ${ROLE} révoqué et supprimé`), (err) => console.error(`  rôle ${ROLE} : nettoyage en échec — ${err.message}`));
  }
}

async function recette(avant, motDePasse) {
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
  const urlPostgres = new URL(ADMIN); urlPostgres.pathname = '/postgres';
  await assert.rejects(ouvrirSessionLecture({ connectionString: urlPostgres.toString(), copieDeclaree: 'postgres' }), (e) => e.code === 'COPIE_NON_MARQUEE');
  ok('base sans marqueur de copie (nom sans _copie / _mig / _synth, aucun commentaire fadi-copie-migration) : lecture refusée');

  // Simulations : sans hypothèse (défaut conservateur), puis sous les deux hypothèses déclarées.
  const env = { ...process.env, DATABASE_URL: LECTEUR };
  const fichierLocal = path.join(SORTIE, 'file-locale.json');
  const filesLocales = fs.existsSync(fichierLocal) ? ['--file-locale', fichierLocal] : [];
  const defaut = await executer(['--copie', BASE, '--sortie', path.join(SORTIE, 'sans-hypothese'), '--valider-studio', ...filesLocales], env);
  const r = await executer(['--copie', BASE, '--sortie', path.join(SORTIE, 'hypotheses-declarees'), '--valider-studio', '--hypothese', 'repere-local-identite', '--hypothese', 'base-elevation-niveau', ...filesLocales], env);
  const fichierAbsent = path.join(SORTIE, 'file-locale-absente.json');
  const illisible = await executer(['--copie', BASE, '--sortie', path.join(SORTIE, 'file-illisible'), '--file-locale', fichierAbsent], env);

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
  assert.deepEqual(p1.inventaire['MIG-02'].associations, { 'heberge-par': 4, 'joint-a': 1, reference: 1 });
  assert.equal(p1.inventaire['MIG-02'].cotes, 1);
  assert.deepEqual(p1.inventaire['MIG-03'].historique.contrats, ['atelier-commands/2', 'atelier-commands/3']);
  assert.deepEqual(p1.inventaire['MIG-03'].commandesHorsLigne.serveur, { enAttente: 1, traitees: 1 });
  assert.deepEqual(p1.inventaire['MIG-04'].publications, { atelier: 2, studio: 0 });
  assert.equal(p1.inventaire['MIG-04'].referencesExternes, 1);
  ok('MIG-01 à MIG-04 : objets, formes, unités, niveaux, associations, cotes, composants, historique, en attente, références, publications');

  // MIG-05 : classement attendu élément par élément.
  const statut = (id) => p1.elements.find((e) => e.ancienne === `atelier_objets:${PROJETS.P1}/${id}`)?.statut;
  const attendus = {
    convertible: ['l1', 'pl1', 'pl2', 'pg1', 'c1', 'a1', 'r1', 'm1', 'm4', 'f1', 'l2'],
    ambigu: ['r2', 'a2', 't1', 'k1', 'm3', 'd1', 'o1', 'x1', 'bad1', 'deg1', 'sn1'],
    'non-convertible': ['s1', 'e1', 'h1', 'm2', 'dl1', 'po1', 'bo1', 'pm1'],
  };
  for (const [s, ids] of Object.entries(attendus)) for (const id of ids) assert.equal(statut(id), s, `${id} : ${statut(id)} au lieu de ${s}`);
  assert.equal(Object.values(attendus).flat().length, OBJETS_P1.length, 'chaque objet du jeu a son attendu');
  ok(`MIG-05 : ${OBJETS_P1.length} objets classés comme attendu (règles sourcées ou non évaluées)`);
  const regleDe = (ancienne) => p1.elements.find((e) => e.ancienne === ancienne)?.regle;
  assert.equal(regleDe(`atelier_objets:${PROJETS.P1}/a2`), 'R-ARC-AMBIGU');
  assert.equal(regleDe(`atelier_relations:${PROJETS.P1}/rel-f1`), 'R-HEBERGE');
  assert.equal(regleDe(`atelier_relations:${PROJETS.P1}/rel-x`), 'R-HEBERGE-INCOHERENT');
  const pl2 = r.correspondances.find((c) => c.ancienne === `atelier_objets:${PROJETS.P1}/pl2`);
  assert.ok(pl2.filiation.transformations.some((t) => /complétés par 1 zéro/.test(t)), 'renflements complétés : transformation déclarée');
  ok('M1/M2/M3 : arc à angles égaux ambigu, renflements complétés par des zéros déclarés, relation d\'hébergement incohérente ambiguë');

  // B1 : géométrie des ouvertures — l'intervalle [début, fin] de chaque baie le long de l'axe est le même dans les deux
  // modèles (Atelier : centre = paramètre × L, ± largeur / 2 ; Studio : placerOuverture sur la géométrie du mur).
  const parId = new Map(OBJETS_P1.map(([id, , , params]) => [id, params]));
  const versAtelier = (nouvelleId) => r.correspondances.find((c) => c.nouvelle.endsWith(`/${nouvelleId}`))?.ancienne.split('/').pop();
  let baies = 0;
  for (const d of r.documentsSimules) {
    for (const o of (d.document.architecture ?? []).filter((x) => x.type === 'opening')) {
      const w = d.document.architecture.find((x) => x.id === o.hostId);
      const g = geometrieMur(w);
      assert.ok(g.ok, `géométrie du mur ${w.id}`);
      const pl = placerOuverture(w, g.valeur, o);
      assert.ok(pl.ok, `ouverture ${o.id} : ${pl.raison}`);
      const src = parId.get(versAtelier(o.id)), mur = parId.get(versAtelier(w.id));
      const L = Math.hypot(mur.b.x - mur.a.x, mur.b.y - mur.a.y);
      const centre = src.position * L, demi = src.largeur.value / 2;
      const debut = pl.valeur.segment.debut + pl.valeur.s0, fin = pl.valeur.segment.debut + pl.valeur.s1;
      assert.ok(Math.abs(debut - (centre - demi)) < 1e-9 && Math.abs(fin - (centre + demi)) < 1e-9, `${o.id} : Studio [${debut}, ${fin}] ≠ Atelier [${centre - demi}, ${centre + demi}]`);
      baies++;
    }
  }
  assert.ok(baies >= 1, 'au moins une baie convertie');
  const f1 = r.documentsSimules.flatMap((d) => d.document.architecture ?? []).find((x) => x.type === 'opening' && versAtelier(x.id) === 'f1');
  assert.ok(Math.abs(f1.position - 1.9) < 1e-12, `f1 : position Studio ${f1.position} (attendu 0,5 × 5 − 1,2 / 2 = 1,9)`);
  ok(`B1 : ${baies} baie(s) — intervalle [début, fin] Studio (placerOuverture) identique à l'intervalle Atelier (centre ± largeur / 2)`);

  // MIG-07 : une correspondance par transformation.
  const convertis = r.projets.flatMap((p) => p.elements).filter((e) => e.statut === 'convertible');
  assert.equal(r.correspondances.length, convertis.length);
  for (const e of convertis) assert.ok(r.correspondances.some((c) => c.ancienne === e.ancienne && c.nouvelle && c.filiation?.regle === e.regle), e.ancienne);
  ok(`MIG-07 : ${r.correspondances.length} correspondances ancienne → nouvelle identité avec filiation`);

  // MIG-08/09/10.
  assert.deepEqual(r.erreursPartielles.map((e) => `${e.element.startsWith('volumes:') ? 'volume' : e.element.split('/').pop()}:${e.code}`).sort(), ['bad1:parametres-illisibles', 'deg1:refus-validateur-studio', 'volume:volume-non-integre', 'x1:classe-inconnue']);
  assert.equal(r.synthese.parProjet.find((p) => p.projet === PROJETS.P1).erreurs, 3);
  assert.equal(r.synthese.horsProjet.erreurs, 1);
  assert.equal(r.synthese.totaux.erreurs, 4);
  for (const id of attendus['non-convertible']) assert.match(r.nonConvertibles.find((n) => n.element === `atelier_objets:${PROJETS.P1}/${id}`).traitement, /jamais supprimé/);
  assert.ok(r.pertes.some((p) => p.element.endsWith('/l1') && /groupe/.test(p.perte)));
  assert.ok(r.pertes.some((p) => p.element.endsWith('/l2') && /propriétés/.test(p.perte)));
  const md = fs.readFileSync(path.join(SORTIE, 'hypotheses-declarees', 'simulation-migration.md'), 'utf8');
  for (const e of r.erreursPartielles) assert.ok(md.includes(e.element));
  assert.match(md, /## Volumes\n\n2 volume\(s\) lu\(s\), 1 non intègre/);
  assert.match(md, /## Tables absentes du schéma lu\n\nAucune/);
  ok('MIG-08/09/10 : pertes et ambiguïtés listées, non-convertibles conservés, 3 erreurs partielles par projet + 1 volume non intègre hors projet, comptées dans les totaux ; sections Volumes et Tables absentes');
  const sortie = JSON.stringify(r) + md;
  for (const prive of ['"Murs"', '"Dessin"', 'a.txt', 'absente.txt', 'alteree.txt']) assert.ok(!sortie.includes(prive), `nom en clair dans le rapport : ${prive}`);
  ok('M7 : aucun nom de calque ni de fichier de publication en clair (empreintes courtes)');
  const fi = illisible.filesLocales[0];
  assert.equal(fi.chemin, fichierAbsent);
  assert.match(fi.erreur, /illisible : lecture impossible \(ENOENT\)/);
  assert.ok(!illisible.controles['MIG-COEX-04'].basculeBloquee.includes(null));
  assert.equal(illisible.controles['MIG-COEX-04'].basculeBloqueeTousProjets, true);
  assert.equal(illisible.synthese.horsProjet.erreurs, 2, 'volume non intègre + export illisible');
  assert.ok(fs.readFileSync(path.join(SORTIE, 'file-illisible', 'simulation-migration.md'), 'utf8').includes(fichierAbsent));
  ok('M8 : export de file illisible — chemin et cause au rapport, jamais null dans basculeBloquee, bascule bloquée pour tous');

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
