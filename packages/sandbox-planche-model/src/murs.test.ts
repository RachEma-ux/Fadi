/**
 * Cas 4 du catalogue, étape 4 : murs à épaisseur (D4-F5-003). Empreinte par référence, onglets en L, arrêt en T,
 * croisement et angle aigu signalés, mur fermé, persistance, mur modifié à la main jamais régénéré.
 */
import { describe, expect, it } from "vitest";
import { appliquerDeltaPlanche, differencePlanche, estDeltaPlanche, lireModelePlanche } from "./delta.js";
import { type Modele, ajouterSegment, modeleVide, pousserTirer, contexte } from "./geometrie-libre.js";
import { chainesDAretes, decalages, empreinteMur, estMur, jonctionsDuMur, longueurAxe, mursDuModele, murIntact, nettoyerAxe, oublierMur, poserMurs } from "./murs.js";
import { v3 } from "./vecteur.js";

const ok = <T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> => {
  if (!r.ok) throw new Error(JSON.stringify(r));
  return r as Extract<T, { ok: true }>;
};
const P = { epaisseur: 0.2, hauteur: 2.5, reference: "axe" as const };
const aire = (b: readonly { x: number; y: number }[]) => Math.abs(b.reduce((s, p, i) => { const q = b[(i + 1) % b.length]!; return s + p.x * q.y - q.x * p.y; }, 0)) / 2;
const proche = (a: { x: number; y: number }, x: number, y: number) => Math.abs(a.x - x) < 1e-9 && Math.abs(a.y - y) < 1e-9;
/** Volume d'un groupe de mur : somme des sommets en bas × hauteur, via l'aire de l'empreinte relue (sommets z = 0). */
const sommetsDuMur = (m: Modele, occ: string) => Object.values(contexte(m, occ).sommets).map((s) => s.position);

