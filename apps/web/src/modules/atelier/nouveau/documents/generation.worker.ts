/// <reference lib="webworker" />
/**
 * Génération des documents hors du fil principal : vues (plans, coupes, façades) et feuilles sont calculées ici par
 * le même code pur que sur le serveur, pour que l'interface reste réactive pendant une façade de grand modèle.
 */
import { composerFeuille, genererVue, type ModeleAtelier, type ParamsFeuille, type ParamsVue, type Projet } from "@parcours/atelier-model";

export type DemandeGeneration =
  | { id: number; nature: "vue"; etat: ModeleAtelier; params: ParamsVue; definitionId: string }
  | { id: number; nature: "feuille"; etat: ModeleAtelier; params: ParamsFeuille; revision: number; projet: Projet; definitionId: string };

const portee = self as unknown as DedicatedWorkerGlobalScope;

portee.onmessage = (e: MessageEvent<DemandeGeneration>) => {
  const d = e.data;
  try {
    const valeur = d.nature === "vue" ? genererVue(d.etat, d.params, d.definitionId) : composerFeuille(d.etat, d.params, d.revision, d.projet, d.definitionId);
    portee.postMessage({ id: d.id, valeur });
  } catch (err) {
    portee.postMessage({ id: d.id, erreur: err instanceof Error ? err.message : String(err) });
  }
};
