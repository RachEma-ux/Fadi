import { describe, expect, it } from "vitest";
import { ArchiveError, archiveFileName, archiveSafeName, cleanArchiveInput, decodeDataUrl, harmonieStateFromPrototype, normalizeImportedProjects } from "./archive";
import type { ParcoursStepDefinition } from "./parcours";

function def(number: number): ParcoursStepDefinition {
  return { number, title: `Étape ${number}`, phase: "Phase", key: null, scope: null, goal: null, inputs: null, deliverable: null, method: null, topic: null, harmonieOptions: [], transmitsTo: [], form: null };
}
const DEFS = Array.from({ length: 21 }, (_, i) => def(i + 1));
const OPTIONS = { now: "2026-10-02T09:00:00.000Z", applicationVersion: "fadi test", sourceVersion: "8.19.0" };

/** Un export du prototype (`backup()` de harmony-app-v6, données h7-app) réduit à l'essentiel. */
function prototypeExport() {
  return {
    kind: "parcours-v6-project",
    version: 7,
    applicationVersion: "7.0.0",
    exported: "2026-09-30T10:00:00.000Z",
    stageMapping: [],
    workflow: {
      id: "p-1",
      name: "Étude Bellevue",
      data: {
        business: { "2": { f1: "Zone I5", f3: 12.5, f4: "" }, "19": { decision: "GO sous conditions" } },
        harmonieEtapesV7: {
          schema: "Parcours.HarmonieParEtape",
          site: { frontageEdge: 2, approachStatus: "documented", priority: "retreat", frontContext: "open", backContext: "built", source: "Relevé du 12/03", note: "" },
          stages: {
            "2": {
              revision: 3,
              generatedAt: "2026-09-29T08:00:00.000Z",
              generatedHash: "deadbeef",
              proposals: [
                { id: "H01-A", key: "A", group: "parti", stage: 2, title: "A-titre", text: "A-texte", source: "Cadre", targets: [4], status: "proposed", decisionVersion: 0 },
                {
                  id: "H01-B",
                  key: "B",
                  group: "parti",
                  stage: 2,
                  title: "B-titre",
                  text: "Texte adapté",
                  adaptedText: "Texte adapté",
                  source: "Cadre",
                  targets: [4],
                  status: "adapted",
                  notes: "Texte adapté",
                  owner: "Chef de projet",
                  proof: "",
                  link: "",
                  updated: "2026-09-29T09:00:00.000Z",
                  decisionVersion: 2,
                  acceptedHash: "cafebabe",
                  history: [{ at: "2026-09-29T08:30:00.000Z", status: "proposed", text: "B-texte", proof: "", owner: "" }],
                },
              ],
            },
            "10": {
              revision: 1,
              generatedAt: "2026-09-29T08:00:00.000Z",
              proposals: [{ id: "H09-LOCAL-rdc|R01", key: "LOCAL", group: "local", stage: 10, roomId: "rdc|R01", objectId: "R01", title: "R01 · 14 m²", text: "Local", source: "Modèle abcd · objet R01", targets: [11, 13, 16], status: "retained", decisionVersion: 1, link: "rdc|R01" }],
            },
          },
        },
        programmeRepartition: { type: "tertiaire", baseArea: 900, mode: "max", custom: { circulation: 17 } },
        programmeCase: { schema: "Parcours.ProgrammeCase", caseId: "hotel", scenarioId: "B", revision: 2, spaces: [] },
        harmony: { config: { components: ["enseignement", "tertiaire"] } },
      },
      done: { "1": true, "2": true },
    },
    native: { id: "native-1", registry: { id: "native-1", name: "Modèle" }, domains: { levels: [{ id: "rdc" }], floorDesign: { levels: {} }, nativeParcel: { vertices: [] } } },
    stageAttachments: [
      { id: "a1", projectId: "p-1", stage: 3, projectStage: "p-1|3", name: "règlement.pdf", type: "application/pdf", size: 4, added: "2026-09-28T00:00:00.000Z", dataUrl: "data:application/pdf;base64,JVBERg==" },
      { id: "a2", projectId: "p-1", stage: 99, name: "hors-plage.txt", type: "text/plain", size: 1, dataUrl: "data:text/plain;base64,QQ==" },
      { id: "a3", projectId: "p-1", stage: 4, name: "sans-donnees.txt", type: "text/plain", size: 1 },
    ],
    warnings: ["Pièce non incluse (limite 20 Mo cumulés) : gros-plan.pdf"],
  };
}

