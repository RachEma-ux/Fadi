/** Read/navigation seam check on the synthetic fixture produced by studio-v1.mjs. */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const profile = JSON.parse(readFileSync(process.env.STUDIO_TEST_PROFILE, 'utf8'));
assert.equal(profile.kind, 'fadi-studio-v1-disposable');
assert(profile.disposable === true && profile.production === false && profile.testDatabaseSafe === true && profile.attestedBy === 'A6');
const expiry = typeof profile.expiresAt === 'number' ? profile.expiresAt : Date.parse(profile.expiresAt);
assert(Number.isFinite(expiry) && expiry > Date.now());
for (const address of [profile.uiBaseUrl, profile.apiBaseUrl]) {
  const u = new URL(address); assert(['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname) && u.protocol === 'http:' && !u.username && !u.password && !u.search && !u.hash);
}
const out = resolve(process.env.STUDIO_PROOF_DIR);
const state = JSON.parse(readFileSync(resolve(out, 'private-state.json'), 'utf8'));
assert.equal(state.runId, profile.runId);
const { chromium } = await import('playwright');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const report = { phase: 'existing-navigation-seam', runId: profile.runId, date: new Date().toISOString(), runtimeCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), browserVersion: browser.version(), checks: [], limits: ['Navigation and mount check only; does not certify every native Atelier function or any production target'] };
const c = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const errors = [];
try {
  assert(expiry > Date.now());
  const login = await c.request.post(`${profile.apiBaseUrl}/auth/login`, { data: state.owner });
  assert.equal(login.status(), 200);
  const path = `/projects/${state.projectId}/studio/studies/${state.studyId}/variants/${state.variantId}`;
  const before = await (await c.request.get(`${profile.apiBaseUrl}${path}`)).json();
  const page = await c.newPage(); page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
  await page.goto(`${profile.uiBaseUrl}/projets/${state.projectId}?module=parcours`);
  await page.locator('.overview-step').first().waitFor();
  assert.equal(await page.locator('.overview-step').count(), 21);
  report.checks.push({ name: 'existing Parcours exposes 21 steps on the same project', result: 'passed' });
  await page.getByRole('navigation', { name: 'Modules du projet' }).getByRole('button', { name: 'Atelier architectural', exact: true }).click();
  await page.locator('.atelier-n .plan2d').waitFor();
  report.checks.push({ name: 'existing Atelier mounts through its original project navigation', result: 'passed' });
  await page.screenshot({ path: resolve(out, 'existing-atelier-seam.png') });
  await page.goto(`${profile.uiBaseUrl}/studio/projets/${state.projectId}/etudes/${state.studyId}/variantes/${state.variantId}`);
  await page.getByRole('heading', { name: state.studyName, exact: true }).waitFor();
  const afterResponse = await c.request.get(`${profile.apiBaseUrl}${path}`); assert.equal(afterResponse.status(), 200);
  const after = await afterResponse.json();
  assert.deepEqual(after.revision, before.revision);
  assert.deepEqual(after.revision.document, state.expected.revision.document);
  assert.deepEqual(errors, []);
  report.checks.push({ name: 'legacy navigation leaves exact Studio revision/document unchanged', result: 'passed' });
  report.documentSha256 = createHash('sha256').update(JSON.stringify(after.revision.document)).digest('hex');
  report.result = 'passed';
} catch (e) {
  report.result = 'failed'; report.failure = { name: e.name, message: e.message }; report.pageErrors = errors; process.exitCode = 1;
} finally {
  await c.close(); await browser.close();
  writeFileSync(resolve(out, 'report-existing-seam.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ result: report.result, checks: report.checks.length }));
}
