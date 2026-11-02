import { describe, expect, it } from "vitest";
import {
  STUDIO_BUDGETS_CWV, STUDIO_CHAMPS_PROTOCOLE, STUDIO_GRANDEURS_CHARGEMENT, STUDIO_OPERATIONS_FIDELITE, STUDIO_RAPPORT_OPTIMISATION_SCHEMA, STUDIO_REFERENCE_MESURES_SCHEMA,
  studioCls, studioComparerAReference, studioConfronterCwv, studioDistribution, studioEtablirReference, studioInp, studioJugerConclusion, studioJugerOptimisation,
  studioJugerReactivite, studioQualifierEnvironnement, studioQuantile, studioRenduLogiciel, studioValiderReference,
  type StudioEnvironnementMesure, type StudioMesureCache, type StudioMesuresSeparees, type StudioRapportOptimisation, type StudioReferenceMesures,
} from "./index.js";

const ENV: StudioEnvironnementMesure = {
  materiel: { plateforme: "linux 6.8", processeur: "AMD EPYC", coeurs: 4 },
  navigateur: { nom: "Chromium", version: "141.0.7390.37" },
  memoire: { machineOctets: 16 * 2 ** 30, navigateurGo: 8 },
  gpu: { fournisseur: "Google Inc. (Google)", moteur: "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)" },
  ecran: { largeur: 1280, hauteur: 900, densite: 1 },
  caches: ["froid", "chaud"],
  reseau: { mode: "boucle locale (API et application sur la même machine)", limitation: "aucune" },
  build: "2026-10-26T08:00:00Z", commit: "0123abc", repetitions: 5, operations: ["ouverture", "vingt outils"],
  aberrants: "Tukey 1,5 × EIQ, signalés", methode: "médiane, p75", traces: ["trace-froid.json", "studio-g4.mjs"],
};

describe("EX-097 — protocole de mesure reproductible", () => {
  it("statistiques : quantile au rang le plus proche, distribution, aberrants de Tukey signalés et conservés", () => {
    expect(studioQuantile([5, 1, 3, 2, 4], 0.5)).toBe(3);
    expect(studioQuantile([5, 1, 3, 2, 4], 0.75)).toBe(4);
    expect(studioQuantile([], 0.75)).toBeNull();
    const d = studioDistribution([10, 11, 12, 11, 10, 90]);
    expect(d).toEqual({ n: 6, min: 10, p50: 11, p75: 12, p95: 90, max: 90, aberrants: [90] });
  });

  it("environnement complet : quatorze champs exigés, rendu logiciel SwiftShader reconnu, GPU « non évalué »", () => {
    expect(STUDIO_CHAMPS_PROTOCOLE).toHaveLength(14);
    const q = studioQualifierEnvironnement(ENV);
    expect(q).toMatchObject({ complet: true, manquants: [], renduLogiciel: true, classe: "chromium-logiciel", gpu: "non évalué" });
    expect(q.etiquette).toContain("pas un appareil réel");
    for (const m of ["Google SwiftShader", "llvmpipe (LLVM 15.0.7, 256 bits)", null]) expect(studioRenduLogiciel(m)).toBe(true);
    expect(studioRenduLogiciel("ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0)")).toBe(false);
  });

  it("champ manquant (GPU, caches, répétitions, commit) : protocole incomplet, toute conclusion refusée", () => {
    const q = studioQualifierEnvironnement({ ...ENV, gpu: { fournisseur: null, moteur: null }, caches: [], repetitions: 0, commit: "" });
    expect(q.complet).toBe(false);
    expect(q.manquants).toEqual(["gpu", "caches", "commit", "repetitions"]);
    const j = studioJugerConclusion({ ...ENV, commit: null }, { sujet: "chargement", source: "cdp", enonce: "octets transférés" });
    expect(j.admise).toBe(false);
    expect(j.refus.map((r) => r.motif)).toEqual(["protocole-incomplet"]);
  });

  it("cas négatif : un résultat SwiftShader ou une durée renderer.render() présentés comme coût GPU sont refusés", () => {
    const swift = studioJugerConclusion(ENV, { sujet: "gpu", source: "minuteur-gpu", enonce: "trame GPU 4 ms" });
    expect(swift.admise).toBe(false);
    expect(swift.refus.map((r) => r.motif)).toEqual(["gpu-sous-rendu-logiciel"]);
    const reel = { ...ENV, gpu: { fournisseur: "NVIDIA", moteur: "ANGLE (NVIDIA GeForce RTX 3060)" } };
    const cpu = studioJugerConclusion(reel, { sujet: "gpu", source: "renderer.render", enonce: "rendu 2 ms" });
    expect(cpu.refus.map((r) => r.motif)).toEqual(["render-cpu-presente-comme-gpu"]);
    // Admis : la même durée comme temps CPU, ou un minuteur GPU sur un appareil à GPU physique.
    expect(studioJugerConclusion(ENV, { sujet: "cpu", source: "renderer.render", enonce: "rendu CPU 2 ms" }).admise).toBe(true);
    expect(studioJugerConclusion(reel, { sujet: "gpu", source: "minuteur-gpu", enonce: "trame GPU 4 ms" }).admise).toBe(true);
  });
});

