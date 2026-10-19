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
 * - `studioBrouillons` (Studio, versions 5–6) : par utilisateur et par variante, le brouillon hors ligne (révision de base, pas de commandes
 *   non enregistrés) et les enveloppes non confirmées avec leurs `requestId` et `baseRevisionId`, rejouées telles
 *   quelles au retour du réseau (`modules/studio/hors-ligne/`). Rien ne l'efface hormis un enregistrement confirmé
 *   ou un abandon explicite ; une mise à jour du service worker ne touche jamais IndexedDB.
 * - `studioContextes` (Studio, versions 5–6) : la dernière version lue de chaque variante, par utilisateur, pour
 *   rouvrir la planche sans réseau.
 *   Les deux tables Studio sont vidées à la déconnexion et quand un autre utilisateur se connecte sur l'appareil
 *   (`auth-context`) ; chaque clé commence par l'identifiant de l'utilisateur. La version 6 ajoute ce propriétaire :
 *   les lignes de la version 5, sans propriétaire, ne peuvent être attribuées à personne et sont supprimées (elles ne
 *   sont jamais rejouées sous un autre compte).
 *
 * Les caches de lecture restent facultatifs. La file d'écriture, elle,
 * expose tout échec : le brouillon reste en mémoire et peut être enregistré
 * à nouveau, sans annoncer une sauvegarde durable avant la réponse d'IndexedDB.
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

/** Studio : brouillon hors ligne d'une variante (JSON validé par `modules/studio/hors-ligne/persistance.ts`). */
export interface StudioBrouillonEntry {
  /** `${userId}|${projectId}|${studyId}|${variantId}` */
  cle: string;
  /** Propriétaire : seul cet utilisateur relit ou rejoue ce brouillon. */
  userId: string;
  projectId: string;
  /** Jeton d'écriture (comparer-puis-écrire) : un autre onglet qui écrit le change. */
  stamp: string;
  donnees: string;
  majA: string;
}

/** Studio : dernière version lue d'une variante (contexte serveur sérialisé). */
export interface StudioContexteEntry {
  cle: string;
  userId: string;
  projectId: string;
  contexte: string;
  luA: string;
}

class FadiLocalDb extends Dexie {
  modelCache!: EntityTable<ModelCacheEntry, "projectId">;
  keyValue!: EntityTable<KeyValueEntry, "key">;
  lots!: EntityTable<LotEntry, "id">;
  studioBrouillons!: EntityTable<StudioBrouillonEntry, "cle">;
  studioContextes!: EntityTable<StudioContexteEntry, "cle">;

