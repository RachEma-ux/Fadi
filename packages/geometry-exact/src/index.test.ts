import { beforeAll, describe, expect, it } from "vitest";
import { MoteurExact, ErreurExacte, validerOperation, versBase64, depuisBase64, empreinteOctets, type SolideExact } from "./index.js";

const carre = (c: number, x0 = 0, y0 = 0) => [{ x: x0, y: y0 }, { x: x0 + c, y: y0 }, { x: x0 + c, y: y0 + c }, { x: x0, y: y0 + c }];
let M: MoteurExact;
beforeAll(async () => { M = await MoteurExact.charger(); });

describe("noyau exact (P2-1, D-177) — opérations", () => {
  it("extrusion d'un carré 2 × 2 sur 3 m : volume 12, 6 faces, brep reproductible", () => {
    const op = { type: "extrusion", extrusion: { profil: carre(2), z0: 0, hauteur: 3 } };
    const a = M.executer(op), b = M.executer(op);
    expect(a.volume).toBeCloseTo(12, 9);
    expect(a.faces).toBe(6);
    expect(a.solides).toBe(1);
    expect(a.maillage.indices.length / 3).toBe(12);
    expect(a.empreinte).toBe(b.empreinte);
    expect(a.brep).toBe(b.brep);
    expect(a.moteur).toBe("occt-wasm");
  });

  it("extrusion avec trou : volume = (aire − trou) × hauteur", () => {
    const s = M.executer({ type: "extrusion", extrusion: { profil: carre(4), trous: [carre(1, 1.5, 1.5)], z0: 1, hauteur: 2 } });
    expect(s.volume).toBeCloseTo((16 - 1) * 2, 9);
    expect(Math.min(...s.maillage.positions.filter((_, i) => i % 3 === 2))).toBeCloseTo(1, 9);
  });

  it("révolution d'un rectangle décalé de l'axe y, 360° : volume d'un tube", () => {
    const s = M.executer({ type: "revolution", profil: [{ x: 0.5, y: 0 }, { x: 0.7, y: 0 }, { x: 0.7, y: 1 }, { x: 0.5, y: 1 }], axe: { a: { x: 0, y: 0 }, b: { x: 0, y: 1 } }, angleDeg: 360 });
    expect(s.volume).toBeCloseTo(Math.PI * (0.7 ** 2 - 0.5 ** 2) * 1, 6);
    expect(s.solides).toBe(1);
  });

  it("révolution partielle 90° : un quart du volume", () => {
    const s = M.executer({ type: "revolution", profil: [{ x: 0.5, y: 0 }, { x: 0.7, y: 0 }, { x: 0.7, y: 1 }, { x: 0.5, y: 1 }], axe: { a: { x: 0, y: 0 }, b: { x: 0, y: 1 } }, angleDeg: 90 });
    expect(s.volume).toBeCloseTo((Math.PI * (0.7 ** 2 - 0.5 ** 2)) / 4, 6);
  });

  it("révolution refusée si le profil traverse l'axe", () => {
    expect(() => M.executer({ type: "revolution", profil: carre(2, -1, 0), axe: { a: { x: 0, y: 0 }, b: { x: 0, y: 1 } }, angleDeg: 360 })).toThrow(/traverse l'axe/);
  });

  it("balayage d'un carré 0,1 le long d'un trajet droit de 2 m : volume 0,02", () => {
    const profil = [{ x: -0.05, y: -0.05, z: 0 }, { x: 0.05, y: -0.05, z: 0 }, { x: 0.05, y: 0.05, z: 0 }, { x: -0.05, y: 0.05, z: 0 }];
    const s = M.executer({ type: "balayage", profil, trajet: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 2 }] });
    expect(s.volume).toBeCloseTo(0.02, 6);
  });

  it("lissage carré 1 → carré 0,5 (réglé) : tronc de pyramide, volume h/3 (A1 + A2 + √(A1A2))", () => {
    const bas = carre(1, -0.5, -0.5).map((p) => ({ ...p, z: 0 }));
    const haut = carre(0.5, -0.25, -0.25).map((p) => ({ ...p, z: 3 }));
    const s = M.executer({ type: "lissage", profils: [bas, haut], regle: true });
    expect(s.volume).toBeCloseTo((3 / 3) * (1 + 0.25 + Math.sqrt(0.25)), 6);
  });

  it("booléens : union, soustraction, intersection entre un brep et l'extrusion d'un objet paramétrique", () => {
    const a = M.executer({ type: "extrusion", extrusion: { profil: carre(2), z0: 0, hauteur: 2 } });
    const b = { extrusion: { profil: carre(2, 1, 1), z0: 0, hauteur: 2 } };
    expect(M.executer({ type: "booleen", op: "union", a: { brep: a.brep }, b }).volume).toBeCloseTo(8 + 8 - 2, 9);
    expect(M.executer({ type: "booleen", op: "soustraction", a: { brep: a.brep }, b }).volume).toBeCloseTo(8 - 2, 9);
    expect(M.executer({ type: "booleen", op: "intersection", a: { brep: a.brep }, b }).volume).toBeCloseTo(2, 9);
  });

  it("soustraction vide (A − A) refusée comme résultat sans solide", () => {
    const a = M.executer({ type: "extrusion", extrusion: { profil: carre(1), z0: 0, hauteur: 1 } });
    expect(() => M.executer({ type: "booleen", op: "soustraction", a: { brep: a.brep }, b: { brep: a.brep } })).toThrow(ErreurExacte);
  });

  it("trou traversant vertical Ø 0,2 dans un cube de 1 m : volume 1 − π·0,01", () => {
    const c = M.executer({ type: "extrusion", extrusion: { profil: carre(1), z0: 0, hauteur: 1 } });
    const s = M.executer({ type: "trou", solide: { brep: c.brep }, centre: { x: 0.5, y: 0.5, z: 1 }, direction: { x: 0, y: 0, z: -1 }, diametre: 0.2, profondeur: null });
    expect(s.volume).toBeCloseTo(1 - Math.PI * 0.01, 6);
  });

  it("trou borgne horizontal de 0,5 m de profondeur : volume 1 − π·0,01·0,5", () => {
    const c = M.executer({ type: "extrusion", extrusion: { profil: carre(1), z0: 0, hauteur: 1 } });
    const s = M.executer({ type: "trou", solide: { brep: c.brep }, centre: { x: 0, y: 0.5, z: 0.5 }, direction: { x: 1, y: 0, z: 0 }, diametre: 0.2, profondeur: 0.5 });
    expect(s.volume).toBeCloseTo(1 - Math.PI * 0.01 * 0.5, 5);
  });

  it("coque de 20 mm d'un cube de 1 m, dessus ouvert : volume = 1 − 0,96² × 0,98", () => {
    const c = M.executer({ type: "extrusion", extrusion: { profil: carre(1), z0: 0, hauteur: 1 } });
    const s = M.executer({ type: "coque", solide: { brep: c.brep }, epaisseur: 0.02, ouvrirDessus: true });
    expect(s.volume).toBeCloseTo(1 - 0.96 * 0.96 * 0.98, 6);
    const ferme = M.executer({ type: "coque", solide: { brep: c.brep }, epaisseur: 0.02, ouvrirDessus: false });
    expect(ferme.volume).toBeCloseTo(1 - 0.96 ** 3, 6);
  });

  it("surface : grille plane 2 × 2 de 1 m épaissie de 0,1 m → plaque de volume 0,1 ; grille bombée 3 × 3 → volume > 0", () => {
    const plane = M.executer({ type: "surface", controle: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 1, y: 1, z: 0 }], lignes: 2, colonnes: 2, epaisseur: 0.1 });
    expect(plane.volume).toBeCloseTo(0.1, 4);
    const pts: { x: number; y: number; z: number }[] = [];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) pts.push({ x: i, y: j, z: i === 1 && j === 1 ? 0.5 : 0 });
    const bombee = M.executer({ type: "surface", controle: pts, lignes: 3, colonnes: 3, epaisseur: 0.05 });
    expect(bombee.volume).toBeGreaterThan(0.15);
    expect(bombee.solides).toBe(1);
    expect(() => M.executer({ type: "surface", controle: pts, lignes: 2, colonnes: 2, epaisseur: 0.05 })).toThrow(ErreurExacte);
  });

  it("patch : face tendue sur un quadrilatère gauche, épaissie de 0,1 → volume ≈ aire × épaisseur", () => {
    const contour = [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 1, y: 1, z: 0.3 }, { x: 0, y: 1, z: 0 }];
    const s = M.executer({ type: "patch", contour, epaisseur: 0.1 });
    expect(s.volume).toBeGreaterThan(0.09);
    expect(s.volume).toBeLessThan(0.13);
    expect(s.solides).toBe(1);
  });

  it("congé de 0,1 m sur toutes les arêtes d'un cube de 1 m : volume 1 − (arêtes) + (sommets) ; rayon trop grand refusé", () => {
    const c = M.executer({ type: "extrusion", extrusion: { profil: carre(1), z0: 0, hauteur: 1 } });
    const s = M.executer({ type: "conge", solide: { brep: c.brep }, rayon: 0.1 });
    // Cube arrondi : 1 − 12·(1 − π/4)·r²·(1 − 2r) − 8·(1 − π/6)·r³ … expression exacte : (1−2r)³ + 3(1−2r)²·2r + 3(1−2r)·π r² + 4/3 π r³
    const r = 0.1, a = 1 - 2 * r;
    expect(s.volume).toBeCloseTo(a ** 3 + 3 * a * a * 2 * r + 3 * a * Math.PI * r * r + (4 / 3) * Math.PI * r ** 3, 5);
    expect(s.faces).toBe(26);
    expect(() => M.executer({ type: "conge", solide: { brep: c.brep }, rayon: 0.8 })).toThrow(ErreurExacte);
  });

  it("opérande posée : soustraction avec un brep tourné de 90° et translaté, export STEP posé", () => {
    const a = M.executer({ type: "extrusion", extrusion: { profil: carre(4), z0: 0, hauteur: 1 } });
    const outil = M.executer({ type: "extrusion", extrusion: { profil: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }, { x: 0, y: 1 }], z0: 0, hauteur: 1 } });
    // Tourné de 90° autour de l'origine : x ∈ [−1, 0], y ∈ [0, 2] ; translaté de (3, 0) : x ∈ [2, 3], y ∈ [0, 2] → dans a.
    const s = M.executer({ type: "booleen", op: "soustraction", a: { brep: a.brep }, b: { brep: outil.brep, pose: { x: 3, y: 0, angleDeg: 90 } } });
    expect(s.volume).toBeCloseTo(16 - 2, 9);
    const step = M.exporterStep(outil.brep, { x: 3, y: 0, angleDeg: 90 });
    expect(M.executer({ type: "import-step", step }).volume).toBeCloseTo(2, 6);
  });

  it("STEP : export d'un brep puis import, même volume", () => {
    const c = M.executer({ type: "extrusion", extrusion: { profil: carre(1), z0: 0, hauteur: 2 } });
    const step = M.exporterStep(c.brep);
    expect(step.startsWith("ISO-10303-21;")).toBe(true);
    const r = M.executer({ type: "import-step", step });
    expect(r.volume).toBeCloseTo(2, 6);
    expect(r.faces).toBe(6);
  });

  it("STEP à plusieurs solides : comptés, importés un par un par leur rang, refusés en bloc", () => {
    const deux = M.executer({ type: "booleen", op: "union", a: { extrusion: { profil: carre(1), z0: 0, hauteur: 1 } }, b: { extrusion: { profil: [{ x: 3, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 2 }, { x: 3, y: 2 }], z0: 0, hauteur: 1 } } });
    expect(deux.solides).toBe(2);
    const step = M.exporterStep(deux.brep);
    expect(M.compterSolidesStep(step)).toBe(2);
    const volumes = [0, 1].map((i) => M.executer({ type: "import-step", step, solide: i }).volume).sort((a, b) => a - b);
    expect(volumes[0]).toBeCloseTo(1, 6);
    expect(volumes[1]).toBeCloseTo(4, 6);
    expect(() => M.executer({ type: "import-step", step })).toThrow(/2 solides/);
    expect(() => M.executer({ type: "import-step", step, solide: 2 })).toThrow(/hors du fichier/);
    expect(() => validerOperation({ type: "import-step", step, solide: -1 })).toThrow(/rang/);
  });

  it("mailler un brep relu donne le même maillage que le résultat", () => {
    const c = M.executer({ type: "extrusion", extrusion: { profil: carre(1), z0: 0, hauteur: 1 } });
    expect(M.mailler(c.brep)).toEqual(c.maillage);
  });
});

