/** Protocole 1.7 (cas 3, lot 5, géométrie placée et contrôles) : objets.lire, geometrie.intersection, modele.lire { details }. */
import { describe, expect, it } from "vitest";
import { ajouterRectangle, modeleVide, type Id, type Modele } from "./geometrie-libre.js";
import { collisionsEntreObjets, traverseeFaces, type FacePlacee } from "./intersections-extensions.js";
import type { PermissionExtension } from "./protocole-extensions.js";
import { creerFonctionsPlanche } from "./scripts.js";
import { creerServicesExtension, type AccesPlanche } from "./services-extensions.js";
import { v3, type Vec3 } from "./vecteur.js";

function planche(depart: Modele) {
  const acces: AccesPlanche = {
    modele: () => depart,
    selection: () => [],
    dans: () => undefined,
    appliquer: () => true,
    selectionner: () => {},
  };
  return acces;
}
const LIRE: readonly PermissionExtension[] = ["modele.lire"];
const servir = (acces: AccesPlanche, nom: string, donnees: unknown, permissions: readonly PermissionExtension[] = LIRE) => {
  const s = creerServicesExtension({ id: "essai", permissions }, acces);
  s.debutAppel("commande.essai");
  const r = s.servir(nom, donnees);
  s.finAppel(r.ok);
  return r;
};
const ok = <T>(r: { ok: boolean; resultat?: unknown }): T => {
  expect(r).toMatchObject({ ok: true });
  return (r as { resultat: T }).resultat;
};

/** Face carrée placée, de côté 2, centrée en `c`, dans le plan engendré par `u` et `w`. */
const carre = (id: Id, c: Vec3, u: Vec3, w: Vec3, trous: Vec3[][] = []): FacePlacee => {
  const p = (a: number, b: number) => v3(c.x + a * u.x + b * w.x, c.y + a * u.y + b * w.y, c.z + a * u.z + b * w.z);
  const n = v3(u.y * w.z - u.z * w.y, u.z * w.x - u.x * w.z, u.x * w.y - u.y * w.x);
  return { id, chemin: [], exterieur: [p(-1, -1), p(1, -1), p(1, 1), p(-1, 1)], trous, normale: n };
};
const X = v3(1, 0, 0), Y = v3(0, 1, 0), Z = v3(0, 0, 1);
const longueur = (s: readonly (readonly [Vec3, Vec3])[]) => s.reduce((t, [a, b]) => t + Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z), 0);

describe("protocole 1.7 : traversée face contre face (logique pure)", () => {
  it("deux carrés perpendiculaires qui se croisent : un segment, de la longueur de la partie commune", () => {
    const s = traverseeFaces(carre("a", v3(0, 0, 0), X, Y), carre("b", v3(0.5, 0, 0), Y, Z));
    expect(s).toHaveLength(1);
    expect(longueur(s)).toBeCloseTo(2, 9);
    expect(s[0]![0].x).toBeCloseTo(0.5, 9);
  });
  it("un contact sans traversée (bord posé sur la face), des faces parallèles ou disjointes : rien", () => {
    // Carré vertical posé sur le carré horizontal : son bord inférieur est dans le plan, il ne le traverse pas.
    expect(traverseeFaces(carre("a", v3(0, 0, 0), X, Y), carre("b", v3(0, 0, 1), Y, Z))).toEqual([]);
    expect(traverseeFaces(carre("a", v3(0, 0, 0), X, Y), carre("b", v3(0, 0, 1), X, Y))).toEqual([]);
    expect(traverseeFaces(carre("a", v3(0, 0, 0), X, Y), carre("b", v3(0, 0, 0), X, Y))).toEqual([]);
    expect(traverseeFaces(carre("a", v3(0, 0, 0), X, Y), carre("b", v3(5, 0, 0), Y, Z))).toEqual([]);
  });
  it("un trou de la face coupe le segment en deux (pair-impair)", () => {
    const trou = [v3(-0.5, -0.5, 0), v3(-0.5, 0.5, 0), v3(0.5, 0.5, 0), v3(0.5, -0.5, 0)];
    const s = traverseeFaces(carre("a", v3(0, 0, 0), X, Y, [trou]), carre("b", v3(0, 0, 0), Y, Z));
    expect(s).toHaveLength(2);
    expect(longueur(s)).toBeCloseTo(1, 9);
  });
  it("collisions par objet : chaque paire une fois, jamais un objet contre lui-même ; liste « contre » respectée", () => {
    const faces = [
      { ...carre("a1", v3(0, 0, 0), X, Y), chemin: ["A"] },
      { ...carre("a2", v3(0.5, 0, 0), Y, Z), chemin: ["A"] },
      { ...carre("b1", v3(-0.5, 0, 0), Y, Z), chemin: ["B"] },
      { ...carre("c1", v3(9, 0, 0), Y, Z), chemin: ["C"] },
    ];
    const de = (ids: string[]) => (f: FacePlacee) => f.chemin.find((c) => ids.includes(c)) ?? null;
    const r = collisionsEntreObjets(faces, de(["A", "B", "C"]));
    expect(r.tronque).toBe(false);
    expect(r.collisions.map((c) => [c.a, c.b, c.faces])).toEqual([["A", "B", [["a1", "b1"]]]]);
    expect(r.collisions[0]!.longueur).toBeCloseTo(2, 9);
    expect(collisionsEntreObjets(faces, de(["C"]), de(["A", "B"])).collisions).toEqual([]);
  });
});

