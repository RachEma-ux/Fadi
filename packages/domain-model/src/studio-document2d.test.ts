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
});

describe("document 2D de Studio — commandes", () => {
  it("dessiner, modifier une extrémité : la cote liée suit, même identité, valeur dérivée", () => {
    let doc = ok(d.ajouterLigne(base(), { id: "l1", calqueId: "calque-1", a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }));
    doc = ok(d.ajouterCote(doc, { id: "c1", calqueId: "calque-1", a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, decalage: 0.5, liens: { a: { primitiveId: "l1", extremite: "a" }, b: { primitiveId: "l1", extremite: "b" } } }));
    doc = ok(d.modifierLigne(doc, "l1", { a: { x: 0, y: 0 }, b: { x: 6.25, y: 0 } }));
    const cote = doc.primitives.find((p) => p.id === "c1")!;
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

  it("texte canonique indépendant de l'ordre des clés", () => {
    expect(d.canoniserDocument2D({ b: 1, a: { d: 2, c: [3, { f: 4, e: 5 }] } })).toBe(d.canoniserDocument2D({ a: { c: [3, { e: 5, f: 4 }], d: 2 }, b: 1 }));
  });
});
