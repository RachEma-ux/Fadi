import { describe, expect, it } from "vitest";
import { appliquerLot, CONTRAT_COMMANDES } from "./commandes/index.js";
import type { Commande } from "./commandes/base.js";
import { modeleVide, type ModeleAtelier, type Occurrence } from "./modele.js";
import { csvTableau, genererTableau, tableauxDisponibles } from "./documents/tableaux.js";
import { genererVue, genererVueDefinition, lireParamsVue } from "./documents/vues.js";
import { composerFeuilleDefinition } from "./documents/feuilles.js";
import { exporterIfc } from "./echanges/ifc.js";
import { dxfNiveau } from "./echanges/plan.js";
import { champObjet, texteAnnotation, texteCotation, texteEtiquette, tracerAnnotation } from "./annotations-fabrication.js";
import { coupeNuage, ErreurNuage, lireLas, lireNuage, lireXyz } from "./echanges/nuage.js";
import { m, pt } from "./unites.js";
import { designationSection } from "./ontologies/structure/sections.js";

const P3 = (x: number, y: number, z: number) => ({ x, y, z });
let n = 0;
const lot = (etat: ModeleAtelier, commands: Commande[], label = "lot") => appliquerLot(etat, { requestId: `req-p27-${++n}`, baseRevision: 0, contract: CONTRAT_COMMANDES, label, commands });
const base = () => lot(modeleVide(), [{ type: "niveau.creer", params: { id: "n1", nom: "RDC", elevation: 0, hauteur: 3 } }]).etat;
const O = <C extends Occurrence["classe"]>(etat: ModeleAtelier, id: string) => etat.objets[id] as Occurrence<C>;
const P = [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1];
const I = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7];
const IPE = { forme: "I", largeur: m(0.1), hauteur: m(0.2), epaisseur: m(0.006), epaisseurAile: m(0.009) };
const D50 = { forme: "circulaire", diametre: m(0.0603), epaisseur: m(0.0029) };

