import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  adjacencyGraphSvg,
  buildProgrammeCase,
  buildingCase,
  buildingScenario,
  draftProgrammeTexts,
  editProgrammeSpace,
  mergeGeneratedTexts,
  programmeCsv,
  repartitionFromCase,
  roomSketchSvg,
  searchBuildingCases,
  type BuildingLibraryData,
} from "./building-library";
import { programmeCaseSums } from "./programme";

// La bibliothèque extraite telle quelle du prototype (apps/api/src/data).
const DATA = JSON.parse(readFileSync(new URL("../../../apps/api/src/data/building-library.json", import.meta.url), "utf8")) as BuildingLibraryData;
const NOW = "2026-10-02T05:00:00.000Z";

describe("bibliothèque des bâtiments", () => {
  it("holds the prototype's 10 types, 21 cases and 3 variants each", () => {
    expect(Object.keys(DATA.profiles)).toHaveLength(10);
    expect(DATA.cases).toHaveLength(21);
    expect(DATA.cases.every((c) => c.scenarios.length === 3)).toBe(true);
    expect(searchBuildingCases(DATA, "", "all").reduce((n, g) => n + g.cases.length, 0)).toBe(21);
    expect(searchBuildingCases(DATA, "hôtel", "all").flatMap((g) => g.cases.map((c) => c.id))).toContain("hotel");
    expect(searchBuildingCases(DATA, "", "sante").map((g) => g.profile.id)).toEqual(["sante"]);
  });

  it("builds a versioned programme case and derives the repartition from the spaces, family by family", () => {
    const c = buildingCase(DATA, "office")!;
    const s = buildingScenario(c, "base")!;
    const a = buildProgrammeCase(DATA, c, s, "Maroc", null, NOW);
    expect(a).toMatchObject({ schema: "Parcours.ProgrammeCase", version: 1, caseId: "office", scenarioId: "base", revision: 1, jurisdiction: "Maroc", type: "tertiaire" });
    const t = programmeCaseSums(a.spaces);
    const rep = repartitionFromCase(a);
    expect(rep.mode).toBe("cas");
    expect(rep.baseArea).toBeCloseTo(t.total, 6);
    expect(rep.custom["circulation"]).toBeCloseTo((t.circulation / t.total) * 100, 6);
    expect(rep.caseTotals.programme).toBeCloseTo(t.programme, 6);
    const b = buildProgrammeCase(DATA, c, buildingScenario(c, c.scenarios[1]!.id)!, "France", a, NOW);
    expect(b.revision).toBe(2);
    expect(b.created).toBe(a.created);
  });

  it("drafts the 21 steps' texts with the example header, like draft()", () => {
    const c = buildingCase(DATA, "hotel")!;
    const s = c.scenarios[0]!;
    const d = draftProgrammeTexts(DATA, c, s, "Maroc", NOW);
    expect(Object.keys(d).map(Number).sort((x, y) => x - y)).toEqual(Array.from({ length: 21 }, (_, i) => i + 1));
    expect(d[4]!["f1"]).toBe(`[EXEMPLE / HYPOTHÈSE · ${c.title} · ${s.label} · V${DATA.version}]\n${c.profile.label} → ${c.subtype}`);
    expect(d[7]!["f2"]).toContain(`${s.spaces[0]!.id} · ${s.spaces[0]!.name} : ${s.spaces[0]!.quantity} × ${s.spaces[0]!.unitArea}`);
    expect(d[14]!["f11"]).toContain("MAD à confirmer selon montage");
    expect(d[19]!["f3"]).toContain("aucune conclusion GO importée");
    expect(d[21]!["summary"]).toContain("non autorisation de construire");
  });

  it("merges generated texts without overwriting hand-written answers, reporting the differences", () => {
    const c = buildingCase(DATA, "office")!;
    const next = draftProgrammeTexts(DATA, c, c.scenarios[0]!, "Maroc", NOW);
    const business = { 4: { f1: "Mon type, saisi à la main", f2: "" }, 14: { f1: 1000 } };
    const m = mergeGeneratedTexts(business, {}, next, false, (stage, key) => !(stage === 14 && key === "f1"));
    expect(m.business[4]!["f1"]).toBe("Mon type, saisi à la main");
    expect(m.business[4]!["f2"]).toBe(next[4]!["f2"]);
    expect(m.conflicts).toEqual([{ stage: 4, field: "f1", current: "Mon type, saisi à la main", proposed: next[4]!["f1"] }]);
    expect(m.business[14]!["f1"]).toBe(1000);
    // Un texte généré précédemment est remplacé par la nouvelle génération ; replaceText écrase tout.
    const again = mergeGeneratedTexts(m.business, m.generated, draftProgrammeTexts(DATA, c, c.scenarios[1]!, "Maroc", NOW), false, () => true);
    expect(again.business[4]!["f2"]).toContain(c.scenarios[1]!.label);
    expect(again.business[4]!["f1"]).toBe("Mon type, saisi à la main");
    const forced = mergeGeneratedTexts(m.business, m.generated, next, true, () => true);
    expect(forced.business[4]!["f1"]).toBe(next[4]!["f1"]);
    expect(forced.conflicts).toEqual([]);
  });

  it("adapts a space line (integer quantity, non-negative area) and refuses invalid input", () => {
    const c = buildingCase(DATA, "office")!;
    const a = buildProgrammeCase(DATA, c, c.scenarios[0]!, "Maroc", null, NOW);
    const id = a.spaces[0]!.id;
    const edited = editProgrammeSpace(a, id, "quantity", "7", NOW);
    expect(edited.spaces[0]!.quantity).toBe(7);
    expect(edited.spaces[0]!.status).toBe("hypothese");
    expect(edited.revision).toBe(2);
    expect(edited.scenarioLabel).toBe("Adaptation projet · base");
    expect(a.spaces[0]!.quantity).not.toBe(7); // immuable
    expect(() => editProgrammeSpace(a, id, "quantity", "2.5", NOW)).toThrow(/Quantité entière/);
    expect(() => editProgrammeSpace(a, id, "unitArea", "", NOW)).toThrow(/Saisie vide/);
    expect(() => editProgrammeSpace(a, "nope", "unitArea", "1", NOW)).toThrow(/Espace inconnu/);
  });

  it("draws the adjacency graph and the room sketch, and exports a protected CSV", () => {
    const c = buildingCase(DATA, "office")!;
    const svg = adjacencyGraphSvg(c);
    expect(svg).toContain("SCHÉMA FONCTIONNEL · hors échelle");
    expect((svg.match(/<rect x=/g) ?? []).length).toBe(new Set(c.adjacencies.flatMap((a) => a.slice(0, 2))).size);
    const sketch = roomSketchSvg(c.scenarios[0]!, 0, 4);
    expect(sketch).toContain("GABARIT D’ESSAI");
    expect(sketch).toContain("1 m · échelle graphique");
    const csv = programmeCsv(c, { label: "A", spaces: [{ ...c.scenarios[0]!.spaces[0]!, name: "=cmd()" }] });
    expect(csv.startsWith("﻿\"Cas\";")).toBe(true);
    expect(csv).toContain("\"'=cmd()\"");
  });
});
