/**
 * Persistance locale (IndexedDB via Dexie — docs/architecture.md, « Sync and
 * offline, designed from the start ») :
 *
 * - `outbox` : chaque écriture du moteur de l'Atelier est d'abord enregistrée
 *   ici, avec la révision sur laquelle elle s'appuie, puis envoyée au serveur ;
 *   elle n'en sort qu'une fois acceptée (ou résolue en conflit). Une coupure
 *   réseau ou un rechargement de la page ne la perd pas : elle est rejouée à
 *   la prochaine ouverture du projet ou au retour du réseau.
 * - `modelCache` : le dernier magasin du modèle lu sur le serveur, pour
 *   ouvrir l'Atelier sans réseau (lecture et dessin, synchronisation
 *   différée).
 *
 * IndexedDB peut être indisponible (navigation privée, quota) : chaque
 * opération échoue alors silencieusement et l'application continue en
 * mémoire, comme avant.
 */
import Dexie, { type EntityTable } from "dexie";

export interface OutboxEntry {
  /** `${projectId}|${key}` */
  id: string;
  projectId: string;
  key: string;
  /** Valeur telle que le moteur l'a écrite ; `null` = suppression. */
  value: string | null;
  /** Révision lue au moment de la première modification locale (contrôle de conflit côté serveur). */
  expectedRevision: number | null;
  updatedAt: string;
  attempts: number;
  lastError: string | null;
}

/** Un cache clé / valeur générique : le cache des requêtes TanStack Query déshydraté (`query-persister`). */
export interface KeyValueEntry {
  key: string;
  value: string;
  updatedAt: string;
}

export interface ModelCacheEntry {
  projectId: string;
  entries: Record<string, unknown>;
  revisions: Record<string, number>;
  modelRevision: number;
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
  outbox!: EntityTable<OutboxEntry, "id">;
  modelCache!: EntityTable<ModelCacheEntry, "projectId">;
  keyValue!: EntityTable<KeyValueEntry, "key">;
  lots!: EntityTable<LotEntry, "id">;

  constructor() {
    super("fadi-local");
    this.version(1).stores({ outbox: "id, projectId", modelCache: "projectId" });
    this.version(2).stores({ outbox: "id, projectId", modelCache: "projectId", keyValue: "key" });
    this.version(3).stores({ outbox: "id, projectId", modelCache: "projectId", keyValue: "key", lots: "id, projectId, ordre" });
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

export const outboxId = (projectId: string, key: string) => `${projectId}|${key}`;

export const localStore = {
  /** Enregistre (ou met à jour) une écriture en attente ; la révision attendue de la première modification est conservée. */
  queue: (projectId: string, key: string, value: string | null, expectedRevision: number | null) =>
    safe(async (d) => {
      const id = outboxId(projectId, key);
      const existing = await d.outbox.get(id);
      await d.outbox.put({
        id,
        projectId,
        key,
        value,
        expectedRevision: existing ? existing.expectedRevision : expectedRevision,
        updatedAt: new Date().toISOString(),
        attempts: existing?.attempts ?? 0,
        lastError: existing?.lastError ?? null,
      });
    }, undefined),
  acknowledge: (projectId: string, key: string) => safe((d) => d.outbox.delete(outboxId(projectId, key)), undefined),
  failed: (projectId: string, key: string, error: string) =>
    safe(async (d) => {
      const id = outboxId(projectId, key);
      const existing = await d.outbox.get(id);
      if (existing) await d.outbox.put({ ...existing, attempts: existing.attempts + 1, lastError: error });
    }, undefined),
  pending: (projectId: string) => safe((d) => d.outbox.where("projectId").equals(projectId).toArray(), [] as OutboxEntry[]),
  pendingCount: (projectId: string) => safe((d) => d.outbox.where("projectId").equals(projectId).count(), 0),
  cacheModel: (entry: ModelCacheEntry) => safe((d) => d.modelCache.put(entry).then(() => undefined), undefined),
  /** Clé / valeur (cache des requêtes) : `null` quand absent ou indisponible. */
  getValue: (key: string) => safe((d) => d.keyValue.get(key).then((v) => v?.value ?? null), null as string | null),
  setValue: (key: string, value: string) => safe((d) => d.keyValue.put({ key, value, updatedAt: new Date().toISOString() }).then(() => undefined), undefined),
  removeValue: (key: string) => safe((d) => d.keyValue.delete(key), undefined),
  readModelCache: (projectId: string) => safe((d) => d.modelCache.get(projectId).then((v) => v ?? null), null as ModelCacheEntry | null),
  /** Page Paramètres : ce que ce navigateur conserve (écritures de l'Atelier en attente, tous projets ; modèles mis en cache). */
  summary: () =>
    safe(
      async (d) => {
        const queued = await d.outbox.toArray();
        const pendingByProject: Record<string, number> = {};
        for (const e of queued) pendingByProject[e.projectId] = (pendingByProject[e.projectId] ?? 0) + 1;
        return { available: true, pendingWrites: queued.length, pendingByProject, cachedModels: await d.modelCache.count() };
      },
      { available: false, pendingWrites: 0, pendingByProject: {} as Record<string, number>, cachedModels: 0 },
    ),
  /** « Vider les caches locaux » : les modèles mis en cache ; la file des écritures en attente n'est jamais supprimée (elle repart au retour du réseau). Le cache des requêtes se vide par le client de requêtes, qui le réécrit. */
  clearModelCache: () => safe((d) => d.modelCache.clear(), undefined),
  // --- Lots de commandes de l'Atelier typé ---
  lots: (projectId: string) => safe((d) => d.lots.where("projectId").equals(projectId).sortBy("ordre"), [] as LotEntry[]),
  putLot: (entry: LotEntry) => safe((d) => d.lots.put(entry).then(() => undefined), undefined),
  removeLot: (projectId: string, requestId: string) => safe((d) => d.lots.delete(`${projectId}|${requestId}`), undefined),
  lotsCount: (projectId: string) => safe((d) => d.lots.where("projectId").equals(projectId).count(), 0),
  lotsSummary: () =>
    safe(
      async (d) => {
        const all = await d.lots.toArray();
        const parProjet: Record<string, number> = {};
        for (const l of all) parProjet[l.projectId] = (parProjet[l.projectId] ?? 0) + 1;
        return { total: all.length, parProjet };
      },
      { total: 0, parProjet: {} as Record<string, number> },
    ),
};
