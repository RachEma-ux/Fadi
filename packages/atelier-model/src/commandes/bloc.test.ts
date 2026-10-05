import { describe, expect, it } from "vitest";
import { contraintesDe } from "../contraintes.js";
import { genererTableau } from "../documents/tableaux.js";
import { genererVue } from "../documents/vues.js";
import { modeleVide, type ModeleAtelier, type Occurrence } from "../modele.js";
import { geometrieToiture, maillageObjet } from "../projection/maillage.js";
import { m, pt } from "../unites.js";
import { bibliotheques, proprietesEffectives } from "./bloc.js";
import { CONTRAT_COMMANDES, appliquerLot, type Commande, type Enveloppe } from "./index.js";

const lot = (commands: Commande[], requestId = "r"): Enveloppe => ({ requestId, baseRevision: 0, contract: CONTRAT_COMMANDES, label: "test", commands });

function socle(): ModeleAtelier {
  return appliquerLot(modeleVide(), lot([
    { type: "niveau.creer", params: { id: "rdc", nom: "RDC", elevation: 0, hauteur: 3 } },
    { type: "esquisse.rectangle", params: { id: "e1", niveauId: "rdc", points: [pt(10, 10), pt(11.2, 10.8)] } },
    { type: "esquisse.cercle", params: { id: "e2", niveauId: "rdc", points: [], centre: pt(10.6, 10.4), rayon: m(0.3) } },
    { type: "texte.creer", params: { id: "t1", niveauId: "rdc", position: pt(10, 11), texte: "Table" } },
    { type: "mur.tracer", params: { id: "w", niveauId: "rdc", a: pt(0, 0), b: pt(5, 0), epaisseur: m(0.2), hauteur: m(3) } },
  ], "socle")).etat;
}

