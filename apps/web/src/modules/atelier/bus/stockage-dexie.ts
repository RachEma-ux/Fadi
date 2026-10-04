/**
 * Stockage IndexedDB (Dexie) de la file du bus du nouvel Atelier.
 *
 * Base `fadi-atelier`, distincte de `fadi-local` (`lib/local-store.ts`, cache des requêtes) : tables `file`
 * (clé `requestId`, index `projectId`) et `modeles` (clé `projectId`). La file de l'ancien Atelier a disparu
 * avec lui à la bascule (lot 4, D-053) ; la page Paramètres lit et vide celle-ci (`resumeStockageAtelier`).
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

/** Page Paramètres : écritures de l'Atelier en attente (tous projets, par projet) et modèles mis en cache. */
export interface ResumeStockageAtelier {
  readonly disponible: boolean;
  readonly enAttente: number;
  readonly enAttenteParProjet: Readonly<Record<string, number>>;
  readonly modeles: number;
}

export async function resumeStockageAtelier(): Promise<ResumeStockageAtelier> {
  try {
    if (typeof indexedDB === "undefined") throw new Error("IndexedDB indisponible");
    const base = new BaseAtelier();
    try {
      const file = await base.file.toArray();
      const enAttenteParProjet: Record<string, number> = {};
      for (const e of file) enAttenteParProjet[e.projectId] = (enAttenteParProjet[e.projectId] ?? 0) + 1;
      return { disponible: true, enAttente: file.length, enAttenteParProjet, modeles: await base.modeles.count() };
    } finally {
      base.close();
    }
  } catch {
    return { disponible: false, enAttente: 0, enAttenteParProjet: {}, modeles: 0 };
  }
}

/** « Vider les caches locaux » : les modèles mis en cache seulement ; la file des écritures n'est jamais vidée ici. */
export async function viderModelesAtelier(): Promise<void> {
  try {
    if (typeof indexedDB === "undefined") return;
    const base = new BaseAtelier();
    try {
      await base.modeles.clear();
    } finally {
      base.close();
    }
  } catch {
    /* IndexedDB inutilisable : rien à vider */
  }
}
