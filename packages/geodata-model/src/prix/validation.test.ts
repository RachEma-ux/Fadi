import { describe, expect, it } from "vitest";
import type { ObservationAnnonce } from "./types.js";
import { estDateIso, estPrixFictif, signalerAtypiques, trierObservations, validerObservation, REGLE_ATYPIQUE_V1 } from "./validation.js";

const obs = (p: Partial<ObservationAnnonce> = {}): ObservationAnnonce => ({
  source: "source-synthetique-A", idAnnonce: "A-1", dateObservation: "2026-10-01", transaction: "vente", typeBien: "appartement",
  etat: null, prix: 1_000_000, monnaie: "MAD", periode: "total", surface: 100, baseSurface: "habitable",
  libelleLocalite: "Ville Synthétique", territoire: { code: "T-1", niveau: "commune" }, ...p,
});

describe("validation des observations et quarantaine", () => {
  it("observation complète admise", () => {
    expect(validerObservation(obs())).toEqual({ admis: true, motifs: [] });
    expect(validerObservation(obs({ transaction: "location", periode: "jour", prix: 450 })).admis).toBe(true);
  });

  it("prix absent, non positif ou fictif : quarantaine (jamais 0)", () => {
    expect(validerObservation(obs({ prix: null })).motifs).toEqual(["prix-absent"]);
    expect(validerObservation(obs({ prix: 0 })).motifs).toEqual(["prix-non-positif"]);
    expect(validerObservation(obs({ prix: -5 })).motifs).toEqual(["prix-non-positif"]);
    expect(validerObservation(obs({ prix: 99_999_999 })).motifs).toEqual(["prix-fictif"]);
    expect(validerObservation(obs({ prix: 1 })).motifs).toEqual(["prix-fictif"]);
    expect(validerObservation(obs({ prix: 123456 })).motifs).toEqual(["prix-fictif"]);
  });

  it("un prix extrême mais plausible n'est pas fictif (pas de suppression du luxe)", () => {
    expect(estPrixFictif(45_000_000)).toBe(false);
    expect(estPrixFictif(1111)).toBe(false);
    expect(estPrixFictif(11111)).toBe(true);
  });

  it("surface absente ou non positive", () => {
    expect(validerObservation(obs({ surface: null })).motifs).toEqual(["surface-absente"]);
    expect(validerObservation(obs({ surface: 0 })).motifs).toEqual(["surface-non-positive"]);
  });

  it("période inconnue ou incohérente avec la transaction", () => {
    expect(validerObservation(obs({ periode: null })).motifs).toEqual(["periode-inconnue"]);
    expect(validerObservation(obs({ periode: "mois" })).motifs).toEqual(["periode-incoherente"]);
    expect(validerObservation(obs({ transaction: "location", periode: "total" })).motifs).toEqual(["periode-incoherente"]);
  });

  it("monnaie absente ou non supportée (EUR refusé, jamais converti)", () => {
    expect(validerObservation(obs({ monnaie: "EUR" })).motifs).toEqual(["monnaie-non-supportee"]);
    expect(validerObservation(obs({ monnaie: null })).motifs).toEqual(["monnaie-absente"]);
  });

  it("terrain mesuré en surface habitable : incohérent ; parcelle admise", () => {
    expect(validerObservation(obs({ typeBien: "terrain", baseSurface: "habitable" })).motifs).toEqual(["base-surface-incoherente"]);
    expect(validerObservation(obs({ typeBien: "terrain", baseSurface: "parcelle" })).admis).toBe(true);
  });

  it("identité, date, transaction et type inconnus ; tous les motifs sont rapportés, ordre stable", () => {
    const r = validerObservation(obs({ idAnnonce: "", dateObservation: "2026-02-30", transaction: null, typeBien: null, prix: 0, monnaie: "USD" }));
    expect(r.motifs).toEqual(["identifiant-absent", "date-invalide", "transaction-inconnue", "type-bien-inconnu", "prix-non-positif", "monnaie-non-supportee"]);
    expect(estDateIso("2026-02-28")).toBe(true);
    expect(estDateIso("2026-13-01")).toBe(false);
  });

  it("tri d'un lot : admises, quarantaine et décompte par motif", () => {
    const r = trierObservations([obs(), obs({ idAnnonce: "A-2", prix: 0 }), obs({ idAnnonce: "A-3", prix: 0, monnaie: "EUR" })]);
    expect(r.admises).toHaveLength(1);
    expect(r.quarantaine.map((q) => q.observation.idAnnonce)).toEqual(["A-2", "A-3"]);
    expect(r.parMotif).toEqual({ "prix-non-positif": 2, "monnaie-non-supportee": 1 });
  });
});

describe("valeurs atypiques signalées, conservées (règle atypique-iqr3-v1)", () => {
  it("bornes [Q1 − 3·IQR, Q3 + 3·IQR] : 10, 11, 12, 13, 14 et 100", () => {
    // Triées : 10 11 12 13 14 100 ; n = 6. Q1 : h = 5 × 0,25 = 1,25 → 11 + 0,25 × 1 = 11,25.
    // Q3 : h = 3,75 → 13 + 0,75 × 1 = 13,75. IQR = 2,5. Bornes : 11,25 − 7,5 = 3,75 ; 13,75 + 7,5 = 21,25.
    const v = [10, 11, 12, 13, 14, 100].map((valeur, i) => ({ cle: `k${i}`, valeur }));
    const r = signalerAtypiques(v);
    expect(r.bornes).toEqual({ basse: 3.75, haute: 21.25 });
    expect(r.signalements.filter((s) => s.atypique).map((s) => s.cle)).toEqual(["k5"]);
    expect(r.signalements).toHaveLength(6);
    expect(r.regle.version).toBe("atypique-iqr3-v1");
  });

  it("effectif inférieur au minimum : aucun signalement", () => {
    const r = signalerAtypiques([1, 2, 1000].map((valeur, i) => ({ cle: `k${i}`, valeur })), REGLE_ATYPIQUE_V1);
    expect(r.bornes).toBeNull();
    expect(r.signalements.every((s) => !s.atypique)).toBe(true);
  });
});
