/**
 * Export DXF des feuilles et statut des travaux (cas 4, lot C4, étape 5 : D10-F14-005, D10-F14-143, D10-F14-123).
 */
import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Cote, PlanDeCoupe } from "./annotations.js";
import { lireModelePlanche } from "./delta.js";
import { dxfFeuille, dxfVue, nomCalque, relireDxf, texteDxf } from "./dxf-feuilles.js";
import { ajouterFenetre, composerFeuille, creerFeuille, nomFichierFeuille } from "./feuilles.js";
import { type Id, type Modele, ajouterRectangle, grouper, modeleVide, modifierAnnotations, peindreOccurrences, pousserTirer, statuerOccurrences, compterStatuts } from "./geometrie-libre.js";
import { geometrieVisible } from "./inference.js";
import { familleSimple, projeterPlan } from "./plan-vectoriel.js";
import { v3 } from "./vecteur.js";

const L = { projet: "Projet", phase: "Phase", titre: "Titre", date: "Date", numero: "N°", indice: "Indice", echelles: "Échelles", vueDessus: "Vue de dessus" };
const coupe: PlanDeCoupe = { id: "c1", origine: v3(0, 0, 1), normale: v3(0, 0, 1), u: v3(1, 0, 0), w: v3(0, 1, 0), demiU: 9, demiW: 9, actif: true, inverse: false, nom: "RDC" };

/** Deux boîtes groupées : la première à démolir (béton haché), la seconde projetée ; une cote au sol. */
function modele(): { m: Modele; occ: [Id, Id] } {
  let m = modeleVide();
  const occ: Id[] = [];
  for (const x0 of [0, 6]) {
    const sol = ajouterRectangle(m, v3(x0, 0, 0), v3(4, 0, 0), v3(0, 3, 0)).modele;
    const f = Object.keys(sol.racine.faces).find((id) => !m.racine.faces[id]) as Id;
    const avant = new Set([...Object.keys(m.racine.faces), ...Object.keys(m.racine.aretes)]);
    const p = pousserTirer(sol, f, sol.racine.faces[f]!.normale.z > 0 ? 2 : -2).modele;
    const ids = [...Object.keys(p.racine.faces), ...Object.keys(p.racine.aretes)].filter((id) => !avant.has(id)) as Id[];
    const g = grouper(p, ids);
    m = g.modele;
    occ.push(g.occurrence);
  }
  m = modifierAnnotations(m, (a) => {
    a.plansDeCoupe["c1"] = coupe;
    a.motifs = { h1: { id: "h1", nom: "Béton", familles: [familleSimple(45, 2)], source: { genre: "saisie" } } };
    a.materiaux["mat1"] = { id: "mat1", nom: "Béton", couleur: "#999999", motif: "h1" };
    a.cotes["q1"] = { id: "q1", genre: "lineaire", a: v3(0, -1, 0), b: v3(4, -1, 0), position: v3(0, -2, 0) } as Cote;
  }).modele;
  m = peindreOccurrences(m, [occ[0]!], "mat1").modele;
  m = statuerOccurrences(m, [occ[0]!], "a-demolir").modele;
  m = statuerOccurrences(m, [occ[1]!], "projete").modele;
  return { m, occ: occ as [Id, Id] };
}

