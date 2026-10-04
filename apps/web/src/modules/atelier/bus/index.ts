/**
 * Bus local et synchronisation du nouvel Atelier (cahier §5.7, tâche L2.4). Aucun écran ne l'utilise au lot 2.
 *
 * Usage (lot 3a) :
 * ```ts
 * const { stockage } = stockageNavigateur();
 * const bus = new BusAtelier({ projectId, transport: atelierCommandesApi, stockage, joignabilite: joignabiliteNavigateur() });
 * await bus.ouvrir();
 * await bus.executer("Tracer un mur", [{ type: "mur.tracer", params: { … }, cibles: [] }]);
 * <SyncIndicator projectId={projectId} atelier={sourceSynchro(bus)} />
 * <ConflictPanel projectId={projectId} atelier={sourceConflits(bus)} />
 * ```
 */
export { BusAtelier, type ChoixConflit, type OptionsBus, type ResultatExecution, type ResultatResolution, type TransportAtelier } from "./bus";
export { donneesConflit, ecartsObjet, valeurLisible, type DonneesConflit, type EcartChamp, type ObjetEnConflit } from "./conflits";
export { Emetteur } from "./evenements";
export { joignabiliteManuelle, joignabiliteNavigateur, type SourceJoignabilite } from "./joignabilite";
export { stockageMemoire, type StockageFile } from "./stockage";
export { resumeStockageAtelier, stockageDexie, stockageNavigateur, viderModelesAtelier, type ResumeStockageAtelier } from "./stockage-dexie";
export { conflitAffiche, sourceConflits, sourceSynchro } from "./adaptateurs";
export type * from "./types";
