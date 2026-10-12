import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appliquerLot, CONTRAT_COMMANDES, modeleVide, type Commande } from "@parcours/atelier-model";
import { ApiError, api, type AtelierEnveloppe } from "./api";
import { localStore, LocalPersistenceError, queuePersistenceStore, type KeyValueEntry, type LotEntry, type ModelCacheEntry } from "./local-store";
import { persistQueryCacheValue, queryPersistenceStore } from "./query-persister";
import { reachability } from "./reachability";
import { AtelierClient } from "../modules/atelier/bus/atelier-client";

const disk = vi.hoisted(() => ({ lots: new Map<string, LotEntry>(), models: new Map<string, ModelCacheEntry>(), values: new Map<string, KeyValueEntry>(), failRead: false, failPut: false, failDelete: false, failCache: false }));
vi.mock("dexie", () => ({
  default: class {
    version() {
      return { stores: () => {
        Object.assign(this, {
          lots: {
            put: async (entry: LotEntry) => { if (disk.failPut) throw new Error("quota");disk.lots.set(entry.id, { ...entry });return entry.id; },
            delete: async (id: string) => { if (disk.failDelete) throw new Error("delete failed");disk.lots.delete(id); },
            toArray: async () => [...disk.lots.values()],
            where: () => ({ equals: (projectId: string) => ({ sortBy: async () => { if (disk.failRead) throw new Error("read failed");return [...disk.lots.values()].filter((entry) => entry.projectId === projectId).sort((a, b) => a.ordre - b.ordre); } }) }),
          },
          modelCache: { put: async (entry: ModelCacheEntry) => { disk.models.set(entry.projectId, entry); }, get: async (id: string) => disk.models.get(id), count: async () => disk.models.size },
          keyValue: { put: async (entry: KeyValueEntry) => { if (disk.failCache) throw new Error("cache quota");disk.values.set(entry.key, entry); }, get: async (key: string) => disk.values.get(key), delete: async (key: string) => { disk.values.delete(key); } },
        });
        return { upgrade: () => undefined };
      } };
    }
  },
}));

let counter = 0;
const project = () => `p-test-${++counter}`;
const clients: AtelierClient[] = [];
const commands: Commande[] = [{ type: "niveau.creer", params: { id: "rdc", nom: "RDC", elevation: 0, hauteur: 3 } }];
const lot = (projectId: string, requestId = "request-1", etat: LotEntry["etat"] = "local"): LotEntry => ({ id: `${projectId}|${requestId}`, projectId, requestId, enveloppe: JSON.stringify({ requestId, baseRevision: 0, contract: CONTRAT_COMMANDES, label: "Créer RDC", commands }), label: "Créer RDC", etat, detail: etat === "conflit" ? JSON.stringify({ motif: "précondition", message: "Conflit original" }) : null, creeA: "2026-10-12T10:00:00Z", ordre: 0 });
async function client(projectId: string, readOnly = false): Promise<AtelierClient> {
  const c = new AtelierClient(projectId, { readOnly });clients.push(c);
  await c.demarrer();await c.envoyer();
  return c;
}

beforeEach(() => {
  vi.stubGlobal("indexedDB", {});vi.stubGlobal("navigator", { onLine: true });
  disk.lots.clear();disk.models.clear();disk.values.clear();disk.failRead = false;disk.failPut = false;disk.failDelete = false;disk.failCache = false;
  vi.spyOn(reachability, "get").mockReturnValue("reachable");
  vi.spyOn(reachability, "subscribe").mockReturnValue(() => undefined);
  vi.spyOn(api, "getAtelierModel").mockResolvedValue({ modele: modeleVide(), revision: 0, nativeId: "native-test" });
  vi.spyOn(api, "getAtelierJournal").mockResolvedValue({ revision: 0, entrees: [] });
  vi.spyOn(api, "postAtelierCommands").mockImplementation(async (_projectId: string, envelope: AtelierEnveloppe) => ({ revision: 1, journalId: "accepted", applique: [], effets: appliquerLot(modeleVide(), { ...envelope, commands }).effets, problemes: [], referencesAReparer: [] }));
});
afterEach(() => { for (const c of clients.splice(0)) c.arreter();vi.restoreAllMocks();vi.unstubAllGlobals(); });

