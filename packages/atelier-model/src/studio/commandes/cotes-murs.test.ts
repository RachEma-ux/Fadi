import { describe, expect, it } from "vitest";
import { applyStudioCommands, measureStudioDimension, newStudioDocument, validateStudioDocument, type StudioCommand, type StudioDocument } from "../document-2d.js";
import { studioContourMur } from "./cotes-murs.js";
import { studioDonneesVue } from "../dossier-conception.js";
import type { StudioOpening, StudioWall } from "../architecture/types.js";

/**
 * TR-AC-001 — cote associative sur un objet architectural : une cote se lie aux sommets du contour de l'emprise d'un mur
 * (ceux que la planche accroche sous l'identifiant du mur). Elle suit le mur modifié (même identité, depuis la planche 2D
 * comme depuis la vue 3D : même commande) ; elle n'est jamais perdue : mur supprimé ou contour changé → « à résoudre »,
 * géométrie gardée, valeur non évaluée, jamais rattachée en silence. Dimensions synthétiques du registre (mur 6 × 3 × 0,2 m).
 */

const mur = (over: Partial<StudioWall> = {}): StudioWall => ({ id: "m1", type: "wall", axis: [{ x: 0, y: 0 }, { x: 6, y: 0 }], thickness: 0.2, height: 3, base: 0, justification: "center", ...over });
const ouverture: StudioOpening = { id: "o1", type: "opening", hostId: "m1", position: 2.5, width: 1, height: 2.1, sill: 0 };
const avec = (doc: StudioDocument, ...cs: unknown[]) => applyStudioCommands(doc, cs.map((c) => c as StudioCommand));
const refus = (f: () => unknown): string => { try { f(); } catch (e) { return (e as Error).message; } return "accepté"; };
/** Cote de l'épaisseur : du sommet 0 (côté gauche, départ) au sommet 3 (côté droit, départ) du contour. */
const coteEpaisseur = (start = { x: 0, y: 0.1 }, end = { x: 0, y: -0.1 }) => ({
  toolId: "studio.dessin.cote",
  params: { id: "c1", type: "dimension", start, end, offset: -0.5, links: { start: { objectId: "m1", anchor: "vertex-0" }, end: { objectId: "m1", anchor: "vertex-3" } }, toResolve: false },
});
const base = () => avec(newStudioDocument("ac-001"), { toolId: "studio.architecture.mur", params: mur() }, { toolId: "studio.architecture.ouverture", params: ouverture }, coteEpaisseur());
const valeur = (d: StudioDocument) => measureStudioDimension(d, "c1")!.value;

