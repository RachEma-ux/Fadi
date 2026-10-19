/**
 * Recette de restauration des données Studio (R.1-02 / R.2-01) par le chemin de restauration existant : « Sauvegarder
 * projet JSON » (GET /projects/:id/archive) dans la base A, puis « Importer projet JSON » (POST /projects/import) dans
 * une base B neuve servie par une seconde API. Projet synthétique : une étude, deux variantes (la seconde dérivée),
 * plusieurs révisions (mur avec ouverture, ouverture modifiée, ligne et rectangle), commentaire et réponse, observation
 * et son journal, lien vers des étapes du Parcours, publication diffusée (paquet SVG / DXF / IFC / PDF), membre éditeur,
 * préférences d'outils. Vérifie : manifeste de la section Studio, chaque document de révision identique octet pour
 * octet (JSON canonique et texte jsonb), historique et journaux intacts, fichiers du paquet identiques, droits repris,
 * déclencheur d'immuabilité toujours actif dans B, réouverture dans le navigateur ; puis lance l'outil de comparaison
 * (scripts/validation/studio-compare-restore.mjs) et exige 0 anomalie. Contrôles négatifs : archive altérée refusée
 * sans rien créer (422 archive_studio), réimport dans la base d'origine sans écrasement (réserve).
 *
 *   BASE_URL=http://localhost:3001 DATABASE_URL_A=postgresql://… DATABASE_URL_B=postgresql://… \
 *   [RESTORE_PORT=3002] [WEB_DIST=apps/web/dist] [OUT=dossier] node apps/web/e2e/studio-restauration.mjs
 * La base B doit être migrée (npm run db:migrate) et vide de comptes de la recette ; l'API B est démarrée puis arrêtée
 * par la recette (par son PID), sauf si RESTORE_BASE_URL désigne une API déjà lancée sur la base B.
 */
import { spawn, execFileSync } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const BASE = (process.env.BASE_URL ?? 'http://localhost:3001').replace(/\/$/, '');
const DB_A = process.env.DATABASE_URL_A ?? process.env.DATABASE_URL;
const DB_B = process.env.DATABASE_URL_B;
const OUT = process.env.OUT ?? path.join(ROOT, 'atelier-captures', 'studio-restauration');
if (!DB_A || !DB_B) { console.error('DATABASE_URL_A (ou DATABASE_URL) et DATABASE_URL_B sont requis.'); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });

