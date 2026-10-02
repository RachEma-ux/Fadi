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
 *   d'abord conservée dans la file locale (IndexedDB, `lib/local-store.ts`)
 *   puis envoyée à l'API avec la révision lue (détection de conflit) ; sans
 *   réseau, elle attend dans la file et est rejouée au retour du réseau ou
 *   à la prochaine ouverture du projet — quatre états visibles : enregistré
 *   localement, synchronisation, enregistré sur le serveur, conflit ;
 * - `window.V14Bridge` (ouvrir un projet natif, modèle, rendu) et
 *   `window.AtelierTools` (outils de dessin) côté moteur ;
 * - `window.AtelierHost.stage` (numéro d'étape du Parcours affichée) côté
 *   Fadi, seule information que la barre d'outils V8 demandait à l'app hôte.
 */
import rootMarkup from "./root.html?raw";
import "./native.css";
import type { AtelierStore } from "../../../lib/api";
import { atelierStorage } from "./storage";

export { atelierStorage, READ_ONLY_MESSAGE } from "./storage";
export type { ModelConflict, SyncState, SyncStatus } from "./storage";

const SCRIPTS = ["/atelier-native/v14-viewer.js", "/atelier-native/v14-tools.js", "/atelier-native/v8-toolbar.js"];
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
    accessibleToolTabs(parking);
  })();
  return loading;
}

/**
 * Accessibilité de la barre d'outils V8 (markup extrait tel quel) : son
 * `role="tablist"` contient des boutons sans rôle `tab` (WCAG 4.1.2,
 * critique pour axe). Fadi pose le rôle et reflète la sélection depuis la
 * classe `active` que le script extrait bascule, sans le modifier.
 */
function accessibleToolTabs(root: HTMLElement): void {
  const tabs = Array.from(root.querySelectorAll<HTMLButtonElement>(".atelier-toolbar-main [data-atab]"));
  const reflect = () => {
    for (const tab of tabs) {
      const selected = tab.classList.contains("active");
      tab.setAttribute("aria-selected", selected ? "true" : "false");
      tab.tabIndex = selected ? 0 : -1;
    }
  };
  for (const tab of tabs) tab.setAttribute("role", "tab");
  reflect();
  const observer = new MutationObserver(reflect);
  for (const tab of tabs) observer.observe(tab, { attributes: true, attributeFilter: ["class"] });
  // Flèches gauche / droite entre onglets, comme le motif ARIA « tabs » ; le clic natif du script extrait fait le reste.
  root.querySelector(".atelier-toolbar-main")?.addEventListener("keydown", (event) => {
    const e = event as KeyboardEvent;
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const i = tabs.findIndex((t) => t === document.activeElement);
    if (i < 0) return;
    const next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
    if (!next) return;
    e.preventDefault();
    next.focus();
    next.click();
  });
}

export interface MountOptions {
  /** Projet partagé en lecture : rien n'est enregistré. */
  readOnly?: boolean;
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
  const readOnly = options.readOnly ?? false;
  if (window.AtelierHost?.projectId !== options.projectId || readOnly !== atelierStorage.isReadOnly()) await atelierStorage.bind(options.projectId, options.store, readOnly);
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
