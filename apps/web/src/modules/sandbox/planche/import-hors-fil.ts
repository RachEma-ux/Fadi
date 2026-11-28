/**
 * Import hors du fil principal (cas 4, étape 7a, D10-F14-027) : client du travailleur `import-planche.worker.ts`.
 * `lancerImport` rend la progression par rappel, une issue et `annuler` (le travailleur est arrêté : le dessin n'a pas
 * bougé). La borne de l'appareil vient d'un débit mesuré (étalonnage, puis chaque import réel), gardé dans ce navigateur ;
 * elle n'est jamais une valeur fixe du code.
 */
import type { ContenuImporte, FormatImport } from "@parcours/sandbox-planche-model";
import type { DemandeImport, MessageImport } from "./import-planche.worker";

/** Durée de travail visée pour l'import le plus gros accepté, en secondes. */
export const BUDGET_IMPORT_S = 20;
const CLE_DEBIT = "fadi.sandbox.planche.import.debit";

export interface TravailleurImport {
  onmessage: ((e: { data: MessageImport }) => void) | null;
  onerror: ((e: unknown) => void) | null;
  postMessage(m: DemandeImport): void;
  terminate(): void;
}

const creerTravailleur = (): TravailleurImport => new Worker(new URL("./import-planche.worker.ts", import.meta.url), { type: "module", name: "fadi-planche-import" }) as unknown as TravailleurImport;

export interface Debit {
  readonly trianglesParSeconde: number;
  /** Date de la mesure (ISO). */
  readonly mesure: string;
}

export function lireDebit(): Debit | null {
  try {
    const v = JSON.parse(localStorage.getItem(CLE_DEBIT) ?? "null") as Partial<Debit> | null;
    return v && typeof v.trianglesParSeconde === "number" && v.trianglesParSeconde > 0 && typeof v.mesure === "string" ? { trianglesParSeconde: v.trianglesParSeconde, mesure: v.mesure } : null;
  } catch {
    return null;
  }
}

function ecrireDebit(trianglesParSeconde: number): void {
  try {
    localStorage.setItem(CLE_DEBIT, JSON.stringify({ trianglesParSeconde: Math.round(trianglesParSeconde), mesure: new Date().toISOString() }));
  } catch {
    /* stockage indisponible : la mesure sera refaite */
  }
}

/** Borne en triangles pour un débit : budget × débit, arrondie au millier inférieur. */
export const borneImport = (trianglesParSeconde: number): number => Math.max(1000, Math.floor((trianglesParSeconde * BUDGET_IMPORT_S) / 1000) * 1000);

export type IssueImport =
  | { readonly genre: "fini"; readonly contenus: readonly ContenuImporte[]; readonly ignores: number; readonly echelle: number; readonly triangles: number }
  | { readonly genre: "trop-gros"; readonly triangles: number; readonly borne: number }
  | { readonly genre: "erreur"; readonly message: string }
  | { readonly genre: "annule" };

export interface EtatImport {
  readonly phase: "etalonnage" | "lecture" | "insertion";
  readonly fait: number;
  readonly total: number;
  readonly borne: number | null;
  readonly debit: Debit | null;
}

export interface ImportEnCours {
  readonly issue: Promise<IssueImport>;
  readonly annuler: () => void;
}

/** Lance un import ; `pose` (fil principal) est mesurée par l'appelant et rapportée par `noterPose` pour affiner le débit. */
export function lancerImport(
  demande: { readonly format: FormatImport; readonly donnees: string | Uint8Array; readonly echelle: number | null; readonly nom: string },
  suivre: (e: EtatImport) => void,
  o: { readonly creer?: () => TravailleurImport } = {},
): ImportEnCours {
  let finir: (i: IssueImport) => void = () => {};
  const issue = new Promise<IssueImport>((r) => (finir = r));
  let w: TravailleurImport;
  try {
    w = (o.creer ?? creerTravailleur)();
  } catch {
    finir({ genre: "erreur", message: "travailleur indisponible" });
    return { issue, annuler: () => {} };
  }
  let fini = false;
  const clore = (i: IssueImport): void => {
    if (fini) return;
    fini = true;
    w.terminate();
    finir(i);
  };
  let debit = lireDebit();
  let borne = debit ? borneImport(debit.trianglesParSeconde) : null;
  let total = 0;
  const importer = (): void => {
    suivre({ phase: "lecture", fait: 0, total: 0, borne, debit });
    w.postMessage({ genre: "importer", ...demande, borne: borne as number });
  };
  w.onerror = () => clore({ genre: "erreur", message: "travailleur en panne" });
  w.onmessage = (e) => {
    const m = e.data;
    if (m.genre === "etalon") {
      ecrireDebit(m.trianglesParSeconde);
      debit = lireDebit() ?? { trianglesParSeconde: m.trianglesParSeconde, mesure: new Date().toISOString() };
      borne = borneImport(m.trianglesParSeconde);
      importer();
    } else if (m.genre === "lu") {
      total = m.triangles;
      suivre({ phase: "insertion", fait: 0, total, borne, debit });
    } else if (m.genre === "progression") suivre({ phase: "insertion", fait: m.fait, total: m.total, borne, debit });
    else if (m.genre === "trop-gros") clore({ genre: "trop-gros", triangles: m.triangles, borne: m.borne });
    else if (m.genre === "erreur") clore({ genre: "erreur", message: m.message });
    else if (m.genre === "fini") {
      // Débit réel de la construction (la pose en ajoute autant environ : compté par `noterPose`).
      if (total >= 1000 && m.ms > 0) dernierImport = { triangles: total, ms: m.ms };
      clore({ genre: "fini", contenus: m.contenus, ignores: m.ignores, echelle: m.echelle, triangles: total });
    }
  };
  if (borne === null) {
    suivre({ phase: "etalonnage", fait: 0, total: 0, borne, debit });
    w.postMessage({ genre: "etalonner" });
  } else importer();
  return { issue, annuler: () => clore({ genre: "annule" }) };
}

let dernierImport: { triangles: number; ms: number } | null = null;

/** Après la pose d'un import d'au moins 1 000 triangles : le débit gardé devient celui de cet import réel (construction + pose). */
export function noterPose(msPose: number): void {
  if (!dernierImport) return;
  ecrireDebit((dernierImport.triangles / (dernierImport.ms + msPose)) * 1000);
  dernierImport = null;
}
