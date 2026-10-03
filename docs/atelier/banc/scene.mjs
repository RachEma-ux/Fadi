// Écrit scene/p118-scene.json (scène de mesure dérivée de P.118) pour la page du banc.
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { chargerSceneP118 } from "./lib/p118.mjs";

export function ecrireScene() {
  const ici = dirname(fileURLToPath(import.meta.url));
  const scene = chargerSceneP118();
  mkdirSync(join(ici, "scene"), { recursive: true });
  const chemin = join(ici, "scene", "p118-scene.json");
  const texte = JSON.stringify(scene);
  writeFileSync(chemin, texte);
  return { chemin, octets: Buffer.byteLength(texte), comptes: scene.comptes, source: scene.source };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const r = ecrireScene();
  console.log(JSON.stringify(r, null, 2));
}
