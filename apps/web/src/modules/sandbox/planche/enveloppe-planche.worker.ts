/// <reference lib="webworker" />
/**
 * Travailleur du contrôle de l'enveloppe (cas 4, étape 7c, D6-F20b-004) : `controlerEnveloppe` tourne hors du fil
 * principal ; la Planche le relance à la fin de chaque opération (avec un court délai) et ne garde que le dernier
 * résultat. Rien n'est modifié dans le modèle.
 */
import { controlerEnveloppe, type Modele, type ResultatControleEnveloppe } from "@parcours/sandbox-planche-model";

export interface DemandeControleEnveloppe {
  readonly n: number;
  readonly modele: Modele;
}
export type MessageControleEnveloppe = { readonly n: number; readonly resultat: ResultatControleEnveloppe; readonly ms: number } | { readonly n: number; readonly erreur: string };

const porte = self as unknown as { onmessage: ((e: MessageEvent<DemandeControleEnveloppe>) => void) | null; postMessage(m: MessageControleEnveloppe): void };

porte.onmessage = (e) => {
  const { n, modele } = e.data;
  try {
    const t0 = performance.now();
    const resultat = controlerEnveloppe(modele);
    porte.postMessage({ n, resultat, ms: performance.now() - t0 });
  } catch (err) {
    porte.postMessage({ n, erreur: err instanceof Error ? err.message : String(err) });
  }
};