const mesure = (o: Partial<StudioMesureCache> = {}): StudioMesureCache => ({
  requetes: 40, octetsTransferes: 2_000_000, octetsServeur: 1_900_000, chunksExecutes: 30, tasOctets: 20_000_000,
  famillesExecutees: ["planche"], moteursInitialises: ["planche-2d"], fichiersDemandes: ["/assets/a.js"], ...o,
});
const REF: StudioReferenceMesures = {
  schema: STUDIO_REFERENCE_MESURES_SCHEMA, revision: 1, etablieLe: "2026-10-26T08:00:00Z", commit: "0123abc", build: "b", motif: "première mesure",
  appareil: { classe: "chromium-logiciel", navigateur: "Chromium 141", moteurWebgl: "SwiftShader", fenetre: { largeur: 1280, hauteur: 900 } },
  profil: Array.from({ length: 20 }, (_, i) => `outil.${i}`), repetitions: 5,
  tolerances: Object.fromEntries(STUDIO_GRANDEURS_CHARGEMENT.map((g) => [g, { relative: 0.2, absolue: g === "requetes" || g === "chunksExecutes" ? 2 : 16_384 }])) as StudioReferenceMesures["tolerances"],
  froid: { requetes: 40, octetsTransferes: 2_000_000, octetsServeur: 1_900_000, chunksExecutes: 30, tasOctets: 20_000_000 },
  chaud: { requetes: 40, octetsTransferes: 100_000, octetsServeur: 20_000, chunksExecutes: 30, tasOctets: 20_000_000 },
  invariants: { famillesInterdites: ["three", "vue3d", "noyau-exact"], moteursAdmis: ["planche-2d"], fichiersInterdits: ["occt[^/]*\\.wasm$"] },
};
const APPAREIL = { classe: "chromium-logiciel" as const, fenetre: { largeur: 1280, hauteur: 900 } };

