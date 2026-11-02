/**
 * Jeu de référence (« golden ») des prix affichés — Plan §5, lot P5. Données ENTIÈREMENT SYNTHÉTIQUES : sources
 * « source-synthetique-A » et « source-synthetique-B », territoires fictifs ; aucune valeur d'une source réelle.
 *
 * Les médianes et quartiles attendus sont calculés À LA MAIN ci-dessous (quantile de type 7 : h = (n − 1)·p,
 * x[⌊h⌋] + (h − ⌊h⌋)·(x[⌊h⌋+1] − x[⌊h⌋]), rangs comptés à partir de 0), indépendamment de l'implémentation.
 *
 * Paramètres : date de référence 2026-10-31, fenêtre 90 jours (2026-08-03 → 2026-10-31), seuil 5 biens distincts.
 */
import { describe, expect, it } from "vitest";
import {
  chercherCandidatsDoublons, construireBiens, construireCellules, parserMontant, rattacherLocalite, trierObservations,
  type CellulePrix, type DecisionDoublon, type ObservationAnnonce, type ParametresCellules, type TerritoireCandidat,
} from "../index.js";

// ——— Territoires candidats (dans l'application : lus en base) ———
const TERRITOIRES: TerritoireCandidat[] = [
  { code: "T-COM", nom: "Ville-Synthetique", niveau: "commune", rang: 3 },
  { code: "T-ARR-N", nom: "Arr-Nord-Synthetique", niveau: "arrondissement", rang: 4, alias: ["Lisiere-Synthetique"] },
  { code: "T-ARR-S", nom: "Arr-Sud-Synthetique", niveau: "arrondissement", rang: 4, alias: ["Lisiere-Synthetique"] },
];

// ——— Lignes brutes des deux sources synthétiques ———
interface Brute {
  readonly source: "source-synthetique-A" | "source-synthetique-B";
  readonly id: string;
  readonly date: string;
  readonly transaction: "vente" | "location";
  readonly type: ObservationAnnonce["typeBien"];
  readonly prix: string;
  readonly surface: number | null;
  readonly base: ObservationAnnonce["baseSurface"];
  readonly localite: string;
  /** Rang de la précision géographique de la source (3 = commune, 4 = arrondissement). */
  readonly precision: number;
  readonly empreinte?: string;
}
const A = "source-synthetique-A" as const, B = "source-synthetique-B" as const;
const NORD_A = "Arr-Nord-Synthétique", NORD_B = "arr nord synthetique", SUD = "Arr Sud Synthetique";

