/** Independent real Studio V1 acceptance. Requires an A6-attested disposable profile.
 * No TRUNCATE, migrations, database driver, mocked API, or production target.
 * PHASE=initial|reopen STUDIO_TEST_PROFILE=/private/profile.json STUDIO_PROOF_DIR=/private/proofs node ...
 */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { createHash, randomUUID, randomBytes } from 'node:crypto';
import { resolve } from 'node:path';

const profilePath = process.env.STUDIO_TEST_PROFILE;
assert(profilePath, 'An explicit A6 disposable profile is required before any request');
const profile = JSON.parse(readFileSync(profilePath, 'utf8'));
assert.equal(profile.kind, 'fadi-studio-v1-disposable');
assert.equal(profile.disposable, true);
assert.equal(profile.production, false);
assert.equal(profile.testDatabaseSafe, true);
assert.equal(profile.attestedBy, 'A6');
assert(profile.runId && profile.databaseName && profile.evidencePath);
const expiry = typeof profile.expiresAt === 'number' ? profile.expiresAt : Date.parse(profile.expiresAt);
assert(Number.isFinite(expiry) && expiry > Date.now(), 'Expired test target attestation');
assert(statSync(profile.evidencePath).isFile(), 'Attestation evidence must exist');
for (const key of ['apiBaseUrl', 'uiBaseUrl']) {
  const u = new URL(profile[key]);
  assert(['localhost', '127.0.0.1', '[::1]'].includes(u.hostname), 'Only attested loopback targets');
  assert.equal(u.protocol, 'http:');
  assert(!u.username && !u.password && !u.search && !u.hash);
}
const API = profile.apiBaseUrl.replace(/\/$/, '');
const UI = profile.uiBaseUrl.replace(/\/$/, '');
const OUT = resolve(process.env.STUDIO_PROOF_DIR ?? '/tmp/fadi-studio-v1-proof');
mkdirSync(OUT, { recursive: true, mode: 0o700 });
const statePath = resolve(OUT, 'private-state.json');
const phase = process.env.PHASE ?? 'initial';
assert(['initial', 'reopen'].includes(phase));
const report = { runId: profile.runId, phase, date: new Date().toISOString(), attestationSha256: createHash('sha256').update(readFileSync(profilePath)).digest('hex'), checks: [], limits: ['Disposable synthetic fixtures only; no production', 'API equality corroborates persistence reads; database restart evidence belongs to A6'] };
const check = (name, fn) => { fn(); report.checks.push({ name, result: 'passed' }); };
const docHash = (doc) => createHash('sha256').update(JSON.stringify(doc)).digest('hex');
const { chromium } = await import('playwright');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const contexts = [];
async function context() { const c = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); contexts.push(c); return c; }
async function api(c, method, path, data) {
  assert(expiry > Date.now(), 'Attestation expired during recipe');
  const response = await c.request[method](`${API}${path}`, data === undefined ? {} : { data });
  return { status: response.status(), body: await response.json().catch(() => null) };
}
async function login(c, credentials) {
  const r = await api(c, 'post', '/auth/login', credentials);
  assert.equal(r.status, 200, 'Real fixture account login');
}
const studyRoot = (projectId) => `/projects/${projectId}/studio/studies`;
const variantPath = (s) => `${studyRoot(s.projectId)}/${s.studyId}/variants/${s.variantId}`;
async function getState(c, s) { const r = await api(c, 'get', variantPath(s)); assert.equal(r.status, 200); return r.body; }
async function unchanged(c, s, before, label) {
  const after = await getState(c, s);
  check(label, () => { assert.deepEqual(after.revision, before.revision); assert.deepEqual(after.variant, before.variant); });
}
const envelope = (baseRevisionId, commands, requestId = randomUUID()) => ({ contractVersion: 'studio-commands/1', requestId, baseRevisionId, commands });
async function refused(actor, owner, s, path, body, status, name) {
  const before = await getState(owner, s);
  const r = await api(actor, 'post', path, body);
  check(`${name}: HTTP ${status}`, () => assert.equal(r.status, status));
  await unchanged(owner, s, before, `${name}: no canonical mutation`);
}

