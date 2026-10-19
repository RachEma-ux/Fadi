/**
 * Connexion vue par Studio : en ligne seulement si le navigateur l'est ET que le serveur répond (`lib/reachability`).
 * `surRetourEnLigne` réveille les enveloppes conservées quand le navigateur retrouve le réseau ou que le serveur
 * répond de nouveau.
 */
import { useEffect, useRef, useSyncExternalStore } from "react";
import { reachability } from "../../../lib/reachability";

export const navigateurEnLigne = (): boolean => typeof navigator === "undefined" || navigator.onLine;
export const enLigne = (): boolean => navigateurEnLigne() && reachability.get() === "reachable";

function abonner(f: () => void): () => void {
  window.addEventListener("online", f);
  window.addEventListener("offline", f);
  const fin = reachability.subscribe(f);
  return () => { window.removeEventListener("online", f); window.removeEventListener("offline", f); fin(); };
}

export function useConnexion(): boolean {
  return useSyncExternalStore(abonner, enLigne, () => true);
}

/** Appelle `f` à chaque passage de hors ligne à en ligne. */
export function useRetourEnLigne(f: () => void): void {
  const ref = useRef(f);
  ref.current = f;
  useEffect(() => {
    let avant = enLigne();
    return abonner(() => { const maintenant = enLigne(); if (maintenant && !avant) ref.current(); avant = maintenant; });
  }, []);
}
