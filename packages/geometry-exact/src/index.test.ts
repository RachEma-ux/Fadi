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

describe("lot F2 — booléens des solides libres de Studio, instance unique (IF-003, TR-EX-062)", () => {
  it("union, soustraction, intersection de deux extrusions (boîtes Studio 2 × 2 × 2 décalées de 1 m) : 12, 4, 4 m³ ; empreinte reproductible", () => {
    const a = { extrusion: { profil: carre(2), z0: 0, hauteur: 2 } }, b = { extrusion: { profil: carre(2, 1, 0), z0: 0, hauteur: 2 } };
    const u = M.executer({ type: "booleen", op: "union", a, b });
    expect(u.volume).toBeCloseTo(12, 9);
    expect(u.solides).toBe(1);
    expect(M.executer({ type: "booleen", op: "union", a, b }).empreinte).toBe(u.empreinte);
    expect(M.executer({ type: "booleen", op: "soustraction", a, b }).volume).toBeCloseTo(4, 9);
    expect(M.executer({ type: "booleen", op: "intersection", a, b }).volume).toBeCloseTo(4, 9);
    // Chaîne : le résultat exact sert d'opérande (son brep) à un second booléen.
    expect(M.executer({ type: "booleen", op: "soustraction", a: { brep: u.brep }, b: { extrusion: { profil: carre(1, 0, 0), z0: 0, hauteur: 2 } } }).volume).toBeCloseTo(10, 9);
  });

  it("intersection vide refusée (aucun solide), jamais un résultat vide engagé", () => {
    expect(() => M.executer({ type: "booleen", op: "intersection", a: { extrusion: { profil: carre(1), z0: 0, hauteur: 1 } }, b: { extrusion: { profil: carre(1, 5, 5), z0: 0, hauteur: 1 } } })).toThrow(/aucun solide|vide/);
  });

  it("TR-EX-062 : allocations WebAssembly mesurées — mémoire linéaire du noyau relevée après chaque calcul, croissante, jamais nulle", async () => {
    const avant = MoteurExact.memoireWasmOctets();
    expect(avant).toBeGreaterThan(0);
    const releves: number[] = [];
    for (let i = 0; i < 5; i++) {
      M.executer({ type: "booleen", op: "union", a: { extrusion: { profil: carre(2), z0: 0, hauteur: 2 } }, b: { extrusion: { profil: carre(2, 1 + i * 0.1, 0), z0: 0, hauteur: 2 } } });
      releves.push(MoteurExact.memoireWasmOctets()!);
    }
    // Multiple de la page WebAssembly (64 Kio) et jamais en baisse : c'est la mémoire linéaire réelle, pas une estimation.
    expect(releves.every((n, i) => n % 65536 === 0 && n >= (i === 0 ? avant! : releves[i - 1]!))).toBe(true);
  });

  it("instance unique : charger deux fois rend le même noyau, une seule instance compilée dans ce processus", async () => {
    const a = await MoteurExact.charger(), b = await MoteurExact.charger();
    expect(a).toBe(b);
    expect(MoteurExact.instancesCreees).toBe(1);
  });
});

