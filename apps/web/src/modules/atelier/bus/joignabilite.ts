/**
 * Joignabilité vue par le bus : `en-ligne` (réseau et serveur), `hors-ligne` (navigateur sans réseau),
 * `injoignable` (réseau présent, serveur muet : `lib/reachability.ts`, sonde `/health` conservée).
 * Source injectable : `joignabiliteNavigateur` en production, `joignabiliteManuelle` dans les tests.
 */
import { reachability } from "../../../lib/reachability";
import type { Joignabilite } from "./types";

export interface SourceJoignabilite {
  etat(): Joignabilite;
  subscribe(fn: () => void): () => void;
}

export function joignabiliteNavigateur(): SourceJoignabilite {
  return {
    etat() {
      if (typeof navigator !== "undefined" && !navigator.onLine) return "hors-ligne";
      return reachability.get() === "reachable" ? "en-ligne" : "injoignable";
    },
    subscribe(fn) {
      const off = reachability.subscribe(fn);
      if (typeof window === "undefined") return off;
      window.addEventListener("online", fn);
      window.addEventListener("offline", fn);
      return () => {
        off();
        window.removeEventListener("online", fn);
        window.removeEventListener("offline", fn);
      };
    },
  };
}

export function joignabiliteManuelle(initiale: Joignabilite = "en-ligne"): SourceJoignabilite & { definir(e: Joignabilite): void } {
  let courante = initiale;
  const ecouteurs = new Set<() => void>();
  return {
    etat: () => courante,
    subscribe(fn) {
      ecouteurs.add(fn);
      return () => ecouteurs.delete(fn);
    },
    definir(e) {
      if (e === courante) return;
      courante = e;
      for (const fn of [...ecouteurs]) fn();
    },
  };
}