describe("Statut des travaux", () => {
  it("compte les occurrences par statut ; un retrait rend l'occurrence « sans statut »", () => {
    const { m, occ } = modele();
    expect(compterStatuts(m)).toEqual({ existant: 0, "a-demolir": 1, projete: 1, sans: 0 });
    expect(compterStatuts(statuerOccurrences(m, [occ[0]], null).modele)).toEqual({ existant: 0, "a-demolir": 0, projete: 1, sans: 1 });
    expect(compterStatuts(statuerOccurrences(m, [occ[1]], "existant").modele)).toEqual({ existant: 1, "a-demolir": 1, projete: 0, sans: 0 });
  });
  it("posé et retiré sur les occurrences, relu par le document, hérité par la géométrie ; filtre existant / projeté", () => {
    const { m, occ } = modele();
    expect(m.racine.occurrences[occ[0]]!.statut).toBe("a-demolir");
    expect(lireModelePlanche(JSON.parse(JSON.stringify(m)))!.racine.occurrences[occ[1]]!.statut).toBe("projete");
    const faux = JSON.parse(JSON.stringify(m));
    faux.racine.occurrences[occ[0]].statut = "demoli";
    expect(lireModelePlanche(faux)).toBeNull();
    expect(new Set(geometrieVisible(m).faces.map((f) => f.statut))).toEqual(new Set(["a-demolir", "projete"]));
    expect(geometrieVisible(m, { etat: "existant" }).faces.every((f) => f.statut === "a-demolir")).toBe(true);
    expect(geometrieVisible(m, { etat: "projete" }).faces.every((f) => f.statut === "projete")).toBe(true);
    const sans = statuerOccurrences(m, [occ[0]], null).modele;
    expect(sans.racine.occurrences[occ[0]]!.statut).toBeUndefined();
    const p = projeterPlan(m, { direction: v3(0, 0, -1), haut: v3(0, 1, 0) }, { plan: coupe });
    expect(new Set(p.poches.map((x) => `${x.materiau}|${x.statut}`))).toEqual(new Set(["mat1|a-demolir", "null|projete"]));
  });
});

describe("Export DXF des feuilles", () => {
  it("feuille entière en mm papier : calques par classe et statut, HATCH du motif, textes, cotes ; R2000 relu", () => {
    const { m } = modele();
    const f = creerFeuille(m, { numero: "A101", nom: "Plan RDC" });
    if (!f.ok) throw new Error("feuille");
    const w = ajouterFenetre(f.modele, f.id, { scene: null, echelle: 50, coupe: null, x: 40, y: 30 });
    if (!w.ok) throw new Error("fenêtre");
    const feuille = w.modele.annotations!.feuilles![f.id]!;
    const c = composerFeuille(w.modele, feuille, L);
    expect(c.primitives.some((p) => p.genre === "texte" && p.cote && p.texte.includes("4"))).toBe(true);
    const dxf = dxfFeuille(c);
    if (process.env["DXF_SORTIE"]) writeFileSync(`${process.env["DXF_SORTIE"]}/feuille.dxf`, dxf);
    const r = relireDxf(dxf)!;
    expect(r.version).toBe("AC1015");
    expect(r.calques).toEqual(expect.arrayContaining(["FADI_CADRE", "FADI_TEXTES", "FADI_COTES", nomCalque("FADI_COUPE", "a-demolir"), nomCalque("FADI_COUPE", "projete"), "FADI_HACHURES_A_DEMOLIR", "FADI_HACHURES_PROJETE"]));
    expect(r.entites["HATCH"]).toBe(2);
    expect(r.entites["LINE"]! > 20 && r.entites["TEXT"]! > 5).toBe(true);
    expect(dxf).toContain("\n2\nBeton\n");
    expect(/[^\x00-\x7f]/.test(dxf)).toBe(false);
    expect(nomFichierFeuille("{numero}_{nom}", feuille, "dxf")).toBe("A101_Plan_RDC.dxf");
  });

  it("vue à l'échelle réelle en mètres ; vue vide : rien", () => {
    const { m } = modele();
    const f = creerFeuille(m, { numero: "A101", nom: "Plan" });
    if (!f.ok) throw new Error("feuille");
    const w = ajouterFenetre(f.modele, f.id, { scene: null, echelle: 50, coupe: null, x: 40, y: 30 });
    if (!w.ok) throw new Error("fenêtre");
    const feuille = w.modele.annotations!.feuilles![f.id]!;
    const dxf = dxfVue(w.modele, feuille, "v1")!;
    if (process.env["DXF_SORTIE"]) writeFileSync(`${process.env["DXF_SORTIE"]}/vue.dxf`, dxf);
    expect(dxf).toContain("$INSUNITS\n70\n6\n");
    // Coordonnées réelles : une boîte de 4 m de long, la seconde à x = 6 m.
    expect(dxf).toMatch(/\n10\n10\n/);
    expect(dxfVue(w.modele, feuille, "v9")).toBeNull();
    expect(dxfVue(modeleVide(), { ...feuille }, "v1")).toBeNull();
    expect(texteDxf("Coupe A–A\n1:50")).toBe("Coupe A\\U+2013A 1:50");
  });
});
