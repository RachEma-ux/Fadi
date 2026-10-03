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

import { api } from "../../../lib/api";
export { atelierStorage, DRAWING_COPY_NAME, PROTECTED_REFERENCE_MESSAGE, READ_ONLY_MESSAGE } from "./storage";
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
    activeToolIndicator(parking);
    registerExportCapture();
  })();
  return loading;
}

const EXPORT_KINDS = new Set(["dxf", "svg", "png", "csv", "json"]);

/**
 * Les dessins techniques et exports du moteur (DXF, SVG, PNG, CSV, JSON) partent en téléchargement par un lien `download`
 * créé à la volée (`exportFile`, `exportPNG` des scripts extraits). Fadi les intercepte au passage — sans modifier le
 * moteur — pour les enregistrer au catalogue des documents avec le niveau actif, la vue courante et la révision du
 * modèle (stampée par le serveur) : le catalogue dit ensuite s'ils sont encore à jour. Le téléchargement a lieu
 * normalement ; un projet en lecture seule n'enregistre rien.
 */
function registerExportCapture(): void {
  // Les scripts extraits déclenchent le téléchargement par `a.click()` sur un lien parfois jamais attaché au document
  // (`exportPNG` du viewer) : un écouteur d'événements ne le verrait pas. Le point d'entrée commun est donc `click()`
  // du prototype des liens, enveloppé une fois ; tout autre lien passe inchangé.
  const nativeClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
    try {
      captureExport(this);
    } catch {
      /* jamais bloquant pour le téléchargement */
    }
    return nativeClick.call(this);
  };
}

function captureExport(anchor: HTMLAnchorElement): void {
  if (!anchor.hasAttribute("download") || !window.AtelierHost?.projectId || atelierStorage.isReadOnly()) return;
  const href = anchor.getAttribute("href") ?? "";
  if (!href.startsWith("blob:") && !href.startsWith("data:")) return;
  const fileName = anchor.download || "export";
  const kind = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (!EXPORT_KINDS.has(kind)) return;
  const projectId = window.AtelierHost.projectId;
  const level = window.V14Bridge?.activeLevel?.() ?? null;
  const view = window.V14Bridge?.capture?.() ?? {};
  void fetch(href)
    .then((r) => r.blob())
    .then((blob) => api.registerDrawingExport(projectId, { blob, fileName, kind, levelId: level?.id ?? null, levelName: level?.name ?? null, view }))
    .then((rec) => {
      // Trace lisible par le scénario de bout en bout (et par un outil de diagnostic) : les exports enregistrés de cette page.
      (window.__fadiExports ??= []).push(rec);
      window.dispatchEvent(new CustomEvent("fadi:drawing-export", { detail: rec }));
      window.V14Bridge?.toast?.(`Export enregistré au catalogue des documents (révision ${rec.modelRevision}).`);
    })
    .catch(() => window.V14Bridge?.toast?.("Export téléchargé, mais non enregistré au catalogue (serveur injoignable ou refus)."));
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

/**
 * Indicateur permanent de l'outil actif (téléphone surtout, où les onglets et la palette défilent hors de vue) : une
 * puce « Outil : Mur » dans la rangée d'état de la barre d'outils, tenue à jour depuis les états `aria-pressed` /
 * `.active` que les scripts extraits basculent — rien n'est modifié dans le moteur. Les rangées défilantes reçoivent
 * la classe `is-scrollable` quand leur contenu dépasse (voile de bord dans native.css).
 */
function activeToolIndicator(root: HTMLElement): void {
  const status = root.querySelector<HTMLElement>(".atelier-toolbar-status");
  if (!status) return;
  const chip = document.createElement("span");
  chip.id = "fadi-active-tool";
  chip.className = "fadi-active-tool";
  chip.setAttribute("aria-live", "polite");
  status.prepend(chip);
  // Chaque écriture n'a lieu que si la valeur change : l'observateur regarde ce sous-arbre, une écriture à l'identique
  // produirait une mutation, donc une boucle.
  const reflect = () => {
    const tool = root.querySelector<HTMLElement>('[data-atelier-tool][aria-pressed="true"]');
    const tab = root.querySelector<HTMLElement>(".atelier-toolbar-main [data-atab].active");
    const toolLabel = tool?.getAttribute("title") || tool?.getAttribute("aria-label") || null;
    const tabLabel = tab?.textContent?.trim() || null;
    const text = toolLabel ? `Outil : ${toolLabel}` : tabLabel ? `Onglet : ${tabLabel}` : "";
    if (chip.textContent !== text) chip.textContent = text;
    if (chip.hidden !== !text) chip.hidden = !text;
    for (const row of root.querySelectorAll<HTMLElement>(".atelier-toolbar-main, .atelier-toolbar-context, #atelier-drawing-tools")) {
      const scrollable = row.scrollWidth > row.clientWidth + 2;
      if (row.classList.contains("is-scrollable") !== scrollable) row.classList.toggle("is-scrollable", scrollable);
    }
  };
  reflect();
  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      reflect();
    });
  };
  new MutationObserver(schedule).observe(root, { subtree: true, attributes: true, attributeFilter: ["aria-pressed", "class"], childList: true });
  window.addEventListener("resize", schedule);
}

export interface MountOptions {
  /** Projet partagé en lecture : rien n'est enregistré. */
  readOnly?: boolean;
  /** Référence protégée d'un exemple : la première modification validée crée une copie de travail (`ensureDrawingCopy`). */
  protectedReference?: boolean;
  onDrawingCopy?: (copy: { id: string; name: string }) => void;
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
  const protectedReference = !readOnly && (options.protectedReference ?? false);
  if (window.AtelierHost?.projectId !== options.projectId || readOnly !== atelierStorage.isReadOnly() || protectedReference !== atelierStorage.isProtectedReference())
    await atelierStorage.bind(options.projectId, options.store, { readOnly, protectedReference, onDrawingCopy: options.onDrawingCopy });
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
