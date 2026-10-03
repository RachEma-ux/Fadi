// Processus enfant : initialise UN candidat WASM et imprime une ligne JSON { initMs, rssDeltaMo, verification }.
// Le temps couvre import du module JS + lecture + compilation + instanciation du .wasm, jusqu'à l'API prête.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ici = dirname(fileURLToPath(import.meta.url));
const nm = (p) => join(ici, "..", "node_modules", p);
const id = process.argv[2];

globalThis.gc?.();
const rss0 = process.memoryUsage().rss;
const t0 = performance.now();
let verification;

if (id === "web-ifc") {
  const { IfcAPI, IFC4X3 } = await import("web-ifc");
  const api = new IfcAPI();
  api.SetWasmPath(nm("web-ifc") + "/", true);
  await api.Init(undefined, true);
  const t = performance.now();
  const m = api.CreateModel({ schema: "IFC4X3" });
  verification = { modeleCree: m >= 0, schemaIFC4X3Present: typeof IFC4X3?.IfcWall === "function", apresInitMs: performance.now() - t };
} else if (id === "manifold-3d") {
  const Module = (await import("manifold-3d")).default;
  const wasm = await Module();
  wasm.setup();
  const c = wasm.Manifold.cube([1, 2, 3]);
  verification = { volumeCube123: c.volume() };
  c.delete();
} else if (id === "occt-wasm") {
  const { OcctKernel } = await import("occt-wasm");
  const k = await OcctKernel.init({ wasm: new Uint8Array(readFileSync(nm("occt-wasm/dist/occt-wasm.wasm"))) });
  const b = k.makeBox(1, 2, 3);
  verification = { volumeBoite123: k.getVolume(b) };
} else if (id === "opencascade.js") {
  // Construction Emscripten ancienne (ESM sans `require` en Node) : on fournit require/__dirname et le binaire.
  globalThis.require = createRequire(import.meta.url);
  globalThis.__dirname = nm("opencascade.js/dist");
  globalThis.__filename = nm("opencascade.js/dist/opencascade.wasm.js");
  const fabrique = (await import(nm("opencascade.js/dist/opencascade.wasm.js"))).default;
  const wasmBinary = readFileSync(nm("opencascade.js/dist/opencascade.wasm.wasm"));
  const oc = await new Promise((ok, ko) => {
    const m = fabrique({ wasmBinary, onAbort: ko });
    if (m && m.ready) m.ready.then(ok, ko);
    else ok(m);
  });
  const p = new oc.gp_Pnt_3(1, 2, 3);
  verification = { pointGpPnt: [p.X(), p.Y(), p.Z()], classeMakeBoxPresente: typeof oc.BRepPrimAPI_MakeBox_2 === "function" };
} else {
  throw new Error(`Candidat inconnu : ${id}`);
}

const initMs = performance.now() - t0;
const rssDeltaMo = (process.memoryUsage().rss - rss0) / 2 ** 20;
console.log(JSON.stringify({ id, initMs, rssDeltaMo, verification }));
process.exit(0);