/** Deux boîtes groupées : A (0..2)³, B déplacée de `decalage` ; un groupe C contient B (imbrication). */
function deuxBoites(decalage: [number, number, number]) {
  const f = creerFonctionsPlanche(modeleVide());
  const a = f.api.grouper(f.api.boite([0, 0, 0], 2, 2, 2), "A") as Id;
  const b = f.api.grouper(f.api.boite([0, 0, 0], 2, 2, 2), "B") as Id;
  f.api.deplacer([b], decalage);
  const c = f.api.grouper([b], "C") as Id;
  return { m: f.modele(), a, b, c };
}

describe("protocole 1.7 : geometrie.intersection", () => {
  it("deux boîtes qui se chevauchent se traversent ; un objet imbriqué sert de liste", () => {
    const { m, a, b, c } = deuxBoites([1, 1, 1]);
    const r = ok<{ collisions: { a: Id; b: Id; longueur: number; segments: number[][][] }[]; tronque: boolean }>(servir(planche(m), "geometrie.intersection", { objets: [a, b] }));
    expect(r.tronque).toBe(false);
    expect(r.collisions).toHaveLength(1);
    expect([r.collisions[0]!.a, r.collisions[0]!.b].sort()).toEqual([a, b].sort());
    // Les arêtes de l'intersection de deux cubes décalés d'un mètre en diagonale : 6 segments d'un mètre.
    expect(r.collisions[0]!.longueur).toBeCloseTo(6, 6);
    const contre = ok<{ collisions: { a: Id; b: Id }[] }>(servir(planche(m), "geometrie.intersection", { objets: [a], contre: [c] }));
    expect(contre.collisions.map((x) => [x.a, x.b])).toEqual([[a, c]]);
  });
  it("deux boîtes accolées (face contre face) ne se traversent pas", () => {
    const { m, a, b } = deuxBoites([2, 0, 0]);
    expect(ok<{ collisions: unknown[] }>(servir(planche(m), "geometrie.intersection", { objets: [a, b] })).collisions).toEqual([]);
  });
  it("refuse une liste vide ou mal formée, un objet inconnu, et sans permission modele.lire", () => {
    const { m, a } = deuxBoites([1, 1, 1]);
    for (const faux of [{}, { objets: [] }, { objets: "x" }, { objets: [a], contre: [] }, { objets: [1] }]) expect(servir(planche(m), "geometrie.intersection", faux)).toMatchObject({ ok: false, erreur: "argument_invalide" });
    expect(servir(planche(m), "geometrie.intersection", { objets: [a, "inconnu"] })).toEqual({ ok: false, erreur: "objet_introuvable", detail: "inconnu" });
    expect(servir(planche(m), "geometrie.intersection", { objets: [a] }, [])).toEqual({ ok: false, erreur: "permission_refusee", detail: "modele.lire" });
  });
});

const ORIGINE_B = [3, 0, 1];
describe("protocole 1.7 : objets.lire", () => {
  it("tous les objets à tous les niveaux, avec parent, chemin, matrice dans le modèle, origine, axes et contenu", () => {
    const { m, a, b, c } = deuxBoites([3, 0, 1]);
    const { objets } = ok<{ objets: { id: Id; nom: string; genre: string; parent: Id | null; chemin: Id[]; origine: number[]; axes: { x: number[] }; contenu: { faces: number; aretes: number; objets: number }; masque: boolean; verrouille: boolean }[] }>(servir(planche(m), "objets.lire", null));
    expect(objets.map((o) => o.id).sort()).toEqual([a, b, c].sort());
    const ob = objets.find((o) => o.id === b)!;
    expect(ob).toMatchObject({ nom: "B", genre: "groupe", parent: c, chemin: [c, b], contenu: { faces: 6, aretes: 12, objets: 0 }, masque: false, verrouille: false });
    // La boîte B a été déplacée de (3, 0, 1) après son groupement : son origine dans le modèle a suivi.
    const oc = objets.find((o) => o.id === c)!;
    expect(oc).toMatchObject({ parent: null, chemin: [c], contenu: { faces: 0, aretes: 0, objets: 1 } });
    expect(ob.origine.map((v) => Math.round(v * 1e9) / 1e9)).toEqual(ORIGINE_B);
    expect(ob.axes.x).toEqual([1, 0, 0]);
    expect(servir(planche(m), "objets.lire", null, [])).toEqual({ ok: false, erreur: "permission_refusee", detail: "modele.lire" });
  });
});

describe("protocole 1.7 : modele.lire { details }", () => {
  it("normale unitaire et contours des trous, en portée contexte et monde ; sans details, rien ne change", () => {
    let m = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(4, 0, 0), v3(0, 4, 0)).modele;
    m = ajouterRectangle(m, v3(1, 1, 0), v3(1, 0, 0), v3(0, 1, 0)).modele;
    type F = { aire: number; trous: number; normale?: number[]; contoursTrous?: number[][][] };
    const sans = ok<{ faces: F[] }>(servir(planche(m), "modele.lire", null)).faces;
    expect(sans.every((f) => f.normale === undefined && f.contoursTrous === undefined)).toBe(true);
    for (const portee of ["contexte", "monde"]) {
      const faces = ok<{ faces: F[] }>(servir(planche(m), "modele.lire", { portee, details: true })).faces;
      const percee = faces.find((f) => f.trous === 1)!;
      expect(percee.aire).toBeCloseTo(15, 9);
      expect(Math.abs(percee.normale![2]!)).toBeCloseTo(1, 9);
      expect(percee.contoursTrous).toHaveLength(1);
      expect(percee.contoursTrous![0]!.map((p) => p.slice(0, 2)).sort()).toEqual([[1, 1], [1, 2], [2, 1], [2, 2]]);
    }
    expect(servir(planche(m), "modele.lire", { details: "oui" })).toMatchObject({ ok: false, erreur: "argument_invalide" });
  });
});
