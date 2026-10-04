/**
 * Persistance locale (IndexedDB via Dexie — docs/architecture.md, « Sync and
 * offline, designed from the start ») :
 *
 * - `lots` : chaque lot de commandes de l'Atelier est d'abord enregistré ici,
 *   avec la révision sur laquelle il s'appuie, puis envoyé au serveur dans
 *   l'ordre ; il n'en sort qu'une fois validé (ou abandonné explicitement
 *   après un conflit). Une coupure réseau ou un rechargement ne le perd pas.
 * - `modelCache` : le dernier modèle typé lu sur le serveur (instantané et
 *   révision), pour ouvrir l'Atelier sans réseau (lecture et dessin,
 *   synchronisation différée).
 * - `keyValue` : le cache des requêtes déshydraté (`query-persister`).
 *
 * IndexedDB peut être indisponible (navigation privée, quota) : chaque
 * opération échoue alors silencieusement et l'application continue en
 * mémoire, comme avant.
 */
import Dexie, { type EntityTable } from "dexie";

/** Un cache clé / valeur générique : le cache des requêtes TanStack Query déshydraté (`query-persister`). */
export interface KeyValueEntry {
  key: string;
  value: string;
  updatedAt: string;
}

/** Dernier modèle typé lu sur le serveur pour un projet (JSON sérialisé). */
export interface ModelCacheEntry {
  projectId: string;
  modele: string;
  revision: number;
  nativeId: string;
  fetchedAt: string;
}

/** Lot de commandes de l'Atelier typé en attente d'envoi (cahier des charges §5.7) : une entrée par `requestId`. */
export interface LotEntry {
  /** `${projectId}|${requestId}` */
  id: string;
  projectId: string;
  requestId: string;
  /** Enveloppe sérialisée (`atelier-commands/1`). */
  enveloppe: string;
  label: string;
  etat: "local" | "synchronisation" | "synchronise" | "conflit" | "refuse";
  detail: string | null;
  creeA: string;
  ordre: number;
}

class FadiLocalDb extends Dexie {
  modelCache!: EntityTable<ModelCacheEntry, "projectId">;
  keyValue!: EntityTable<KeyValueEntry, "key">;
  lots!: EntityTable<LotEntry, "id">;

  constructor() {
    super("fadi-local");
    this.version(1).stores({ outbox: "id, projectId", modelCache: "projectId" });
    this.version(2).stores({ outbox: "id, projectId", modelCache: "projectId", keyValue: "key" });
    this.version(3).stores({ outbox: "id, projectId", modelCache: "projectId", keyValue: "key", lots: "id, projectId, ordre" });
    // Lot 4 (bascule) : la file clé / valeur de l'ancien moteur disparaît ; le cache de modèle change de forme (vidé).
    this.version(4)
      .stores({ outbox: null, modelCache: "projectId", keyValue: "key", lots: "id, projectId, ordre" })
      .upgrade((tx) => tx.table("modelCache").clear());
  }
}

let db: FadiLocalDb | null = null;
function open(): FadiLocalDb | null {
  if (db) return db;
  try {
    if (typeof indexedDB === "undefined") return null;
    db = new FadiLocalDb();
    return db;
  } catch {
    return null;
  }
}

async function safe<T>(fn: (d: FadiLocalDb) => Promise<T>, fallback: T): Promise<T> {
  const d = open();
  if (!d) return fallback;
  try {
    return await fn(d);
  } catch {
    return fallback;
  }
}

export const localStore = {
  /** Clé / valeur (cache des requêtes) : `null` quand absent ou indisponible. */
  getValue: (key: string) => safe((d) => d.keyValue.get(key).then((v) => v?.value ?? null), null as string | null),
  setValue: (key: string, value: string) => safe((d) => d.keyValue.put({ key, value, updatedAt: new Date().toISOString() }).then(() => undefined), undefined),
  removeValue: (key: string) => safe((d) => d.keyValue.delete(key), undefined),
  /** Modèle typé mis en cache (ouverture de l'Atelier sans réseau). */
  cacheModel: (entry: ModelCacheEntry) => safe((d) => d.modelCache.put(entry).then(() => undefined), undefined),
  readModelCache: (projectId: string) => safe((d) => d.modelCache.get(projectId).then((v) => v ?? null), null as ModelCacheEntry | null),
  /** Page Paramètres : ce que ce navigateur conserve (lots de l'Atelier en attente, tous projets ; modèles mis en cache). */
  summary: () =>
    safe(
      async (d) => {
        const lots = await d.lots.toArray();
        const pendingByProject: Record<string, number> = {};
        for (const e of lots) pendingByProject[e.projectId] = (pendingByProject[e.projectId] ?? 0) + 1;
        return { available: true, pendingWrites: lots.length, pendingByProject, cachedModels: await d.modelCache.count() };
      },
      { available: false, pendingWrites: 0, pendingByProject: {} as Record<string, number>, cachedModels: 0 },
    ),
  /** « Vider les caches locaux » : les modèles mis en cache ; les lots en attente ne sont jamais supprimés (ils repartent au retour du réseau). */
  clearModelCache: () => safe((d) => d.modelCache.clear(), undefined),
  // --- Lots de commandes de l'Atelier typé ---
  lots: (projectId: string) => safe((d) => d.lots.where("projectId").equals(projectId).sortBy("ordre"), [] as LotEntry[]),
  putLot: (entry: LotEntry) => safe((d) => d.lots.put(entry).then(() => undefined), undefined),
  removeLot: (projectId: string, requestId: string) => safe((d) => d.lots.delete(`${projectId}|${requestId}`), undefined),
  lotsCount: (projectId: string) => safe((d) => d.lots.where("projectId").equals(projectId).count(), 0),
};
