/// <reference lib="webworker" />
/**
 * Noyau exact de Studio hors du fil principal (lot F2, D-177) : OCCT compilé en WebAssembly (`@parcours/geometry-exact`),
 * chargé À LA DEMANDE dans ce Worker — à l'activation de l'outil « Booléen exact », jamais à l'ouverture de Studio. Le
 * binaire `.wasm` (composant LGPL) est un fichier séparé servi par sa propre URL, remplaçable par l'utilisateur
 * (`localStorage["fadi.occt.wasm"]`, transmis à chaque demande). Une seule instance du noyau par Worker
 * (`MoteurExact.charger` partagé) ; même code que le serveur, qui recalcule et fait autorité.
 *
 * Suivi WASM (EX-062) : à chaque réponse, le Worker joint le nombre d'instances compilées et, après le premier
 * chargement, la taille transférée du `.wasm` (Resource Timing du Worker : octets transférés, encodés, décodés).
 */
import { ErreurExacte, MoteurExact } from "@parcours/geometry-exact";
import wasmUrl from "occt-wasm/dist/occt-wasm.wasm?url";

export type DemandeNoyauExact =
  | { id: number; nature: "charger"; wasm?: string }
  | { id: number; nature: "operation"; op: unknown; wasm?: string };

export interface SuiviWasm {
  /** Instances du noyau compilées dans ce Worker (1 attendue). */
  instances: number;
  /**
   * Fichier `.wasm` chargé et ses tailles, octets (null : non évalué, Resource Timing absent) : `transfere` (en-têtes
   * compris ; 0 quand un service worker ou le cache le servent), `encode` (corps reçu, compressé s'il l'est), `decode`.
   */
  wasm: { url: string; transfere: number; encode: number; decode: number } | null;
  /** Durée du premier chargement (téléchargement, compilation, initialisation), ms. */
  chargementMs: number | null;
  /**
   * Allocations WebAssembly (EX-062) : taille de la mémoire linéaire du noyau après le dernier calcul, octets
   * (`WebAssembly.Memory.buffer.byteLength`) ; null : non évaluée. Facultatif (anciens messages).
   */
  memoireWasm?: number | null;
}

export type ReponseNoyauExact = { id: number; valeur?: unknown; erreur?: string; suivi: SuiviWasm };

const portee = self as unknown as DedicatedWorkerGlobalScope;
let moteur: Promise<MoteurExact> | null = null;
let chargementMs: number | null = null;

function charger(wasm?: string): Promise<MoteurExact> {
  if (!moteur) {
    const debut = performance.now();
    moteur = MoteurExact.charger({ wasm: wasm || wasmUrl }).then((m) => { chargementMs = performance.now() - debut; return m; }, (e) => { moteur = null; throw e; });
  }
  return moteur;
}

function suivi(): SuiviWasm {
  let wasm: SuiviWasm["wasm"] = null;
  try {
    const e = (performance.getEntriesByType("resource") as PerformanceResourceTiming[]).filter((r) => /\.wasm(\?|$)/.test(r.name)).pop();
    if (e) wasm = { url: new URL(e.name).pathname, transfere: e.transferSize, encode: e.encodedBodySize, decode: e.decodedBodySize };
  } catch { /* Resource Timing indisponible : non évalué */ }
  return { instances: MoteurExact.instancesCreees, wasm, chargementMs, memoireWasm: MoteurExact.memoireWasmOctets() };
}

portee.onmessage = async (e: MessageEvent<DemandeNoyauExact>) => {
  const d = e.data;
  try {
    const M = await charger(d.wasm);
    const valeur = d.nature === "charger" ? { pret: true } : M.executer(d.op);
    portee.postMessage({ id: d.id, valeur, suivi: suivi() } satisfies ReponseNoyauExact);
  } catch (err) {
    portee.postMessage({ id: d.id, erreur: err instanceof ErreurExacte ? err.message : err instanceof Error ? err.message : String(err), suivi: suivi() } satisfies ReponseNoyauExact);
  }
};
