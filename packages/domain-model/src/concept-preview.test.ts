import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { conceptAxonometricSvg } from "./concept-preview";
import { designAnalysis, type DesignReviewInput } from "./design-review";
import { harmonyDossier, type HarmonyEngineData } from "./harmony-engine";
import type { NativeFloorDesignLike, NativeLevelLike } from "./model-analysis";

const data = (rel: string) => JSON.parse(readFileSync(new URL(`../../../apps/api/src/data/${rel}`, import.meta.url), "utf8"));
const MODEL = data("examples/p118-native-model.json") as { nativeId: string; domains: { levels: NativeLevelLike[]; floorDesign: NativeFloorDesignLike; nativeParcel: Record<string, unknown>; buildingFootprint: { vertices: [number, number][] } } };
const DOSSIER = data("examples/p118-harmony-dossier.json");
const CASE = data("examples/p118-programme-case.json").programme;
const ENGINE = data("harmony-engine.json") as HarmonyEngineData;
const NOW = "2026-10-02T10:00:00.000Z";

function input(over: Partial<DesignReviewInput> = {}): DesignReviewInput {
  const np = MODEL.domains.nativeParcel;
  return {
    projectId: "proj_test",
    projectName: "Escalier B et mezzanine",
    nativeId: MODEL.nativeId,
    levels: MODEL.domains.levels,
    floor: MODEL.domains.floorDesign,
    parcel: { vertices: np["vertices"] as [number, number][], centroid: np["centroid"] as [number, number], crs: String(np["crs"]), officialArea: np["officialArea"] as number, setback: np["setback"] as { envelope?: [number, number][] } },
    footprint: MODEL.domains.buildingFootprint.vertices,
    solarSite: null,
    programmeCase: CASE,
    repartitionCaseTotals: null,
    siteObservations: null,
    siteContext: null,
    business: new Map(),
    generatedTexts: {},
    harmony: harmonyDossier(DOSSIER.harmony, NOW),
    georeference: { ...DOSSIER.georeference, hypothesis: true },
    assumptions: DOSSIER.assumptions,
    example: true,
    parcelTransmission: { status: "linked", reason: "" },
    decision19: "GO sous conditions",
    textConflicts: 0,
    engine: ENGINE,
    now: NOW,
    ...over,
  };
}

describe("aperçu conceptuel (axonométrie éclatée depuis le modèle réel)", () => {
  it("dessine les 6 niveaux du modèle P.118 : dalles, locaux colorés par usage, murs extrudés, étiquettes, nord géographique", () => {
    const i = input();
    const r = designAnalysis(i);
    const p = conceptAxonometricSvg(i, r);
    expect(p.levels).toBe(6);
    expect(p.rooms).toBe(r.rooms.length);
    expect(p.rooms).toBeGreaterThan(50);
    expect(p.walls).toBeGreaterThan(0);
    expect(p.nativeHash).toBe(r.nativeHash);
    const svg = p.svg!;
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 ')).toBe(true);
    expect((svg.match(/<g data-level="/g) ?? []).length).toBe(6);
    // Un polygone de local par local, un quadrilatère par mur (plus les dalles et les trous).
    expect((svg.match(/<polygon /g) ?? []).length).toBeGreaterThanOrEqual(p.rooms + p.walls + 2 * p.levels);
    expect(svg).toContain("nord géographique (H-GEO)");
    expect(svg).toContain("RDC");
    expect(svg).toContain("proportions calculées, pas un rendu");
    // Aucun élément inventé : pas d'image, pas de texte libre hors étiquettes de niveaux.
    expect(svg).not.toContain("<image");
    // Vignette : plan compact du RDC, sans texte.
    expect(p.planLevel).toBe("RDC");
    expect(p.plan!.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 240"')).toBe(true);
    expect(p.plan).not.toContain("<text");
    expect((p.plan!.match(/<polygon /g) ?? []).length).toBeGreaterThan(10);
    if (process.env["WRITE_SVG"]) writeFileSync(process.env["WRITE_SVG"], svg);
  });

  it("reste vide sans emprise ni local", () => {
    const i = input({ parcel: null, footprint: [], floor: { levels: {} }, levels: [] });
    const p = conceptAxonometricSvg(i, designAnalysis(i));
    expect(p.svg).toBeNull();
    expect(p.plan).toBeNull();
    expect(p.levels).toBe(0);
  });
});
