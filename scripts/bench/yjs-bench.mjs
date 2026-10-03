// Banc L0.4 — Yjs : Y.Doc avec une Y.Map de 1 000 annotations (≈ 80 caractères), taille de encodeStateAsUpdate,
// temps d'application d'une mise à jour complète et d'une mise à jour incrémentale (granularité), mémoire, licence.
// Deux formes : (a) valeurs chaînes dans la Y.Map ; (b) une Y.Text par annotation (co-édition de texte caractère par caractère).
// Usage : BENCH_DIR=<dossier hors dépôt où `npm i yjs` a été exécuté> node --expose-gc scripts/bench/yjs-bench.mjs [--out fichier.json]
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const BENCH_DIR = process.env.BENCH_DIR;
if (!BENCH_DIR) { console.error('BENCH_DIR requis'); process.exit(2); }
const require = createRequire(path.join(BENCH_DIR, 'package.json'));
const argv = process.argv.slice(2);
const OUT = argv.includes('--out') ? argv[argv.indexOf('--out') + 1] : null;
const ms = (t) => Math.round((performance.now() - t) * 1000) / 1000;
const gc = () => { if (global.gc) { global.gc(); global.gc(); } };
const heap = () => { gc(); return process.memoryUsage().heapUsed; };
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

const pkg = require('yjs/package.json');
const Y = require('yjs');
const report = { node: process.version, gcExposed: !!global.gc, package: { name: pkg.name, version: pkg.version, license: pkg.license }, bundle: {}, variants: {} };
{
  const f = path.join(path.dirname(require.resolve('yjs/package.json')), 'dist', 'yjs.mjs');
  if (fs.existsSync(f)) { const buf = fs.readFileSync(f); report.bundle['dist/yjs.mjs'] = { rawBytes: buf.length, brotli11Bytes: zlib.brotliCompressSync(buf).length, gzip9Bytes: zlib.gzipSync(buf, { level: 9 }).length }; }
}
const N = 1000;
const text = (i) => `Annotation ${String(i).padStart(4, '0')} : vérifier la hauteur d'allège du mur et la jonction au plancher.`.slice(0, 80);
const payloadBytes = Array.from({ length: N }, (_, i) => Buffer.byteLength(text(i), 'utf8')).reduce((a, b) => a + b, 0);
report.payload = { annotations: N, charsPerAnnotation: text(0).length, utf8Bytes: payloadBytes, jsonBytes: Buffer.byteLength(JSON.stringify(Object.fromEntries(Array.from({ length: N }, (_, i) => ['a' + i, text(i)]))), 'utf8') };

for (const variant of ['map-strings', 'map-of-ytext']) {
  const v = {};
  report.variants[variant] = v;
  const h0 = heap();
  const doc = new Y.Doc();
  const map = doc.getMap('annotations');
  const t = performance.now();
  doc.transact(() => {
    for (let i = 0; i < N; i++) {
      if (variant === 'map-strings') map.set('a' + i, text(i));
      else { const yt = new Y.Text(); map.set('a' + i, yt); yt.insert(0, text(i)); }
    }
  });
  v.buildMs = ms(t);
  const h1 = heap();
  v.docHeapBytes = h1 - h0;
  const tEnc = performance.now();
  const update = Y.encodeStateAsUpdate(doc);
  v.encodeMs = ms(tEnc);
  v.updateBytes = update.length;
  v.updateBrotliBytes = zlib.brotliCompressSync(update).length;
  v.stateVectorBytes = Y.encodeStateVector(doc).length;
  // Application de la mise à jour complète dans un document vierge (5 répétitions, médiane).
  const applyTimes = [];
  let doc2 = null;
  for (let i = 0; i < 5; i++) { doc2 = new Y.Doc(); const a = performance.now(); Y.applyUpdate(doc2, update); applyTimes.push(ms(a)); }
  v.applyFullMs = median(applyTimes);
  v.appliedCount = doc2.getMap('annotations').size;
  // Mise à jour incrémentale : modification d'une annotation, encodée depuis le vecteur d'état du pair.
  const sv2 = Y.encodeStateVector(doc2);
  const tInc = performance.now();
  if (variant === 'map-strings') map.set('a500', text(500).replace('vérifier', 'valider'));
  else map.get('a500').insert(20, ' [modifié]');
  const inc = Y.encodeStateAsUpdate(doc, sv2);
  v.incrementalEncodeMs = ms(tInc);
  v.incrementalUpdateBytes = inc.length;
  const tApp = performance.now();
  Y.applyUpdate(doc2, inc);
  v.incrementalApplyMs = ms(tApp);
  v.incrementalConsistent = variant === 'map-strings' ? doc2.getMap('annotations').get('a500') === map.get('a500') : doc2.getMap('annotations').get('a500').toString() === map.get('a500').toString();
  // Événement d'observation : granularité (clé modifiée seulement).
  let observed = null;
  map.observe((e) => { observed = [...e.keysChanged]; });
  if (variant === 'map-strings') map.set('a7', 'x'); else map.get('a7').insert(0, 'x');
  v.observedKeysOnEdit = observed;
  v.heapAfterAllBytes = heap() - h0;
  doc.destroy(); doc2.destroy();
}
report.memoryRssMB = Math.round(process.memoryUsage().rss / 1048576);
const json = JSON.stringify(report, null, 2);
if (OUT) fs.writeFileSync(OUT, json);
console.log(json);