describe("AC-002 / TEST-016 — verdict contre une référence versionnée, cache froid et chaud", () => {
  it("référence valide : schéma, révision, profil d'environ vingt outils, valeurs mesurées par cache, invariants", () => {
    expect(studioValiderReference(REF)).toEqual([]);
    expect(studioValiderReference({ ...REF, profil: ["a"], chaud: { ...REF.chaud, tasOctets: null } })).toEqual(["profil d'environ vingt outils exigé (15 à 25)", "chaud.tasOctets : valeur mesurée exigée"]);
  });

  it("mesure dans les tolérances : verdict « conforme » par cache et par grandeur (requêtes, octets, chunks exécutés, tas)", () => {
    const v = studioComparerAReference(REF, { froid: mesure({ octetsTransferes: 2_100_000 }), chaud: mesure({ octetsTransferes: 100_500, octetsServeur: 21_000 }) }, APPAREIL);
    expect(v.verdict).toBe("conforme");
    expect(v.comparaisons).toHaveLength(10);
    expect(new Set(v.comparaisons.map((c) => c.verdict))).toEqual(new Set(["conforme"]));
    expect(v.comparaisons.find((c) => c.cache === "froid" && c.grandeur === "octetsTransferes")!.ecartRelatif).toBeCloseTo(0.05, 9);
  });

  it("régression : octets du cache chaud au-delà de la borne, chunk spécialisé exécuté, moteur rare initialisé, binaire exact demandé", () => {
    const v = studioComparerAReference(REF, {
      froid: mesure({ famillesExecutees: ["planche", "three"], moteursInitialises: ["planche-2d", "noyau-exact"], fichiersDemandes: ["/assets/occt-wasm.wasm"] }),
      chaud: mesure({ octetsTransferes: 500_000, octetsServeur: 20_000 }),
    }, APPAREIL);
    expect(v.verdict).toBe("regression");
    expect(v.comparaisons.filter((c) => c.verdict === "regression").map((c) => `${c.cache}.${c.grandeur}`)).toEqual(["chaud.octetsTransferes"]);
    expect(v.invariants.map((i) => i.regle)).toEqual(["famille-interdite-executee", "moteur-non-admis-initialise", "fichier-interdit-demande"]);
  });

  it("aucun taux de réduction présumé : une baisse est constatée « amélioration », la référence est à rétablir, le verdict reste conforme", () => {
    const v = studioComparerAReference(REF, { froid: mesure({ octetsTransferes: 1_000_000 }), chaud: mesure({ octetsTransferes: 100_000, octetsServeur: 20_000 }) }, APPAREIL);
    expect(v.verdict).toBe("conforme");
    expect(v.referenceARetablir).toBe(true);
    const r2 = studioEtablirReference(REF, { froid: mesure({ octetsTransferes: 1_000_000 }), chaud: REF.chaud }, { etablieLe: "2026-10-27", commit: "c2", build: "b2", motif: "découpage", appareil: REF.appareil, repetitions: 5 });
    expect(r2.revision).toBe(2);
    expect(r2.froid.octetsTransferes).toBe(1_000_000);
    expect((r2.froid as Record<string, unknown>).famillesExecutees).toBeUndefined();
    expect(studioValiderReference(r2)).toEqual([]);
  });

  it("autre classe d'appareil, autre fenêtre ou grandeur non mesurée : « non évalué », jamais comparé", () => {
    expect(studioComparerAReference(REF, { froid: mesure(), chaud: mesure() }, { classe: "appareil-gpu", fenetre: { largeur: 1280, hauteur: 900 } }).verdict).toBe("non-evalue");
    expect(studioComparerAReference(REF, { froid: mesure(), chaud: mesure() }, { ...APPAREIL, fenetre: { largeur: 390, hauteur: 844 } }).verdict).toBe("non-evalue");
    const v = studioComparerAReference(REF, { froid: mesure({ tasOctets: null }), chaud: null }, APPAREIL);
    expect(v.verdict).toBe("non-evalue");
    expect(v.comparaisons.filter((c) => c.verdict === "non-evalue")).toHaveLength(6);
  });
});

describe("J5 / DEC-13 — budgets Core Web Vitals confrontés au p75", () => {
  it("budgets de DEC-13 : LCP ≤ 2 500 ms, INP ≤ 200 ms, CLS ≤ 0,1 au p75", () => {
    expect(STUDIO_BUDGETS_CWV).toMatchObject({ quantile: 0.75, lcpMs: 2500, inpMs: 200, cls: 0.1 });
  });

  it("INP : plus longue interaction (ou 98ᵉ centile au-delà de 50) ; CLS : plus grande fenêtre de session, décalages après saisie exclus", () => {
    expect(studioInp([{ interactionId: 1, duration: 24 }, { interactionId: 1, duration: 40 }, { interactionId: 2, duration: 16 }, { interactionId: 0, duration: 500 }])).toBe(40);
    expect(studioInp([])).toBeNull();
    const cent = Array.from({ length: 100 }, (_, i) => ({ interactionId: i + 1, duration: i + 1 }));
    expect(studioInp(cent)).toBe(98);
    expect(studioCls([{ startTime: 0, value: 0.05, hadRecentInput: false }, { startTime: 500, value: 0.03, hadRecentInput: false }, { startTime: 3000, value: 0.04, hadRecentInput: false }, { startTime: 3100, value: 0.5, hadRecentInput: true }])).toBeCloseTo(0.08, 12);
    expect(studioCls([])).toBe(0);
  });

  it("séries dans le budget, hors budget, ou vides (« non évalué », jamais zéro)", () => {
    expect(studioConfronterCwv({ lcp: [800, 900, 1000, 1100], inp: [40, 48, 56, 64], cls: [0, 0, 0.01, 0] }).verdict).toBe("dans-le-budget");
    const hors = studioConfronterCwv({ lcp: [800, 2600, 2700, 2800], inp: [40], cls: [0] });
    expect(hors.verdict).toBe("hors-budget");
    expect(hors.lcp).toEqual({ p75: 2700, n: 4, budget: 2500, verdict: "hors-budget" });
    const vide = studioConfronterCwv({ lcp: [900], inp: [null, null], cls: [0] });
    expect(vide.inp).toEqual({ p75: null, n: 0, budget: 200, verdict: "non-evalue" });
    expect(vide.verdict).toBe("non-evalue");
  });
});

