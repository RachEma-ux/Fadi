/**
 * Client API · Atelier natif actuel — magasin du moteur extrait du prototype (`design.v13.*`), niveaux et objets. À supprimer au lot 4 (bascule, cahier des charges §5.5).
 * Code déplacé de `lib/api.ts` (L0.5) ; réexporté par `lib/api/index.ts` (objet `api` inchangé).
 */

import { request } from "./http";

export interface Level {
  id: string;
  projectId: string;
  label: string;
  elevation: number;
  position: number;
}

export interface ArchitecturalObjectDto {
  id: string;
  levelId: string;
  kind: string;
  properties: Record<string, unknown>;
  relations: { kind: string; targetId: string }[];
  modelRevision: number;
  createdAt: string;
}

/** Le magasin du moteur de l'Atelier natif : clés `design.v13.*` et leur révision par clé. */
export interface AtelierStore {
  entries: Record<string, unknown>;
  revisions: Record<string, number>;
  modelRevision: number;
}

export const atelierNatifApi = {
  listLevels: (projectId: string) => request<Level[]>(`/projects/${projectId}/levels`),
  createLevel: (projectId: string, label: string, elevation: number, position: number) =>
    request<Level>(`/projects/${projectId}/levels`, {
      method: "POST",
      body: JSON.stringify({ label, elevation, position }),
    }),
  getAtelierStore: (projectId: string) => request<AtelierStore>(`/projects/${projectId}/atelier/store`),
  putAtelierStoreEntry: (projectId: string, key: string, value: unknown, expectedRevision: number | null) =>
    request<{ key: string; revision: number; modelRevision: number }>(`/projects/${projectId}/atelier/store/${encodeURIComponent(key)}`, {
      method: "PUT",
      body: JSON.stringify({ value, expectedRevision }),
    }),
  deleteAtelierStoreEntry: (projectId: string, key: string) =>
    request<void>(`/projects/${projectId}/atelier/store/${encodeURIComponent(key)}`, { method: "DELETE" }),
  listObjects: (projectId: string, levelId: string) =>
    request<ArchitecturalObjectDto[]>(`/projects/${projectId}/levels/${levelId}/objects`),
  createObject: (
    projectId: string,
    levelId: string,
    kind: string,
    properties: Record<string, unknown>,
  ) =>
    request<ArchitecturalObjectDto>(`/projects/${projectId}/levels/${levelId}/objects`, {
      method: "POST",
      body: JSON.stringify({ kind, properties, relations: [] }),
    }),
  deleteObject: (projectId: string, levelId: string, objectId: string) =>
    request<void>(`/projects/${projectId}/levels/${levelId}/objects/${objectId}`, { method: "DELETE" }),
};
