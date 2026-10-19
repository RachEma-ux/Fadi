import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { DEFINITIONS_PERF, ReleveurPerf } from "./perf";
import { mesurerAccrochage, mesurerCommandes } from "./mesures-studio";

describe("Instrumentation PERF-01 à PERF-10 (X.1-09)", () => {
  it("dix codes, définitions relevées mot pour mot dans REF-02 §18.1", () => {
    expect(DEFINITIONS_PERF.map((d) => d.code)).toEqual(["PERF-01", "PERF-02", "PERF-03", "PERF-04", "PERF-05", "PERF-06", "PERF-07", "PERF-08", "PERF-09", "PERF-10"]);
    const d = Object.fromEntries(DEFINITIONS_PERF.map((x) => [x.code, x]));
    expect(d["PERF-01"]).toMatchObject({ mesure: "Ouverture de Studio jusqu’à la première action utile.", profils: "Cache froid/chaud, réseau, CPU, appareil.", porte: "p50/p95 avec limite décidée." });
    expect(d["PERF-04"]).toMatchObject({ profils: "100 / 10 000 / 100 000 primitives illustratives, densité variable.", porte: "p50/p95/p99 ET conformité géométrique." });
    expect(d["PERF-09"]).toMatchObject({ mesure: "Mémoire longue session.", porte: "Pic, résiduelle, absence de fuite." });
    expect(d["PERF-10"]).toMatchObject({ mesure: "Travail hors ligne.", porte: "Disponibilité réelle et données récupérables." });
  });

  it("aucun seuil inventé : ni champ de limite ni nombre dans le module (DEC-13)", () => {
    for (const x of DEFINITIONS_PERF) expect(Object.keys(x).sort()).toEqual(["code", "etat", "instrumentation", "mesure", "porte", "profils"]);
    const source = readFileSync(new URL("./perf.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/seuil\s*[:=]\s*\d|limite\s*[:=]\s*\d|budget\s*[:=]/i);
  });

  it("PERF-07 déclaré non applicable (aucun booléen exact dans Studio V1), jamais simulé", () => {
    expect(DEFINITIONS_PERF.filter((x) => x.etat === "non-applicable").map((x) => x.code)).toEqual(["PERF-07"]);
  });

  it("enregistrement : valeur non finie écartée, synthèse sans verdict (n, min, médiane, max)", () => {
    let t = 0;
    const r = new ReleveurPerf(() => t);
    expect(r.enregistrer("PERF-02", Number.NaN)).toBeNull();
    for (const v of [5, 1, 3, 2]) { t += 1; r.enregistrer("PERF-02", v, "ms", { outil: "studio.dessin.ligne" }); }
    const s = r.synthese().find((x) => x.code === "PERF-02")!;
    expect(s).toMatchObject({ n: 4, min: 1, mediane: 2.5, max: 5, unite: "ms" });
    expect(s.derniere?.etiquettes).toEqual({ outil: "studio.dessin.ligne" });
    expect(r.synthese().find((x) => x.code === "PERF-03")).toMatchObject({ n: 0, mediane: null });
    expect(Object.keys(r.releve())).toEqual(["definitions", "contexte", "synthese", "journal"]);
  });

  it("mesures bornées par code : un code fréquent n'efface pas les autres", () => {
    const r = new ReleveurPerf(() => 0, 3);
    r.enregistrer("PERF-01", 10);
    for (let i = 0; i < 10; i++) r.enregistrer("PERF-05", i);
    expect(r.mesures("PERF-05").map((m) => m.valeur)).toEqual([7, 8, 9]);
    expect(r.mesures("PERF-01")).toHaveLength(1);
  });

  it("durée par début / fin ; points de mesure transparents (valeur et exception de l'opération mesurée)", () => {
    let t = 100;
    const r = new ReleveurPerf(() => t);
    const m = r.debut("PERF-08", { nature: "feuille.composer" });
    t = 140;
    expect(m.fin({ issue: "aboutie" })).toMatchObject({ valeur: 40, etiquettes: { nature: "feuille.composer", issue: "aboutie" } });
    expect(mesurerCommandes([{ toolId: "studio.dessin.ligne" }], () => 7)).toBe(7);
    expect(mesurerAccrochage(3, () => null)).toBeNull();
    expect(() => mesurerCommandes([{ toolId: "studio.architecture.mur" }], () => { throw new Error("refus"); })).toThrow("refus");
  });

  it("User Timing : mesure nommée fadi:PERF-xx quand le navigateur l'offre", () => {
    const measure = vi.fn(), mark = vi.fn();
    vi.stubGlobal("performance", { now: () => 0, measure, mark, clearMarks: vi.fn(), clearMeasures: vi.fn() });
    try {
      const r = new ReleveurPerf();
      r.enregistrer("PERF-02", 12, "ms", {}, 3);
      r.enregistrer("PERF-09", 1024, "octets");
      expect(measure).toHaveBeenCalledWith("fadi:PERF-02", expect.objectContaining({ start: 3, end: 15 }));
      expect(mark).toHaveBeenCalledWith("fadi:PERF-09", expect.anything());
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