let failures = 0;
function check(label, ok, detail = '') {
  if (ok) console.log(`✓ ${label}`);
  else { failures += 1; console.log(`✗ ${label}${detail ? ` — ${detail}` : ''}`); }
}
function client(base) {
  let cookie = '';
  const call = async (method, p, body, raw = false) => {
    const res = await fetch(`${base}${p}`, {
      method, headers: { 'content-type': 'application/json', origin: base, ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    const set = res.headers.getSetCookie?.() ?? [];
    if (set.length) cookie = set.map((c) => c.split(';')[0]).join('; ');
    if (raw) return { status: res.status, bytes: Buffer.from(await res.arrayBuffer()), headers: res.headers };
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = text; }
    return { status: res.status, body: json, headers: res.headers };
  };
  return call;
}
const canonical = (v) => Array.isArray(v) ? `[${v.map(canonical).join(',')}]` : v !== null && typeof v === 'object' ? `{${Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}` : JSON.stringify(v) ?? 'null';
const sha = (x) => createHash('sha256').update(x).digest('hex');
const short = (x) => JSON.stringify(x).slice(0, 300);
const credentials = (role) => ({ email: `restauration-${role}-${randomUUID().replaceAll('-', '').slice(0, 16)}@example.test`, password: randomBytes(18).toString('hex') });

// --- Base A : projet Studio synthétique -------------------------------------------------------------------------
const accounts = { owner: credentials('proprietaire'), editor: credentials('editeur') };
const ownerA = client(BASE), editorA = client(BASE);
check('A : propriétaire inscrit', (await ownerA('POST', '/auth/register', accounts.owner)).status === 201);
check('A : éditeur inscrit', (await editorA('POST', '/auth/register', accounts.editor)).status === 201);
const project = await ownerA('POST', '/projects', { code: `RST_${randomUUID().slice(0, 8)}`, name: 'Studio — restauration (recette synthétique)' });
check('A : projet créé', project.status === 201, String(project.status));
const pA = project.body.id;
check('A : éditeur invité (droits)', (await ownerA('POST', `/projects/${pA}/members`, { email: accounts.editor.email, role: 'editeur' })).status === 201);
check('A : préférences d\'outils du propriétaire', (await ownerA('PUT', `/projects/${pA}/studio/preferences/outils`, { profil: 'metier:cotation', favoris: ['studio.dessin.cote', 'studio.dessin.ligne'], personnel: ['studio.dessin.arc'] })).status === 200);

const root = `/projects/${pA}/studio`;
const study = await ownerA('POST', `${root}/studies`, { name: 'Étude restaurée' });
check('A : étude créée', study.status === 201, String(study.status));
const studyId = study.body.study.id, v1 = study.body.variant.id;
const vPath = (v) => `${root}/studies/${studyId}/variants/${v}`;
const heads = { [v1]: study.body.revision.id };
async function send(who, v, commands) {
  const r = await who('POST', `${vPath(v)}/commands`, { contractVersion: 'studio-commands/1', requestId: `rst-${randomUUID()}`, baseRevisionId: heads[v], commands });
  if (r.status === 200) heads[v] = r.body.revision.id;
  return r;
}
const mur = { id: 'mur-rst', type: 'wall', axis: [{ x: 0, y: 0 }, { x: 6, y: 0 }], thickness: 0.2, height: 3, base: 0, justification: 'center' };
const ouverture = { id: 'ouv-rst', type: 'opening', hostId: 'mur-rst', position: 2.5, width: 1, height: 2.1, sill: 0 };
const r1 = await send(ownerA, v1, [{ toolId: 'studio.architecture.mur', params: mur }, { toolId: 'studio.architecture.ouverture', params: ouverture }]);
check('A : révision 1 — mur et ouverture', r1.status === 200 && r1.body.revision.document.architecture?.length === 2, short(r1.body));
const r2 = await send(editorA, v1, [{ toolId: 'studio.architecture.modifier', params: { ...ouverture, width: 1.2 } }]);
check('A : révision 2 — ouverture élargie par l\'éditeur', r2.status === 200, short(r2.body));
const r3 = await send(ownerA, v1, [
  { toolId: 'studio.dessin.ligne', params: { id: 'ligne-rst', type: 'line', start: { x: 0, y: 2 }, end: { x: 6, y: 2 } } },
  { toolId: 'studio.dessin.rectangle', params: { id: 'rect-rst', type: 'rectangle', origin: { x: 1, y: 3 }, width: 2, height: 1 } },
]);
check('A : révision 3 — ligne et rectangle', r3.status === 200 && r3.body.revision.document.objects.length === 2, short(r3.body));
const v2r = await ownerA('POST', `${root}/studies/${studyId}/variants`, { name: 'Variante dérivée', fromVariantId: v1, fromRevisionId: r2.body.revision.id });
check('A : seconde variante dérivée de la révision 2', v2r.status === 201, short(v2r.body));
const v2 = v2r.body.variant.id;
heads[v2] = v2r.body.revision.id;
const r4 = await send(editorA, v2, [{ toolId: 'studio.dessin.rectangle', params: { id: 'rect-b', type: 'rectangle', origin: { x: 0, y: 4 }, width: 3, height: 1.5 } }]);
check('A : révision sur la seconde variante', r4.status === 200, short(r4.body));

const comments = `${vPath(v1)}/comments`;
const remark = await editorA('POST', comments, { body: 'Rectangle à décaler', objectIds: ['rect-rst'], revisionId: r3.body.revision.id });
const reply = await ownerA('POST', comments, { body: 'Vu, à reprendre', parentId: remark.body?.id });
check('A : commentaire ancré et réponse', remark.status === 201 && reply.status === 201, short([remark.body, reply.body]));
const participants = (await ownerA('GET', comments)).body?.participants ?? [];
const editorIdA = participants.find((p) => p.email === accounts.editor.email)?.id;
const promoted = await editorA('POST', `${comments}/${remark.body.id}/observation`, { responsableId: editorIdA, echeance: '2026-12-31', note: 'À corriger avant diffusion' });
check('A : commentaire promu en observation (responsable : éditeur)', promoted.status === 201, short(promoted.body));
const r5 = await send(editorA, v1, [{ toolId: 'studio.dessin.deplacer', params: { id: 'rect-rst', dx: 0.5, dy: 0 } }]);
check('A : révision 4 de la variante initiale — rectangle décalé', r5.status === 200, short(r5.body));
const fixed = await editorA('POST', `${comments}/${remark.body.id}/observation/transitions`, { action: 'corriger', revisionId: r5.body.revision.id, note: 'Corrigé' });
check('A : observation corrigée (journal à deux passages)', fixed.status === 200 && fixed.body.journal?.length === 2, short(fixed.body));
check('A : étude liée aux étapes 3 et 7 du Parcours', (await ownerA('PUT', `${root}/studies/${studyId}/steps`, { steps: [3, 7] })).status === 200);

const pubs = `${root}/studies/${studyId}/publications`;
const pub = await editorA('POST', `${vPath(v1)}/publications`, { title: 'Dossier restauré' });
await editorA('POST', `${pubs}/${pub.body.id}/soumettre`, { comment: 'Pour revue' });
await ownerA('POST', `${pubs}/${pub.body.id}/approuver`, { revisionId: pub.body.revisionId, documentHash: pub.body.documentHash });
const diffused = await editorA('POST', `${pubs}/${pub.body.id}/diffuser`, { comment: 'Diffusion' });
check('A : publication diffusée, paquet de quatre fichiers', diffused.status === 200 && diffused.body.diffusion?.files?.length === 4, short(diffused.body));
const filesA = {};
for (const f of diffused.body.diffusion.files) filesA[f.format] = (await ownerA('GET', `${pubs}/${pub.body.id}/files/${f.format}`, undefined, true)).bytes;

// --- Sauvegarde ------------------------------------------------------------------------------------------------
const archiveRes = await ownerA('GET', `/projects/${pA}/archive`, undefined, true);
const archiveText = archiveRes.bytes.toString('utf8');
const archive = JSON.parse(archiveText);
fs.writeFileSync(path.join(OUT, 'archive.json'), archiveText);
const st = archive.studio;
const counts = st ? Object.fromEntries(Object.entries(st.manifest.tables).map(([t, m]) => [t, m.count])) : {};
check('sauvegarde : section Studio présente (schéma, version, manifeste)', archiveRes.status === 200 && st?.schema === 'fadi-studio-archive/1' && st.schemaVersion?.document === 'studio-document/1' && /^[0-9a-f]{64}$/.test(st.manifest?.hash ?? ''), short(st?.manifest ?? archive).slice(0, 200));
check('sauvegarde : effectifs du manifeste (1 étude, 2 variantes, 7 révisions, 2 commentaires, 1 observation, 2 passages, 2 liens, 1 publication, 4 évènements, 4 volumes, 1 membre, 1 préférence)',
  counts.studio_studies === 1 && counts.studio_variants === 2 && counts.studio_revisions === 7 && counts.studio_comments === 2 && counts.studio_observations === 1 && counts.studio_observation_events === 2
  && counts.studio_study_steps === 2 && counts.studio_publications === 1 && counts.studio_publication_events === 4 && counts.volumes === 4 && counts.project_members === 1 && counts.studio_tool_preferences === 1, JSON.stringify(counts));
check('sauvegarde : empreintes des documents de la publication et du paquet conformes', st?.tables.studio_publications[0]?.document_hash === pub.body.documentHash && st?.tables.studio_publications[0]?.package_hash === diffused.body.diffusion.packageHash);

// --- Base B : API neuve, comptes recréés, restauration --------------------------------------------------------
const RESTORE_PORT = Number(process.env.RESTORE_PORT ?? 3002);
let BASE_B = (process.env.RESTORE_BASE_URL ?? '').replace(/\/$/, '');
let apiB = null;
if (!BASE_B) {
  BASE_B = `http://localhost:${RESTORE_PORT}`;
  const log = fs.openSync(path.join(OUT, 'api-b.log'), 'w');
  apiB = spawn(process.execPath, [path.join(ROOT, 'apps/api/dist/server.js')], {
    cwd: ROOT, stdio: ['ignore', log, log],
    env: { ...process.env, PORT: String(RESTORE_PORT), DATABASE_URL: DB_B, WEB_ORIGIN: BASE_B, AUTH_RATE_LIMIT: process.env.AUTH_RATE_LIMIT ?? '500', API_RATE_LIMIT: process.env.API_RATE_LIMIT ?? '5000' },
  });
  let ready = false;
  for (let i = 0; i < 60 && !ready; i += 1) {
    await new Promise((r) => setTimeout(r, 500));
    ready = await fetch(`${BASE_B}/health`).then((r) => r.ok, () => false);
  }
  check(`B : API de restauration démarrée (PID ${apiB.pid}, port ${RESTORE_PORT})`, ready);
}
const stopB = () => { if (apiB && apiB.exitCode === null) { process.kill(apiB.pid, 'SIGTERM'); } };

const pgA = new pg.Client({ connectionString: DB_A });
const pgB = new pg.Client({ connectionString: DB_B });
await pgA.connect(); await pgB.connect();
let pB = null;
let compareExit = null;
try {
  const ownerB = client(BASE_B), editorB = client(BASE_B);
  check('B : propriétaire réinscrit (même adresse)', (await ownerB('POST', '/auth/register', accounts.owner)).status === 201);
  check('B : éditeur réinscrit (même adresse)', (await editorB('POST', '/auth/register', accounts.editor)).status === 201);

  // Contrôle négatif : section Studio altérée (document d'une révision modifié) → refus, rien n'est créé.
  const tampered = JSON.parse(archiveText);
  tampered.studio.tables.studio_revisions[0].document.objects = [{ id: 'intrus', type: 'line', start: { x: 0, y: 0 }, end: { x: 1, y: 1 } }];
  const before = (await ownerB('GET', '/projects')).body;
  const refused = await ownerB('POST', '/projects/import', JSON.stringify(tampered));
  const after = (await ownerB('GET', '/projects')).body;
  check('B : archive altérée refusée (422 archive_studio), aucun projet créé', refused.status === 422 && refused.body?.error === 'archive_studio' && JSON.stringify(before) === JSON.stringify(after), `${refused.status} ${short(refused.body)}`);

  const imported = await ownerB('POST', '/projects/import', archiveText);
  check('B : restauration par « Importer projet JSON » (201)', imported.status === 201 && imported.body.projects?.length === 1, `${imported.status} ${short(imported.body)}`);
  pB = imported.body.projects?.[0]?.id;
  const warnings = imported.body.projects?.[0]?.warnings ?? [];
  check('B : aucune réserve Studio (comptes retrouvés par adresse, aucun écrasement)', !warnings.some((w) => /Studio|Droits/.test(w)), JSON.stringify(warnings));

  // Documents de révision : identiques octet pour octet (JSON canonique via l'API, texte jsonb dans la base).
  const rootB = `/projects/${pB}/studio`;
  const vPathB = (v) => `${rootB}/studies/${studyId}/variants/${v}`;
  for (const v of [v1, v2]) {
    const ha = (await ownerA('GET', `${vPath(v)}/revisions`)).body?.revisions ?? [];
    const hb = (await ownerB('GET', `${vPathB(v)}/revisions`)).body?.revisions ?? [];
    const strip = (list) => list.map((x) => ({ id: x.id, parentRevisionId: x.parentRevisionId, source: x.source, createdAt: x.createdAt }));
    check(`historique de la variante ${v === v1 ? 'initiale' : 'dérivée'} intact (identifiants, parents, sources, dates : ${ha.length} révisions)`, ha.length > 1 && JSON.stringify(strip(ha)) === JSON.stringify(strip(hb)), short({ a: strip(ha), b: strip(hb) }));
    let same = 0;
    for (const rev of ha) {
      const da = (await ownerA('GET', `${vPath(v)}/revisions/${rev.id}`)).body?.revision?.document;
      const db = (await ownerB('GET', `${vPathB(v)}/revisions/${rev.id}`)).body?.revision?.document;
      if (da && db && canonical(da) === canonical(db) && sha(canonical(da)) === sha(canonical(db))) same += 1;
    }
    check(`documents de révision identiques (variante ${v === v1 ? 'initiale' : 'dérivée'}) : ${same}/${ha.length}`, same === ha.length);
  }
  const textA = (await pgA.query("SELECT id, document::text AS doc, payload_hash, request_id FROM studio_revisions WHERE variant_id = ANY($1) ORDER BY id", [[v1, v2]])).rows;
  const textB = (await pgB.query("SELECT id, document::text AS doc, payload_hash, request_id FROM studio_revisions WHERE variant_id = ANY($1) ORDER BY id", [[v1, v2]])).rows;
  check(`base : texte jsonb des documents, empreintes et requestId identiques (${textA.length} révisions)`, textA.length === 7 && JSON.stringify(textA) === JSON.stringify(textB));

  // Commentaires, observation, liens d'étapes, publication, fichiers, droits.
  const ca = (await ownerA('GET', comments)).body?.comments ?? [];
  const cb = (await ownerB('GET', `${vPathB(v1)}/comments`)).body?.comments ?? [];
  const cview = (list) => list.map((c) => ({ id: c.id, body: c.body, parentId: c.parentId, revisionId: c.revisionId, objectIds: c.objectIds, createdAt: c.createdAt, author: c.authorEmail, journal: c.observation?.journal?.map((j) => [j.action, j.revisionId, j.note, j.at]) ?? null, statut: c.observation?.statut ?? null }));
  check('commentaires, réponse et journal d\'observation identiques', ca.length === 2 && JSON.stringify(cview(ca)) === JSON.stringify(cview(cb)), short({ a: cview(ca), b: cview(cb) }));
  const sb = (await ownerB('GET', `${rootB}/studies/${studyId}/steps`)).body;
  check('liens vers les étapes 3 et 7 du Parcours repris', JSON.stringify(sb?.steps?.map((x) => x.number)) === '[3,7]', short(sb));
  const pa = (await ownerA('GET', `${pubs}/${pub.body.id}`)).body;
  const pbv = (await ownerB('GET', `${rootB}/studies/${studyId}/publications/${pub.body.id}`)).body;
  const pview = (p) => ({ status: p?.status, revisionId: p?.revisionId, documentHash: p?.documentHash, packageHash: p?.diffusion?.packageHash, files: p?.diffusion?.files, events: p?.events?.map((e) => [e.id, e.action, e.toStatus, e.author.email, e.comment, e.createdAt]) });
  check('publication, approbation, paquet et journal de publication identiques', JSON.stringify(pview(pa)) === JSON.stringify(pview(pbv)) && pbv?.events?.length === 4, short({ a: pview(pa), b: pview(pbv) }));
  let filesOk = 0;
  for (const f of diffused.body.diffusion.files) {
    const got = await ownerB('GET', `${rootB}/studies/${studyId}/publications/${pub.body.id}/files/${f.format}`, undefined, true);
    if (got.status === 200 && Buffer.compare(got.bytes, filesA[f.format]) === 0 && sha(got.bytes) === f.sha256) filesOk += 1;
  }
  check('fichiers figés du paquet identiques octet pour octet (SVG, DXF, IFC, PDF)', filesOk === 4, `${filesOk}/4`);
  const verif = (await ownerB('GET', `${rootB}/studies/${studyId}/publications/${pub.body.id}/verification`)).body;
  check('paquet recalculé dans B : empreintes identiques', verif?.identical === true, short(verif));
  const membersB = (await ownerB('GET', `/projects/${pB}/members`)).body;
  check('droits : l\'éditeur est membre éditeur du projet restauré', JSON.stringify(membersB).includes(accounts.editor.email) && /editeur/.test(JSON.stringify(membersB)), short(membersB));
  check('droits : l\'éditeur lit et écrit dans le projet restauré', (await editorB('GET', `${vPathB(v2)}`)).status === 200);
  const prefsB = (await ownerB('GET', `${rootB}/preferences/outils`)).body;
  check('préférences d\'outils reprises', prefsB?.profil === 'metier:cotation' && JSON.stringify(prefsB.favoris) === '["studio.dessin.cote","studio.dessin.ligne"]', short(prefsB));


  // Immuabilité dans B : toute UPDATE d'une révision restaurée est refusée par le déclencheur.
  let immutable = '';
  try { await pgB.query('UPDATE studio_revisions SET request_id = request_id WHERE id = $1', [r1.body.revision.id]); immutable = 'acceptée'; } catch (e) { immutable = e.message; }
  check('immuabilité : UPDATE d\'une révision restaurée refusée (studio_revision_immutable)', /studio_revision_immutable/.test(immutable), immutable);

  // Outil de comparaison (R.1-03), avant toute écriture dans B : 0 anomalie exigée.
  const reportMd = path.join(OUT, 'studio-compare-restore.md');
  const reportJson = path.join(OUT, 'studio-compare-restore.json');
  try {
    const out = execFileSync(process.execPath, [path.join(ROOT, 'scripts/validation/studio-compare-restore.mjs'), '--a', DB_A, '--b', DB_B, '--project-a', pA, '--project-b', pB, '--out', reportMd, '--json', reportJson], { cwd: ROOT, encoding: 'utf8' });
    process.stdout.write(out.split('\n').map((l) => (l ? `   ${l}` : l)).join('\n'));
    compareExit = 0;
  } catch (e) {
    process.stdout.write(String(e.stdout ?? ''));
    compareExit = e.status ?? 1;
  }
  const report = fs.existsSync(reportJson) ? JSON.parse(fs.readFileSync(reportJson, 'utf8')) : null;
  check('outil de comparaison A / B : 0 anomalie (identifiants, empreintes, effectifs, déclencheurs, sonde d\'immuabilité)', compareExit === 0 && report?.anomalies === 0 && report.reports[0].probe?.refused === true, `sortie ${compareExit}, ${report?.anomalies} anomalie(s)`);

  // Après restauration, le travail reprend : nouvelle révision sur la tête restaurée.
  const afterRestore = await ownerB('POST', `${vPathB(v1)}/commands`, { contractVersion: 'studio-commands/1', requestId: `rst-${randomUUID()}`, baseRevisionId: r5.body.revision.id, commands: [{ toolId: 'studio.dessin.ligne', params: { id: 'apres', type: 'line', start: { x: 0, y: 6 }, end: { x: 1, y: 6 } } }] });
  check('B : nouvelle révision possible après restauration (parent = tête restaurée)', afterRestore.status === 200 && afterRestore.body.revision.parentRevisionId === r5.body.revision.id, short(afterRestore.body));
  // L'outil voit exactement cette écriture comme la seule différence (la comparaison n'est pas aveugle).
  try {
    execFileSync(process.execPath, [path.join(ROOT, 'scripts/validation/studio-compare-restore.mjs'), '--a', DB_A, '--b', DB_B, '--project-a', pA, '--project-b', pB, '--json', path.join(OUT, 'studio-compare-apres-ecriture.json'), '--no-probe'], { cwd: ROOT, encoding: 'utf8' });
    check('outil de comparaison : la révision ajoutée dans B est signalée', false, 'aucune anomalie détectée');
  } catch {
    const after = JSON.parse(fs.readFileSync(path.join(OUT, 'studio-compare-apres-ecriture.json'), 'utf8'));
    const kinds = after.reports[0].anomalies.map((x) => `${x.kind}:${x.table}`);
    check('outil de comparaison : la révision ajoutée dans B est signalée (en trop, tête différente)', kinds.includes('en-trop:studio_revisions') && kinds.includes('differente:studio_variants'), JSON.stringify(kinds));
  }

  // Réouverture dans le navigateur (base B).
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${BASE_B}/connexion`);
    await page.fill('input[name="email"]', accounts.owner.email);
    await page.fill('input[name="password"]', accounts.owner.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(accueil|projets)$/);
    await page.goto(`${BASE_B}/studio/projets/${pB}/etudes/${studyId}/variantes/${v1}`);
    await page.getByRole('toolbar', { name: 'Outils de dessin' }).waitFor();
    const wall = page.locator('svg [data-studio-architecture][data-studio-type="wall"]');
    await wall.first().waitFor({ state: 'attached' });
    const drawn = { wall: await wall.count(), opening: await page.locator('svg [data-studio-architecture][data-studio-type="opening"]').count(), objects: await page.locator('svg [data-studio-objet]').count() };
    check('navigateur : variante restaurée rouverte — mur, ouverture, ligne, rectangle et la ligne ajoutée', drawn.wall === 1 && drawn.opening === 1 && drawn.objects === 3, JSON.stringify(drawn));
    await page.screenshot({ path: path.join(OUT, 'variante-restauree.png') });
    await page.goto(`${BASE_B}/studio/projets/${pB}/etudes/${studyId}`);
    await page.locator(`[data-studio-etude="${studyId}"]`).waitFor();
    check('navigateur : page de l\'étude restaurée, deux variantes', (await page.locator('[data-studio-variantes] li').count()) === 2);
    check('navigateur : aucune erreur de page', errors.length === 0, errors.join(' | '));
  } finally {
    await browser.close();
  }

  // Contrôle négatif : réimport dans la base d'origine (identifiants déjà présents) → Studio non écrasé, réserve.
  const again = await ownerA('POST', '/projects/import', archiveText);
  const againWarnings = again.body?.projects?.[0]?.warnings ?? [];
  const copyId = again.body?.projects?.[0]?.id;
  const studiesOfCopy = copyId ? (await ownerA('GET', `/projects/${copyId}/studio/studies`)).body?.studies ?? null : null;
  check('A : réimport dans la base d\'origine — projet créé sans Studio, réserve explicite, original intact', again.status === 201 && againWarnings.some((w) => /Données Studio non restaurées/.test(w)) && Array.isArray(studiesOfCopy) && studiesOfCopy.length === 0 && (await ownerA('GET', vPath(v1))).body?.revision?.id === r5.body.revision.id, short(again.body));
} finally {
  await pgA.end(); await pgB.end();
  stopB();
}

fs.writeFileSync(path.join(OUT, 'resume.json'), JSON.stringify({ date: new Date().toISOString(), projetA: pA, projetB: pB, etude: studyId, variantes: [v1, v2], comparaison: compareExit, echecs: failures }, null, 2));
console.log(failures ? `❌ ${failures} contrôle(s) en échec` : '✅ restauration Studio vérifiée');
process.exit(failures ? 1 : 0);
