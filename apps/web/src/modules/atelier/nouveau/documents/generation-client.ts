/**
 * Client du fil de génération des documents : une seule instance, demandes numérotées ; repli dans le fil
 * principal si les workers ne sont pas disponibles (tests, navigateur ancien).
 */
import { composerFeuille, genererVue, type FeuilleComposee, type ModeleAtelier, type OptionsGeneration, type ParamsFeuille, type ParamsVue, type Projet, type VueGeneree } from "@parcours/atelier-model";
import type { DemandeGeneration } from "./generation.worker";

type SansId<T> = T extends unknown ? Omit<T, "id"> : never;

let fil: Worker | null | undefined;
let suivant = 1;
const enAttente = new Map<number, { resoudre: (v: unknown) => void; rejeter: (e: Error) => void }>();

function obtenirFil(): Worker | null {
  if (fil !== undefined) return fil;
  try {
    fil = typeof Worker === "undefined" ? null : new Worker(new URL("./generation.worker.ts", import.meta.url), { type: "module", name: "fadi-documents" });
    fil?.addEventListener("message", (e: MessageEvent<{ id: number; valeur?: unknown; erreur?: string }>) => {
      const p = enAttente.get(e.data.id);
      if (!p) return;
      enAttente.delete(e.data.id);
      if (e.data.erreur !== undefined) p.rejeter(new Error(e.data.erreur));
      else p.resoudre(e.data.valeur);
    });
    fil?.addEventListener("error", () => {
      // Fil indisponible (chargement refusé…) : les demandes en cours et suivantes passent dans le fil principal.
      for (const [, p] of enAttente) p.rejeter(new Error("fil de génération indisponible"));
      enAttente.clear();
      fil?.terminate();
      fil = null;
    });
  } catch {
    fil = null;
  }
  return fil;
}

function demander<T>(d: SansId<DemandeGeneration>, local: () => T): Promise<T> {
  const w = obtenirFil();
  if (!w) return Promise.resolve().then(local);
  const id = suivant++;
  return new Promise<T>((resoudre, rejeter) => {
    enAttente.set(id, { resoudre: resoudre as (v: unknown) => void, rejeter });
    w.postMessage({ ...d, id });
  }).catch((err: unknown) => {
    if (err instanceof Error && err.message === "fil de génération indisponible") return local();
    throw err;
  });
}

export const genererVueHorsFil = (etat: ModeleAtelier, params: ParamsVue, definitionId: string, options: OptionsGeneration = {}): Promise<VueGeneree> =>
  demander({ nature: "vue", etat, params, definitionId, options }, () => genererVue(etat, params, definitionId, options));

export const composerFeuilleHorsFil = (etat: ModeleAtelier, params: ParamsFeuille, revision: number, projet: Projet, definitionId: string, options: OptionsGeneration = {}): Promise<FeuilleComposee> =>
  demander({ nature: "feuille", etat, params, revision, projet, definitionId, options }, () => composerFeuille(etat, params, revision, projet, definitionId, options));
