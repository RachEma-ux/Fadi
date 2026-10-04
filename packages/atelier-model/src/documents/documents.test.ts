import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CONTRAT_COMMANDES, appliquerLot, type Commande, type Enveloppe } from "../commandes/index.js";
import { importerModeleNatif, type JeuNatif } from "../import/natif.js";
import { modeleVide, objetsDeClasse, type ModeleAtelier } from "../modele.js";
import type { Maillage } from "../projection/maillage.js";
import { referenceExtremite } from "../references.js";
import { m, pt } from "../unites.js";
import { composerFeuilleDefinition, positionLibre, type ParamsFeuille } from "./feuilles.js";
import { csvTableau, genererTableau, rapportQuantitesHtml } from "./tableaux.js";
import { pdfFeuille } from "./rendu-pdf.js";
import { svgFeuille, svgVue } from "./rendu-svg.js";
import { dxfFeuille, dxfVue } from "./rendu-dxf.js";
import { genererVue, genererVueDefinition, HAUTEUR_COUPE_DEFAUT, type ParamsVue } from "./vues.js";
import { contoursUnion, projeterMaillages, type Camera } from "./visibilite.js";

const lot = (commands: Commande[], requestId = "req", baseRevision = 0): Enveloppe => ({ requestId, baseRevision, contract: CONTRAT_COMMANDES, label: "test", commands });
const JEU = JSON.parse(readFileSync(new URL("../../../../apps/api/src/data/examples/p118-native-model.json", import.meta.url), "utf8")) as JeuNatif;
const P118 = importerModeleNatif(JEU).modele;

