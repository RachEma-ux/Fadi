import { describe, expect, it } from "vitest";
import type { ObservationAnnonce } from "./types.js";
import { cleCohorte, construireCellules, mediane, quantileType7, quartiles, type ParametresCellules } from "./statistiques.js";

const obs = (id: string, prix: number, surface: number, p: Partial<ObservationAnnonce> = {}): ObservationAnnonce => ({
  source: "source-synthetique-A", idAnnonce: id, dateObservation: "2026-10-01", transaction: "vente", typeBien: "appartement",
  etat: null, prix, monnaie: "MAD", periode: "total", surface, baseSurface: "habitable",
  libelleLocalite: "Ville Synthétique", territoire: { code: "T-1", niveau: "commune" }, ...p,
});
const params: ParametresCellules = { fenetreJours: 90, seuil: 3, versionMethode: "prix-annonces-test", dateReference: "2026-10-31" };

describe("quantiles de type 7 (Hyndman–Fan)", () => {
  it("interpolation linéaire entre statistiques d'ordre", () => {
    // [1, 2, 3, 4] : h(0,25) = 0,75 → 1,75 ; h(0,5) = 1,5 → 2,5 ; h(0,75) = 2,25 → 3,25.
    expect(quartiles([4, 1, 3, 2])).toEqual({ q1: 1.75, mediane: 2.5, q3: 3.25 });
    expect(quantileType7([10], 0.25)).toBe(10);
    expect(quantileType7([0, 10], 1)).toBe(10);
    expect(mediane([5, 1, 3])).toBe(3);
    expect(mediane([])).toBeNull();
  });
});

describe("cohortes", () => {
  it("clé stable ; état ventilé ou non", () => {
    const d = { territoire: "T-1", niveau: "commune", transaction: "vente", typeBien: "appartement", etat: null, baseSurface: "habitable", periode: "total" } as const;
    expect(cleCohorte(d)).toBe("t=T-1|n=commune|tr=vente|ty=appartement|e=*|b=habitable|p=total");
    expect(cleCohorte(d, true)).toBe("t=T-1|n=commune|tr=vente|ty=appartement|e=non-precise|b=habitable|p=total");
  });
});

describe("construction des cellules", () => {
  it("médiane des prix unitaires (pas total / total) et quartiles, arrondis au centime", () => {
    // Prix unitaires : 1 000 000/100 = 10 000 ; 1 100 000/100 = 11 000 ; 3 000 000/200 = 15 000.
    // Médiane = 11 000 (et non 5 100 000 / 400 = 12 750). Q1 : h = 0,5 → 10 500 ; Q3 : h = 1,5 → 13 000.
    const r = construireCellules([obs("1", 1_000_000, 100), obs("2", 1_100_000, 100), obs("3", 3_000_000, 200)], [], params);
    expect(r.cellules).toHaveLength(1);
    expect(r.cellules[0]).toMatchObject({ etatDonnee: "disponible", mediane: 11000, q1: 10500, q3: 13000, unite: "MAD/m2", effectifs: { brutes: 3, eligibles: 3, distinctes: 3 } });
  });

  it("sous le seuil : échantillon insuffisant, valeur null, jamais 0 (PRX07)", () => {
    const c = construireCellules([obs("1", 1_000_000, 100), obs("2", 1_100_000, 100)], [], params).cellules[0]!;
    expect(c).toMatchObject({ etatDonnee: "echantillon-insuffisant", mediane: null, q1: null, q3: null, effectifs: { distinctes: 2 } });
  });

  it("fenêtre : la date de référence et les 89 jours précédents ; au-delà, exclu", () => {
    // 2026-10-31 − 89 jours = 2026-08-03 (inclus) ; 2026-08-02 = 90 jours (exclu) ; 2026-11-01 (futur, exclu).
    const r = construireCellules([obs("1", 1e6, 100, { dateObservation: "2026-08-03" }), obs("2", 1e6, 100, { dateObservation: "2026-08-02" }), obs("3", 1e6, 100, { dateObservation: "2026-11-01" })], [], { ...params, seuil: 1 });
    expect(r.cellules[0]).toMatchObject({ effectifs: { brutes: 3, eligibles: 1, distinctes: 1 }, exclusions: { "hors-fenetre": 2 } });
  });

  it("dernière observation par bien ; une annonce répétée compte une fois", () => {
    const r = construireCellules([obs("1", 1_000_000, 100, { dateObservation: "2026-09-01" }), obs("1", 900_000, 100, { dateObservation: "2026-10-15" })], [], { ...params, seuil: 1 });
    expect(r.cellules[0]).toMatchObject({ mediane: 9000, effectifs: { eligibles: 2, distinctes: 1 }, exclusions: { "observation-remplacee": 1 } });
    expect(r.cellules[0]!.clesRetenues).toEqual(["source-synthetique-A|1|2026-10-15"]);
  });

  it("loyer : prix unitaire par période, cohortes jour / mois séparées (PRX05)", () => {
    const r = construireCellules([
      obs("L1", 8000, 80, { transaction: "location", periode: "mois" }),
      obs("L2", 500, 80, { transaction: "location", periode: "jour" }),
    ], [], { ...params, seuil: 1 });
    expect(r.cellules.map((c) => [c.periode, c.unite, c.mediane])).toEqual([["jour", "MAD/m2/jour", 6.25], ["mois", "MAD/m2/mois", 100]]);
  });

  it("non rattachée : exclue et comptée ; non admise : écartée et comptée", () => {
    const r = construireCellules([obs("1", 1e6, 100, { territoire: null }), obs("2", 0, 100), obs("3", 1e6, 100)], [], { ...params, seuil: 1 });
    expect(r.totaux).toEqual({ observations: 3, doublonsIdentiques: 0, nonAdmises: 1, nonRattachees: 1 });
    expect(r.cellules).toHaveLength(1);
  });

  it("valeurs atypiques signalées, conservées dans la médiane ; médiane hors atypiques pour la sensibilité", () => {
    // Prix unitaires 10 000, 11 000, 12 000, 13 000, 14 000, 100 000 : médiane = (12 000 + 13 000)/2 = 12 500 ;
    // hors atypique (100 000, voir validation.test.ts : bornes 3 750 / 21 250 × 1 000) : médiane = 12 000.
    const l = [10, 11, 12, 13, 14, 100].map((k, i) => obs(String(i), k * 100_000, 100));
    const c = construireCellules(l, [], params).cellules[0]!;
    expect(c).toMatchObject({ mediane: 12500, atypiques: 1, medianeHorsAtypiques: 12000, effectifs: { distinctes: 6 } });
  });

  it("paramètres invalides refusés", () => {
    expect(() => construireCellules([], [], { ...params, fenetreJours: 0 })).toThrow(RangeError);
    expect(() => construireCellules([], [], { ...params, seuil: 1.5 })).toThrow(RangeError);
    expect(() => construireCellules([], [], { ...params, dateReference: "31/10/2026" })).toThrow(RangeError);
  });

  it("aucune donnée : aucune cellule (jamais de valeur de repli)", () => {
    const r = construireCellules([], [], params);
    expect(r.cellules).toEqual([]);
    expect(r.manifeste.entrees).toEqual([]);
    expect(r.empreinte).toMatch(/^[0-9a-f]{64}$/);
  });
});
