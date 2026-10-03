// Banc L0.4 — manifold-3d : taille du .wasm, temps d'initialisation, booléen (différence) mur 4 × 0,2 × 3 m
// moins ouverture 1 × 0,3 × 2,1 m répété 100 fois (médiane), triangles résultants, licence.
// Usage : BENCH_DIR=<dossier hors dépôt où `npm i manifold-3d` a été exécuté> node scripts/bench/manifold-bench.mjs [--out fichier.json]
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { pathToFileURL } from 'node:url';

const BENCH_DIR = process.env.BENCH_DIR;
if (!BENCH_DIR) { console.error('BENCH_DIR requis'); process.exit(2); }
const argv = process.argv.slice(2);
const OUT = argv.includes('--out') ? argv[argv.indexOf('--out') + 1] : null;
const ms = (t) => Math.round((performance.now() - t) * 1000) / 1000;
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p / 100 * s.length))]; };

const pkgDir = path.join(BENCH_DIR, 'node_modules', 'manifold-3d'); // ./package.json n'est pas exporté par le paquet
const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
const report = { node: process.version, package: { name: pkg.name, version: pkg.version, license: pkg.license }, files: {}, init: {}, boolean: {} };
for (const f of fs.readdirSync(pkgDir).filter((f) => f.endsWith('.wasm') || f === 'manifold.js')) {
  const buf = fs.readFileSync(path.join(pkgDir, f));
  const br = zlib.brotliCompressSync(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } });
  const gz = zlib.gzipSync(buf, { level: 9 });
  report.files[f] = { rawBytes: buf.length, brotli11Bytes: br.length, gzip9Bytes: gz.length };
}

const exp = pkg.exports && pkg.exports['.'];
const pick = (e) => (typeof e === 'string' ? e : e ? pick(e.import || e.default) : null);
const entry = path.join(pkgDir, pick(exp) || pkg.main || 'manifold.js');
const tImport = performance.now();
const mod = await import(pathToFileURL(entry).href);
report.init.importMs = ms(tImport);
const tInit = performance.now();
const wasm = await mod.default();
wasm.setup();
report.init.initMs = ms(tInit);
report.init.entry = path.relative(pkgDir, entry);
const { Manifold } = wasm;

// Mur 4 × 0,2 × 3 m (x = longueur, y = épaisseur, z = hauteur) ; ouverture 1 × 0,3 × 2,1 m traversant l'épaisseur,
// posée à x = 1,5 m, allège 0,45 m (percement complet, genre attendu : 1).
const wall = Manifold.cube([4, 0.2, 3], false);
const opening = Manifold.cube([1, 0.3, 2.1], false).translate([1.5, -0.05, 0.45]);
const times = [];
let result = null;
for (let i = 0; i < 100; i++) {
  const t = performance.now();
  const r = wall.subtract(opening);
  const n = r.numTri(); // force l'évaluation
  times.push(ms(t));
  if (result) result.delete();
  result = r;
  if (n === 0) throw new Error('résultat vide');
}
report.boolean = {
  repetitions: times.length, medianMs: median(times), p95Ms: pct(times, 95), minMs: Math.min(...times), maxMs: Math.max(...times),
  inputTriangles: { wall: wall.numTri(), opening: opening.numTri() },
  resultTriangles: result.numTri(), resultVertices: result.numVert(),
  resultVolumeM3: Math.round(result.volume() * 1e6) / 1e6, expectedVolumeM3: 4 * 0.2 * 3 - 1 * 0.2 * 2.1,
  resultSurfaceM2: Math.round(result.surfaceArea() * 1e4) / 1e4, genus: result.genus(), status: result.status ? String(result.status()) : null,
};
// Variante : 100 ouvertures différentes dans le même mur (union des ouvertures puis une différence), pour l'ordre de grandeur.
{
  const ops = [];
  for (let i = 0; i < 20; i++) ops.push(Manifold.cube([0.1, 0.3, 0.3], false).translate([0.1 + i * 0.19, -0.05, 0.5 + (i % 3) * 0.6]));
  const t = performance.now();
  const r = wall.subtract(Manifold.union(ops));
  const n = r.numTri();
  report.boolean.twentyOpenings = { ms: ms(t), resultTriangles: n };
  r.delete(); ops.forEach((o) => o.delete());
}
report.memoryRssMB = Math.round(process.memoryUsage().rss / 1048576);
const json = JSON.stringify(report, null, 2);
if (OUT) fs.writeFileSync(OUT, json);
console.log(json);