describe("archive — export du prototype → archive Fadi", () => {
  it("convertit workflow, native et stageAttachments en un nouveau projet « · import »", () => {
    const [imp] = normalizeImportedProjects(prototypeExport(), DEFS, OPTIONS);
    expect(imp!.origin).toBe("parcours-v7");
    const a = imp!.archive;
    expect(a.kind).toBe("fadi-project-archive");
    expect(a.project.name).toBe("Étude Bellevue · import");
    expect(a.project.code).toBe("Etude_Bellevue");
    expect(a.project.siteObservations).toMatchObject({ frontageEdge: 2, approachStatus: "documented", priority: "retreat" });
    expect(a.steps).toHaveLength(21);
    const s2 = a.steps.find((s) => s.stepNumber === 2)!;
    expect(s2.status).toBe("termine");
    expect(s2.content.fields).toEqual({ f1: "Zone I5", f3: 12.5 }); // la chaîne vide n'est pas une réponse
    expect(s2.content.harmonie.revision).toBe(3);
    expect(s2.content.harmonie.generatedHash).toBeNull(); // recalculée par l'API sur les données importées
    expect(Object.keys(s2.content.harmonie.proposals)).toEqual(["H01-B"]); // A, jamais arbitrée, n'est pas copiée
    expect(s2.content.harmonie.proposals["H01-B"]).toMatchObject({ status: "adapted", adaptedText: "Texte adapté", owner: "Chef de projet", decisionVersion: 2, updatedAt: "2026-09-29T09:00:00.000Z", acceptedHash: null, snapshot: { ref: "H02-B", key: "B", group: "parti", title: "B-titre", text: "Texte adapté", targets: [4] } });
    expect(s2.content.harmonie.proposals["H01-B"]!.history).toEqual([{ at: "2026-09-29T08:30:00.000Z", status: "proposed", text: "B-texte", proof: "", owner: "", reason: null }]);
    const s10 = a.steps.find((s) => s.stepNumber === 10)!;
    expect(s10.status).toBe("en-cours"); // arbitrée mais pas marquée terminée
    expect(s10.content.harmonie.proposals["H09-LOCAL-rdc|R01"]!.snapshot).toMatchObject({ ref: "H10-LOCAL-rdc|R01", group: "local", roomId: "rdc|R01", objectId: "R01", targets: [11, 13, 16] });
    expect(a.steps.find((s) => s.stepNumber === 19)!.content.fields).toEqual({ decision: "GO sous conditions" });
    expect(a.steps.find((s) => s.stepNumber === 5)!.status).toBe("a-faire");
    expect(a.programmeRepartition).toEqual({ type: "tertiaire", baseArea: 900, mode: "max", custom: { circulation: 17 }, components: ["enseignement", "tertiaire"] });
    expect(a.programmeCases).toEqual([{ revision: 2, caseId: "hotel", scenarioId: "B", data: expect.objectContaining({ caseId: "hotel" }) }]);
    expect(a.native!.entries["design.v13.activeProject"]).toBe("native-1");
    expect(a.native!.entries["design.v13.project.native-1.levels"]).toEqual([{ id: "rdc" }]);
    expect(a.native!.entries["design.v13.registry"]).toEqual([{ id: "native-1", name: "Étude Bellevue · import" }]);
    expect(a.project.modelRevision).toBe(1);
    // Seules les pièces d'une étape valide avec données base64 sont reprises.
    expect(a.stageAttachments).toEqual([{ stepNumber: 3, name: "règlement.pdf", type: "application/pdf", size: 4, addedAt: "2026-09-28T00:00:00.000Z", dataUrl: "data:application/pdf;base64,JVBERg==" }]);
    expect(a.warnings).toEqual(["Pièce non incluse (limite 20 Mo cumulés) : gros-plan.pdf"]);
    expect(a.stageMapping[0]).toEqual({ stableId: 1, display: "01", title: "Étape 1" });
  });

  it("accepte une base projets V5 (plusieurs projets, modèle natif embarqué) et un projet V5 isolé", () => {
    const v5 = { projects: [{ id: "a", name: "A", data: { business: {}, architecture: { nativeModel: { id: "n-a", registry: {}, domains: { levels: [] } } } } }, { id: "b", name: "B", data: {} }] };
    const list = normalizeImportedProjects(v5, DEFS, OPTIONS);
    expect(list.map((x) => [x.origin, x.archive.project.name])).toEqual([
      ["parcours-v5", "A · import"],
      ["parcours-v5", "B · import"],
    ]);
    expect(list[0]!.archive.native!.entries["design.v13.activeProject"]).toBe("n-a");
    expect(list[1]!.archive.native).toBeNull();
    expect(list[1]!.archive.project.modelRevision).toBe(0);
    const single = normalizeImportedProjects({ id: "c", name: "C", data: { done: {} } }, DEFS, OPTIONS);
    expect(single[0]!.archive.project.name).toBe("C · import");
  });

  it("refuse avec les messages du prototype : format inconnu, structure invalide, domaine natif invalide, clé interdite", () => {
    expect(() => normalizeImportedProjects({ hello: 1 }, DEFS, OPTIONS)).toThrow("Format attendu : export Parcours V6 / V7 ou base projets V5.");
    expect(() => normalizeImportedProjects("texte", DEFS, OPTIONS)).toThrow(ArchiveError);
    expect(() => normalizeImportedProjects({ kind: "parcours-v6-project", workflow: { name: 3, data: {} } }, DEFS, OPTIONS)).toThrow("Structure de projet invalide.");
    expect(() => normalizeImportedProjects({ kind: "parcours-v6-project", workflow: { name: "X", data: [] } }, DEFS, OPTIONS)).toThrow("Structure de projet invalide.");
    expect(() => normalizeImportedProjects({ kind: "parcours-v6-project", workflow: { name: "X", data: {} }, native: { id: "n", domains: { "../x": {} } } }, DEFS, OPTIONS)).toThrow("Domaine natif invalide.");
    expect(() => cleanArchiveInput(JSON.parse('{"a":{"__proto__":{"polluted":true}}}'))).toThrow("Clé de fichier non autorisée");
    expect(() => normalizeImportedProjects({ projects: [] }, DEFS, OPTIONS)).toThrow("Format attendu");
  });

  it("relit une archive Fadi : nom suffixé, 21 étapes bornées, empreintes effacées, clés natives contrôlées", () => {
    const [imp] = normalizeImportedProjects(prototypeExport(), DEFS, OPTIONS);
    const exported = { ...imp!.archive, project: { ...imp!.archive.project, name: "Étude Bellevue", code: "P.1" } };
    exported.steps[1]!.content.harmonie.generatedHash = "11112222";
    exported.steps[1]!.content.harmonie.proposals["H01-B"]!.acceptedHash = "11112222";
    const back = normalizeImportedProjects(JSON.parse(JSON.stringify({ ...exported, steps: [...exported.steps, { stepNumber: 40, status: "termine", content: {} }] })), DEFS, OPTIONS);
    expect(back[0]!.origin).toBe("fadi");
    const a = back[0]!.archive;
    expect(a.project).toMatchObject({ name: "Étude Bellevue · import", code: "P.1", modelRevision: 1 });
    expect(a.steps).toHaveLength(21);
    expect(a.steps[1]!.content.harmonie.generatedHash).toBeNull();
    expect(a.steps[1]!.content.harmonie.proposals["H01-B"]).toMatchObject({ status: "adapted", acceptedHash: null, snapshot: { ref: "H02-B" } });
    expect(a.stageAttachments).toHaveLength(1);
    expect(() => normalizeImportedProjects({ ...exported, native: { entries: { "design.v13.project.x.levels": [], "pwned": 1 } } }, DEFS, OPTIONS)).toThrow("Domaine natif invalide.");
    expect(() => normalizeImportedProjects({ ...exported, version: 99 }, DEFS, OPTIONS)).toThrow("Version d'archive non prise en charge : 99.");
  });

  it("nomme le fichier comme le prototype et décode les pièces jointes", () => {
    expect(archiveSafeName("P.118 — Escalier B & mezzanine (été)")).toBe("P.118_Escalier_B_mezzanine_ete_");
    expect(archiveFileName("Étude")).toBe("Parcours_V7_Etude.json");
    expect(decodeDataUrl("data:application/pdf;base64,JVBERg==")).toEqual({ type: "application/pdf", base64: "JVBERg==" });
    expect(decodeDataUrl("data:;base64,QQ==")).toEqual({ type: "application/octet-stream", base64: "QQ==" });
    expect(decodeDataUrl("https://example.org")).toBeNull();
    expect(harmonieStateFromPrototype(2, null)).toEqual({ revision: 0, generatedAt: null, generatedHash: null, proposals: {} });
  });
});
