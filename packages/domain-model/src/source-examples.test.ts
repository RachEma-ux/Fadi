import { describe, expect, it } from "vitest";
import { fillFromSourceExample, sourceExampleOrigin, sourceExampleText, sourceExamplesForStep, type SourceExample, type SourceExamplesData } from "./source-examples";
import type { ParcoursFormField } from "./parcours";

const office: SourceExample = {
  key: "office",
  title: "Campus Atlas",
  summary: "Résumé.",
  need: "Besoin.",
  objective: "Objectif.",
  users: "Utilisateurs.",
  marketStudy: "Marché.",
  benchmark: "Benchmark.",
  decisionRationale: "Décision.",
  capacity: 120,
  unit: "postes",
  budgetCap: null,
  programmeNarrative: "Programme.",
  scenarios: [{ name: "S1", option: "Neuf", capacityNumeric: 120, areaNumeric: 1406, pros: "Avantage.", cons: "Inconvénient.", works: 10, months: 20 }],
  risks: [{ name: "Délai", level: "moyen", action: "Suivre." }],
};
const DATA: SourceExamplesData = {
  origins: { opportunity_atlas: "Opportunité", parcours_lot118: "Parcours V14-3", default: "Atelier Programmiste V2.1" },
  stageMap: { "3": ["office", "missing"], "19": ["office"] },
  examples: [office, { key: "opportunity_atlas", title: "Opportunité Atlas" }],
};

describe("source examples (exemples issus des fichiers sources)", () => {
  it("names the origin like the prototype and lists the step's examples in order, ignoring unknown keys", () => {
    expect(sourceExampleOrigin(DATA, office)).toBe("Atelier Programmiste V2.1");
    expect(sourceExampleOrigin(DATA, DATA.examples[1]!)).toBe("Opportunité");
    expect(sourceExamplesForStep(DATA, 3).map((e) => e.key)).toEqual(["office"]);
    expect(sourceExamplesForStep(DATA, 10)).toEqual([]);
  });

  it("composes the relevant text per step (exampleText), falling back to the summary", () => {
    expect(sourceExampleText(office, 3)).toBe("Marché.\n\nBenchmark.\n\nUtilisateurs.");
    expect(sourceExampleText(office, 6)).toBe("Objectif.\n\nProgramme.\n\nCapacité: 120 postes\n\nBudget plafond: à définir");
    expect(sourceExampleText(office, 19)).toBe("Décision.\n\nS1: Neuf; capacité 120; surface 1406 m²; Avantage. Inconvénient.\n\nDélai [moyen] — Suivre.");
    expect(sourceExampleText(office, 14)).toContain("S1: acquisition 0; travaux 10; honoraires 0; équipements 0; aléas 0; OPEX 0; recettes 0; délai 20 mois.");
    expect(sourceExampleText(office, 1)).toBe("Résumé.");
  });

  it("fills only empty fields, in order, keeps typed fields typed, and sets « À reprendre » at step 19", () => {
    const schema: ParcoursFormField[] = [
      { key: "f1", label: "A", type: "textarea" },
      { key: "f2", label: "B", type: "number" },
      { key: "f3", label: "C", type: "text" },
    ];
    const r = fillFromSourceExample({ f1: "Déjà renseigné" }, schema, office, 19);
    expect(r.fields["f1"]).toBe("Déjà renseigné");
    expect(r.fields["f2"]).toBeUndefined(); // « S1: Neuf; … » n'est pas un nombre
    expect(r.fields["f3"]).toBe("Délai [moyen] — Suivre.");
    expect(r.fields["decision"]).toBe("À reprendre");
    expect(r.filled).toEqual(["f3", "decision"]);
    const keep = fillFromSourceExample({ decision: "GO" }, [], office, 19);
    expect(keep.fields["decision"]).toBe("GO");
  });
});
