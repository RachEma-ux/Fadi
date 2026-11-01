import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { VERSION_MOTEUR_EXACT } from "@parcours/geometry-exact";
// @ts-expect-error module JavaScript sans déclaration de types (script de contrôle exécuté par Node en CI)
import { controlerDistribution, paquetInstalle, versionExigee } from "../../../../scripts/controle-licence-occt.mjs";
import { CLE_WASM_OCCT, NOTICE_LICENCE_OCCT, VERSION_OCCT_DISTRIBUEE } from "./client-exact";

/**
 * TR-EX-096 / EX-096 — licence et provenance du noyau exact (D-177). Le contrôle de l'artefact distribué
 * (`scripts/controle-licence-occt.mjs`) est exécuté ici sur un `dist` synthétique (cas conforme et manquements) et, si
 * le build est présent, sur `apps/web/dist` réel ; la CI l'exécute aussi après `npm run build`.
 */
type Controle = { controle: string; ok: boolean; detail: string };
const sha = (o: Buffer | string) => createHash("sha256").update(o).digest("hex");

function distSynthetique(o: { wasm?: Buffer; notice?: Partial<Record<string, unknown>>; lgpl?: boolean; incorpore?: boolean; precache?: boolean } = {}) {
  const d = mkdtempSync(join(tmpdir(), "fadi-dist-"));
  mkdirSync(join(d, "assets"));
  mkdirSync(join(d, "licences/occt-wasm"), { recursive: true });
  const wasm = o.wasm ?? Buffer.from("\0asm\u0001\0\0\0binaire");
  const fichier = "/assets/occt-wasm-abc.wasm";
  writeFileSync(join(d, "assets/occt-wasm-abc.wasm"), wasm);
  writeFileSync(join(d, "assets/index-a.js"), o.incorpore ? `const w = "AGFzbQEAAAA=";` : "console.log(1)");
  writeFileSync(join(d, "sw.js"), o.precache ? `const A = ["${fichier}"];` : `const A = ["/assets/index-a.js"];`);
  writeFileSync(join(d, "chargement.json"), JSON.stringify({ initial: ["/assets/index-a.js"], moteurs: { "noyau-exact": { fichiers: [fichier] }, "rendu-3d": { fichiers: [] } } }));
  const notice = { composant: "occt-wasm", version: "5.6.1", licence: "LGPL-2.1-only", fichier, sha256: sha(wasm), remplacement: `localStorage["${CLE_WASM_OCCT}"]`, ...o.notice };
  writeFileSync(join(d, "licences/occt-wasm/NOTICE.json"), JSON.stringify(notice));
  writeFileSync(join(d, "licences/occt-wasm/NOTICE.txt"), `occt-wasm@5.6.1 LGPL-2.1-only ${fichier} ${notice.sha256} https://github.com/andymai/occt-wasm.git dev.opencascade.org D-177 ${CLE_WASM_OCCT}`);
  if (o.lgpl !== false) writeFileSync(join(d, "licences/occt-wasm/LGPL-2.1.txt"), readFileSync(new URL("../../../../public/licences/occt-wasm/LGPL-2.1.txt", import.meta.url)));
  const paquet = { version: "5.6.1", licenceOutillage: "MIT OR Apache-2.0", depot: "git+https://github.com/andymai/occt-wasm.git", readme: "## License\n\n**Build tooling**: MIT\n\n**Compiled WASM output**: LGPL-2.1-only (inherits from OCCT)\n", sha256: sha(wasm), taille: wasm.length };
  return { d, ref: { paquet, version: "5.6.1" } };
}
const echecs = (r: Controle[]) => r.filter((c) => !c.ok).map((c) => c.controle);

describe("TR-EX-096 — licence et provenance du noyau exact distribué", () => {
  it("version : constante de l'interface = moteur de @parcours/geometry-exact = dépendance exacte = paquet installé", () => {
    expect(VERSION_OCCT_DISTRIBUEE).toBe(VERSION_MOTEUR_EXACT);
    expect(versionExigee()).toBe(VERSION_MOTEUR_EXACT);
    expect(paquetInstalle()?.version).toBe(VERSION_MOTEUR_EXACT);
    expect(NOTICE_LICENCE_OCCT).toBe("/licences/occt-wasm/NOTICE.txt");
  });

  it("licence du binaire : le paquet installé déclare « Compiled WASM output: LGPL-2.1-only » ; le texte de la LGPL 2.1 est livré dans public/", () => {
    expect(paquetInstalle()!.readme).toMatch(/\*\*Compiled WASM output\*\*: LGPL-2\.1-only/);
    const t = readFileSync(new URL("../../../../public/licences/occt-wasm/LGPL-2.1.txt", import.meta.url), "utf8");
    expect(t).toMatch(/GNU LESSER GENERAL PUBLIC LICENSE\s+Version 2\.1, February 1999/);
  });

  it("dist conforme (synthétique) : tous les contrôles passent", () => {
    const { d, ref } = distSynthetique();
    const r = controlerDistribution(d, ref) as Controle[];
    expect(echecs(r)).toEqual([]);
    expect(r.length).toBeGreaterThanOrEqual(14);
    // Un autre binaire WebAssembly (Manifold) n'est pas compté comme le noyau exact.
    writeFileSync(join(d, "assets/manifold-x.wasm"), "autre");
    expect(echecs(controlerDistribution(d, ref) as Controle[])).toEqual([]);
  });

  it("manquements détectés : binaire modifié, notice d'une autre version, LGPL absente, binaire incorporé au JavaScript, binaire préchargé", () => {
    const base = distSynthetique();
    const modifie = distSynthetique({ wasm: Buffer.from("\0asm\u0001\0\0\0autre") });
    expect(echecs(controlerDistribution(modifie.d, base.ref) as Controle[])).toContain("binaire distribué identique à celui du paquet (non modifié, SHA-256)");
    expect(echecs(controlerDistribution(distSynthetique({ notice: { version: "5.5.0" } }).d, base.ref) as Controle[])).toContain("notice : composant, version et licence du binaire");
    expect(echecs(controlerDistribution(distSynthetique({ lgpl: false }).d, base.ref) as Controle[])).toContain("texte de la LGPL 2.1 servi (licences/occt-wasm/LGPL-2.1.txt)");
    expect(echecs(controlerDistribution(distSynthetique({ incorpore: true }).d, base.ref) as Controle[])).toContain("chargement séparé : binaire jamais incorporé à un morceau JavaScript");
    expect(echecs(controlerDistribution(distSynthetique({ precache: true }).d, base.ref) as Controle[])).toContain("chargement à la demande : binaire absent du précache du service worker");
    expect(echecs(controlerDistribution(base.d, { ...base.ref, version: "6.0.0" }) as Controle[])).toContain("version : paquet installé = dépendance exacte de @parcours/geometry-exact");
  });

  const dist = new URL("../../../../dist/", import.meta.url);
  it.skipIf(!existsSync(new URL("licences/occt-wasm/NOTICE.json", dist)))("artefact réellement distribué (apps/web/dist, après npm run build) : tous les contrôles passent", () => {
    const r = controlerDistribution(dist.pathname) as Controle[];
    expect(echecs(r)).toEqual([]);
  });
});
