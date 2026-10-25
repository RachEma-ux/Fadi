/**
 * TR-EX-041 / EX-041 — partage de dépendances : détecteur de duplication en octets entre morceaux du bundle principal
 * et bundles des Workers, branché sur la construction (`vite.config.ts` : le build échoue si un noyau lourd est
 * dupliqué hors des exceptions déclarées ; rapport écrit dans `chargement.json`). Granularité non imposée.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { detecterDuplications, DUPLICATIONS_ADMISES, moduleRelatif, type BundleModules } from "./carte-morceaux";

const R = "/home/ci/fadi";
const mod = (chemin: string, octets: number) => ({ id: `${R}/${chemin}`, octets });
const occt = mod("node_modules/occt-wasm/dist/index.js", 78_000);
const three = mod("node_modules/three/build/three.module.js", 1_200_000);
const geo = mod("packages/core-geometry/src/index.ts", 40_000);

describe("TR-EX-041 — détecteur de duplication en octets", () => {
  it("cas positif : deux outils partagent géométrie et noyau dans un même morceau — un seul exemplaire, aucune duplication", () => {
    const bundles: BundleModules[] = [
      { fichier: "/assets/vue3d-a.js", nature: "principal", modules: [three, geo] },
      { fichier: "/assets/outil-boite-b.js", nature: "principal", modules: [mod("apps/web/src/modules/studio/vue3d/boite.ts", 900)] },
      { fichier: "/assets/outil-prisme-c.js", nature: "principal", modules: [mod("apps/web/src/modules/studio/vue3d/prisme.ts", 1100)] },
    ];
    expect(detecterDuplications(bundles)).toMatchObject({ bundles: 3, workers: 0, duplications: [], octetsDupliques: 0, violations: [] });
  });

  it("cas négatif : un morceau par bouton qui embarque chacun le noyau et three.js — duplication détectée en octets, build refusé", () => {
    const bundles: BundleModules[] = [
      { fichier: "/assets/bouton-union-1.js", nature: "principal", modules: [three, occt, geo] },
      { fichier: "/assets/bouton-soustraction-2.js", nature: "principal", modules: [three, occt, geo] },
      { fichier: "/assets/studio.worker-3.js", nature: "worker", modules: [geo] },
    ];
    const r = detecterDuplications(bundles);
    expect(r.duplications.map((d) => [d.module, d.famille, d.fichiers.length, d.octetsDupliques])).toEqual([
      ["node_modules/occt-wasm/dist/index.js", "occt", 2, 78_000],
      ["node_modules/three/build/three.module.js", "three", 2, 1_200_000],
      ["packages/core-geometry/src/index.ts", null, 3, 80_000],
    ]);
    expect(r.octetsDupliques).toBe(1_358_000);
    expect(r.violations).toHaveLength(2);
    expect(r.violations[1]).toMatch(/three\.module\.js \(« three »\) dupliqué dans \/assets\/bouton-union-1\.js, \/assets\/bouton-soustraction-2\.js : 1200000 octets en trop/);
  });

  it("Worker ↔ principal comparés ; même fichier émis deux fois compté une seule fois ; exception déclarée seulement pour ses fichiers", () => {
    const studio = { fichier: "/assets/noyau-exact.worker-AB12.js", nature: "worker" as const, modules: [occt] };
    const atelier = { fichier: "/assets/exact.worker-CD34.js", nature: "worker" as const, modules: [occt] };
    expect(detecterDuplications([studio, atelier]).violations).toEqual([]);
    expect(detecterDuplications([studio, atelier]).duplications[0]!.admise).toBe(DUPLICATIONS_ADMISES[0]!.motif);
    expect(detecterDuplications([studio, { ...studio }]).duplications).toEqual([]);
    expect(detecterDuplications([studio, { fichier: "/assets/index-EF56.js", nature: "principal", modules: [occt] }]).violations).toHaveLength(1);
    expect(moduleRelatif(`${R}/node_modules/three/x.js?worker`)).toBe("node_modules/three/x.js");
    expect(moduleRelatif("\0vite/preload-helper")).toBeNull();
  });

  it("branché sur la construction : la configuration relève les modules des Workers et refuse le build sur violation", () => {
    const config = readFileSync(new URL("../../../../vite.config.ts", import.meta.url), "utf8");
    expect(config).toMatch(/worker: \{ format: "es", plugins: \(\) => \[releveModulesWorkers\(\)\] \}/);
    expect(config).toMatch(/detecterDuplications\(\[\.\.\.principaux, \.\.\.modulesWorkers\]\)/);
    expect(config).toMatch(/if \(duplication\.violations\.length\) \{\s*throw new Error/);
  });
});
