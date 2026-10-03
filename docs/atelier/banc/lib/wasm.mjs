// Taille (brute, gzip -9, brotli q11) et temps d'initialisation (Node, processus neuf) des WASM candidats.
// OCCT (opencascade.js, occt-wasm) n'est mesuré qu'ici : jamais ajouté au produit (licence non arbitrée, D-003).
import { readFileSync } from "node:fs";
import { gzipSync, brotliCompressSync, constants } from "node:zlib";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { resume } from "./stats.mjs";

const ici = dirname(fileURLToPath(import.meta.url));
const racineBanc = join(ici, "..");
const nm = (p) => join(racineBanc, "node_modules", p);

export const CANDIDATS = [
  { id: "web-ifc", paquet: "web-ifc", licence: "MPL-2.0", fichiers: ["web-ifc/web-ifc.wasm", "web-ifc/web-ifc-api.js"], note: "Variante navigateur mono-fil (web-ifc.wasm + API ESM). web-ifc-mt.wasm (multi-fil) et web-ifc-node.wasm non comptés." },
  { id: "manifold-3d", paquet: "manifold-3d", licence: "Apache-2.0", fichiers: ["manifold-3d/manifold.wasm", "manifold-3d/manifold.js"], note: "" },
  { id: "occt-wasm", paquet: "occt-wasm", licence: "Enveloppe MIT OR Apache-2.0 ; binaire OCCT LGPL-2.1 + exception OCCT (non arbitré, D-003)", fichiers: ["occt-wasm/dist/occt-wasm.wasm", "occt-wasm/dist/occt-wasm.js", "occt-wasm/dist/index.js"], note: "Banc uniquement." },
  { id: "opencascade.js", paquet: "opencascade.js", licence: "LGPL-2.1-only (non arbitré, D-003)", fichiers: ["opencascade.js/dist/opencascade.wasm.wasm", "opencascade.js/dist/opencascade.wasm.js"], note: "Version 1.1.1 (dernière stable npm, construction complète). Banc uniquement." },
];

function version(paquet) {
  return JSON.parse(readFileSync(nm(`${paquet}/package.json`), "utf8")).version;
}

function tailles(chemin) {
  const brut = readFileSync(chemin);
  const gz = gzipSync(brut, { level: 9 });
  const br = brotliCompressSync(brut, { params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_SIZE_HINT]: brut.length } });
  return { brut: brut.length, gzip: gz.length, brotli: br.length };
}

export function mesurerTailles() {
  return CANDIDATS.map((c) => {
    const fichiers = c.fichiers.map((f) => ({ fichier: f, ...tailles(nm(f)) }));
    const total = fichiers.reduce((t, f) => ({ brut: t.brut + f.brut, gzip: t.gzip + f.gzip, brotli: t.brotli + f.brotli }), { brut: 0, gzip: 0, brotli: 0 });
    return { id: c.id, version: version(c.paquet), licence: c.licence, note: c.note, fichiers, total };
  });
}

/** Lance l'initialisation dans un processus Node neuf (cache de compilation V8 froid), `repetitions` fois. */
export function mesurerInitNode(repetitions = 3, delaiMs = 600_000) {
  const enfant = join(ici, "init-wasm-enfant.mjs");
  return CANDIDATS.map((c) => {
    const essais = [];
    let erreur = null;
    for (let i = 0; i < repetitions; i++) {
      try {
        const sortie = execFileSync(process.execPath, ["--expose-gc", enfant, c.id], { cwd: racineBanc, timeout: delaiMs, encoding: "utf8", maxBuffer: 1 << 20 });
        essais.push(JSON.parse(sortie.trim().split("\n").pop()));
      } catch (e) {
        erreur = String(e.stderr || e.message).slice(0, 600);
        break;
      }
    }
    return {
      id: c.id,
      version: version(c.paquet),
      essais: essais.length,
      initMs: resume(essais.map((e) => e.initMs)),
      rssDeltaMo: resume(essais.map((e) => e.rssDeltaMo), 1),
      verification: essais[0]?.verification ?? null,
      erreur,
    };
  });
}

