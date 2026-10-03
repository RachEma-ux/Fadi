// Banc L0.4 — three.js WebGL2 (et WebGPU si disponible), WebGPU, quotas navigateur.
// Usage : BENCH_DIR=<dossier hors dépôt contenant node_modules/three> node scripts/bench/three-bench.mjs [--frames 300] [--viewport 1536x864] [--sync readpixels|none] [--out fichier.json]
// Le script utilise le paquet `playwright` du dépôt et le Chromium Playwright installé (PLAYWRIGHT_BROWSERS_PATH).
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const BENCH_DIR = process.env.BENCH_DIR;
if (!BENCH_DIR || !fs.existsSync(path.join(BENCH_DIR, 'node_modules', 'three'))) {
  console.error('BENCH_DIR doit pointer vers un dossier (hors dépôt) où `npm i three` a été exécuté.');
  process.exit(2);
}
const argv = process.argv.slice(2);
const arg = (name, def) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : def; };
const FRAMES = Number(arg('--frames', 300));
const OUT = arg('--out', null);
const SYNC = arg('--sync', 'readpixels');
const vp = arg('--viewport', '1536x864').split('x').map(Number);
const VIEWPORT = { width: vp[0], height: vp[1] };

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.wasm': 'application/wasm' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  const file = p.startsWith('/node_modules/') ? path.join(BENCH_DIR, p) : path.join(here, p === '/' ? 'three-scene.html' : p);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream', 'cross-origin-opener-policy': 'same-origin', 'cross-origin-embedder-policy': 'require-corp' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const baseArgs = ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--disable-frame-rate-limit', '--disable-gpu-vsync', '--enable-precise-memory-info'];
const webgpuArgSets = [
  [],
  ['--enable-unsafe-webgpu'],
  ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader'],
  ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-vulkan=swiftshader', '--use-webgpu-adapter=swiftshader'],
];

async function runScene(browser, variant, backend) {
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 }); // cache froid : nouveau contexte par mesure
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
  const t = Date.now();
  await page.goto(`${base}/?variant=${variant}&backend=${backend}&frames=${FRAMES}&sync=${SYNC}`);
  await page.waitForFunction(() => window.__benchResult || window.__benchError, null, { timeout: 600000 });
  const result = await page.evaluate(() => window.__benchResult);
  const error = await page.evaluate(() => window.__benchError);
  await ctx.close();
  return { ...(result || {}), error, consoleErrors: errors.slice(0, 5), wallClockMs: Date.now() - t };
}

async function probeWebGPU(browser) {
  const page = await browser.newPage();
  const r = await page.evaluate(async () => {
    const out = { hasNavigatorGpu: 'gpu' in navigator, adapter: null, error: null };
    if (!out.hasNavigatorGpu) return out;
    try {
      const a = await navigator.gpu.requestAdapter();
      if (a) { const info = a.info || (a.requestAdapterInfo ? await a.requestAdapterInfo() : {}); out.adapter = { vendor: info.vendor, architecture: info.architecture, device: info.device, description: info.description, isFallbackAdapter: a.isFallbackAdapter ?? null, features: [...a.features].slice(0, 20) }; }
    } catch (e) { out.error = String(e); }
    return out;
  });
  await page.close();
  return r;
}

const report = {
  bench: {
    machine: { platform: `${os.type()} ${os.release()} ${os.arch()}`, cpu: os.cpus()[0]?.model, cores: os.cpus().length, totalMemMB: Math.round(os.totalmem() / 1048576), node: process.version },
    browser: null, viewport: VIEWPORT, launchArgs: baseArgs, frames: FRAMES, sync: SYNC, cache: 'froid (nouveau contexte navigateur par mesure, serveur HTTP local, pas de service worker)',
  },
  webgl2: {}, webgpu: { probes: [] }, storage: null,
};

const browser = await chromium.launch({ channel: 'chromium', headless: true, args: baseArgs });
report.bench.browser = `${browser.browserType().name()} ${browser.version()} (Playwright ${(await import('playwright/package.json', { with: { type: 'json' } })).default.version}, headless)`;
for (const variant of ['A', 'B']) {
  report.webgl2[variant] = await runScene(browser, variant, 'webgl2');
  console.error(`WebGL2 variante ${variant} : première image ${report.webgl2[variant].timingsMs?.firstFrameSinceNavigation?.toFixed(0)} ms, trame p95 ${report.webgl2[variant].frame?.renderPlusSync?.p95?.toFixed(1)} ms, draw calls ${report.webgl2[variant].drawCalls?.lastFrame?.calls}`);
}
// Quotas navigateur (page locale http://127.0.0.1 = contexte sécurisé).
{
  const page = await browser.newPage();
  await page.goto(`${base}/`);
  report.storage = await page.evaluate(async () => {
    const out = { hasStorageManager: 'storage' in navigator, estimate: null, persistAvailable: typeof navigator.storage?.persist === 'function', persisted: null, persistResult: null, error: null };
    try { out.estimate = await navigator.storage.estimate(); } catch (e) { out.error = String(e); }
    try { out.persisted = await navigator.storage.persisted(); out.persistResult = await navigator.storage.persist(); } catch (e) { out.error = (out.error || '') + ' ' + String(e); }
    return out;
  });
  await page.close();
}
report.webgpu.probes.push({ args: [], ...(await probeWebGPU(browser)) });
await browser.close();

// WebGPU : essais successifs de drapeaux ; le banc WebGPU n'est lancé que si un adaptateur existe.
let gpuBrowser = null, gpuArgs = null;
for (const extra of webgpuArgSets.slice(1)) {
  if (report.webgpu.probes.some((p) => p.adapter)) break;
  const b = await chromium.launch({ channel: 'chromium', headless: true, args: [...baseArgs, ...extra] });
  const probe = await probeWebGPU(b);
  report.webgpu.probes.push({ args: extra, ...probe });
  if (probe.adapter) { gpuBrowser = b; gpuArgs = extra; } else await b.close();
}
if (gpuBrowser) {
  report.webgpu.launchArgs = gpuArgs;
  for (const variant of ['A', 'B']) {
    report.webgpu[variant] = await runScene(gpuBrowser, variant, 'webgpu');
    console.error(`WebGPU variante ${variant} : ${report.webgpu[variant].error ? 'ERREUR ' + report.webgpu[variant].error.slice(0, 200) : 'trame p95 ' + report.webgpu[variant].frame?.renderPlusSync?.p95?.toFixed(1) + ' ms'}`);
  }
  await gpuBrowser.close();
} else {
  report.webgpu.status = 'non mesuré : aucun adaptateur WebGPU (navigator.gpu.requestAdapter() → null) dans Chromium headless du bac à sable, drapeaux essayés listés dans probes';
}
server.close();
const json = JSON.stringify(report, null, 2);
if (OUT) fs.writeFileSync(OUT, json);
console.log(json);
