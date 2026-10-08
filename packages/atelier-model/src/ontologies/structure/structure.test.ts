import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { appliquerLot, CONTRAT_COMMANDES } from "../../commandes/index.js";
import type { Commande } from "../../commandes/base.js";
import { modeleVide, type ModeleAtelier, type Occurrence } from "../../modele.js";
import { genererTableau, csvTableau } from "../../documents/tableaux.js";
import { exporterIfc } from "../../echanges/ifc.js";
import { maillageObjet } from "../../projection/maillage.js";
import { interferences } from "../../interferences.js";
import { aireSection, contourSection, formeDepuisDesignation, sectionDepuisCatalogue } from "./sections.js";
import { balayer, longueurBarre, volumeMaillage } from "./geometrie.js";
import { planGeneration, nommerAxes } from "./trame.js";
import { assemblagesSoudes } from "./soudures.js";
import { validerCatalogueCsv } from "../../catalogues/csv-source.js";

const pt = (x: number, y: number) => ({ x, y, frame: "local" as const, unit: "m" as const });
const m = (value: number) => ({ value, unit: "m" as const });
let n = 0;
function lot(etat: ModeleAtelier, commands: Commande[], label = "lot") {
  return appliquerLot(etat, { requestId: `req-s-${++n}`, baseRevision: 0, contract: CONTRAT_COMMANDES, label, commands });
}
function base(): ModeleAtelier {
  return lot(modeleVide(), [{ type: "niveau.creer", params: { id: "n1", nom: "RDC", elevation: 0, hauteur: 3 } }, { type: "ontologie.activer", params: { nom: "structure" } }]).etat;
}
const objet = <C extends "poutre" | "trame" | "plaque" | "assemblage-structurel" | "soudure" | "armature" | "coulage" | "poteau">(etat: ModeleAtelier, id: string) => etat.objets[id] as Occurrence<C>;
const RECT = { forme: "rectangle", largeur: m(0.2), hauteur: m(0.4) };
const IPE = { forme: "I", largeur: m(0.1), hauteur: m(0.2), epaisseur: m(0.006), epaisseurAile: m(0.009) };
const CSV = "designation;hauteur_mm;largeur_mm;epaisseur_ame_mm;epaisseur_aile_mm;masse_kg_m;source;edition;page\nIPE 200;200;100;5,6;8,5;22,4;Catalogue producteur X;2024;p. 12\nHEA 100;96;100;5;8;;Catalogue producteur X;2024;p. 20\nL 50x50x5;50;50;5;;3,77;Catalogue producteur X;2024;p. 31\n";

describe("ontologie structure (P2-3) : isolation et activation", () => {
  it("aucun module de l'ontologie n'importe une autre ontologie ni d'adaptateur (cahier P2 §8-2)", () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".ts") && !x.endsWith(".test.ts"))) {
      const src = readFileSync(join(dir, f), "utf8");
      expect(src, f).not.toMatch(/from "\.\.\/mechanical/);
      expect(src, f).not.toMatch(/from "react|from "express|document\./);
    }
  });
  it("aucune constante normative : le code de l'ontologie ne porte ni dimension de profilé, ni masse, ni densité (cahier P2 §8-3)", () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".ts") && !x.endsWith(".test.ts"))) {
      const src = readFileSync(join(dir, f), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
      expect(src, f).not.toMatch(/\b(7850|2500|2400|7\.85|78\.5|kg_m\s*[:=]\s*\d)/);
      expect(src, f).not.toMatch(/\b(IPE|HEA|HEB|UPN)\s*\d{2,3}\b/);
    }
  });
  it("les classes de structure sont refusées tant que l'ontologie n'est pas activée ; le poteau du socle reste disponible", () => {
    const e0 = lot(modeleVide(), [{ type: "niveau.creer", params: { id: "n1", nom: "RDC", elevation: 0, hauteur: 3 } }]).etat;
    expect(() => lot(e0, [{ type: "poutre.creer", params: { id: "b1", niveauId: "n1", a: pt(0, 0), b: pt(6, 0), section: RECT, materiau: "beton" } }])).toThrow(/non activée/);
    const e1 = lot(e0, [{ type: "poteau.creer", params: { id: "c1", niveauId: "n1", point: pt(0, 0), formeId: "rectangle", largeur: m(0.3), profondeur: m(0.3), hauteur: m(3), angle: { value: 0, unit: "deg" } } }]).etat;
    expect(e1.objets["c1"]?.classe).toBe("poteau");
    const e2 = lot(e1, [{ type: "ontologie.activer", params: { nom: "structure" } }, { type: "poutre.creer", params: { id: "b1", niveauId: "n1", a: pt(0, 0), b: pt(6, 0), za: 3, section: RECT, materiau: "beton" } }]).etat;
    expect(e2.ontologies).toEqual(["structure"]);
    expect(() => lot(e2, [{ type: "ontologie.desactiver", params: { nom: "structure" } }])).toThrow(/objet/);
  });
});

