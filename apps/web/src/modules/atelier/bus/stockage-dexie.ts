/**
 * Stockage IndexedDB (Dexie) de la file du bus du nouvel Atelier.
 *
 * Base distincte de `fadi-local` (`lib/local-store.ts`, file de l'ancien Atelier, inchangée) : `fadi-atelier`,
 * tables `file` (clé `requestId`, index `projectId`) et `modeles` (clé `projectId`). Les deux files coexistent
 * jusqu'à la bascule (lot 4), où l'ancienne disparaît avec l'ancien Atelier.
 *
 * IndexedDB indisponible (navigation privée, quota) : `stockageNavigateur` rend un stockage en mémoire et le
 * signale (`persistant: false`) — la file vit alors le temps de l'onglet, rien n'est écrit en silence ailleurs.
 */
import Dexie, { type EntityTable } from "dexie";
import { stockageMemoire, type StockageFile } from "./stockage";
import type { EntreeFile, ModeleEnCache } from "./types";

class BaseAtelier extends Dexie {
  file!: EntityTable<EntreeFile, "requestId">;
  modeles!: EntityTable<ModeleEnCache, "projectId">;

  constructor() {
    super("fadi-atelier");
    this.version(1).stores({ file: "requestId, projectId", modeles: "projectId" });
  }
}

export function stockageDexie(base: BaseAtelier = new BaseAtelier()): StockageFile {
  return {
    lister: async (projectId) => (await base.file.where("projectId").equals(projectId).toArray()).sort((a, b) => a.ordre - b.ordre),
    ecrire: async (entree) => {
      await base.file.put(entree);
    },
    supprimer: async (requestId) => {
      await base.file.delete(requestId);
    },
    lireModele: async (projectId) => (await base.modeles.get(projectId)) ?? null,
    ecrireModele: async (m) => {
      await base.modeles.put(m);
    },
  };
}

/** Stockage du navigateur : Dexie si IndexedDB est disponible, sinon mémoire (déclaré non persistant). */
export function stockageNavigateur(): { readonly stockage: StockageFile; readonly persistant: boolean } {
  try {
    if (typeof indexedDB !== "undefined") return { stockage: stockageDexie(), persistant: true };
  } catch {
    /* IndexedDB inutilisable : mémoire */
  }
  return { stockage: stockageMemoire(), persistant: false };
}
