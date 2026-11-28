import { beforeEach, describe, expect, it } from "vitest";
import { BUDGET_IMPORT_S, borneImport, lancerImport, lireDebit, type TravailleurImport } from "./import-hors-fil";
import type { DemandeImport, MessageImport } from "./import-planche.worker";

class Faux implements TravailleurImport {
  onmessage: ((e: { data: MessageImport }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  recus: DemandeImport[] = [];
  arrete = false;
  postMessage(m: DemandeImport): void {
    this.recus.push(m);
  }
  terminate(): void {
    this.arrete = true;
  }
  repondre(m: MessageImport): void {
    this.onmessage?.({ data: m });
  }
}

const memoire = new Map<string, string>();
beforeEach(() => {
  memoire.clear();
  (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => memoire.get(k) ?? null, setItem: (k: string, v: string) => void memoire.set(k, v), removeItem: (k: string) => void memoire.delete(k) };
});
const demande = { format: "obj" as const, donnees: "v 0 0 0", echelle: 1, nom: "x" };

describe("import hors du fil principal (cas 4, étape 7a)", () => {
  it("borne = débit mesuré × budget, au millier inférieur, jamais sous 1 000", () => {
    expect(BUDGET_IMPORT_S).toBe(20);
    expect(borneImport(3200)).toBe(64000);
    expect(borneImport(10)).toBe(1000);
  });
  it("sans débit gardé : étalonnage d'abord, puis import avec la borne mesurée", async () => {
    const w = new Faux();
    const etats: string[] = [];
    const x = lancerImport(demande, (e) => etats.push(e.phase), { creer: () => w });
    expect(w.recus[0]).toEqual({ genre: "etalonner" });
    w.repondre({ genre: "etalon", trianglesParSeconde: 5000 });
    expect(lireDebit()?.trianglesParSeconde).toBe(5000);
    expect(w.recus[1]).toMatchObject({ genre: "importer", borne: 100000 });
    w.repondre({ genre: "lu", triangles: 10, echelleFichier: null });
    w.repondre({ genre: "progression", fait: 10, total: 10 });
    w.repondre({ genre: "fini", contenus: [], ignores: 0, echelle: 1, ms: 3 });
    expect(await x.issue).toMatchObject({ genre: "fini", triangles: 10 });
    expect(etats).toEqual(["etalonnage", "lecture", "insertion", "insertion"]);
    expect(w.arrete).toBe(true);
  });
  it("Annuler arrête le travailleur ; trop gros et erreur rendus tels quels", async () => {
    memoire.set("fadi.sandbox.planche.import.debit", JSON.stringify({ trianglesParSeconde: 100, mesure: "2026-11-27T10:00:00Z" }));
    const w = new Faux();
    const x = lancerImport(demande, () => {}, { creer: () => w });
    expect(w.recus[0]).toMatchObject({ genre: "importer", borne: 2000 });
    x.annuler();
    expect(await x.issue).toEqual({ genre: "annule" });
    expect(w.arrete).toBe(true);
    const w2 = new Faux();
    const y = lancerImport(demande, () => {}, { creer: () => w2 });
    w2.repondre({ genre: "trop-gros", triangles: 5000, borne: 2000 });
    expect(await y.issue).toEqual({ genre: "trop-gros", triangles: 5000, borne: 2000 });
    const w3 = new Faux();
    const z = lancerImport(demande, () => {}, { creer: () => w3 });
    w3.repondre({ genre: "erreur", code: "illisible", message: "Aucun triangle" });
    expect(await z.issue).toEqual({ genre: "erreur", message: "Aucun triangle" });
  });
});
