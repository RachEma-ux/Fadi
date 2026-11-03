/** Terrain TER-03 — calculs purs sur grilles synthétiques « test seulement » (plan § Verification). */
import { describe, expect, it } from "vitest";
import {
  courbesDeNiveau, EQUIDISTANCE_MIN_MONDIALE, equidistanceMinimale, espacementMetrique, ombrage, pente, valeurBilineaire, valeurCellule,
  verifierEquidistance, type GrilleAltitudes,
} from "./analyse.js";
import { etatQualite, lirePointsControle, percentileRangProche, rapportQualite, statistiques } from "./qualite.js";
import { altitudeAuPoint, ordonnerSources, profil, type SourceAltitude } from "./priorite.js";

/** Plan incliné connu : z = 100 + a·x + b·y (x vers l'est, y vers le nord, mètres ; centres de cellules). */
function plan(L: number, H: number, pas: number, a: number, b: number, nodata: number | null = null, trous: (c: number, l: number) => boolean = () => false): GrilleAltitudes {
  const valeurs = new Float32Array(L * H);
  for (let l = 0; l < H; l++) for (let c = 0; c < L; c++) valeurs[l * L + c] = trous(c, l) ? (nodata ?? Number.NaN) : 100 + a * (c + 0.5) * pas + b * (H - l - 0.5) * pas;
  return { largeur: L, hauteur: H, valeurs, nodata, pasX: pas, pasY: pas };
}

describe("pente (Horn) — plan synthétique connu", () => {
  it("donne exactement atan(|∇z|) à l'intérieur, sans valeur au bord", () => {
    const g = plan(20, 15, 0.25, 0.3, 0.4);
    const p = pente(g);
    const attendue = (Math.atan(0.5) * 180) / Math.PI;
    for (let l = 1; l < 14; l++) for (let c = 1; c < 19; c++) expect(p[l * 20 + c]).toBeCloseTo(attendue, 3); // valeurs stockées en Float32
    expect(Number.isNaN(p[0]!)).toBe(true);
    expect(Number.isNaN(p[19]!)).toBe(true);
  });
  it("NoData : la pente des cellules voisines est sans valeur, jamais 0", () => {
    const g = plan(10, 10, 1, 0.1, 0, -9999, (c, l) => c === 5 && l === 5);
    const p = pente(g);
    for (let l = 4; l <= 6; l++) for (let c = 4; c <= 6; c++) expect(Number.isNaN(p[l * 10 + c]!)).toBe(true);
    expect(p[2 * 10 + 2]).toBeCloseTo((Math.atan(0.1) * 180) / Math.PI, 3);
  });
  it("grille géographique : pas ramené en mètres sur l'ellipsoïde (unités horizontales et verticales cohérentes)", () => {
    const e = espacementMetrique(33.53, 1 / 3600, 1 / 3600);
    expect(e.pasY).toBeCloseTo(30.83, 1);
    expect(e.pasX).toBeCloseTo(25.79, 1);
    expect(espacementMetrique(0, 1, 1).pasX).toBeCloseTo(111319.49, 1);
  });
});

describe("ombrage", () => {
  it("un versant tourné vers la lumière (nord-ouest) est plus clair que le versant opposé", () => {
    const versOuest = ombrage(plan(5, 5, 1, 0.5, 0))[12]!;
    const versEst = ombrage(plan(5, 5, 1, -0.5, 0))[12]!;
    const plat = ombrage(plan(5, 5, 1, 0, 0))[12]!;
    expect(versOuest).toBeGreaterThan(plat);
    expect(versEst).toBeLessThan(plat);
    expect(plat).toBeCloseTo(Math.cos(Math.PI / 4), 6);
  });
});

describe("valeur au point", () => {
  it("cellule et bilinéaire ; bilinéaire exacte sur un plan ; null hors grille ou près d'un NoData", () => {
    const g = plan(10, 10, 1, 0.2, 0.1);
    expect(valeurCellule(g, 2.3, 9.9)).toBeCloseTo(100 + 0.2 * 2.5 + 0.1 * 0.5, 5);
    expect(valeurBilineaire(g, 3.7, 4.2)).toBeCloseTo(100 + 0.2 * 3.7 + 0.1 * (10 - 4.2), 4);
    expect(valeurCellule(g, -0.1, 1)).toBeNull();
    const t = plan(10, 10, 1, 0.2, 0.1, -9999, (c, l) => c === 4 && l === 4);
    expect(valeurBilineaire(t, 4.2, 4.2)).toBeNull();
    expect(valeurCellule(t, 4.5, 4.5)).toBeNull();
  });
});