const BRUTES: Brute[] = [
  // Cohorte 1 — Arr-Nord, vente, appartement, surface habitable.
  { source: A, id: "A1", date: "2026-09-01", transaction: "vente", type: "appartement", prix: "1 050 000 DH", surface: 100, base: "habitable", localite: NORD_A, precision: 4 },
  { source: A, id: "A1", date: "2026-10-10", transaction: "vente", type: "appartement", prix: "1 000 000 DH", surface: 100, base: "habitable", localite: NORD_A, precision: 4 },
  { source: A, id: "A2", date: "2026-09-15", transaction: "vente", type: "appartement", prix: "1 200 000 DH", surface: 100, base: "habitable", localite: NORD_A, precision: 4 },
  { source: A, id: "A3", date: "2026-10-01", transaction: "vente", type: "appartement", prix: "1 400 000 DH", surface: 100, base: "habitable", localite: NORD_A, precision: 4, empreinte: "EMP-A3" },
  { source: A, id: "A4", date: "2026-10-02", transaction: "vente", type: "appartement", prix: "1,65M DH", surface: 110, base: "habitable", localite: NORD_A, precision: 4 },
  { source: A, id: "A5", date: "2026-10-03", transaction: "vente", type: "appartement", prix: "880K DH", surface: 80, base: "habitable", localite: NORD_A, precision: 4 },
  { source: A, id: "A5", date: "2026-10-03", transaction: "vente", type: "appartement", prix: "880K DH", surface: 80, base: "habitable", localite: NORD_A, precision: 4 }, // réimport identique
  { source: A, id: "A7", date: "2026-07-15", transaction: "vente", type: "appartement", prix: "2 000 000 DH", surface: 100, base: "habitable", localite: NORD_A, precision: 4 }, // hors fenêtre
  { source: B, id: "B1", date: "2026-10-20", transaction: "vente", type: "appartement", prix: "1 386 000 DH", surface: 99, base: "habitable", localite: NORD_B, precision: 4, empreinte: "EMP-A3" }, // doublon fort de A3
  { source: B, id: "B2", date: "2026-10-05", transaction: "vente", type: "appartement", prix: "1 230 000 DH", surface: 102.5, base: "habitable", localite: NORD_B, precision: 4 }, // sosie de A2, sans empreinte
  { source: B, id: "B3", date: "2026-10-06", transaction: "vente", type: "appartement", prix: "1 300 000 DH", surface: 100, base: "habitable", localite: NORD_B, precision: 4 },
  // Villas : surface habitable et surface de parcelle, jamais mélangées ; cohortes clairsemées.
  { source: A, id: "A8", date: "2026-10-07", transaction: "vente", type: "villa", prix: "4 000 000 DH", surface: 250, base: "habitable", localite: NORD_A, precision: 4 },
  { source: A, id: "A9", date: "2026-10-08", transaction: "vente", type: "villa", prix: "4 500 000 DH", surface: 500, base: "parcelle", localite: NORD_A, precision: 4 },
  { source: A, id: "A10", date: "2026-10-08", transaction: "vente", type: "terrain", prix: "3 000 000 DH", surface: 300, base: "habitable", localite: NORD_A, precision: 4 }, // incohérent
  // Cohorte 3 — Arr-Sud, location mensuelle, appartement.
  { source: A, id: "A11", date: "2026-10-01", transaction: "location", type: "appartement", prix: "8 000 DH/mois", surface: 80, base: "habitable", localite: SUD, precision: 4 },
  { source: A, id: "A12", date: "2026-10-02", transaction: "location", type: "appartement", prix: "9 900 DH/mois", surface: 90, base: "habitable", localite: SUD, precision: 4 },
  { source: B, id: "B4", date: "2026-10-03", transaction: "location", type: "appartement", prix: "6 000 DH/mois", surface: 50, base: "habitable", localite: SUD, precision: 4 },
  { source: B, id: "B5", date: "2026-10-04", transaction: "location", type: "appartement", prix: "7 200 DH/mois", surface: 80, base: "habitable", localite: SUD, precision: 4 },
  { source: B, id: "B6", date: "2026-10-05", transaction: "location", type: "appartement", prix: "13 000 DH/mois", surface: 100, base: "habitable", localite: SUD, precision: 4 },
  // Location à la journée : segment distinct.
  { source: A, id: "A13", date: "2026-10-06", transaction: "location", type: "appartement", prix: "600 DH/jour", surface: 60, base: "habitable", localite: SUD, precision: 4 },
  // Anomalies : période absente, monnaie étrangère, prix nul, prix absent.
  { source: B, id: "B7", date: "2026-10-06", transaction: "location", type: "appartement", prix: "9 000 DH", surface: 90, base: "habitable", localite: SUD, precision: 4 },
  { source: B, id: "B8", date: "2026-10-06", transaction: "vente", type: "appartement", prix: "250 000 €", surface: 100, base: "habitable", localite: NORD_B, precision: 4 },
  { source: A, id: "A14", date: "2026-10-06", transaction: "vente", type: "appartement", prix: "0 DH", surface: 100, base: "habitable", localite: NORD_A, precision: 4 },
  { source: A, id: "A15", date: "2026-10-06", transaction: "vente", type: "appartement", prix: "—", surface: 100, base: "habitable", localite: NORD_A, precision: 4 },
  // Géographie : limite ambiguë (deux arrondissements), précision commune seulement.
  { source: B, id: "B9", date: "2026-10-07", transaction: "vente", type: "appartement", prix: "1 100 000 DH", surface: 100, base: "habitable", localite: "Lisière-Synthétique", precision: 4 },
  { source: B, id: "B10", date: "2026-10-07", transaction: "vente", type: "appartement", prix: "1 500 000 DH", surface: 100, base: "habitable", localite: "Ville-Synthetique", precision: 3 },
  { source: B, id: "B11", date: "2026-10-07", transaction: "vente", type: "appartement", prix: "1 600 000 DH", surface: 100, base: "habitable", localite: "Arr-Nord-Synthetique", precision: 3 },
];

