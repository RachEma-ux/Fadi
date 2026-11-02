import { describe, expect, it } from "vitest";
import type { ObservationAnnonce } from "./types.js";
import { chercherCandidatsDoublons, construireBiens, dedoublonnerExact, derniereObservationParAnnonce, type DecisionDoublon } from "./deduplication.js";

const obs = (p: Partial<ObservationAnnonce> = {}): ObservationAnnonce => ({
  source: "source-synthetique-A", idAnnonce: "1", dateObservation: "2026-10-01", transaction: "vente", typeBien: "appartement",
  etat: null, prix: 1_000_000, monnaie: "MAD", periode: "total", surface: 100, baseSurface: "habitable",
  libelleLocalite: "Quartier Témoin", territoire: { code: "T-1", niveau: "commune" }, ...p,
});

describe("doublons exacts (PRX02)", () => {
  it("un réimport identique ne multiplie pas les observations ; l'ordre d'entrée est sans effet", () => {
    const a = obs(), b = obs({ idAnnonce: "2" });
    const r1 = dedoublonnerExact([a, b, a, b]);
    const r2 = dedoublonnerExact([b, a]);
    expect(r1.observations).toEqual(r2.observations);
    expect(r1.doublonsIdentiques).toBe(2);
    expect(r1.conflits).toEqual([]);
  });

  it("même clé, contenu différent : conflit signalé, choix déterministe", () => {
    const r = dedoublonnerExact([obs({ prix: 2_000_000 }), obs()]);
    expect(r.conflits).toEqual(["source-synthetique-A|1|2026-10-01"]);
    expect(r.observations).toHaveLength(1);
    expect(dedoublonnerExact([obs(), obs({ prix: 2_000_000 })]).observations).toEqual(r.observations);
  });

  it("dernière observation de chaque annonce", () => {
    const m = derniereObservationParAnnonce([obs({ dateObservation: "2026-10-05", prix: 990_000 }), obs(), obs({ idAnnonce: "2" })]);
    expect([...m.keys()]).toEqual(["source-synthetique-A|1", "source-synthetique-A|2"]);
    expect(m.get("source-synthetique-A|1")!.prix).toBe(990_000);
  });
});

describe("candidats inter-sources (règle doublons-v1)", () => {
  const a = obs({ empreinte: "E1" });
  const b = obs({ source: "source-synthetique-B", idAnnonce: "9", libelleLocalite: "quartier temoin", prix: 1_020_000, surface: 102, empreinte: "E1" });
  it("même localité normalisée, type, transaction, surface et prix à ±3 %, empreinte égale → forte", () => {
    const c = chercherCandidatsDoublons([a, b]);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ a: "source-synthetique-A|1", b: "source-synthetique-B|9", confiance: "forte", regle: "doublons-v1" });
    expect(c[0]!.signaux.ecartPrixPourcent).toBeCloseTo(2, 10);
  });

  it("sans empreinte ou empreinte différente → à revoir", () => {
    expect(chercherCandidatsDoublons([a, { ...b, empreinte: null }])[0]!.confiance).toBe("a-revoir");
    expect(chercherCandidatsDoublons([a, { ...b, empreinte: "E2" }])[0]!).toMatchObject({ confiance: "a-revoir", signaux: { empreinte: "differente" } });
  });

  it("hors tolérance, autre type, autre base, même source : pas de candidat", () => {
    expect(chercherCandidatsDoublons([a, { ...b, surface: 104 }])).toEqual([]); // 4 % > 3 %
    expect(chercherCandidatsDoublons([a, { ...b, prix: 1_031_000 }])).toEqual([]); // 3,1 %
    expect(chercherCandidatsDoublons([a, { ...b, prix: 1_030_000 }])).toHaveLength(1); // 3 % exactement : inclus
    expect(chercherCandidatsDoublons([a, { ...b, typeBien: "maison" }])).toEqual([]);
    expect(chercherCandidatsDoublons([a, { ...b, baseSurface: "construite" }])).toEqual([]);
    expect(chercherCandidatsDoublons([a, { ...b, source: "source-synthetique-A" }])).toEqual([]);
  });
});

describe("biens et décisions persistées (PRX03, PRX04)", () => {
  const annonces = ["S-A|1", "S-B|1", "S-B|2", "S-C|7"];
  const forte = { a: "S-A|1", b: "S-B|1", confiance: "forte" as const, signaux: { localite: "x", ecartSurfacePourcent: 0, ecartPrixPourcent: 0, empreinte: "egale" as const }, regle: "doublons-v1" };
  const revoir = { ...forte, a: "S-A|1", b: "S-B|2", confiance: "a-revoir" as const, signaux: { ...forte.signaux, empreinte: "absente" as const } };

  it("fusion automatique seulement pour « forte » ; « à revoir » mis en file, jamais fusionné", () => {
    const r = construireBiens(annonces, [forte, revoir]);
    expect(r.biens.map((b) => b.annonces)).toEqual([["S-A|1", "S-B|1"], ["S-B|2"], ["S-C|7"]]);
    expect(r.bienDe.get("S-B|1")).toBe("S-A|1");
    expect(r.aRevoir).toHaveLength(1);
  });

  it("décisions rejouées : fusion revue, séparation qui annule une fusion automatique ; la plus récente l'emporte", () => {
    const d: DecisionDoublon[] = [
      { a: "S-B|2", b: "S-A|1", decision: "fusion", date: "2026-10-10T10:00:00Z", auteur: "revue" },
      { a: "S-A|1", b: "S-B|1", decision: "separation", date: "2026-10-11T10:00:00Z", auteur: "revue" },
    ];
    const r = construireBiens(annonces, [forte, revoir], d);
    expect(r.biens.map((b) => b.annonces)).toEqual([["S-A|1", "S-B|2"], ["S-B|1"], ["S-C|7"]]);
    expect(r.aRevoir).toEqual([]);
    const plusTard = construireBiens(annonces, [forte], [...d, { a: "S-A|1", b: "S-B|1", decision: "fusion", date: "2026-10-12T00:00:00Z", auteur: "revue" }]);
    expect(plusTard.biens[0]!.annonces).toEqual(["S-A|1", "S-B|1", "S-B|2"]);
  });

  it("une séparation n'est pas contournée par transitivité : le lien est refusé", () => {
    const d: DecisionDoublon[] = [
      { a: "S-A|1", b: "S-C|7", decision: "separation", date: "2026-10-01", auteur: "revue" },
      { a: "S-B|1", b: "S-C|7", decision: "fusion", date: "2026-10-02", auteur: "revue" },
    ];
    const r = construireBiens(annonces, [forte], d);
    expect(r.biens.map((b) => b.annonces)).toEqual([["S-A|1"], ["S-B|1", "S-C|7"], ["S-B|2"]]);
    expect(r.liensRefuses).toEqual([{ a: "S-A|1", b: "S-B|1", origine: "empreinte" }]);
  });

  it("déterminisme : même entrée dans un autre ordre → mêmes biens et identifiants (plus petite clé)", () => {
    const r1 = construireBiens(annonces, [forte, revoir]);
    const r2 = construireBiens([...annonces].reverse(), [revoir, forte]);
    expect(r2.biens).toEqual(r1.biens);
    expect(r1.biens.every((b) => b.id === b.annonces[0])).toBe(true);
  });
});
