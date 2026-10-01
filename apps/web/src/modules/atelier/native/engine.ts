/**
 * Hôte du moteur de l'Atelier natif (Design Atelier V14-3 du prototype,
 * extrait tel quel — voir `apps/web/scripts/extract-native-atelier.mjs` et
 * `public/atelier-native/README.md`).
 *
 * Le moteur n'est ni réécrit ni transpilé : il est chargé une seule fois
 * comme scripts classiques, sur un sous-arbre DOM persistant
 * (`#nativeDesignerParking > #nativeDesignerRoot`) que l'on DÉPLACE dans
 * l'écran qui l'affiche et que l'on gare hors écran ensuite — exactement la
 * mécanique `mountNativeDesigner()` / `parkNativeDesigner()` du prototype.
 * Recréer le DOM à chaque affichage perdrait les écouteurs que le moteur a
 * attachés au chargement.
 *
 * Interface stable entre Fadi et le moteur :
 * - `window.ParcoursSession.storage` (couture prévue par le moteur) : ici un
 *   magasin en mémoire lié au projet Fadi courant, dont chaque écriture est
 *   envoyée à l'API avec la révision lue (détection de conflit) ;
 * - `window.V14Bridge` (ouvrir un projet natif, modèle, rendu) et
 *   `window.AtelierTools` (outils de dessin) côté moteur ;
 * - `window.AtelierHost.stage` (numéro d'étape du Parcours affichée) côté
 *   Fadi, seule information que la barre d'outils V8 demandait à l'app hôte.
 */
import rootMarkup from "./root.html?raw";
import "./native.css";
import { ApiError, api, type AtelierStore } from "../../../lib/api";

export type SyncStatus = "idle" | "local" | "syncing" | "saved" | "conflict" | "error";

export interface SyncState {
  status: SyncStatus;
  pending: number;
  message: string | null;
}

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
  }
}

/** Une valeur du magasin telle que le moteur l'a écrite : du JSON (domaines, registre) ou une chaîne brute (projet actif). */
function parseStored(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

const SCRIPTS = ["/atelier-native/v14-viewer.js", "/atelier-native/v14-tools.js", "/atelier-native/v8-toolbar.js"];
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

  bind(projectId: string, store: AtelierStore): void {
    this.flushTimers();
    this.projectId = projectId;
    // Le moteur écrit du JSON pour ses domaines mais une chaîne brute pour
    // `design.v13.activeProject` : on lui rend exactement ce qu'il a écrit.
    this.values = new Map(Object.entries(store.entries).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)]));
    this.revisions = new Map(Object.entries(store.revisions));
    this.pendingKeys.clear();
    this.setState({ status: "idle", pending: 0, message: null });
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
    this.pendingKeys.add(key);
    this.setState({ status: "local", pending: this.pendingKeys.size, message: null });
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
    const projectId = this.projectId;
    if (!projectId) return;
    const raw = this.values.get(key);
    this.setState({ status: "syncing", pending: this.pendingKeys.size, message: null });
    try {
      if (raw === undefined) {
        await api.deleteAtelierStoreEntry(projectId, key);
        this.revisions.delete(key);
      } else {
        const res = await api.putAtelierStoreEntry(projectId, key, parseStored(raw), this.revisions.get(key) ?? null);
        this.revisions.set(key, res.revision);
      }
      this.pendingKeys.delete(key);
      this.setState({ status: this.pendingKeys.size ? "local" : "saved", pending: this.pendingKeys.size, message: null });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // Quelqu'un (ou un autre onglet) a écrit cette clé entre-temps. Le
        // travail local est conservé sous une clé de sauvegarde récupérable,
        // puis la valeur du serveur reprend la main dans le moteur.
        const body = err.body as { revision: number; value: unknown };
        const backupKey = `${key}.backup.conflit-${Date.now()}`;
        if (raw !== undefined) {
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
        this.setState({ status: "conflict", pending: this.pendingKeys.size, message: `Conflit sur « ${key.split(".").pop()} » : la version du serveur a été rechargée ; votre version est conservée sous « ${backupKey} ».` });
        window.V14Bridge?.render?.();
        return;
      }
      this.setState({ status: "error", pending: this.pendingKeys.size, message: "Échec de l’enregistrement sur le serveur ; le travail reste en mémoire dans cet onglet. Nouvelle tentative à la prochaine modification." });
    }
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

let parking: HTMLDivElement | null = null;
let loading: Promise<void> | null = null;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.async = false;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Script du moteur introuvable : ${src}`));
    document.head.appendChild(s);
  });
}

/** Charge le moteur une seule fois : magasin, markup garé hors écran, scripts dans l'ordre. */
export function ensureEngineLoaded(): Promise<void> {
  if (loading) return loading;
  loading = (async () => {
    window.ParcoursSession = {
      storage: atelierStorage,
      readJSON: (key, fallback, valid = () => true) => {
        const raw = atelierStorage.getItem(key);
        if (raw === null) return fallback;
        try {
          const v: unknown = JSON.parse(raw);
          return valid(v) ? v : fallback;
        } catch {
          return fallback;
        }
      },
      volatile: false,
    };
    window.AtelierHost = { stage: null, projectId: null };
    parking = document.createElement("div");
    parking.id = "nativeDesignerParking";
    parking.innerHTML = rootMarkup;
    parking.hidden = true;
    document.body.appendChild(parking);
    for (const src of SCRIPTS) await loadScript(src);
  })();
  return loading;
}

export interface MountOptions {
  projectId: string;
  stage: number | null;
  store: AtelierStore;
}

/**
 * Affiche le moteur dans `container` pour un projet : lie le magasin,
 * déplace le sous-arbre, ouvre le projet natif actif s'il existe (sinon le
 * moteur présente son accueil « Nouveau projet / Importer »).
 */
export async function mountEngine(container: HTMLElement, options: MountOptions): Promise<void> {
  await ensureEngineLoaded();
  if (!parking) throw new Error("moteur non chargé");
  if (window.AtelierHost?.projectId !== options.projectId) atelierStorage.bind(options.projectId, options.store);
  window.AtelierHost = { stage: options.stage, projectId: options.projectId };
  const root = parking.querySelector<HTMLElement>("#nativeDesignerRoot");
  container.appendChild(parking);
  parking.hidden = false;
  parking.classList.add("native-mounted");
  if (root) root.hidden = false;
  window.AtelierTools?.cancel?.({ render: false });
  const active = atelierStorage.getItem("design.v13.activeProject");
  const registryRaw = atelierStorage.getItem("design.v13.registry");
  const registry: { id: string }[] = registryRaw ? (JSON.parse(registryRaw) as { id: string }[]) : [];
  if (active && registry.some((p) => p.id === active)) {
    window.V14Bridge?.openProject(active);
  } else {
    window.V14Bridge?.render?.();
  }
  window.initAtelierToolbar?.();
  window.dispatchEvent(new Event("resize"));
  setTimeout(() => window.dispatchEvent(new Event("resize")), 80);
}

/** Gare le moteur hors écran (sans le détruire) et pousse les écritures en attente. */
export async function unmountEngine(): Promise<void> {
  if (!parking) return;
  window.AtelierTools?.cancel?.({ render: false });
  parking.classList.remove("native-mounted");
  parking.hidden = true;
  document.body.appendChild(parking);
  if (window.AtelierHost) window.AtelierHost.stage = null;
  await atelierStorage.flush();
}
