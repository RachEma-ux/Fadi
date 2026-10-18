import { describe, expect, it } from "vitest";
import * as d from "./studio-document2d.js";

const base = () => d.documentVide();
const ok = (r: d.Resultat) => {
  if (!r.ok) throw new Error(r.erreur);
  return r.contenu;
};

describe("document 2D de Studio — validation", () => {
  it("un document vide est valide ; unité et version de schéma sont exigées, jamais complétées", () => {
    expect(d.validerDocument2D(base()).ok).toBe(true);
    expect(d.validerDocument2D({ ...base(), unite: "px" }).ok).toBe(false);
    const { unite: _u, ...sansUnite } = base();
    expect(d.validerDocument2D(sansUnite).ok).toBe(false);
    expect(d.validerDocument2D({ ...base(), schemaVersion: "illustrative-1" }).ok).toBe(false);
    expect(d.validerDocument2D({ ...base(), calques: [] }).ok).toBe(false);
  });

  it("refuse coordonnées non finies, longueur nulle, calque inconnu, identifiant en double ou champ étranger", () => {
    const l = { id: "l1", type: "ligne", calqueId: "calque-1", a: { x: 0, y: 0 }, b: { x: 1, y: 0 } };
    const doc = (primitives: unknown[]) => ({ ...base(), primitives });
    expect(d.validerDocument2D(doc([l])).ok).toBe(true);
    expect(d.validerDocument2D(doc([{ ...l, b: { x: Number.NaN, y: 0 } }])).ok).toBe(false);
    expect(d.validerDocument2D(JSON.parse(JSON.stringify(doc([{ ...l, b: { x: 1e400, y: 0 } }])))).ok).toBe(false);
    expect(d.validerDocument2D(doc([{ ...l, b: { x: 0, y: 0 } }])).ok).toBe(false);
    expect(d.validerDocument2D(doc([{ ...l, calqueId: "x" }])).ok).toBe(false);
    expect(d.validerDocument2D(doc([l, l])).ok).toBe(false);
    expect(d.validerDocument2D(doc([{ ...l, couleur: "rouge" }])).ok).toBe(false);
    expect(d.validerDocument2D(doc([{ ...l, type: "mur" }])).ok).toBe(false);
  });

  it("une cote liée doit viser une ligne présente et coïncider avec son extrémité", () => {
    let doc = ok(d.ajouterLigne(base(), { id: "l1", calqueId: "calque-1", a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }));
    doc = ok(d.ajouterCote(doc, { id: "c1", calqueId: "calque-1", a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, decalage: 0.5, liens: { a: { primitiveId: "l1", extremite: "a" }, b: { primitiveId: "l1", extremite: "b" } } }));
    expect(d.validerDocument2D(doc).ok).toBe(true);
    const faux = { ...doc, primitives: doc.primitives.map((p) => (p.type === "cote" ? { ...p, b: { x: 3, y: 0 } } : p)) };
    expect(d.validerDocument2D(faux).ok).toBe(false);
    const orpheline = { ...doc, primitives: doc.primitives.filter((p) => p.type === "cote") };
    expect(d.validerDocument2D(orpheline).ok).toBe(false);
  });

  it("jeux de clés exacts : document, calque, liens et lien ; aucun champ étranger accepté", () => {
    let doc = ok(d.ajouterLigne(base(), { id: "l1", calqueId: "calque-1", a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }));
    doc = ok(d.ajouterCote(doc, { id: "c1", calqueId: "calque-1", a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, decalage: 0.5, liens: { a: { primitiveId: "l1", extremite: "a" }, b: null } }));
    expect(d.validerDocument2D(doc).ok).toBe(true);
    const cote = doc.primitives[1] as d.Cote;
    const avecCote = (c: unknown) => ({ ...doc, primitives: [doc.primitives[0], c] });
    expect(d.validerDocument2D({ ...doc, auteur: "x" }).ok).toBe(false);
    expect(d.validerDocument2D({ ...doc, calques: [{ ...doc.calques[0], couleur: "bleu" }] }).ok).toBe(false);
    expect(d.validerDocument2D(avecCote({ ...cote, liens: { ...cote.liens, c: null } })).ok).toBe(false);
    expect(d.validerDocument2D(avecCote({ ...cote, liens: { a: cote.liens.a } })).ok).toBe(false);
    expect(d.validerDocument2D(avecCote({ ...cote, liens: { a: { ...cote.liens.a, poids: 1 }, b: null } })).ok).toBe(false);
    expect(d.validerDocument2D(avecCote({ ...cote, style: "fin" })).ok).toBe(false);
    expect(d.validerDocument2D({ ...doc, primitives: [{ ...doc.primitives[0], a: { x: 0, y: 0, z: 0 } }] }).ok).toBe(false);
  });
});

