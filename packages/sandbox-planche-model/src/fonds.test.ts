import { describe, expect, it } from "vitest";
import { lireModelePlanche } from "./delta.js";
import { estOriginalFond, ajouterPointCalage, calerFond, choisirMethode, coinsFond, estFond, importerFond, residusCalage, saisirCible, saisirLongueur, similitude, supprimerPointCalage, verrouillerFond, versPixel, versPlan } from "./fonds.js";
import { fondVise } from "./outils/calage.js";
import { type Id, type Modele, modeleVide } from "./geometrie-libre.js";

const IMG = "data:image/png;base64,iVBORw0KGgo=";
const fond = (m: Modele = modeleVide()) => {
  const r = importerFond(m, { nom: "plan.png", image: IMG, largeurPx: 1000, hauteurPx: 500, altitude: 0 });
  if (!r.ok) throw new Error(r.erreur);
  return { m: r.modele, id: r.id };
};
const ok = <T extends { ok: boolean }>(r: T): T & { ok: true } => {
  if (!r.ok) throw new Error(JSON.stringify(r));
  return r as T & { ok: true };
};

describe("Fonds calés", () => {
  it("import : pose provisoire 1 px = 1 cm, coin haut gauche à l'origine, non calé ; relu par le document", () => {
    const { m, id } = fond();
    const f = m.annotations!.fonds![id]!;
    expect(f.cale).toBe(false);
    expect(coinsFond(f)[0]).toEqual({ x: 0, y: 5 });
    expect(coinsFond(f)[2]).toEqual({ x: 10, y: 0 });
    expect(lireModelePlanche(JSON.parse(JSON.stringify(m)))).not.toBeNull();
    expect(estFond(id, { ...f, opacite: 2 })).toBe(false);
    expect(importerFond(modeleVide(), { nom: "x", image: "data:text/html;base64,AA==", largeurPx: 1, hauteurPx: 1, altitude: 0 })).toEqual({ ok: false, erreur: "image" });
  });

  it("versPlan / versPixel sont inverses", () => {
    const p = { echelle: 0.0035, rotation: 0.3, x: 12, y: -4 };
    const q = versPixel(p, versPlan(p, { u: 321, v: 77 }));
    expect(q.u).toBeCloseTo(321, 9);
    expect(q.v).toBeCloseTo(77, 9);
  });

  it("deux points et une longueur : échelle = longueur / distance, A reste en place, résidus non évalués", () => {
    let { m, id } = fond();
    m = ok(ajouterPointCalage(m, id, { u: 100, v: 100 })).modele;
    m = ok(ajouterPointCalage(m, id, { u: 900, v: 100 })).modele;
    expect(calerFond(m, id)).toEqual({ ok: false, erreur: "longueur" });
    m = ok(saisirLongueur(m, id, 12.4)).modele;
    const avant = versPlan(m.annotations!.fonds![id]!.pose, { u: 100, v: 100 });
    m = ok(calerFond(m, id)).modele;
    const f = m.annotations!.fonds![id]!;
    expect(f.cale).toBe(true);
    expect(f.pose.echelle).toBeCloseTo(12.4 / 800, 12);
    const a = versPlan(f.pose, { u: 100, v: 100 });
    expect(a.x).toBeCloseTo(avant.x, 9);
    expect(a.y).toBeCloseTo(avant.y, 9);
    expect(residusCalage(f)).toBeNull();
  });

  it("paires de points : similitude exacte retrouvée, résidus nuls à trois paires ; un point faux a le plus grand résidu", () => {
    const vraie = { echelle: 0.02, rotation: 0.4, x: 100, y: 200 };
    let { m, id } = fond();
    m = ok(choisirMethode(m, id, "paires")).modele;
    const pixels = [{ u: 10, v: 20 }, { u: 800, v: 40 }, { u: 400, v: 450 }, { u: 50, v: 480 }];
    for (const p of pixels) m = ok(ajouterPointCalage(m, id, p)).modele;
    for (const [i, p] of pixels.entries()) m = ok(saisirCible(m, id, "ABCD"[i]!, versPlan(vraie, p))).modele;
    m = ok(calerFond(m, id)).modele;
    let f = m.annotations!.fonds![id]!;
    expect(f.pose.echelle).toBeCloseTo(0.02, 9);
    expect(f.pose.rotation).toBeCloseTo(0.4, 9);
    expect(residusCalage(f)!.moyen).toBeLessThan(1e-6);
    // D décalé de 30 cm : il porte le plus grand résidu.
    const d = versPlan(vraie, pixels[3]!);
    m = ok(saisirCible(m, id, "D", { x: d.x + 0.3, y: d.y })).modele;
    m = ok(calerFond(m, id)).modele;
    f = m.annotations!.fonds![id]!;
    const r = residusCalage(f)!;
    expect(Math.max(...Object.values(r.points))).toBe(r.points["D"]);
    expect(r.moyen).toBeGreaterThan(0.05);
  });

  it("verrouillé : points et calage refusés ; suppression d'un point renomme les suivants", () => {
    let { m, id } = fond();
    for (const u of [10, 20, 30]) m = ok(ajouterPointCalage(m, id, { u, v: 5 })).modele;
    m = ok(supprimerPointCalage(m, id, "A")).modele;
    expect(m.annotations!.fonds![id]!.points.map((p) => [p.id, p.pixel.u])).toEqual([["A", 20], ["B", 30]]);
    m = ok(verrouillerFond(m, id, true)).modele;
    expect(ajouterPointCalage(m, id, { u: 1, v: 1 })).toEqual({ ok: false, erreur: "verrouille" });
    expect(calerFond(m, id)).toEqual({ ok: false, erreur: "verrouille" });
    expect(ajouterPointCalage(m, "j999" as Id, { u: 1, v: 1 })).toEqual({ ok: false, erreur: "absent" });
  });

  it("similitude : pixels confondus refusés", () => {
    expect(similitude([{ pixel: { u: 1, v: 1 }, cible: { x: 0, y: 0 } }, { pixel: { u: 1, v: 1 }, cible: { x: 1, y: 0 } }])).toBeNull();
  });

  it("outil Calage : le rayon vertical touche le fond au bon pixel ; verrouillé ou hors du fond, rien", () => {
    const { m } = fond();
    const f = Object.values(m.annotations!.fonds!)[0]!;
    const v = fondVise([f], { origine: { x: 2.5, y: 4, z: 10 }, direction: { x: 0, y: 0, z: -1 } });
    expect(v?.u).toBeCloseTo(250, 6);
    expect(v?.v).toBeCloseTo(100, 6);
    expect(fondVise([{ ...f, verrouille: true }], { origine: { x: 2.5, y: 4, z: 10 }, direction: { x: 0, y: 0, z: -1 } })).toBeNull();
    expect(fondVise([f], { origine: { x: 20, y: 4, z: 10 }, direction: { x: 0, y: 0, z: -1 } })).toBeNull();
  });

  it("fonds superposés à la même altitude : le fond choisi l'emporte, sinon le dernier (dessiné au-dessus)", () => {
    const a = fond();
    const b = fond(a.m);
    const [fa, fb] = Object.values(b.m.annotations!.fonds!);
    const rayon = { origine: { x: 2.5, y: 4, z: 10 }, direction: { x: 0, y: 0, z: -1 } };
    expect(fondVise([fa!, fb!], rayon)?.fond.id).toBe(fb!.id);
    expect(fondVise([fa!, fb!], rayon, fa!.id)?.fond.id).toBe(fa!.id);
    expect(fondVise([fa!, fb!], rayon, fb!.id)?.fond.id).toBe(fb!.id);
    // Un fond plus haut reste visé d'abord, même si l'autre est choisi.
    expect(fondVise([fa!, { ...fb!, altitude: 1 }], rayon, fa!.id)?.fond.id).toBe(fb!.id);
  });

  it("original archivé : gardé par l'import et les opérations, relu par le document ; forme fautive refusée", () => {
    const original = { id: "sbxfond_123e4567-e89b-12d3-a456-426614174000", empreinte: "a".repeat(64), taille: 1234, type: "image/png" as const };
    const r = ok(importerFond(modeleVide(), { nom: "plan.png", image: IMG, largeurPx: 10, hauteurPx: 10, altitude: 0, original }));
    const v = ok(verrouillerFond(r.modele, r.id, true));
    expect(v.modele.annotations!.fonds![r.id]!.original).toEqual(original);
    expect(lireModelePlanche(JSON.parse(JSON.stringify(v.modele)))!.annotations!.fonds![r.id]!.original).toEqual(original);
    expect(estOriginalFond({ ...original, empreinte: "xyz" })).toBe(false);
    expect(importerFond(modeleVide(), { nom: "plan.png", image: IMG, largeurPx: 10, hauteurPx: 10, altitude: 0, original: { ...original, type: "image/gif" as never } })).toEqual({ ok: false, erreur: "image" });
  });
});
