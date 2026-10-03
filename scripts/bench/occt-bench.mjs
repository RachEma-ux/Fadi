// Banc L0.4 — OCCT WASM : temps d'initialisation en Node (borné), booléen `cut` mur − ouverture, tessellation.
// Deux candidats hors dépôt (aucune dépendance OCCT n'est ajoutée au dépôt, lot optionnel réservé au maître d'ouvrage) :
//   - occt-wasm (MIT OR Apache-2.0) : installé dans BENCH_DIR (`npm i occt-wasm`), API `OcctKernel`.
//   - opencascade.js 1.1.1 (LGPL-2.1-only) : archive `npm pack opencascade.js@1.1.1` extraite dans OCJS_DIR (dossier `package/`).
// Usage : BENCH_DIR=<dossier> [OCJS_DIR=<dossier>/package] node scripts/bench/occt-bench.mjs [--out fichier.json]
// Tailles compressées : voir brotli-size.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const BENCH_DIR = process.env.BENCH_DIR;
const OCJS_DIR = process.env.OCJS_DIR || null;
if (!BENCH_DIR) { console.error('BENCH_DIR requis'); process.exit(2); }
const argv = process.argv.slice(2);
const OUT = argv.includes('--out') ? argv[argv.indexOf('--out') + 1] : null;
const ms = (t) => Math.round((performance.now() - t) * 100) / 100;
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const withTimeout = (p, limitMs, label) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${label} : délai de ${limitMs} ms dépassé`)), limitMs).unref())]);
const rssMB = () => Math.round(process.memoryUsage().rss / 1048576);

const report = { node: process.version, 'occt-wasm': {}, 'opencascade.js': {} };

// 1. occt-wasm
{
  const r = report['occt-wasm'];
  try {
    const dir = path.join(BENCH_DIR, 'node_modules', 'occt-wasm');
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    r.package = { version: pkg.version, license: pkg.license };
    r.wasmBytes = fs.statSync(path.join(dir, 'dist', 'occt-wasm.wasm')).size;
    const rss0 = rssMB();
    const tImp = performance.now();
    const { OcctKernel } = await import(pathToFileURL(path.join(dir, 'dist', 'index.js')).href);
    r.importMs = ms(tImp);
    const tInit = performance.now();
    const kernel = await withTimeout(OcctKernel.init(), 120000, 'OcctKernel.init');
    r.initMs = ms(tInit);
    r.rssAfterInitMB = rssMB();
    r.rssDeltaMB = r.rssAfterInitMB - rss0;
    // Mur 4 × 0,2 × 3 m moins ouverture 1 × 0,3 × 2,1 m (allège 0,45 m), 20 répétitions.
    const wall = kernel.makeBox(4, 0.2, 3);
    // Vec3 = { x, y, z } (un tableau est accepté sans erreur mais produit une forme dégénérée de volume nul : observé au lot 0).
    const opening = kernel.makeBoxFromCorners({ x: 1.5, y: -0.05, z: 0.45 }, { x: 2.5, y: 0.25, z: 2.55 });
    const times = [];
    let result = null;
    for (let i = 0; i < 20; i++) { const t = performance.now(); result = kernel.cut(wall, opening); times.push(ms(t)); }
    r.cut = { repetitions: times.length, medianMs: median(times), minMs: Math.min(...times), maxMs: Math.max(...times) };
    r.topology = { wallFaces: kernel.getSubShapes(wall, 'face').length, resultFaces: kernel.getSubShapes(result, 'face').length, resultSolids: kernel.getSubShapes(result, 'solid').length };
    const solid = kernel.getSubShapes(result, 'solid')[0] ?? result;
    const tMesh = performance.now();
    const mesh = kernel.tessellate(solid, { linearDeflection: 0.01, angularDeflection: 0.5 });
    r.tessellate = { ms: ms(tMesh), triangles: mesh.indices ? mesh.indices.length / 3 : null, vertices: mesh.positions ? mesh.positions.length / 3 : null };
    r.volumeM3 = Math.round(kernel.getVolume(solid) * 1e6) / 1e6;
    if (typeof kernel.dispose === 'function') kernel.dispose(); else if (kernel[Symbol.dispose]) kernel[Symbol.dispose]();
    r.status = 'mesuré';
  } catch (e) {
    r.status = 'non mesuré : ' + String(e && e.message ? e.message : e);
  }
}

if (OUT) fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
// 2. opencascade.js 1.1.1 (chargeur Emscripten 2021 : CommonJS `require` attendu même en ESM → fourni globalement pour l'essai).
{
  const r = report['opencascade.js'];
  if (!OCJS_DIR) { r.status = 'non mesuré : OCJS_DIR non fourni'; }
  else {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(OCJS_DIR, 'package.json'), 'utf8'));
      r.package = { version: pkg.version, license: pkg.license };
      const wasmPath = path.join(OCJS_DIR, 'dist', 'opencascade.wasm.wasm');
      r.wasmBytes = fs.statSync(wasmPath).size;
      globalThis.require = createRequire(import.meta.url);
      globalThis.__filename = path.join(OCJS_DIR, 'dist', 'opencascade.wasm.js');
      globalThis.__dirname = path.dirname(globalThis.__filename);
      const rss0 = rssMB();
      const tImp = performance.now();
      const mod = await import(pathToFileURL(path.join(OCJS_DIR, 'dist', 'opencascade.wasm.js')).href);
      r.importMs = ms(tImp);
      const factory = mod.default;
      const tInit = performance.now();
      // Node ≥ 18 expose fetch() : le chargeur 2021 tenterait fetch(chemin local) ; on fournit le binaire directement.
      const oc = await withTimeout(new factory({ wasmBinary: new Uint8Array(fs.readFileSync(wasmPath)), locateFile: (p) => (p.endsWith('.wasm') ? wasmPath : p) }), 120000, 'opencascade.js init');
      r.initMs = ms(tInit);
      r.rssAfterInitMB = rssMB();
      r.rssDeltaMB = r.rssAfterInitMB - rss0;
      // Booléen BRepAlgoAPI_Cut mur − ouverture, 20 répétitions, puis maillage BRepMesh_IncrementalMesh.
      // Surcharges numérotées d'opencascade.js : BRepPrimAPI_MakeBox_3 = (gp_Pnt, gp_Pnt).
      const box = (x1, y1, z1, x2, y2, z2) => new oc.BRepPrimAPI_MakeBox_3(new oc.gp_Pnt_3(x1, y1, z1), new oc.gp_Pnt_3(x2, y2, z2)).Shape();
      const wall = box(0, 0, 0, 4, 0.2, 3);
      const opening = box(1.5, -0.05, 0.45, 2.5, 0.25, 2.55);
      const firstOk = (label, candidates) => { const errs = []; for (const c of candidates) { try { return c(); } catch (e) { errs.push(String(e && e.message ? e.message : e).slice(0, 120)); } } throw new Error(label + ' : ' + errs.join(' / ')); };
      const doCut = () => firstOk('BRepAlgoAPI_Cut', [
        () => { const c = new oc.BRepAlgoAPI_Cut_3(wall, opening, new oc.Message_ProgressRange_1()); c.Build(new oc.Message_ProgressRange_1()); return c.Shape(); },
        () => { const c = new oc.BRepAlgoAPI_Cut_3(wall, opening); c.Build(); return c.Shape(); },
      ]);
      const times = [];
      let result = null;
      for (let i = 0; i < 20; i++) { const t = performance.now(); result = doCut(); times.push(ms(t)); }
      r.cut = { repetitions: times.length, medianMs: median(times), minMs: Math.min(...times), maxMs: Math.max(...times) };
      try {
        const props = new oc.GProp_GProps_1();
        firstOk('VolumeProperties', [() => oc.BRepGProp.VolumeProperties_1(result, props, false, false, false), () => oc.BRepGProp.VolumeProperties_1(result, props, 1e-7, false, false), () => oc.BRepGProp.VolumeProperties_1(result, props)]);
        r.volumeM3 = Math.round(props.Mass() * 1e6) / 1e6;
      } catch (e) { r.volumeM3 = 'non mesuré : ' + String(e.message).slice(0, 200); }
      try {
        const tMesh = performance.now();
        firstOk('BRepMesh_IncrementalMesh', [() => new oc.BRepMesh_IncrementalMesh_2(result, 0.01, false, 0.5, false), () => new oc.BRepMesh_IncrementalMesh_2(result, 0.01, false, 0.5)]);
        let triangles = 0, faces = 0;
        const explorer = new oc.TopExp_Explorer_2(result, oc.TopAbs_ShapeEnum.TopAbs_FACE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
        for (; explorer.More(); explorer.Next()) {
          faces++;
          const face = oc.TopoDS.Face_1(explorer.Current());
          const loc = new oc.TopLoc_Location_1();
          const tri = firstOk('Triangulation', [() => oc.BRep_Tool.Triangulation(face, loc, 0), () => oc.BRep_Tool.Triangulation(face, loc)]);
          if (!tri.IsNull()) triangles += tri.get().NbTriangles();
        }
        r.tessellate = { ms: ms(tMesh), faces, triangles };
      } catch (e) { r.tessellate = 'non mesuré : ' + String(e.message).slice(0, 300); }
      r.status = 'mesuré';
    } catch (e) {
      r.status = 'non mesuré : ' + String(e && e.message ? e.message : e).slice(0, 300);
      r.initMs = r.initMs ?? null;
    }
  }
}
const json = JSON.stringify(report, null, 2);
if (OUT) fs.writeFileSync(OUT, json);
console.log(json);
process.exit(0);
