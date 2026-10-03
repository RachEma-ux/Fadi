/**
 * Joignabilité du serveur, distincte de l'état « en ligne » du navigateur.
 *
 * Le navigateur se dit en ligne dès qu'il a un réseau ; le serveur peut
 * pourtant être injoignable (tunnel fermé, API arrêtée, 502 / 503 / 504
 * d'un relais). Sans cette distinction, une saisie envoyée à ce moment-là
 * échouait franchement au lieu d'attendre : ici, le premier échec réseau
 * déclare le serveur injoignable, TanStack Query met alors en pause les
 * écritures (comme hors-ligne : elles restent persistées et comptées « en
 * attente »), une sonde relit `/health` à intervalle croissant (3 s → 30 s)
 * et, dès qu'elle répond, les écritures en pause repartent d'elles-mêmes.
 */
import { onlineManager } from "@tanstack/react-query";

export type Reachability = "reachable" | "unreachable";

let reachable = true;
let probeTimer: ReturnType<typeof setTimeout> | null = null;
let probeDelay = 3000;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

/** Ce que TanStack Query doit croire : en ligne seulement si le navigateur l'est ET que le serveur répond. */
function syncOnlineManager() {
  const online = (typeof navigator === "undefined" || navigator.onLine) && reachable;
  if (onlineManager.isOnline() !== online) onlineManager.setOnline(online);
}

export const reachability = {
  get(): Reachability {
    return reachable ? "reachable" : "unreachable";
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  /** Appelé par le client HTTP : pas de réponse (réseau) ou 502 / 503 / 504. */
  markUnreachable(): void {
    if (!reachable) return;
    reachable = false;
    syncOnlineManager();
    emit();
    scheduleProbe(probeDelay);
  },
  /** Appelé par le client HTTP à toute réponse du serveur (même une erreur applicative), et par la sonde. */
  markReachable(): void {
    if (reachable) return;
    reachable = true;
    probeDelay = 3000;
    if (probeTimer) clearTimeout(probeTimer);
    probeTimer = null;
    syncOnlineManager();
    emit();
  },
  /** Reprise manuelle (« Réessayer ») : sonde immédiate. */
  probeNow(): Promise<boolean> {
    return probe();
  },
  /** Le navigateur a changé d'état réseau : TanStack suit, et un retour en ligne déclenche une sonde. */
  browserOnlineChanged(): void {
    syncOnlineManager();
    if (typeof navigator !== "undefined" && navigator.onLine && !reachable) void probe();
  },
};

function scheduleProbe(delay: number) {
  if (probeTimer) clearTimeout(probeTimer);
  probeTimer = setTimeout(() => void probe(), delay);
}

async function probe(): Promise<boolean> {
  try {
    const res = await fetch("/health", { credentials: "include", cache: "no-store" });
    if (res.ok) {
      reachability.markReachable();
      return true;
    }
  } catch {
    /* toujours injoignable */
  }
  if (!reachable) {
    probeDelay = Math.min(30000, Math.round(probeDelay * 1.6));
    scheduleProbe(probeDelay);
  }
  return false;
}

/** Une erreur de `fetch` sans réponse (réseau coupé, serveur arrêté, DNS) — jamais une réponse HTTP. */
export function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError;
}

export const GATEWAY_STATUSES = new Set([502, 503, 504]);
