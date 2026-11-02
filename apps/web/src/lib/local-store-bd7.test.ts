/**
 * BD-7 (chantier base-donnees) : quarantaine laissée intacte (BD-7.1 non livré, MIG-COEX-04), persistance
 * demandée pour la file de l'Atelier et les photos COM (BD-7.2, A3), cycle de vie de la connexion IndexedDB et échecs de
 * lecture signalés (BD-7.7, A8). Dexie simulée en mémoire.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const disque = vi.hoisted(() => ({
  quarantaine: new Map<string, { id: string; misEnQuarantaineA: string }>(),
  lots: new Map<string, unknown>(),
  keyValue: new Map<string, unknown>(),
  failGet: false,
  gestionnaires: new Map<string, () => unknown>(),
  fermee: 0,
}));
const persist = vi.hoisted(() => vi.fn(async () => true));
vi.mock("./persistance-stockage", () => ({ demanderPersistanceStockage: persist }));
vi.mock("dexie", () => ({
  default: class {
    version() {
      return { stores: () => {
        Object.assign(this, {
          quarantaine: {
            where: () => ({ below: (limite: string) => ({ primaryKeys: async () => [...disque.quarantaine.values()].filter((e) => e.misEnQuarantaineA < limite).map((e) => e.id) }) }),
            bulkDelete: async (cles: string[]) => { for (const c of cles) disque.quarantaine.delete(c); },
            clear: async () => { disque.quarantaine.clear(); },
            toArray: async () => [...disque.quarantaine.values()],
          },
          lots: { put: async (e: { id: string }) => { disque.lots.set(e.id, e); } },
          keyValue: { get: async (k: string) => { if (disque.failGet) throw new DOMException("x", "InvalidStateError"); return disque.keyValue.get(k); } },
          comPhotos: { put: async () => undefined },
          on: (evt: string, f: () => unknown) => { disque.gestionnaires.set(evt, f); },
          close: () => { disque.fermee++; },
        });
        return { upgrade: () => ({}) };
      } };
    }
  },
}));

const avant = globalThis.indexedDB;
const maintenant = Date.now();
const iso = (joursAvant: number) => new Date(maintenant - joursAvant * 86_400_000).toISOString();
beforeAll(() => {
  (globalThis as { indexedDB?: unknown }).indexedDB = {};
  disque.quarantaine.set("ancienne", { id: "ancienne", misEnQuarantaineA: iso(31) });
  disque.quarantaine.set("recente", { id: "recente", misEnQuarantaineA: iso(2) });
});
afterAll(() => { (globalThis as { indexedDB?: unknown }).indexedDB = avant; });
afterEach(() => { vi.restoreAllMocks(); disque.failGet = false; });

// BD-7.1 (vider ou borner la quarantaine) n'est pas livré : il contredit MIG-COEX-04 (ADR-STUDIO-PILOTE-01, « ne jamais
// supprimer ») ; décision D-BD-12 du maître d'ouvrage attendue. Ce test vérifie que l'ouverture ne touche pas à la
// quarantaine.
describe("BD-7.1 — quarantaine intacte (MIG-COEX-04)", () => {
  it("l'ouverture de la base ne retire aucune ligne de la quarantaine, même ancienne", async () => {
    const { localStore } = await import("./local-store");
    await localStore.quarantaineLister();
    expect([...disque.quarantaine.keys()].sort()).toEqual(["ancienne", "recente"]);
  });
});

describe("BD-7.2 — persistance demandée pour les files en attente", () => {
  it("un lot de l'Atelier et une photo COM écrits demandent la persistance", async () => {
    const { localStore } = await import("./local-store");
    persist.mockClear();
    await localStore.putLot({ id: "p|r", projectId: "p", requestId: "r", enveloppe: "{\"requestId\":\"r\"}", label: "l", etat: "local", detail: null, creeA: iso(0), ordre: 0 });
    expect(persist).toHaveBeenCalledTimes(1);
    await localStore.comPhotoEcrire({ id: "ph", userId: "u", projectId: "p", conversationId: "c", blob: new Blob(), mime: "image/jpeg", width: 1, height: 1, createdAt: iso(0) });
    expect(persist).toHaveBeenCalledTimes(2);
  });
});

describe("BD-7.7 — cycle de vie Dexie et échecs signalés", () => {
  it("une lecture en échec rend toujours la valeur par défaut, mais est signalée sans contenu", async () => {
    const { localStore } = await import("./local-store");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    disque.failGet = true;
    expect(await localStore.getValue("secret-de-projet")).toBeNull();
    expect(warn).toHaveBeenCalledWith("[fadi-local] lecture ou écriture locale en échec", { operation: "getValue", erreur: "InvalidStateError" });
    expect(JSON.stringify(warn.mock.calls)).not.toContain("secret-de-projet");
  });
  it("versionchange ferme et oublie la connexion (rouverte ensuite) ; blocked est annoncé", async () => {
    const { localStore } = await import("./local-store");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await localStore.getValue("x");
    expect(disque.gestionnaires.has("versionchange")).toBe(true);
    expect(disque.gestionnaires.has("blocked")).toBe(true);
    const fermeesAvant = disque.fermee;
    expect(disque.gestionnaires.get("versionchange")!()).toBe(false);
    expect(disque.fermee).toBe(fermeesAvant + 1);
    expect(warn).toHaveBeenCalledWith("[fadi-local] connexion IndexedDB", { etat: "fermee-version" });
    // Connexion oubliée : la prochaine opération en ouvre une nouvelle (gestionnaires réinstallés).
    disque.gestionnaires.clear();
    await localStore.getValue("x");
    expect(disque.gestionnaires.has("versionchange")).toBe(true);
    disque.gestionnaires.get("blocked")!();
    expect(warn).toHaveBeenCalledWith("[fadi-local] connexion IndexedDB", { etat: "bloquee" });
  });
});
