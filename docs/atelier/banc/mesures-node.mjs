// Mesures purement Node : tailles et initialisation des WASM candidats, booléens manifold-3d, Yjs,
// écriture IFC 4.3 (web-ifc contre écriture directe). Écrit resultats/node-<lieu>.json.
// Usage : node --expose-gc mesures-node.mjs [--repetitions=3]
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { chargerSceneP118 } from "./lib/p118.mjs";
import { mesurerTailles, mesurerInitNode } from "./lib/wasm.mjs";
import { mesurerManifold } from "./lib/manifold.mjs";
import { mesurerYjs } from "./lib/yjs.mjs";
import { mesurerIfc } from "./lib/ifc.mjs";
import { decrireMachine } from "./lib/machine.mjs";

const ici = dirname(fileURLToPath(import.meta.url));

async function etape(nom, fn) {
  const t0 = performance.now();
  try {
    const r = await fn();
    console.error(`  ✓ ${nom} (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
    return r;
  } catch (e) {
    console.error(`  ✗ ${nom} : ${e?.message ?? e}`);
    return { erreur: String(e?.stack ?? e).slice(0, 1000) };
  }
}

export async function mesuresNode({ repetitions = 3 } = {}) {
  if (!globalThis.gc) console.error("  (avertissement : lancer avec --expose-gc pour des mesures de tas fiables)");
  const scene = chargerSceneP118();
  console.error("Mesures Node :");
  const r = {
    machine: decrireMachine(),
    scene: { source: scene.source, comptes: scene.comptes },
    wasmTailles: await etape("tailles WASM", () => mesurerTailles()),
    wasmInitNode: await etape(`initialisation WASM (Node, processus neuf, ${repetitions} essais)`, () => mesurerInitNode(repetitions)),
    manifold: await etape("booléens manifold-3d", () => mesurerManifold(scene)),
    yjs: await etape("Yjs", () => mesurerYjs(scene)),
    ifc: await etape("écriture IFC 4.3", () => mesurerIfc(scene)),
  };
  return r;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const rep = Number((process.argv.find((a) => a.startsWith("--repetitions=")) ?? "=3").split("=")[1]);
  const r = await mesuresNode({ repetitions: rep });
  mkdirSync(join(ici, "resultats"), { recursive: true });
  const nom = r.machine.lieu === "GitHub Actions" ? "node-github-actions.json" : "node-poste-local.json";
  writeFileSync(join(ici, "resultats", nom), JSON.stringify(r, null, 2));
  console.error(`Écrit resultats/${nom}`);
}