describe("annotations mécaniques et de fabrication (P2-7, DA-15-03, 08 à 16)", () => {
  it("cote mécanique : préfixe et tolérance saisis → « Ø 1000 +0,1/−0,05 » (mm) ; écarts négatifs refusés ; cote nue inchangée", () => {
    expect(texteCotation({ prefixe: "Ø", tolerance: { plus: 0.0001, moins: 0.00005 } }, 1)).toBe("Ø1000 +0,1/−0,05");
    expect(texteCotation({ prefixe: null, tolerance: { plus: 0.0002, moins: 0.0002 } }, 0.5)).toBe("500 ±0,2");
    expect(texteCotation({}, 0.5)).toBe("500");
    const e = lot(base(), [{ type: "cotation.creer", params: { id: "k", niveauId: "n1", a: pt(0, 0), b: pt(1, 0), decalage: m(0.3), prefixe: "Ø", tolerance: { plus: 0.0001, moins: 0.00005 } } }]).etat;
    expect(O<"cotation">(e, "k").params.tolerance).toEqual({ plus: 0.0001, moins: 0.00005 });
    expect(() => lot(base(), [{ type: "cotation.creer", params: { id: "x", niveauId: "n1", a: pt(0, 0), b: pt(1, 0), tolerance: { plus: -0.1, moins: 0 } } }])).toThrow(/≥ 0/);
    const vue = genererVue(e, lireParamsVue(e, { type: "plan", titre: "P", echelle: 50, niveauId: "n1" }));
    expect(vue.primitives.some((p) => p.type === "texte" && p.texte === "Ø1000 +0,1/−0,05")).toBe(true);
    const e2 = lot(base(), [{ type: "cotation.creer", params: { id: "k", niveauId: "n1", a: pt(0, 0), b: pt(1, 0) } }]).etat;
    expect(genererVue(e2, lireParamsVue(e2, { type: "plan", titre: "P", echelle: 50, niveauId: "n1" })).primitives.some((p) => p.type === "texte" && p.texte === "1,00")).toBe(true);
  });
  it("étiquette intelligente : gabarit {repere} · {section} · {longueur} lu sur la poutre ; champ absent « non évalué » ; champ inconnu refusé ; gabarit sans objet refusé", () => {
    const e = lot(base(), [
      { type: "ontologie.activer", params: { nom: "structure" } },
      { type: "poutre.creer", params: { id: "b1", niveauId: "n1", nom: "P1", a: pt(0, 0), b: pt(6, 0), za: 2.8, section: IPE, materiau: "acier" } },
      { type: "etiquette.creer", params: { id: "et", niveauId: "n1", position: pt(3, 1), objetId: "b1", champ: "{nom} · {section} · {longueur} · {repere}" } },
    ]).etat;
    const t = texteEtiquette(e, O<"etiquette">(e, "et"));
    expect(t.startsWith(`P1 · ${designationSection(IPE as never)} · `)).toBe(true);
    expect(t).toContain("6 m");
    expect(t.endsWith("non évalué") || t.endsWith("· non évalué")).toBe(true);
    expect(champObjet(e, e.objets["b1"]!, "classe")).toBe("Élément de structure");
    expect(champObjet(e, e.objets["b1"]!, "niveau")).toBe("RDC");
    expect(() => lot(e, [{ type: "etiquette.creer", params: { id: "x", niveauId: "n1", position: pt(0, 0), objetId: "b1", champ: "{masse}" } }])).toThrow(/inconnu/);
    expect(() => lot(e, [{ type: "etiquette.creer", params: { id: "x", niveauId: "n1", position: pt(0, 0), champ: "{nom}" } }])).toThrow(/objetId/);
    const vue = genererVue(e, lireParamsVue(e, { type: "plan", titre: "P", echelle: 50, niveauId: "n1" }));
    expect(vue.primitives.some((p) => p.type === "texte" && p.texte === t)).toBe(true);
    expect(vue.objets).toContain("b1");
    expect(dxfNiveau(e, "n1")).toContain("P1 · Profilé I 100");
  });
  it("tolérance géométrique, soudure, état de surface, symbole spécialiste : textes dérivés, symboles tracés en primitives, refus nommés", () => {
    const e = lot(base(), [
      { type: "annotationFabrication.creer", params: { id: "tg", niveauId: "n1", type: "tolerance-geometrique", caracteristique: "parallelisme", valeur: m(0.00005), references: ["A"], position: pt(1, 1), attache: pt(0, 0) } },
      { type: "annotationFabrication.creer", params: { id: "sd", niveauId: "n1", type: "soudure", cordon: "angle", taille: m(0.005), longueur: m(0.1), cote: "deux-cotes", peripherique: true, chantier: true, procede: "135 (déclaré)", position: pt(2, 2), attache: pt(2, 3), z: 1.2 } },
      { type: "annotationFabrication.creer", params: { id: "es", niveauId: "n1", type: "etat-de-surface", parametre: "Ra", valeur: 3.2, procede: "fraisé", position: pt(3, 3) } },
      { type: "annotationFabrication.creer", params: { id: "sp", niveauId: "n1", type: "specialiste", famille: "Contrôle", texte: "CND 100 %", position: pt(4, 4) } },
    ]).etat;
    expect(texteAnnotation(O<"annotation-fabrication">(e, "tg").params)).toBe("∥ 0,05 | A");
    expect(texteAnnotation(O<"annotation-fabrication">(e, "sd").params)).toBe("Angle a5 × 100 (deux côtés) périphérique chantier 135 (déclaré)");
    expect(texteAnnotation(O<"annotation-fabrication">(e, "es").params)).toBe("Ra 3,2 µm fraisé");
    expect(texteAnnotation(O<"annotation-fabrication">(e, "sp").params)).toBe("Contrôle : CND 100 %");
    const trace = { lignes: 0, cadres: 0, textes: [] as string[] };
    tracerAnnotation({ ligne: () => trace.lignes++, cadre: () => trace.cadres++, texte: (_p, t) => trace.textes.push(t) }, O<"annotation-fabrication">(e, "tg").params, 0.15);
    expect(trace.cadres).toBe(3); // symbole | valeur | A
    expect(trace.lignes).toBe(3); // ligne de repère + flèche
    expect(trace.textes).toEqual(["∥", "0,05", "A"]);
    const vue = genererVue(e, lireParamsVue(e, { type: "plan", titre: "P", echelle: 50, niveauId: "n1" }));
    expect(vue.primitives.filter((p) => p.objetId === "sd").length).toBeGreaterThan(6);
    expect(vue.primitives.some((p) => p.type === "texte" && p.texte === "Ra 3,2 µm fraisé")).toBe(true);
    // Annotation 3D (z déclaré) : retenue par la vue axonométrique.
    const axo = genererVue(e, lireParamsVue(e, { type: "axonometrie", titre: "A", echelle: 50, azimut: { value: 30, unit: "deg" }, inclinaison: { value: 30, unit: "deg" } }));
    expect(axo.objets).toContain("sd");
    expect(axo.objets).not.toContain("tg");
    expect(() => lot(base(), [{ type: "annotationFabrication.creer", params: { id: "x", niveauId: "n1", type: "tolerance-geometrique", caracteristique: "position", valeur: m(0.1), references: ["a1"], position: pt(0, 0) } }])).toThrow(/lettres de référence/);
    expect(() => lot(base(), [{ type: "annotationFabrication.creer", params: { id: "x", niveauId: "n1", type: "etat-de-surface", parametre: "Ra", valeur: 0, position: pt(0, 0) } }])).toThrow(/> 0/);
    const e2 = lot(e, [{ type: "transformer.deplacer", params: { dx: 1, dy: 0 }, cibles: ["tg"] }]).etat;
    expect(O<"annotation-fabrication">(e2, "tg").params.attache).toEqual(pt(1, 0));
    const ifc = exporterIfc(e, { projet: { id: "p", nom: "A", code: "A" }, revision: 1, horodatage: new Date(0).toISOString() });
    expect(ifc.contenu).toContain(".SYMBOL.");
    expect(ifc.contenu).toContain("fabrication:soudure");
    expect(ifc.contenu).toContain("Ra 3,2 \\X2\\00B5\\X0\\m fraisé".slice(0, 6));
  });
});

