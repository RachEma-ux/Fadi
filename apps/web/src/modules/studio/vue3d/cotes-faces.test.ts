/**
 * INV-013 (lot G2) — vue 3D : cote de face construite depuis le formulaire (deux faces du solide choisi), libellé avec
 * sa valeur dérivée, ou « à résoudre » après la division de la face cotée ; rattachement explicite par le même
 * identifiant.
 */
import { describe, expect, it } from "vitest";
import { applyStudioCommands, newStudioDocument, studioValeurCoteFace, type StudioCommand } from "@parcours/atelier-model";
import { commandeCoteFace, descriptionCoteFace } from "./volume-libre";

const nombre = (v: number) => String(Math.round(v * 1000) / 1000);
const boite: StudioCommand = { toolId: "studio.solide.boite", params: { id: "b1", type: "box", placement: { origin: { x: 0, y: 0, z: 0 }, rotation: 0 }, width: 4, depth: 2, height: 3 } };

describe("INV-013 — cote de face dans la vue 3D (lot G2)", () => {
  it("INV-013 [+] formulaire → commande de cote ; libellé avec la valeur, qui suit la face poussée ; rattachement explicite après division", () => {
    const r = commandeCoteFace("c1", "b1", { a: "lateral-0", b: "lateral-2" });
    expect(r).toEqual({ commandes: [{ toolId: "studio.solide.cote-face", params: { id: "c1", type: "face-dimension", solidId: "b1", faces: ["lateral-0", "lateral-2"], toResolve: false } }] });
    let d = applyStudioCommands(newStudioDocument("v3d"), [boite, ...(r as { commandes: StudioCommand[] }).commandes]);
    const lib = () => descriptionCoteFace(d.cotesFaces![0]!, studioValeurCoteFace(d.solides!, d.cotesFaces![0]!), nombre, d.solides![0]);
    expect(lib()).toBe("Face latérale y− ↔ Face latérale y+ : 2 m");
    d = applyStudioCommands(d, [{ toolId: "studio.solide.face-decaler", params: { id: "b1", face: "lateral-2", distance: 0.5 } }]);
    expect(lib()).toBe("Face latérale y− ↔ Face latérale y+ : 2.5 m");
    d = applyStudioCommands(d, [{ toolId: "studio.solide.face-diviser", params: { id: "b1", face: "lateral-0", distance: 1 } }]);
    expect(lib()).toMatch(/: à résoudre \(valeur non évaluée\)$/);
    const rattache = commandeCoteFace("c1", "b1", { a: "lateral-1", b: "lateral-3" });
    d = applyStudioCommands(d, (rattache as { commandes: StudioCommand[] }).commandes);
    expect(d.cotesFaces).toHaveLength(1);
    expect(lib()).toBe("Face latérale 2 (arête 2 → 3) ↔ Face latérale 4 (arête 4 → 5) : 2.5 m");
  });

  it("INV-013 [−] formulaire incomplet : rien n'est envoyé ; faces identiques refusées avant le modèle", () => {
    expect(commandeCoteFace("c1", null, { a: "base", b: "sommet" })).toEqual({ erreur: "Sélectionnez d’abord, dans la vue 3D, le solide à coter." });
    expect(commandeCoteFace("c1", "b1", { a: "", b: "sommet" })).toEqual({ erreur: "Choisissez les deux faces parallèles à coter." });
    expect(commandeCoteFace("c1", "b1", { a: "base", b: "base" })).toEqual({ erreur: "Choisissez deux faces différentes." });
  });
});
