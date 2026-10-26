/**
 * MIG-COEX-04 (ADR-STUDIO-PILOTE-01, P-12) : les données locales sans propriétaire ne sont plus vidées par les montées
 * de version du schéma IndexedDB (`local-store.ts`) ; elles sont mises en quarantaine, consultables et exportables.
 * Les montées réelles (fonctions `upgrade` des versions 6 et 7, capturées sur une Dexie simulée) sont jouées sur des
 * tables en mémoire ; la recette `apps/web/e2e/studio-dec.mjs` les joue sur l'IndexedDB réel d'un navigateur.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

type Ligne = Record<string, unknown>;
const disque = vi.hoisted(() => ({
  tables: new Map<string, Map<string, Ligne>>(),
  montees: new Map<number, (tx: unknown) => Promise<void>>(),
  schemas: new Map<number, Record<string, string | null>>(),
}));
const CLES: Record<string, string> = { lots: "id", studioBrouillons: "cle", studioContextes: "cle", quarantaine: "id", modelCache: "projectId", keyValue: "key", comPhotos: "id" };
const lignes = (nom: string) => { if (!disque.tables.has(nom)) disque.tables.set(nom, new Map()); return disque.tables.get(nom)!; };
const tableMemoire = (nom: string) => ({
  toArray: async () => [...lignes(nom).values()],
  bulkPut: async (ls: Ligne[]) => { for (const l of ls) lignes(nom).set(String(l[CLES[nom]!]), l); },
  clear: async () => { lignes(nom).clear(); },
});

vi.mock("dexie", () => ({
  default: class {
    version(n: number) {
      return {
        stores: (s: Record<string, string | null>) => {
          disque.schemas.set(n, s);
          Object.assign(this, { quarantaine: tableMemoire("quarantaine") });
          return { upgrade: (f: (tx: unknown) => Promise<void>) => { disque.montees.set(n, f); return {}; } };
        },
      };
    }
  },
}));

const avant = globalThis.indexedDB;
beforeAll(() => { (globalThis as { indexedDB?: unknown }).indexedDB = {}; });
afterAll(() => { (globalThis as { indexedDB?: unknown }).indexedDB = avant; });
const tx = { table: (nom: string) => tableMemoire(nom) };

describe("MIG-COEX-04 — données locales sans propriétaire en quarantaine, consultables et exportables", () => {
  it("MIG-COEX-04 [+] montée v5 → v6 : les brouillons et contextes Studio sans propriétaire passent en quarantaine, intacts, au lieu d'être vidés", async () => {
    const { localStore } = await import("./local-store");
    disque.tables.clear();
    lignes("studioBrouillons").set("p1|s|v", { cle: "p1|s|v", projectId: "p1", stamp: "a", donnees: "{\"commandes\":[1,2,3]}", majA: "2026-05-01T00:00:00.000Z" });
    lignes("studioContextes").set("p1|s|v", { cle: "p1|s|v", projectId: "p1", contexte: "{}", luA: "2026-05-01T00:00:00.000Z" });
    await localStore.quarantaineLister(); // ouvre la base (constructeur : versions déclarées)
    await disque.montees.get(6)!(tx);
    expect(lignes("studioBrouillons").size).toBe(0);
    expect(lignes("studioContextes").size).toBe(0);
    const q = [...lignes("quarantaine").values()];
    expect(q.map((e) => [e["id"], e["table"], e["version"], e["motif"]]).sort()).toEqual([
      ["studioBrouillons|6|p1|s|v", "studioBrouillons", 6, "sans-proprietaire"],
      ["studioContextes|6|p1|s|v", "studioContextes", 6, "sans-proprietaire"],
    ]);
    expect(JSON.parse(q.find((e) => e["table"] === "studioBrouillons")!["donnees"] as string)).toEqual({ cle: "p1|s|v", projectId: "p1", stamp: "a", donnees: "{\"commandes\":[1,2,3]}", majA: "2026-05-01T00:00:00.000Z" });
  });

  it("MIG-COEX-04 [+] montée v6 → v7 : les lots de l'Atelier sans propriétaire passent en quarantaine ; la quarantaine se consulte et s'exporte", async () => {
    const { localStore } = await import("./local-store");
    lignes("lots").set("p2|r1", { id: "p2|r1", projectId: "p2", requestId: "r1", enveloppe: "{\"commands\":[]}", label: "Mur", etat: "local", detail: null, creeA: "2026-06-01T00:00:00.000Z", ordre: 1 });
    await disque.montees.get(7)!(tx);
    expect(lignes("lots").size).toBe(0);
    const liste = await localStore.quarantaineLister();
    expect(liste.map((e) => e.id).sort()).toEqual(["lots|7|p2|r1", "studioBrouillons|6|p1|s|v", "studioContextes|6|p1|s|v"]);
    const fichier = JSON.parse(await localStore.quarantaineExporter()) as { format: string; entrees: { id: string; table: string; ligne: Ligne }[] };
    expect(fichier.format).toBe("fadi-quarantaine-locale/1");
    expect(fichier.entrees.find((e) => e.id === "lots|7|p2|r1")!.ligne).toMatchObject({ requestId: "r1", label: "Mur", enveloppe: "{\"commands\":[]}" });
    // Rejouée (montée interrompue puis reprise) : aucune ligne doublée, aucune perdue.
    lignes("lots").set("p2|r1", { id: "p2|r1", projectId: "p2" });
    await disque.montees.get(7)!(tx);
    expect([...lignes("quarantaine").keys()].filter((k) => k.startsWith("lots|"))).toEqual(["lots|7|p2|r1"]);
  });

  it("MIG-COEX-04 [−] aucune montée de version ne vide plus une table de données sans passer par la quarantaine, qui n'est jamais vidée", async () => {
    const { mettreEnQuarantaine } = await import("./local-store");
    disque.tables.clear();
    // Sans table de quarantaine disponible, rien n'est vidé (l'écriture échoue avant le vidage).
    const txSansQuarantaine = { table: (nom: string) => (nom === "quarantaine" ? { ...tableMemoire(nom), bulkPut: async () => { throw new Error("quota"); } } : tableMemoire(nom)) };
    lignes("lots").set("p3|r1", { id: "p3|r1" });
    await expect(mettreEnQuarantaine(txSansQuarantaine, "lots", 7)).rejects.toThrow("quota");
    expect(lignes("lots").size).toBe(1);
    expect(disque.schemas.get(9)?.["quarantaine"]).toBe("id, table, misEnQuarantaineA");
    for (const v of [6, 7, 8, 9]) expect(disque.schemas.get(v)?.["quarantaine"], `v${v}`).toBe("id, table, misEnQuarantaineA");
  });
});
