import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { appliquerLot, CONTRAT_COMMANDES } from "../../commandes/index.js";
import type { Commande } from "../../commandes/base.js";
import { modeleVide, type ModeleAtelier, type Occurrence } from "../../modele.js";
import { genererTableau } from "../../documents/tableaux.js";
import { exporterIfc } from "../../echanges/ifc.js";
import { maillageObjet } from "../../projection/maillage.js";
import { volumeMaillage } from "../../geometrie-3d.js";
import { planOssatureMur } from "./ossature.js";
import { planOssature } from "./index.js";

const pt = (x: number, y: number) => ({ x, y, frame: "local" as const, unit: "m" as const });
const m = (value: number) => ({ value, unit: "m" as const });
let n = 0;
const lot = (etat: ModeleAtelier, commands: Commande[], label = "lot") => appliquerLot(etat, { requestId: `req-b-${++n}`, baseRevision: 0, contract: CONTRAT_COMMANDES, label, commands });
const base = () => lot(modeleVide(), [{ type: "niveau.creer", params: { id: "n1", nom: "RDC", elevation: 0, hauteur: 2.7 } }, { type: "ontologie.activer", params: { nom: "timber" } }]).etat;
const S45 = { largeur: m(0.045), hauteur: m(0.145), essence: "épicéa (déclaré)", classe: "C24 (déclarée)", profil: null };
const objet = <C extends "element-bois" | "ossature" | "panneau-clt" | "assemblage-bois">(etat: ModeleAtelier, id: string) => etat.objets[id] as Occurrence<C>;
const CSV = "designation;largeur_mm;hauteur_mm;essence;classe_resistance;type;source;edition;page\n45x145;45;145;épicéa;C24;massif;Fournisseur bois Y;2025;p. 4\n";

describe("ontologie bois (P2-4) : isolation, activation", () => {
  it("aucun module n'importe une autre ontologie ; aucune constante normative (sections, classes, densités)", () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".ts") && !x.endsWith(".test.ts"))) {
      const src = readFileSync(join(dir, f), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
      expect(src, f).not.toMatch(/from "\.\.\/(mechanical|structure|sheetmetal)/);
      expect(src, f).not.toMatch(/\b(C16|C18|C24|C30|GL24|GL28|D30|420|450|500|350)\b/);
    }
  });
  it("les classes bois sont refusées tant que l'ontologie n'est pas active", () => {
    const e0 = lot(modeleVide(), [{ type: "niveau.creer", params: { id: "n1", nom: "RDC", elevation: 0, hauteur: 2.7 } }]).etat;
    expect(() => lot(e0, [{ type: "elementBois.creer", params: { id: "b1", niveauId: "n1", a: pt(0, 0), b: pt(3, 0), section: S45 } }])).toThrow(/non activée/);
  });
});