describe("document 2D de Studio — commandes", () => {
  it("dessiner, modifier une extrémité : la cote liée suit, même identité, valeur dérivée", () => {
    let doc = ok(d.ajouterLigne(base(), { id: "l1", calqueId: "calque-1", a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }));
    doc = ok(d.ajouterCote(doc, { id: "c1", calqueId: "calque-1", a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, decalage: 0.5, liens: { a: { primitiveId: "l1", extremite: "a" }, b: { primitiveId: "l1", extremite: "b" } } }));
    doc = ok(d.modifierLigne(doc, "l1", { a: { x: 0, y: 0 }, b: { x: 6.25, y: 0 } }));
    const cote = doc.primitives.find((p) => p.id === "c1") as d.Cote;
    expect(d.distance(cote.a, cote.b)).toBe(6.25);
    expect(d.validerDocument2D(doc).ok).toBe(true);
  });

  it("supprimer une ligne cotée garde la cote, liens rompus et « à résoudre »", () => {
    let doc = ok(d.ajouterLigne(base(), { id: "l1", calqueId: "calque-1", a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }));
    doc = ok(d.ajouterCote(doc, { id: "c1", calqueId: "calque-1", a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, decalage: 0.5, liens: { a: { primitiveId: "l1", extremite: "a" }, b: null } }));
    doc = ok(d.supprimer(doc, ["l1"]));
    expect(doc.primitives).toHaveLength(1);
    expect(doc.primitives[0]).toMatchObject({ id: "c1", aResoudre: true, liens: { a: null, b: null } });
    expect(d.validerDocument2D(doc).ok).toBe(true);
  });

  it("refus atomiques : calque verrouillé, longueur nulle, identifiant pris ; le document n'est pas modifié", () => {
    const doc = ok(d.ajouterLigne(base(), { id: "l1", calqueId: "calque-1", a: { x: 0, y: 0 }, b: { x: 1, y: 0 } }));
    const verrouille = ok(d.reglerCalque(doc, "calque-1", { verrouille: true }));
    expect(d.ajouterLigne(verrouille, { id: "l2", calqueId: "calque-1", a: { x: 0, y: 0 }, b: { x: 1, y: 1 } })).toEqual({ ok: false, erreur: "Calque verrouillé." });
    expect(d.supprimer(verrouille, ["l1"]).ok).toBe(false);
    expect(d.ajouterLigne(doc, { id: "l2", calqueId: "calque-1", a: { x: 2, y: 2 }, b: { x: 2, y: 2 } }).ok).toBe(false);
    expect(d.ajouterLigne(doc, { id: "l1", calqueId: "calque-1", a: { x: 0, y: 0 }, b: { x: 1, y: 1 } }).ok).toBe(false);
    expect(doc.primitives).toHaveLength(1);
  });

  it("accrochage : l'extrémité l'emporte sur le milieu ; calque masqué ignoré ; hors tolérance → rien", () => {
    let doc = ok(d.ajouterLigne(base(), { id: "l1", calqueId: "calque-1", a: { x: 0, y: 0 }, b: { x: 0.2, y: 0 } }));
    expect(d.accrocher(doc, { x: 0.09, y: 0 }, 0.15)).toMatchObject({ type: "extremite", primitiveId: "l1", extremite: "a" });
    doc = ok(d.ajouterLigne(doc, { id: "l2", calqueId: "calque-1", a: { x: 10, y: 0 }, b: { x: 12, y: 0 } }));
    expect(d.accrocher(doc, { x: 11.05, y: 0 }, 0.1)).toMatchObject({ type: "milieu", primitiveId: "l2" });
    expect(d.accrocher(doc, { x: 5, y: 5 }, 0.1)).toBeNull();
    expect(d.accrocher(ok(d.reglerCalque(doc, "calque-1", { visible: false })), { x: 10, y: 0 }, 0.1)).toBeNull();
  });

  it("calque actif retiré par une annulation : repli sur le premier calque, le dessin reste possible", () => {
    const avant = base();
    const apres = ok(d.ajouterCalque(avant, { id: "calque-b", nom: "Calque B" }));
    expect(d.calqueOuPremier(apres, "calque-b")).toBe("calque-b");
    const annule = d.annuler(d.appliquer(d.historique(avant), apres)).present;
    expect(d.calqueOuPremier(annule, "calque-b")).toBe("calque-1");
    expect(d.ajouterLigne(annule, { id: "l1", calqueId: d.calqueOuPremier(annule, "calque-b"), a: { x: 0, y: 0 }, b: { x: 1, y: 0 } }).ok).toBe(true);
  });

  it("historique local : annuler / rétablir ; une nouvelle commande efface le futur", () => {
    const v = base();
    const a = ok(d.ajouterLigne(v, { id: "l1", calqueId: "calque-1", a: { x: 0, y: 0 }, b: { x: 1, y: 0 } }));
    const b = ok(d.ajouterLigne(a, { id: "l2", calqueId: "calque-1", a: { x: 0, y: 1 }, b: { x: 1, y: 1 } }));
    let h = d.appliquer(d.appliquer(d.historique(v), a), b);
    h = d.annuler(h);
    expect(h.present).toBe(a);
    h = d.retablir(h);
    expect(h.present).toBe(b);
    h = d.appliquer(d.annuler(h), v);
    expect(h.futur).toEqual([]);
  });

  it("rectangle : deux coins quelconques → origine bas-gauche normalisée, dimensions strictement positives", () => {
    expect(d.rectangleParCoins({ x: 13, y: 2 }, { x: 10, y: 0 })).toEqual({ origine: { x: 10, y: 0 }, largeur: 3, hauteur: 2 });
    const doc = ok(d.ajouterRectangle(base(), { id: "r1", calqueId: "calque-1", ...d.rectangleParCoins({ x: 10, y: 0 }, { x: 13, y: 2 }) }));
    expect(doc.primitives[0]).toEqual({ id: "r1", type: "rectangle", calqueId: "calque-1", origine: { x: 10, y: 0 }, largeur: 3, hauteur: 2 });
    expect(d.validerDocument2D(doc).ok).toBe(true);
    expect(d.emprise(doc)).toEqual({ min: { x: 10, y: 0 }, max: { x: 13, y: 2 } });
    expect(d.ajouterRectangle(base(), { id: "r1", calqueId: "calque-1", origine: { x: 0, y: 0 }, largeur: 0, hauteur: 2 })).toEqual({ ok: false, erreur: "La largeur et la hauteur doivent être strictement positives." });
    expect(d.ajouterRectangle(base(), { id: "r1", calqueId: "calque-1", origine: { x: 0, y: 0 }, largeur: -1, hauteur: 2 }).ok).toBe(false);
    expect(d.ajouterRectangle(base(), { id: "r1", calqueId: "calque-1", origine: { x: Number.NaN, y: 0 }, largeur: 1, hauteur: 2 }).ok).toBe(false);
    expect(d.ajouterRectangle(doc, { id: "r1", calqueId: "calque-1", origine: { x: 0, y: 0 }, largeur: 1, hauteur: 1 }).ok).toBe(false);
  });

  it("rectangle : validation stricte (aucun champ étranger, dimensions positives, origine finie)", () => {
    const r = { id: "r1", type: "rectangle", calqueId: "calque-1", origine: { x: 0, y: 0 }, largeur: 3, hauteur: 2 };
    const doc = (primitives: unknown[]) => ({ ...base(), primitives });
    expect(d.validerDocument2D(doc([r])).ok).toBe(true);
    expect(d.validerDocument2D(doc([{ ...r, couleur: "rouge" }])).ok).toBe(false);
    expect(d.validerDocument2D(doc([{ ...r, hauteur: 0 }])).ok).toBe(false);
    expect(d.validerDocument2D(doc([{ ...r, largeur: -3 }])).ok).toBe(false);
    expect(d.validerDocument2D(doc([{ ...r, largeur: "3" }])).ok).toBe(false);
    expect(d.validerDocument2D(doc([{ ...r, origine: { x: 0, y: Number.POSITIVE_INFINITY } }])).ok).toBe(false);
    const { hauteur: _h, ...sansHauteur } = r;
    expect(d.validerDocument2D(doc([{ ...sansHauteur, profondeur: 1 }])).ok).toBe(false);
    expect(d.validerDocument2D(doc([{ ...r, calqueId: "x" }])).ok).toBe(false);
    // Une cote ne se lie jamais à un rectangle.
    const cote = { id: "c1", type: "cote", calqueId: "calque-1", a: { x: 0, y: 0 }, b: { x: 3, y: 0 }, decalage: 0.5, liens: { a: { primitiveId: "r1", extremite: "a" }, b: null }, aResoudre: false };
    expect(d.validerDocument2D(doc([r, cote])).ok).toBe(false);
  });

  it("rectangle : inspecteur (origine, largeur, hauteur), suppression, calque verrouillé", () => {
    let doc = ok(d.ajouterRectangle(base(), { id: "r1", calqueId: "calque-1", origine: { x: 0, y: 0 }, largeur: 3, hauteur: 2 }));
    doc = ok(d.modifierRectangle(doc, "r1", { origine: { x: 1, y: -1 }, largeur: 4.5, hauteur: 2 }));
    expect(doc.primitives[0]).toMatchObject({ id: "r1", origine: { x: 1, y: -1 }, largeur: 4.5, hauteur: 2 });
    expect(d.modifierRectangle(doc, "r1", { origine: { x: 0, y: 0 }, largeur: 0, hauteur: 2 }).ok).toBe(false);
    expect(d.modifierRectangle(doc, "x", { origine: { x: 0, y: 0 }, largeur: 1, hauteur: 2 })).toEqual({ ok: false, erreur: "Rectangle introuvable." });
    expect(d.modifierRectangle(ok(d.reglerCalque(doc, "calque-1", { verrouille: true })), "r1", { origine: { x: 0, y: 0 }, largeur: 1, hauteur: 2 })).toEqual({ ok: false, erreur: "Calque verrouillé." });
    expect(ok(d.supprimer(doc, ["r1"])).primitives).toEqual([]);
  });

  it("rectangle : accrochage aux 4 coins (rang d'une extrémité, sans lien) et aux 4 milieux de côté ; sélection sur le contour", () => {
    const doc = ok(d.ajouterRectangle(base(), { id: "r1", calqueId: "calque-1", origine: { x: 0, y: 0 }, largeur: 4, hauteur: 2 }));
    expect(d.accrocher(doc, { x: 4.05, y: 2.02 }, 0.1)).toMatchObject({ type: "coin", primitiveId: "r1", coin: 2, point: { x: 4, y: 2 } });
    expect(d.accrocher(doc, { x: 2.03, y: 0 }, 0.1)).toMatchObject({ type: "milieu", primitiveId: "r1", point: { x: 2, y: 0 } });
    expect(d.accrocher(doc, { x: 0, y: 1.04 }, 0.1)).toMatchObject({ type: "milieu", point: { x: 0, y: 1 } });
    expect(d.accrocher(doc, { x: 2, y: 1 }, 0.1)).toBeNull();
    // Un coin l'emporte sur un milieu plus proche.
    const etroit = ok(d.ajouterRectangle(base(), { id: "r2", calqueId: "calque-1", origine: { x: 0, y: 0 }, largeur: 0.2, hauteur: 5 }));
    expect(d.accrocher(etroit, { x: 0.12, y: 0 }, 0.15)).toMatchObject({ type: "coin", coin: 1 });
    const r = doc.primitives[0] as d.Rectangle;
    expect(d.distanceContour({ x: 2, y: 1 }, r)).toBe(1);
    expect(d.distanceContour({ x: 4.5, y: 1 }, r)).toBe(0.5);
    expect(d.coinsRectangle(r)).toEqual([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 2 }, { x: 0, y: 2 }]);
  });
});

