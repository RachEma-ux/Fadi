/**
 * E.6-04 — export STEP d'une révision Studio par le serveur : pièces du modèle (`studioPiecesStep`) écrites par le
 * noyau exact (occt-wasm en Node, chargé à la demande), puis **relues** par le même noyau : un produit par élément,
 * nommé par son identifiant Studio, volume et boîte en mètres égaux au modèle. Sans base de données.
 */
import { describe, expect, it } from "vitest";
import {
  applyStudioCommands, newStudioDocument, studioCaptureBooleen, studioIdDepuisNom3d, studioQuantitesArchitecture, studioQuantitesSolides,
  type StudioCommand, type StudioDocument,
} from "@parcours/atelier-model";
import { MoteurExact } from "@parcours/geometry-exact";
import { exportStudioStep } from "./studio-exact.js";

const boite = (id: string, x: number): StudioCommand => ({ toolId: "studio.solide.boite", params: { id, type: "box", placement: { origin: { x, y: 0, z: 0 }, rotation: 0 }, width: 2, depth: 2, height: 2 } }) as StudioCommand;

async function documentEssai(): Promise<StudioDocument> {
  let d = applyStudioCommands(newStudioDocument("step"), [
    boite("A", 0), boite("B", 1),
    { toolId: "studio.solide.prisme", params: { id: "oblique é", type: "prism", placement: { origin: { x: 10, y: 0, z: 0 }, rotation: 0 }, profile: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }], height: 2, direction: { x: 0.5, y: 0, z: 1 } } },
    { toolId: "studio.dessin.rectangle", params: { id: "dalle", type: "rectangle", origin: { x: 0, y: 10 }, width: 4, height: 3, extrusion: { base: 0, height: 0.2 } } },
    { toolId: "studio.architecture.mur", params: { id: "mur", type: "wall", axis: [{ x: 0, y: -5 }, { x: 6, y: -5 }], thickness: 0.2, height: 3, base: 0, justification: "center" } },
    { toolId: "studio.architecture.ouverture", params: { id: "porte", type: "opening", hostId: "mur", position: 2, width: 1, height: 2.1, sill: 0, kind: "porte" } },
  ] as StudioCommand[]);
  // Booléen exact calculé par le noyau (différence A − B) : son brep part tel quel dans le STEP.
  const c = studioCaptureBooleen(d, { operation: "difference", operandes: ["A", "B"] });
  if (!c.ok) throw new Error(c.message);
  const r = (await MoteurExact.charger()).executer(c.capture.entrees);
  d = applyStudioCommands(d, [{ toolId: "studio.solide.booleen", params: { id: "AmB", operation: "difference", operandes: ["A", "B"], resultat: r } } as StudioCommand]);
  return d;
}

describe("E.6-04 — export STEP de Studio par le serveur (noyau exact)", () => {
  it("E.6-04 STEP serveur : relu par le noyau, un produit par élément solide nommé par son identifiant, volumes et unités du modèle", async () => {
    const d = await documentEssai();
    const step = await exportStudioStep(d, "2026-10-26T08:00:00", "essai.step");
    expect(step).not.toBeNull();
    expect(step!).toContain("FILE_NAME('essai.step','2026-10-26T08:00:00'");
    expect(step!).toMatch(/SI_UNIT\(\.MILLI\.,\.METRE\.\)/);
    // ASCII strict (les identifiants hors ASCII sont échappés, réversibles).
    expect(/^[\x09\x0A\x0D\x20-\x7E]*$/.test(step!)).toBe(true);
    const lues = (await MoteurExact.charger()).lireStepPieces(step!);
    const parId = new Map(lues.map((p) => [studioIdDepuisNom3d(p.nom), p]));
    expect([...parId.keys()]).toEqual(["dalle", "oblique é", "AmB", "mur"]);
    expect(parId.get("dalle")!.volume).toBeCloseTo(4 * 3 * 0.2, 6);
    expect(parId.get("oblique é")!.volume).toBeCloseTo(studioQuantitesSolides(d).items.find((s) => s.id === "oblique é")!.volume!, 6);
    expect(parId.get("AmB")!.volume).toBeCloseTo(d.exacts![0]!.resultat.volume, 6);
    const mur = studioQuantitesArchitecture(d.architecture!).find((m) => m.id === "mur")!;
    if (mur.type !== "wall") throw new Error("mur attendu");
    expect(parId.get("mur")!.volume).toBeCloseTo(mur.volumeNet, 6);
    expect(parId.get("mur")!.solides).toBeGreaterThan(1);
    // Mètres : la dalle mesure 4 × 3 × 0,2 m, pas des millimètres.
    const b = parId.get("dalle")!.boite!;
    expect([b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z].map((v) => Math.round(v * 1e6) / 1e6)).toEqual([4, 3, 0.2]);
    // Reproductible : même révision, même fichier.
    expect(await exportStudioStep(d, "2026-10-26T08:00:00", "essai.step")).toBe(step);
  });

  it("E.6-04 STEP serveur : révision sans solide — aucun fichier (null), l'API répond 422 nothing_to_export", async () => {
    const d = applyStudioCommands(newStudioDocument("vide"), [{ toolId: "studio.dessin.ligne", params: { id: "l", type: "line", start: { x: 0, y: 0 }, end: { x: 1, y: 0 } } } as StudioCommand]);
    expect(await exportStudioStep(d, "2026-10-26T08:00:00", "vide.step")).toBeNull();
  });
});