describe("durabilité observable des lots locaux", () => {
  it("une lecture échouée est inconnue, pas une file vide", async () => {
    const id = project();disk.failRead = true;
    await expect(localStore.lots(id)).rejects.toBeInstanceOf(LocalPersistenceError);
    expect(await localStore.lotsCount(id)).toBeNull();
    expect(queuePersistenceStore.get(id)).toMatchObject({ read: "error" });
    disk.failRead = false;
    expect(await localStore.lotsCount(id)).toBe(0);
    expect(queuePersistenceStore.get(id)).toMatchObject({ read: "ready", error: null });
  });
  it("un contenu local corrompu n'est pas présenté comme une file complète", async () => {
    const id = project(), entry = lot(id);entry.enveloppe = "broken";disk.lots.set(entry.id, entry);
    await expect(localStore.lots(id)).rejects.toBeInstanceOf(LocalPersistenceError);
    expect(await localStore.lotsCount(id)).toBeNull();
  });
  it("une écriture échouée garde le même brouillon en mémoire et sa reprise conserve son requestId", async () => {
    const id = project(), entry = lot(id);await localStore.lots(id);disk.failPut = true;
    await expect(localStore.putLot(entry)).rejects.toBeInstanceOf(LocalPersistenceError);
    expect(localStore.memoryLots(id)).toEqual([entry]);
    expect(queuePersistenceStore.get(id)).toMatchObject({ unsaved: 1, saving: 0 });
    expect(queuePersistenceStore.get(id).error).not.toBeNull();
    disk.failPut = false;
    expect(await localStore.retryLots(id)).toEqual([entry]);
    expect([...disk.lots.keys()]).toEqual([entry.id]);
    expect(queuePersistenceStore.get(id)).toMatchObject({ read: "ready", unsaved: 0, error: null });
  });
  it("un échec dans un projet ne modifie pas les états d'un autre", async () => {
    const a = project(), b = project();await localStore.lots(a);await localStore.lots(b);disk.failPut = true;
    await expect(localStore.putLot(lot(a))).rejects.toThrow();
    expect(queuePersistenceStore.get(b)).toMatchObject({ read: "ready", error: null, unsaved: 0 });
    expect(localStore.memoryLots(b)).toEqual([]);
  });
  it("un retrait non confirmé ne ressuscite pas le lot en mémoire, puis réessaie le même retrait", async () => {
    const id = project(), entry = lot(id);await localStore.lots(id);await localStore.putLot(entry);disk.failDelete = true;
    await expect(localStore.removeLot(id, entry.requestId)).rejects.toThrow();
    expect(await localStore.lots(id)).toEqual([]);
    expect(queuePersistenceStore.get(id)).toMatchObject({ unsaved: 1 });
    expect(disk.lots.has(entry.id)).toBe(true);
    disk.failDelete = false;await localStore.retryLots(id);
    expect(disk.lots.has(entry.id)).toBe(false);
    expect(queuePersistenceStore.get(id)).toMatchObject({ unsaved: 0, error: null });
  });
  it("le résumé distingue zéro lot sur disque d'un brouillon non sauvegardé", async () => {
    const id = project();await localStore.lots(id);disk.failPut = true;
    await expect(localStore.putLot(lot(id))).rejects.toThrow();
    const summary = await localStore.summary();
    expect(summary.pendingByProject[id] ?? 0).toBe(0);
    expect(summary.unconfirmedProjects).toContain(id);
    expect(summary.unsavedWrites).toBeGreaterThan(0);
  });
});

