// Banc L0.4 — web-ifc : taille des .wasm (brut, brotli, gzip), temps d'initialisation, version, schémas,
// essai d'écriture minimale IFC4X3 (IfcProject + IfcWall), export et relecture.
// Usage : BENCH_DIR=<dossier hors dépôt où `npm i web-ifc` a été exécuté> node scripts/bench/web-ifc-bench.mjs [--out fichier.json]
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';

const BENCH_DIR = process.env.BENCH_DIR;
if (!BENCH_DIR) { console.error('BENCH_DIR requis'); process.exit(2); }
const require = createRequire(path.join(BENCH_DIR, 'package.json'));
const argv = process.argv.slice(2);
const OUT = argv.includes('--out') ? argv[argv.indexOf('--out') + 1] : null;
const ms = (t) => Math.round((performance.now() - t) * 100) / 100;

const report = { node: process.version, package: null, files: {}, init: {}, schemas: null, write: {} };
const pkgDir = path.join(BENCH_DIR, 'node_modules', 'web-ifc'); // ./package.json n'est pas exporté par le paquet
const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
report.package = { name: pkg.name, version: pkg.version, license: pkg.license };

for (const f of ['web-ifc.wasm', 'web-ifc-mt.wasm', 'web-ifc-node.wasm', 'web-ifc-api.js', 'web-ifc-api-node.js']) {
  const buf = fs.readFileSync(path.join(pkgDir, f));
  const tb = performance.now();
  const br = zlib.brotliCompressSync(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } });
  const brotliMs = ms(tb);
  const gz = zlib.gzipSync(buf, { level: 9 });
  report.files[f] = { rawBytes: buf.length, brotli11Bytes: br.length, gzip9Bytes: gz.length, brotliCompressMs: brotliMs };
}

const tReq = performance.now();
const WebIFC = require(path.join(pkgDir, 'web-ifc-api-node.js')); // entrée Node (CJS) du paquet
report.init.requireMs = ms(tReq);
const api = new WebIFC.IfcAPI();
const tInit = performance.now();
await api.Init();
report.init.initMs = ms(tInit);
try { report.init.version = api.GetVersion(); } catch (e) { report.init.version = 'GetVersion indisponible : ' + e; }
report.schemas = WebIFC.Schemas ? Object.fromEntries(Object.entries(WebIFC.Schemas).filter(([k]) => !/^\d/.test(k))) : null;
report.hasIFC4X3Namespace = !!WebIFC.IFC4X3;

// Essai d'écriture minimale : IFC4X3 (repli IFC4 si CreateModel refuse).
// GUID IFC (22 caractères, base 64 IFC) à partir d'un UUID v4.
const guid = () => {
  const hex = crypto.randomUUID().replace(/-/g, '');
  const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';
  let n = BigInt('0x' + hex), out = '';
  for (let i = 0; i < 22; i++) { out = alphabet[Number(n & 63n)] + out; n >>= 6n; }
  return out;
};
for (const schemaKey of ['IFC4X3', 'IFC4']) {
  const schema = WebIFC.Schemas[schemaKey];
  const w = { schemaKey, schemaValue: schema, ok: false };
  report.write[schemaKey] = w;
  try {
    const t = performance.now();
    const modelID = api.CreateModel({ schema, name: 'banc-l0', description: ['Banc L0.4'], authors: ['Fadi'], organizations: ['Fadi'], authorization: 'none' });
    const NS = WebIFC[schemaKey];
    const label = (s) => new NS.IfcLabel(s);
    const project = api.CreateIfcEntity(modelID, WebIFC.IFCPROJECT, new NS.IfcGloballyUniqueId(guid()), null, label('Projet banc'), null, null, null, null, null, null);
    api.WriteLine(modelID, project);
    const wallArgs = [new NS.IfcGloballyUniqueId(guid()), null, label('Mur 01'), null, null, null, null, null, null];
    const wall = api.CreateIfcEntity(modelID, WebIFC.IFCWALL, ...wallArgs);
    api.WriteLine(modelID, wall);
    w.expressIDs = { project: project.expressID, wall: wall.expressID };
    const bytes = api.SaveModel(modelID);
    w.writeMs = ms(t);
    w.savedBytes = bytes.length;
    const text = Buffer.from(bytes).toString('utf8');
    w.fileSchemaLine = (text.match(/FILE_SCHEMA\s*\([^;]*\)\s*;/) || [null])[0];
    w.entityLines = text.split('\n').filter((l) => /^#\d+\s*=/.test(l)).map((l) => l.trim());
    api.CloseModel(modelID);
    const file = path.join(BENCH_DIR, 'out', `banc-${schemaKey}.ifc`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, bytes);
    w.file = file;
    // Relecture
    const t2 = performance.now();
    const m2 = api.OpenModel(fs.readFileSync(file));
    w.reread = { ms: ms(t2), schema: api.GetModelSchema(m2), lineCount: api.GetAllLines(m2).size() };
    const walls = api.GetLineIDsWithType(m2, WebIFC.IFCWALL);
    w.reread.wallCount = walls.size();
    if (walls.size() > 0) { const line = api.GetLine(m2, walls.get(0)); w.reread.wallName = line.Name && line.Name.value; w.reread.wallType = line.constructor && line.constructor.name; }
    const projects = api.GetLineIDsWithType(m2, WebIFC.IFCPROJECT);
    w.reread.projectCount = projects.size();
    api.CloseModel(m2);
    w.ok = w.reread.schema === schema && w.reread.wallCount === 1 && w.reread.projectCount === 1;
    if (w.ok) break; // 4X3 suffit, pas besoin du repli IFC4
  } catch (e) {
    w.error = String(e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e);
  }
}
const json = JSON.stringify(report, null, 2);
if (OUT) fs.writeFileSync(OUT, json);
console.log(json);