describe("document 2D de Studio — déplacer", () => {
  const avecCote = () => {
    let doc = ok(d.ajouterLigne(base(), { id: "l1", calqueId: "calque-1", a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }));
    doc = ok(d.ajouterLigne(doc, { id: "l2", calqueId: "calque-1", a: { x: 0, y: 3 }, b: { x: 4, y: 3 } }));
    doc = ok(d.ajouterRectangle(doc, { id: "r1", calqueId: "calque-1", origine: { x: 10, y: 0 }, largeur: 3, hauteur: 2 }));
    doc = ok(d.ajouterCote(doc, { id: "c1", calqueId: "calque-1", a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, decalage: 0.5, liens: { a: { primitiveId: "l1", extremite: "a" }, b: { primitiveId: "l1", extremite: "b" } } }));
    doc = ok(d.ajouterCote(doc, { id: "c2", calqueId: "calque-1", a: { x: 0, y: 5 }, b: { x: 2, y: 5 }, decalage: 0.5, liens: { a: null, b: null } }));
    return doc;
  };
  const prim = (doc: d.ContenuDocument2D, id: string) => doc.primitives.find((p) => p.id === id)!;

  it("translate lignes, rectangles et cotes ; une cote liée suit sa ligne, même valeur ; le reste ne bouge pas", () => {
    const doc = avecCote();
    const apres = ok(d.deplacer(doc, ["l1", "r1"], 1, 1));
    expect(prim(apres, "l1")).toMatchObject({ a: { x: 1, y: 1 }, b: { x: 5, y: 1 } });
    expect(prim(apres, "r1")).toMatchObject({ origine: { x: 11, y: 1 }, largeur: 3, hauteur: 2 });
    const c1 = prim(apres, "c1") as d.Cote;
    expect(c1).toMatchObject({ a: { x: 1, y: 1 }, b: { x: 5, y: 1 }, decalage: 0.5, liens: { a: { primitiveId: "l1", extremite: "a" }, b: { primitiveId: "l1", extremite: "b" } } });
    expect(d.distance(c1.a, c1.b)).toBe(4);
    expect(prim(apres, "l2")).toBe(prim(doc, "l2"));
    expect(prim(apres, "c2")).toBe(prim(doc, "c2"));
    expect(d.validerDocument2D(apres).ok).toBe(true);
    // Ligne et cote liée sélectionnées ensemble : la cote ne bouge qu'une fois.
    const ensemble = ok(d.deplacer(doc, ["l1", "c1"], -2, 0.5));
    expect(prim(ensemble, "c1")).toMatchObject({ a: { x: -2, y: 0.5 }, b: { x: 2, y: 0.5 } });
    expect(d.validerDocument2D(ensemble).ok).toBe(true);
    // Une cote libre se déplace seule.
    expect(prim(ok(d.deplacer(doc, ["c2"], 0, -1)), "c2")).toMatchObject({ a: { x: 0, y: 4 }, b: { x: 2, y: 4 } });
  });

  it("refus atomiques : cote liée à une ligne immobile, calque verrouillé, rien choisi, élément inconnu, déplacement nul ou invalide", () => {
    const doc = avecCote();
    expect(d.deplacer(doc, ["c1"], 1, 0)).toEqual({ ok: false, erreur: "Cote associée à une ligne non déplacée : sélectionnez aussi la ligne cotée." });
    expect(d.deplacer(doc, ["c1", "r1"], 1, 0).ok).toBe(false);
    expect(d.deplacer(ok(d.reglerCalque(doc, "calque-1", { verrouille: true })), ["l1"], 1, 0)).toEqual({ ok: false, erreur: "Calque verrouillé." });
    expect(d.deplacer(doc, [], 1, 0)).toEqual({ ok: false, erreur: "Rien à déplacer." });
    expect(d.deplacer(doc, ["l1", "x"], 1, 0)).toEqual({ ok: false, erreur: "Élément introuvable." });
    expect(d.deplacer(doc, ["l1"], 0, 0)).toEqual({ ok: false, erreur: "Déplacement nul." });
    expect(d.deplacer(doc, ["l1"], Number.NaN, 0)).toEqual({ ok: false, erreur: "Déplacement invalide." });
  });

  it("une cote liée par une extrémité à la ligne déplacée suit cette extrémité ; jamais de longueur nulle", () => {
    let doc = ok(d.ajouterLigne(base(), { id: "l1", calqueId: "calque-1", a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }));
    doc = ok(d.ajouterLigne(doc, { id: "l2", calqueId: "calque-1", a: { x: 4, y: 2 }, b: { x: 6, y: 2 } }));
    doc = ok(d.ajouterCote(doc, { id: "c1", calqueId: "calque-1", a: { x: 0, y: 0 }, b: { x: 4, y: 2 }, decalage: 0, liens: { a: { primitiveId: "l1", extremite: "a" }, b: { primitiveId: "l2", extremite: "a" } } }));
    const apres = ok(d.deplacer(doc, ["l1"], 1, 0));
    expect(prim(apres, "c1")).toMatchObject({ a: { x: 1, y: 0 }, b: { x: 4, y: 2 } });
    expect(d.validerDocument2D(apres).ok).toBe(true);
    expect(d.deplacer(doc, ["l1"], 4, 2)).toEqual({ ok: false, erreur: "Une cote liée deviendrait de longueur nulle." });
  });

  it("annuler / rétablir un déplacement par l'historique local", () => {
    const doc = avecCote();
    const apres = ok(d.deplacer(doc, ["l1"], 1, 0));
    let h = d.appliquer(d.historique(doc), apres);
    h = d.annuler(h);
    expect(h.present).toBe(doc);
    expect(d.retablir(h).present).toBe(apres);
  });

  it("texte canonique indépendant de l'ordre des clés", () => {
    expect(d.canoniserDocument2D({ b: 1, a: { d: 2, c: [3, { f: 4, e: 5 }] } })).toBe(d.canoniserDocument2D({ a: { c: [3, { e: 5, f: 4 }], d: 2 }, b: 1 }));
  });
});