describe("tableaux de production (P2-7, DA-15-18, DA-16-09, DA-16-16) et feuilles gabarits (DA-14-13 à 15)", () => {
  const scene = () => lot(base(), [
    { type: "ontologie.activer", params: { nom: "structure" } },
    { type: "ontologie.activer", params: { nom: "timber" } },
    { type: "ontologie.activer", params: { nom: "mep" } },
    { type: "poutre.creer", params: { id: "b1", niveauId: "n1", nom: "P1", a: pt(0, 0), b: pt(6, 0), za: 2.8, section: IPE, materiau: "acier" } },
    { type: "poutre.creer", params: { id: "b2", niveauId: "n1", nom: "P2", a: pt(0, 2), b: pt(6, 2), za: 2.8, section: IPE, materiau: "acier" } },
    { type: "poutre.creer", params: { id: "b3", niveauId: "n1", nom: "P3", a: pt(0, 4), b: pt(4, 4), za: 2.8, section: IPE, materiau: "acier" } },
    { type: "plaque.creer", params: { id: "pl1", niveauId: "n1", nom: "Dalle", contour: [pt(0, 0), pt(1, 0), pt(1, 1), pt(0, 1)], trous: [], epaisseur: m(0.2), z: 3, materiau: "beton" } },
    { type: "armature.creer", params: { id: "ar1", niveauId: "n1", nom: "C1", hoteId: "pl1", forme: "cadre", diametre: m(0.01), points: [pt(0.05, 0.05), pt(0.45, 0.05), pt(0.45, 0.45), pt(0.05, 0.45)], z: 3.01, nombre: 4, espacement: m(0.1), nuance: "B500B (déclarée)" } },
    { type: "armature.creer", params: { id: "ar2", niveauId: "n1", nom: "F1", hoteId: "pl1", forme: "droite", diametre: m(0.012), points: [pt(0, 0.5), pt(1, 0.5)], z: 3.02, nombre: 5, espacement: m(0.15), nuance: "B500B (déclarée)" } },
    { type: "segmentReseau.creer", params: { id: "s1", niveauId: "n1", nom: "EF 1", repere: "EF-01", systeme: "tuyau", sommets: [P3(0, 6, 2.5), P3(4, 6, 2.5)], section: D50, fluide: "eau froide" } },
    { type: "segmentReseau.creer", params: { id: "s2", niveauId: "n1", nom: "EF 2", repere: "EF-02", systeme: "tuyau", sommets: [P3(4, 6, 2.5), P3(4, 6, 0.5)], section: D50, fluide: "eau froide" } },
    { type: "vanne.creer", params: { id: "v1", niveauId: "n1", nom: "V1", repere: "V-01", type: "arret", position: pt(4, 6), z: 0.3, section: D50, longueur: m(0.2), fluide: "eau froide" } },
    { type: "solideExact.creer", params: { id: "se", niveauId: "n1", nom: "Platine", brep: "QlJFUA==", moteur: "occt-wasm", versionMoteur: "5.6.1", empreinteBrep: "0123456789abcdef", maillage: { positions: P, indices: I }, volume: 1, aire: 6, faces: 7, position: pt(10, 10), operation: { type: "trou", sources: ["se0"], libelle: "Trou Ø 0,02", entrees: { type: "trou", solide: { brep: "QlJFUA==" }, centre: { x: 0.5, y: 0.5, z: 1 }, direction: { x: 0, y: 0, z: -1 }, diametre: 0.02, profondeur: null } } } },
  ]).etat;
  it("18 tableaux ; perçages (trous des opérations exactes), feuille de ferraillage (segments, plis, longueur développée géométrique, allongement non évalué), liste de débit (groupée par désignation et longueur)", () => {
    expect(tableauxDisponibles()).toHaveLength(18);
    const e = scene();
    const perc = genererTableau(e, "percages");
    expect(perc.lignes).toHaveLength(1);
    expect(perc.lignes[0]!.slice(1)).toEqual(["Platine", "T1", 10.5, 10.5, 1, 20, "traversant", "(0 ; 0 ; -1)"]);
    const fer = genererTableau(e, "ferraillage");
    expect(fer.lignes.map((l) => [l[1], l[3], l[4], l[6], l[7], l[8], l[9], l[11]])).toEqual([
      ["C1", "cadre", 10, 4, "400 + 400 + 400 + 400", 4, 1.6, "non évaluée"],
      ["F1", "droite", 12, 5, "1000", 0, 1, "non évaluée"],
    ]);
    expect(fer.total![10]).toBeCloseTo(4 * 1.6 + 5 * 1, 9);
    const debit = genererTableau(e, "debit");
    const lignes = debit.lignes.map((l) => `${l[0]}|${l[1]}|${l[2]}|${l[3]}`);
    expect(lignes).toContain(`structure|${designationSection(IPE as never)}|2|6`);
    expect(lignes).toContain(`structure|${designationSection(IPE as never)}|1|4`);
    expect(lignes.some((l) => l.startsWith("réseau tuyau|") && l.endsWith("|1|4"))).toBe(true);
    expect(csvTableau(debit)).toContain("P1, P2");
    expect(csvTableau(fer)).toContain("B500B");
  });
  it("vue isométrique de tuyauterie : trait unique, repère, section et longueur portés, sans objet du bâtiment ; vue sans réseau avertie", () => {
    const e = scene();
    const iso = genererVue(e, lireParamsVue(e, { type: "isometrique", titre: "Iso EF", echelle: 50 }));
    expect(iso.objets.sort()).toEqual(["s1", "s2", "v1"]);
    expect(iso.primitives.filter((p) => p.type === "ligne" && p.objetId === "s1")).toHaveLength(1);
    expect(iso.primitives.some((p) => p.type === "texte" && p.texte.includes("EF-01") && p.texte.includes("Tube") === false && p.texte.includes("4,00 m"))).toBe(true);
    expect(iso.primitives.some((p) => p.type === "poly" && p.objetId === "v1")).toBe(true);
    // Le tronçon vertical s2 (4 ; 6 ; 2,5 → 4 ; 6 ; 0,5) se projette verticalement : même x, Δy = 2.
    const l2 = iso.primitives.find((p) => p.type === "ligne" && p.objetId === "s2");
    expect(l2 && l2.type === "ligne" ? Math.abs(l2.a.x - l2.b.x) : 1).toBeLessThan(1e-9);
    expect(l2 && l2.type === "ligne" ? Math.abs(l2.a.y - l2.b.y) : 0).toBeCloseTo(2, 9);
    const vide = genererVue(base(), lireParamsVue(base(), { type: "isometrique", titre: "Iso", echelle: 50 }));
    expect(vide.avertissements.some((a) => /aucun objet de réseau/.test(a))).toBe(true);
    expect(() => lot(e, [{ type: "vue.creer", params: { id: "vi", type: "isometrique", titre: "Iso", echelle: 50 } }])).not.toThrow();
  });
  it("feuille gabarit « production béton » : vue plan + nomenclatures armatures et ferraillage posées sur un A1 ; « isométrique » : vue isométrique + nomenclature de réseau ; niveau requis sauf isométrique", () => {
    const e = lot(scene(), [{ type: "feuille.gabarit", params: { gabarit: "production-beton", niveauId: "n1", id: "f-beton", vueId: "v-beton" } }, { type: "feuille.gabarit", params: { gabarit: "isometrique", id: "f-iso", vueId: "v-iso", titre: "Iso EF" } }]).etat;
    const f = e.definitions["f-beton"]!;
    expect(f.classe).toBe("feuille");
    expect(f.nom).toMatch(/PRO-01 · Plan de production béton — RDC/);
    expect((f.params as { tableaux: { type: string }[] }).tableaux.map((t) => t.type)).toEqual(["armatures", "ferraillage"]);
    expect((f.params as { format: string }).format).toBe("A1");
    expect(genererVueDefinition(e, "v-beton")!.params.type).toBe("plan");
    expect(genererVueDefinition(e, "v-iso")!.params.type).toBe("isometrique");
    expect((e.definitions["f-iso"]!.params as { tableaux: { type: string }[] }).tableaux.map((t) => t.type)).toEqual(["reseau"]);
    const feuille = composerFeuilleDefinition(e, "f-beton", 1, { nom: "Projet", code: "P" });
    expect(feuille).not.toBeNull();
    expect(feuille!.avertissements.filter((a) => /absente/.test(a))).toHaveLength(0);
    expect(feuille!.primitives.some((p) => p.type === "texte" && /B500B|C1/.test(p.texte))).toBe(true);
    expect(() => lot(scene(), [{ type: "feuille.gabarit", params: { gabarit: "ferraillage" } }])).toThrow(/niveauId requis/);
  });
});

