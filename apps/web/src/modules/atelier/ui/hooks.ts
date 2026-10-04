/**
 * Abonnements React aux magasins du socle et au bus (L3a.1). Le pilote et le bus rendent des objets neufs à chaque
 * lecture (`apercu()`…) : on ne les passe pas comme instantané à `useSyncExternalStore` ; on compte les
 * notifications et l'on relit pendant le rendu.
 */
import { useEffect, useReducer, useSyncExternalStore } from "react";
import type { BusAtelier } from "../bus";
import type { EtatInterface, EtatVue, PiloteOutils, Selection, SelectionAtelier } from "../socle";

/** Rendu à chaque notification de `abonner`. */
export function useNotifications(abonner: (ecouteur: () => void) => () => void): number {
  const [n, incrementer] = useReducer((x: number) => x + 1, 0);
  useEffect(() => abonner(() => incrementer()), [abonner]);
  return n;
}

/** L'état de vue (instantané stable : `creerEtatInterface` ne recrée l'objet qu'à un changement). */
export function useVue(vue: EtatInterface): EtatVue {
  return useSyncExternalStore(vue.abonner, vue.lire, vue.lire);
}

export function useSelection(selection: SelectionAtelier): Selection {
  return useSyncExternalStore(selection.abonner, selection.lire, selection.lire);
}

export function usePilote(pilote: PiloteOutils): number {
  return useNotifications(pilote.abonner);
}

/** Toute évolution de la file, de l'état local ou confirmé du bus. */
export function useBus(bus: Pick<BusAtelier, "on">): number {
  return useNotifications(abonnementBus(bus));
}

const abonnements = new WeakMap<object, (e: () => void) => () => void>();
function abonnementBus(bus: Pick<BusAtelier, "on">): (e: () => void) => () => void {
  let a = abonnements.get(bus);
  if (!a) {
    a = (e) => bus.on("etat", () => e());
    abonnements.set(bus, a);
  }
  return a;
}
