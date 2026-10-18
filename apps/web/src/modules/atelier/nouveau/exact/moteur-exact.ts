/**
 * Client du noyau exact (P2-1) : un Worker chargé au premier besoin (jamais à l'ouverture), demandes numérotées ;
 * sans Worker (tests, navigateur ancien) le noyau est « indisponible » et l'outil le dit.
 *
 * Reprise (#173) : une erreur fatale du Worker, une réponse illisible ou une demande restée sans réponse au-delà de
 * son délai rejettent toutes les demandes en cours et arrêtent ce Worker ; la demande suivante en crée un nouveau.
 * OCCT calcule de façon synchrone dans le Worker : une demande bloquée ne s'annule pas, seul l'arrêt du Worker
 * la libère. Après `ECHECS_MAX` échecs consécutifs sans aucune réponse réussie, le noyau reste indisponible pour la
 * session (rechargement de la page), pour ne pas relancer sans fin un binaire défaillant.
 */
import type { SolideExact } from "@parcours/geometry-exact";
import type { DemandeExacte } from "./exact.worker";

export const CLE_WASM_OCCT = "fadi.occt.wasm";
type SansId<T> = T extends unknown ? Omit<T, "id"> : never;

/** Délai d'un premier chargement (téléchargement et compilation du `.wasm`) — borne de sûreté choisie par Fadi, pas une mesure. */
export const DELAI_CHARGEMENT_MS = 300_000;
/** Délai d'une opération ou d'un export STEP — borne de sûreté choisie par Fadi, pas une mesure de performance. */
export const DELAI_OPERATION_MS = 120_000;
/** Échecs consécutifs du Worker tolérés avant de le déclarer indisponible pour la session. */
export const ECHECS_MAX = 3;

/** `undefined` : à créer à la prochaine demande ; `null` : indisponible pour la session. */
let fil: Worker | null | undefined;
let raisonIndisponible = "Noyau exact indisponible dans ce navigateur (Web Worker requis).";
let echecsConsecutifs = 0;
let suivant = 1;
let etat: "absent" | "chargement" | "ok" | "echec" = "absent";
const enAttente = new Map<number, { resoudre: (v: unknown) => void; rejeter: (e: Error) => void; minuteur: ReturnType<typeof setTimeout> }>();
const abonnes = new Set<(e: typeof etat) => void>();
const changer = (e: typeof etat) => { etat = e; for (const a of abonnes) a(e); };

/** État du noyau exact : absent (pas encore demandé), chargement, ok, échec. */
export const etatNoyauExact = () => etat;
export function surNoyauExact(f: (e: typeof etat) => void): () => void { abonnes.add(f); return () => abonnes.delete(f); }

function wasmRemplace(): string | undefined {
  try { return localStorage.getItem(CLE_WASM_OCCT) ?? undefined; } catch { return undefined; }
}

/** Arrête le Worker courant, rejette toutes ses demandes et décide s'il pourra être recréé. */
function abandonner(motif: string): void {
  for (const [, p] of enAttente) { clearTimeout(p.minuteur); p.rejeter(new Error(motif)); }
  enAttente.clear();
  fil?.terminate();
  echecsConsecutifs += 1;
  if (echecsConsecutifs >= ECHECS_MAX) {
    fil = null;
    raisonIndisponible = "Noyau exact indisponible : trois échecs consécutifs du calcul ; rechargez la page pour réessayer.";
  } else {
    fil = undefined;
  }
  changer("echec");
}

function obtenirFil(): Worker | null {
  if (fil !== undefined) return fil;
  if (typeof Worker === "undefined") {
    fil = null;
    changer("echec");
    return null;
  }
  let w: Worker;
  try {
    w = new Worker(new URL("./exact.worker.ts", import.meta.url), { type: "module", name: "fadi-noyau-exact" });
  } catch {
    abandonner("Noyau exact indisponible : le calcul n'a pas pu démarrer.");
    return fil ?? null;
  }
  // Un Worker arrêté ne doit plus rien résoudre ni rejeter : chaque écouteur vérifie qu'il est toujours le Worker courant.
  w.addEventListener("message", (e: MessageEvent<{ id: number; valeur?: unknown; erreur?: string }>) => {
    if (fil !== w) return;
    const p = enAttente.get(e.data.id);
    if (!p) return;
    enAttente.delete(e.data.id);
    clearTimeout(p.minuteur);
    // Une réponse, même une erreur de calcul, prouve que le Worker vit : le compteur d'échecs repart de zéro.
    echecsConsecutifs = 0;
    if (e.data.erreur !== undefined) p.rejeter(new Error(e.data.erreur));
    else {
      if (etat === "echec") changer("ok");
      p.resoudre(e.data.valeur);
    }
  });
  w.addEventListener("error", () => { if (fil === w) abandonner("Noyau exact interrompu ; il sera relancé à la prochaine demande."); });
  w.addEventListener("messageerror", () => { if (fil === w) abandonner("Réponse illisible du noyau exact ; il sera relancé à la prochaine demande."); });
  fil = w;
  return w;
}

function demander<T>(d: SansId<DemandeExacte>, delai = DELAI_OPERATION_MS): Promise<T> {
  const w = obtenirFil();
  if (!w) return Promise.reject(new Error(raisonIndisponible));
  const id = suivant++;
  return new Promise<T>((resoudre, rejeter) => {
    const minuteur = setTimeout(() => {
      if (fil === w && enAttente.has(id)) abandonner("Le noyau exact n'a pas répondu à temps ; il sera relancé à la prochaine demande.");
    }, delai);
    enAttente.set(id, { resoudre: resoudre as (v: unknown) => void, rejeter, minuteur });
    w.postMessage({ ...d, id, wasm: wasmRemplace() });
  });
}

/** Charge le noyau (une fois) ; appelé au premier choix de l'outil « Solide exact », jamais à l'ouverture. */
export async function chargerNoyauExact(): Promise<void> {
  if (etat === "ok" || etat === "chargement") return;
  changer("chargement");
  try {
    await demander<{ pret: boolean }>({ nature: "charger" }, DELAI_CHARGEMENT_MS);
    changer("ok");
  } catch (err) {
    changer("echec");
    throw err;
  }
}

/** Aperçu d'une opération : même noyau que le serveur, même empreinte attendue. */
export const apercuExact = (op: unknown): Promise<SolideExact> => demander<SolideExact>({ nature: "operation", op });

/** STEP d'un brep posé, calculé dans le navigateur (le serveur en produit un identique par sa route). */
export const stepExact = (brep: string, pose?: { x: number; y: number; angleDeg: number }): Promise<string> => demander<string>(pose ? { nature: "step", brep, pose } : { nature: "step", brep });
