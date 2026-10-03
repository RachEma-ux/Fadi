/**
 * Contrat d'accès aux données du projet — PAS un portage de `window.V14Bridge`.
 *
 * En localisant la définition réelle de `window.V14Bridge` dans le module
 * `designer` décodé, il s'avère que ce n'est pas un module métier comme
 * `V14Geometry` : c'est une façade fine sur `localStorage`. Chacune de ses
 * propriétés délègue à `domainGet`/`domainSet`, qui lisent/écrivent des clés
 * `${APP}.project.${projectId}.${domain}` (voir `projectKey` dans le source) :
 *
 * | Propriété V14Bridge | Implémentation réelle (source) |
 * | --- | --- |
 * | `parcel` | `() => domainGet('nativeParcel', null)` |
 * | `levels` | `() => domainGet('levels', [])` |
 * | `activeLevel` | lit `viewer.activeLevel` (état UI en mémoire) puis retombe sur `levels()` |
 * | `projectId` (`activeId`) | `() => STORE.getItem('<clé active>') \|\| ''` |
 * | `model(id)` (`levelModel`) | `() => domainGet('floorDesign', ...).levels[id]` |
 * | `saveModel(id, m)` | écrit dans `floorDesign` puis appelle `renderViewer()` |
 * | `render` | force un re-rendu du canvas/SVG courant |
 * | `toast` | notification UI éphémère |
 * | `store` | référence directe à `localStorage` |
 * | `capture` | capture d'image de la vue courante (pour les documents) |
 * | `geometry` (`scene`) | reconstruit la scène 3D via `V14Geometry` |
 *
 * Porter cette façade telle quelle en TypeScript « pur » n'aurait aucun sens :
 * ce serait figer dans le nouveau code la dépendance à `localStorage` que la
 * migration (phase 2 du document de proposition) a précisément pour but de
 * remplacer par une API serveur + PostgreSQL/PostGIS.
 *
 * Ce fichier définit donc le CONTRAT fonctionnel que `V14Bridge` remplit
 * aujourd'hui côté client, pour que :
 * 1. Le backend (phase 2) expose une API qui le satisfait.
 * 2. Un adaptateur `LocalStorageProjectRepository` (legacy, à écrire si besoin
 *    d'une période de transition) et un `HttpProjectRepository` (cible) soient
 *    interchangeables derrière la même interface pendant la migration.
 */

import type { Level, Point2 } from "./geometry.js";
import type { FloorDesignLevel, ParcelLike } from "./parcel-geometry.js";

export interface ProjectSummary {
  id: string;
  name?: string;
  /** Numéro de parcelle associé au projet, s'il est connu indépendamment de la parcelle active. */
  parcel?: string;
}

export interface LevelModel {
  walls: unknown[];
  columns: unknown[];
  doors: unknown[];
  windows: unknown[];
  paths: unknown[];
  stairs: unknown[];
}

/**
 * Contrat équivalent à `window.V14Bridge`, débarrassé du couplage localStorage.
 * Les méthodes de lecture sont asynchrones par anticipation de l'implémentation
 * HTTP (phase 2) ; une implémentation locale peut les résoudre immédiatement.
 */
export interface ProjectRepository {
  /** Projet actif — équivalent à `activeId()` + la résolution du projet dans le registre. */
  getActiveProject(): Promise<ProjectSummary | null>;

  /** Parcelle native rattachée au projet actif — équivalent à `V14Bridge.parcel()`. */
  getParcel(): Promise<ParcelLike | null>;

  /** Niveaux du projet actif, non triés — équivalent à `V14Bridge.levels()`. */
  getLevels(): Promise<Level[]>;

  /**
   * Niveau actif. Dans le source, dépend d'un état UI en mémoire (`viewer.activeLevel`)
   * qui retombe sur le niveau de plus basse altitude si l'état est invalide ou absent —
   * ce repli fait partie du contrat, pas un détail d'implémentation à perdre.
   */
  getActiveLevel(): Promise<Level | null>;

  /** Modèle (murs, poteaux, portes, fenêtres, chemins, escaliers) d'un niveau — équivalent à `V14Bridge.model(id)`. */
  getLevelModel(levelId: string): Promise<LevelModel>;

  /** Persiste le modèle d'un niveau — équivalent à `V14Bridge.saveModel(id, m)`, sans le `renderViewer()` couplé à l'UI. */
  saveLevelModel(levelId: string, model: LevelModel): Promise<void>;

  /** Emprise bâtie mémorisée indépendamment de la parcelle — source de repli de `buildingFootprint` (voir `parcel-geometry.ts`). */
  getStoredBuildingFootprint(): Promise<{ vertices?: Point2[] } | null>;

  /** Niveaux de conception (floorDesign), nécessaires pour le dernier repli de `buildingFootprint`. */
  getFloorDesignLevels(): Promise<Record<string, FloorDesignLevel>>;
}

/**
 * Erreur dédiée pour distinguer « pas encore implémenté dans cette phase »
 * d'un bug — à remplacer méthode par méthode au fil de la phase 2, jamais à
 * laisser masquer un échec silencieusement.
 */
export class NotImplementedYetError extends Error {
  constructor(method: keyof ProjectRepository) {
    super(`ProjectRepository.${method} n'est pas encore implémenté — voir project-repository.ts`);
    this.name = "NotImplementedYetError";
  }
}
