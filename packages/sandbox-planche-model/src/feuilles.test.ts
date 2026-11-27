/**
 * Feuilles de dessin (cas 4 du catalogue des extensions, étape 6 : D7-F11-013, D7-F11-012, D7-F11-011) : formats ISO 216
 * calculés, édition, composition à l'échelle, SVG, PDF vectoriel relu.
 */
import { describe, expect, it } from "vitest";
import type { PlanDeCoupe } from "./annotations.js";
import { lireModelePlanche } from "./delta.js";
import { type CompositionFeuille, FENETRES_MAX, ajouterFenetre, composerFeuille, hachuresTropDenses, creerFeuille, dimensionsFeuille, estFeuille, formatA, modifierFenetre, modifierFeuille, nomFichierFeuille, numeroFeuilleSuivant, pdfFeuilles, relirePdf, supprimerFenetre, supprimerFeuille, svgFeuille } from "./feuilles.js";
import { type Id, type Modele, ajouterRectangle, modeleVide, modifierAnnotations, pousserTirer } from "./geometrie-libre.js";
import { v3 } from "./vecteur.js";

const L = { projet: "Projet", phase: "Phase", titre: "Titre", date: "Date", numero: "N°", indice: "Indice", echelles: "Échelles", vueDessus: "Vue de dessus" };

function boite(): Modele {
  const sol = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(4, 0, 0), v3(0, 3, 0)).modele;
  const f = Object.keys(sol.racine.faces)[0] as Id;
  return pousserTirer(sol, f, sol.racine.faces[f]!.normale.z > 0 ? 2 : -2).modele;
}
const coupe: PlanDeCoupe = { id: "c1", origine: v3(0, 0, 1), normale: v3(0, 0, 1), u: v3(1, 0, 0), w: v3(0, 1, 0), demiU: 3, demiW: 3, actif: true, inverse: false, nom: "RDC" };

function feuilleAvecVue(): { m: Modele; id: Id } {
  const base = modifierAnnotations(boite(), (a) => void (a.plansDeCoupe["c1"] = coupe)).modele;
  const f = creerFeuille(base, { numero: "A101", nom: "Plan RDC" });
  if (!f.ok) throw new Error("feuille");
  const w = ajouterFenetre(f.modele, f.id, { scene: null, echelle: 50, coupe: null, x: 40, y: 30 });
  if (!w.ok) throw new Error("fenêtre");
  return { m: w.modele, id: f.id };
}

describe("Formats ISO 216", () => {
  it("A0 à A4 calculés : 841 × 1189 … 210 × 297 mm", () => {
    expect([0, 1, 2, 3, 4].map((r) => formatA(r))).toEqual([
      { court: 841, long: 1189 },
      { court: 594, long: 841 },
      { court: 420, long: 594 },
      { court: 297, long: 420 },
      { court: 210, long: 297 },
    ]);
    expect(dimensionsFeuille({ format: 3, sens: "paysage" })).toEqual({ largeur: 420, hauteur: 297 });
    expect(dimensionsFeuille({ format: 4, sens: "portrait" })).toEqual({ largeur: 210, hauteur: 297 });
  });
});