/** Normalisation d'une ligne brute (lecture du montant, rattachement) : la chaîne amont des lots P3/P4. */
function normaliser(b: Brute): ObservationAnnonce {
  const m = parserMontant(b.prix);
  const r = rattacherLocalite(b.localite, TERRITOIRES, b.precision);
  return {
    source: b.source, idAnnonce: b.id, dateObservation: b.date, transaction: b.transaction, typeBien: b.type, etat: null,
    prix: m.valeur, monnaie: m.monnaie, periode: b.transaction === "vente" ? (m.periode ?? "total") : m.periode,
    surface: b.surface, baseSurface: b.base, libelleLocalite: b.localite,
    territoire: r.resultat === "exact" ? { code: r.territoire.code, niveau: r.territoire.niveau } : null,
    empreinte: b.empreinte ?? null,
  };
}

const PARAMS: ParametresCellules = { fenetreJours: 90, seuil: 5, versionMethode: "prix-annonces-golden-1", dateReference: "2026-10-31" };

function chaine(brutes: readonly Brute[], decisions: readonly DecisionDoublon[] = []) {
  const tri = trierObservations(brutes.map(normaliser));
  const candidats = chercherCandidatsDoublons(tri.admises);
  const biens = construireBiens(tri.admises.map((o) => `${o.source}|${o.idAnnonce}`), candidats, decisions);
  return { tri, candidats, biens, resultat: construireCellules(tri.admises, biens.biens, PARAMS) };
}

const cellule = (cellules: readonly CellulePrix[], territoire: string, transaction: string, typeBien: string, baseSurface: string, periode: string) =>
  cellules.find((c) => c.territoire === territoire && c.transaction === transaction && c.typeBien === typeBien && c.baseSurface === baseSurface && c.periode === periode);