describe("sections et géométrie pure", () => {
  it("contour et aire d'une section I, tube creux, cercle ; rien n'est supposé", () => {
    const sI = { ...IPE, profil: null, masseLineique: null } as const;
    const aI = aireSection(sI as never);
    expect(aI).toBeCloseTo(2 * 0.1 * 0.009 + (0.2 - 0.018) * 0.006, 9);
    expect(contourSection(sI as never)).toHaveLength(12);
    const tube = { forme: "tube", largeur: m(0.1), hauteur: m(0.1), epaisseur: m(0.005), epaisseurAile: null, profil: null, masseLineique: null } as const;
    expect(aireSection(tube as never)).toBeCloseTo(0.01 - 0.09 * 0.09, 9);
    const rond = { forme: "cercle", largeur: m(0.2), hauteur: m(0.2), epaisseur: null, epaisseurAile: null, profil: null, masseLineique: null } as const;
    expect(aireSection(rond as never)).toBeCloseTo(Math.PI * 0.01, 2);
  });
  it("le balayage d'une section rectangulaire donne un volume = aire × longueur, pour un élément horizontal, vertical ou incliné", () => {
    const c: [number, number][] = [[-0.1, -0.2], [0.1, -0.2], [0.1, 0.2], [-0.1, 0.2]];
    expect(volumeMaillage(balayer(c, [], [0, 0, 3], [6, 0, 3]))).toBeCloseTo(0.08 * 6, 9);
    expect(volumeMaillage(balayer(c, [], [1, 1, 0], [1, 1, 4]))).toBeCloseTo(0.08 * 4, 9);
    expect(volumeMaillage(balayer(c, [], [0, 0, 0], [3, 4, 12]))).toBeCloseTo(0.08 * 13, 9);
    const tube = balayer([[-0.05, -0.05], [0.05, -0.05], [0.05, 0.05], [-0.05, 0.05]], [[[-0.045, -0.045], [-0.045, 0.045], [0.045, 0.045], [0.045, -0.045]]], [0, 0, 0], [0, 2, 0]);
    expect(volumeMaillage(tube)).toBeCloseTo((0.01 - 0.0081) * 2, 9);
  });
  it("section depuis un catalogue sourcé : dimensions en m, masse linéique et source citées ; absence → erreur nommée, jamais zéro", () => {
    const rapport = validerCatalogueCsv(CSV);
    expect(rapport.importable).toBe(true);
    const ipe = sectionDepuisCatalogue("cat", rapport.retenues[0]!);
    expect(ipe.forme).toBe("I");
    expect(ipe.hauteur.value).toBeCloseTo(0.2, 9);
    expect(ipe.epaisseurAile?.value).toBeCloseTo(0.0085, 9);
    expect(ipe.masseLineique).toBeCloseTo(22.4, 9);
    expect(ipe.profil?.source).toBe("Catalogue producteur X, 2024, p. 12");
    const hea = sectionDepuisCatalogue("cat", rapport.retenues[1]!);
    expect(hea.forme).toBe("H");
    expect(hea.masseLineique).toBeNull();
    expect(() => sectionDepuisCatalogue("cat", rapport.retenues[2]!)).not.toThrow();
    expect(formeDepuisDesignation("UPN 120")).toBe("U");
    expect(formeDepuisDesignation("Z 100")).toBeNull();
    const tube = validerCatalogueCsv("designation;forme;hauteur_mm;largeur_mm;epaisseur_ame_mm;source;edition;page\nRHS 100x100;tube;100;100;60;Doc;2024;p. 2\n");
    expect(() => sectionDepuisCatalogue("cat", tube.retenues[0]!)).toThrow(/incompatible/);
    const sans = validerCatalogueCsv("designation;largeur_mm;source;edition;page\nIPE 300;150;Doc;2024;p. 1\n");
    expect(() => sectionDepuisCatalogue("cat", sans.retenues[0]!)).toThrow(/hauteur_mm absente/);
  });
});

