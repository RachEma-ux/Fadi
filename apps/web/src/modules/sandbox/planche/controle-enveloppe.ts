/**
 * Lancement du contrôle de l'enveloppe hors du fil principal (cas 4, étape 7c). Un seul travailleur, créé à la première
 * demande ; une demande plus récente rend caduques les précédentes (seul le dernier résultat est rendu).
 */
import type { Modele, ResultatControleEnveloppe } from "@parcours/sandbox-planche-model";
import type { DemandeControleEnveloppe, MessageControleEnveloppe } from "./enveloppe-planche.worker";

interface TravailleurControle {
  postMessage(d: DemandeControleEnveloppe): void;
  onmessage: ((e: MessageEvent<MessageControleEnveloppe>) => void) | null;
  terminate(): void;
}

const creerTravailleur = (): TravailleurControle => new Worker(new URL("./enveloppe-planche.worker.ts", import.meta.url), { type: "module", name: "fadi-planche-enveloppe" }) as unknown as TravailleurControle;

export interface ControleurEnveloppe {
  demander(m: Modele): void;
  arreter(): void;
}

export function creerControleurEnveloppe(rendre: (r: ResultatControleEnveloppe | null, erreur: string | null) => void, creer: () => TravailleurControle = creerTravailleur): ControleurEnveloppe {
  let t: TravailleurControle | null = null;
  let n = 0;
  return {
    demander(m) {
      if (!t) {
        t = creer();
        t.onmessage = (e) => {
          if (e.data.n !== n) return;
          if ("erreur" in e.data) rendre(null, e.data.erreur);
          else rendre(e.data.resultat, null);
        };
      }
      n++;
      t.postMessage({ n, modele: m });
    },
    arreter() {
      n++;
      t?.terminate();
      t = null;
    },
  };
}
