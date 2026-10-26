/**
 * X.1-05 — surfaces libres NURBS de Studio côté serveur (R9) : chaque `studio.surface.epaissir` est recalculé par le
 * même noyau exact que le navigateur (occt-wasm en Node, opération `nurbs`), depuis la surface du document du SERVEUR,
 * jamais depuis une géométrie du client ; l'empreinte annoncée doit être la sienne, puis son résultat remplace celui du
 * client. Export STEP de la révision : la surface épaissie y part en brep exact (faces B-spline rationnelles), relue par
 * le noyau. Sans base de données (fonctions pures au-dessus du noyau, appelées par la route avant `applyStudioCommands`).
 */
import { describe, expect, it } from "vitest";
import {
  applyStudioCommands, newStudioDocument, studioCaptureEpaississement, studioIdDepuisNom3d, type StudioCommand, type StudioDocument, type StudioSurfaceLibre,
} from "@parcours/atelier-model";
import { MoteurExact } from "@parcours/geometry-exact";
import { exportStudioStep, revaliderBooleensStudio } from "./studio-exact.js";

/** Quart de cylindre rationnel vertical R × L, axe à l'origine (arc de degré 2, poids 1, √2/2, 1). */
function quartCylindre(id: string, R: number, L: number): StudioSurfaceLibre {
  const arc = [{ x: R, y: 0 }, { x: R, y: R }, { x: 0, y: R }], w = [1, Math.SQRT1_2, 1];
  const controle = [], poids = [];
  for (let i = 0; i < 3; i++) for (let k = 0; k < 2; k++) { controle.push({ x: arc[i]!.x, y: arc[i]!.y, z: k * L }); poids.push(w[i]!); }
  return { id, type: "surface-libre", degreU: 2, degreV: 1, lignes: 3, colonnes: 2, controle, poids };
}
const doc = (s = quartCylindre("S", 2, 3)): StudioDocument => applyStudioCommands(newStudioDocument("srv"), [{ toolId: "studio.surface.nurbs", params: s }]);

async function resultatNavigateur(d: StudioDocument, epaisseur: number, sens: "normale" | "inverse") {
  const c = studioCaptureEpaississement(d, { surface: "S", epaisseur, sens });
  if (!c.ok) throw new Error(c.message);
  return (await MoteurExact.charger()).executer(c.capture.entrees);
}
const epaissir = (resultat: unknown, epaisseur = 0.1, sens = "normale"): StudioCommand => ({ toolId: "studio.surface.epaissir", params: { id: "E", surface: "S", epaisseur, sens, resultat } }) as StudioCommand;

describe("X.1-05 — épaississement exact recalculé par le serveur", () => {
  it("X.1-05 serveur : l'épaississement est recalculé depuis la surface du document du serveur ; son résultat remplace celui du client", async () => {
    const d = doc();
    const r = await resultatNavigateur(d, 0.1, "normale");
    // Le client annonce la bonne empreinte mais un maillage et un volume altérés : le serveur écrit les siens.
    const cs = [epaissir({ ...r, maillage: { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2] }, volume: 999 })];
    expect(await revaliderBooleensStudio(d, cs, applyStudioCommands)).toBeNull();
    const p = cs[0]!.params as { resultat: { volume: number; maillage: unknown } };
    const attendu = (Math.PI / 4) * (2.1 ** 2 - 4) * 3;
    expect(Math.abs(p.resultat.volume - attendu) / attendu).toBeLessThan(1e-6);
    expect(p.resultat.maillage).toEqual(r.maillage);
    const apres = applyStudioCommands(d, cs);
    expect(apres.exacts![0]).toMatchObject({ id: "E", operation: "epaississement", surface: quartCylindre("S", 2, 3), epaisseur: 0.1, sens: "normale" });
    expect(apres.surfaces).toBeUndefined();
  });

  it("X.1-05 serveur : empreinte d'un calcul sur une autre surface ou d'un autre côté — refus 400 exact-mismatch ; surface absente ou épaisseur manquante — refus 400 studio-invalid, sans noyau", async () => {
    const d = doc();
    // Le client a calculé sur une surface modifiée (rayon 2,5) : son empreinte n'est pas celle du serveur.
    const autre = await resultatNavigateur(doc(quartCylindre("S", 2.5, 3)), 0.1, "normale");
    expect(await revaliderBooleensStudio(d, [epaissir(autre)], applyStudioCommands)).toMatchObject({ status: 400, body: { error: "invalid_commands", code: "exact-mismatch", path: "commands[0].params.resultat.empreinte" } });
    // Côté opposé : autre solide, autre empreinte.
    const inverse = await resultatNavigateur(d, 0.1, "inverse");
    expect(await revaliderBooleensStudio(d, [epaissir(inverse)], applyStudioCommands)).toMatchObject({ status: 400, body: { code: "exact-mismatch" } });
    // Le volume de l'intérieur est bien π/4 (R² − (R − e)²) L.
    expect(Math.abs(inverse.volume - (Math.PI / 4) * (4 - 1.9 ** 2) * 3) / inverse.volume).toBeLessThan(1e-6);
    const sansSurface = [{ toolId: "studio.surface.epaissir", params: { id: "E", surface: "Z", epaisseur: 0.1, sens: "normale", resultat: autre } }] as StudioCommand[];
    expect(await revaliderBooleensStudio(d, sansSurface, applyStudioCommands)).toMatchObject({ status: 400, body: { code: "studio-invalid", message: "Surface introuvable : Z." } });
    const sansEpaisseur = [{ toolId: "studio.surface.epaissir", params: { id: "E", surface: "S", sens: "normale", resultat: autre } }] as unknown as StudioCommand[];
    expect(await revaliderBooleensStudio(d, sansEpaisseur, applyStudioCommands)).toMatchObject({ status: 400, body: { code: "studio-invalid" } });
  });

  it("X.1-05 serveur : la surface créée dans le même lot est relue après la création (préfixe appliqué), puis épaissie", async () => {
    const vide = newStudioDocument("srv");
    const r = await resultatNavigateur(doc(), 0.1, "normale");
    const cs: StudioCommand[] = [{ toolId: "studio.surface.nurbs", params: quartCylindre("S", 2, 3) }, epaissir(r)];
    expect(await revaliderBooleensStudio(vide, cs, applyStudioCommands)).toBeNull();
    expect(applyStudioCommands(vide, cs).exacts).toHaveLength(1);
  });

  it("X.1-05 STEP serveur : la surface épaissie part en brep exact, relue par le noyau avec son volume ; une surface non épaissie n'est pas écrite", async () => {
    const d = doc();
    const r = await resultatNavigateur(d, 0.1, "normale");
    const e = applyStudioCommands(d, [epaissir(r), { toolId: "studio.surface.nurbs", params: { ...quartCylindre("N", 1, 1) } }]);
    const step = await exportStudioStep(e, "2026-10-26T08:00:00", "surfaces.step");
    expect(step).not.toBeNull();
    const lues = (await MoteurExact.charger()).lireStepPieces(step!);
    expect(lues.map((p) => studioIdDepuisNom3d(p.nom))).toEqual(["E"]);
    expect(lues[0]!.volume).toBeCloseTo(e.exacts![0]!.resultat.volume, 6);
    // Faces B-spline rationnelles exactes dans le fichier (pas de maillage).
    expect(step!).toMatch(/RATIONAL_B_SPLINE_SURFACE/);
    // Seule la surface non épaissie : rien à écrire (l'API répond 422).
    expect(await exportStudioStep(doc(), "2026-10-26T08:00:00", "vide.step")).toBeNull();
  });
});
