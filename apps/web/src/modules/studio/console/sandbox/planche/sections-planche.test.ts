/** Adaptateur des sections des outils Profilé de Sandbox — saisie, face ; aucune valeur supposée. */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { aireSection, ajouterRectangle, contexte, effacerEntites, modeleVide, v3 } from "@parcours/sandbox-planche-model";
import { DIMENSIONS_VIDES, sectionDepuisFace, sectionSaisie } from "./sections-planche";

describe("Section saisie (L12)", () => {
  it("aucune valeur par défaut : un champ vide bloque (« dimension manquante »)", () => {
    expect(() => sectionSaisie(DIMENSIONS_VIDES)).toThrow(/Dimension manquante : largeur/);
    expect(() => sectionSaisie({ ...DIMENSIONS_VIDES, largeur: "100" })).toThrow(/Dimension manquante : hauteur/);
    expect(() => sectionSaisie({ ...DIMENSIONS_VIDES, forme: "tube", largeur: "100", hauteur: "50" })).toThrow(/Dimension manquante : épaisseur/);
  });

  it("rectangle 100 × 50 mm ; tube creux ; rond 24 segments par défaut", () => {
    expect(aireSection(sectionSaisie({ ...DIMENSIONS_VIDES, largeur: "100", hauteur: "50" }).section)).toBeCloseTo(0.005, 12);
    const t = sectionSaisie({ ...DIMENSIONS_VIDES, forme: "tube", largeur: "100", hauteur: "50", epaisseur: "5" });
    expect(aireSection(t.section)).toBeCloseTo(0.1 * 0.05 - 0.09 * 0.04, 12);
    const r = sectionSaisie({ ...DIMENSIONS_VIDES, forme: "rond", largeur: "60" });
    expect(r.section.exterieur).toHaveLength(24);
    expect(r.source).toEqual({ genre: "saisie" });
    expect(() => sectionSaisie({ ...DIMENSIONS_VIDES, forme: "rond", largeur: "60", segments: "2" })).toThrow(/Segments/);
  });
});

describe("Section depuis une face (L12)", () => {
  it("face 0,2 × 0,1 percée : contour et trou dans son plan, centrés", () => {
    let m = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(0.2, 0, 0), v3(0, 0.1, 0)).modele;
    m = ajouterRectangle(m, v3(0.05, 0.025, 0), v3(0.1, 0, 0), v3(0, 0.05, 0)).modele;
    const faces = Object.values(contexte(m).faces);
    const troue = faces.find((f) => f.trous.length === 1)!;
    m = effacerEntites(m, faces.filter((f) => f.id !== troue.id).map((f) => f.id)).modele;
    const s = sectionDepuisFace(m, troue.id);
    expect(aireSection(s.section)).toBeCloseTo(0.02 - 0.005, 12);
    expect(s.section.trous).toHaveLength(1);
  });
});

describe("Aucune valeur de profilé dans le code (R3)", () => {
  it("sections-planche.ts ne porte ni dimension, ni masse, ni désignation normalisée", () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "sections-planche.ts"), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
    const nombres = [...src.matchAll(/(?<![\w.])(\d+(?:\.\d+)?(?:e-?\d+)?)(?![\w.])/g)].map((x) => x[1]);
    // Admis : 0, 1, 2, 3 (rond minimal), 32 (facettes d'un cercle), 24 (segments relevés du Cercle), 999, 1000 / 1e4 / 10 (conversions mm → m).
    expect(nombres.filter((n) => !["0", "1", "2", "3", "10", "24", "32", "999", "1000", "1e4"].includes(n as string))).toEqual([]);
    expect(src).not.toMatch(/\b(IPE|HEA|HEB|UPN|7850)\b/);
  });
});
