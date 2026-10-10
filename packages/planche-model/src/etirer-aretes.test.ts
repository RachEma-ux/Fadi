import { describe, expect, it } from "vitest";
import { type Id, type Modele, aire, ajouterPolygone, ajouterSegment, etirerAretes, modeleVide } from "./geometrie-libre.js";
import { v3 } from "./vecteur.js";

const faces = (m: Modele) => Object.values(m.racine.faces);
const aretes = (m: Modele) => Object.values(m.racine.aretes);
const aireTotale = (m: Modele) => faces(m).reduce((s, f) => s + aire(m, f.id), 0);
const premiere = (m: Modele) => Object.keys(m.racine.aretes)[0] as Id;

describe("Pousser/Tirer d'arêtes (écart Fadi, D-196)", () => {
  it("un segment tiré de côté dans le plan devient un rectangle plein", () => {
    const m = ajouterSegment(modeleVide(), v3(0, 0, 0), v3(4, 0, 0)).modele;
    const r = etirerAretes(m, [premiere(m)], v3(0, 3, 0)).modele;
    expect(faces(r)).toHaveLength(1);
    expect(aretes(r)).toHaveLength(4);
    expect(aireTotale(r)).toBeCloseTo(12, 9);
  });

  it("un segment tiré vers le haut devient une face verticale", () => {
    const m = ajouterSegment(modeleVide(), v3(0, 0, 0), v3(4, 0, 0)).modele;
    const r = etirerAretes(m, [premiere(m)], v3(0, 0, 2.7)).modele;
    expect(faces(r)).toHaveLength(1);
    expect(aireTotale(r)).toBeCloseTo(10.8, 9);
    expect(Math.abs(faces(r)[0]?.normale.y ?? 0)).toBeCloseTo(1, 9);
  });

  it("des deux côtés : la surface s'étend de −v à +v, l'arête d'origine reste comme ligne médiane", () => {
    const m = ajouterSegment(modeleVide(), v3(0, 0, 0), v3(4, 0, 0)).modele;
    const r = etirerAretes(m, [premiere(m)], v3(0, 1, 0), { symetrique: true }).modele;
    expect(aireTotale(r)).toBeCloseTo(8, 9);
    expect(faces(r)).toHaveLength(2);
  });

  it("deux segments reliés (L) tirés vers le haut : deux faces qui partagent l'arête balayée du coin", () => {
    let m = ajouterSegment(modeleVide(), v3(0, 0, 0), v3(4, 0, 0)).modele;
    m = ajouterSegment(m, v3(4, 0, 0), v3(4, 3, 0)).modele;
    const r = etirerAretes(m, Object.keys(m.racine.aretes), v3(0, 0, 2)).modele;
    expect(faces(r)).toHaveLength(2);
    expect(aireTotale(r)).toBeCloseTo(14, 9);
    expect(aretes(r)).toHaveLength(7);
  });

  it("une arête de cercle entraîne tout le cercle : tube lisse, courbe translatée, base conservée", () => {
    const m = ajouterPolygone(modeleVide(), v3(0, 0, 0), v3(0, 0, 1), 1, 24).modele;
    expect(faces(m)).toHaveLength(1); // face automatique du cercle
    const r = etirerAretes(m, [premiere(m)], v3(0, 0, 2)).modele;
    expect(faces(r)).toHaveLength(25);
    const laterale = aireTotale(r) - aire(r, faces(m)[0]?.id as Id);
    const perimetre = 24 * 2 * Math.sin(Math.PI / 24);
    expect(laterale).toBeCloseTo(perimetre * 2, 9);
    expect(aretes(r).filter((a) => a.adoucie)).toHaveLength(24);
    expect(Object.values(r.racine.courbes)).toHaveLength(2);
    // Surface orientée vers l'extérieur.
    for (const f of faces(r)) {
      if (Math.abs(f.normale.z) > 0.5) continue;
      const p = r.racine.sommets[f.exterieur[0] as Id]?.position;
      expect((f.normale.x * (p?.x ?? 0) + f.normale.y * (p?.y ?? 0)) > 0).toBe(true);
    }
  });

  it("un polygone tiré garde des arêtes vives", () => {
    const m = ajouterPolygone(modeleVide(), v3(0, 0, 0), v3(0, 0, 1), 1, 6, { genre: "polygone" }).modele;
    const r = etirerAretes(m, [premiere(m)], v3(0, 0, 1)).modele;
    expect(faces(r)).toHaveLength(7);
    expect(aretes(r).filter((a) => a.adoucie)).toHaveLength(0);
  });

  it("refus : courbe fermée tirée dans son propre plan, déplacement parallèle à l'arête, distance nulle", () => {
    const c = ajouterPolygone(modeleVide(), v3(0, 0, 0), v3(0, 0, 1), 1, 12).modele;
    expect(() => etirerAretes(c, [premiere(c)], v3(1, 0, 0))).toThrow(/propre plan/);
    const s = ajouterSegment(modeleVide(), v3(0, 0, 0), v3(4, 0, 0)).modele;
    expect(() => etirerAretes(s, [premiere(s)], v3(2, 0, 0))).toThrow(/parallèle/);
    expect(() => etirerAretes(s, [premiere(s)], v3(0, 0, 0))).toThrow(/nulle/);
    expect(() => etirerAretes(s, ["a999"], v3(0, 0, 1))).toThrow(/inconnue/);
  });
});