describe("blocs et composants (DA-05-06, DA-05-07, DA-05-09)", () => {
  it("définit un bloc depuis 3 objets, refuse un mur, place deux occurrences distinctes de la même définition", () => {
    const e = socle();
    expect(() => appliquerLot(e, lot([{ type: "bloc.definir", params: { id: "b", nom: "Table", cibles: ["e1", "w"], pointDeBase: pt(10, 10) } }]))).toThrow(/classe « mur » refusée/);
    const r = appliquerLot(e, lot([
      { type: "bloc.definir", params: { id: "b", nom: "Table", cibles: ["e1", "e2", "t1"], pointDeBase: pt(10, 10), bibliotheque: "Mobilier" } },
      { type: "bloc.placer", params: { id: "o1", definitionId: "b", niveauId: "rdc", position: pt(0, 5) } },
      { type: "bloc.placer", params: { id: "o2", definitionId: "b", niveauId: "rdc", position: pt(3, 5), angle: { value: 90, unit: "deg" } } },
    ], "b")).etat;
    expect(r.definitions["b"]).toMatchObject({ classe: "bloc", nom: "Table", version: 1 });
    expect((r.definitions["b"]!.params["contenu"] as unknown[]).length).toBe(3);
    expect(r.objets["o1"]!.definitionId).toBe("b");
    expect(r.objets["o2"]!.definitionId).toBe("b");
    // Plan : le contenu est dessiné à chaque occurrence (le rectangle de la première commence à (0 ; 5)).
    const v = genererVue(r, { type: "plan", titre: "P", echelle: 50, niveauId: "rdc", hauteurCoupe: null, ligneA: null, ligneB: null, profondeur: null, orientation: null, cadreMin: null, cadreMax: null, lignesCachees: false, phases: null });
    expect(v.primitives.some((p) => p.type === "poly" && p.objetId === "o1" && p.points[0]!.x === 0 && p.points[0]!.y === 5)).toBe(true);
    expect(bibliotheques(r)).toEqual([{ nom: "Mobilier", definitions: [{ id: "b", nom: "Table", nature: "bloc", version: 1, occurrences: 2 }] }]);
    expect(() => appliquerLot(r, lot([{ type: "bloc.definir", params: { id: "b2", nom: "Chaise", cibles: ["e1"], pointDeBase: pt(10, 10), bibliotheque: "mobilier" } }]))).toThrow(/seule la casse diffère/);
  });

  it("redéfinition : version + 1, les occurrences suivent et leur identité ne change pas ; l'inverse restitue la version précédente", () => {
    const e = appliquerLot(socle(), lot([
      { type: "bloc.definir", params: { id: "b", nom: "Table", cibles: ["e1"], pointDeBase: pt(10, 10) } },
      { type: "bloc.placer", params: { id: "o1", definitionId: "b", niveauId: "rdc", position: pt(0, 5) } },
    ], "b")).etat;
    const r = appliquerLot(e, lot([{ type: "bloc.definir", params: { redefinir: "b", cibles: ["e1", "e2"], pointDeBase: pt(10, 10) } }], "re"));
    expect(r.etat.definitions["b"]!.version).toBe(2);
    expect(r.effets.modifies).toContain("o1");
    expect(r.etat.objets["o1"]).toEqual(e.objets["o1"]);
    expect(appliquerLot(r.etat, lot([r.inverse], "inv")).etat.definitions["b"]).toEqual(e.definitions["b"]);
  });

  it("décomposer une occurrence : copies indépendantes placées, occurrence supprimée", () => {
    const e = appliquerLot(socle(), lot([
      { type: "bloc.definir", params: { id: "b", nom: "Table", cibles: ["e1", "t1"], pointDeBase: pt(10, 10) } },
      { type: "bloc.placer", params: { id: "o1", definitionId: "b", niveauId: "rdc", position: pt(2, 3) } },
    ], "b")).etat;
    const r = appliquerLot(e, lot([{ type: "transformer.decomposer", params: { cibles: ["o1"] } }], "dec"));
    expect(r.effets.supprimes).toEqual(["o1"]);
    expect(r.effets.crees.length).toBe(2);
    const rect = r.etat.objets[r.effets.crees[0]!] as Occurrence<"esquisse">;
    expect(rect.params.points[0]).toMatchObject({ x: 2, y: 3 });
    expect(rect.definitionId).toBeNull();
  });

  it("composant : propriétés héritées, surcharge sur l'occurrence conservée à la redéfinition, comptage par définition, nombre sans unité refusé", () => {
    const e = socle();
    expect(() => appliquerLot(e, lot([{ type: "bloc.definir", params: { nom: "Lavabo", nature: "composant", cibles: ["e2"], pointDeBase: pt(10.6, 10.4), proprietes: { debit: { valeur: 12 } } } }]))).toThrow(/sans unité/);
    let r = appliquerLot(e, lot([
      { type: "bloc.definir", params: { id: "c", nom: "Lavabo", nature: "composant", cibles: ["e2"], pointDeBase: pt(10.6, 10.4), proprietes: { marque: { valeur: "non renseignée" }, debit: { valeur: 12, unite: "l/min" } }, classification: "Sanitaires" } },
      { type: "bloc.placer", params: { id: "l1", definitionId: "c", niveauId: "rdc", position: pt(1, 1) } },
      { type: "bloc.placer", params: { id: "l2", definitionId: "c", niveauId: "rdc", position: pt(2, 1) } },
      { type: "propriete.definir", params: { id: "l2", nom: "debit", valeur: 9, unite: "l/min" } },
    ], "c")).etat;
    expect(proprietesEffectives(r, r.objets["l1"]!)["debit"]).toEqual({ valeur: 12, unite: "l/min", source: "definition" });
    expect(proprietesEffectives(r, r.objets["l2"]!)["debit"]).toMatchObject({ valeur: 9, source: "occurrence" });
    r = appliquerLot(r, lot([{ type: "bloc.definir", params: { redefinir: "c", cibles: ["e2"], pointDeBase: pt(10.6, 10.4), proprietes: { debit: { valeur: 15, unite: "l/min" } } } }], "re")).etat;
    expect(proprietesEffectives(r, r.objets["l2"]!)["debit"]).toMatchObject({ valeur: 9, source: "occurrence" });
    expect(proprietesEffectives(r, r.objets["l1"]!)["debit"]).toMatchObject({ valeur: 15, source: "definition" });
    const t = genererTableau(r, "composants");
    expect(t.lignes).toEqual([["c", "composant", "Lavabo", "Sanitaires", 2, "RDC"]]);
  });

  it("une contrainte passe « à réparer » après décomposition de son esquisse", () => {
    const e = appliquerLot(modeleVide(), lot([
      { type: "niveau.creer", params: { id: "rdc", nom: "RDC", elevation: 0 } },
      { type: "esquisse.polyligne", params: { id: "p", niveauId: "rdc", points: [pt(0, 0), pt(4, 0.2), pt(4, 3)] } },
      { type: "contrainte.ajouter", params: { id: "h", type: "horizontal", objetA: "p", a: "segment[0]" } },
    ], "s")).etat;
    const r = appliquerLot(e, lot([{ type: "transformer.decomposer", params: { cibles: ["p"] } }], "d")).etat;
    expect(contraintesDe(r)[0]!.params.etat).toBe("a-reparer");
  });
});

