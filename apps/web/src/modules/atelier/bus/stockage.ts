/**
 * Stockage de la file du bus (interface injectable) : entrées de file par projet, dans l'ordre, et dernier
 * modèle confirmé. Implémentations : `stockageMemoire` (tests, navigateur sans IndexedDB) et
 * `stockageNavigateur` (Dexie, `stockage-dexie.ts`).
 */
import type { EntreeFile, ModeleEnCache } from "./types";

export interface StockageFile {
  /** Entrées du projet, triées par `ordre` croissant. */
  lister(projectId: string): Promise<EntreeFile[]>;
  /** Ajoute ou remplace (clé : `requestId`). */
  ecrire(entree: EntreeFile): Promise<void>;
  supprimer(requestId: string): Promise<void>;
  lireModele(projectId: string): Promise<ModeleEnCache | null>;
  ecrireModele(modele: ModeleEnCache): Promise<void>;
}

/** Copie profonde (même sémantique qu'IndexedDB : clone structuré, pas de référence partagée). */
const cloner = <T>(v: T): T => structuredClone(v);

export function stockageMemoire(): StockageFile & { readonly entrees: Map<string, EntreeFile> } {
  const entrees = new Map<string, EntreeFile>();
  const modeles = new Map<string, ModeleEnCache>();
  return {
    entrees,
    lister: async (projectId) => [...entrees.values()].filter((e) => e.projectId === projectId).sort((a, b) => a.ordre - b.ordre).map(cloner),
    ecrire: async (entree) => {
      entrees.set(entree.requestId, cloner(entree));
    },
    supprimer: async (requestId) => {
      entrees.delete(requestId);
    },
    lireModele: async (projectId) => {
      const m = modeles.get(projectId);
      return m ? cloner(m) : null;
    },
    ecrireModele: async (m) => {
      modeles.set(m.projectId, cloner(m));
    },
  };
}
