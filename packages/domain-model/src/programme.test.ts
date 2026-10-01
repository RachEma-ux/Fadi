import { describe, expect, it } from "vitest";
import {
  defaultProgrammeRepartition,
  programmeCaseSums,
  programmeRatio,
  programmeRows,
  programmeTotals,
  type ProgrammeRepartitionData,
} from "./programme";

// Fourchettes du prototype (PROGRAMME_TYPES), deux types suffisent ici.
const DATA: ProgrammeRepartitionData = {
  defaults: { type: "tertiaire", baseArea: 673, mode: "cible" },
  modes: [
    { key: "min", label: "Basse" },
    { key: "cible", label: "Cible" },
    { key: "max", label: "Haute" },
  ],
  families: [
    { key: "circulation", label: "Circulations" },
    { key: "technique", label: "Locaux techniques" },
    { key: "sanitaires", label: "Sanitaires" },
    { key: "convivialite", label: "Accueil / convivialité" },
  ],
  types: {
    tertiaire: { label: "Tertiaire / bureaux", ratios: { circulation: [10, 15, 18], technique: [4, 6, 7], sanitaires: [1, 2, 2], convivialite: [2, 5, 8] } },
    residentiel: { label: "Résidentiel", ratios: { circulation: [8, 12, 15], technique: [3, 5, 7], sanitaires: [0, 0, 0], convivialite: [0, 2, 5] } },
  },
  adjacency: [],
  statusNote: "",
  subtitle: "",
  transfer: { title: "", rules: "", control: "" },
};

describe("répartition programmatique — étapes 06/07", () => {
  it("reproduit les KPI du prototype pour le réglage par défaut (673 m², tertiaire, cible)", () => {
    // Observé sur le prototype, projet vierge, étape 06 : Surface référence 673.0 m² ·
    // Fonctions support 28.0 % · Support calculé 188.4 m² · Solde programmable 484.6 m².
    const rep = defaultProgrammeRepartition(DATA);
    const t = programmeTotals(DATA, rep);
    expect(t.supportPercent).toBe(28);
    expect(t.supportArea).toBeCloseTo(188.44, 2);
    expect(t.netArea).toBeCloseTo(484.56, 2);
    const rows = programmeRows(DATA, rep);
    expect(rows.map((r) => [r.key, r.ratio, r.range])).toEqual([
      ["circulation", 15, [10, 18]],
      ["technique", 6, [4, 7]],
      ["sanitaires", 2, [1, 2]],
      ["convivialite", 5, [2, 8]],
    ]);
    expect(rows[0]!.area).toBeCloseTo(100.95, 2);
  });

  it("suit la position dans la fourchette et les ratios forcés", () => {
    const low = { ...defaultProgrammeRepartition(DATA), mode: "min" as const };
    expect(programmeTotals(DATA, low).supportPercent).toBe(17);
    const forced = { ...defaultProgrammeRepartition(DATA), custom: { circulation: 20.5 } };
    expect(programmeRatio(DATA, forced, "circulation")).toBe(20.5);
    expect(programmeTotals(DATA, forced).supportPercent).toBeCloseTo(33.5);
  });

  it("ne laisse jamais le solde programmable devenir négatif", () => {
    const over = { ...defaultProgrammeRepartition(DATA), custom: { circulation: 60, technique: 30, sanitaires: 10, convivialite: 10 } };
    expect(programmeTotals(DATA, over).netPercent).toBe(0);
  });
});

describe("sommes d'un cas de programme (bibliothèque des bâtiments)", () => {
  it("additionne quantité × surface par famille, puis support, programme et total", () => {
    const sums = programmeCaseSums([
      { name: "Bureau", quantity: 2, unitArea: 100, bucket: "principal" },
      { name: "Couloir", quantity: 1, unitArea: 50, bucket: "circulation" },
      { name: "Local inconnu", quantity: 1, unitArea: 10, bucket: "autre-chose" },
      { name: "Gaines", quantity: 1, unitArea: 5, bucket: "parois" },
    ]);
    expect(sums.principal).toBe(200);
    expect(sums.circulation).toBe(50);
    expect(sums.supportAutres).toBe(10);
    expect(sums.support).toBe(60);
    expect(sums.programme).toBe(260);
    expect(sums.total).toBe(265);
  });

  it("refuse une ligne invalide au lieu de la compter zéro", () => {
    expect(() => programmeCaseSums([{ name: "Vide", quantity: Number.NaN, unitArea: 10 }])).toThrow("Surface ou quantité invalide : Vide");
  });
});