describe("toitures simples, garde-corps, phases (lot 5)", () => {
  it("toiture bipente : faîtage à mi-portée, hauteur = tan(pente) × demi-portée ; monopente : égout sur le premier côté ; pente absente = plate", () => {
    const contour = [pt(0, 0), pt(10, 0), pt(10, 6), pt(0, 6)];
    const g = geometrieToiture(contour, "bipente", 30)!;
    expect(g.faitage).toEqual([{ x: 0, y: 3 }, { x: 10, y: 3 }]);
    expect(g.hauteur({ x: 5, y: 3 })).toBeCloseTo(3 * Math.tan(Math.PI / 6), 12);
    expect(g.hauteur({ x: 5, y: 0 })).toBeCloseTo(0, 12);
    const mono = geometrieToiture(contour, "monopente", 45)!;
    expect(mono.hauteur({ x: 0, y: 6 })).toBeCloseTo(6, 12);
    expect(geometrieToiture(contour, "bipente", 0)).toBeNull();
    const e = appliquerLot(modeleVide(), lot([
      { type: "niveau.creer", params: { id: "t", nom: "Toit", elevation: 9 } },
      { type: "toiture.creer", params: { id: "r", niveauId: "t", contour, type: "bipente", pente: { value: 30, unit: "deg" }, epaisseur: m(0.25) } },
    ], "t")).etat;
    const mm = maillageObjet(e, e.objets["r"]!)!;
    const zmax = Math.max(...mm.positions.filter((_, i) => i % 3 === 2));
    expect(zmax).toBeCloseTo(9 + 0.25 + 3 * Math.tan(Math.PI / 6), 9);
  });

  it("garde-corps : hauteur obligatoire (jamais déduite), volume à la hauteur saisie ; phase affectée et retirée", () => {
    const e0 = appliquerLot(modeleVide(), lot([{ type: "niveau.creer", params: { id: "m", nom: "Mezzanine", elevation: 3.2 } }], "n")).etat;
    expect(() => appliquerLot(e0, lot([{ type: "gardeCorps.creer", params: { niveauId: "m", points: [pt(0, 0), pt(3, 0)], epaisseur: m(0.05) } }]))).toThrow(/hauteur/);
    const e = appliquerLot(e0, lot([{ type: "gardeCorps.creer", params: { id: "g", niveauId: "m", points: [pt(0, 0), pt(3, 0), pt(3, 2)], hauteur: m(1.1), epaisseur: m(0.05), remplissage: "plein" } }], "g")).etat;
    const mm = maillageObjet(e, e.objets["g"]!)!;
    expect(Math.max(...mm.positions.filter((_, i) => i % 3 === 2))).toBeCloseTo(4.3, 9);
    const ph = appliquerLot(e, lot([{ type: "phase.affecter", params: { cibles: ["g"], phase: "a-demolir" } }], "ph")).etat;
    expect(ph.objets["g"]!.phase).toBe("a-demolir");
    expect(() => appliquerLot(e, lot([{ type: "phase.affecter", params: { cibles: ["g"], phase: "demoli" } }]))).toThrow(/phase/);
    expect(appliquerLot(ph, lot([{ type: "phase.affecter", params: { cibles: ["g"], phase: null } }], "ph2")).etat.objets["g"]!.phase).toBeNull();
  });
});

