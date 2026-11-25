/**
 * Extension « Scripts » : lance un script personnel dans son Web Worker (`scripts-planche.worker.ts`) et rend l'issue.
 * Le Worker reçoit une **copie** du modèle ; il est arrêté dès la réponse, ou d'office après `DELAI_SCRIPT_MS` (boucle
 * sans fin). Le modèle rendu est relu comme tout modèle venu d'ailleurs (`lireModelePlanche`) avant d'être proposé au
 * dessin : un script ne peut pas y poser une forme invalide.
 */
import { lireModelePlanche, type ErreurExecutionScript, type Modele } from "@parcours/sandbox-planche-model";
import type { DemandeScript, ReponseScript } from "./scripts-planche.worker";

/** Durée maximale d'un script, en millisecondes. */
export const DELAI_SCRIPT_MS = 5000;

export type IssueScript =
  /** Script terminé : `modele` nul = dessin inchangé (lecture seule, ou erreur — rien n'est gardé d'un script en erreur). */
  | { readonly genre: "fini"; readonly modele: Modele | null; readonly journal: readonly string[]; readonly crees: readonly string[]; readonly erreur: ErreurExecutionScript | null }
  /** Arrêté d'office après le délai. */
  | { readonly genre: "delai" }
  /** Le Worker n'a pas pu démarrer ou a rendu une réponse illisible. */
  | { readonly genre: "panne" }
  /** Arrêté à la demande (bouton Arrêter, panneau fermé). */
  | { readonly genre: "arrete" };

/** Ce que le client attend d'un Worker (injecté dans les tests). */
export interface WorkerScript {
  onmessage: ((e: { data: unknown }) => void) | null;
  onerror: ((e: unknown) => void) | null;
  postMessage(m: DemandeScript): void;
  terminate(): void;
}

export interface ExecutionScript {
  readonly issue: Promise<IssueScript>;
  /** Arrête le script en cours ; sans effet s'il est fini. */
  readonly arreter: () => void;
}

const creerWorkerScripts = (): WorkerScript => new Worker(new URL("./scripts-planche.worker.ts", import.meta.url), { type: "module", name: "fadi-sandbox-scripts" }) as unknown as WorkerScript;

const estTexte = (v: unknown): v is string => typeof v === "string";

/** Relit la réponse du Worker : forme stricte, modèle validé. `null` = réponse illisible. */
export function lireReponseScript(v: unknown): Extract<IssueScript, { genre: "fini" }> | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Partial<ReponseScript>;
  if (!Array.isArray(r.journal) || !r.journal.every(estTexte) || !Array.isArray(r.crees) || !r.crees.every(estTexte)) return null;
  let erreur: ErreurExecutionScript | null = null;
  if (r.erreur !== null) {
    const e = r.erreur as Partial<ErreurExecutionScript> | undefined;
    if (!e || !estTexte(e.cle) || !estTexte(e.message) || !e.args || typeof e.args !== "object" || !Object.values(e.args).every(estTexte) || !(e.ligne === null || (typeof e.ligne === "number" && Number.isInteger(e.ligne)))) return null;
    erreur = { cle: e.cle, args: e.args, message: e.message, ligne: e.ligne };
  }
  let modele: Modele | null = null;
  if (r.modele !== null && !erreur) {
    modele = lireModelePlanche(r.modele);
    if (!modele) return null;
  }
  return { genre: "fini", modele, journal: r.journal, crees: r.crees, erreur };
}

export function lancerScript(demande: DemandeScript, o: { readonly delai?: number; readonly creer?: () => WorkerScript } = {}): ExecutionScript {
  let finir: (i: IssueScript) => void = () => {};
  const issue = new Promise<IssueScript>((resolve) => (finir = resolve));
  let w: WorkerScript;
  try {
    w = (o.creer ?? creerWorkerScripts)();
  } catch {
    finir({ genre: "panne" });
    return { issue, arreter: () => {} };
  }
  let fini = false;
  const clore = (i: IssueScript) => {
    if (fini) return;
    fini = true;
    clearTimeout(minuterie);
    w.terminate();
    finir(i);
  };
  const minuterie = setTimeout(() => clore({ genre: "delai" }), o.delai ?? DELAI_SCRIPT_MS);
  w.onmessage = (e) => clore(lireReponseScript(e.data) ?? { genre: "panne" });
  w.onerror = () => clore({ genre: "panne" });
  try {
    w.postMessage(demande);
  } catch {
    clore({ genre: "panne" });
  }
  return { issue, arreter: () => clore({ genre: "arrete" }) };
}
