/**
 * F.1-01 / EX-098 / EX-056 — règle des accélérations : gain ET non-régression prouvés par un rapport de comparaison,
 * sinon refus ; moteurs par défaut bloqués sur leur référence sans rapport qualifiant.
 */
import { describe, expect, it } from "vitest";
import {
  STUDIO_ACCELERATIONS, STUDIO_MOTEURS_DE_REFERENCE, STUDIO_MOTEURS_PAR_DEFAUT, STUDIO_RAPPORTS_ACCELERATION, STUDIO_RAPPORT_ACCELERATION_SCHEMA,
  studioControlerMoteursParDefaut, studioEvaluerAcceleration, studioMoteurEffectif, type StudioRapportAcceleration,
} from "./accelerations.js";

/** Rapport qualifiant SYNTHÉTIQUE (forme seulement, aucune mesure réelle) pour le moteur Canvas de la planche. */
const qualifiant = (): StudioRapportAcceleration => ({
  schema: STUDIO_RAPPORT_ACCELERATION_SCHEMA, acceleration: "rendu-canvas-planche", test: "TEST-025 (synthétique)", reference: "svg", candidat: "canvas",
  environnement: { appareil: "synthétique", renduLogiciel: true, date: "2026-10-25" },
  mesures: [{ scene: "S1", reference: 10, candidat: 4 }, { scene: "S3", reference: 30, candidat: 12 }],
  equivalence: [
    { critere: "primitives-rendues", ecart: 0, tolerance: 1e-6 }, { critere: "textes-accessibles", ecart: 0, tolerance: 0 },
    { critere: "cibles-accrochage", ecart: 0, tolerance: 0 }, { critere: "selection", ecart: 0, tolerance: 0 },
  ],
});

describe("F.1-01 — une accélération n'est activée qu'après preuve du gain ET de la non-régression", () => {
  it("rapport qualifiant (gain sur chaque scène, chaque critère exigé mesuré dans sa tolérance) : autorisée, gains relevés", () => {
    const v = studioEvaluerAcceleration("rendu-canvas-planche", qualifiant());
    expect(v.autorisee).toBe(true);
    expect(v.refus).toEqual([]);
    expect(v.gains.map((g) => g.scene)).toEqual(["S1", "S3"]);
    expect(v.gains[0]!.gain).toBeCloseTo(0.6, 12);
  });

  it("sans rapport : refusée (rapport-absent) ; rapport d'une autre accélération ou d'autres chemins : refusé", () => {
    expect(studioEvaluerAcceleration("rendu-canvas-planche", null).refus.map((r) => r.motif)).toEqual(["rapport-absent"]);
    expect(studioEvaluerAcceleration("rendu-canvas-planche", { ...qualifiant(), acceleration: "webgpu-vue3d" }).refus.map((r) => r.motif)).toContain("rapport-d-une-autre-acceleration");
    expect(studioEvaluerAcceleration("rendu-canvas-planche", { ...qualifiant(), candidat: "webgl" }).refus.map((r) => r.motif)).toContain("chemins-differents");
    expect(studioEvaluerAcceleration("inconnue", qualifiant()).refus.map((r) => r.motif)).toEqual(["acceleration-inconnue"]);
  });

  it("gain non prouvé : une scène plus lente, égale ou non mesurée refuse l'accélération", () => {
    const plusLent = { ...qualifiant(), mesures: [{ scene: "S1", reference: 10, candidat: 4 }, { scene: "S3", reference: 30, candidat: 31 }] };
    expect(studioEvaluerAcceleration("rendu-canvas-planche", plusLent).refus).toEqual([{ motif: "gain-non-prouve", detail: "S3 : p95 31 ms ≥ 30 ms" }]);
    expect(studioEvaluerAcceleration("rendu-canvas-planche", { ...qualifiant(), mesures: [{ scene: "S1", reference: 10, candidat: 10 }] }).autorisee).toBe(false);
    expect(studioEvaluerAcceleration("rendu-canvas-planche", { ...qualifiant(), mesures: [{ scene: "S1", reference: null, candidat: 1 }] }).refus.map((r) => r.motif)).toEqual(["mesure-absente"]);
    expect(studioEvaluerAcceleration("rendu-canvas-planche", { ...qualifiant(), mesures: [] }).refus.map((r) => r.motif)).toEqual(["mesure-absente"]);
  });

  it("EX-098 (cas négatif) : gain p95 avec accrochage ou sélection différents hors tolérance → accélération rejetée", () => {
    const r = qualifiant();
    r.equivalence = r.equivalence.map((e) => (e.critere === "cibles-accrochage" ? { ...e, ecart: 3 } : e));
    const v = studioEvaluerAcceleration("rendu-canvas-planche", r);
    expect(v.autorisee).toBe(false);
    expect(v.refus).toEqual([{ motif: "hors-tolerance", detail: "cibles-accrochage : écart 3" }]);
    expect(v.gains.every((g) => g.gain > 0)).toBe(true);
  });

  it("critère exigé absent, non évalué, ou tolérance plus large que celle déclarée : refus", () => {
    const sans = { ...qualifiant(), equivalence: qualifiant().equivalence.filter((e) => e.critere !== "textes-accessibles") };
    expect(studioEvaluerAcceleration("rendu-canvas-planche", sans).refus).toEqual([{ motif: "critere-absent", detail: "textes-accessibles" }]);
    const nonEvalue = { ...qualifiant(), equivalence: qualifiant().equivalence.map((e) => (e.critere === "selection" ? { ...e, ecart: null } : e)) };
    expect(studioEvaluerAcceleration("rendu-canvas-planche", nonEvalue).refus.map((x) => x.motif)).toEqual(["critere-non-evalue"]);
    const large = { ...qualifiant(), equivalence: qualifiant().equivalence.map((e) => (e.critere === "primitives-rendues" ? { ...e, ecart: 0.5, tolerance: 1 } : e)) };
    expect(studioEvaluerAcceleration("rendu-canvas-planche", large).refus.map((x) => x.motif)).toEqual(["tolerance-trop-large", "hors-tolerance"]);
  });

  it("REC-C-02 : une accélération GPU exige un appareil réel — une mesure en rendu logiciel (SwiftShader) n'en est pas la preuve", () => {
    const gpu: StudioRapportAcceleration = { ...qualifiant(), acceleration: "webgpu-vue3d", reference: "webgl2", candidat: "webgpu", equivalence: [{ critere: "primitives-rendues", ecart: 0, tolerance: 0 }, { critere: "selection", ecart: 0, tolerance: 0 }] };
    expect(studioEvaluerAcceleration("webgpu-vue3d", gpu).refus.map((r) => r.motif)).toEqual(["appareil-reel-requis"]);
    expect(studioEvaluerAcceleration("webgpu-vue3d", { ...gpu, environnement: { ...gpu.environnement, appareil: "GPU réel désigné", renduLogiciel: false } }).autorisee).toBe(true);
  });

  it("moteur effectif : le moteur demandé seulement si la règle l'autorise, sinon la référence avec le verdict", () => {
    expect(studioMoteurEffectif("planche-2d", "svg", null)).toEqual({ moteur: "svg", verdict: null });
    const refuse = studioMoteurEffectif("planche-2d", "canvas", null);
    expect(refuse.moteur).toBe("svg");
    expect(refuse.verdict?.refus[0]?.motif).toBe("rapport-absent");
    expect(studioMoteurEffectif("planche-2d", "canvas", qualifiant()).moteur).toBe("canvas");
    expect(studioMoteurEffectif("vue-3d", "webgpu", null).moteur).toBe("webgl2");
  });
});

