/**
 * Persistance locale de l'application (IndexedDB via Dexie — docs/architecture.md,
 * « Sync and offline, designed from the start ») : `keyValue`, le cache des
 * requêtes TanStack Query déshydraté (`query-persister`).
 *
 * La file des écritures et le modèle mis en cache de l'Atelier vivent dans la
 * base du nouvel Atelier (`fadi-atelier`, `modules/atelier/bus/stockage-dexie.ts`).
 * Les tables `outbox` et `modelCache` de l'ancien Atelier sont supprimées à la
 * version 3 (bascule, lot 4 — D-053).
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

class FadiLocalDb extends Dexie {
  keyValue!: EntityTable<KeyValueEntry, "key">;

  constructor() {
    super("fadi-local");
    this.version(1).stores({ outbox: "id, projectId", modelCache: "projectId" });
    this.version(2).stores({ outbox: "id, projectId", modelCache: "projectId", keyValue: "key" });
    this.version(3).stores({ outbox: null, modelCache: null, keyValue: "key" });
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
};
