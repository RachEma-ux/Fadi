import { describe, expect, it } from "vitest";
import { appliquerLot, CONTRAT_COMMANDES } from "../../commandes/index.js";
import { ErreurCommande, type Commande } from "../../commandes/base.js";
import { modeleVide, type ModeleAtelier, type Occurrence } from "../../modele.js";
import { genererTableau } from "../../documents/tableaux.js";
import { genererVue, lireParamsVue } from "../../documents/vues.js";
import { exporterIfc } from "../../echanges/ifc.js";
import { maillageObjet } from "../../projection/maillage.js";
import { collisions } from "../../versions.js";
import { resoudre } from "./solveur.js";
import { controlerRegle, evaluerFamille } from "./familles.js";

// Cube unité (maillage d'un solide exact fictif) : 8 sommets, 12 triangles orientés vers l'extérieur.
const P = [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1];
const I = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7];
const pt = (x: number, y: number) => ({ x, y, frame: "local" as const, unit: "m" as const });
const solideExact = (id: string, nom: string, dx = 1, dy = 1, dz = 1) => ({ type: "solideExact.creer", params: { id, niveauId: "n1", nom, brep: "QlJFUA==", moteur: "occt-wasm", versionMoteur: "5.6.1", empreinteBrep: "0123456789abcdef", maillage: { positions: P.map((v, i) => v * [dx, dy, dz][i % 3]!), indices: I }, volume: dx * dy * dz, aire: 2 * (dx * dy + dy * dz + dx * dz), faces: 6, operation: { type: "extrusion", sources: [], libelle: nom } } });

let n = 0;
function lot(etat: ModeleAtelier, commands: Commande[], label = "lot") {
  return appliquerLot(etat, { requestId: `req-${++n}`, baseRevision: 0, contract: CONTRAT_COMMANDES, label, commands });
}
function base(): ModeleAtelier {
  return lot(modeleVide(), [{ type: "niveau.creer", params: { id: "n1", nom: "RDC", elevation: 0, hauteur: 3 } }, solideExact("se-socle", "Socle", 2, 1, 0.2), solideExact("se-caisson", "Caisson", 2.4, 1.6, 1.2), solideExact("se-pale", "Pale", 0.1, 0.5, 0.05)]).etat;
}
const objet = <C extends "piece-mecanique" | "assemblage" | "liaison">(etat: ModeleAtelier, id: string) => etat.objets[id] as Occurrence<C>;

describe("ontologie mécanique (P2-2) : activation par projet", () => {
  it("les classes mécaniques sont refusées tant que l'ontologie n'est pas activée ; activée, elles entrent ; désactivation refusée tant qu'un objet existe", () => {
    const e0 = base();
    expect(() => lot(e0, [{ type: "assemblage.creer", params: { id: "a1", niveauId: "n1", nom: "CTA", position: pt(5, 5) } }])).toThrow(/non activée/);
    const e1 = lot(e0, [{ type: "ontologie.activer", params: { nom: "mechanical" } }]).etat;
    expect(e1.ontologies).toEqual(["mechanical"]);
    expect(() => lot(e1, [{ type: "ontologie.activer", params: { nom: "drawing" } }])).toThrow(/socle/);
    const e2 = lot(e1, [{ type: "assemblage.creer", params: { id: "a1", niveauId: "n1", nom: "CTA", position: pt(5, 5) } }]).etat;
    expect(objet<"assemblage">(e2, "a1").params.nom).toBe("CTA");
    expect(() => lot(e2, [{ type: "ontologie.desactiver", params: { nom: "mechanical" } }])).toThrow(/1 objet/);
    const e3 = lot(e2, [{ type: "assemblage.supprimer", params: { id: "a1" } }, { type: "ontologie.desactiver", params: { nom: "mechanical" } }]).etat;
    expect(e3.ontologies).toBeUndefined();
  });
});