  constructor() {
    super("fadi-local");
    this.version(1).stores({ outbox: "id, projectId", modelCache: "projectId" });
    this.version(2).stores({ outbox: "id, projectId", modelCache: "projectId", keyValue: "key" });
    this.version(3).stores({ outbox: "id, projectId", modelCache: "projectId", keyValue: "key", lots: "id, projectId, ordre" });
    // Lot 4 (bascule) : la file clé / valeur de l'ancien moteur disparaît ; le cache de modèle change de forme (vidé).
    this.version(4)
      .stores({ outbox: null, modelCache: "projectId", keyValue: "key", lots: "id, projectId, ordre" })
      .upgrade((tx) => tx.table("modelCache").clear());
    // Studio hors ligne : deux tables ajoutées, aucune table existante modifiée (les lots de l'Atelier sont intacts).
    this.version(5).stores({ modelCache: "projectId", keyValue: "key", lots: "id, projectId, ordre", studioBrouillons: "cle, projectId", studioContextes: "cle, projectId" });
    // Studio : propriétaire dans chaque clé ; les lignes v5 sans propriétaire ne sont attribuables à personne (supprimées).
    this.version(6)
      .stores({ modelCache: "projectId", keyValue: "key", lots: "id, projectId, ordre", studioBrouillons: "cle, userId, projectId", studioContextes: "cle, userId, projectId" })
      .upgrade(async (tx) => { await tx.table("studioBrouillons").clear(); await tx.table("studioContextes").clear(); });
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

export class LocalPersistenceError extends Error {
  constructor(message = "Le stockage local est indisponible. La conservation sur cet appareil n’est pas confirmée.", options?: ErrorOptions) {
    super(message, options);
    this.name = "LocalPersistenceError";
  }
}

async function checked<T>(fn: (d: FadiLocalDb) => Promise<T>): Promise<T> {
  const d = open();
  if (!d) throw new LocalPersistenceError();
  try { return await fn(d); }
  catch (cause) { throw new LocalPersistenceError(undefined, { cause }); }
}

export interface QueuePersistenceState {
  read: "unknown" | "ready" | "error";
  error: string | null;
  /** Écritures ou retraits pas encore confirmés par IndexedDB. */
  unsaved: number;
  saving: number;
}
const EMPTY_QUEUE_STATE: QueuePersistenceState = { read: "unknown", error: null, unsaved: 0, saving: 0 };
const queueStates = new Map<string, QueuePersistenceState>();
const queueMemory = new Map<string, Map<string, LotEntry>>();
const dirtyLots = new Map<string, LotEntry>();
const removedLots = new Map<string, { projectId: string; requestId: string }>();
const queueListeners = new Set<() => void>();

function queueMemoryFor(projectId: string): Map<string, LotEntry> {
  let memory = queueMemory.get(projectId);
  if (!memory) { memory = new Map(); queueMemory.set(projectId, memory); }
  return memory;
}
function queueChanged(projectId: string, patch: Partial<QueuePersistenceState> = {}) {
  const previous = queueStates.get(projectId) ?? EMPTY_QUEUE_STATE;
  const unsaved = [...dirtyLots.values(), ...removedLots.values()].filter((entry) => entry.projectId === projectId).length;
  queueStates.set(projectId, { ...previous, ...patch, unsaved });
  for (const listener of queueListeners) listener();
}
export const queuePersistenceStore = {
  get: (projectId: string): QueuePersistenceState => queueStates.get(projectId) ?? EMPTY_QUEUE_STATE,
  subscribe(listener: () => void): () => void { queueListeners.add(listener); return () => queueListeners.delete(listener); },
};

async function readLots(projectId: string): Promise<LotEntry[]> {
  try {
    const rows = await checked((d) => d.lots.where("projectId").equals(projectId).sortBy("ordre"));
    for (const row of rows) {
      const envelope = JSON.parse(row.enveloppe) as { requestId?: unknown };
      if (row.projectId !== projectId || envelope.requestId !== row.requestId || !["local", "synchronisation", "synchronise", "conflit", "refuse"].includes(row.etat)) throw new LocalPersistenceError("La file locale de ce dossier ne peut pas être lue. Aucun nombre de modifications n’est confirmé.");
      if (row.detail) JSON.parse(row.detail);
    }
    const memory = new Map(rows.map((entry) => [entry.id, entry]));
    for (const entry of dirtyLots.values()) if (entry.projectId === projectId) memory.set(entry.id, entry);
    for (const [id, entry] of removedLots) if (entry.projectId === projectId) memory.delete(id);
    queueMemory.set(projectId, memory);
    queueChanged(projectId, { read: "ready", ...(queuePersistenceStore.get(projectId).unsaved === 0 ? { error: null } : {}) });
    return [...memory.values()].sort((a, b) => a.ordre - b.ordre);
  } catch (cause) {
    const error = cause instanceof LocalPersistenceError ? cause : new LocalPersistenceError("La file locale de ce dossier ne peut pas être lue. Aucun nombre de modifications n’est confirmé.", { cause });
    queueChanged(projectId, { read: "error", error: error.message });
    throw error;
  }
}

async function putLot(entry: LotEntry): Promise<void> {
  queueMemoryFor(entry.projectId).set(entry.id, entry);
  dirtyLots.set(entry.id, entry);removedLots.delete(entry.id);
  queueChanged(entry.projectId, { saving: queuePersistenceStore.get(entry.projectId).saving + 1 });
  try {
    await checked((d) => d.lots.put(entry).then(() => undefined));
    if (dirtyLots.get(entry.id) === entry) dirtyLots.delete(entry.id);
    queueChanged(entry.projectId);
    if (queuePersistenceStore.get(entry.projectId).unsaved === 0 && queuePersistenceStore.get(entry.projectId).read !== "error") queueChanged(entry.projectId, { error: null });
  } catch (error) {
    queueChanged(entry.projectId, { error: error instanceof Error ? error.message : "La sauvegarde locale n’est pas confirmée." });
    throw error;
  } finally { queueChanged(entry.projectId, { saving: Math.max(0, queuePersistenceStore.get(entry.projectId).saving - 1) }); }
}

async function removeLot(projectId: string, requestId: string): Promise<void> {
  const id = `${projectId}|${requestId}`, removal = { projectId, requestId };
  queueMemoryFor(projectId).delete(id);dirtyLots.delete(id);removedLots.set(id, removal);
  queueChanged(projectId, { saving: queuePersistenceStore.get(projectId).saving + 1 });
  try {
    await checked((d) => d.lots.delete(id));
    if (removedLots.get(id) === removal) removedLots.delete(id);
    queueChanged(projectId);
    if (queuePersistenceStore.get(projectId).unsaved === 0 && queuePersistenceStore.get(projectId).read !== "error") queueChanged(projectId, { error: null });
  } catch (error) {
    queueChanged(projectId, { error: error instanceof Error ? error.message : "Le retrait de la file locale n’est pas confirmé." });
    throw error;
  } finally { queueChanged(projectId, { saving: Math.max(0, queuePersistenceStore.get(projectId).saving - 1) }); }
}

async function retryLots(projectId: string): Promise<LotEntry[]> {
  // Les mêmes identifiants sont réécrits : aucun nouveau lot métier n'est créé.
  for (const entry of [...dirtyLots.values()]) if (entry.projectId === projectId) await putLot(entry);
  for (const entry of [...removedLots.values()]) if (entry.projectId === projectId) await removeLot(projectId, entry.requestId);
  return readLots(projectId);
}

export const localStore = {
  /** Clé / valeur (cache des requêtes) : `null` quand absent ou indisponible. */
  getValue: (key: string) => safe((d) => d.keyValue.get(key).then((v) => v?.value ?? null), null as string | null),
  setValue: (key: string, value: string) => safe((d) => d.keyValue.put({ key, value, updatedAt: new Date().toISOString() }).then(() => undefined), undefined),
  /** Pour les écritures rejouables : l'appelant doit exposer un échec. */
  setValueChecked: (key: string, value: string) => checked((d) => d.keyValue.put({ key, value, updatedAt: new Date().toISOString() }).then(() => undefined)),
  removeValue: (key: string) => safe((d) => d.keyValue.delete(key), undefined),
  /** Modèle typé mis en cache (ouverture de l'Atelier sans réseau). */
  cacheModel: (entry: ModelCacheEntry) => safe((d) => d.modelCache.put(entry).then(() => undefined), undefined),
  readModelCache: (projectId: string) => safe((d) => d.modelCache.get(projectId).then((v) => v ?? null), null as ModelCacheEntry | null),
  /** Page Paramètres : ce que ce navigateur conserve (lots de l'Atelier en attente, tous projets ; modèles mis en cache). */
  summary: async () => {
    const stored = await safe(
      async (d) => {
        const lots = await d.lots.toArray();
        const pendingByProject: Record<string, number> = {};
        for (const e of lots) pendingByProject[e.projectId] = (pendingByProject[e.projectId] ?? 0) + 1;
        return { available: true, pendingWrites: lots.length, pendingByProject, cachedModels: await d.modelCache.count() };
      },
      { available: false, pendingWrites: 0, pendingByProject: {} as Record<string, number>, cachedModels: 0 },
    );
    // Un comptage réussi du disque ne certifie pas les brouillons encore seulement en mémoire.
    const unconfirmed = [...queueStates.entries()].filter(([, state]) => state.read === "error" || !!state.error || state.unsaved > 0);
    return { ...stored, unconfirmedProjects: unconfirmed.map(([projectId]) => projectId), unsavedWrites: unconfirmed.reduce((total, [, state]) => total + state.unsaved, 0) };
  },
  /** « Vider les caches locaux » : les modèles mis en cache ; les lots en attente ne sont jamais supprimés (ils repartent au retour du réseau). */
  clearModelCache: () => safe((d) => d.modelCache.clear(), undefined),
  // --- Lots de commandes de l'Atelier typé ---
  lots: readLots,
  putLot,
  removeLot,
  retryLots,
  memoryLots: (projectId: string): LotEntry[] => [...queueMemoryFor(projectId).values()].sort((a, b) => a.ordre - b.ordre),
  // --- Studio hors ligne (brouillons et dernières versions lues, par variante) ---
  /** `null` quand absent ; une lecture impossible lève `LocalPersistenceError` (rien n'est supposé perdu). */
  studioBrouillon: (cle: string, userId: string) => checked((d) => d.studioBrouillons.get(cle).then((v) => (v && v.userId === userId ? v : null))),
  /**
   * Comparer-puis-écrire : écrit seulement si le jeton présent est `attendu` (ou si la ligne a disparu). Rend faux
   * quand un autre onglet a écrit depuis la dernière lecture : rien n'est écrasé.
   */
  studioEcrireBrouillonSi: (entry: StudioBrouillonEntry, attendu: string | null) => checked((d) => d.transaction("rw", d.studioBrouillons, async () => {
    const present = await d.studioBrouillons.get(entry.cle);
    if (present && present.stamp !== attendu) return false;
    await d.studioBrouillons.put(entry);
    return true;
  })),
  /** Retrait comparé : rend faux (et ne retire rien) si un autre onglet a écrit depuis. */
  studioSupprimerBrouillonSi: (cle: string, attendu: string | null) => checked((d) => d.transaction("rw", d.studioBrouillons, async () => {
    const present = await d.studioBrouillons.get(cle);
    if (present && present.stamp !== attendu) return false;
    if (present) await d.studioBrouillons.delete(cle);
    return true;
  })),
  /** Abandon explicite (après confirmation de l'utilisateur), quel que soit l'onglet qui a écrit. */
  studioSupprimerBrouillon: (cle: string) => checked((d) => d.studioBrouillons.delete(cle)),
  studioContexte: (cle: string, userId: string) => safe((d) => d.studioContextes.get(cle).then((v) => (v && v.userId === userId ? v : null)), null as StudioContexteEntry | null),
  studioMemoriserContexte: (entry: StudioContexteEntry) => safe((d) => d.studioContextes.put(entry).then(() => undefined), undefined),
  /** Déconnexion ou changement d'utilisateur : brouillons et versions lues de Studio oubliés sur cet appareil. */
  studioOublierTout: () => checked((d) => d.transaction("rw", d.studioBrouillons, d.studioContextes, async () => { await d.studioBrouillons.clear(); await d.studioContextes.clear(); })),
  lotsCount: async (projectId: string): Promise<number | null> => { try { return (await readLots(projectId)).length; } catch { return null; } },
};
