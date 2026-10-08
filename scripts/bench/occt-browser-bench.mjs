// Banc P2-0 (D-177) — occt-wasm dans Chromium (Playwright) : page `occt-browser.html`, paquet servi depuis BENCH_DIR.
// Usage : BENCH_DIR=<dossier hors dépôt avec node_modules/occt-wasm> node scripts/bench/occt-browser-bench.mjs [--repetitions 5] [--out fichier.json]
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const BENCH_DIR = process.env.BENCH_DIR;
if (!BENCH_DIR || !fs.existsSync(path.join(BENCH_DIR, 'node_modules', 'occt-wasm'))) { console.error('BENCH_DIR doit contenir node_modules/occt-wasm (installé hors dépôt).'); process.exit(2); }
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const REP = Number(arg('--repetitions', 5)); const OUT = arg('--out', null);
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.wasm': 'application/wasm', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = p.startsWith('/node_modules/') ? path.join(BENCH_DIR, p) : path.join(here, p === '/' ? 'occt-browser.html' : p);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream', });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const pkg = JSON.parse(fs.readFileSync(path.join(BENCH_DIR, 'node_modules', 'occt-wasm', 'package.json'), 'utf8'));
const readme = fs.readFileSync(path.join(BENCH_DIR, 'node_modules', 'occt-wasm', 'README.md'), 'utf8');
const licenceReadme = (readme.match(/^\*\*Compiled WASM output\*\*.*$/m) || readme.match(/LGPL[^\n]*/) || [''])[0];
const browser = await chromium.launch({ args: ['--enable-precise-memory-info'] });
const version = await browser.version();
const LIMITE_MS = Number(arg('--limite', 60000)); // délai par cas : au-delà, le cas est noté « délai dépassé » (OCCT peut boucler)
async function pageCas(cas) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(String(e))); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const t = Date.now();
  let result = null, error = null;
  try {
    await page.goto(`${base}/?repetitions=${REP}&cas=${cas}`);
    await page.waitForFunction(() => window.__benchResult || window.__benchError, null, { timeout: LIMITE_MS });
    result = await page.evaluate(() => window.__benchResult); error = await page.evaluate(() => window.__benchError);
  } catch (e) { error = `délai de ${LIMITE_MS} ms dépassé`; }
  await ctx.close();
  return { result, error, consoleErrors: errors.slice(0, 3), wallClockMs: Date.now() - t };
}
const t = Date.now();
const init = await pageCas('init');
const NB_CAS = 20;
const cas = [];
for (let i = 0; i < NB_CAS; i++) {
  const r = await pageCas(String(i));
  const c = r.result && r.result.cas && r.result.cas[0] ? r.result.cas[0] : { nom: `cas ${i + 1}`, statut: 'délai dépassé', erreur: r.error };
  if (!r.result) c.statut = 'délai dépassé';
  cas.push(c); console.error(`${c.statut === 'ok' ? '✓' : '✗'} ${c.nom} — ${c.statut}${c.medianMs !== undefined ? ` ${c.medianMs} ms` : ''}${c.erreur ? ' — ' + c.erreur : ''}`);
}
const worker = await pageCas('worker');
await browser.close(); server.close();
const result = { ...(init.result || {}), cas, worker: worker.result ? worker.result.worker : { statut: 'délai dépassé', erreur: worker.error },
  ok: cas.filter((c) => c.statut === 'ok').length, ecarts: cas.filter((c) => c.statut === 'écart').length, erreurs: cas.filter((c) => c.statut === 'erreur').length, delais: cas.filter((c) => c.statut === 'délai dépassé').length };
const error = init.error; const errors = init.consoleErrors;
const report = { bench: { machine: { platform: `${os.type()} ${os.release()} ${os.arch()}`, cpu: os.cpus()[0]?.model, cores: os.cpus().length, totalMemMB: Math.round(os.totalmem() / 1048576), node: process.version }, chromium: version, wallClockMs: Date.now() - t },
  paquet: { name: pkg.name, version: pkg.version, licenseChampNpm: pkg.license, licenceWasmReadme: licenceReadme.trim(), repository: pkg.repository?.url }, result, error, consoleErrors: errors.slice(0, 5) };
console.log(JSON.stringify(report, null, 2));
if (OUT) fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
