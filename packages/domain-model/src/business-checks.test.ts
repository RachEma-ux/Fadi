import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DESIGN_CHECK_RULES, checkTotals, derivedQuantities, designChecks, financeCheck, programmeScenarios, stepResults, structureCheck, structureStatements, transmissionChecks } from "./business-checks";
import { designAnalysis, designAudit, type DesignReviewInput } from "./design-review";
import { harmonyDossier, type HarmonyEngineData } from "./harmony-engine";
import type { NativeFloorDesignLike, NativeLevelLike } from "./model-analysis";
import { programmeCaseSums } from "./programme";

const data = (rel: string) => JSON.parse(readFileSync(new URL(`../../../apps/api/src/data/${rel}`, import.meta.url), "utf8"));
const MODEL = data("examples/p118-native-model.json") as { nativeId: string; domains: { levels: NativeLevelLike[]; floorDesign: NativeFloorDesignLike; nativeParcel: Record<string, unknown>; buildingFootprint: { vertices: [number, number][] } } };
const DOSSIER = data("examples/p118-harmony-dossier.json");
const CASE = data("examples/p118-programme-case.json").programme;
const STUDY = data("examples/p118-study-dossier.json");
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
    satelliteObserved: false,
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

describe("Analyses métier — contrôles traçables", () => {
  it("lit les dix règles de flow-v62 comme des contrôles : réserves de l'exemple P.118 → statuts, source et étape de chaque règle", () => {
    const i = input();
    const r = designAnalysis(i);
    const checks = designChecks(i, r);
    expect(checks).toHaveLength(DESIGN_CHECK_RULES.length);
    const byId = Object.fromEntries(checks.map((c) => [c.id, c]));
    // Les sept réserves de la revue archivée de l'exemple.
    expect(byId["design:HEIGHT"]).toMatchObject({ status: "a-verifier", domain: "Hauteurs", priority: "prioritaire", step: 8, version: "6.2.0" });
    expect(byId["design:DENSITY"]).toMatchObject({ status: "a-verifier", priority: "à arbitrer", step: 7 });
    expect(byId["design:MEZZ"]).toMatchObject({ status: "a-verifier", kind: "etude" });
    expect(byId["design:RAMP"]).toMatchObject({ status: "a-verifier", refs: ["ss|EX118-RAMP-PORTAL"], step: 13 });
    expect(byId["design:CONTEXT"]).toMatchObject({ status: "non-evalue", kind: "donnee", step: 1 });
    expect(byId["design:COMPASS"]).toMatchObject({ status: "non-evalue" });
    expect(byId["design:FLYING"]).toMatchObject({ status: "non-evalue" });
    // Les règles évaluées sans réserve.
    expect(byId["design:NO-MODEL"]).toMatchObject({ status: "conforme" });
    expect(byId["design:NO-MODEL"]!.detail).toMatch(/^6 niveau\(x\), 74 zone\(s\)/);
    expect(byId["design:IMPLANTATION"]).toMatchObject({ status: "conforme", source: expect.stringContaining("flow-v62 analyse") });
    expect(byId["design:TARGETS"]).toMatchObject({ status: "conforme" });
    expect(byId["design:TARGETS"]!.detail).toMatch(/^74 local\(aux\) lié\(s\)/);
    expect(checkTotals(checks)).toEqual({ conforme: 3, "non-conforme": 0, "a-verifier": 4, "non-evalue": 3, "sans-objet": 0 });
  });

  it("donne « non évalué » ou « sans objet » quand les entrées manquent, jamais une estimation", () => {
    const i = input({ nativeId: null, levels: [], floor: { paths: [] } as unknown as NativeFloorDesignLike, parcel: null, footprint: [], programmeCase: null, example: false });
    const r = designAnalysis(i);
    const byId = Object.fromEntries(designChecks(i, r).map((c) => [c.id, c]));
    expect(byId["design:NO-MODEL"]).toMatchObject({ status: "non-evalue", detail: "Aucun modèle natif relié au dossier." });
    expect(byId["design:IMPLANTATION"]!.status).toBe("non-evalue");
    expect(byId["design:TARGETS"]).toMatchObject({ status: "non-evalue", detail: "Aucun cas de programme appliqué : pas de cible à comparer." });
    expect(byId["design:HEIGHT"]!.status).toBe("sans-objet"); // référence propre au dossier P.118
    expect(byId["design:DENSITY"]!.status).toBe("non-evalue");
    expect(byId["design:MEZZ"]!.status).toBe("sans-objet");
    expect(byId["design:RAMP"]!.status).toBe("sans-objet");
    // Une emprise hors contour est un écart constaté, pas une réserve.
    const outside = input({ footprint: [[0, 0], [10, 0], [10, 10], [0, 10]] });
    expect(Object.fromEntries(designChecks(outside, designAnalysis(outside)).map((c) => [c.id, c.status]))["design:IMPLANTATION"]).toBe("non-conforme");
  });

  it("relit l'audit des transmissions, le chiffrage de l'étape 14 et le dossier de structure déclaré", () => {
    const i = input();
    const r = designAnalysis(i);
    const audit = transmissionChecks(designAudit(i, r, "Mixte / multi-usages"));
    expect(audit).toHaveLength(14);
    expect(audit.every((c) => c.domain === "Transmissions du dossier" && c.source.startsWith("flow-v62 audit — "))).toBe(true);
    expect(audit.find((c) => c.id === "audit:link")).toMatchObject({ status: "conforme", label: "Dossier → modèle natif" });
    expect(financeCheck({ f1: 1000, f9: 400 })).toMatchObject({ status: "non-evalue", detail: "Chiffrage incomplet : 6 poste(s) manquant(s) (f2, f3, f4, f5, f6, f10)." });
    expect(financeCheck({ f1: 1, f2: 2, f3: 3, f4: 4, f5: 5, f6: 6, f9: 10, f10: 11 })).toMatchObject({ status: "conforme", detail: "Investissement 21 ; financement 21 ; solde 0." });
    // Structure : les exigences sont enregistrées, le dimensionnement n'est pas calculé → non évalué ; rien n'est recalculé.
    expect(structureCheck(STUDY.structure)).toMatchObject({ status: "non-evalue", domain: "Structure", detail: "Exigences enregistrées ; résistance, flèche, poinçonnement, pertes, ancrages et appuis non calculés" });
    expect(structureCheck(null).status).toBe("non-evalue");
    expect(structureCheck({ designStatus: "Dimensionné par le BET le 12/03" }).status).toBe("a-verifier");
    const statements = structureStatements(STUDY.structure);
    expect(statements.map((s) => [s.kind, s.label])).toEqual([
      ["exigence", "Système porteur retenu"],
      ["exigence", "Portée libre requise"],
      ["exigence", "Implantation des poteaux"],
      ["hypothese", "Charge d'exploitation"],
      ["representation", "Poteaux par niveau (modèle)"],
      ["representation", "Épaisseur de dalle"],
      ["etat", "Dimensionnement"],
    ]);
    expect(statements[1]!.value).toBe("20 m");
    expect(statements[3]!.value).toMatch(/^500 kg\/m² \(4,903 kN\/m²\) — Charge d’exploitation supposée, à confirmer ; poids propre non inclus$/);
  });

  it("dérive les quantités du modèle courant et compare les variantes de programme depuis leurs fiches", () => {
    const i = input();
    const r = designAnalysis(i);
    const q = derivedQuantities(r, r.floors, programmeCaseSums(CASE.spaces));
    expect(q.levels).toHaveLength(6);
    expect(q.levels.map((l) => l.id)).toEqual(["ss", "rdc", "mezz", "r1", "r2", "r3"]);
    expect(q.levels.reduce((n, l) => n + l.rooms, 0)).toBe(74);
    expect(q.building.roomCount).toBe(74);
    expect(q.parcel.area).toBeCloseTo(1345.55, 1);
    expect(q.parcel.officialArea).toBe(1346);
    expect(q.programme).toMatchObject({ linkedRooms: 74, total: expect.closeTo(2932.26, 2) });
    expect(q.programme!.linkedDrawn).toBeCloseTo(q.programme!.linkedTarget, 2); // cibles de l'exemple = surfaces dessinées
    const scenarios = programmeScenarios([
      { revision: 2, title: "Hôtel urbain", scenarioLabel: "B · Variante", updated: "2026-10-01", archived: null, spaces: [{ id: "a", name: "A", quantity: 2, unitArea: 10, role: "principal", bucket: "principal" } as never] },
      { revision: 1, title: "Hôtel urbain", scenarioLabel: "A · Base", updated: "2026-09-30", archived: "2026-10-01", spaces: [{ id: "a", name: "A", quantity: 1, unitArea: 10, role: "principal", bucket: "principal" } as never] },
    ]);
    expect(scenarios.map((s) => [s.revision, s.current, s.sums.programme, s.deltaProgramme])).toEqual([
      [2, true, 20, 0],
      [1, false, 10, -10],
    ]);
    expect(stepResults({ f1: 1 }, { f1: 4, f2: 5 }, { decision: "GO" })).toMatchObject({ finance: null, score: { average: 4.5, count: 2, of: 8 }, decision: "GO" });
  });
});