async function reopen(s) {
  const c = await context(); await login(c, s.owner);
  const actual = await getState(c, s);
  check('new authenticated context preserves exact committed revision/document', () => {
    assert.equal(actual.revision.id, s.expected.revision.id);
    assert.deepEqual(actual.revision.document, s.expected.revision.document);
    assert.equal(actual.variant.headRevisionId, s.expected.variant.headRevisionId);
  });
  const page = await c.newPage(); await page.goto(`${UI}/studio/projets/${s.projectId}/etudes/${s.studyId}/variantes/${s.variantId}`);
  await page.getByRole('heading', { name: s.studyName, exact: true }).waitFor();
  await page.screenshot({ path: resolve(OUT, `studio-${phase}.png`) });
  report.documentSha256 = docHash(actual.revision.document);
  report.studyId = s.studyId;
  report.revisionId = actual.revision.id;
}

try {
  if (phase === 'reopen') {
    const s = JSON.parse(readFileSync(statePath, 'utf8'));
    assert.equal(s.runId, profile.runId, 'Reopen fixture belongs to attested run');
    await reopen(s);
  } else {
    const owner = await context();
    const foreign = await context();
    const anonymous = await context();
    const suffix = randomUUID().replaceAll('-', '');
    const credentials = { email: `studio-${suffix}@example.test`, password: randomBytes(24).toString('hex') };
    const otherCredentials = { email: `studio-other-${suffix}@example.test`, password: randomBytes(24).toString('hex') };
    for (const [c, credentialsForUser] of [[owner, credentials], [foreign, otherCredentials]]) {
      const r = await api(c, 'post', '/auth/register', credentialsForUser);
      assert.equal(r.status, 201, 'Real API creates synthetic fixture account');
    }
    const project = await api(owner, 'post', '/projects', { code: `SV1_${suffix.slice(0, 12)}`, name: 'Studio QA synthetic project' });
    assert.equal(project.status, 201);
    const projectId = project.body.id;
    // UI creation/edit assertions are completed against the agreed A4 selectors below.
    const page = await owner.newPage();
    await page.goto(`${UI}/accueil`);
    const uiEvidence = await exerciseStudioUI(page, projectId);
    const list = await api(owner, 'get', studyRoot(projectId));
    assert.equal(list.status, 200);
    const study = list.body.studies.find((x) => x.name === 'Étude QA Studio');
    assert(study, 'Study created through UI must appear in real API');
    const s = { runId: profile.runId, projectId, studyId: study.id, variantId: study.initialVariantId, studyName: study.name, owner: credentials };
    const initial = await getState(owner, s);
    const shapes = initial.revision.document.objects;
    check('UI committed one line and one rectangle with stable unique identities', () => {
      assert.equal(shapes.length, 2); assert.equal(new Set(shapes.map((x) => x.id)).size, 2);
      assert.equal(shapes.filter((x) => x.type === 'line').length, 1);
      assert.equal(shapes.filter((x) => x.type === 'rectangle').length, 1);
    });
    check('UI numeric modification and movement preserve IDs and exact geometry', () => {
      const byId = new Map(shapes.map((x) => [x.id, x]));
      assert.deepEqual(byId.get(uiEvidence.lineId), { id: uiEvidence.lineId, type: 'line', start: { x: 3, y: 3 }, end: { x: 8, y: 3 } });
      assert.deepEqual(byId.get(uiEvidence.rectangleId), { id: uiEvidence.rectangleId, type: 'rectangle', origin: { x: 7, y: 3 }, width: 3, height: 2 });
    });
    const path = `${variantPath(s)}/commands`;
    const revision = initial.revision.id;
    const line = shapes.find((x) => x.type === 'line');
    const cmd = { toolId: 'studio.dessin.deplacer', params: { id: line.id, dx: 1, dy: 0 } };
    const payload = envelope(revision, [cmd]);
    const accepted = await api(owner, 'post', path, payload);
    check('real command accepted', () => assert.equal(accepted.status, 200));
    const nextAccepted = await api(owner, 'post', path, envelope(accepted.body.revision.id, [{ toolId: 'studio.dessin.deplacer', params: { id: line.id, dx: 0, dy: 1 } }]));
    check('a distinct second command advances the head', () => { assert.equal(nextAccepted.status, 200); assert.notEqual(nextAccepted.body.revision.id, accepted.body.revision.id); });
    const stateAfterCommit = await getState(owner, s);
    check('API command geometry and identities match exact expected translation', () => {
      const moved = stateAfterCommit.revision.document.objects.find((x) => x.id === line.id);
      assert.deepEqual(moved.start, { x: line.start.x + 1, y: line.start.y + 1 });
      assert.deepEqual(moved.end, { x: line.end.x + 1, y: line.end.y + 1 });
      assert.equal(stateAfterCommit.revision.document.objects.length, 2);
    });
    const replay = await api(owner, 'post', path, payload);
    check('same requestId/content replays durable result', () => { assert.equal(replay.status, 200); assert.equal(replay.body.replayed, true); assert.equal(replay.body.revision.id, accepted.body.revision.id); });
    await unchanged(owner, s, stateAfterCommit, 'replay creates no second revision');
    await refused(owner, owner, s, path, { ...payload, commands: [{ ...cmd, params: { ...cmd.params, dx: 2 } }] }, 409, 'requestId with changed payload');
    await refused(owner, owner, s, path, envelope(revision, [cmd]), 409, 'new request on stale revision');
    await refused(owner, owner, s, path, envelope(stateAfterCommit.revision.id, [{ toolId: 'unknown', params: {} }]), 400, 'unknown tool');
    await refused(owner, owner, s, path, envelope(stateAfterCommit.revision.id, [{ toolId: 'studio.dessin.ligne', params: { id: `bad-${suffix}`, type: 'circle', start: { x: 0, y: 0 }, end: { x: 1, y: 1 } } }]), 400, 'unknown shape type');
    await refused(anonymous, owner, s, path, envelope(stateAfterCommit.revision.id, [cmd]), 401, 'no authenticated session');
    const forgedRead = await api(foreign, 'get', variantPath(s));
    check('foreign account forged context is not disclosed', () => assert.equal(forgedRead.status, 404));
    await refused(foreign, owner, s, path, envelope(stateAfterCommit.revision.id, [cmd]), 404, 'foreign account write');
    const project2 = await api(owner, 'post', '/projects', { code: `SV2_${suffix.slice(0, 12)}`, name: 'Studio QA other context' });
    assert.equal(project2.status, 201);
    await refused(owner, owner, s, `${variantPath({ ...s, projectId: project2.body.id })}/commands`, envelope(stateAfterCommit.revision.id, [cmd]), 404, 'cross-project mismatched study/variant');
    const invite = await api(owner, 'post', `/projects/${projectId}/members`, { email: otherCredentials.email, role: 'lecteur' });
    check('existing API permits reader fixture invitation', () => assert.equal(invite.status, 201));
    const readable = await getState(foreign, s);
    check('reader may read but cannot write', () => assert.equal(readable.canWrite, false));
    await refused(foreign, owner, s, path, envelope(stateAfterCommit.revision.id, [cmd]), 403, 'reader mutation');
    s.expected = await getState(owner, s);
    writeFileSync(statePath, JSON.stringify(s), { mode: 0o600 });
    await owner.close();
    await reopen(s);
  }
  report.result = 'passed';
} catch (error) {
  report.result = 'failed';
  report.failure = { name: error.name, message: error.message };
  process.exitCode = 1;
} finally {
  for (const c of contexts) await c.close().catch(() => {});
  await browser.close();
  writeFileSync(resolve(OUT, `report-${phase}.json`), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ phase, result: report.result, checks: report.checks.length, proof: resolve(OUT, `report-${phase}.json`) }));
}