describe("courbes de niveau (carrés marchants)", () => {
  it("plan incliné : courbes droites, espacement exact = équidistance / pente", () => {
    const g = plan(41, 21, 1, 0.5, 0);
    const c = courbesDeNiveau(g, 2);
    expect(c.length).toBeGreaterThan(5);
    for (const k of c) {
      expect(k.lignes).toHaveLength(1);
      const xs = k.lignes[0]!.map(([x]) => x);
      expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(1e-6);
      expect(xs[0]! ).toBeCloseTo((k.altitude - 100) / 0.5, 6);
    }
    const x0 = c[0]!.lignes[0]![0]![0], x1 = c[1]!.lignes[0]![0]![0];
    expect(x1 - x0).toBeCloseTo(2 / 0.5, 6);
    expect(c.filter((k) => k.maitresse).every((k) => k.altitude % 10 === 0)).toBe(true);
  });
  it("cuvette : courbes fermées", () => {
    const L = 31, valeurs = new Float32Array(L * L);
    for (let l = 0; l < L; l++) for (let col = 0; col < L; col++) valeurs[l * L + col] = Math.hypot(col - 15, l - 15);
    const c = courbesDeNiveau({ largeur: L, hauteur: L, valeurs, nodata: null, pasX: 1, pasY: 1 }, 5);
    const fermees = c.filter((x) => x.altitude <= 10);
    expect(fermees.length).toBe(2);
    for (const k of fermees) {
      expect(k.lignes).toHaveLength(1);
      const l = k.lignes[0]!;
      expect(l[0]).toEqual(l[l.length - 1]);
    }
  });
  it("NoData au milieu : courbe interrompue, jamais prolongée à travers le trou", () => {
    const g = plan(41, 21, 1, 0.5, 0, -9999, (_c, l) => l >= 8 && l <= 12);
    const k = courbesDeNiveau(g, 2).find((x) => x.altitude === 110)!;
    expect(k.lignes).toHaveLength(2);
    for (const ligne of k.lignes) for (const [, y] of ligne) expect(y <= 8 || y >= 12.5).toBe(true);
  });
});

describe("équidistance liée à la précision (TER-D17)", () => {
  it("fond mondial : 10 m au moins ; levé mesuré : 2 × RMSEz ; non évaluée : équidistance mondiale", () => {
    expect(equidistanceMinimale({ niveau: "mondial", rmsezMesuree: null, verticaleDeclaree: 4 })).toBe(10);
    expect(equidistanceMinimale({ niveau: "leve-local", rmsezMesuree: 0.08, verticaleDeclaree: null })).toBe(0.25);
    expect(equidistanceMinimale({ niveau: "leve-local", rmsezMesuree: 0.3, verticaleDeclaree: 0.05 })).toBe(1);
    expect(equidistanceMinimale({ niveau: "regional-officiel", rmsezMesuree: null, verticaleDeclaree: null })).toBe(EQUIDISTANCE_MIN_MONDIALE);
    // Au-delà de la plus grande valeur proposée : jamais sous le seuil (RMSEz 80 m → 160 m exigés → 200 m).
    const grande = equidistanceMinimale({ niveau: "leve-local", rmsezMesuree: 80, verticaleDeclaree: null });
    expect(grande).toBe(200);
    expect(verifierEquidistance(100, grande).ok).toBe(false);
    expect(equidistanceMinimale({ niveau: "mondial", rmsezMesuree: 50, verticaleDeclaree: null })).toBe(100);
  });
  it("équidistance sous le seuil refusée avec un message explicite", () => {
    const v = verifierEquidistance(1, 10);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.message).toMatch(/ne permet pas moins de 10 m/);
    expect(verifierEquidistance(10, 10).ok).toBe(true);
  });
});

describe("porte qualité : statistiques exactement comme au plan", () => {
  it("biais, RMSEz, P95 (rang le plus proche) ; points sans valeur exclus et listés", () => {
    const r = rapportQualite([
      { id: "a", classe: "sol-nu", residu: 0.1, incertitude: 0.01 },
      { id: "b", classe: "sol-nu", residu: -0.2, incertitude: 0.01 },
      { id: "c", classe: "vegetation", residu: 0.3, incertitude: null },
      { id: "d", classe: "sol-nu", residu: null, incertitude: 0.01 },
    ]);
    expect(r.global!.n).toBe(3);
    expect(r.global!.biais).toBeCloseTo(0.2 / 3, 12);
    expect(r.global!.rmsez).toBeCloseTo(Math.sqrt((0.01 + 0.04 + 0.09) / 3), 12);
    expect(r.global!.p95).toBeCloseTo(0.3, 12);
    expect(r.parClasse["sol-nu"]!.n).toBe(2);
    expect(r.exclus).toEqual([{ id: "d", motif: "Aucune valeur du modèle au point (hors couverture ou NoData)." }]);
    expect(percentileRangProche(Array.from({ length: 20 }, (_, i) => i + 1), 0.95)).toBe(19);
    expect(statistiques([])).toBeNull();
  });
  it("état : non évaluée sans point, sans cible, conforme / non conforme selon les cibles", () => {
    expect(etatQualite(rapportQualite([]), { rmsez: 0.1, p95: 0.2, classe: null })).toBe("non-evaluee");
    const r = rapportQualite([{ id: "a", classe: "sol-nu", residu: 0.05, incertitude: null }, { id: "b", classe: "sol-nu", residu: -0.05, incertitude: null }]);
    expect(etatQualite(r, null)).toBe("sans-cible");
    expect(etatQualite(r, { rmsez: 0.1, p95: 0.2, classe: "sol-nu" })).toBe("conforme");
    expect(etatQualite(r, { rmsez: 0.01, p95: 0.2, classe: null })).toBe("non-conforme");
  });
  it("lecture d'un fichier de points : en-tête exigé, doublons et valeurs illisibles refusés", () => {
    expect(lirePointsControle("id;x;y;z;classe;incertitude\np1;1;2;3;sol-nu;0.02\np2;4;5;6;bati;")).toHaveLength(2);
    expect(() => lirePointsControle("x;y;z\n1;2;3")).toThrow(/En-tête/);
    expect(() => lirePointsControle("id;x;y;z;classe;incertitude\np1;1;2;3;sol;\np1;1;2;3;sol;")).toThrow(/double/);
    expect(() => lirePointsControle("id;x;y;z;classe;incertitude\np1;1;deux;3;sol;")).toThrow(/numériques/);
  });
});

