/**
 * Noyau exact de la session Studio (lot F2) : le client unique (`client-exact.ts`) sur le Worker dédié, et son
 * ordonnanceur de tâches (IF-003 ③ : soumission au gestionnaire de tâches). Ce module est importé **à la demande** par
 * le chargeur du moteur `noyau-exact` (`chargement/ressources-studio.ts`) et par le panneau du booléen, jamais par la
 * coquille ni la planche : ouvrir Studio ne charge ni ce code, ni le Worker, ni le `.wasm`.
 *
 * - Ordonnanceur à **un** emplacement (une seule instance du noyau, OCCT calcule de façon synchrone) et **sans
 *   reprise automatique** : une panne rend la tâche `failed` (message), la relance est explicite.
 * - Suivi (EX-062, PERF-07) : durée de chargement et de chaque calcul, taille transférée du `.wasm`, instances
 *   compilées, mémoire du tas après chaque calcul (`perf.ts`) ; exposé à la recette par `globalThis.__fadiExact`.
 */
import { echantillonMemoire, perfStudio } from "../chargement/perf";
import { ressourcesStudio } from "../chargement/ressources-studio";
import { ErreurTache, Ordonnanceur, type EvenementTache } from "../taches/ordonnanceur";
import { CLE_WASM_OCCT, DELAI_OPERATION_EXACT_MS, NoyauExactStudio } from "./client-exact";

function wasmRemplace(): string | undefined {
  try { return localStorage.getItem(CLE_WASM_OCCT) ?? undefined; } catch { return undefined; }
}

export const noyauExactStudio = new NoyauExactStudio({
  creerWorker: () => {
    const w = new Worker(new URL("./noyau-exact.worker.ts", import.meta.url), { type: "module", name: "fadi-studio-noyau-exact" });
    return w as unknown as import("./client-exact").WorkerExact;
  },
  wasm: wasmRemplace,
});

const TAILLE_JOURNAL = 200;
export const journalExact: EvenementTache[] = [];

let ordonnanceur: Ordonnanceur | null = null;
/** Ordonnanceur des tâches exactes : un emplacement, aucune reprise automatique (TEST-015 : relance explicite). */
export function ordonnanceurExact(): Ordonnanceur {
  return (ordonnanceur ??= new Ordonnanceur({
    concurrence: 1, reprisesMax: 0, delaiMs: DELAI_OPERATION_EXACT_MS,
    surEvenement: (e) => { journalExact.push(e); if (journalExact.length > TAILLE_JOURNAL) journalExact.splice(0, journalExact.length - TAILLE_JOURNAL); },
    executer: async ({ charge, signal, delaiMs }) => {
      const fin = ressourcesStudio.utiliser("noyau-exact", "tache:booleen");
      const mesure = perfStudio.debut("PERF-07", { nature: "booleen" });
      try {
        const r = await noyauExactStudio.executer((charge as { entrees: unknown }).entrees, { signal, delaiMs });
        mesure.fin({ issue: "aboutie" });
        return r;
      } catch (e) {
        mesure.fin({ issue: e instanceof ErreurTache ? e.code : "calcul" });
        throw e;
      } finally {
        fin();
        echantillonMemoire("exact:booleen");
      }
    },
  }));
}

/** Charge le noyau (moteur `noyau-exact` du gestionnaire des ressources) et relève la durée et la taille transférée. */
export async function chargerNoyauExactStudio(): Promise<void> {
  const deja = noyauExactStudio.metriques().chargements;
  await noyauExactStudio.charger();
  const m = noyauExactStudio.metriques();
  if (m.chargements > deja && m.suivi) {
    if (m.suivi.chargementMs !== null) perfStudio.enregistrer("PERF-07", m.suivi.chargementMs, "ms", { nature: "chargement" });
    // Taille compressée reçue (corps encodé) ; les octets transférés valent 0 quand le service worker ou le cache servent le fichier.
    if (m.suivi.wasm) {
      perfStudio.enregistrer("PERF-07", m.suivi.wasm.encode, "octets", { nature: "wasm-recu" });
      perfStudio.enregistrer("PERF-07", m.suivi.wasm.transfere, "octets", { nature: "wasm-transfere" });
    }
    perfStudio.enregistrer("PERF-07", m.suivi.instances, "nombre", { nature: "instances" });
  }
}

(globalThis as { __fadiExact?: unknown }).__fadiExact = {
  metriques: () => noyauExactStudio.metriques(),
  journal: journalExact,
  /** Coupure du Worker comme une panne (recette TEST-015) ; rien n'est relancé. */
  interrompre: () => noyauExactStudio.interrompre(),
};
