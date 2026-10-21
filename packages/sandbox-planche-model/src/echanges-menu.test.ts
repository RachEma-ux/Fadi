import { describe, expect, it } from "vitest";
import { ajouterRectangle, grouper, modeleVide, pousserTirer } from "./geometrie-libre.js";
import { exporterIfc, guidIfc, chaineIfc } from "./echanges-ifc.js";
import { exporterObj, exporterStl } from "./echanges.js";
import { ErreurImport, MAX_TRIANGLES_IMPORT, importerMaillages, lireIfc, lireMaillages, lireObj, lireStl } from "./echanges-import.js";
import { maillagesPlanche } from "./representation.js";
import { v3 } from "./vecteur.js";

const boite = () => {
  const r = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(2, 0, 0), v3(0, 2, 0)).modele;
  const b = pousserTirer(r, Object.keys(r.racine.faces)[0]!, 1).modele;
  return grouper(b, [...Object.keys(b.racine.faces), ...Object.keys(b.racine.aretes)], { nom: "Boîte d'essai", genre: "composant" }).modele;
};
const DATE = new Date("2026-10-21T12:00:00Z");

describe("menu de la Planche — export IFC", () => {
  it("IFC4 : un proxy par maillage, 12 triangles, mètre, texte reproductible", () => {
    const r = exporterIfc(boite(), "Essai", DATE);
    expect(r.objets).toBe(1);
    expect(r.triangles).toBe(12);
    expect(r.contenu.startsWith("ISO-10303-21;\n")).toBe(true);
    expect(r.contenu).toContain("FILE_SCHEMA(('IFC4'));");
    expect(r.contenu).toContain("IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)");
    expect(r.contenu).toContain("IFCBUILDINGELEMENTPROXY(");
    expect(r.contenu).toContain("IFCTRIANGULATEDFACESET(");
    expect(r.contenu.trimEnd().endsWith("END-ISO-10303-21;")).toBe(true);
    expect(exporterIfc(boite(), "Essai", DATE).contenu).toBe(r.contenu);
  });
  it("noms STEP : apostrophe doublée, accents échappés ; GlobalId de 22 caractères stable", () => {
    expect(chaineIfc("Boîte d'essai")).toBe("'Bo\\X2\\00EE\\X0\\te d''essai'");
    const g = guidIfc("objet|o1");
    expect(g).toMatch(/^[0-3][0-9A-Za-z_$]{21}$/);
    expect(guidIfc("objet|o1")).toBe(g);
    expect(guidIfc("objet|o2")).not.toBe(g);
  });
  it("aller-retour IFC : ce que Fadi écrit, Fadi le relit (12 triangles, mètres)", () => {
    const lu = lireIfc(exporterIfc(boite(), "Essai", DATE).contenu);
    expect(lu.echelleFichier).toBe(1);
    expect(lu.maillages).toHaveLength(1);
    expect(lu.maillages[0]!.triangles.length / 3).toBe(12);
  });
  it("unité IFC : millimètre lu ; pied (autre unité) refusé", () => {
    const base = exporterIfc(boite(), "Essai", DATE).contenu;
    expect(lireIfc(base.replace("IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)", "IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.)")).echelleFichier).toBe(0.001);
    expect(() => lireIfc(base.replace("IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)", "IFCSIUNIT(*,.LENGTHUNIT.,.MEGA.,.METRE.)"))).toThrow(ErreurImport);
  });
});

describe("menu de la Planche — lecture OBJ / STL", () => {
  it("OBJ : aller-retour d'un export Fadi, indices négatifs et polygones triangulés en éventail", () => {
    const m = boite();
    const lu = lireObj(exporterObj(m, "Essai").contenu);
    expect(lu).toHaveLength(1);
    expect(lu[0]!.triangles.length / 3).toBe(12);
    const carre = lireObj("v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nf -4 -3 -2 -1\n");
    expect(carre[0]!.triangles.length / 3).toBe(2);
    expect(() => lireObj("v 0 0 0\nf 1 2 3\n")).toThrow(ErreurImport);
  });
  it("STL ASCII et binaire : mêmes triangles", () => {
    const m = boite();
    const ascii = lireStl(exporterStl(m, "Essai").contenu);
    expect(ascii[0]!.triangles.length / 3).toBe(12);
    const n = 2;
    const buf = new ArrayBuffer(84 + n * 50);
    const v = new DataView(buf);
    v.setUint32(80, n, true);
    const tri = [[0, 0, 0, 1, 0, 0, 0, 1, 0], [1, 0, 0, 1, 1, 0, 0, 1, 0]];
    tri.forEach((t, k) => t.forEach((x, i) => v.setFloat32(84 + k * 50 + 12 + i * 4, x, true)));
    expect(lireStl(new Uint8Array(buf))[0]!.triangles.length / 3).toBe(2);
  });
  it("fichier vide : refus explicite", () => {
    expect(() => lireMaillages("obj", "# rien\n")).toThrow(/Aucun triangle/);
    expect(() => lireMaillages("ifc", "ISO-10303-21;\nDATA;\nENDSEC;\n")).toThrow(/IfcTriangulatedFaceSet/);
  });
});

describe("menu de la Planche — insertion", () => {
  it("un STL de boîte devient un groupe de 6 faces (surface fermée), à l'échelle choisie", () => {
    const lu = lireMaillages("stl", exporterStl(boite(), "Essai").contenu);
    const r = importerMaillages(modeleVide(), lu.maillages, 0.001);
    expect(r.objets).toBe(1);
    expect(r.triangles).toBe(12);
    const defs = Object.values(r.modele.definitions);
    expect(defs).toHaveLength(1);
    const mesh = maillagesPlanche(r.modele)[0]!;
    const xs = [...Array(mesh.positions.length / 3).keys()].map((i) => mesh.positions[i * 3]!);
    expect(Math.max(...xs)).toBeCloseTo(0.002, 6);
  });
  it("triangle d'aire nulle ignoré et compté ; au-delà du plafond, refus", () => {
    const r = importerMaillages(modeleVide(), [{ nom: "T", positions: [0, 0, 0, 1, 0, 0, 0, 1, 0, 2, 0, 0], triangles: [0, 1, 2, 0, 1, 3] }], 1);
    expect(r.triangles).toBe(1);
    expect(r.ignores).toBe(1);
    const gros = { nom: "G", positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], triangles: Array.from({ length: (MAX_TRIANGLES_IMPORT + 1) * 3 }, (_, i) => i % 3) };
    expect(() => importerMaillages(modeleVide(), [gros], 1)).toThrow(/au plus/);
  });
});

describe("menu de la Planche — fusion des triangles coplanaires", () => {
  it("un cube de 12 triangles devient 6 faces et 12 arêtes, sans face fantôme", () => {
    const sommets = [[0, 0, 0], [2, 0, 0], [2, 2, 0], [0, 2, 0], [0, 0, 2], [2, 0, 2], [2, 2, 2], [0, 2, 2]];
    const tris = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]];
    const m = { nom: "Cube", positions: sommets.flat(), triangles: tris.flat() };
    const r = importerMaillages(modeleVide(), [m], 1);
    expect(r.triangles).toBe(12);
    const def = Object.values(r.modele.definitions)[0]!;
    expect(Object.keys(def.contenu.faces)).toHaveLength(6);
    expect(Object.keys(def.contenu.aretes)).toHaveLength(12);
    const mesh = maillagesPlanche(r.modele)[0]!;
    expect(mesh.triangles.length / 3).toBe(12);
  });
});
