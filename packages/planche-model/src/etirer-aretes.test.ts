import { describe, expect, it } from "vitest";
import { type Id, type Modele, aire, ajouterPolygone, ajouterRectangle, ajouterSegment, allongerArete, couronne, deplacer, effacerArete, etirerAretes, modeleVide } from "./geometrie-libre.js";
import { appliquerDeltaPlanche, differencePlanche, empreintePlanche, lireModelePlanche } from "./delta.js";
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

  it("refus : déplacement parallèle à l'arête, distance nulle, arête inconnue", () => {
    const s = ajouterSegment(modeleVide(), v3(0, 0, 0), v3(4, 0, 0)).modele;
    expect(() => etirerAretes(s, [premiere(s)], v3(2, 0, 0))).toThrow(/parallèle/);
    expect(() => etirerAretes(s, [premiere(s)], v3(0, 0, 0))).toThrow(/nulle/);
    expect(() => etirerAretes(s, ["a999"], v3(0, 0, 1))).toThrow(/inconnue/);
  });
});

const sommetsDe = (m: Modele) => Object.values(m.racine.sommets).map((x) => x.position);
const contient = (m: Modele, x: number, y: number, z: number) => sommetsDe(m).some((p) => Math.abs(p.x - x) < 1e-9 && Math.abs(p.y - y) < 1e-9 && Math.abs(p.z - z) < 1e-9);
/** Aire d'un polygone régulier de N côtés d'apothème a. */
const airePolygone = (N: number, a: number) => N * a * a * Math.tan(Math.PI / N);
const liens = (m: Modele) => Object.values(m.annotations?.extrusions ?? {});

describe("Couronne : courbe fermée tirée dans son propre plan (D-196)", () => {
  const cercle = () => ajouterPolygone(modeleVide(), v3(0, 0, 0), v3(0, 0, 1), 1, 24).modele;
  const ap = Math.cos(Math.PI / 24);

  it("vers l'extérieur : disque + couronne, le contour décalé reste un cercle", () => {
    const m = cercle();
    const r = couronne(m, [premiere(m)], 0.5).modele;
    expect(faces(r)).toHaveLength(2);
    expect(aireTotale(r)).toBeCloseTo(airePolygone(24, ap + 0.5), 9);
    expect(Object.values(r.racine.courbes)).toHaveLength(2);
    const grand = Object.values(r.racine.courbes).find((k) => k.rayon > 1.2);
    expect(grand?.rayon).toBeCloseTo(1 + 0.5 / ap, 9);
  });

  it("vers l'intérieur : couronne + disque intérieur, aire totale inchangée", () => {
    const m = cercle();
    const r = couronne(m, [premiere(m)], -0.5).modele;
    expect(faces(r)).toHaveLength(2);
    expect(aireTotale(r)).toBeCloseTo(airePolygone(24, ap), 9);
  });

  it("des deux côtés : bande de −d à +d, le contour d'origine en ligne médiane", () => {
    const m = cercle();
    const r = couronne(m, [premiere(m)], 0.2, { symetrique: true }).modele;
    expect(faces(r)).toHaveLength(3);
    expect(aireTotale(r)).toBeCloseTo(airePolygone(24, ap + 0.2), 9);
  });

  it("Pousser/Tirer d'une courbe fermée dans son plan = couronne vers l'extérieur de la longueur tirée", () => {
    const m = cercle();
    const r = etirerAretes(m, [premiere(m)], v3(0.5, 0, 0)).modele;
    expect(aireTotale(r)).toBeCloseTo(airePolygone(24, ap + 0.5), 9);
  });

  it("boucle d'arêtes libres (carré 2 × 2) : couronne de 1 m → 16 m² au total, angles en onglet", () => {
    const m = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(2, 0, 0), v3(0, 2, 0)).modele;
    const r = couronne(m, Object.keys(m.racine.aretes), 1).modele;
    expect(aireTotale(r)).toBeCloseTo(16, 9);
    expect(contient(r, -1, -1, 0)).toBe(true);
  });

  it("refus : décalage intérieur qui retourne la forme, contour ouvert", () => {
    const m = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(2, 0, 0), v3(0, 2, 0)).modele;
    expect(() => couronne(m, Object.keys(m.racine.aretes), -1.5)).toThrow(/dépasse/);
    const s = ajouterSegment(modeleVide(), v3(0, 0, 0), v3(4, 0, 0)).modele;
    expect(() => couronne(s, [premiere(s)], 1)).toThrow(/contour plan fermé/);
  });
});

