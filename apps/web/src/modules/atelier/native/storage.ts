/**
 * Magasin du moteur de l'Atelier (`window.ParcoursSession.storage`) et son
 * état de synchronisation — la partie du moteur dont l'application a besoin
 * partout (indicateur de l'en-tête, bandeau des conflits), séparée du
 * chargement du moteur lui-même (`engine.ts`, chargé paresseusement avec
 * son markup et sa feuille de style à la première ouverture de l'Atelier).
 *
 * Chaque écriture du moteur est d'abord conservée dans la file locale
 * (IndexedDB, `lib/local-store.ts`) puis envoyée à l'API avec la révision
 * lue (détection de conflit) ; sans réseau, elle attend dans la file et est
 * rejouée au retour du réseau ou à la prochaine ouverture du projet — états
 * visibles : enregistré localement, synchronisation, enregistré sur le
 * serveur, conflit (copie de secours à départager), lecture seule.
 */
import { ApiError, api, type AtelierStore } from "../../../lib/api";
import { localStore } from "../../../lib/local-store";

export type SyncStatus = "idle" | "local" | "syncing" | "saved" | "conflict" | "error" | "offline" | "readonly";

export const READ_ONLY_MESSAGE = "Lecture seule : ce projet vous est partagé en lecture ; vous pouvez explorer le modèle, mais vos modifications dans l’Atelier ne sont pas enregistrées.";
/** Nom de la copie créée automatiquement (prototype : `copy('P.118 — copie de travail · Atelier', …)` ; Fadi affiche « code — nom », le code n'est pas répété). */
export const DRAWING_COPY_NAME = "copie de travail · Atelier";
export const PROTECTED_REFERENCE_MESSAGE = "Exemple protégé : première modification dans une copie automatique.";

export interface SyncState {
  status: SyncStatus;
  pending: number;
  message: string | null;
}

/** Un conflit du modèle en attente de décision : la version du serveur a repris la clé, la vôtre est conservée sous `backupKey`. */
export interface ModelConflict {
  key: string;
  backupKey: string;
  at: string;
  /** Révision du serveur qui a repris la main. */
  serverRevision: number;
}

const isOffline = () => typeof navigator !== "undefined" && navigator.onLine === false;
/** Une erreur réseau (fetch rejeté) ou une coupure déclarée : la file attend, rien n'est perdu. */
const isNetworkFailure = (err: unknown) => isOffline() || (err instanceof TypeError && !(err instanceof ApiError));

interface V14Bridge {
  openProject(id: string): void;
  projectId(): string;
  render(): void;
  store: Storage;
}

interface AtelierTools {
  cancel?(options?: { render?: boolean }): void;
  afterRender?(): void;
  setWorkspaceTab?(tab: string, keep?: boolean): void;
}

declare global {
  interface Window {
    ParcoursSession?: { storage: Storage; readJSON?: (key: string, fallback: unknown, valid?: (v: unknown) => boolean) => unknown; volatile?: boolean };
    V14Bridge?: V14Bridge;
    AtelierTools?: AtelierTools;
    initAtelierToolbar?: () => void;
    AtelierHost?: { stage: number | null; projectId: string | null };
    /** Couture du prototype (`P118Resolved`) que les outils de dessin extraits appellent avant de valider une modification. */
    P118Resolved?: { isRead: (p?: unknown) => boolean; ensureDrawingCopy: () => boolean };
  }
}

export interface BindOptions {
  /** Projet partagé en lecture : le moteur dessine en mémoire, rien n'est enregistré. */
  readOnly?: boolean;
  /** Référence protégée d'un exemple : la première modification validée crée une copie de travail et s'y enregistre. */
  protectedReference?: boolean;
  /** Appelé une fois la copie de travail créée et les écritures en attente transférées (l'écran bascule sur la copie). */
  onDrawingCopy?: (copy: { id: string; name: string }) => void;
}