describe("pièces, ossature de mur générée après aperçu, charpente, CLT, assemblages, nomenclature, IFC", () => {
  it("planOssatureMur : lisses, montants à l'entraxe (rives affleurantes), baie → montants de rive, linteau, appui ; aucun montant dans la baie", () => {
    const lisse = { ...S45 };
    const plan = planOssatureMur({ a: pt(0, 0), b: pt(4, 0) }, 2.7, [{ s0: 1.5, s1: 2.5, zb: 0.9, zt: 2.1 }], 0.6, S45, lisse);
    const roles = plan.map((e) => e.role);
    expect(roles.filter((r) => r === "lisse")).toHaveLength(1);
    expect(roles.filter((r) => r === "sabliere")).toHaveLength(1);
    expect(roles).toContain("linteau");
    expect(roles).toContain("appui");
    const montants = plan.filter((e) => e.role === "montant");
    // Candidats à 0,0225 ; 0,6225 ; 1,2225 ; 1,8225 (dans la baie, omis) ; 2,4225 (dans la baie, omis) ; 3,0225 ; 3,6225 ; 3,9775 + rives 1,4775 et 2,5225.
    expect(montants.every((e) => !(e.a.x + 0.0225 > 1.5 + 1e-9 && e.a.x - 0.0225 < 2.5 - 1e-9))).toBe(true);
    expect(montants.some((e) => Math.abs(e.a.x - 1.4775) < 1e-6)).toBe(true);
    expect(montants.some((e) => Math.abs(e.a.x - 2.5225) < 1e-6)).toBe(true);
    expect(montants.every((e) => Math.abs(e.za - 0.145) < 1e-9 && Math.abs(e.zb - (2.7 - 0.145)) < 1e-9)).toBe(true);
    // Repères de débit numérotés par rôle : LI01, SA01, MO01, MO02…, LI (linteau) 01, AP01.
    expect(plan.find((e) => e.role === "lisse")!.repere).toBe("LI01");
    expect(plan.find((e) => e.role === "sabliere")!.repere).toBe("SA01");
    expect(montants.map((e) => e.repere)).toEqual(montants.map((_, i) => `MO${String(i + 1).padStart(2, "0")}`));
    expect(plan.find((e) => e.role === "appui")!.repere).toBe("AP01");
  });
  it("mur de P.118 avec une fenêtre → ossature : aperçu puis accord, pièces rattachées, rejeu sans doublon, liste des pièces, IfcElementAssembly", () => {
    const e0 = lot(base(), [
      { type: "mur.tracer", params: { id: "m1", niveauId: "n1", a: pt(0, 0), b: pt(4, 0), epaisseur: { value: 0.145, unit: "m" }, hauteur: m(2.7) } },
      { type: "ouverture.poser", params: { id: "f1", classe: "fenetre", murHoteId: "m1", position: 0.5, largeur: m(1), hauteur: m(1.2), allege: m(0.9) } },
      { type: "ossature.creer", params: { id: "os1", nom: "Mur ossature", genre: "mur", hoteId: "m1", entraxe: m(0.6), sectionMontant: S45 } },
    ]).etat;
    const oss = objet<"ossature">(e0, "os1");
    expect(oss.niveauId).toBe("n1");
    expect(oss.params.position.x).toBeCloseTo(2, 9);
    const plan = planOssature(e0, oss, null);
    expect(plan.length).toBeGreaterThan(8);
    expect(Object.values(e0.objets).filter((o) => o.classe === "element-bois")).toHaveLength(0);
    const e1 = lot(e0, [{ type: "ossature.generer", params: { id: "os1" } }]).etat;
    const pieces = Object.values(e1.objets).filter((o): o is Occurrence<"element-bois"> => o.classe === "element-bois");
    expect(pieces).toHaveLength(plan.length);
    expect(pieces.every((p) => p.params.ossatureId === "os1" && p.params.repere)).toBe(true);
    expect(objet<"ossature">(e1, "os1").params.generation).toEqual({ elements: plan.length });
    const e2 = lot(e1, [{ type: "ossature.generer", params: { id: "os1" } }]).etat;
    expect(Object.values(e2.objets).filter((o) => o.classe === "element-bois")).toHaveLength(plan.length);
    // Volume d'un montant = 0,045 × 0,145 × (2,7 − 0,29).
    const montant = pieces.find((p) => p.params.role === "montant")!;
    expect(volumeMaillage(maillageObjet(e2, montant)!)).toBeCloseTo(0.045 * 0.145 * (2.7 - 0.29), 9);
    const t = genererTableau(e2, "bois");
    expect(t.lignes.length).toBe(plan.length);
    expect(t.lignes[0]![6]).toBe("épicéa (déclaré)");
    expect(t.lignes[0]![12]).toBeNull(); // masse non évaluée
    const { contenu } = exporterIfc(e2, { projet: { id: "p", code: "P", nom: "Bois" }, revision: 1, horodatage: "2026-10-08T00:00:00Z" });
    expect(contenu).toContain("IFCELEMENTASSEMBLY(");
    expect(contenu).toContain(".STUD.");
    expect(contenu).toContain(".PLATE.");
    expect(contenu).toContain("IFCMATERIAL(");
    expect(contenu).toContain("IFCRELASSOCIATESMATERIAL(");
    const e3 = lot(e2, [{ type: "ossature.supprimer", params: { id: "os1", avecObjets: true } }]).etat;
    expect(Object.values(e3.objets).filter((o) => o.classe === "element-bois" || o.classe === "ossature")).toHaveLength(0);
  });
  it("provenance d'une section : jamais reprise du client — la ligne du catalogue est relue et sa source recalculée, catalogue inconnu refusé", () => {
    const e = lot(base(), [{ type: "catalogue.importer", params: { id: "cat", nom: "Sections Y", ontologie: "timber", csv: CSV } }]).etat;
    const e1 = lot(e, [{ type: "elementBois.creer", params: { id: "b", niveauId: "n1", role: "poutre", a: pt(0, 0), b: pt(3, 0), za: 2.5, zb: 2.5, section: { largeur: m(0.045), hauteur: m(0.145), profil: { catalogueId: "cat", designation: "45x145", source: "source inventée par le client" } } } }]).etat;
    expect((e1.objets["b"] as Occurrence<"element-bois">).params.section.profil?.source).toBe("Fournisseur bois Y, 2025, p. 4");
    expect(() => lot(e, [{ type: "elementBois.creer", params: { id: "b2", niveauId: "n1", role: "poutre", a: pt(0, 0), b: pt(3, 0), za: 2.5, zb: 2.5, section: { largeur: m(0.045), hauteur: m(0.145), profil: { catalogueId: "inconnu", designation: "45x145", source: "x" } } } }])).toThrow(/catalogue inconnu/);
    expect(() => lot(e, [{ type: "panneauClt.creer", params: { id: "c", niveauId: "n1", pose: "mur", a: pt(0, 0), b: pt(3, 0), hauteur: m(2.7), epaisseur: m(0.1), couches: 5, profil: { catalogueId: "cat", designation: "absente", source: "x" } } }])).toThrow(/absent du catalogue/);
  });
  it("mur sans hauteur : la génération exige la hauteur (rien n'est supposé) ; section de catalogue sourcé pour les pièces", () => {
    const e0 = lot(base(), [
      { type: "mur.tracer", params: { id: "m1", niveauId: "n1", a: pt(0, 0), b: pt(3, 0), epaisseur: { value: 0.145, unit: "m" }, hauteur: null } },
      { type: "catalogue.importer", params: { id: "cat-bois", nom: "Sections bois Y", ontologie: "timber", csv: CSV } },
      { type: "ossature.creer", params: { id: "os1", nom: "O", genre: "mur", hoteId: "m1", entraxe: m(0.6), sectionMontant: { catalogueId: "cat-bois", designation: "45x145" } } },
    ]).etat;
    expect(objet<"ossature">(e0, "os1").params.sectionMontant.profil?.source).toBe("Fournisseur bois Y, 2025, p. 4");
    expect(objet<"ossature">(e0, "os1").params.sectionMontant.essence).toBe("épicéa");
    expect(() => lot(e0, [{ type: "ossature.generer", params: { id: "os1" } }])).toThrow(/sans hauteur/);
    const e1 = lot(e0, [{ type: "ossature.generer", params: { id: "os1", hauteur: m(2.5) } }]).etat;
    expect(Object.values(e1.objets).filter((o) => o.classe === "element-bois").length).toBeGreaterThan(5);
  });
  it("charpente depuis une toiture bipente : sablières, faîtière, chevrons de l'égout au faîtage ; toiture plate refusée", () => {
    const e0 = lot(base(), [
      { type: "toiture.creer", params: { id: "t1", niveauId: "n1", contour: [pt(0, 0), pt(8, 0), pt(8, 6), pt(0, 6)], trous: [], type: "bipente", epaisseur: m(0.2), pente: { value: 30, unit: "deg" }, decalageBase: m(2.7), nom: null } },
      { type: "toiture.creer", params: { id: "t2", niveauId: "n1", contour: [pt(10, 0), pt(14, 0), pt(14, 3), pt(10, 3)], trous: [], type: "plate", epaisseur: m(0.2), pente: null, decalageBase: m(2.7), nom: null } },
      { type: "ossature.creer", params: { id: "ch1", nom: "Charpente", genre: "toit", hoteId: "t1", entraxe: m(0.6), sectionMontant: { largeur: m(0.063), hauteur: m(0.175) }, sectionLisse: { largeur: m(0.075), hauteur: m(0.225) } } },
    ]).etat;
    const plan = planOssature(e0, objet<"ossature">(e0, "ch1"), null);
    const roles = plan.map((e) => e.role);
    expect(roles.filter((r) => r === "sabliere")).toHaveLength(2);
    expect(roles.filter((r) => r === "faitiere")).toHaveLength(1);
    const chevrons = plan.filter((e) => e.role === "chevron");
    expect(chevrons.length).toBeGreaterThan(20);
    // Chevron : de l'égout (z ≈ 2,7 − h/2) au faîtage (z ≈ 2,7 + 3·tan 30° − h/2).
    const c = chevrons[0]!;
    expect(c.za).toBeCloseTo(2.7 - 0.175 / 2, 6);
    expect(c.zb).toBeCloseTo(2.7 + 3 * Math.tan(Math.PI / 6) - 0.175 / 2, 6);
    expect(() => lot(e0, [{ type: "ossature.creer", params: { id: "ch2", nom: "X", genre: "toit", hoteId: "t2", entraxe: m(0.6), sectionMontant: S45 } }, { type: "ossature.generer", params: { id: "ch2" } }])).toThrow(/plate/);
    const e1 = lot(e0, [{ type: "ossature.generer", params: { id: "ch1" } }]).etat;
    expect(Object.values(e1.objets).filter((o) => o.classe === "element-bois")).toHaveLength(plan.length);
  });
  it("panneau CLT vertical et plancher (volume), assemblages bois–bois (sans platine) et bois–métal (platine, quincaillerie sourcée) ; suppression en cascade ; IFC", () => {
    const e = lot(base(), [
      { type: "elementBois.creer", params: { id: "b1", niveauId: "n1", role: "poutre", a: pt(0, 0), b: pt(4, 0), za: 2.5, section: { largeur: m(0.1), hauteur: m(0.3), essence: "chêne (déclaré)" } } },
      { type: "elementBois.creer", params: { id: "b2", niveauId: "n1", role: "poteau", a: pt(0, 0), b: pt(0, 0), za: 0, zb: 2.5, section: { largeur: m(0.2), hauteur: m(0.2) } } },
      { type: "panneauClt.creer", params: { id: "c1", niveauId: "n1", pose: "mur", a: pt(0, 2), b: pt(5, 2), hauteur: m(2.7), epaisseur: m(0.1), couches: 5, essence: "épicéa" } },
      { type: "panneauClt.creer", params: { id: "c2", niveauId: "n1", pose: "plancher", contour: [pt(0, 0), pt(4, 0), pt(4, 3), pt(0, 3)], z: 2.7, epaisseur: m(0.14), couches: 5 } },
      { type: "assemblageBois.creer", params: { id: "ab1", type: "tenon-mortaise", a: "b1", b: "b2", position: pt(0, 0), z: 2.5 } },
      { type: "assemblageBois.creer", params: { id: "ab2", type: "sabot", a: "b1", b: "c1", position: pt(4, 0), z: 2.5, platine: { largeur: m(0.1), hauteur: m(0.2), epaisseur: m(0.003) }, quincaillerie: [{ designation: "sabot 100", nombre: 1, source: "Catalogue quincaillerie Z, 2025, p. 8" }, { designation: "pointes annelées 4x60", nombre: 20, source: "Catalogue quincaillerie Z, 2025, p. 40" }] } },
    ]).etat;
    expect(objet<"assemblage-bois">(e, "ab1").params.nature).toBe("bois-bois");
    expect(objet<"assemblage-bois">(e, "ab2").params.nature).toBe("bois-metal");
    expect(volumeMaillage(maillageObjet(e, objet<"panneau-clt">(e, "c1"))!)).toBeCloseTo(5 * 2.7 * 0.1, 9);
    expect(volumeMaillage(maillageObjet(e, objet<"panneau-clt">(e, "c2"))!)).toBeCloseTo(12 * 0.14, 9);
    expect(() => lot(e, [{ type: "assemblageBois.creer", params: { id: "x", type: "mi-bois", a: "b1", b: "b2", position: pt(0, 0), platine: { largeur: m(0.1), hauteur: m(0.1), epaisseur: m(0.002) } } }])).toThrow(/platine/);
    const t = genererTableau(e, "bois");
    expect(t.lignes.filter((l) => l[3] === "quincaillerie")).toHaveLength(2);
    expect(t.lignes.some((l) => l[3] === "panneau CLT")).toBe(true);
    const { contenu } = exporterIfc(e, { projet: { id: "p", code: "P", nom: "Bois" }, revision: 1, horodatage: "2026-10-08T00:00:00Z" });
    expect(contenu).toContain("IFCWALL(");
    expect(contenu).toContain("'CLT'");
    expect(contenu).toContain("IFCSLAB(");
    expect(contenu).toContain("IFCFASTENER(");
    expect(contenu).toContain("IFCDISCRETEACCESSORY(");
    expect(contenu).toContain(".POST.");
    const e2 = lot(e, [{ type: "elementBois.supprimer", params: { id: "b1" } }]).etat;
    expect(e2.objets["ab1"]).toBeUndefined();
    expect(e2.objets["ab2"]).toBeUndefined();
    expect(e2.objets["c1"]).toBeTruthy();
  });
});
