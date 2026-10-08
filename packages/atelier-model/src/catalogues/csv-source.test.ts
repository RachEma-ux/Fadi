import { describe, expect, it } from "vitest";
import { validerCatalogueCsv, lireNombre } from "./csv-source.js";

const ENTETE = "designation;hauteur_mm;largeur_mm;source;edition;page";

describe("catalogues sourcés (D-180)", () => {
  it("retient une ligne complète avec sa source et lit la virgule décimale", () => {
    const r = validerCatalogueCsv(`${ENTETE}\nA;100;55,5;Catalogue X;2024;p. 12\n`);
    expect(r.importable).toBe(true);
    expect(r.retenues).toHaveLength(1);
    expect(r.retenues[0]!.valeurs.largeur_mm).toBe(55.5);
    expect(r.retenues[0]!.source).toEqual({ source: "Catalogue X", edition: "2024", page: "p. 12" });
  });

  it("refuse nominativement une ligne sans source et rend le fichier non importable", () => {
    const r = validerCatalogueCsv(`${ENTETE}\nA;100;55;Catalogue X;2024;p. 12\nB;120;60;;2024;p. 13\n`);
    expect(r.importable).toBe(false);
    expect(r.refus).toEqual([{ ligne: 3, motif: "« source » vide." }]);
    expect(r.retenues).toHaveLength(1);
  });

  it("refuse une cellule numérique non numérique mais admet la cellule vide (non évaluée)", () => {
    const r = validerCatalogueCsv(`${ENTETE}\nA;abc;;Catalogue X;2024;p. 12\nB;;;Catalogue X;2024;p. 13\n`);
    expect(r.refus).toEqual([{ ligne: 2, motif: "« hauteur_mm » n'est pas un nombre (« abc »)." }]);
    expect(r.retenues[0]!.valeurs.hauteur_mm).toBeNull();
    expect(r.retenues[0]!.valeurs.largeur_mm).toBeNull();
  });

  it("refuse un en-tête sans colonne de source ou sans colonne attendue, et une ligne mal découpée", () => {
    expect(() => validerCatalogueCsv("designation;hauteur_mm\nA;1\n")).toThrow(/« source »/);
    expect(() => validerCatalogueCsv(`${ENTETE}\n`, ["epaisseur_mm"])).toThrow(/« epaisseur_mm »/);
    const r = validerCatalogueCsv(`${ENTETE}\nA;1;2;Cat\n`);
    expect(r.refus[0]!.motif).toMatch(/4 cellule/);
  });

  it("accepte les gabarits du dépôt (en-tête seul : catalogue vide, importable, zéro ligne)", async () => {
    const { readFileSync, readdirSync } = await import("node:fs");
    const dir = new URL("../../../../docs/atelier/catalogues/gabarits/", import.meta.url);
    const fichiers = readdirSync(dir).filter((f) => f.endsWith(".csv"));
    expect(fichiers.length).toBe(4);
    for (const f of fichiers) {
      const r = validerCatalogueCsv(readFileSync(new URL(f, dir), "utf8"));
      expect(r.lignes).toBe(0);
      expect(r.importable).toBe(true);
    }
  });

  it("lireNombre : virgule, point, signe ; rejette le texte", () => {
    expect(lireNombre("1,5")).toBe(1.5);
    expect(lireNombre("-2.25")).toBe(-2.25);
    expect(lireNombre("12 000")).toBe(12000);
    expect(lireNombre("1,5 mm")).toBeNull();
  });
});
