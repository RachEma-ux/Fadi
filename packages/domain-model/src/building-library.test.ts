import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  adjacencyGraphSvg,
  applySurfaceTransfer,
  buildProgrammeCase,
  linkProgrammeRoom,
  previewSurfaceTransfer,
  programmeModelLinks,
  setProgrammeHypothesis,
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
import { fnv1a } from "./model-analysis";
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

  it("links programme lines to drawn rooms by identifier (one room, one line), feeds the Harmony room record, and reports drawn vs target", () => {
    const c = buildingCase(DATA, "office")!;
    const a = buildProgrammeCase(DATA, c, buildingScenario(c, "base")!, "Maroc", null, NOW);
    const rooms = [
      { id: "rdc|R01", levelName: "RDC", name: "R01 · Accueil", area: 140.7 },
      { id: "rdc|R02", levelName: "RDC", name: "R02 · Bureau", area: 173 },
    ];
    const s0 = a.spaces.find((x) => x.role !== "parois")!;
    const s1 = a.spaces.filter((x) => x.role !== "parois")[1]!;
    const first = linkProgrammeRoom(a, {}, s0.id, "rdc|R01", { roomExists: true, now: NOW });
    expect(first.programmeCase.roomLinks[s0.id]).toEqual(["rdc|R01"]);
    expect(first.programmeCase.revision).toBe(a.revision + 1);
    expect(first.roomData["rdc|R01"]).toMatchObject({ programmeSpaceId: s0.id, programmeTargetArea: s0.quantity * s0.unitArea, programmeCaseId: "office" });
    expect(() => linkProgrammeRoom(first.programmeCase, first.roomData, s1.id, "rdc|R01", { roomExists: true, now: NOW })).toThrow("Zone déjà affectée à une autre ligne");
    expect(() => linkProgrammeRoom(a, {}, s0.id, "rdc|R99", { roomExists: false, now: NOW })).toThrow("Zone absente du modèle");
    expect(() => linkProgrammeRoom(a, {}, "nope", "rdc|R01", { roomExists: true, now: NOW })).toThrow("Espace inconnu");
    const rows = programmeModelLinks(first.programmeCase, rooms);
    const row0 = rows.find((r) => r.space.id === s0.id)!;
    expect(row0.linked.map((r) => r.id)).toEqual(["rdc|R01"]);
    expect(row0.drawnArea).toBeCloseTo(140.7, 6);
    expect(row0.delta).toBeCloseTo(140.7 - s0.quantity * s0.unitArea, 6);
    expect(row0.options.map((r) => r.id)).toEqual(["rdc|R02"]); // la zone déjà liée à cette ligne n'est plus proposée
    const row1 = rows.find((r) => r.space.id === s1.id)!;
    expect(row1.drawnArea).toBeNull();
    expect(row1.options.map((r) => r.id)).toEqual(["rdc|R02"]); // R01 est affectée à une autre ligne
    expect(rows.some((r) => r.space.role === "parois")).toBe(false);
    // Liaison devenue absente du modèle : signalée, jamais effacée.
    expect(programmeModelLinks(first.programmeCase, []).find((r) => r.space.id === s0.id)!.missing).toEqual(["rdc|R01"]);
    const removed = linkProgrammeRoom(first.programmeCase, first.roomData, s0.id, "rdc|R01", { remove: true, roomExists: true, now: NOW });
    expect(removed.programmeCase.roomLinks[s0.id]).toEqual([]);
    expect(removed.roomData["rdc|R01"]!.programmeSpaceId).toBeUndefined();
  });

  it("edits a hypothesis of the applied case; confirming or dismissing requires owner and proof", () => {
    const c = buildingCase(DATA, "office")!;
    const a = buildProgrammeCase(DATA, c, buildingScenario(c, "base")!, "Maroc", null, NOW);
    const h = a.hypotheses[0]!;
    expect(() => setProgrammeHypothesis(a, h.id, "status", "Confirmée par preuve", NOW)).toThrow("Renseignez d’abord responsable et preuve / motif.");
    const withOwner = setProgrammeHypothesis(a, h.id, "owner", "Chef de projet", NOW);
    const withProof = setProgrammeHypothesis(withOwner, h.id, "proof", "Note de renseignements du 12/03", NOW);
    const confirmed = setProgrammeHypothesis(withProof, h.id, "status", "Confirmée par preuve", NOW);
    expect(confirmed.hypotheses[0]).toMatchObject({ owner: "Chef de projet", proof: "Note de renseignements du 12/03", status: "Confirmée par preuve", updated: NOW });
    expect(() => setProgrammeHypothesis(a, h.id, "status", "Validée", NOW)).toThrow("Statut d’hypothèse inconnu");
    expect(() => setProgrammeHypothesis(a, "H-zzz", "owner", "x", NOW)).toThrow("Hypothèse inconnue");
  });

  it("previews and applies a surface transfer at constant total, refusing stale previews", () => {
    const c = buildingCase(DATA, "office")!;
    const a = buildProgrammeCase(DATA, c, buildingScenario(c, "base")!, "Maroc", null, NOW);
    const [s, t] = a.spaces.filter((x) => x.quantity > 0);
    const before = programmeCaseSums(a.spaces).total;
    expect(() => previewSurfaceTransfer(a, "p", s!.id, s!.id, 10, "Justification suffisante", fnv1a)).toThrow("Deux fiches distinctes et une surface positive disponible sont nécessaires.");
    expect(() => previewSurfaceTransfer(a, "p", s!.id, t!.id, 10, "court", fnv1a)).toThrow("Justifiez le transfert et ses conséquences.");
    expect(() => previewSurfaceTransfer(a, "p", s!.id, t!.id, s!.quantity * s!.unitArea + 1, "Justification suffisante", fnv1a)).toThrow("Deux fiches distinctes");
    const tr = previewSurfaceTransfer(a, "p", s!.id, t!.id, 10, "Justification suffisante", fnv1a);
    expect(tr).toMatchObject({ projectId: "p", revision: a.revision, from: s!.id, to: t!.id, amount: 10, before: { total: before }, after: { total: before } });
    expect(tr.after.from).toBeCloseTo(tr.before.from - 10, 6);
    expect(tr.after.to).toBeCloseTo(tr.before.to + 10, 6);
    const applied = applySurfaceTransfer(a, "p", tr, fnv1a, NOW);
    expect(applied.total).toBeCloseTo(before, 6);
    expect(applied.programmeCase.revision).toBe(a.revision + 2); // deux `editSpace`
    const sa = applied.programmeCase.spaces.find((x) => x.id === s!.id)!;
    expect(sa.quantity * sa.unitArea).toBeCloseTo(tr.after.from, 6);
    expect(() => applySurfaceTransfer(applied.programmeCase, "p", tr, fnv1a, NOW)).toThrow("Le programme a changé. Recalculez la comparaison.");
    expect(() => applySurfaceTransfer(a, "autre", tr, fnv1a, NOW)).toThrow("Le programme a changé.");
  });
});