describe("nuages de points (P2-7, DA-22-07 à 10) : lecture LAS / XYZ, décimation, refus E57 / LAZ, classe, tranche, transformation", () => {
  function las(points: { x: number; y: number; z: number }[], scale = 0.001, offset = { x: 100, y: 200, z: 0 }): Uint8Array {
    const header = 227, rec = 20;
    const buf = new Uint8Array(header + points.length * rec);
    const dv = new DataView(buf.buffer);
    buf.set([0x4c, 0x41, 0x53, 0x46], 0);
    buf[24] = 1; buf[25] = 2;
    dv.setUint16(94, header, true);
    dv.setUint32(96, header, true);
    buf[104] = 0;
    dv.setUint16(105, rec, true);
    dv.setUint32(107, points.length, true);
    dv.setFloat64(131, scale, true); dv.setFloat64(139, scale, true); dv.setFloat64(147, scale, true);
    dv.setFloat64(155, offset.x, true); dv.setFloat64(163, offset.y, true); dv.setFloat64(171, offset.z, true);
    points.forEach((p, i) => { const o = header + i * rec; dv.setInt32(o, Math.round((p.x - offset.x) / scale), true); dv.setInt32(o + 4, Math.round((p.y - offset.y) / scale), true); dv.setInt32(o + 8, Math.round((p.z - offset.z) / scale), true); });
    return buf;
  }
  it("LAS 1.2 format 0 : points × échelle + décalage, décimation régulière au-delà du plafond, bornes ; XYZ / PTS texte ; E57 et LAZ refusés nommément", () => {
    const pts = Array.from({ length: 1000 }, (_, i) => ({ x: 100 + i * 0.01, y: 200 + (i % 10) * 0.5, z: (i % 7) * 0.3 }));
    const lu = lireLas(las(pts));
    expect(lu.format).toBe("las");
    expect(lu.version).toBe("1.2");
    expect(lu.nombrePoints).toBe(1000);
    expect(lu.points).toHaveLength(1000);
    expect(lu.points[3]).toEqual({ x: 100.03, y: 201.5, z: 0.9 });
    expect(lu.bornes.max.x).toBeCloseTo(109.99, 9);
    const dec = lireLas(las(pts), 100);
    expect(dec.pas).toBe(10);
    expect(dec.points).toHaveLength(100);
    expect(dec.avertissements[0]).toMatch(/un point sur 10/);
    const xyz = lireXyz("# relevé\n1 2 3\n4;5;6;255 0 0\n7,8,9\n");
    expect(xyz.points).toEqual([P3(1, 2, 3), P3(4, 5, 6), P3(7, 8, 9)]);
    expect(lireXyz("2\n1 2 3\n4 5 6\n").format).toBe("pts");
    expect(() => lireNuage("releve.e57", new Uint8Array([1, 2, 3, 4, 5]))).toThrow(ErreurNuage);
    expect(() => lireNuage("releve.e57", new Uint8Array([1, 2, 3, 4, 5]))).toThrow(/E57/);
    expect(() => lireNuage("releve.laz", new Uint8Array([1, 2, 3, 4, 5]))).toThrow(/LAZ/);
    expect(() => lireLas(new Uint8Array(300))).toThrow(/LASF/);
    expect(lireNuage("x.las", las(pts.slice(0, 3))).points).toHaveLength(3);
    expect(coupeNuage(lu.points, 0.9, 0.2)).toHaveLength(Math.floor(1000 / 7) + (1000 % 7 > 3 ? 1 : 0));
  });
  it("classe nuage-de-points : origine explicite requise, échantillon borné, tranche dessinée dans le plan derrière le modèle, déplacement en plan, IFC omis (déclaré)", () => {
    const pts = Array.from({ length: 50 }, (_, i) => P3(i * 0.1, (i % 5) * 0.2, i % 2 === 0 ? 1.2 : 2.6));
    expect(() => lot(base(), [{ type: "nuageDePoints.creer", params: { id: "nu", niveauId: "n1", nom: "Relevé", source: "releve.las", format: "las", nombrePoints: 50000, pas: 1000, points: pts } }])).toThrow(/origine/);
    const e = lot(base(), [{ type: "nuageDePoints.creer", params: { id: "nu", niveauId: "n1", nom: "Relevé", source: "releve.las", format: "las", nombrePoints: 50000, pas: 1000, points: pts, origine: { x: 1000, y: 2000, z: 100 }, coupeZ: 1.2, epaisseurCoupe: m(0.1) } }]).etat;
    const nu = O<"nuage-de-points">(e, "nu");
    expect(nu.params.bornes.max.x).toBeCloseTo(4.9, 9);
    expect(nu.params.coupeZ).toBe(1.2);
    const vue = genererVue(e, lireParamsVue(e, { type: "plan", titre: "P", echelle: 50, niveauId: "n1" }));
    expect(vue.primitives.filter((p) => p.objetId === "nu" && p.type === "ligne")).toHaveLength(25 * 2); // 25 points à z = 1,2, deux traits par croix
    expect(vue.avertissements.some((a) => /Nuage « Relevé » : 25 point/.test(a))).toBe(true);
    const e2 = lot(e, [{ type: "transformer.deplacer", params: { dx: 10, dy: 0 }, cibles: ["nu"] }]).etat;
    expect(O<"nuage-de-points">(e2, "nu").params.points[0]).toEqual(P3(10, 0, 1.2));
    expect(O<"nuage-de-points">(e2, "nu").params.origine.x).toBe(990);
    const ifc = exporterIfc(e, { projet: { id: "p", nom: "A", code: "A" }, revision: 1, horodatage: new Date(0).toISOString() });
    expect(ifc.rapport.classes.find((c) => c.classe === "nuage-de-points")?.cible).toBe(0);
    expect(() => lot(base(), [{ type: "nuageDePoints.creer", params: { id: "x", niveauId: "n1", nom: "R", source: "r.xyz", format: "xyz", nombrePoints: 2, points: pts, origine: { x: 0, y: 0, z: 0 } } }])).toThrow(/dépasser/);
  });
});
