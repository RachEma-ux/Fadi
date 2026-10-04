/**
 * État de la file de l'Atelier pour l'en-tête du projet (indicateur de synchronisation, bandeau des conflits) :
 * lu sur le client ouvert quand il existe, sinon dans la file locale (Dexie) — l'en-tête n'ouvre jamais le modèle
 * à lui seul.
 */
import { useEffect, useState } from "react";
import type { LotEnAttente } from "@parcours/atelier-model";
import { localStore } from "../../../lib/local-store";
import { atelierClient, atelierClientExistant } from "./atelier-client";

export interface EtatFileAtelier {
  enAttente: number;
  aTraiter: LotEnAttente[];
  envoiEnCours: boolean;
}

const VIDE: EtatFileAtelier = { enAttente: 0, aTraiter: [], envoiEnCours: false };

export function useFileAtelier(projectId: string): EtatFileAtelier {
  const [etat, setEtat] = useState<EtatFileAtelier>(VIDE);
  useEffect(() => {
    let vivant = true;
    let desabonner: (() => void) | null = null;
    const lire = () => {
      const c = atelierClientExistant(projectId);
      if (c) {
        if (!desabonner) desabonner = c.subscribe(lire);
        const i = c.getSnapshot();
        const aTraiter = i.lots.filter((l) => l.etat === "conflit" || l.etat === "refuse");
        setEtat({ enAttente: i.lots.length - aTraiter.length, aTraiter, envoiEnCours: i.envoiEnCours });
        return;
      }
      void localStore.lots(projectId).then((lots) => {
        if (!vivant || atelierClientExistant(projectId)) return;
        const aTraiter = lots.filter((l) => l.etat === "conflit" || l.etat === "refuse").map((l) => ({ enveloppe: JSON.parse(l.enveloppe), etat: l.etat, creeA: l.creeA, detail: l.detail ? JSON.parse(l.detail) : null }) as LotEnAttente);
        setEtat({ enAttente: lots.length - aTraiter.length, aTraiter, envoiEnCours: false });
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
  return etat;
}

/** Envoie la file maintenant (bouton « Synchroniser ») : ouvre le client si besoin, qui rejoue les lots locaux. */
export function synchroniserAtelier(projectId: string): void {
  const c = atelierClient(projectId);
  void c.demarrage.then(() => c.envoyer());
}

/** Décision sur un lot en conflit ou refusé depuis l'en-tête. */
export function deciderLot(projectId: string, requestId: string, decision: "rejouer" | "abandonner"): void {
  const c = atelierClient(projectId);
  void c.demarrage.then(() => c.decider(requestId, decision));
}