describe("murs : empreinte", () => {
  it("décalages selon la référence", () => {
    expect(decalages(P)).toEqual({ g: 0.1, d: -0.1 });
    expect(decalages({ ...P, reference: "interieur" })).toEqual({ g: 0, d: -0.2 });
    expect(decalages({ ...P, reference: "exterieur" })).toEqual({ g: 0.2, d: 0 });
  });

  it("mur droit : rectangle longueur × épaisseur, centré sur l'axe", () => {
    const e = empreinteMur({ ...P, axe: [v3(0, 0, 0), v3(4, 0, 0)], ferme: false });
    expect(e.boucles).toHaveLength(1);
    expect(aire(e.boucles[0]!)).toBeCloseTo(0.8, 9);
    expect(e.boucles[0]!.some((p) => proche(p, 0, 0.1))).toBe(true);
    expect(e.boucles[0]!.some((p) => proche(p, 4, -0.1))).toBe(true);
    expect(e.jonctions).toEqual([]);
  });

  it("angle en L dans un tracé continu : onglet, aire exacte", () => {
    const e = empreinteMur({ ...P, axe: [v3(0, 0, 0), v3(4, 0, 0), v3(4, 3, 0)], ferme: false });
    expect(e.jonctions).toEqual(["angle"]);
    // Axe 7 m × 0,2 : l'onglet ne perd ni n'ajoute de matière.
    expect(aire(e.boucles[0]!)).toBeCloseTo(1.4, 9);
    expect(e.boucles[0]!.some((p) => proche(p, 4.1, -0.1))).toBe(true);
    expect(e.boucles[0]!.some((p) => proche(p, 3.9, 0.1))).toBe(true);
  });

  it("nu intérieur : le tracé est la face gauche", () => {
    const e = empreinteMur({ ...P, reference: "interieur", axe: [v3(0, 0, 0), v3(4, 0, 0)], ferme: false });
    expect(Math.max(...e.boucles[0]!.map((p) => p.y))).toBeCloseTo(0, 9);
    expect(Math.min(...e.boucles[0]!.map((p) => p.y))).toBeCloseTo(-0.2, 9);
  });

  it("L entre deux murs joints par leurs extrémités : onglet des deux côtés", () => {
    const a = { ...P, id: "w1", axe: [v3(0, 0, 0), v3(4, 0, 0)], ferme: false };
    const b = { ...P, id: "w2", axe: [v3(4, 0, 0), v3(4, 3, 0)], ferme: false };
    const ea = empreinteMur(a, [b]);
    const eb = empreinteMur(b, [a]);
    expect(ea.jonctions).toEqual(["angle"]);
    expect(eb.jonctions).toEqual(["angle"]);
    expect(ea.boucles[0]!.some((p) => proche(p, 4.1, -0.1))).toBe(true);
    expect(eb.boucles[0]!.some((p) => proche(p, 4.1, -0.1))).toBe(true);
    // Somme des deux = même aire que le tracé continu.
    expect(aire(ea.boucles[0]!) + aire(eb.boucles[0]!)).toBeCloseTo(1.4, 9);
  });

  it("T : le mur s'arrête contre la face du mur traversant", () => {
    const t = { ...P, id: "w1", axe: [v3(0, 0, 0), v3(6, 0, 0)], ferme: false };
    const e = empreinteMur({ ...P, axe: [v3(3, 0, 0), v3(3, 4, 0)], ferme: false }, [t]);
    expect(e.jonctions).toEqual(["te"]);
    expect(Math.min(...e.boucles[0]!.map((p) => p.y))).toBeCloseTo(0.1, 9);
    expect(aire(e.boucles[0]!)).toBeCloseTo(3.9 * 0.2, 9);
  });

  it("croisement signalé, jamais corrigé", () => {
    const t = { ...P, id: "w1", axe: [v3(0, 0, 0), v3(6, 0, 0)], ferme: false };
    const e = empreinteMur({ ...P, axe: [v3(3, -2, 0), v3(3, 2, 0)], ferme: false }, [t]);
    expect(e.jonctions).toEqual(["croisement"]);
    expect(aire(e.boucles[0]!)).toBeCloseTo(0.8, 9);
  });

  it("angle trop aigu : erreur nommée", () => {
    const e = empreinteMur({ ...P, axe: [v3(0, 0, 0), v3(4, 0, 0), v3(0, 0.1, 0)], ferme: false });
    expect(e.erreur).toBe("aigu");
  });

  it("mur fermé : deux boucles, anneau d'aire exacte", () => {
    const e = empreinteMur({ ...P, axe: [v3(0, 0, 0), v3(4, 0, 0), v3(4, 3, 0), v3(0, 3, 0)], ferme: true });
    expect(e.boucles).toHaveLength(2);
    expect(Math.abs(aire(e.boucles[0]!) - aire(e.boucles[1]!))).toBeCloseTo(14 * 0.2, 9);
    expect(e.jonctions.filter((j) => j === "angle")).toHaveLength(4);
  });

  it("nettoyerAxe : points confondus retirés, boucle reconnue, axe trop court refusé", () => {
    expect(nettoyerAxe([v3(0, 0, 0), v3(0, 0, 0), v3(1, 0, 0)])).toEqual({ axe: [v3(0, 0, 0), v3(1, 0, 0)], ferme: false });
    expect(nettoyerAxe([v3(0, 0, 0), v3(1, 0, 0), v3(1, 1, 0), v3(0, 0, 0)])?.ferme).toBe(true);
    expect(nettoyerAxe([v3(0, 0, 0)])).toBeNull();
    expect(longueurAxe({ axe: [v3(0, 0, 0), v3(4, 0, 0), v3(4, 3, 0), v3(0, 3, 0)], ferme: true })).toBeCloseTo(14, 9);
  });
});

