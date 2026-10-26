import { beforeEach, describe, expect, it, vi } from "vitest";
/**
 * E.6-04 — exports 3D d'une révision par la route réelle `GET …/export?format=obj|stl|step` (routeur Express réel, base
 * simulée en mémoire, aucune base ni réseau ; noyau exact réel pour STEP, chargé à la demande) : type de fichier, nom,
 * révision servie, droits de lecture, refus d'un STEP sans solide, rapport de fidélité réservé à SVG / DXF / IFC.
 */
vi.mock("../db/client.js", async () => ({ db: (await import("../testing/studio-base-simulee.js")).baseSimulee() }));
vi.mock("../middleware/require-auth.js", async () => (await import("../testing/studio-base-simulee.js")).authSimulee());
vi.mock("../lib/owned-project.js", async (original) => (await import("../testing/studio-base-simulee.js")).accesSimule(await original<typeof import("../lib/owned-project.js")>()));
vi.mock("../lib/step-rows.js", () => ({ lockProject: vi.fn(async () => undefined) }));
vi.mock("../lib/atelier-events.js", () => ({ EVENEMENT_COMMANDE_VALIDEE: "atelier.commande.validee", enregistrerEvenement: vi.fn() }));
vi.mock("../lib/atelier-modele.js", () => ({ chargerModele: vi.fn(), creerModeleVide: vi.fn(), persisterDifferentiel: vi.fn() }));
vi.mock("../lib/atelier-refexterne.js", () => ({ controlerRattachements: vi.fn() }));

import express from "express";
import request from "supertest";
import { applyStudioCommands, newStudioDocument, studioIdDepuisNom3d, type StudioCommand } from "@parcours/atelier-model";
import { MoteurExact } from "@parcours/geometry-exact";
import { studioRevisions } from "../db/schema.js";
import { studioRouter } from "./studio.js";
import { banc, initialiserProjet } from "../testing/studio-base-simulee.js";

const app = express();
app.use("/projects/:projectId/studio", studioRouter);
const V = "/projects/p/studio/studies/s/variants/v";
const lire = (acteur: string, format: string) => request(app).get(`${V}/export?format=${format}`).set("x-acteur", acteur).buffer(true).parse((res, fin) => {
  let t = ""; res.setEncoding("utf8"); res.on("data", (c: string) => { t += c; }); res.on("end", () => fin(null, t));
});

/** Tête `r1` remplacée par une révision qui porte une dalle extrudée, une boîte et un mur avec sa porte. */
function poserSolides() {
  const doc = applyStudioCommands(newStudioDocument("doc"), [
    { toolId: "studio.dessin.rectangle", params: { id: "dalle", type: "rectangle", origin: { x: 0, y: 0 }, width: 4, height: 3, extrusion: { base: 0, height: 0.2 } } },
    { toolId: "studio.solide.boite", params: { id: "boite", type: "box", placement: { origin: { x: 10, y: 0, z: 0 }, rotation: 0 }, width: 1, depth: 1, height: 1 } },
    { toolId: "studio.architecture.mur", params: { id: "mur", type: "wall", axis: [{ x: 0, y: -5 }, { x: 6, y: -5 }], thickness: 0.2, height: 3, base: 0, justification: "center" } },
    { toolId: "studio.architecture.ouverture", params: { id: "porte", type: "opening", hostId: "mur", position: 2, width: 1, height: 2.1, sill: 0, kind: "porte" } },
  ] as StudioCommand[]);
  const r = banc.lignes.get(studioRevisions)!.find((x) => x["id"] === "r1")!;
  r["document"] = doc;
  r["createdAt"] = new Date("2026-10-26T09:30:00.000Z");
}

beforeEach(initialiserProjet);

describe("E.6-04 — route d'export 3D (OBJ, STL, STEP)", () => {
  it("E.6-04 route : OBJ, STL et STEP servis au lecteur — type model/*, nom de fichier, révision, contenu du modèle", async () => {
    poserSolides();
    for (const [format, type] of [["obj", "model/obj"], ["stl", "model/stl"], ["step", "model/step"]] as const) {
      const r = await lire("lecteur", format);
      expect(r.status, format).toBe(200);
      expect(r.headers["content-type"], format).toBe(type);
      expect(r.headers["x-studio-revision"]).toBe("r1");
      expect(r.headers["content-disposition"]).toMatch(new RegExp(`^attachment; filename="etude-variante-r1\\.${format}"$`));
    }
    const obj = (await lire("lecteur", "obj")).body as string;
    expect(obj.split("\n").filter((l) => l.startsWith("o ")).map((l) => l.slice(2))).toEqual(["dalle", "boite", "mur"]);
    const stl = (await lire("lecteur", "stl")).body as string;
    expect(stl.startsWith("solid fadi-studio doc\n")).toBe(true);
    const step = (await lire("lecteur", "step")).body as string;
    expect(step).toContain("FILE_NAME('variante.step','2026-10-26T09:30:00'");
    const lues = (await MoteurExact.charger()).lireStepPieces(step);
    expect(lues.map((p) => studioIdDepuisNom3d(p.nom))).toEqual(["dalle", "boite", "mur"]);
    expect(lues[2]!.volume).toBeCloseTo(6 * 0.2 * 3 - 1 * 2.1 * 0.2, 6);
  });

  it("E.6-04 route : STEP d'une révision sans solide refusé (422 nothing_to_export) ; rapport de fidélité réservé à SVG, DXF et IFC ; compte hors projet 404", async () => {
    const vide = await lire("lecteur", "step");
    expect(vide.status).toBe(422);
    expect(JSON.parse(vide.body as string)).toMatchObject({ error: "nothing_to_export" });
    // OBJ et STL d'une révision sans solide : fichier valide (contour en ligne pour OBJ, aucune facette pour STL).
    expect((await lire("lecteur", "obj")).status).toBe(200);
    expect((await lire("lecteur", "stl")).body).toBe("solid fadi-studio doc\nendsolid fadi-studio doc\n");
    const rapport = await request(app).get(`${V}/export/rapport?format=obj`).set("x-acteur", "lecteur");
    expect(rapport.status).toBe(400);
    expect((await lire("autre", "obj")).status).toBe(404);
    expect((await lire("lecteur", "gltf")).status).toBe(400);
  });
});
