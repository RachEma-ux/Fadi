/**
 * EX-064 — identité BIM (groupe E, point 2) : paramètres de conception (épaisseur, implantation du mur), propriétés
 * techniques déclarées (composition, performance : `proprietes`) et style de représentation (couleur, finition :
 * apparence d'affichage, `scenes`) sont trois catégories indépendantes. Changer la couleur ne touche ni les paramètres
 * ni les propriétés ; changer l'épaisseur ne touche ni le style ni les propriétés. Pur.
 */
import { describe, expect, it } from "vitest";
import { applyStudioCommands, newStudioDocument, type StudioCommand, type StudioDocument } from "./document-2d.js";

const unchecked = (c: unknown[]) => c as StudioCommand[];
const MUR = { id: "m1", type: "wall", axis: [{ x: 0, y: 0 }, { x: 6, y: 0 }], thickness: 0.2, height: 2.7, base: 0, justification: "center" };
const categories = (d: StudioDocument) => ({
  parametres: (d.architecture ?? []).filter((x) => x.id === "m1"),
  proprietes: d.proprietes ?? [],
  style: (d.scenes ?? []).filter((x) => x.type === "appearance"),
});

function modele(): StudioDocument {
  return applyStudioCommands(newStudioDocument("ex064"), unchecked([
    { toolId: "studio.architecture.mur", params: MUR },
    { toolId: "studio.propriete.definir", params: { cibleId: "m1", nom: "Composition", valeur: "Béton 20 cm", source: "Note de conception (essai)" } },
    { toolId: "studio.propriete.definir", params: { cibleId: "m1", nom: "Résistance au feu", valeur: "EI 60", source: "CCTP (essai)" } },
    { toolId: "studio.apparence.definir", params: { id: "ap1", type: "appearance", target: { kind: "object", id: "m1" }, color: "#c0392b", finish: "satin" } },
  ]));
}

describe("EX-064 — paramètres, propriétés techniques et style : trois catégories indépendantes", () => {
  it("EX-064 [+] changer la couleur puis l'épaisseur : chaque changement ne touche que sa catégorie", () => {
    const d0 = modele();
    const c0 = categories(d0);
    expect(c0.parametres).toHaveLength(1);
    expect(c0.proprietes.map((p) => p.nom)).toEqual(["Composition", "Résistance au feu"]);
    expect(c0.style).toHaveLength(1);

    // 1. Couleur (style seulement).
    const d1 = applyStudioCommands(d0, unchecked([
      { toolId: "studio.apparence.retirer", params: { ids: ["ap1"] } },
      { toolId: "studio.apparence.definir", params: { id: "ap1", type: "appearance", target: { kind: "object", id: "m1" }, color: "#2e86c1", finish: "glass" } },
    ]));
    const c1 = categories(d1);
    expect(c1.style).toEqual([expect.objectContaining({ color: "#2e86c1", finish: "glass" })]);
    expect(c1.parametres).toEqual(c0.parametres);
    expect(c1.proprietes).toEqual(c0.proprietes);

    // 2. Épaisseur (paramètre de conception seulement).
    const d2 = applyStudioCommands(d1, unchecked([{ toolId: "studio.architecture.modifier", params: { ...MUR, thickness: 0.3 } }]));
    const c2 = categories(d2);
    expect(c2.parametres).toEqual([expect.objectContaining({ id: "m1", thickness: 0.3, axis: MUR.axis })]);
    expect(c2.style).toEqual(c1.style);
    expect(c2.proprietes).toEqual(c0.proprietes);
  });

  it("EX-064 [−] une apparence « verre » ne change pas la composition technique déclarée, et retirer le style laisse paramètres et propriétés", () => {
    const d0 = modele();
    const verre = applyStudioCommands(d0, unchecked([
      { toolId: "studio.apparence.retirer", params: { ids: ["ap1"] } },
      { toolId: "studio.apparence.definir", params: { id: "ap1", type: "appearance", target: { kind: "object", id: "m1" }, color: "#a9cce3", finish: "glass" } },
    ]));
    expect(categories(verre).proprietes.find((p) => p.nom === "Composition")).toEqual({ cibleId: "m1", nom: "Composition", valeur: "Béton 20 cm", source: "Note de conception (essai)" });
    const sansStyle = applyStudioCommands(d0, unchecked([{ toolId: "studio.apparence.retirer", params: { ids: ["ap1"] } }]));
    expect(categories(sansStyle).style).toEqual([]);
    expect(categories(sansStyle).parametres).toEqual(categories(d0).parametres);
    expect(categories(sansStyle).proprietes).toEqual(categories(d0).proprietes);
  });
});
