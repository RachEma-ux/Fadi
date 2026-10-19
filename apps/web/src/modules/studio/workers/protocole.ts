/**
 * Côté Worker : branche une table de traitements sur une portée (`self` du Worker, ou une portée simulée par le banc
 * d'essai qui exécute ce même code dans le processus de test). Chaque demande `{ id, nature, charge }` reçoit des
 * progressions éventuelles puis une seule réponse, valeur ou erreur. Ni React ni DOM.
 */
import type { DemandeWorker, Progression, ReponseWorker } from "./hote-worker";

export interface Traitement {
  executer: (charge: never, progresser: (p: Progression) => void) => unknown;
  /** Objets de la valeur à transférer plutôt que copier (tampons d'un PDF, par exemple). */
  transfert?: (valeur: never) => Transferable[];
}
export type Traitements = Record<string, Traitement>;

/** Ce que le protocole utilise d'une portée de Worker. */
export interface PorteeWorker {
  onmessage: ((e: MessageEvent<DemandeWorker>) => unknown) | null;
  postMessage(message: ReponseWorker, transfert?: Transferable[]): void;
}

export function brancher(portee: PorteeWorker, traitements: Traitements): void {
  portee.onmessage = async (e) => {
    const { id, nature, charge } = e.data;
    const t = Object.hasOwn(traitements, nature) ? traitements[nature] : undefined;
    if (!t) { portee.postMessage({ id, erreur: `Traitement inconnu : ${nature}` }); return; }
    try {
      const valeur = await t.executer(charge as never, (progression) => portee.postMessage({ id, progression }));
      portee.postMessage({ id, valeur }, t.transfert?.(valeur as never) ?? []);
    } catch (err) {
      portee.postMessage({ id, erreur: err instanceof Error ? err.message : String(err) });
    }
  };
}

/** Exécution directe (sans Worker) de la même table : même code, mêmes résultats. */
export function executerDirectement(traitements: Traitements) {
  return (nature: string, charge: unknown, progresser: (p: Progression) => void): unknown => {
    const t = Object.hasOwn(traitements, nature) ? traitements[nature] : undefined;
    if (!t) throw new Error(`Traitement inconnu : ${nature}`);
    return t.executer(charge as never, progresser);
  };
}