describe("Allonger une ligne dans son propre sens (D-196)", () => {
  const seg = () => ajouterSegment(modeleVide(), v3(0, 0, 0), v3(4, 0, 0)).modele;
  const bout = (m: Modele, x: number) => Object.values(m.racine.sommets).find((s) => Math.abs(s.position.x - x) < 1e-9)?.id as Id;

  it("extrémité libre : +1 → une seule arête de 5 m ; −1 → 3 m", () => {
    const m = seg();
    const r = allongerArete(m, premiere(m), bout(m, 4), 1).modele;
    expect(aretes(r)).toHaveLength(1);
    expect(contient(r, 5, 0, 0)).toBe(true);
    const q = allongerArete(m, premiere(m), bout(m, 4), -1).modele;
    expect(aretes(q)).toHaveLength(1);
    expect(contient(q, 3, 0, 0)).toBe(true);
    expect(() => allongerArete(m, premiere(m), bout(m, 4), -5)).toThrow(/dépasse/);
  });

  it("arête reliée (bord d'un rectangle) : allonger ajoute un segment colinéaire, raccourcir est refusé", () => {
    const m = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(4, 0, 0), v3(0, 3, 0)).modele;
    const a = Object.values(m.racine.aretes).find((x) => {
      const A = m.racine.sommets[x.a]?.position;
      const B = m.racine.sommets[x.b]?.position;
      return A && B && A.y === 0 && B.y === 0;
    });
    const r = allongerArete(m, a?.id as Id, bout(m, 4) && (Object.values(m.racine.sommets).find((s) => s.position.x === 4 && s.position.y === 0)?.id as Id), 1).modele;
    expect(aretes(r)).toHaveLength(5);
    expect(contient(r, 5, 0, 0)).toBe(true);
    expect(() => allongerArete(m, a?.id as Id, Object.values(m.racine.sommets).find((s) => s.position.x === 4 && s.position.y === 0)?.id as Id, -1)).toThrow(/Gomme/);
  });

  it("arête de courbe : refus", () => {
    const m = ajouterPolygone(modeleVide(), v3(0, 0, 0), v3(0, 0, 1), 1, 12).modele;
    const a = Object.values(m.racine.aretes)[0];
    expect(() => allongerArete(m, a?.id as Id, a?.a as Id, 1)).toThrow(/courbe/);
  });
});

describe("Lien surface ↔ arêtes sources (D-196)", () => {
  it("déplacer l'arête source recalcule la surface", () => {
    const m = ajouterSegment(modeleVide(), v3(0, 0, 0), v3(4, 0, 0)).modele;
    const src = premiere(m);
    const r = etirerAretes(m, [src], v3(0, 0, 2)).modele;
    expect(liens(r)).toHaveLength(1);
    const d = deplacer(r, [src], v3(0, 1, 0)).modele;
    expect(liens(d)).toHaveLength(1);
    expect(faces(d)).toHaveLength(1);
    expect(aireTotale(d)).toBeCloseTo(8, 9);
    expect(contient(d, 0, 1, 2)).toBe(true);
    expect(contient(d, 0, 0, 2)).toBe(false);
  });

  it("une couronne suit son cercle déplacé", () => {
    const m = ajouterPolygone(modeleVide(), v3(0, 0, 0), v3(0, 0, 1), 1, 24).modele;
    const r = couronne(m, [premiere(m)], 0.5).modele;
    const cercleIds = Object.values(r.racine.aretes).filter((a) => {
      const k = a.courbe ? r.racine.courbes[a.courbe] : undefined;
      return k && Math.abs(k.rayon - 1) < 1e-9;
    }).map((a) => a.id);
    const d = deplacer(r, cercleIds, v3(3, 0, 0)).modele;
    expect(liens(d)).toHaveLength(1);
    const xs = sommetsDe(d).map((p) => p.x);
    expect(Math.min(...xs)).toBeGreaterThan(1);
    expect(aireTotale(d)).toBeCloseTo(airePolygone(24, Math.cos(Math.PI / 24) + 0.5), 9);
  });

  it("modifier la surface elle-même ou effacer la source rompt le lien ; la surface reste", () => {
    const m = ajouterSegment(modeleVide(), v3(0, 0, 0), v3(4, 0, 0)).modele;
    const src = premiere(m);
    const r = etirerAretes(m, [src], v3(0, 0, 2)).modele;
    const haut = Object.values(r.racine.aretes).find((a) => r.racine.sommets[a.a]?.position.z === 2 && r.racine.sommets[a.b]?.position.z === 2)?.id as Id;
    const d = deplacer(r, [haut], v3(0, 0, 1)).modele;
    expect(liens(d)).toHaveLength(0);
    expect(faces(d)).toHaveLength(1);
    const g = effacerArete(r, src).modele;
    expect(liens(g)).toHaveLength(0);
  });

  it("le lien voyage dans le delta et la lecture du modèle", () => {
    const m = ajouterSegment(modeleVide(), v3(0, 0, 0), v3(4, 0, 0)).modele;
    const r = etirerAretes(m, [premiere(m)], v3(0, 0, 2)).modele;
    const d = differencePlanche(m, r);
    expect(d).not.toBeNull();
    expect(empreintePlanche(appliquerDeltaPlanche(m, d!))).toBe(empreintePlanche(r));
    expect(lireModelePlanche(JSON.parse(JSON.stringify(r)))).not.toBeNull();
  });
});