describe("murs : pose dans le modèle", () => {
  it("pose un mur : groupe extrudé de la hauteur, annotation, signature", () => {
    const r = ok(poserMurs(modeleVide(), [[v3(0, 0, 0), v3(4, 0, 0)]], P));
    const [w] = mursDuModele(r.modele);
    expect(w).toBeDefined();
    expect(r.ids).toEqual([w!.id]);
    const pts = sommetsDuMur(r.modele, w!.occurrence);
    expect(pts).toHaveLength(8);
    expect(Math.max(...pts.map((p) => p.z))).toBeCloseTo(2.5, 9);
    expect(murIntact(r.modele, w!)).toBe(true);
  });

  it("refus nommés : épaisseur, hauteur, axe", () => {
    expect(poserMurs(modeleVide(), [[v3(0, 0, 0), v3(4, 0, 0)]], { ...P, epaisseur: 0 })).toEqual({ ok: false, erreur: "epaisseur" });
    expect(poserMurs(modeleVide(), [[v3(0, 0, 0), v3(4, 0, 0)]], { ...P, hauteur: -1 })).toEqual({ ok: false, erreur: "hauteur" });
    expect(poserMurs(modeleVide(), [[v3(0, 0, 0)]], P)).toEqual({ ok: false, erreur: "axe" });
    expect(poserMurs(modeleVide(), [[v3(0, 0, 0), v3(4, 0, 0), v3(0, 0.1, 0)]], P)).toEqual({ ok: false, erreur: "aigu" });
  });

  it("second mur en L : le premier, intact, est régénéré avec l'onglet", () => {
    const m1 = ok(poserMurs(modeleVide(), [[v3(0, 0, 0), v3(4, 0, 0)]], P)).modele;
    const r = ok(poserMurs(m1, [[v3(4, 0, 0), v3(4, 3, 0)]], P));
    expect(r.jonctions).toContain("angle");
    const murs = mursDuModele(r.modele);
    expect(murs).toHaveLength(2);
    for (const w of murs) {
      expect(murIntact(r.modele, w)).toBe(true);
      expect(sommetsDuMur(r.modele, w.occurrence).some((p) => proche(p, 4.1, -0.1))).toBe(true);
      expect(jonctionsDuMur(r.modele, w).angle).toBe(1);
    }
  });

  it("voisin modifié à la main : jamais régénéré, signalé", () => {
    let m = ok(poserMurs(modeleVide(), [[v3(0, 0, 0), v3(4, 0, 0)]], P)).modele;
    const [w] = mursDuModele(m);
    const haut = Object.values(contexte(m, w!.occurrence).faces).find((f) => f.normale.z > 0.5)!;
    m = pousserTirer(m, haut.id, 0.5, { dans: w!.occurrence }).modele;
    const signatureAvant = mursDuModele(m)[0]!.signature;
    expect(murIntact(m, mursDuModele(m)[0]!)).toBe(false);
    const r = ok(poserMurs(m, [[v3(4, 0, 0), v3(4, 3, 0)]], P));
    expect(r.jonctions).toContain("voisin-modifie");
    expect(r.modele.annotations?.murs?.[w!.id]?.signature).toBe(signatureAvant);
  });

  it("mur fermé : un seul groupe annulaire", () => {
    const r = ok(poserMurs(modeleVide(), [[v3(0, 0, 0), v3(4, 0, 0), v3(4, 3, 0), v3(0, 3, 0), v3(0, 0, 0)]], P));
    const [w] = mursDuModele(r.modele);
    expect(w!.ferme).toBe(true);
    expect(sommetsDuMur(r.modele, w!.occurrence)).toHaveLength(16);
  });

  it("murs depuis les arêtes : chaînes ordonnées", () => {
    let m = modeleVide();
    m = ajouterSegment(m, v3(0, 0, 0), v3(4, 0, 0)).modele;
    m = ajouterSegment(m, v3(4, 0, 0), v3(4, 3, 0)).modele;
    const chaines = chainesDAretes(m, Object.keys(m.racine.aretes));
    expect(chaines).toHaveLength(1);
    expect(chaines[0]).toHaveLength(3);
    expect(longueurAxe({ axe: chaines[0]!, ferme: false })).toBeCloseTo(7, 9);
  });

  it("persistance : document relu, delta valide, mur reçu vérifié ; oublier garde la géométrie", () => {
    const m = ok(poserMurs(modeleVide(), [[v3(0, 0, 0), v3(4, 0, 0)]], P)).modele;
    const relu = lireModelePlanche(JSON.parse(JSON.stringify(m)));
    expect(relu && mursDuModele(relu)).toHaveLength(1);
    const d = differencePlanche(modeleVide(), m);
    expect(estDeltaPlanche(JSON.parse(JSON.stringify(d)))).toBe(true);
    expect(mursDuModele(appliquerDeltaPlanche(modeleVide(), d!))).toHaveLength(1);
    const [w] = mursDuModele(m);
    expect(estMur(w!.id, w)).toBe(true);
    expect(estMur(w!.id, { ...w, epaisseur: 0 })).toBe(false);
    expect(estMur(w!.id, { ...w, reference: "milieu" })).toBe(false);
    const o = oublierMur(m, w!.id);
    expect(mursDuModele(o)).toHaveLength(0);
    expect(o.racine.occurrences[w!.occurrence]).toBeDefined();
  });
});