describe("TR-EX-056 / F.1-01 — blocage d'un remplacement de moteur sans preuve", () => {
  it("moteur par défaut : SVG (planche, DEC-08) et WebGL2 (vue 3D) ; tout défaut différent de la référence sans rapport qualifiant fait échouer ce test", () => {
    expect(STUDIO_MOTEURS_PAR_DEFAUT).toEqual({ "planche-2d": "svg", "vue-3d": "webgl2" });
    expect(STUDIO_MOTEURS_DE_REFERENCE).toEqual({ "planche-2d": "svg", "vue-3d": "webgl2" });
    // Le contrôle du dépôt : défauts livrés et rapports versionnés.
    expect(studioControlerMoteursParDefaut(STUDIO_MOTEURS_PAR_DEFAUT, STUDIO_RAPPORTS_ACCELERATION)).toEqual([]);
  });

  it("le contrôle porte : un défaut Canvas ou WebGPU sans rapport (ou avec un rapport qui ne qualifie pas) est refusé ; avec un rapport qualifiant, admis", () => {
    expect(studioControlerMoteursParDefaut({ "planche-2d": "canvas", "vue-3d": "webgl2" }, [])).toEqual(["planche-2d : moteur par défaut canvas sans rapport de comparaison qualifiant (référence svg, règle F.1-01)"]);
    expect(studioControlerMoteursParDefaut({ "planche-2d": "svg", "vue-3d": "webgpu" }, [])).toHaveLength(1);
    const lent = { ...qualifiant(), mesures: [{ scene: "S1", reference: 1, candidat: 2 }] };
    expect(studioControlerMoteursParDefaut({ "planche-2d": "canvas", "vue-3d": "webgl2" }, [lent])).toHaveLength(1);
    expect(studioControlerMoteursParDefaut({ "planche-2d": "canvas", "vue-3d": "webgl2" }, [qualifiant()])).toEqual([]);
    expect(studioControlerMoteursParDefaut({ "planche-2d": "gpu", "vue-3d": "webgl2" }, [])).toEqual(["planche-2d : moteur inconnu gpu"]);
  });

  it("registre : chaque accélération active a sa preuve ; Canvas et WebGPU restent inactives (aucun rapport versionné)", () => {
    for (const a of STUDIO_ACCELERATIONS) {
      expect(a.preuve.trim(), a.id).not.toBe("");
      expect(a.criteres.length, a.id).toBeGreaterThan(0);
    }
    expect(STUDIO_ACCELERATIONS.filter((a) => a.etat === "inactive").map((a) => a.id)).toEqual(["rendu-canvas-planche", "webgpu-vue3d"]);
    expect(STUDIO_RAPPORTS_ACCELERATION).toEqual([]);
    expect(Object.isFrozen(STUDIO_ACCELERATIONS)).toBe(true);
  });
});