/** Une valeur du magasin telle que le moteur l'a écrite : du JSON (domaines, registre) ou une chaîne brute (projet actif). */
function parseStored(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

const DEBOUNCE_MS = 350;

/**
 * Magasin clé/valeur présenté au moteur comme un `Storage`. Les valeurs
 * sont des chaînes (JSON sérialisé par le moteur) ; on les stocke telles
 * quelles et on les renvoie à l'API désérialisées. Une écriture est
 * considérée « enregistrée localement » immédiatement, « synchronisée »
 * quand l'API l'a acceptée avec la révision attendue.
 */
class AtelierStorageAdapter implements Storage {
  private values = new Map<string, string>();
  private revisions = new Map<string, number>();
  private projectId: string | null = null;
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private inflight = Promise.resolve();
  private pendingKeys = new Set<string>();
  private listeners = new Set<(s: SyncState) => void>();
  private state: SyncState = { status: "idle", pending: 0, message: null };
  /** Écritures dans la file locale, dans l'ordre : `persist` attend qu'elles soient posées avant de lire la file. */
  private queued = Promise.resolve();
  /** Projet partagé en lecture : le moteur dessine en mémoire, rien n'est mis en file ni envoyé (le serveur refuserait, 403). */
  private readOnly = false;
  /** Référence protégée : la prochaine modification validée du dessin passe par `ensureDrawingCopy`. */
  private protectedReference = false;
  /** Copie de travail en cours de création : les écritures attendent son identifiant avant d'être mises en file et envoyées. */
  private copying: Promise<string> | null = null;
  private onDrawingCopy: ((copy: { id: string; name: string }) => void) | null = null;
  /** Conflits du modèle en attente de décision (copie de secours conservée), par projet ouvert. */
  private conflicts: ModelConflict[] = [];
  private conflictListeners = new Set<(c: ModelConflict[]) => void>();

  async bind(projectId: string, store: AtelierStore, options: BindOptions = {}): Promise<void> {
    const readOnly = options.readOnly ?? false;
    this.flushTimers();
    this.projectId = projectId;
    this.readOnly = readOnly;
    this.protectedReference = !readOnly && (options.protectedReference ?? false);
    this.onDrawingCopy = options.onDrawingCopy ?? null;
    this.copying = null;
    this.setConflicts([]);
    // Le moteur écrit du JSON pour ses domaines mais une chaîne brute pour
    // `design.v13.activeProject` : on lui rend exactement ce qu'il a écrit.
    this.values = new Map(Object.entries(store.entries).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)]));
    this.revisions = new Map(Object.entries(store.revisions));
    this.pendingKeys.clear();
    if (readOnly) {
      this.setState({ status: "readonly", pending: 0, message: READ_ONLY_MESSAGE });
      return;
    }
    // Écritures restées dans la file locale (coupure réseau, page quittée) : elles reprennent la main en
    // mémoire et repartent vers le serveur avec la révision sur laquelle elles s'appuyaient.
    const queued = await localStore.pending(projectId);
    for (const q of queued) {
      if (q.value === null) this.values.delete(q.key);
      else this.values.set(q.key, q.value);
      this.pendingKeys.add(q.key);
    }
    this.setState(
      queued.length
        ? {
            status: isOffline() ? "offline" : "local",
            pending: queued.length,
            message: `${queued.length} modification(s) enregistrée(s) localement lors d'une session précédente : synchronisation en cours.`,
          }
        : { status: "idle", pending: 0, message: null },
    );
    for (const q of queued) this.inflight = this.inflight.then(() => this.persist(q.key)).catch(() => undefined);
    if (queued.length && !isOffline()) void this.inflight;
  }

  isReadOnly(): boolean {
    return this.readOnly;
  }

  /** `P118Resolved.isRead(p)` : le projet ouvert est la référence protégée (l'aide des outils l'annonce). */
  isProtectedReference(): boolean {
    return this.protectedReference;
  }

  /**
   * `ensureDrawingCopy()` du prototype, appelé par `fdCommit` avant de valider
   * une modification du dessin dans la référence protégée : la copie de
   * travail est demandée au serveur (`POST /projects/:id/copies`, mêmes clés
   * natives, révisions à 1) et, dès cet instant, les écritures du moteur lui
   * sont destinées — elles attendent son identifiant dans la file locale puis
   * repartent vers elle ; l'original n'est jamais écrit. Renvoie `true` quand
   * la copie est engagée (le moteur valide la modification), `false` sinon.
   */
  ensureDrawingCopy(): boolean {
    if (!this.projectId || this.readOnly || !this.protectedReference) return false;
    const source = this.projectId;
    this.protectedReference = false;
    this.setState({ status: "syncing", pending: this.pendingKeys.size, message: "Exemple protégé : création de la copie de travail…" });
    this.copying = api
      .copyProject(source, DRAWING_COPY_NAME)
      .then(async (created) => {
        // Les écritures déjà en file sous la référence passent à la copie, dont chaque clé existante est en révision 1.
        for (const q of await localStore.pending(source)) {
          await localStore.queue(created.id, q.key, q.value, q.expectedRevision === null ? null : 1);
          await localStore.acknowledge(source, q.key);
        }
        this.projectId = created.id;
        this.revisions = new Map([...this.revisions.keys()].map((k) => [k, 1]));
        this.copying = null;
        this.setState({ status: this.pendingKeys.size ? "local" : "saved", pending: this.pendingKeys.size, message: "Copie de travail créée automatiquement · exemple original conservé." });
        this.onDrawingCopy?.(created);
        return created.id;
      })
      .catch(async (err: unknown) => {
        // Sans copie, rien ne doit atteindre l'original : la modification reste affichée, retirée de la file, et l'Atelier passe en lecture seule.
        this.copying = null;
        this.readOnly = true;
        for (const q of await localStore.pending(source)) await localStore.acknowledge(source, q.key);
        this.pendingKeys.clear();
        this.flushTimers();
        this.setState({
          status: "error",
          pending: 0,
          message: `Copie de travail impossible : ${err instanceof ApiError && err.serverMessage ? err.serverMessage : err instanceof Error ? err.message : String(err)}. La modification reste affichée mais n’est pas enregistrée ; l’exemple original est intact.`,
        });
        throw err;
      });
    return true;
  }

  /** Les conflits du modèle en attente ; `fn` est appelé tout de suite puis à chaque changement. */
  subscribeConflicts(fn: (c: ModelConflict[]) => void): () => void {
    this.conflictListeners.add(fn);
    fn(this.conflicts);
    return () => this.conflictListeners.delete(fn);
  }

  private setConflicts(next: ModelConflict[]) {
    this.conflicts = next;
    for (const fn of this.conflictListeners) fn(next);
  }

  /**
   * Résolution d'un conflit du modèle : « serveur » garde la version du
   * serveur et retire la copie de secours ; « mienne » réécrit votre version
   * sur la clé (à partir de la révision courante du serveur, donc acceptée
   * sauf nouvelle écriture entre-temps) puis retire la copie. Dans les deux
   * cas rien n'est perdu sans décision explicite.
   */
  resolveConflict(backupKey: string, choice: "serveur" | "mienne"): void {
    const conflict = this.conflicts.find((c) => c.backupKey === backupKey);
    if (!conflict) return;
    if (choice === "mienne") {
      const mine = this.values.get(backupKey);
      if (mine !== undefined) this.setItem(conflict.key, mine);
    }
    this.removeItem(backupKey);
    this.setConflicts(this.conflicts.filter((c) => c.backupKey !== backupKey));
    window.V14Bridge?.render?.();
  }

  subscribe(fn: (s: SyncState) => void): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  private setState(next: SyncState) {
    this.state = next;
    for (const fn of this.listeners) fn(next);
  }

  private flushTimers() {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
  }

  // --- interface Storage -------------------------------------------------
  get length(): number {
    return this.values.size;
  }
  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }
  getItem(key: string): string | null {
    return this.values.get(String(key)) ?? null;
  }
  setItem(key: string, value: string): void {
    key = String(key);
    value = String(value);
    if (this.values.get(key) === value) return;
    this.values.set(key, value);
    this.schedule(key);
  }
  removeItem(key: string): void {
    key = String(key);
    if (!this.values.has(key)) return;
    this.values.delete(key);
    this.schedule(key);
  }
  clear(): void {
    for (const key of [...this.values.keys()]) this.removeItem(key);
  }

  // --- persistance ---------------------------------------------------------
  private schedule(key: string) {
    if (!this.projectId) return;
    if (this.readOnly) {
      this.setState({ status: "readonly", pending: 0, message: READ_ONLY_MESSAGE });
      return;
    }
    this.pendingKeys.add(key);
    // Enregistré localement d'abord (IndexedDB), avec la révision lue : rien n'est perdu si le réseau ou l'onglet disparaît.
    // Pendant la création d'une copie de travail, l'écriture attend l'identifiant de la copie (jamais celui de l'original).
    const value = this.values.get(key) ?? null;
    this.queued = this.queued.then(async () => {
      if (this.copying) await this.copying.catch(() => undefined);
      if (!this.projectId || this.readOnly) return;
      await localStore.queue(this.projectId, key, value, this.revisions.get(key) ?? null);
    });
    this.setState({
      status: isOffline() ? "offline" : "local",
      pending: this.pendingKeys.size,
      message: isOffline() ? "Hors-ligne : les modifications sont enregistrées localement et seront synchronisées au retour du réseau." : null,
    });
    const existing = this.timers.get(key);
    if (existing) clearTimeout(existing);
    this.timers.set(
      key,
      setTimeout(() => {
        this.timers.delete(key);
        this.inflight = this.inflight.then(() => this.persist(key)).catch(() => undefined);
      }, DEBOUNCE_MS),
    );
  }

  private async persist(key: string): Promise<void> {
    if (this.copying) await this.copying.catch(() => undefined);
    const projectId = this.projectId;
    if (!projectId || this.readOnly || !this.pendingKeys.has(key)) return;
    if (isOffline()) {
      this.setState({ status: "offline", pending: this.pendingKeys.size, message: "Hors-ligne : les modifications sont enregistrées localement et seront synchronisées au retour du réseau." });
      return;
    }
    const raw = this.values.get(key);
    await this.queued;
    // La révision attendue est celle de la première modification locale (file), sinon celle lue.
    const queued = (await localStore.pending(projectId)).find((q) => q.key === key);
    const expectedRevision = queued ? queued.expectedRevision : (this.revisions.get(key) ?? null);
    this.setState({ status: "syncing", pending: this.pendingKeys.size, message: null });
    try {
      if (raw === undefined) {
        await api.deleteAtelierStoreEntry(projectId, key);
        this.revisions.delete(key);
      } else {
        const res = await api.putAtelierStoreEntry(projectId, key, parseStored(raw), expectedRevision);
        this.revisions.set(key, res.revision);
      }
      this.pendingKeys.delete(key);
      await localStore.acknowledge(projectId, key);
      this.setState({ status: this.pendingKeys.size ? "local" : "saved", pending: this.pendingKeys.size, message: null });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // Quelqu'un (ou un autre onglet) a écrit cette clé entre-temps. Le
        // travail local est conservé sous une clé de sauvegarde récupérable,
        // puis la valeur du serveur reprend la main dans le moteur.
        const body = err.body as { revision: number; value: unknown };
        const backupKey = `${key}.backup.conflit-${Date.now()}`;
        // L'état d'affichage (`.ui` : vue, caméra, onglet) n'est pas un travail : la version du serveur suffit, sans copie ni conflit à départager.
        const viewState = /\.ui$/.test(key);
        if (raw !== undefined && !viewState) {
          try {
            const saved = await api.putAtelierStoreEntry(projectId, backupKey, parseStored(raw), null);
            this.values.set(backupKey, raw);
            this.revisions.set(backupKey, saved.revision);
          } catch {
            /* la copie de secours reste au moins en mémoire */
          }
        }
        this.values.set(key, typeof body.value === "string" ? body.value : JSON.stringify(body.value));
        this.revisions.set(key, body.revision);
        this.pendingKeys.delete(key);
        await localStore.acknowledge(projectId, key);
        if (viewState) {
          this.setState({ status: this.pendingKeys.size ? "local" : "saved", pending: this.pendingKeys.size, message: null });
          window.V14Bridge?.render?.();
          return;
        }
        if (raw !== undefined) this.setConflicts([...this.conflicts, { key, backupKey, at: new Date().toISOString(), serverRevision: body.revision }]);
        this.setState({
          status: "conflict",
          pending: this.pendingKeys.size,
          message: `Conflit sur « ${key.split(".").pop()} » : la version du serveur a été rechargée ; votre version est conservée sous « ${backupKey} » — à départager dans le bandeau des conflits.`,
        });
        window.V14Bridge?.render?.();
        return;
      }
      if (err instanceof ApiError && (err.status === 403 || err.status === 423)) {
        // Droit retiré entre-temps (projet partagé en lecture) ou édition réservée par quelqu'un d'autre : l'écriture ne sera pas acceptée, elle sort de la file ; le travail reste en mémoire.
        this.pendingKeys.delete(key);
        await localStore.acknowledge(projectId, key);
        this.readOnly = true;
        this.setState({ status: "readonly", pending: this.pendingKeys.size, message: err.serverMessage ?? READ_ONLY_MESSAGE });
        return;
      }
      if (isNetworkFailure(err)) {
        await localStore.failed(projectId, key, "réseau indisponible");
        this.setState({
          status: "offline",
          pending: this.pendingKeys.size,
          message: isOffline()
            ? "Hors-ligne : les modifications sont enregistrées localement et seront synchronisées au retour du réseau."
            : "Serveur injoignable : les modifications sont enregistrées localement ; nouvelle tentative au retour du réseau, à la prochaine modification ou à la prochaine ouverture du projet.",
        });
        return;
      }
      await localStore.failed(projectId, key, err instanceof Error ? err.message : String(err));
      this.setState({
        status: "error",
        pending: this.pendingKeys.size,
        message: "Échec de l’enregistrement sur le serveur ; le travail reste enregistré localement. Nouvelle tentative à la prochaine modification ou au retour du réseau.",
      });
    }
  }

  /** Retour du réseau (ou demande explicite) : rejoue tout ce qui attend dans la file. */
  async retryPending(): Promise<void> {
    if (!this.projectId) return;
    for (const key of [...this.pendingKeys]) {
      if (this.timers.has(key)) continue; // une écriture encore en attente de regroupement part d'elle-même
      this.inflight = this.inflight.then(() => this.persist(key)).catch(() => undefined);
    }
    await this.inflight;
  }

  /** Nombre d'écritures en attente (file locale). */
  pendingCount(): number {
    return this.pendingKeys.size;
  }

  /** Attend la fin des écritures en cours (utilisé avant de changer de projet ou de quitter l'écran). */
  async flush(): Promise<void> {
    for (const [key, t] of this.timers) {
      clearTimeout(t);
      this.timers.delete(key);
      this.inflight = this.inflight.then(() => this.persist(key)).catch(() => undefined);
    }
    await this.inflight;
  }
}

export const atelierStorage = new AtelierStorageAdapter();

if (typeof window !== "undefined") {
  window.addEventListener("online", () => void atelierStorage.retryPending());
  // Couture `P118Resolved` du moteur extrait : l'aide des outils et la copie de travail automatique de la référence protégée.
  window.P118Resolved = { isRead: () => atelierStorage.isProtectedReference(), ensureDrawingCopy: () => atelierStorage.ensureDrawingCopy() };
}
