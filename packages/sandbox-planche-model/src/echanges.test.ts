import { describe, expect, it } from "vitest";
import { ajouterRectangle, grouper, modeleVide, pousserTirer } from "./geometrie-libre.js";
import { exporterObj, exporterStl } from "./echanges.js";
import { v3 } from "./vecteur.js";

const boiteEtFace = () => {
  const r = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(2, 0, 0), v3(0, 2, 0)).modele;
  const b = pousserTirer(r, Object.keys(r.racine.faces)[0]!, 1).modele;
  const g = grouper(b, [...Object.keys(b.racine.faces), ...Object.keys(b.racine.aretes)], { nom: "Boîte 1", genre: "composant" }).modele;
  return ajouterRectangle(g, v3(5, 0, 0), v3(1, 0, 0), v3(0, 1, 0)).modele;
};

describe("lot 7 — exports OBJ et STL (P-6, D-173)", () => {
  it("OBJ : un objet par maillage, 8 + 4 sommets, 12 + 2 faces, indices à partir de 1, texte reproductible", () => {
    const m = boiteEtFace();
    const r = exporterObj(m, "Esquisse A");
    expect(r.objets).toBe(2);
    expect(r.triangles).toBe(14);
    const lignes = r.contenu.split("\n");
    expect(lignes.filter((l) => l.startsWith("o ")).length).toBe(2);
    expect(lignes.filter((l) => l.startsWith("v ")).length).toBe(8 * 3 + 4);
    expect(lignes.filter((l) => l.startsWith("f ")).length).toBe(14);
    expect(lignes[0]).toContain("Esquisse A");
    const indices = lignes.filter((l) => l.startsWith("f ")).flatMap((l) => l.slice(2).split(" ").map(Number));
    expect(Math.min(...indices)).toBe(1);
    expect(Math.max(...indices)).toBe(8 * 3 + 4);
    expect(exporterObj(m, "Esquisse A").contenu).toBe(r.contenu);
    expect(lignes.find((l) => l.startsWith("o "))).toMatch(/^o o\d+_Boîte_1$/);
  });

  it("STL ASCII : solid / endsolid, un facet par triangle avec une normale unitaire", () => {
    const m = boiteEtFace();
    const r = exporterStl(m, "Esquisse A");
    expect(r.triangles).toBe(14);
    expect(r.contenu.startsWith("solid Esquisse_A\n")).toBe(true);
    expect(r.contenu.trimEnd().endsWith("endsolid Esquisse_A")).toBe(true);
    const normales = [...r.contenu.matchAll(/facet normal (\S+) (\S+) (\S+)/g)].map((x) => Math.hypot(Number(x[1]), Number(x[2]), Number(x[3])));
    expect(normales).toHaveLength(14);
    for (const n of normales) expect(n).toBeCloseTo(1, 5);
    expect((r.contenu.match(/vertex /g) ?? []).length).toBe(42);
  });

  it("entités hors maillage comptées : arête libre et guide signalés, rien n'est perdu en silence", async () => {
    const { ajouterSegment: ajouterLigne, modifierAnnotations } = await import("./geometrie-libre.js");
    const m0 = boiteEtFace();
    const m1 = ajouterLigne(m0, v3(8, 0, 0), v3(9, 0, 0)).modele;
    const m2 = modifierAnnotations(m1, (an, id) => { const i = id("g"); an.guides[i] = { id: i, genre: "point", position: v3(0, 0, 0) } as never; }).modele;
    const r = exporterObj(m2);
    expect(r.omis).toEqual({ aretesLibres: 1, annotations: 1 });
    expect(exporterObj(m0).omis).toEqual({ aretesLibres: 0, annotations: 0 });
  });

  it("Planche vide : fichiers valides sans triangle", () => {
    expect(exporterObj(modeleVide()).triangles).toBe(0);
    expect(exporterStl(modeleVide()).contenu).toBe("solid Planche\nendsolid Planche\n");
  });
});