/** Boîte alignée sur les axes en maillage pur (12 triangles). */
function boite(objetId: string, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Maillage {
  const p = [
    [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
    [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1],
  ].flat();
  const q = (a: number, b: number, c: number, d: number) => [a, b, c, a, c, d];
  const indices = [...q(0, 3, 2, 1), ...q(4, 5, 6, 7), ...q(0, 1, 5, 4), ...q(1, 2, 6, 5), ...q(2, 3, 7, 6), ...q(3, 0, 4, 7)];
  return { objetId, classe: "solide", niveauId: null, positions: p, indices, couleur: "#000", opacite: 1 };
}

// Regard vers le nord (+y), droite = est (+x), haut = z : abscisse = x, ordonnée = z, profondeur = y.
const NORD: Camera = { origine: [0, 0, 0], regard: [0, 1, 0], droite: [1, 0, 0], haut: [0, 0, 1] };
const sur = (segs: { a: { x: number; y: number }; b: { x: number; y: number }; objetId: string }[], id: string, y: number) =>
  segs
    .filter((s) => s.objetId === id && Math.abs(s.a.y - y) < 1e-9 && Math.abs(s.b.y - y) < 1e-9)
    .map((s) => [Math.min(s.a.x, s.b.x), Math.max(s.a.x, s.b.x)])
    .sort((u, v) => u[0]! - v[0]!);

describe("visibilité par faces (DA-01-12)", () => {
  it("prisme A devant prisme B : l'arête basse de B est cachée sur [1 ; 2], visible sur [2 ; 3] ; son arête haute reste entière", () => {
    const A = boite("A", 0, 0, 0, 2, 1, 1);
    const B = boite("B", 1, 3, 0, 3, 4, 2);
    const r = projeterMaillages([A, B], NORD, { coupe: false, profondeurMax: null, lignesCachees: true });
    expect(sur(r.vues, "B", 0)).toEqual([[2, 3]]);
    // Parties cachées sur la ligne z = 0 : l'arête avant de B derrière A ([1 ; 2]) et son arête arrière derrière B lui-même.
    expect(sur(r.cachees, "B", 0)).toContainEqual([1, 2]);
    expect(sur(r.cachees, "B", 0)).toContainEqual([1, 3]);
    expect(sur(r.vues, "B", 2)).toEqual([[1, 3]]);
    // Arête verticale de B en x = 1 : cachée jusqu'à z = 1 (hauteur de A), visible au-dessus.
    const vert = r.vues.filter((s) => s.objetId === "B" && Math.abs(s.a.x - 1) < 1e-9 && Math.abs(s.b.x - 1) < 1e-9).map((s) => [Math.min(s.a.y, s.b.y), Math.max(s.a.y, s.b.y)]);
    expect(vert).toEqual([[1, 2]]);
  });

  it("faces coplanaires : deux boîtes accolées ne se cachent pas leurs arêtes communes", () => {
    const r = projeterMaillages([boite("A", 0, 0, 0, 1, 1, 1), boite("B", 1, 0, 0, 2, 1, 1)], NORD, { coupe: false, profondeurMax: null, lignesCachees: false });
    expect(sur(r.vues, "A", 1)).toEqual([[0, 1]]);
    expect(sur(r.vues, "B", 1)).toEqual([[1, 2]]);
  });

  it("une ouverture dans un mur laisse voir ce qui est derrière, le reste est caché", () => {
    // Mur percé (deux trumeaux, une allège, un linteau) devant une boîte.
    const mur = [boite("M", 0, 0, 0, 1, 0.2, 3), boite("M", 2, 0, 0, 3, 0.2, 3), boite("M", 1, 0, 0, 2, 0.2, 1), boite("M", 1, 0, 2, 2, 0.2, 3)];
    const derriere = boite("D", 0.5, 2, 0.5, 2.5, 3, 2.5);
    const r = projeterMaillages([...mur, derriere], NORD, { coupe: false, profondeurMax: null, lignesCachees: false });
    // Arête basse de D (z = 0,5) entièrement derrière le mur plein : cachée ; son arête haute (z = 2,5) aussi.
    expect(sur(r.vues, "D", 0.5)).toEqual([]);
    expect(sur(r.vues, "D", 2.5)).toEqual([]);
    // Arêtes verticales de D vues dans la baie (x = 0,5 et 2,5 sont derrière les trumeaux) : aucune ; l'intérieur de la baie ne montre que des faces.
    expect(r.vues.filter((s) => s.objetId === "D").length).toBe(0);
    // Avec une boîte plus étroite que la baie, ses arêtes verticales apparaissent entre z = 1 et z = 2.
    const etroite = boite("E", 1.2, 2, 0.5, 1.8, 3, 2.5);
    const r2 = projeterMaillages([...mur, etroite], NORD, { coupe: false, profondeurMax: null, lignesCachees: false });
    const v = r2.vues.filter((s) => s.objetId === "E" && Math.abs(s.a.x - 1.2) < 1e-9 && Math.abs(s.b.x - 1.2) < 1e-9).map((s) => [Math.min(s.a.y, s.b.y), Math.max(s.a.y, s.b.y)]);
    expect(v).toEqual([[1, 2]]);
  });

  it("contours de l'union : deux rectangles qui se recouvrent donnent un seul contour, sans trait intérieur", () => {
    const rect = (x0: number, y0: number, x1: number, y1: number) => [pt(x0, y0), pt(x1, y0), pt(x1, y1), pt(x0, y1)];
    const segs = contoursUnion([{ points: rect(0, 0, 4, 0.2), objetId: "a" }, { points: rect(3.8, 0, 4, 3), objetId: "b" }]);
    const longueur = segs.reduce((s, q) => s + Math.hypot(q.b.x - q.a.x, q.b.y - q.a.y), 0);
    // Périmètre du L : 4 + 3 + 0,2 + 2,8 + 3,8 + 0,2 = 14.
    expect(longueur).toBeCloseTo(14, 9);
  });
});

const VUE: ParamsVue = { type: "plan", titre: "Plan", echelle: 100, niveauId: "rdc", hauteurCoupe: null, ligneA: null, ligneB: null, profondeur: null, orientation: null, cadreMin: null, cadreMax: null, lignesCachees: false, phases: null };

describe("vues du P.118", () => {
  it("plan du RDC : murs coupés en poché, symboles de portes, convention signalée, reproductible octet pour octet", () => {
    const v1 = genererVue(P118, VUE);
    const v2 = genererVue(P118, VUE);
    expect(svgVue(v1, 7)).toBe(svgVue(v2, 7));
    expect(v1.empreinte).toBe(v2.empreinte);
    const poches = v1.primitives.filter((p) => p.type === "poly" && p.remplissage === "poche");
    expect(poches.length).toBeGreaterThan(30);
    const portes = objetsDeClasse(P118, "porte", "rdc");
    expect(new Set(v1.primitives.filter((p) => p.objetId && portes.some((d) => d.id === p.objetId)).map((p) => p.objetId)).size).toBe(portes.length);
    expect(v1.avertissements.some((a) => /Sens d'ouverture des portes non renseigné/.test(a))).toBe(true);
    expect(v1.avertissements.some((a) => a.includes(`${HAUTEUR_COUPE_DEFAUT.toFixed(2).replace(".", ",")} m`))).toBe(true);
    expect(v1.objets).toContain(portes[0]!.id);
  });

  it("coupe, façade et plan de masse : non vides ; la masse convertit la parcelle du cadastre au repère local", () => {
    const coupe = genererVue(P118, { ...VUE, type: "coupe", niveauId: null, ligneA: pt(-30, 5), ligneB: pt(30, 5) });
    expect(coupe.primitives.some((p) => p.type === "poly" && p.remplissage === "poche")).toBe(true);
    expect(coupe.bornes!.max.y).toBeGreaterThan(13);
    const facade = genererVue(P118, { ...VUE, type: "facade", niveauId: null, orientation: "sud" });
    expect(facade.primitives.filter((p) => p.type === "ligne").length).toBeGreaterThan(200);
    const masse = genererVue(P118, { ...VUE, type: "masse", niveauId: null, echelle: 500 });
    const parcelle = P118.site.parcelle!;
    const poly = masse.primitives.find((p) => p.type === "poly" && p.trait === "site");
    expect(poly && poly.type === "poly" ? poly.points[0] : null).toEqual({ x: parcelle.sommets[0]!.cadastral.x - parcelle.origineLocale.x, y: parcelle.sommets[0]!.cadastral.y - parcelle.origineLocale.y });
  });

  it("fraîcheur : l'empreinte d'un plan change avec un mur de son niveau, pas avec un objet d'un autre niveau", () => {
    const avant = genererVue(P118, VUE).empreinte;
    const murRdc = objetsDeClasse(P118, "mur", "rdc")[0]!;
    const murR3 = objetsDeClasse(P118, "mur", "r3")[0]!;
    const ici = appliquerLot(P118, lot([{ type: "objet.modifier", params: { id: murRdc.id, params: { epaisseur: m(0.31) } } }])).etat;
    const ailleurs = appliquerLot(P118, lot([{ type: "objet.modifier", params: { id: murR3.id, params: { epaisseur: m(0.31) } } }])).etat;
    expect(genererVue(ici, VUE).empreinte).not.toBe(avant);
    expect(genererVue(ailleurs, VUE).empreinte).toBe(avant);
  });
});

function petitProjet(): ModeleAtelier {
  return appliquerLot(modeleVide(), lot([
    { type: "niveau.creer", params: { id: "rdc", nom: "RDC", elevation: 0, hauteur: 3 } },
    { type: "mur.tracer", params: { id: "w", niveauId: "rdc", a: pt(0, 0), b: pt(6, 0), epaisseur: m(0.2), hauteur: m(3) } },
    { type: "cotation.creer", params: { id: "c", niveauId: "rdc", a: pt(0, 0), b: pt(6, 0), decalage: m(1) } },
    { type: "cotation.rattacher", params: { id: "c", referenceId: referenceExtremite("c", "a"), objetId: "w", caracteristique: "arete-debut" } },
    { type: "cotation.rattacher", params: { id: "c", referenceId: referenceExtremite("c", "b"), objetId: "w", caracteristique: "arete-fin" } },
  ], "socle")).etat;
}

describe("annotations attachées par références", () => {
  it("une cote rattachée suit le mur ; après scission du mur elle est « à réparer » dans le plan", () => {
    let etat = petitProjet();
    etat = appliquerLot(etat, lot([{ type: "objet.modifier", params: { id: "w", params: { b: pt(8, 0) } } }], "allonger")).etat;
    const v = genererVue(etat, VUE);
    expect(v.primitives.some((p) => p.type === "texte" && p.texte === "8,00")).toBe(true);
    etat = appliquerLot(etat, lot([{ type: "mur.scinder", params: { id: "w", t: 0.5 } }], "scinder")).etat;
    const v2 = genererVue(etat, VUE);
    expect(v2.primitives.some((p) => p.type === "texte" && /à réparer/.test(p.texte) && p.trait === "a-reparer")).toBe(true);
    expect(v2.primitives.filter((p) => p.objetId === "c" && p.type === "ligne").every((p) => p.type === "ligne" && p.trait === "a-reparer")).toBe(true);
  });
});

describe("commandes des vues et des feuilles", () => {
  it("crée, place, refuse la suppression d'une vue placée, annule par l'inverse", () => {
    const etat0 = petitProjet();
    expect(() => appliquerLot(etat0, lot([{ type: "vue.creer", params: { type: "plan", titre: "Plan", echelle: 50 } }]))).toThrow(/niveauId requis/);
    const r = appliquerLot(etat0, lot([
      { type: "vue.creer", params: { id: "v1", type: "plan", titre: "Plan RDC", echelle: 50, niveauId: "rdc" } },
      { type: "feuille.creer", params: { id: "f1", titre: "Plans", numero: "A-101", format: "A3", orientation: "paysage" } },
      { type: "feuille.placer", params: { id: "f1", vueId: "v1", x: 150, y: 180 } },
    ], "docs"));
    expect((r.etat.definitions["f1"]!.params as unknown as ParamsFeuille).vues).toEqual([{ vueId: "v1", x: 150, y: 180 }]);
    expect(() => appliquerLot(r.etat, lot([{ type: "vue.supprimer", params: { id: "v1" } }]))).toThrow(/placée sur 1 feuille/);
    const sup = appliquerLot(r.etat, lot([{ type: "vue.supprimer", params: { id: "v1", retirerDesFeuilles: true } }], "sup"));
    expect(sup.etat.definitions["v1"]).toBeUndefined();
    expect((sup.etat.definitions["f1"]!.params as unknown as ParamsFeuille).vues).toEqual([]);
    const retour = appliquerLot(sup.etat, lot([sup.inverse], "inv"));
    expect(retour.etat.definitions).toEqual(r.etat.definitions);
    expect(() => appliquerLot(r.etat, lot([{ type: "feuille.placer", params: { id: "f1", vueId: "v1", x: 900, y: 10 } }]))).toThrow(/x/);
  });

  it("feuille : composition, cartouche avec révision et empreinte, PDF et DXF reproductibles", () => {
    const etat = appliquerLot(P118, lot([
      { type: "vue.creer", params: { id: "v1", type: "plan", titre: "Plan du RDC", echelle: 200, niveauId: "rdc" } },
      { type: "vue.creer", params: { id: "v2", type: "facade", titre: "Façade sud", echelle: 200, orientation: "sud" } },
      { type: "feuille.creer", params: { id: "f1", titre: "Plan et façade", numero: "A-101", format: "A3", orientation: "paysage", vues: [{ vueId: "v1", x: 120, y: 170 }, { vueId: "v2", x: 300, y: 200 }] } },
    ], "f")).etat;
    const projet = { nom: "Escalier B et mezzanine", code: "P.118" };
    const f = composerFeuilleDefinition(etat, "f1", 12, projet)!;
    expect(f.largeur).toBe(420);
    expect(f.vues.map((v) => v.vueId)).toEqual(["v1", "v2"]);
    expect(f.primitives.some((p) => p.type === "texte" && p.texte.startsWith(`Révision du modèle 12 · empreinte ${f.empreinte}`))).toBe(true);
    const pdf = pdfFeuille(f);
    const texte = new TextDecoder("latin1").decode(pdf);
    expect(texte.startsWith("%PDF-1.4")).toBe(true);
    expect(texte).toContain("/MediaBox [0 0 1190.551 841.89]");
    const xref = Number(/startxref\n(\d+)/.exec(texte)![1]);
    expect(texte.slice(xref, xref + 4)).toBe("xref");
    expect(Buffer.from(pdfFeuille(composerFeuilleDefinition(etat, "f1", 12, projet)!)).equals(Buffer.from(pdf))).toBe(true);
    expect(svgFeuille(f)).toContain('data-empreinte="');
    const dxf = dxfFeuille(f, 12);
    expect(dxf).toContain("AC1009");
    expect(dxf).toContain("SOLID");
    expect(dxfVue(genererVueDefinition(etat, "v1")!, 12, etat.site.parcelle?.origineLocale ?? null)).toContain("cadastral (EPSG:26191) = local +");
  });

  it("position libre : une vue trouve sa place au-dessus du cartouche, une vue trop grande n'en trouve pas", () => {
    const p = positionLibre({ format: "A3", orientation: "paysage" }, [], { largeur: 100, hauteur: 80 });
    expect(p).not.toBeNull();
    expect(positionLibre({ format: "A4", orientation: "paysage" }, [], { largeur: 400, hauteur: 80 })).toBeNull();
  });
});

describe("tableaux et quantités", () => {
  it("identiques entre deux générations à la même révision ; « non évaluée » pour une valeur absente", () => {
    const a = csvTableau(genererTableau(P118, "pieces"));
    expect(csvTableau(genererTableau(P118, "pieces"))).toBe(a);
    expect(genererTableau(P118, "pieces").lignes.length).toBe(74);
    const sansHauteur = appliquerLot(petitProjet(), lot([{ type: "mur.tracer", params: { id: "w2", niveauId: "rdc", a: pt(0, 2), b: pt(3, 2), epaisseur: m(0.2) } }], "sh")).etat;
    const murs = csvTableau(genererTableau(sansHauteur, "murs"));
    expect(murs).toMatch(/"w2";"non typé";"non";3;0\.2;"non évaluée";"non évaluée"/);
    const html = rapportQuantitesHtml(P118, { nom: "Escalier B", code: "P.118" }, 3);
    expect(html).toBe(rapportQuantitesHtml(P118, { nom: "Escalier B", code: "P.118" }, 3));
    expect(html).toContain("Révision du modèle 3");
  });
});