describe("pièces, assemblage, liaisons et solveur", () => {
  function cta() {
    const e = lot(base(), [
      { type: "ontologie.activer", params: { nom: "mechanical" } },
      { type: "assemblage.creer", params: { id: "a1", niveauId: "n1", nom: "CTA", numero: "CTA", position: pt(5, 5), angle: { value: 90, unit: "deg" } } },
      { type: "pieceMecanique.creer", params: { id: "p-socle", sourceId: "se-socle", assemblageId: "a1", fixe: true, materiau: "acier (déclaré)" } },
      { type: "pieceMecanique.creer", params: { id: "p-caisson", sourceId: "se-caisson", assemblageId: "a1", pose: { x: 0.3, y: 0.2, z: 0.9 } } },
      { type: "pieceMecanique.creer", params: { id: "p-pale", sourceId: "se-pale", assemblageId: "a1", pose: { x: 1, y: 1, z: 1 } } },
    ]).etat;
    return e;
  }
  it("une pièce copie la géométrie de sa source (brep, maillage, volume), se pose dans l'assemblage ; emprise dans le repère du niveau", () => {
    const e = cta();
    const p = objet<"piece-mecanique">(e, "p-socle");
    expect(p.params.brep).toBe("QlJFUA==");
    expect(p.params.volume).toBeCloseTo(0.4, 9);
    expect(p.params.sourceId).toBe("se-socle");
    expect(p.niveauId).toBe("n1");
    // Repère de l'assemblage : tourné de 90° autour de (5, 5) : le socle 2 × 1 occupe x ∈ [4, 5], y ∈ [5, 7].
    const xs = p.params.emprise.map((q) => q.x), ys = p.params.emprise.map((q) => q.y);
    expect(Math.min(...xs)).toBeCloseTo(4, 6);
    expect(Math.max(...xs)).toBeCloseTo(5, 6);
    expect(Math.min(...ys)).toBeCloseTo(5, 6);
    expect(Math.max(...ys)).toBeCloseTo(7, 6);
    const m = maillageObjet(e, p)!;
    expect(m.indices.length).toBe(36);
    expect(() => lot(e, [{ type: "pieceMecanique.modifier", params: { id: "p-socle", params: { volume: 3 } } }])).toThrow(/géométrie non modifiable/);
  });
  it("encastrement caisson / socle puis pivot pale / caisson à 45° : le solveur pose les pièces, diagnostic écrit, pilotage 45° → 90°", () => {
    const e1 = lot(cta(), [
      { type: "liaison.creer", params: { id: "l-encastre", type: "encastrement", a: "p-socle", b: "p-caisson", pa: { x: 0, y: 0, z: 0.2 }, pb: { x: 0, y: 0, z: 0 } } },
    ]).etat;
    const caisson = objet<"piece-mecanique">(e1, "p-caisson");
    expect(caisson.params.pose.x).toBeCloseTo(0, 6);
    expect(caisson.params.pose.y).toBeCloseTo(0, 6);
    expect(caisson.params.pose.z).toBeCloseTo(0.2, 6);
    expect(objet<"liaison">(e1, "l-encastre").params.etat).toBe("bien contraint"); // la pale, sans liaison, ne compte pas
    expect(objet<"liaison">(e1, "l-encastre").params.ddl).toBe(0);
    const e2 = lot(e1, [
      // Pivot : axe y du caisson au point (1,2 ; 0 ; 0,6), axe y de la pale à son origine ; angle entre les x de 45°.
      { type: "liaison.creer", params: { id: "l-pivot", type: "pivot", a: "p-caisson", b: "p-pale", pa: { x: 1.2, y: 0, z: 0.6 }, da: { x: 0, y: 1, z: 0 }, ea: { x: 1, y: 0, z: 0 }, pb: { x: 0, y: 0, z: 0 }, db: { x: 0, y: 1, z: 0 }, eb: { x: 1, y: 0, z: 0 }, valeur: 45 } },
    ]).etat;
    const pale = objet<"piece-mecanique">(e2, "p-pale");
    // Origine de la pale sur l'axe du pivot : (1,2 ; y ; 0,6 + 0,2) dans le repère de l'assemblage, le plan fixe y = 0.
    expect(pale.params.pose.x).toBeCloseTo(1.2, 5);
    expect(pale.params.pose.y).toBeCloseTo(0, 5);
    expect(pale.params.pose.z).toBeCloseTo(0.8, 5);
    expect(objet<"assemblage">(e2, "a1").params.diagnostic).toBe("bien contraint");
    expect(objet<"liaison">(e2, "l-pivot").params.ddl).toBe(1);
    const angleX = (p: Occurrence<"piece-mecanique">) => { const w = [p.params.pose.rx, p.params.pose.ry, p.params.pose.rz]; return (Math.hypot(w[0]!, w[1]!, w[2]!) * 180) / Math.PI; };
    expect(angleX(pale)).toBeCloseTo(45, 3);
    const e3 = lot(e2, [{ type: "liaison.piloter", params: { id: "l-pivot", valeur: 90 } }]).etat;
    expect(angleX(objet<"piece-mecanique">(e3, "p-pale"))).toBeCloseTo(90, 3);
    expect(objet<"liaison">(e3, "l-pivot").params.valeur).toBe(90);
    // Deux liaisons incompatibles : refus nommé, rien d'écrit.
    expect(() => lot(e3, [{ type: "liaison.creer", params: { id: "l-dist", type: "distance", a: "p-socle", b: "p-pale", valeur: 10 } }])).toThrow(/incompatible/);
    expect(() => lot(e3, [{ type: "liaison.creer", params: { id: "l-x", type: "pivot", a: "p-socle", b: "p-socle" } }])).toThrow(/deux pièces différentes/);
  });
  it("glissière panneau / caisson : course pilotée 0 → 0,3 m le long de l'axe", () => {
    const e = lot(cta(), [
      solideExact("se-panneau", "Panneau", 1, 0.03, 1.2),
      { type: "pieceMecanique.creer", params: { id: "p-panneau", sourceId: "se-panneau", assemblageId: "a1" } },
      { type: "liaison.creer", params: { id: "l-enc", type: "encastrement", a: "p-socle", b: "p-caisson", pa: { x: 0, y: 0, z: 0.2 } } },
      { type: "liaison.creer", params: { id: "l-gl", type: "glissiere", a: "p-caisson", b: "p-panneau", pa: { x: 0, y: 0.8, z: 0 }, da: { x: 1, y: 0, z: 0 }, ea: { x: 0, y: 1, z: 0 }, db: { x: 1, y: 0, z: 0 }, eb: { x: 0, y: 1, z: 0 }, valeur: 0 } },
    ]).etat;
    const p0 = objet<"piece-mecanique">(e, "p-panneau").params.pose;
    const e2 = lot(e, [{ type: "liaison.piloter", params: { id: "l-gl", valeur: 0.3 } }]).etat;
    const p1 = objet<"piece-mecanique">(e2, "p-panneau").params.pose;
    expect(p1.x - p0.x).toBeCloseTo(0.3, 5);
    expect(p1.y - p0.y).toBeCloseTo(0, 5);
    expect(objet<"liaison">(e2, "l-gl").params.ddl).toBe(1);
  });
  it("déplacer l'assemblage repose les pièces ; déplacer une pièce d'assemblage est refusé ; supprimer une pièce retire ses liaisons", () => {
    const e = lot(cta(), [{ type: "liaison.creer", params: { id: "l1", type: "encastrement", a: "p-socle", b: "p-caisson" } }]).etat;
    const e2 = lot(e, [{ type: "transformer.deplacer", params: { dx: 1, dy: 0 }, cibles: ["a1"] }]).etat;
    expect(objet<"assemblage">(e2, "a1").params.position.x).toBeCloseTo(6, 9);
    expect(Math.min(...objet<"piece-mecanique">(e2, "p-socle").params.emprise.map((q) => q.x))).toBeCloseTo(5, 6);
    expect(() => lot(e2, [{ type: "transformer.deplacer", params: { dx: 1, dy: 0 }, cibles: ["p-socle"] }])).toThrow(/déplacer l'assemblage/);
    const e3 = lot(e2, [{ type: "pieceMecanique.supprimer", params: { id: "p-caisson" } }]).etat;
    expect(e3.objets["l1"]).toBeUndefined();
    expect(objet<"assemblage">(e3, "a1").params.diagnostic).toBeNull();
  });
  it("numérotation, nomenclature, vue éclatée avec bulles, IFC avec IfcElementAssembly agrégeant ses pièces", () => {
    const e = lot(cta(), [{ type: "assemblage.numeroter", params: { id: "a1" } }]).etat;
    expect(objet<"piece-mecanique">(e, "p-caisson").params.reference).toBe("CTA-01");
    expect(objet<"piece-mecanique">(e, "p-socle").params.numero).toBe(3);
    const t = genererTableau(e, "nomenclature");
    expect(t.lignes.length).toBe(3);
    expect(t.lignes[0]![1]).toBe(1);
    expect(t.lignes.find((l) => l[3] === "Socle")![4]).toBe("acier (déclaré)");
    const params = lireParamsVue(e, { type: "axonometrie", titre: "Éclaté CTA", echelle: 20, azimut: { value: 30, unit: "deg" }, inclinaison: { value: 35, unit: "deg" }, lignesCachees: false, eclate: { assemblageId: "a1", distance: 1.5 } });
    expect(params.eclate).toEqual({ assemblageId: "a1", distance: 1.5 });
    const vue = genererVue(e, params);
    const textes = vue.primitives.filter((p) => p.type === "texte").map((p) => (p as { texte: string }).texte);
    expect(textes).toEqual(expect.arrayContaining(["1", "2", "3"]));
    expect(vue.avertissements.some((a) => /Éclaté/.test(a))).toBe(true);
    expect(() => lireParamsVue(e, { type: "plan", titre: "x", echelle: 100, niveauId: "n1", eclate: { assemblageId: "a1", distance: 1 } })).toThrow(/axonométrique/);
    const ifc = exporterIfc(e, { projet: { id: "proj", nom: "Test", code: "T" }, revision: 1, horodatage: "2026-10-08T00:00:00Z" });
    expect(ifc.contenu).toContain("IFCELEMENTASSEMBLY(");
    expect(ifc.contenu).toMatch(/IFCRELAGGREGATES\('[^']+',\$,\$,\$,#\d+,\(#\d+,#\d+,#\d+\)\)/);
    expect((ifc.contenu.match(/'piece-mecanique'/g) ?? []).length).toBe(3);
    expect(ifc.rapport.classes.find((c) => c.classe === "assemblage")?.ifc).toBe("IfcElementAssembly");
  });
  it("collision pièce × mur signalée (volume commun), jamais corrigée", () => {
    const e = lot(cta(), [{ type: "mur.tracer", params: { id: "m1", niveauId: "n1", a: pt(3, 6), b: pt(7, 6), epaisseur: { value: 0.2, unit: "m" }, hauteur: { value: 3, unit: "m" } } }]).etat;
    const c = collisions(e).filter((x) => x.type === "piece-batiment");
    expect(c.length).toBeGreaterThan(0);
    expect(c[0]!.objets).toContain("m1");
    expect(c[0]!.message).toMatch(/m³ en commun/);
  });
});

describe("familles, configurations, règles, catalogues", () => {
  it("expressions évaluées dans l'ordre des dépendances, configuration qui fixe une valeur, cycle refusé, règle contrôlée en problème", () => {
    const e0 = lot(base(), [{ type: "ontologie.activer", params: { nom: "mechanical" } }]).etat;
    const e1 = lot(e0, [{ type: "famille.definir", params: { id: "f1", nom: "Platine", parametres: { epaisseur: { expression: "0.02", unite: "m" }, entraxe: { expression: "epaisseur * 10", unite: "m" }, largeur: { expression: "entraxe + 2 * epaisseur", unite: "m" } }, configurations: { fine: { epaisseur: 0.01 }, forte: { epaisseur: 0.04 } } } }]).etat;
    const f = e1.definitions["f1"]!.params as never as import("./familles.js").ParamsFamille;
    expect(evaluerFamille(f)).toEqual({ epaisseur: 0.02, entraxe: 0.2, largeur: 0.24 });
    expect(evaluerFamille(f, "forte").largeur).toBeCloseTo(0.48, 9);
    const e2 = lot(e1, [{ type: "famille.configurer", params: { id: "f1", active: "fine" } }]).etat;
    expect(evaluerFamille(e2.definitions["f1"]!.params as never).largeur).toBeCloseTo(0.12, 9);
    expect(() => lot(e2, [{ type: "famille.definir", params: { id: "f2", nom: "Cycle", parametres: { a: { expression: "b + 1", unite: null }, b: { expression: "a * 2", unite: null } } } }])).toThrow(/cycle/);
    expect(() => lot(e2, [{ type: "famille.definir", params: { id: "f3", nom: "Zéro", parametres: { a: { expression: "1 / 0", unite: null } } } }])).toThrow(ErreurCommande);
    expect(controlerRegle({ expression: "largeur <= 0.2", message: "largeur bornée", familleId: null }, { largeur: 0.12 })).toBeNull();
    const e3 = lot(e2, [{ type: "regle.definir", params: { id: "r1", nom: "Largeur maximale", expression: "largeur <= 0.1", message: "la largeur dépasse la borne", familleId: "f1" } }, { type: "regles.controler", params: {} }]).etat;
    const pbs = Object.values(e3.problemes).filter((p) => p.type === "regle");
    expect(pbs.length).toBe(1);
    expect(pbs[0]!.message).toMatch(/dépasse la borne/);
    const e4 = lot(e3, [{ type: "famille.configurer", params: { id: "f1", active: null } }, { type: "famille.definir", params: { id: "f1", nom: "Platine", parametres: { epaisseur: { expression: "0.005", unite: "m" }, entraxe: { expression: "epaisseur * 10", unite: "m" }, largeur: { expression: "entraxe + 2 * epaisseur", unite: "m" } } } }, { type: "regles.controler", params: {} }]).etat;
    expect(Object.values(e4.problemes).filter((p) => p.type === "regle").length).toBe(0);
  });
  it("catalogue CSV sourcé : importé comme définition du projet, refusé dès une ligne sans source", () => {
    const e0 = lot(base(), [{ type: "ontologie.activer", params: { nom: "mechanical" } }]).etat;
    const csv = "designation;diametre_mm;source;edition;page\nM8;8;Catalogue X;2024;p. 3\nM10;10;Catalogue X;2024;p. 3\n";
    const e1 = lot(e0, [{ type: "catalogue.importer", params: { id: "cat-1", nom: "Visserie", ontologie: "mechanical", csv } }]).etat;
    const d = e1.definitions["cat-1"]!;
    expect(d.classe).toBe("catalogue");
    expect((d.params["lignes"] as unknown[]).length).toBe(2);
    expect(() => lot(e0, [{ type: "catalogue.importer", params: { nom: "Visserie", csv: csv + "M12;12;;2024;p. 4\n" } }])).toThrow(/ligne 4/);
  });
});

describe("solveur : cas de référence du banc P2-0 (D-178)", () => {
  it("pivot : concentrique + plan + angle 30°, bien contraint ; distance seule : sous-contraint", () => {
    const r = resoudre([{ id: "bati", fixe: true, pose: { t: [0, 0, 0], w: [0, 0, 0] } }, { id: "bras", fixe: false, pose: { t: [0.2, 0.2, 0.2], w: [0, 0, 0] } }], [
      { type: "concentrique", a: "bati", b: "bras", pa: [0, 0, 0], da: [0, 0, 1], pb: [0, 0, 0], db: [0, 0, 1] },
      { type: "plan", a: "bati", b: "bras", pa: [0, 0, 0], da: [0, 0, 1], pb: [0, 0, 0] },
      { type: "angle", a: "bati", b: "bras", da: [1, 0, 0], db: [1, 0, 0], deg: 30 },
    ]);
    expect(r.diagnostic).toBe("bien contraint");
    expect(r.residu).toBeLessThan(5e-6);
    const r2 = resoudre([{ id: "bati", fixe: true, pose: { t: [0, 0, 0], w: [0, 0, 0] } }, { id: "p", fixe: false, pose: { t: [0.5, 0.5, 0.5], w: [0, 0, 0] } }], [{ type: "distance", a: "bati", b: "p", pa: [0, 0, 0], pb: [0, 0, 0], d: 1 }]);
    expect(r2.diagnostic).toBe("résolu, sous-contraint");
    expect(r2.ddlRestants).toBe(5);
    const r3 = resoudre([{ id: "bati", fixe: true, pose: { t: [0, 0, 0], w: [0, 0, 0] } }, { id: "p", fixe: false, pose: { t: [0.5, 0, 0], w: [0, 0, 0] } }], [{ type: "distance", a: "bati", b: "p", pa: [0, 0, 0], pb: [0, 0, 0], d: 1 }, { type: "distance", a: "bati", b: "p", pa: [0, 0, 0], pb: [0, 0, 0], d: 2 }]);
    expect(r3.diagnostic).toBe("sur-contraint incompatible");
  });
});