describe("éléments, trame, plaque, assemblage, soudure, armature, coulage", () => {
  it("une poutre se crée avec une section saisie ; son maillage a le volume aire × longueur ; sans dimension requise elle est refusée", () => {
    const e = lot(base(), [{ type: "poutre.creer", params: { id: "b1", niveauId: "n1", nom: "P1", a: pt(0, 0), b: pt(6, 0), za: 2.8, section: IPE, materiau: "acier", materiauNom: "S355 (déclaré)" } }]).etat;
    expect(() => lot(base(), [{ type: "poutre.creer", params: { id: "b9", niveauId: "n1", a: pt(0, 0), b: pt(6, 0), section: RECT } }])).toThrow(/materiau/);
    const b = objet<"poutre">(e, "b1");
    expect(b.params.zb).toBe(2.8);
    const mail = maillageObjet(e, b)!;
    expect(volumeMaillage(mail)).toBeCloseTo(aireSection(b.params.section) * 6, 9);
    expect(() => lot(base(), [{ type: "poutre.creer", params: { id: "b2", niveauId: "n1", a: pt(0, 0), b: pt(6, 0), section: { forme: "I", largeur: m(0.1), hauteur: m(0.2) }, materiau: "acier" } }])).toThrow(/épaisseur/);
    expect(() => lot(base(), [{ type: "poutre.creer", params: { id: "b3", niveauId: "n1", a: pt(0, 0), b: pt(0, 0), section: RECT, materiau: "acier" } }])).toThrow(/longueur nulle/);
  });
  it("la trame planifie (aperçu) puis génère poteaux et poutres après accord ; rejouée, elle ne crée aucun doublon ; sa suppression avec objets retire ce qu'elle a généré", () => {
    const trame = { id: "t1", niveauId: "n1", nom: "T", origine: pt(10, 10), angle: { value: 0, unit: "deg" }, files: nommerAxes([0, 6, 12], "file"), rangs: nommerAxes([0, 5], "rang") };
    const e1 = lot(base(), [{ type: "trame.creer", params: trame }]).etat;
    const plan = planGeneration(objet<"trame">(e1, "t1").params, { poteaux: true, poutres: true });
    expect(plan.poteaux).toHaveLength(6);
    expect(plan.poutres).toHaveLength(3 + 4);
    expect(objet<"trame">(e1, "t1").params.generation).toBeNull();
    const gen = { type: "trame.generer", params: { id: "t1", hauteur: m(3), materiau: "acier", sectionPoteau: { formeId: "I", largeur: m(0.2), profondeur: m(0.2), epaisseurProfil: m(0.01) }, sectionPoutre: IPE } };
    const e2 = lot(e1, [gen]).etat;
    const poteaux = Object.values(e2.objets).filter((o) => o.classe === "poteau");
    const poutres = Object.values(e2.objets).filter((o): o is Occurrence<"poutre"> => o.classe === "poutre");
    expect(poteaux).toHaveLength(6);
    expect(poutres).toHaveLength(7);
    expect(poteaux[0]!.proprietes["trame"]?.valeur).toBe("t1");
    expect(poutres.every((p) => p.params.trameId === "t1" && Math.abs(p.params.za - (3 - 0.1)) < 1e-9)).toBe(true);
    expect(objet<"trame">(e2, "t1").params.generation).toEqual({ poteaux: 6, poutres: 7, hauteur: 3 });
    const e3 = lot(e2, [gen]).etat;
    expect(Object.values(e3.objets).filter((o) => o.classe === "poteau" || o.classe === "poutre")).toHaveLength(13);
    const e4 = lot(e3, [{ type: "trame.supprimer", params: { id: "t1", avecObjets: true } }]).etat;
    expect(Object.values(e4.objets).filter((o) => o.classe === "poteau" || o.classe === "poutre" || o.classe === "trame")).toHaveLength(0);
    // Supprimée seule : les objets générés restent, détachés (plus de trameId ni de propriété trame), et restent modifiables.
    const e5 = lot(e3, [{ type: "trame.supprimer", params: { id: "t1" } }]).etat;
    const restants = Object.values(e5.objets).filter((o): o is Occurrence<"poutre"> => o.classe === "poutre");
    expect(restants).toHaveLength(7);
    expect(restants.every((p) => p.params.trameId === null)).toBe(true);
    expect(Object.values(e5.objets).filter((o) => o.classe === "poteau").every((o) => o.proprietes["trame"] === undefined)).toBe(true);
    expect(() => lot(e5, [{ type: "poutre.modifier", params: { id: restants[0]!.id, params: { role: "longrine" } } }])).not.toThrow();
  });
  it("catalogue sourcé importé dans le projet → poutre par désignation : section du catalogue, masse linéique sourcée, nomenclature avec masse et source", () => {
    const e = lot(base(), [
      { type: "catalogue.importer", params: { id: "cat-acier", nom: "Profilés X", ontologie: "structure", csv: CSV } },
      { type: "poutre.creer", params: { id: "b1", niveauId: "n1", nom: "IPE", a: pt(0, 0), b: pt(5, 0), za: 3, section: { catalogueId: "cat-acier", designation: "ipe 200" }, materiau: "acier" } },
    ]).etat;
    const b = objet<"poutre">(e, "b1");
    expect(b.params.section.profil?.designation).toBe("IPE 200");
    expect(b.params.section.masseLineique).toBe(22.4);
    const t = genererTableau(e, "structure");
    const ligne = t.lignes.find((l) => l[1] === "b1")!;
    expect(ligne[5]).toBe("IPE 200");
    expect(ligne[6]).toBe("Catalogue producteur X, 2024, p. 12");
    expect(ligne[10]).toBeCloseTo(22.4 * 5, 6);
    expect(() => lot(e, [{ type: "poutre.creer", params: { id: "b2", niveauId: "n1", a: pt(0, 0), b: pt(5, 0), section: { catalogueId: "cat-acier", designation: "IPE 999" }, materiau: "acier" } }])).toThrow(/absent du catalogue/);
    // Une masse linéique saisie à la main (sans profil sourcé) n'est jamais retenue (R3).
    const e2 = lot(e, [{ type: "poutre.creer", params: { id: "b3", niveauId: "n1", a: pt(0, 0), b: pt(5, 0), section: { ...RECT, masseLineique: 50 }, materiau: "beton" } }]).etat;
    expect(objet<"poutre">(e2, "b3").params.section.masseLineique).toBeNull();
    expect(csvTableau(genererTableau(e2, "structure"))).toContain("non évaluée");
  });
  it("plaque, assemblage paramétrique (platine + boulons), soudures → assemblage soudé dérivé, armature (longueur développée), coulage", () => {
    const e = lot(base(), [
      { type: "poteau.creer", params: { id: "c1", niveauId: "n1", point: pt(0, 0), formeId: "rectangle", largeur: m(0.3), profondeur: m(0.3), hauteur: m(3), angle: { value: 0, unit: "deg" }, proprietes: { materiau: { valeur: "béton C25/30 (déclaré)", provenance: "saisie", statut: "declaree" } } } },
      { type: "poutre.creer", params: { id: "b1", niveauId: "n1", a: pt(0, 0), b: pt(6, 0), za: 2.8, section: IPE, materiau: "acier" } },
      { type: "poutre.creer", params: { id: "b2", niveauId: "n1", a: pt(6, 0), b: pt(6, 5), za: 2.8, section: IPE, materiau: "acier" } },
      { type: "plaque.creer", params: { id: "pl1", niveauId: "n1", nom: "Platine", contour: [pt(0, 0), pt(0.5, 0), pt(0.5, 0.5), pt(0, 0.5)], epaisseur: m(0.02), z: 3, materiau: "acier" } },
      { type: "assemblageStructurel.creer", params: { id: "as1", niveauId: "n1", type: "platine-about", elements: ["b1", "c1"], position: pt(0.15, 0), z: 2.8, angle: { value: 0, unit: "deg" }, platine: { largeur: m(0.2), hauteur: m(0.3), epaisseur: m(0.015) }, boulons: { rangees: 3, parRangee: 2, diametre: m(0.016), entraxe: m(0.07), longueur: m(0.06) } } },
      { type: "soudure.creer", params: { id: "w1", type: "angle", a: "b1", b: "b2", gorge: m(0.005), longueur: m(0.3), position: pt(6, 0), z: 2.8 } },
      { type: "soudure.creer", params: { id: "w2", type: "angle", a: "b2", b: "pl1", gorge: m(0.005), longueur: m(0.2), position: pt(6, 5), z: 2.8 } },
      { type: "armature.creer", params: { id: "ar1", niveauId: "n1", hoteId: "pl1", forme: "cadre", diametre: m(0.01), points: [pt(0.05, 0.05), pt(0.45, 0.05), pt(0.45, 0.45), pt(0.05, 0.45)], z: 3.01, nombre: 4, espacement: m(0.1), nuance: "B500B (déclarée)" } },
      { type: "coulage.creer", params: { id: "co1", niveauId: "n1", nom: "Coulage 1", elements: ["c1"] } },
    ]).etat;
    // Un élément dont le béton n'est pas déclaré (poutre acier) est refusé dans un coulage.
    expect(() => lot(e, [{ type: "coulage.affecter", params: { id: "co1", elements: ["c1", "b2"] } }])).toThrow(/béton non déclaré/);
    expect(volumeMaillage(maillageObjet(e, objet<"plaque">(e, "pl1"))!)).toBeCloseTo(0.25 * 0.02, 9);
    const as = maillageObjet(e, objet<"assemblage-structurel">(e, "as1"))!;
    expect(volumeMaillage(as)).toBeGreaterThan(0.2 * 0.3 * 0.015);
    const soudes = assemblagesSoudes(e);
    expect(soudes).toHaveLength(1);
    expect(soudes[0]!.elements).toEqual(["b1", "b2", "pl1"]);
    expect(soudes[0]!.longueur).toBeCloseTo(0.5, 9);
    expect(longueurBarre(objet<"armature">(e, "ar1").params)).toBeCloseTo(1.6, 9);
    const ta = genererTableau(e, "armatures");
    expect(ta.lignes[0]![8]).toBeCloseTo(6.4, 9);
    expect(ta.lignes[0]![10]).toBeNull();
    const e2 = lot(lot(e, [{ type: "poutre.modifier", params: { id: "b1", params: { materiau: "beton" } } }]).etat, [{ type: "coulage.affecter", params: { id: "co1", elements: ["c1", "b1"] } }]).etat;
    expect(objet<"coulage">(e2, "co1").params.elements).toEqual(["c1", "b1"]);
    const ts = genererTableau(e2, "structure");
    expect(ts.lignes.find((l) => l[1] === "b1")![13]).toBe("Coulage 1");
    const tas = genererTableau(e2, "assemblagesStructure");
    expect(tas.lignes.map((l) => l[0])).toEqual(["paramétrique", "soudé"]);
    expect(tas.lignes[0]![5]).toBe(6);
    // Suppression d'une poutre : ses soudures disparaissent, l'assemblage la retire, le coulage aussi ; la plaque reste.
    const e3 = lot(e2, [{ type: "poutre.supprimer", params: { id: "b1" } }]).etat;
    expect(e3.objets["w1"]).toBeUndefined();
    expect(objet<"assemblage-structurel">(e3, "as1").params.elements).toEqual(["c1"]);
    expect(objet<"coulage">(e3, "co1").params.elements).toEqual(["c1"]);
    // Suppression du poteau par le socle : l'assemblage est signalé à réparer (contrôle après commande).
    const e4 = lot(e3, [{ type: "poteau.supprimer", params: { id: "c1" } }]).etat;
    expect(Object.values(e4.problemes).some((p) => p.type === "reference-a-reparer" && p.objetId === "as1")).toBe(true);
    // Refus nommés.
    expect(() => lot(e, [{ type: "soudure.creer", params: { id: "w3", a: "b1", b: "b1", gorge: m(0.005), longueur: m(0.1), position: pt(0, 0) } }])).toThrow(/différents/);
    expect(() => lot(e, [{ type: "armature.creer", params: { id: "ar2", niveauId: "n1", diametre: m(0.01), points: [pt(0, 0), pt(1, 0)], nombre: 3 } }])).toThrow(/espacement/);
  });
  it("IFC : IfcGrid, IfcColumn, IfcBeam / IfcMember, IfcPlate, IfcReinforcingBar, IfcElementAssembly (paramétrique et .WELDED.), IfcFastener .WELD., IfcGroup", () => {
    const e = lot(base(), [
      { type: "trame.creer", params: { id: "t1", niveauId: "n1", nom: "T", origine: pt(0, 0), files: [{ nom: "A", position: 0 }, { nom: "B", position: 6 }], rangs: [{ nom: "1", position: 0 }, { nom: "2", position: 5 }] } },
      { type: "trame.generer", params: { id: "t1", hauteur: m(3), materiau: "acier", sectionPoteau: { formeId: "rectangle", largeur: m(0.2), profondeur: m(0.2) }, sectionPoutre: IPE } },
      { type: "poutre.creer", params: { id: "d1", niveauId: "n1", role: "contreventement", a: pt(0, 0), b: pt(6, 0), za: 0, zb: 2.8, section: { forme: "L", largeur: m(0.06), hauteur: m(0.06), epaisseur: m(0.006) }, materiau: "acier" } },
      { type: "plaque.creer", params: { id: "pl1", niveauId: "n1", contour: [pt(0, 0), pt(0.5, 0), pt(0.5, 0.5), pt(0, 0.5)], epaisseur: m(0.02), z: 3, materiau: "beton" } },
      { type: "armature.creer", params: { id: "ar1", niveauId: "n1", diametre: m(0.012), points: [pt(0, 0), pt(6, 0)], z: 0.05, nombre: 5, espacement: m(0.15) } },
      { type: "soudure.creer", params: { id: "w1", a: "d1", b: "pl1", gorge: m(0.004), longueur: m(0.1), position: pt(0, 0) } },
      { type: "coulage.creer", params: { id: "co1", niveauId: "n1", nom: "Coulage 1", elements: ["pl1"], prefabrique: true } },
    ]).etat;
    const { contenu, rapport } = exporterIfc(e, { projet: { id: "p", code: "P", nom: "Structure" }, revision: 1, horodatage: "2026-10-08T00:00:00Z" });
    expect(contenu).toContain("IFCGRID(");
    expect((contenu.match(/IFCCOLUMN\(/g) ?? []).length).toBe(4);
    expect((contenu.match(/IFCBEAM\(/g) ?? []).length).toBe(4);
    expect(contenu).toContain("IFCMEMBER(");
    expect(contenu).toContain(".BRACE.");
    expect(contenu).toContain("IFCPLATE(");
    expect(contenu).toContain("IFCREINFORCINGBAR(");
    expect(contenu).toContain(".WELD.");
    expect(contenu).toContain(".WELDED.");
    expect(contenu).toContain("IFCGROUP(");
    expect(contenu).toContain("IFCRELASSIGNSTOGROUP(");
    expect(rapport.classes.find((l) => l.classe === "poutre")?.cible).toBe(5);
    // Même modèle, mêmes octets (reproductible).
    expect(exporterIfc(e, { projet: { id: "p", code: "P", nom: "Structure" }, revision: 1, horodatage: "2026-10-08T00:00:00Z" }).contenu).toBe(contenu);
  });
  it("coordination : une pièce mécanique dans le volume d'une poutre est une interférence ; déplacement d'une poutre par transformation", () => {
    const e0 = lot(base(), [
      { type: "ontologie.activer", params: { nom: "mechanical" } },
      { type: "poutre.creer", params: { id: "b1", niveauId: "n1", a: pt(0, 0), b: pt(6, 0), za: 1, section: RECT, materiau: "beton" } },
      { type: "solide.extruder", params: { id: "s1", niveauId: "n1", contour: [pt(2, -0.5), pt(3, -0.5), pt(3, 0.5), pt(2, 0.5)], ferme: true, hauteur: m(2), decalageBase: m(0), epaisseur: null, role: "solid", nom: "bloc", couleur: null } },
    ]).etat;
    const e1 = lot(e0, [{ type: "pieceMecanique.creer", params: { id: "p1", sourceId: "s1" } }]).etat;
    const inter = interferences(e1);
    expect(inter.some((i) => i.objets.includes("b1") && i.objets.includes("p1"))).toBe(true);
    const e2 = lot(e1, [{ type: "transformer.deplacer", params: { dx: 0, dy: 3 }, cibles: ["b1"] }]).etat;
    expect(objet<"poutre">(e2, "b1").params.a.y).toBeCloseTo(3, 9);
    expect(objet<"poutre">(e2, "b1").params.section.hauteur.value).toBe(0.4);
  });
});