describe("Édition des feuilles", () => {
  it("créer, modifier, fenêtres, supprimer ; persistance validée", () => {
    const m0 = boite();
    expect(numeroFeuilleSuivant(m0)).toBe("1");
    expect(creerFeuille(m0, { numero: " ", nom: "x" })).toEqual({ ok: false, erreur: "numero" });
    const { m, id } = feuilleAvecVue();
    expect(numeroFeuilleSuivant(m)).toBe("1");
    const f = m.annotations!.feuilles![id]!;
    expect([f.format, f.sens, f.indice, f.cartouche]).toEqual([3, "paysage", "", { projet: "", phase: "", date: "" }]);
    expect(f.fenetres.map((w) => w.id)).toEqual(["v1"]);
    expect(ajouterFenetre(m, id, { scene: null, echelle: 33, coupe: null, x: 0, y: 0 })).toEqual({ ok: false, erreur: "echelle" });
    expect(ajouterFenetre(m, id, { scene: "s9", echelle: 50, coupe: null, x: 0, y: 0 })).toEqual({ ok: false, erreur: "scene" });
    const mod = modifierFeuille(m, id, { indice: "B", format: 2, cartouche: { projet: "Maison", phase: "PC", date: "27.11.2026" } });
    if (!mod.ok) throw new Error("modif");
    expect(mod.modele.annotations!.feuilles![id]!.cartouche.projet).toBe("Maison");
    expect(lireModelePlanche(JSON.parse(JSON.stringify(mod.modele)))?.annotations?.feuilles?.[id]?.indice).toBe("B");
    const faux = JSON.parse(JSON.stringify(mod.modele));
    faux.annotations.feuilles[id].format = 7;
    expect(lireModelePlanche(faux)).toBeNull();
    const fw = modifierFenetre(mod.modele, id, "v1", { echelle: 100 });
    if (!fw.ok) throw new Error("fenêtre");
    expect(fw.modele.annotations!.feuilles![id]!.fenetres[0]!.echelle).toBe(100);
    const sw = supprimerFenetre(fw.modele, id, "v1");
    if (!sw.ok) throw new Error("suppr");
    expect(sw.modele.annotations!.feuilles![id]!.fenetres).toEqual([]);
    const sf = supprimerFeuille(sw.modele, id);
    expect(sf.ok && sf.modele.annotations?.feuilles?.[id]).toBeFalsy();
    expect(estFeuille("k1", { ...f, id: "k1", fenetres: [{ ...f.fenetres[0]!, id: "x" }] })).toBe(false);
  });

  it("nom de fichier selon le motif, caractères sûrs", () => {
    const { m, id } = feuilleAvecVue();
    const f = { ...m.annotations!.feuilles![id]!, indice: "B" };
    expect(nomFichierFeuille("{numero}-{nom}-{indice}", f)).toBe("A101-Plan_RDC-B.pdf");
    expect(nomFichierFeuille("{projet}", f)).toBe("feuille.pdf");
  });
});