describe("file Atelier et reprises explicites", () => {
  it("préserve l'aperçu en mémoire sans envoyer un lot dont l'enregistrement a échoué", async () => {
    const id = project(), c = await client(id);disk.failPut = true;
    const result = await c.executer(commands, "Créer RDC");await c.envoyer();
    expect(c.getSnapshot().etat.niveaux.rdc).toBeDefined();
    expect(c.getSnapshot().lots.map((item) => item.enveloppe.requestId)).toEqual([result.requestId]);
    expect(api.postAtelierCommands).not.toHaveBeenCalled();
    disk.failPut = false;await c.reessayerSauvegarde();await c.envoyer();
    expect(api.postAtelierCommands).toHaveBeenCalledTimes(1);
    expect(vi.mocked(api.postAtelierCommands).mock.calls[0]![1].requestId).toBe(result.requestId);
    expect(c.getSnapshot().lots).toEqual([]);
  });
  it("n'envoie pas une file encore illisible, même si le serveur est joignable", async () => {
    const id = project();disk.failRead = true;const c = await client(id);
    await c.executer(commands, "Créer RDC");await c.envoyer();
    expect(api.postAtelierCommands).not.toHaveBeenCalled();
    expect(queuePersistenceStore.get(id).read).toBe("error");
  });
  it("un reçu serveur reste accepté si le nettoyage local échoue, sans second envoi", async () => {
    const id = project(), c = await client(id);disk.failDelete = true;
    await c.executer(commands, "Créer RDC");await c.envoyer();
    expect(c.getSnapshot()).toMatchObject({ revisionServeur: 1, lots: [] });
    expect(queuePersistenceStore.get(id).error).not.toBeNull();
    disk.failDelete = false;await c.reessayerSauvegarde();await c.envoyer();
    expect(api.postAtelierCommands).toHaveBeenCalledTimes(1);
    expect(disk.lots.size).toBe(0);
  });
  it("la lecture seule et l'absence de connexion interdisent la reprise d'un conflit", async () => {
    const id = project(), entry = lot(id, "conflict-1", "conflit");disk.lots.set(entry.id, entry);const c = await client(id, true);
    await expect(c.decider(entry.requestId, "rejouer")).rejects.toThrow("écriture");
    c.setReadOnly(false);vi.mocked(reachability.get).mockReturnValue("unreachable");
    await expect(c.decider(entry.requestId, "rejouer")).rejects.toThrow("connexion");
    expect(c.getSnapshot().lots[0]!.etat).toBe("conflit");
    expect(api.postAtelierCommands).not.toHaveBeenCalled();
  });
  it("un brouillon non sauvegardé interdit la reprise directe, même hors de l'interface", async () => {
    const id = project(), entry = lot(id, "conflict-2", "conflit");disk.lots.set(entry.id, entry);const c = await client(id);
    disk.failPut = true;await expect(localStore.putLot(entry)).rejects.toThrow();
    await expect(c.decider(entry.requestId, "rejouer")).rejects.toThrow("sauvegarde");
    expect(c.getSnapshot().lots[0]!.etat).toBe("conflit");
    expect(api.postAtelierCommands).not.toHaveBeenCalled();
  });
  it("un échec de relecture conserve le conflit antérieur avant toute tentative d'écriture", async () => {
    const id = project(), entry = lot(id, "conflict-3", "conflit");disk.lots.set(entry.id, entry);const c = await client(id);
    const previous = c.getSnapshot().lots[0];vi.mocked(api.getAtelierModel).mockRejectedValueOnce(new TypeError("offline"));
    await expect(c.decider(entry.requestId, "rejouer")).rejects.toThrow("offline");
    expect(c.getSnapshot().lots[0]).toEqual(previous);
    expect(c.getSnapshot().envoiEnCours).toBe(false);
    expect(api.postAtelierCommands).not.toHaveBeenCalled();
  });
  it("un échec réseau après la décision restaure le conflit et retire l'application provisoire de l'aperçu", async () => {
    const id = project(), entry = lot(id, "conflict-4", "conflit");disk.lots.set(entry.id, entry);const c = await client(id);
    vi.mocked(api.postAtelierCommands).mockRejectedValueOnce(new TypeError("offline"));
    await c.decider(entry.requestId, "rejouer");
    expect(c.getSnapshot().lots[0]!.etat).toBe("conflit");
    expect(c.getSnapshot().lots[0]!.enveloppe.requestId).toBe(entry.requestId);
    expect(c.getSnapshot().etat.niveaux.rdc).toBeUndefined();
    await c.envoyer();
    expect(api.postAtelierCommands).toHaveBeenCalledTimes(1);
  });
  it("un nouveau refus métier conserve son explication actuelle au lieu d'effacer le conflit", async () => {
    const id = project(), entry = lot(id, "conflict-5", "conflit");disk.lots.set(entry.id, entry);const c = await client(id);
    vi.mocked(api.postAtelierCommands).mockRejectedValueOnce(new ApiError(409, "conflict", "Version nouvelle", { motif: "precondition", message: "Version nouvelle" }));
    await c.decider(entry.requestId, "rejouer");
    expect(c.getSnapshot().lots[0]).toMatchObject({ etat: "conflit", detail: { message: "Version nouvelle" } });
    expect(api.postAtelierCommands).toHaveBeenCalledTimes(1);
  });
});

describe("persistance des saisies en pause", () => {
  const cache = (projects: string[]) => JSON.stringify({ clientState: { mutations: projects.map((projectId) => ({ state: { variables: { projectId } } })) } });
  it("signale l'échec de stockage aux seuls projets concernés puis confirme une vraie reprise", async () => {
    await persistQueryCacheValue("test-cache", cache([]));
    const id = project();disk.failCache = true;
    await expect(persistQueryCacheValue("test-cache", cache([id]))).rejects.toThrow();
    expect(queryPersistenceStore.get().failedProjects).toEqual([id]);
    expect(queryPersistenceStore.get().error).not.toBeNull();
    disk.failCache = false;await persistQueryCacheValue("test-cache", cache([id]));
    expect(queryPersistenceStore.get()).toMatchObject({ failedProjects: [], error: null, saving: false });
    expect(disk.values.get("test-cache")!.value).toBe(cache([id]));
  });
  it("signale un nettoyage échoué après acceptation afin de ne pas annoncer un cache purgé", async () => {
    const id = project();await persistQueryCacheValue("test-cache", cache([id]));disk.failCache = true;
    await expect(persistQueryCacheValue("test-cache", cache([]))).rejects.toThrow();
    expect(queryPersistenceStore.get().failedProjects).toContain(id);
    expect(disk.values.get("test-cache")!.value).toBe(cache([id]));
    disk.failCache = false;await persistQueryCacheValue("test-cache", cache([]));
    expect(queryPersistenceStore.get().failedProjects).toEqual([]);
  });
});