describe("miroir d'une occurrence de bloc (D-071)", () => {
  it("le contenu est retourné : décomposer l'occurrence symétrisée = symétriser le contenu décomposé ; deux miroirs : identité ; inverse exact", () => {
    const e = appliquerLot(modeleVide(), lot([
      { type: "niveau.creer", params: { id: "rdc", nom: "RDC", elevation: 0, hauteur: 3 } },
      { type: "esquisse.polyligne", params: { id: "L", niveauId: "rdc", points: [pt(0, 0), pt(2, 0), pt(2, 1)] } },
      { type: "bloc.definir", params: { id: "b", nom: "Équerre", cibles: ["L"], pointDeBase: pt(0, 0) } },
      { type: "bloc.placer", params: { id: "o", definitionId: "b", niveauId: "rdc", position: pt(5, 5), angle: { value: 30, unit: "deg" } } },
    ], "b")).etat;
    const axe = { a: pt(0, -3), b: pt(4, 5) };
    const r = appliquerLot(e, lot([{ type: "transformer.miroir", params: axe, cibles: ["o"] }], "m"));
    expect((r.etat.objets["o"] as Occurrence<"bloc-occurrence">).params.miroir).toBe(true);
    const points = (et: ModeleAtelier) => {
      const d = appliquerLot(et, lot([{ type: "transformer.decomposer", params: { cibles: ["o"] } }], "d")).etat;
      return (Object.values(d.objets).find((o) => o.classe === "esquisse" && o.id !== "L") as Occurrence<"esquisse">).params.points.map((q) => [Math.round(q.x * 1e6) / 1e6, Math.round(q.y * 1e6) / 1e6]);
    };
    const decomposeAvant = appliquerLot(e, lot([{ type: "transformer.decomposer", params: { cibles: ["o"] } }], "d0")).etat;
    const idCopie = Object.keys(decomposeAvant.objets).find((id) => id !== "L" && decomposeAvant.objets[id]!.classe === "esquisse")!;
    const symetrise = appliquerLot(decomposeAvant, lot([{ type: "transformer.miroir", params: axe, cibles: [idCopie] }], "m2")).etat;
    const attendu = (symetrise.objets[idCopie] as Occurrence<"esquisse">).params.points.map((q) => [Math.round(q.x * 1e6) / 1e6, Math.round(q.y * 1e6) / 1e6]);
    expect(points(r.etat)).toEqual(attendu);
    const deux = appliquerLot(r.etat, lot([{ type: "transformer.miroir", params: axe, cibles: ["o"] }], "m3")).etat;
    expect("miroir" in (deux.objets["o"] as Occurrence<"bloc-occurrence">).params).toBe(false);
    expect(points(deux)).toEqual(points(e));
    expect(appliquerLot(r.etat, lot([r.inverse], "inv")).etat).toEqual(e);
  });
});