describe("TR-AC-001 — cote associative sur un mur (objet architectural)", () => {
  it("[+] la cote se lie aux sommets du contour du mur ; le document relu la garde liée", () => {
    const d = base();
    expect(studioContourMur(mur())!.points).toEqual([{ x: 0, y: 0.1 }, { x: 6, y: 0.1 }, { x: 6, y: -0.1 }, { x: 0, y: -0.1 }]);
    expect(d.dimensions![0]!.links).toEqual({ start: { objectId: "m1", anchor: "vertex-0" }, end: { objectId: "m1", anchor: "vertex-3" } });
    expect(valeur(d)).toBeCloseTo(0.2, 12);
    expect(validateStudioDocument(JSON.parse(JSON.stringify(d)))).toEqual(d);
  });

  it("[+] le mur modifié (épaisseur 0,25 m depuis la vue 3D, puis déplacé sur la planche) : même cote, même identité du mur, la cote suit", () => {
    const d = avec(base(), { toolId: "studio.architecture.modifier", params: mur({ thickness: 0.25 }) });
    expect(d.dimensions![0]).toMatchObject({ id: "c1", start: { x: 0, y: 0.125 }, end: { x: 0, y: -0.125 }, toResolve: false, links: { start: { objectId: "m1" }, end: { objectId: "m1" } } });
    expect(valeur(d)).toBeCloseTo(0.25, 12);
    // Hauteur seule : le contour en plan ne change pas, la cote non plus (rien n'est perdu ni recréé).
    const h = avec(d, { toolId: "studio.architecture.modifier", params: mur({ thickness: 0.25, height: 3.2 }) });
    expect(h.dimensions).toEqual(d.dimensions);
    const deplace = avec(h, { toolId: "studio.dessin.deplacer", params: { id: "m1", dx: 1, dy: 2 } });
    expect(deplace.dimensions![0]).toMatchObject({ start: { x: 1, y: 2.125 }, end: { x: 1, y: 1.875 }, toResolve: false });
    expect(deplace.architecture!.map((x) => x.id)).toEqual(["m1", "o1"]);
    expect(deplace.architecture!.filter((x) => x.type === "wall")).toHaveLength(1);
    expect((deplace.architecture![1] as StudioOpening).hostId).toBe("m1");
  });

  it("[−] perte de cote : mur supprimé (cascade) — la cote n'est pas supprimée, elle passe « à résoudre », valeur non évaluée", () => {
    const d = avec(base(), { toolId: "studio.architecture.supprimer", params: { ids: ["m1"], cascade: true } });
    expect(d.architecture ?? []).toEqual([]);
    expect(d.dimensions![0]).toMatchObject({ id: "c1", start: { x: 0, y: 0.1 }, end: { x: 0, y: -0.1 }, links: { start: null, end: null }, toResolve: true });
    expect(measureStudioDimension(d, "c1")).toMatchObject({ status: "to-resolve", value: null });
  });

  it("[−] contour changé (axe repris à trois points) : l'indice ne désigne plus le même sommet — lien rompu, « à résoudre », jamais rattachée en silence", () => {
    const d = avec(base(), { toolId: "studio.architecture.modifier", params: mur({ axis: [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 4 }] }) });
    expect(d.dimensions![0]).toMatchObject({ start: { x: 0, y: 0.1 }, end: { x: 0, y: -0.1 }, links: { start: null, end: null }, toResolve: true });
    expect(valeur(d)).toBeNull();
  });

  it("[−] liens refusés : sommet inexistant, ancre non indexée, extrémité différente du sommet, mur absent — rien n'est créé", () => {
    const sans = avec(newStudioDocument("d"), { toolId: "studio.architecture.mur", params: mur() });
    const lien = (anchor: string) => ({ ...coteEpaisseur(), params: { ...coteEpaisseur().params, links: { start: { objectId: "m1", anchor }, end: null } } });
    expect(refus(() => avec(sans, lien("vertex-9")))).toMatch(/sommet incompatible avec l’objet lié/);
    expect(refus(() => avec(sans, lien("start")))).toMatch(/sommet incompatible avec l’objet lié/);
    expect(refus(() => avec(sans, coteEpaisseur({ x: 0, y: 0.2 })))).toMatch(/extrémité différente du sommet lié/);
    expect(refus(() => avec(newStudioDocument("d"), coteEpaisseur()))).toMatch(/objet lié introuvable/);
  });

  it("feuille composée : la vue documentaire garde la cote liée au mur qu'elle reprend (jamais détachée en silence)", () => {
    const vue = studioDonneesVue(base(), { type: "planche-2d" });
    expect(vue.document.dimensions![0]!.links).toEqual(base().dimensions![0]!.links);
  });

  it("copie indépendante du mur : la cote reste sur la source ; modifier la copie ne la touche pas", () => {
    const copie = avec(base(), { toolId: "studio.dessin.copier", params: { ids: ["m1"], dx: 0, dy: 3, copies: 1, prefix: "cp" } });
    const idCopie = copie.architecture!.find((x) => x.type === "wall" && x.id !== "m1")!.id;
    const modifiee = avec(copie, { toolId: "studio.architecture.modifier", params: { ...(copie.architecture!.find((x) => x.id === idCopie) as StudioWall), thickness: 0.3 } });
    expect(modifiee.dimensions).toEqual(base().dimensions);
    expect(valeur(modifiee)).toBeCloseTo(0.2, 12);
  });
});
