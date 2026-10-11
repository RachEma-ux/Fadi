/** Lot L12 : adaptateur des sections des outils Profilé — catalogue sourcé, saisie, face ; aucune valeur supposée. */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { LigneCatalogue } from "@parcours/atelier-model";
import { aireSection, ajouterRectangle, contexte, effacerEntites, modeleVide, v3 } from "@parcours/planche-model";
import { DIMENSIONS_VIDES, ERREUR_CATALOGUE_NON_BOIS, ErreurSection, sectionCatalogue, sectionDepuisFace, sectionSaisie, texteSource } from "./sections-planche";

/** Lignes d'essai (données du test, non contractuelles) : la source le dit. */
const SOURCE = { source: "Données d'essai, non contractuelles", edition: "2026", page: "1" };
const CAT = (lignes: LigneCatalogue[]) => ({ id: "cat1", nom: "Catalogue d'essai", lignes });
const ligne = (numero: number, valeurs: LigneCatalogue["valeurs"]): LigneCatalogue => ({ numero, valeurs: { ...valeurs, ...SOURCE }, source: SOURCE });

describe("Section depuis une ligne de catalogue sourcé (L12)", () => {
  it("profilé I : colonnes _mm converties en mètres, source copiée (source, édition, page, ligne)", () => {
    const l = ligne(3, { designation: "I essai 100", forme: "I", hauteur_mm: 100, largeur_mm: 50, epaisseur_ame_mm: 4, epaisseur_aile_mm: 6 });
    const s = sectionCatalogue(CAT([l]), l);
    expect(s.designation).toBe("I essai 100");
    expect(s.source).toEqual({ genre: "catalogue", source: SOURCE.source, edition: "2026", page: "1", ligne: "3" });
    const ys = s.section.exterieur.map((p) => p.y);
    const zs = s.section.exterieur.map((p) => p.z);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(0.05, 12);
    expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(0.1, 12);
    expect(aireSection(s.section)).toBeCloseTo(2 * 0.05 * 0.006 + 0.004 * (0.1 - 2 * 0.006), 12);
    expect(texteSource(s.source)).toBe("Données d'essai, non contractuelles, 2026, p. 1, ligne 3");
  });

  it("cellule requise vide : refus nommé, jamais zéro", () => {
    const l = ligne(4, { designation: "I essai 120", forme: "I", hauteur_mm: 120, largeur_mm: null, epaisseur_ame_mm: 4, epaisseur_aile_mm: 6 });
    expect(() => sectionCatalogue(CAT([l]), l)).toThrow(ErreurSection);
    expect(() => sectionCatalogue(CAT([l]), l)).toThrow(/largeur_mm absente/);
  });

  it("rond creux de catalogue (épaisseur donnée) facettisé au nombre de segments saisi ; bois : rectangle", () => {
    const r = ligne(5, { designation: "Rond essai", forme: "cercle", hauteur_mm: 60, largeur_mm: 60, epaisseur_mm: 3 });
    const s = sectionCatalogue(CAT([r]), r, "32s");
    expect(s.section.exterieur).toHaveLength(32);
    expect(s.section.trous).toHaveLength(1);
    const b = ligne(6, { designation: "Bois essai", largeur_mm: 45, hauteur_mm: 145, essence: "essai" });
    expect(aireSection(sectionCatalogue({ ...CAT([b]), ontologie: "timber" }, b).section)).toBeCloseTo(0.045 * 0.145, 12);
  });

  it("revue de #126 : le gabarit bois n'est ouvert que pour un catalogue déclaré « timber »", () => {
    const b = ligne(7, { designation: "Ligne sans forme", largeur_mm: 45, hauteur_mm: 145 });
    for (const ontologie of [undefined, "sheetmetal", "structure"]) {
      const cat = { ...CAT([b]), ...(ontologie ? { ontologie } : {}) };
      expect(() => sectionCatalogue(cat, b)).toThrow(ErreurSection);
      expect(() => sectionCatalogue(cat, b)).toThrow(ERREUR_CATALOGUE_NON_BOIS);
    }
  });
});

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
    // Admis : 0, 1, 2, 3 (rond minimal), 24 (segments relevés du Cercle), 999, 1000 / 1e4 / 10 (conversions mm → m).
    expect(nombres.filter((n) => !["0", "1", "2", "3", "10", "24", "999", "1000", "1e4"].includes(n as string))).toEqual([]);
    expect(src).not.toMatch(/\b(IPE|HEA|HEB|UPN|7850)\b/);
  });
});
