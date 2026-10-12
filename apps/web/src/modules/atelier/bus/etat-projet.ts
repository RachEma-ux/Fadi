/**
 * État de la file de l'Atelier pour l'en-tête du projet (indicateur de synchronisation, bandeau des conflits) :
 * lu sur le client ouvert quand il existe, sinon dans la file locale (Dexie) — l'en-tête n'ouvre jamais le modèle
 * à lui seul.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import type { LotEnAttente } from "@parcours/atelier-model";
import { localStore, queuePersistenceStore, type LotEntry } from "../../../lib/local-store";
import { reachability } from "../../../lib/reachability";
import { atelierClient, atelierClientExistant } from "./atelier-client";

export interface EtatFileAtelier {
  enAttente: number | null;
  aTraiter: LotEnAttente[];
  envoiEnCours: boolean;
  lecture: "loading" | "ready" | "error";
  erreurLocale: string | null;
  sauvegardeEnCours: boolean;
}

const VIDE: EtatFileAtelier = { enAttente: null, aTraiter: [], envoiEnCours: false, lecture: "loading", erreurLocale: null, sauvegardeEnCours: false };
const depuisEntree = (lot: LotEntry): LotEnAttente => ({ enveloppe: JSON.parse(lot.enveloppe), etat: lot.etat, creeA: lot.creeA, detail: lot.detail ? JSON.parse(lot.detail) : null });

export function useFileAtelier(projectId: string): EtatFileAtelier {
  const [etat, setEtat] = useState<{ projectId: string; lots: LotEnAttente[]; envoiEnCours: boolean } | null>(null);
  const persistence = useSyncExternalStore(queuePersistenceStore.subscribe, () => queuePersistenceStore.get(projectId));
  useEffect(() => {
    let vivant = true;
    let requete = 0;
    let desabonner: (() => void) | null = null;
    const lire = () => {
      const numero = ++requete;
      const c = atelierClientExistant(projectId);
      if (c) {
        if (!desabonner) desabonner = c.subscribe(lire);
        const i = c.getSnapshot();
        setEtat({ projectId, lots: i.lots, envoiEnCours: i.envoiEnCours });
        return;
      }
      void localStore.lots(projectId).then((lots) => {
        if (!vivant || numero !== requete || atelierClientExistant(projectId)) return;
        setEtat({ projectId, lots: lots.map(depuisEntree), envoiEnCours: false });
      }).catch(() => {
        if (!vivant || numero !== requete || atelierClientExistant(projectId)) return;
        setEtat({ projectId, lots: localStore.memoryLots(projectId).map(depuisEntree), envoiEnCours: false });
      });
    };
    lire();
    // Le client peut être créé plus tard (ouverture de l'Atelier) : on le cherche à intervalle régulier.
    const t = setInterval(lire, 3000);
    return () => {
      vivant = false;
      clearInterval(t);
      desabonner?.();
    };
  }, [projectId]);
  if (!etat || etat.projectId !== projectId) return { ...VIDE, erreurLocale: persistence.error };
  const aTraiter = etat.lots.filter((lot) => lot.etat === "conflit" || lot.etat === "refuse");
  return { enAttente: persistence.read === "ready" ? etat.lots.length - aTraiter.length : null, aTraiter, envoiEnCours: etat.envoiEnCours, lecture: persistence.read === "unknown" ? "loading" : persistence.read, erreurLocale: persistence.error, sauvegardeEnCours: persistence.saving > 0 };
}

/** Envoie la file maintenant (bouton « Synchroniser ») : ouvre le client si besoin, qui rejoue les lots locaux. */
export async function synchroniserAtelier(projectId: string, canWrite = false): Promise<void> {
  if (!canWrite || reachability.get() !== "reachable" || (typeof navigator !== "undefined" && !navigator.onLine)) return;
  const c = atelierClient(projectId, { readOnly: false });
  await c.demarrage;
  await c.envoyer();
}

export async function reessayerSauvegardeAtelier(projectId: string): Promise<void> {
  const c = atelierClientExistant(projectId);
  if (c) { await c.demarrage; await c.reessayerSauvegarde(); }
  else await localStore.retryLots(projectId);
}

/** Décision sur un lot en conflit ou refusé depuis l'en-tête. */
export async function deciderLot(projectId: string, requestId: string, decision: "rejouer" | "abandonner", canWrite = false): Promise<void> {
  if (decision === "rejouer" && !canWrite) throw new Error("La reprise exige un accès en écriture à ce projet.");
  const c = atelierClient(projectId, { readOnly: !canWrite });
  await c.demarrage;
  await c.decider(requestId, decision);
}
