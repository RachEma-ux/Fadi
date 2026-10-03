import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { analyseModel, fnv1a, localHarmonieOptions, pointInPolygon, polygonCenter, recommendedDesignOption, roomUsage, stableArea, type NativeFloorDesignLike, type NativeLevelLike } from "./model-analysis";
import { buildHarmonieProposals, decideHarmonieProposal, harmonieProfile, type HarmonieProfilesData } from "./harmonie";
import { EMPTY_HARMONIE_STEP_STATE, type ParcoursStepDefinition } from "./parcours";

// Le modèle natif P.118 extrait du prototype (apps/api/src/data).
const MODEL = JSON.parse(readFileSync(new URL("../../../apps/api/src/data/examples/p118-native-model.json", import.meta.url), "utf8")) as {
  nativeId: string;
  domains: { levels: NativeLevelLike[]; floorDesign: NativeFloorDesignLike; nativeParcel: unknown; buildingFootprint: unknown };
};

const DATA: HarmonieProfilesData = {
  states: { proposed: "Proposée", retained: "Retenue", adapted: "Adaptée et retenue", translated: "Traduite dans le programme", drawn: "Dessinée · déclaration", verified: "Vérifiée · preuve déclarée", dismissed: "Écartée avec motif" },
  retainedStates: ["retained", "adapted", "translated", "drawn", "verified"],
  aliases: {},
  defaultProfile: { label: "Type à préciser", site: "S", usage: "USAGE-DEFAUT", decor: "D" },
  mixedTrainingOffices: { requires: ["enseignement", "tertiaire"], label: "Formation & bureaux", site: "S", usage: "U" },
  profiles: {},
};
const DEF10: ParcoursStepDefinition = {
  number: 10,
  title: "Atelier architectural",
  phase: "Concevoir-Tester",
  key: "atelier",
  scope: "Conception",
  goal: null,
  inputs: null,
  deliverable: null,
  method: null,
  topic: null,
  harmonieOptions: [
    { title: "A", proposal: "pa", benefit: "b", tradeoff: "t", validation: "v" },
    { title: "B", proposal: "pb", benefit: "b", tradeoff: "t", validation: "v" },
    { title: "C", proposal: "pc", benefit: "b", tradeoff: "t", validation: "v" },
  ],
  transmitsTo: [11, 13, 16],
  form: null,
};

describe("lecture du modèle natif (flow-v62 analyse / harmony-app context)", () => {
  it("ports the prototype's geometry helpers", () => {
    expect(stableArea([[0, 0], [10, 0], [10, 5], [0, 5]])).toBe(50);
    expect(pointInPolygon([5, 2], [[0, 0], [10, 0], [10, 5], [0, 5]])).toBe(true);
    expect(pointInPolygon([11, 2], [[0, 0], [10, 0], [10, 5], [0, 5]])).toBe(false);
    expect(polygonCenter([[0, 0], [10, 0], [10, 10], [0, 10]])).toEqual([5, 5]);
    expect(fnv1a({ a: 1 })).toMatch(/^[0-9a-f]{8}$/);
    expect(roomUsage("R01 · Accueil, attente et hall")).toBe("accueil");
    expect(roomUsage("Salle de formation 24 places")).toBe("formation");
    expect(roomUsage("Bande d’adaptation")).toBe("reserve");
    expect(roomUsage("Open space 12 postes")).toBe("bureau");
  });

  it("reads the P.118 rooms: areas from polygons, usages from names, openings at the boundary, readings and statuses", () => {
    const a = analyseModel({ nativeId: MODEL.nativeId, levels: MODEL.domains.levels, floor: MODEL.domains.floorDesign, parcel: MODEL.domains.nativeParcel, footprint: MODEL.domains.buildingFootprint });
    expect(a.floors.map((f) => f.id)).toEqual(["ss", "rdc", "mezz", "r1", "r2", "r3"]);
    expect(a.rooms.length).toBeGreaterThan(20);
    const hall = a.rooms.find((r) => r.name.startsWith("R01"));
    expect(hall).toBeDefined();
    expect(hall!.usage).toBe("accueil");
    // Aire du polygone du chemin « room » (pas la contenance déclarée dans `rooms[]`, informative).
    expect(hall!.area).toBeGreaterThan(100);
    expect(hall!.area).toBeCloseTo(140.743, 2);
    expect(hall!.levelName).toBe(MODEL.domains.levels.find((l) => l.id === "rdc")!.name);
    expect(hall!.doors).toBeGreaterThan(0);
    expect(hall!.reading).toMatch(/seuil lisible/);
    expect(a.rooms.every((r) => r.area > 0 && r.id === `${r.level}|${r.objectId}`)).toBe(true);
    expect(a.nativeHash).toMatch(/^[0-9a-f]{8}$/);
    const rdc = a.floors.find((f) => f.id === "rdc")!;
    expect(rdc.count).toBe(a.rooms.filter((r) => r.level === "rdc").length);
    expect(rdc.gross).not.toBeNull();
  });

  it("builds the local proposals of step 10 (no reserve / circulation / technique rooms) that retaining a parti leaves untouched", () => {
    const a = analyseModel({ nativeId: MODEL.nativeId, levels: MODEL.domains.levels, floor: MODEL.domains.floorDesign });
    const locals = localHarmonieOptions(a, 10, "USAGE-DEFAUT");
    expect(locals.length).toBeGreaterThan(0);
    expect(locals.every((l) => l.targets.join() === "11,13,16" && l.source.startsWith(`Modèle ${a.nativeHash} · objet `))).toBe(true);
    expect(locals[0]!.why).toMatch(/m² calculés sur le polygone/);
    const reco = recommendedDesignOption(a);
    expect(["A", "C"]).toContain(reco.key);
    const profile = harmonieProfile(DATA, null);
    const proposals = buildHarmonieProposals(DATA, DEF10, profile, EMPTY_HARMONIE_STEP_STATE, { options: null, recommendedKey: reco.key, locals });
    expect(proposals.filter((q) => q.group === "parti")).toHaveLength(3);
    const first = proposals.find((q) => q.group === "local")!;
    expect(first.id).toBe(`H09-LOCAL-${locals[0]!.roomId}`);
    expect(first.ref).toBe(`H10-LOCAL-${locals[0]!.roomId}`);
    expect(first.scope).toBe("Local du modèle courant");
    // Retenir un local puis un parti : le local reste retenu ; retenir un second parti remplace le premier parti seulement.
    const r1 = decideHarmonieProposal(DATA, DEF10, EMPTY_HARMONIE_STEP_STATE, first.id, { status: "retained" }, { now: "2026-10-02T00:00:00Z", computed: { options: null, recommendedKey: "A", locals } });
    expect(r1.state.proposals[first.id]!.link).toBe(first.roomId);
    const r2 = decideHarmonieProposal(DATA, DEF10, r1.state, "H09-A", { status: "retained" }, { now: "2026-10-02T00:00:01Z", computed: { options: null, recommendedKey: "A", locals } });
    expect(r2.dismissed).toEqual([]);
    const r3 = decideHarmonieProposal(DATA, DEF10, r2.state, "H09-B", { status: "retained" }, { now: "2026-10-02T00:00:02Z", computed: { options: null, recommendedKey: "A", locals } });
    expect(r3.dismissed).toEqual(["H09-A"]);
    expect(r3.state.proposals[first.id]!.status).toBe("retained");
  });
});
