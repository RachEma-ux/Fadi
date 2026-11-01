/**
 * TR-EX-056 — repli WebGPU → WebGL2 déclaré et testé : WebGL2 par défaut ; WebGPU demandé n'est retenu qu'avec un
 * navigateur qui l'expose, un adaptateur, un rapport qualifiant mesuré sur appareil réel (règle F.1-01) et une vue qui
 * sait le rendre ; sinon repli WebGL2 avec sa raison, dite à l'utilisateur.
 */
import { describe, expect, it } from "vitest";
import { STUDIO_RAPPORT_ACCELERATION_SCHEMA, type StudioRapportAcceleration } from "@parcours/atelier-model";
import { choisirMoteur3d, texteMoteur3d } from "./moteur-3d";

const gpuAvec = (adaptateur: unknown) => ({ requestAdapter: async () => adaptateur });
const reel = (logiciel: boolean): StudioRapportAcceleration => ({
  schema: STUDIO_RAPPORT_ACCELERATION_SCHEMA, acceleration: "webgpu-vue3d", test: "comparaison WebGL2 / WebGPU (synthétique)", reference: "webgl2", candidat: "webgpu",
  environnement: { appareil: logiciel ? "SwiftShader" : "GPU désigné", renduLogiciel: logiciel, date: "2026-10-25" },
  mesures: [{ scene: "S4", reference: 20, candidat: 12 }],
  equivalence: [{ critere: "primitives-rendues", ecart: 0, tolerance: 0 }, { critere: "selection", ecart: 0, tolerance: 0 }],
});

describe("TR-EX-056 — moteur de la vue 3D : WebGL2 par défaut, repli WebGPU → WebGL2 déclaré", () => {
  it("WebGL2 demandé (défaut) : WebGL2, aucun repli", async () => {
    const c = await choisirMoteur3d("webgl2", gpuAvec({}));
    expect(c).toEqual({ demande: "webgl2", moteur: "webgl2", repli: null });
    expect(texteMoteur3d(c)).toBe("Moteur 3D : WebGL2");
  });

  it("WebGPU demandé sans navigator.gpu, sans adaptateur ou en erreur : repli WebGL2 avec la raison", async () => {
    const absent = await choisirMoteur3d("webgpu", undefined);
    expect(absent).toEqual({ demande: "webgpu", moteur: "webgl2", repli: { raison: "webgpu-absent", detail: "navigator.gpu absent" } });
    expect(texteMoteur3d(absent)).toBe("Moteur 3D : WebGL2 (repli) — WebGPU indisponible dans ce navigateur");
    expect((await choisirMoteur3d("webgpu", gpuAvec(null))).repli?.raison).toBe("adaptateur-absent");
    expect((await choisirMoteur3d("webgpu", { requestAdapter: async () => { throw new Error("perte du contexte"); } })).repli).toEqual({ raison: "erreur-webgpu", detail: "perte du contexte" });
  });

  it("WebGPU disponible mais non qualifié (aucun rapport, ou mesure en rendu logiciel) : repli par la règle F.1-01", async () => {
    const sans = await choisirMoteur3d("webgpu", gpuAvec({}));
    expect(sans.moteur).toBe("webgl2");
    expect(sans.repli).toEqual({ raison: "regle-f101", detail: "aucun rapport de comparaison" });
    expect(texteMoteur3d(sans)).toBe("Moteur 3D : WebGL2 (repli) — WebGPU non qualifié (règle F.1-01) : aucun rapport de comparaison");
    expect((await choisirMoteur3d("webgpu", gpuAvec({}), reel(true))).repli).toEqual({ raison: "regle-f101", detail: "mesure sur appareil réel requise" });
  });

  it("qualifié sur appareil réel : retenu seulement si la vue sait le rendre (la vue Studio rend en WebGL2 : repli déclaré)", async () => {
    expect((await choisirMoteur3d("webgpu", gpuAvec({}), reel(false))).repli).toEqual({ raison: "moteur-non-rendu", detail: "webgpu" });
    expect(await choisirMoteur3d("webgpu", gpuAvec({}), reel(false), new Set(["webgl2", "webgpu"]))).toEqual({ demande: "webgpu", moteur: "webgpu", repli: null });
  });
});