describe("validation des entrées et outils", () => {
  it("refuse un point mal formé, une hauteur nulle, un type inconnu, un STEP qui n'en est pas un", () => {
    expect(() => validerOperation({ type: "extrusion", extrusion: { profil: [[0, 0], [1, 0], [1, 1]], z0: 0, hauteur: 1 } })).toThrow(ErreurExacte);
    expect(() => validerOperation({ type: "extrusion", extrusion: { profil: carre(1), z0: 0, hauteur: 0 } })).toThrow(/hauteur/);
    expect(() => validerOperation({ type: "congé" })).toThrow(/inconnue/);
    expect(() => validerOperation({ type: "import-step", step: "bonjour" })).toThrow(/STEP/);
    expect(() => validerOperation({ type: "trou", solide: { brep: "AAAA" }, centre: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 0, z: 0 }, diametre: 0.1, profondeur: null })).toThrow(/direction nulle/);
  });

  it("base64 et empreinte : aller-retour et stabilité", () => {
    const o = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255, 7]);
    expect(Array.from(depuisBase64(versBase64(o)))).toEqual(Array.from(o));
    expect(versBase64(new Uint8Array([77, 97]))).toBe("TWE=");
    expect(empreinteOctets(new Uint8Array([]))).toBe("cbf29ce484222325");
    expect(empreinteOctets(new Uint8Array([97]))).toBe("af63dc4c8601ec8c");
  });

  it("un brep base64 corrompu est refusé avant le noyau", () => {
    expect(() => M.executer({ type: "coque", solide: { brep: "***" }, epaisseur: 0.01, ouvrirDessus: false })).toThrow(ErreurExacte);
  });
});

export type _S = SolideExact;