async function exerciseStudioUI(page, projectId) {
  const commandRequests = [];
  page.on('request', (r) => { if (r.method() === 'POST' && /\/studio\/studies\/[^/]+\/variants\/[^/]+\/commands$/.test(new URL(r.url()).pathname)) commandRequests.push(r); });
  await page.getByRole('link', { name: 'Studio', exact: true }).click();
  await page.waitForURL((u) => u.pathname === '/studio');
  await page.getByRole('link', { name: /Studio QA synthetic project/ }).click();
  await page.waitForURL((u) => u.pathname === `/studio/projets/${projectId}`);
  await page.getByLabel('Nom de l’étude', { exact: true }).fill('Étude QA Studio');
  await page.getByRole('button', { name: 'Créer l’étude et sa variante initiale', exact: true }).click();
  await page.getByRole('heading', { name: 'Étude QA Studio', exact: true }).waitFor();
  const tools = page.getByRole('toolbar', { name: 'Outils de dessin' });
  const props = page.getByRole('complementary', { name: 'Propriétés du dessin' });
  const tool = (name) => tools.getByRole('button', { name: new RegExp('^' + name + '(?: |$)') });
  const numeric = async (pairs) => { for (const [name, value] of pairs) await props.getByLabel(name, { exact: true }).fill(String(value)); };
  await tool('Ligne').click();
  await numeric([['X', 1], ['Y', 1], ['X final', 5], ['Y final', 1]]);
  await props.getByRole('button', { name: 'Ajouter au dessin', exact: true }).click();
  await tool('Rectangle').click();
  await numeric([['X', 7], ['Y', 3], ['Largeur', 3], ['Hauteur', 2]]);
  await props.getByRole('button', { name: 'Ajouter au dessin', exact: true }).click();
  const lineObject = page.locator('svg [role="button"][aria-label^="Ligne "]');
  const rectangleObject = page.locator('svg [role="button"][aria-label^="Rectangle "]');
  assert.equal(await lineObject.count(), 1);
  assert.equal(await rectangleObject.count(), 1);
  const lineId = (await lineObject.getAttribute('aria-label')).slice('Ligne '.length);
  const rectangleId = (await rectangleObject.getAttribute('aria-label')).slice('Rectangle '.length);
  await tool('Sélection').click();
  await lineObject.press('Enter');
  check('keyboard selection identifies the existing line', () => assert(lineId));
  assert.equal(await lineObject.getAttribute('aria-pressed'), 'true');
  await tool('Modifier').click();
  await numeric([['X', 1], ['Y', 2], ['X final', 6], ['Y final', 2]]);
  await props.getByRole('button', { name: 'Modifier la sélection', exact: true }).click();
  await tool('Déplacer').click();
  await numeric([['Déplacement X', 2], ['Déplacement Y', 1]]);
  await props.getByRole('button', { name: 'Déplacer la sélection', exact: true }).click();
  check('draft gestures and selection do not write before explicit save', () => assert.equal(commandRequests.length, 0));
  const acknowledgement = page.waitForResponse((r) => /\/studio\/studies\/[^/]+\/variants\/[^/]+\/commands$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST' && r.status() === 200);
  await tools.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await acknowledgement;
  await page.getByRole('status').filter({ hasText: /^Enregistré sur le serveur$/ }).waitFor();
  check('save ACK comes from one real API command batch', () => assert.equal(commandRequests.length, 1));
  await page.reload();
  await page.getByRole('heading', { name: 'Étude QA Studio', exact: true }).waitFor();
  await page.locator(`svg [role="button"][aria-label="Ligne ${lineId}"]`).waitFor();
  await page.locator(`svg [role="button"][aria-label="Rectangle ${rectangleId}"]`).waitFor();
  await page.screenshot({ path: resolve(OUT, 'studio-initial-reloaded.png') });
  return { lineId, rectangleId };
}