describe("blocs imbriqués (D-078)", () => {
  it("un bloc contient une occurrence d'un autre : dessin et décomposition composés ; cycle refusé ; export de bibliothèque complet", async () => {
    const { genererVue } = await import("../documents/vues.js");
    const { exporterBibliotheque } = await import("../echanges/bibliotheque.js");
    const { contenuPlace } = await import("../blocs-places.js");
    let e = appliquerLot(modeleVide(), lot([
      { type: "niveau.creer", params: { id: "rdc", nom: "RDC", elevation: 0, hauteur: 3 } },
      { type: "esquisse.ligne", params: { id: "seg", niveauId: "rdc", points: [pt(0, 0), pt(1, 0)] } },
      { type: "bloc.definir", params: { id: "petit", nom: "Trait", cibles: ["seg"], pointDeBase: pt(0, 0), bibliotheque: "A" } },
      { type: "bloc.placer", params: { id: "o1", definitionId: "petit", niveauId: "rdc", position: pt(10, 0), angle: { value: 90, unit: "deg" } } },
      { type: "bloc.definir", params: { id: "grand", nom: "Paire", cibles: ["o1"], pointDeBase: pt(10, 0), bibliotheque: "B" } },
      { type: "bloc.placer", params: { id: "o2", definitionId: "grand", niveauId: "rdc", position: pt(100, 100), echelle: 2 } },
    ], "n")).etat;
    const places = contenuPlace(e, "grand", (e.objets["o2"] as Occurrence<"bloc-occurrence">).params);
    expect(places).toHaveLength(1);
    const fin = places[0]!.tr(pt(1, 0));
    expect(fin.x).toBeCloseTo(100, 9);
    expect(fin.y).toBeCloseTo(102, 9); // tourné de 90° puis échelle 2
    expect(places[0]!.k).toBe(2);
    expect(() => appliquerLot(e, lot([{ type: "bloc.definir", params: { redefinir: "petit", cibles: ["o2"], pointDeBase: pt(0, 0) } }], "c"))).toThrow(/cycle/);
    const d = appliquerLot(e, lot([{ type: "transformer.decomposer", params: { cibles: ["o2"] } }], "d")).etat;
    const inner = Object.values(d.objets).find((o) => o.classe === "bloc-occurrence" && o.id !== "o1") as Occurrence<"bloc-occurrence">;
    expect(inner.definitionId).toBe("petit");
    expect(inner.params.echelle).toBe(2);
    expect(exporterBibliotheque(e, "x", "B").definitions.map((x) => x.id)).toEqual(["grand", "petit"]);
    e = appliquerLot(e, lot([{ type: "vue.creer", params: { id: "v", type: "plan", titre: "R", echelle: 50, niveauId: "rdc" } }], "v")).etat;
    const prims = genererVue(e, e.definitions["v"]!.params as never, "v").primitives.filter((p) => (p as { objetId?: string }).objetId === "o2");
    expect(prims.length).toBeGreaterThan(0);
  });
});

describe("cotes rattachées à une occurrence de bloc (D-102, DA-05-06)", () => {
  it("sommets du contenu placé ; cote rattachée à deux sommets, qui suit l'occurrence déplacée et tournée", async () => {
    const { sommetsBloc, traitsBloc } = await import("../blocs-places.js");
    const { caracteristiqueAuPoint, extremitesCotation, referenceExtremite } = await import("../references.js");
    const e = appliquerLot(socle(), lot([
      { type: "bloc.definir", params: { id: "b", nom: "Table", cibles: ["e1", "e2"], pointDeBase: pt(10, 10) } },
      { type: "bloc.placer", params: { id: "o1", definitionId: "b", niveauId: "rdc", position: pt(0, 5) } },
    ], "b")).etat;
    const o = e.objets["o1"]!;
    const s = sommetsBloc(e, o);
    expect(s.slice(0, 4)).toEqual([pt(0, 5), pt(1.2, 5), pt(1.2, 5.8), pt(0, 5.8)]);
    expect(s[4]).toEqual(pt(0.6, 5.4)); // centre du cercle
    expect(traitsBloc(e, o).map((t) => [t.ferme, !!t.courbe])).toEqual([[true, false], [false, true]]);
    expect(caracteristiqueAuPoint(e, "o1", pt(1.2, 5.8))).toBe("sommet[2]");
    const c = appliquerLot(e, lot([
      { type: "cotation.creer", params: { id: "k", niveauId: "rdc", a: pt(0, 5), b: pt(1.2, 5), decalage: m(0.5) } },
      { type: "cotation.rattacher", params: { id: "k", referenceId: referenceExtremite("k", "a"), objetId: "o1", caracteristique: "sommet[0]" } },
      { type: "cotation.rattacher", params: { id: "k", referenceId: referenceExtremite("k", "b"), objetId: "o1", caracteristique: "sommet[1]" } },
    ], "c")).etat;
    const d = appliquerLot(c, lot([{ type: "transformer.tourner", params: { centre: pt(0, 5), angle: { value: 90, unit: "deg" } }, cibles: ["o1"] }, { type: "transformer.deplacer", params: { dx: 2, dy: 0 }, cibles: ["o1"] }], "d")).etat;
    const x = extremitesCotation(d, "k")!;
    expect(x.rattachees).toBe(2);
    expect(x.a.x).toBeCloseTo(2, 9);
    expect(x.a.y).toBeCloseTo(5, 9);
    expect(x.b.x).toBeCloseTo(2, 9);
    expect(x.b.y).toBeCloseTo(6.2, 9);
  });
});