describe("priorité des sources et profils (TER-D16)", () => {
  const source = (id: string, o: Partial<SourceAltitude> & { couvre: (x: number) => boolean; z: (x: number) => number }): SourceAltitude => ({
    id, produit: "MNT", publiee: true, pas: 1, precisionMesuree: null, precisionDeclaree: null, date: null, referenceVerticale: "EPSG:5728", ...o,
    valeur: (x) => (o.couvre(x) ? { valeur: o.z(x), interpolee: false } : null),
  });
  const fine = source("leve", { pas: 0.25, couvre: (x) => x >= 0 && x < 50, z: (x) => 200 + 0.1 * x });
  const regionale = source("regional", { pas: 30, couvre: (x) => x >= 0 && x <= 200, z: (x) => 201 + 0.1 * x });
  const mns = source("surface", { produit: "MNS", pas: 0.1, couvre: () => true, z: () => 999 });
  const nonPubliee = source("brouillon", { pas: 0.05, publiee: false, couvre: () => true, z: () => 0 });
  const autreDatum = source("autre-datum", { pas: 0.1, referenceVerticale: "EPSG:3855", couvre: () => true, z: () => 0 });

  it("produit, publication et référence verticale filtrent ; puis le plus fin", () => {
    const o = ordonnerSources([regionale, mns, nonPubliee, autreDatum, fine], "MNT", "EPSG:5728");
    expect(o.map((s) => s.id)).toEqual(["leve", "regional"]);
    expect(altitudeAuPoint(o, 10, 0)).toEqual({ valeur: 201, source: "leve", interpolee: false });
    expect(altitudeAuPoint(o, 300, 0)).toBeNull();
  });
  it("à pas égal : précision mesurée, puis déclarée, « non évaluée » en dernier, puis la plus récente", () => {
    const a = source("a", { pas: 1, precisionDeclaree: 0.5, couvre: () => true, z: () => 1 });
    const b = source("b", { pas: 1, precisionMesuree: 0.1, couvre: () => true, z: () => 2 });
    const c = source("c", { pas: 1, couvre: () => true, z: () => 3, date: "2026-01-01" });
    const d = source("d", { pas: 1, couvre: () => true, z: () => 4, date: "2025-01-01" });
    expect(ordonnerSources([d, c, a, b], "MNT", null).map((s) => s.id)).toEqual(["b", "a", "c", "d"]);
  });
  it("profil : couture entre deux jeux marquée, lacune hors couverture, interpolation signalée", () => {
    const p = profil([[0, 0], [250, 0]], 10, ordonnerSources([fine, regionale], "MNT", null));
    expect(p.points[0]).toMatchObject({ chainage: 0, altitude: 200, source: "leve" });
    expect(p.transitions).toEqual([{ chainage: 50, de: "leve", vers: "regional" }, { chainage: 210, de: "regional", vers: null }]);
    expect(p.lacunes).toEqual([{ debut: 210, fin: 250 }]);
    expect(p.points.filter((x) => x.source === "regional").every((x) => x.interpolee)).toBe(true);
    expect(p.points.filter((x) => x.source === "leve").every((x) => !x.interpolee)).toBe(true);
    expect(() => profil([[0, 0], [1e6, 0]], 1, [fine])).toThrow(/traitement de fond/);
  });
});

describe("couverture valide en rectangles", () => {
  it("union exacte des cellules valides, trou NoData exclu, lignes identiques fusionnées", async () => {
    const { rectanglesValides } = await import("./analyse.js");
    const L = 10, H = 8, valeurs = new Float32Array(L * H).fill(1);
    for (let l = 3; l <= 4; l++) for (let c = 4; c <= 5; c++) valeurs[l * L + c] = -9999;
    const r = rectanglesValides({ largeur: L, hauteur: H, valeurs, nodata: -9999 });
    const aire = r.reduce((s, [c0, l0, c1, l1]) => s + (c1 - c0) * (l1 - l0), 0);
    expect(aire).toBe(L * H - 4);
    expect(r).toHaveLength(4);
    expect(rectanglesValides({ largeur: 3, hauteur: 2, valeurs: [Number.NaN, Number.NaN, Number.NaN, Number.NaN, Number.NaN, Number.NaN], nodata: null })).toEqual([]);
  });
});