describe("Composition, SVG et PDF", () => {
  it("vue de dessus à 1:50 posée à (40, 30) : 80 × 60 mm, poché, cadre ISO 5457, cartouche", () => {
    const { m, id } = feuilleAvecVue();
    const c = composerFeuille(m, m.annotations!.feuilles![id]!, L);
    expect([c.largeur, c.hauteur]).toEqual([420, 297]);
    expect(c.fenetres[0]).toMatchObject({ x: 40, y: 30, largeur: 80, hauteur: 60, echelle: 50, depasse: false, vide: false, titre: "Vue de dessus" });
    expect(c.primitives[0]).toEqual({ genre: "cadre", x: 20, y: 10, largeur: 390, hauteur: 277, epaisseur: 0.7 });
    expect(c.primitives.some((p) => p.genre === "poche")).toBe(true);
    const coupes = c.primitives.filter((p) => p.genre === "trait" && p.epaisseur === 0.5);
    expect(coupes.length).toBe(4);
    expect(c.primitives.some((p) => p.genre === "texte" && p.texte === "A101")).toBe(true);
    // Champs vides du cartouche : aucun texte inventé.
    expect(c.primitives.filter((p) => p.genre === "texte" && p.gris !== true).map((p) => (p as { texte: string }).texte)).toEqual(["1 — Vue de dessus", "1:50", "Plan RDC", "1:50", "A101"]);
    const svg = svgFeuille(c, { surligne: "v1" });
    expect(svg).toContain('width="420mm" height="297mm"');
    expect(svg).toContain("rgb(26,95,214)");
    const loin = modifierFenetre(m, id, "v1", { x: 380 });
    expect(loin.ok && composerFeuille(loin.modele, loin.modele.annotations!.feuilles![id]!, L).fenetres[0]!.depasse).toBe(true);
  });

  it("PDF : une page par feuille à sa taille exacte, relu ; tracé en millimètres", () => {
    const { m, id } = feuilleAvecVue();
    const f = m.annotations!.feuilles![id]!;
    const a4 = { ...f, format: 4 as const, sens: "portrait" as const };
    const octets = pdfFeuilles([composerFeuille(m, f, L), composerFeuille(m, a4, L)], "Jeu — essai");
    const texte = new TextDecoder("latin1").decode(octets);
    expect(texte.startsWith("%PDF-1.4")).toBe(true);
    expect(texte).toContain("/Count 2");
    expect(texte).toContain("2.8346 0 0 -2.8346 0");
    expect(texte).toContain("/Title <FEFF004A0065007500202014002000650073007300610069>");
    expect(texte).toContain("(1 \\227 Vue de dessus) Tj");
    expect(relirePdf(octets)).toEqual({ pages: [{ largeur: 420, hauteur: 297 }, { largeur: 210, hauteur: 297 }] });
    // Table des renvois : chaque objet à sa position.
    const xref = Number(/startxref\n(\d+)/.exec(texte)![1]);
    expect(texte.slice(xref, xref + 4)).toBe("xref");
    const premier = Number(/xref\n0 \d+\n0000000000 65535 f \n(\d{10})/.exec(texte)![1]);
    expect(texte.slice(premier, premier + 7)).toBe("1 0 obj");
    expect(relirePdf(new Uint8Array([1, 2, 3]))).toBeNull();
  });

  it("relecture #495 : décalage dx et origine des tirets gardés dans le PDF et le SVG de la feuille", () => {
    const poche = (dx: number): CompositionFeuille => ({
      largeur: 100,
      hauteur: 100,
      fenetres: [],
      echelles: [],
      primitives: [{ genre: "poche", boucles: [[{ x: 10, y: 10 }, { x: 30, y: 10 }, { x: 30, y: 12 }, { x: 10, y: 12 }]], motif: { id: "h1" as Id, nom: "t", source: { genre: "saisie" }, familles: [{ angle: 0, x0: 0, y0: 0, dx, dy: 1, tirets: [1, -1] }] } }],
    });
    const pdf = (c: CompositionFeuille) => new TextDecoder("latin1").decode(pdfFeuilles([c], "t"));
    expect(pdf(poche(0))).not.toBe(pdf(poche(0.5)));
    // Ligne de rang k : phase = (l0 − k·dx) modulo la période 2 ; l0 = 9 (bord de poche − 1).
    expect(pdf(poche(0.5))).toContain("[1 1] 0 d");
    expect(pdf(poche(0.5))).toContain("[1 1] 1.5 d");
    expect(svgFeuille(poche(0.5), {})).toContain('width="2"');
    expect(svgFeuille(poche(0.5), {})).toContain("skewX(26.565)");
  });

  it("relecture #495 : hachure trop dense signalée, jamais omise en silence", () => {
    const c: CompositionFeuille = {
      largeur: 100,
      hauteur: 100,
      fenetres: [],
      echelles: [],
      primitives: [{ genre: "poche", boucles: [[{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 60 }, { x: 0, y: 60 }]], motif: { id: "h1" as Id, nom: "t", source: { genre: "saisie" }, familles: [{ angle: 0, x0: 0, y0: 0, dx: 0, dy: 0.01, tirets: [] }] } }],
    };
    expect(hachuresTropDenses([c])).toBe(1);
    expect(() => pdfFeuilles([c], "t")).toThrow();
  });
});

describe("relecture #495 : borne des fenêtres", () => {
  it("la 33e fenêtre est refusée avant de toucher au modèle, qui reste relisible", () => {
    let { m, id } = feuilleAvecVue();
    const v = m.annotations!.feuilles![id]!.fenetres[0]!;
    while (m.annotations!.feuilles![id]!.fenetres.length < FENETRES_MAX) {
      const r = ajouterFenetre(m, id, { ...v, x: 10, y: 10 });
      if (!r.ok) throw new Error(r.erreur);
      m = r.modele;
    }
    const r = ajouterFenetre(m, id, { ...v, x: 10, y: 10 });
    expect(r).toEqual({ ok: false, erreur: "limite" });
    expect(lireModelePlanche(JSON.parse(JSON.stringify(m)))).not.toBeNull();
  });
});
