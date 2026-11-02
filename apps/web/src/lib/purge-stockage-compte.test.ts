import { describe, expect, it } from "vitest";
import { PREFIXES_DONNEES_COMPTE, purgerStockageCompte } from "./purge-stockage-compte";

function stockage(entrees: Record<string, string>) {
  const m = new Map(Object.entries(entrees));
  return {
    get length() { return m.size; },
    key: (i: number) => [...m.keys()][i] ?? null,
    removeItem: (k: string) => { m.delete(k); },
    restantes: () => [...m.keys()].sort(),
  };
}

describe("BD-1.7 — purge des données du compte dans le stockage local", () => {
  it("efface les clés du compte et du projet, garde les réglages de l'appareil", () => {
    const s = stockage({
      "fadi-atelier-presse-papiers": "{}",
      "fadi.atelier.prefs": "{}",
      "fadi.atelier.ensembles-sync": "{}",
      "geodata.derniere-carte": "c1",
      "geodata.barre-outils": "{}",
      "fadi.sandbox.contexte-travail.p1": "{}",
      "fadi.conflicts.proj": "[]",
      "parcelle-maptiler-key-v1": "secret",
      "fadi.langue": "fr",
      "fadi.planche.precision": "2",
      "fadi.occt.wasm": "x",
    });
    const effacees = purgerStockageCompte(s);
    expect(effacees.sort()).toEqual([
      "fadi-atelier-presse-papiers", "fadi.atelier.ensembles-sync", "fadi.atelier.prefs", "fadi.conflicts.proj",
      "fadi.sandbox.contexte-travail.p1", "geodata.barre-outils", "geodata.derniere-carte", "parcelle-maptiler-key-v1",
    ]);
    expect(s.restantes()).toEqual(["fadi.langue", "fadi.occt.wasm", "fadi.planche.precision"]);
  });

  it("un stockage absent ou qui lève n'est pas une erreur", () => {
    expect(purgerStockageCompte(null)).toEqual([]);
    const casse = { get length(): number { throw new Error("SecurityError"); }, key: () => null, removeItem: () => undefined };
    expect(purgerStockageCompte(casse)).toEqual([]);
  });

  it("la liste couvre la clé de session MapTiler", () => {
    expect(PREFIXES_DONNEES_COMPTE).toContain("fadi.maptiler.session-key");
  });
});