describe("noyau exact — STEP nommé (E.6-04)", () => {
  const H = { horodatage: "2026-10-26T10:00:00", nomFichier: "studio-essai.step" };
  const pieces = () => [
    { nom: "boite-1", solides: [{ extrusion: { profil: carre(2), z0: 0, hauteur: 3 } }] },
    // Deux morceaux juxtaposés (mur avec vide) : un produit, deux solides, volume additionné.
    { nom: "mur-1", solides: [{ extrusion: { profil: carre(1, 5, 0), z0: 0, hauteur: 1 } }, { extrusion: { profil: carre(1, 5, 0), z0: 2, hauteur: 1 } }] },
    // Prisme oblique : lissage réglé entre deux carrés décalés (volume = aire × hauteur).
    { nom: "oblique~00E9~", solides: [{ lissage: [carre(1, 10, 0).map((p) => ({ ...p, z: 0 })), carre(1, 10.5, 0).map((p) => ({ ...p, z: 2 }))] as [{ x: number; y: number; z: number }[], { x: number; y: number; z: number }[]] }] },
  ];

  it("E.6-04 STEP : un produit nommé par pièce, unité millimètre déclarée et géométrie × 1 000, relu en mètres à l'identique", () => {
    const step = M.exporterStepPieces(pieces(), H);
    expect(step.startsWith("ISO-10303-21;")).toBe(true);
    expect(step).toMatch(/FILE_SCHEMA\(\('AUTOMOTIVE_DESIGN/);
    expect(step).toMatch(/SI_UNIT\(\.MILLI\.,\.METRE\.\)/);
    expect(step).toContain("FILE_NAME('studio-essai.step','2026-10-26T10:00:00'");
    expect(step).toContain("PRODUCT('boite-1','boite-1'");
    const lues = M.lireStepPieces(step);
    expect(lues.map((p) => p.nom)).toEqual(["boite-1", "mur-1", "oblique~00E9~"]);
    expect(lues.map((p) => p.solides)).toEqual([1, 2, 1]);
    expect(lues[0]!.volume).toBeCloseTo(12, 6);
    expect(lues[1]!.volume).toBeCloseTo(2, 6);
    expect(lues[2]!.volume).toBeCloseTo(2, 6);
    // Boîte de la première pièce : 2 × 2 × 3 m, pas 2 × 2 × 3 mm (l'unité n'est jamais supposée).
    const b = lues[0]!.boite!;
    expect(b.max.x - b.min.x).toBeCloseTo(2, 4);
    expect(b.max.z - b.min.z).toBeCloseTo(3, 4);
    expect(lues[2]!.boite!.max.x).toBeCloseTo(11.5, 4);
  });

  it("E.6-04 STEP : reproductible (horodatage de la révision), entrées mal formées refusées", () => {
    expect(M.exporterStepPieces(pieces(), H)).toBe(M.exporterStepPieces(pieces(), H));
    expect(() => M.exporterStepPieces([], H)).toThrow(/pièces/);
    expect(() => M.exporterStepPieces([{ nom: "l'apostrophe", solides: [{ extrusion: { profil: carre(1), z0: 0, hauteur: 1 } }] }], H)).toThrow(/nom ASCII/);
    expect(() => M.exporterStepPieces([{ nom: "é", solides: [{ extrusion: { profil: carre(1), z0: 0, hauteur: 1 } }] }], H)).toThrow(/nom ASCII/);
    expect(() => M.exporterStepPieces([{ nom: "x", solides: [] }], H)).toThrow(/solides/);
    expect(() => M.exporterStepPieces([{ nom: "x", solides: [{ lissage: [carre(1).map((p) => ({ ...p, z: 0 })), [{ x: 0, y: 0, z: 1 }, { x: 1, y: 0, z: 1 }, { x: 1, y: 1, z: 1 }]] }] }], H)).toThrow(/même nombre/);
    expect(() => M.exporterStepPieces(pieces(), { ...H, horodatage: "maintenant" })).toThrow(/horodatage/);
  });
});

describe("surface NURBS épaissie (Studio, X.1-05)", () => {
  /** Quart de cylindre de rayon R et de longueur L : arc rationnel quadratique (poids 1, √2/2, 1) × segment de degré 1. */
  const quartCylindre = (R: number, L: number) => {
    const arc = [{ x: R, y: 0 }, { x: R, y: R }, { x: 0, y: R }], w = [1, Math.SQRT1_2, 1];
    const controle: { x: number; y: number; z: number }[] = [], poids: number[] = [];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) { controle.push({ x: arc[i]!.x, y: arc[i]!.y, z: j * L }); poids.push(w[i]!); }
    return { degreU: 2, degreV: 1, lignes: 3, colonnes: 2, controle, poids };
  };

  it("NURBS rationnelle : quart de cylindre R 2 m, L 3 m épaissi de 0,1 m vers l'extérieur — volume π/4 ((R + e)² − R²) L, intérieur π/4 (R² − (R − e)²) L", () => {
    const ext = M.executer({ type: "nurbs", nurbs: quartCylindre(2, 3), epaisseur: 0.1 });
    expect(ext.solides).toBe(1);
    expect(Math.abs(ext.volume - (Math.PI / 4) * (2.1 ** 2 - 4) * 3) / ext.volume).toBeLessThan(1e-6);
    const int = M.executer({ type: "nurbs", nurbs: quartCylindre(2, 3), epaisseur: -0.1 });
    expect(Math.abs(int.volume - (Math.PI / 4) * (4 - 1.9 ** 2) * 3) / int.volume).toBeLessThan(1e-6);
    // Reproductible : même brep, même empreinte (le serveur recalcule).
    expect(M.executer({ type: "nurbs", nurbs: quartCylindre(2, 3), epaisseur: 0.1 }).empreinte).toBe(ext.empreinte);
  });

  it("NURBS : les pôles ne sont pas des points de passage — plaque bilinéaire 2 × 3 épaissie de 0,1 m : volume 0,6 ; poids changés : autre surface", () => {
    const plaque = { degreU: 1, degreV: 1, lignes: 2, colonnes: 2, controle: [{ x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, { x: 0, y: 3, z: 0 }, { x: 2, y: 3, z: 0 }] };
    expect(M.executer({ type: "nurbs", nurbs: plaque, epaisseur: 0.1 }).volume).toBeCloseTo(0.6, 9);
    // Bosse de degré 2 × 2 sur une grille 3 × 3 : le pôle central relevé de 1 m ne relève le centre que de 0,25 m (Bézier), pas de 1 m.
    const bosse = (w: number) => ({ degreU: 2, degreV: 2, lignes: 3, colonnes: 3, controle: Array.from({ length: 9 }, (_, k) => ({ x: k % 3, y: Math.floor(k / 3), z: k === 4 ? 1 : 0 })), poids: Array.from({ length: 9 }, (_, k) => (k === 4 ? w : 1)) });
    const a = M.executer({ type: "nurbs", nurbs: bosse(1), epaisseur: 0.01 }), b = M.executer({ type: "nurbs", nurbs: bosse(3), epaisseur: 0.01 });
    const zMax = (r: SolideExact) => Math.max(...r.maillage.positions.filter((_, i) => i % 3 === 2));
    // Normale ∂S/∂u × ∂S/∂v vers le bas ici (u le long de y, v le long de x) : l'épaisseur est sous la nappe.
    expect(zMax(a)).toBeGreaterThan(0.2); expect(zMax(a)).toBeLessThanOrEqual(0.25 + 1e-6);
    expect(zMax(b)).toBeGreaterThan(zMax(a) + 0.1);
    expect(a.empreinte).not.toBe(b.empreinte);
  });

  it("NURBS : entrées refusées — degré > lignes − 1, pôles en nombre faux, poids nul, épaisseur nulle, bord réduit à un point", () => {
    const q = quartCylindre(2, 3);
    expect(() => validerOperation({ type: "nurbs", nurbs: { ...q, degreU: 3 }, epaisseur: 0.1 })).toThrow(/degreU/);
    expect(() => validerOperation({ type: "nurbs", nurbs: { ...q, controle: q.controle.slice(1) }, epaisseur: 0.1 })).toThrow(/6 pôles/);
    expect(() => validerOperation({ type: "nurbs", nurbs: { ...q, poids: q.poids.map((w, i) => (i ? w : 0)) }, epaisseur: 0.1 })).toThrow(/strictement positif/);
    expect(() => validerOperation({ type: "nurbs", nurbs: q, epaisseur: 0 })).toThrow(/non nulle/);
    const cone = { ...q, controle: q.controle.map((p, k) => (k % 2 === 1 ? { x: 0, y: 0, z: 3 } : p)) };
    expect(() => validerOperation({ type: "nurbs", nurbs: cone, epaisseur: 0.1 })).toThrow(/réduit à un point/);
  });
});

export type _S = SolideExact;
