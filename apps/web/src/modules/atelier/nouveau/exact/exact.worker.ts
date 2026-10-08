/// <reference lib="webworker" />
/**
 * Noyau exact hors du fil principal (P2-1, D-177) : OCCT en WebAssembly, chargé À LA DEMANDE dans ce Worker — jamais à
 * l'ouverture de l'Atelier. Le binaire `.wasm` est un fichier séparé servi par son URL (composant LGPL remplaçable :
 * l'URL peut être remplacée par `localStorage["fadi.occt.wasm"]`, transmise au premier message). Même code que le
 * serveur (`@parcours/geometry-exact`) : l'aperçu calculé ici porte l'empreinte que le serveur devra retrouver.
 */
import { MoteurExact, ErreurExacte } from "@parcours/geometry-exact";
import wasmUrl from "occt-wasm/dist/occt-wasm.wasm?url";

export type DemandeExacte =
  | { id: number; nature: "operation"; op: unknown; wasm?: string }
  | { id: number; nature: "step"; brep: string; pose?: { x: number; y: number; angleDeg: number }; wasm?: string }
  | { id: number; nature: "charger"; wasm?: string };

const portee = self as unknown as DedicatedWorkerGlobalScope;
let moteur: Promise<MoteurExact> | null = null;
const charger = (wasm?: string) => (moteur ??= MoteurExact.charger({ wasm: wasm || wasmUrl }).catch((e) => { moteur = null; throw e; }));

portee.onmessage = async (e: MessageEvent<DemandeExacte>) => {
  const d = e.data;
  try {
    const M = await charger(d.wasm);
    if (d.nature === "charger") portee.postMessage({ id: d.id, valeur: { pret: true } });
    else if (d.nature === "operation") portee.postMessage({ id: d.id, valeur: M.executer(d.op) });
    else portee.postMessage({ id: d.id, valeur: M.exporterStep(d.brep, d.pose) });
  } catch (err) {
    portee.postMessage({ id: d.id, erreur: err instanceof ErreurExacte ? `${err.message}` : err instanceof Error ? err.message : String(err) });
  }
};