describe("jeu de référence synthétique (golden, P5)", () => {
  const { tri, candidats, biens, resultat } = chaine(BRUTES);

  it("quarantaine : terrain en surface habitable, loyer sans période, EUR, prix nul, prix absent", () => {
    expect(tri.quarantaine.map((q) => [q.observation.idAnnonce, q.motifs])).toEqual([
      ["A10", ["base-surface-incoherente"]],
      ["B7", ["periode-inconnue"]],
      ["B8", ["monnaie-non-supportee"]],
      ["A14", ["prix-non-positif"]],
      // « — » : ni montant ni monnaie ; les deux motifs sont rapportés.
      ["A15", ["prix-absent", "monnaie-absente"]],
    ]);
  });

  it("doublons : A3/B1 (empreinte égale) forte ; A2/B2 (sosie sans empreinte) à revoir, jamais fusionné (PRX04)", () => {
    expect(candidats.map((c) => [c.a, c.b, c.confiance])).toEqual([
      ["source-synthetique-A|A2", "source-synthetique-B|B2", "a-revoir"],
      ["source-synthetique-A|A3", "source-synthetique-B|B1", "forte"],
    ]);
    const multi = biens.biens.filter((b) => b.annonces.length > 1);
    expect(multi.map((b) => [b.id, b.annonces])).toEqual([["source-synthetique-A|A3", ["source-synthetique-A|A3", "source-synthetique-B|B1"]]]);
    expect(biens.aRevoir).toHaveLength(1);
  });

  it("cohorte Arr-Nord, vente, appartement, habitable : médiane et quartiles calculés à la main (PRX03)", () => {
    // Biens distincts et prix unitaires (MAD/m²), dernière observation dans la fenêtre :
    //   A1 : 1 000 000 / 100 = 10 000 (observation du 2026-10-10 ; celle du 2026-09-01 est remplacée)
    //   A2 : 1 200 000 / 100 = 12 000
    //   A3+B1 : un seul bien, B1 plus récent : 1 386 000 / 99 = 14 000 (A3 exclu, doublon inter-sources)
    //   A4 : 1 650 000 / 110 = 15 000 (« 1,65M DH », approximatif)
    //   A5 : 880 000 / 80 = 11 000 (réimport identique compté une fois)
    //   B2 : 1 230 000 / 102,5 = 12 000 (sosie de A2, bien distinct)
    //   B3 : 1 300 000 / 100 = 13 000
    //   A7 : hors fenêtre (2026-07-15).
    // Triés : 10 000, 11 000, 12 000, 12 000, 13 000, 14 000, 15 000 ; n = 7.
    // Médiane : h = 6 × 0,5 = 3 → x[3] = 12 000.
    // Q1 : h = 6 × 0,25 = 1,5 → 11 000 + 0,5 × (12 000 − 11 000) = 11 500.
    // Q3 : h = 6 × 0,75 = 4,5 → 13 000 + 0,5 × (14 000 − 13 000) = 13 500.
    // Atypiques : IQR = 2 000, bornes [11 500 − 6 000, 13 500 + 6 000] = [5 500, 19 500] → aucun.
    const c = cellule(resultat.cellules, "T-ARR-N", "vente", "appartement", "habitable", "total")!;
    expect(c).toMatchObject({
      niveau: "arrondissement", etatDonnee: "disponible", unite: "MAD/m2", monnaie: "MAD",
      mediane: 12000, q1: 11500, q3: 13500,
      // brutes : A1 ×2, A2, A3, A4, A5, A7, B1, B2, B3 = 10 ; éligibles = 10 − A7 = 9 ; distinctes = 7.
      effectifs: { brutes: 10, eligibles: 9, distinctes: 7 },
      exclusions: { "hors-fenetre": 1, "observation-remplacee": 1, "doublon-inter-sources": 1 },
      contributionParSource: { "source-synthetique-A": 4, "source-synthetique-B": 3 },
      atypiques: 0, medianeHorsAtypiques: null,
      premiereObservation: "2026-09-15", derniereObservation: "2026-10-20",
    });
    expect(c.clesRetenues).toContain("source-synthetique-B|B1|2026-10-20");
    expect(c.clesRetenues).not.toContain("source-synthetique-A|A3|2026-10-01");
  });

  it("villas : surface habitable et parcelle en cohortes distinctes, clairsemées → échantillon insuffisant (PRX05, PRX07)", () => {
    const hab = cellule(resultat.cellules, "T-ARR-N", "vente", "villa", "habitable", "total")!;
    const par = cellule(resultat.cellules, "T-ARR-N", "vente", "villa", "parcelle", "total")!;
    for (const c of [hab, par]) expect(c).toMatchObject({ etatDonnee: "echantillon-insuffisant", mediane: null, q1: null, q3: null, effectifs: { distinctes: 1 } });
    expect(cellule(resultat.cellules, "T-ARR-N", "vente", "terrain", "habitable", "total")).toBeUndefined();
  });

  it("loyers mensuels Arr-Sud : MAD/m²/mois calculés à la main ; loyer journalier à part (PRX05)", () => {
    // 8 000/80 = 100 ; 9 900/90 = 110 ; 6 000/50 = 120 ; 7 200/80 = 90 ; 13 000/100 = 130.
    // Triés : 90, 100, 110, 120, 130 ; n = 5. Médiane : h = 2 → 110. Q1 : h = 1 → 100. Q3 : h = 3 → 120.
    const mois = cellule(resultat.cellules, "T-ARR-S", "location", "appartement", "habitable", "mois")!;
    expect(mois).toMatchObject({ etatDonnee: "disponible", unite: "MAD/m2/mois", mediane: 110, q1: 100, q3: 120, effectifs: { distinctes: 5 } });
    // 600 DH/jour / 60 m² = 10 MAD/m²/jour : un seul bien, cohorte insuffisante, jamais mélangée au mois.
    const jour = cellule(resultat.cellules, "T-ARR-S", "location", "appartement", "habitable", "jour")!;
    expect(jour).toMatchObject({ unite: "MAD/m2/jour", etatDonnee: "echantillon-insuffisant", mediane: null, effectifs: { distinctes: 1 } });
  });

  it("géographie : limite ambiguë non rattachée ; précision commune jamais affinée en arrondissement (PRX06)", () => {
    expect(resultat.totaux).toMatchObject({ nonRattachees: 2, doublonsIdentiques: 1, nonAdmises: 0 });
    const commune = cellule(resultat.cellules, "T-COM", "vente", "appartement", "habitable", "total")!;
    expect(commune).toMatchObject({ niveau: "commune", etatDonnee: "echantillon-insuffisant", mediane: null, clesRetenues: ["source-synthetique-B|B10|2026-10-07"] });
    const nord = cellule(resultat.cellules, "T-ARR-N", "vente", "appartement", "habitable", "total")!;
    expect(nord.clesRetenues.some((k) => /\|B(9|10|11)\|/.test(k))).toBe(false);
  });

  it("six cellules exactement, aucune valeur à zéro", () => {
    expect(resultat.cellules).toHaveLength(6);
    for (const c of resultat.cellules) {
      expect(c.mediane === null || c.mediane > 0).toBe(true);
      if (c.etatDonnee === "echantillon-insuffisant") expect([c.mediane, c.q1, c.q3]).toEqual([null, null, null]);
    }
  });

  it("idempotence : même entrée deux fois, réimport doublé et ordre mélangé → cellules et empreinte identiques (PRX02)", () => {
    const encore = chaine(BRUTES).resultat;
    expect(encore.cellules).toEqual(resultat.cellules);
    expect(encore.empreinte).toBe(resultat.empreinte);
    const double = chaine([...BRUTES, ...BRUTES].reverse()).resultat;
    expect(double.cellules).toEqual(resultat.cellules);
    expect(double.manifeste).toEqual(resultat.manifeste);
    expect(double.empreinte).toBe(resultat.empreinte);
  });

  it("reproductibilité : manifeste trié, versionné, empreintes SHA-256 sensibles au contenu et à la méthode (PRX12)", () => {
    const m = resultat.manifeste;
    expect(m).toMatchObject({
      versionMethode: "prix-annonces-golden-1", versionValidation: "prix-validation-1", methodeQuantile: "hyndman-fan-7",
      parametres: { fenetreJours: 90, seuil: 5, dateReference: "2026-10-31", ventilerParEtat: false }, algorithmeEmpreinte: "sha-256",
      biens: [{ id: "source-synthetique-A|A3", annonces: ["source-synthetique-A|A3", "source-synthetique-B|B1"] }],
    });
    expect(m.entrees).toEqual([...m.entrees].sort());
    expect(new Set(m.entrees).size).toBe(m.entrees.length);
    expect(resultat.empreinte).toMatch(/^[0-9a-f]{64}$/);
    // Un centime de différence sur une entrée change les empreintes.
    const modifie = chaine(BRUTES.map((b) => (b.id === "B3" ? { ...b, prix: "1 300 000,01 DH" } : b))).resultat;
    expect(modifie.manifeste.empreinteEntrees).not.toBe(m.empreinteEntrees);
    expect(modifie.empreinte).not.toBe(resultat.empreinte);
    // Une autre version de méthode change l'empreinte, pas les valeurs.
    const tri = trierObservations(BRUTES.map(normaliser));
    const autre = construireCellules(tri.admises, biens.biens, { ...PARAMS, versionMethode: "prix-annonces-golden-2" });
    expect(autre.cellules).toEqual(resultat.cellules);
    expect(autre.empreinte).not.toBe(resultat.empreinte);
  });

  it("décision persistée de fusion A2/B2 : nouvel instantané, recalcul à la main", () => {
    const decision: DecisionDoublon = { a: "source-synthetique-B|B2", b: "source-synthetique-A|A2", decision: "fusion", date: "2026-10-25T09:00:00Z", auteur: "revue-synthetique" };
    const r = chaine(BRUTES, [decision]);
    // A2 et B2 = un bien ; B2 (2026-10-05) plus récent que A2 (2026-09-15) → 12 000 retenu une fois.
    // Triés : 10 000, 11 000, 12 000, 13 000, 14 000, 15 000 ; n = 6.
    // Médiane : h = 2,5 → 12 000 + 0,5 × 1 000 = 12 500. Q1 : h = 1,25 → 11 000 + 0,25 × 1 000 = 11 250.
    // Q3 : h = 3,75 → 13 000 + 0,75 × 1 000 = 13 750.
    const c = cellule(r.resultat.cellules, "T-ARR-N", "vente", "appartement", "habitable", "total")!;
    expect(c).toMatchObject({
      mediane: 12500, q1: 11250, q3: 13750, effectifs: { distinctes: 6 },
      exclusions: { "doublon-inter-sources": 2 }, contributionParSource: { "source-synthetique-A": 3, "source-synthetique-B": 3 },
    });
    expect(r.biens.aRevoir).toEqual([]);
    expect(r.resultat.empreinte).not.toBe(resultat.empreinte);
    // Rejouée, la même décision donne le même instantané.
    expect(chaine(BRUTES, [decision]).resultat.empreinte).toBe(r.resultat.empreinte);
  });
});