describe("EX-059 — réactivité pendant un calcul lourd dans un Worker", () => {
  const base = { calcul: "booléen exact", calculMs: 3000, surWorker: true, trames: 150, trameMaxMs: 33, interactionsMs: [48, 56] };
  it("Worker, trames continues, interactions sous le budget INP : « disponible »", () => {
    expect(studioJugerReactivite(base)).toEqual({ verdict: "disponible", motifs: [], budgetInpMs: 200 });
  });
  it("cas négatif : calcul sur le fil principal (une trame de 3 s, interaction de 2,9 s) : « bloque », visible avec ses motifs", () => {
    const v = studioJugerReactivite({ ...base, surWorker: false, trames: 1, trameMaxMs: 3000, interactionsMs: [2900] });
    expect(v.verdict).toBe("bloque");
    expect(v.motifs).toHaveLength(5);
  });
  it("calcul trop court ou aucune interaction pendant le calcul : « non évalué »", () => {
    expect(studioJugerReactivite({ ...base, calculMs: 120 }).verdict).toBe("non-evalue");
    expect(studioJugerReactivite({ ...base, interactionsMs: [] }).verdict).toBe("non-evalue");
  });
});

const postes = (o: Partial<StudioMesuresSeparees> = {}): StudioMesuresSeparees => ({
  transfertMs: 0.4, transfertOctets: 12_000, activationMs: 20, calculMs: 3, renduCpuMs: 1.5, renduGpuMs: null,
  invalidation: { objets: 1, complet: false, reconstruits: 1, ms: 0.1 }, memoireResiduelleOctets: 1024, ...o,
});
const fid = { rayons: 1200, divergences: 0, ecartDistanceMax: 0, aspectsDivergents: 0, trianglesReference: 400, trianglesOptimise: 400 };
const rapport = (ops = STUDIO_OPERATIONS_FIDELITE.map((operation) => ({ operation, reference: postes(), optimise: postes(), fidelite: fid }))): StudioRapportOptimisation => ({
  schema: STUDIO_RAPPORT_OPTIMISATION_SCHEMA, environnement: { etiquette: "Chromium logiciel (CI)", renduLogiciel: true }, operations: ops,
});

describe("AC-005 / MES-03 — verdict avant / après optimisation, postes mesurés séparément", () => {
  it("cinq opérations fidèles et tous les postes mesurés : « fidèle », GPU « non évalué »", () => {
    expect(studioJugerOptimisation(rapport())).toMatchObject({ verdict: "fidele", gpu: "non évalué", infideles: [], postesManquants: [], operationsManquantes: [] });
  });
  it("cas négatif : géométrie modifiée pour gagner du temps (triangles retirés, rayons divergents) : « infidèle »", () => {
    const ops = rapport().operations.map((o) => (o.operation === "pousser-tirer" ? { ...o, fidelite: { ...fid, divergences: 12, trianglesOptimise: 380 } } : o));
    const v = studioJugerOptimisation(rapport(ops));
    expect(v.verdict).toBe("infidele");
    expect(v.infideles.map((i) => i.operation)).toEqual(["pousser-tirer", "pousser-tirer"]);
  });
  it("cas négatif : temps GPU rapporté sous SwiftShader (GPU et CPU confondus) : rapport refusé", () => {
    const ops = rapport().operations.map((o) => ({ ...o, optimise: postes({ renduGpuMs: 1.5 }) }));
    const v = studioJugerOptimisation(rapport(ops));
    expect(v.verdict).toBe("refuse");
    expect(v.refus).toHaveLength(5);
  });
  it("opération absente ou poste non mesuré (invalidation, mémoire résiduelle) : « incomplet »", () => {
    expect(studioJugerOptimisation(rapport(rapport().operations.slice(0, 4)))).toMatchObject({ verdict: "incomplet", operationsManquantes: ["materiau"] });
    const ops = rapport().operations.map((o) => (o.operation === "zoom" ? { ...o, optimise: postes({ invalidation: null, memoireResiduelleOctets: null }) } : o));
    expect(studioJugerOptimisation(rapport(ops)).postesManquants).toEqual([
      { operation: "zoom", chemin: "optimise", poste: "invalidation" }, { operation: "zoom", chemin: "optimise", poste: "memoireResiduelleOctets" },
    ]);
  });
});
