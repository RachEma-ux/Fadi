/**
 * Client du noyau exact (P2-1) : un Worker chargé au premier besoin (jamais à l'ouverture), demandes numérotées ;
 * sans Worker (tests, navigateur ancien) le noyau est « indisponible » et l'outil le dit.
 */
import type { SolideExact } from "@parcours/geometry-exact";
import type { DemandeExacte } from "./exact.worker";

export const CLE_WASM_OCCT = "fadi.occt.wasm";
type SansId<T> = T extends unknown ? Omit<T, "id"> : never;

let fil: Worker | null | undefined;
let suivant = 1;
let etat: "absent" | "chargement" | "ok" | "echec" = "absent";
const enAttente = new Map<number, { resoudre: (v: unknown) => void; rejeter: (e: Error) => void }>();
const abonnes = new Set<(e: typeof etat) => void>();
const changer = (e: typeof etat) => { etat = e; for (const a of abonnes) a(e); };

/** État du noyau exact : absent (pas encore demandé), chargement, ok, échec. */
export const etatNoyauExact = () => etat;
export function surNoyauExact(f: (e: typeof etat) => void): () => void { abonnes.add(f); return () => abonnes.delete(f); }

function wasmRemplace(): string | undefined {
  try { return localStorage.getItem(CLE_WASM_OCCT) ?? undefined; } catch { return undefined; }
}

function obtenirFil(): Worker | null {
  if (fil !== undefined) return fil;
  try {
    fil = typeof Worker === "undefined" ? null : new Worker(new URL("./exact.worker.ts", import.meta.url), { type: "module", name: "fadi-noyau-exact" });
    fil?.addEventListener("message", (e: MessageEvent<{ id: number; valeur?: unknown; erreur?: string }>) => {
      const p = enAttente.get(e.data.id);
      if (!p) return;
      enAttente.delete(e.data.id);
      if (e.data.erreur !== undefined) p.rejeter(new Error(e.data.erreur));
      else p.resoudre(e.data.valeur);
    });
    fil?.addEventListener("error", () => {
      for (const [, p] of enAttente) p.rejeter(new Error("noyau exact indisponible"));
      enAttente.clear();
      fil?.terminate();
      fil = null;
      changer("echec");
    });
  } catch {
    fil = null;
  }
  if (!fil) changer("echec");
  return fil;
}

function demander<T>(d: SansId<DemandeExacte>): Promise<T> {
  const w = obtenirFil();
  if (!w) return Promise.reject(new Error("Noyau exact indisponible dans ce navigateur (Web Worker requis)."));
  const id = suivant++;
  return new Promise<T>((resoudre, rejeter) => {
    enAttente.set(id, { resoudre: resoudre as (v: unknown) => void, rejeter });
    w.postMessage({ ...d, id, wasm: wasmRemplace() });
  });
}

/** Charge le noyau (une fois) ; appelé au premier choix de l'outil « Solide exact », jamais à l'ouverture. */
export async function chargerNoyauExact(): Promise<void> {
  if (etat === "ok" || etat === "chargement") return;
  changer("chargement");
  try {
    await demander<{ pret: boolean }>({ nature: "charger" });
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
