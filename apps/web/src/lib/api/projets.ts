/**
 * Client API · Projets et sources — projets, copies et archives, exemples, sources des étapes, parcelles de l'outil Parcelle.
 * Code déplacé de `lib/api.ts` (L0.5) ; réexporté par `lib/api/index.ts` (objet `api` inchangé).
 */

import { ApiError, request } from "./http";
import type { EditingLock, ProjectRole } from "./collaboration";

export interface Project {
  id: string;
  ownerId: string;
  code: string;
  name: string;
  modelRevision: number;
  /** Provenance d'un exemple importé (jamais effacée) et son mode : référence protégée ou copie de travail. */
  sourceExampleId?: string | null;
  exampleMode?: "reference" | "editable" | null;
  /** Votre rôle sur ce projet, décidé par le serveur à chaque requête (`proprietaire` pour vos projets). */
  role?: ProjectRole;
  /** Adresse du propriétaire (liste des projets : distingue les projets partagés). */
  ownerEmail?: string;
  /** Réservation d'édition en cours (verrou optionnel « un seul éditeur actif »), null si libre ou expirée. */
  editingLock?: EditingLock | null;
  /** « Documents de base intégrés » d'un projet issu de l'exemple : les fichiers du prototype retrouvés parmi les sources des étapes. */
  baseDocuments?: { caption: string; files: { id: string; stepNumber: number; name: string; type: string; size: number; note: string }[] } | null;
  createdAt: string;
  updatedAt: string;
}

/** Une pièce jointe d'une étape (« Sources de l'étape »). */
export interface StepFile {
  id: string;
  name: string;
  type: string;
  size: number;
  addedAt: string;
}

/** Résultat de « Importer projet JSON » : les projets créés (une base V5 peut en contenir plusieurs) et leurs réserves. */
export interface ImportedProjects {
  projects: { id: string; code: string; name: string; origin: "fadi" | "parcours-v7" | "parcours-v6" | "parcours-v5"; warnings: string[] }[];
}

export interface ParcoursExample {
  id: string;
  kind: "exemple-complet" | "archive";
  name: string;
  summary: string;
  stepsWithContent: number;
  documentedDecisions: number;
}

export interface ParcelFileMeta {
  id: string;
  number: number;
  parcelNumber: string;
  sourceFilename: string;
  name: string;
  crs: string;
  revision: number;
  updated_at: string;
  area: number | null;
  perimeter: number | null;
  boundaryCount: number;
}

export interface ParcelSummary {
  name: string;
  crs: string;
  parcelNumber: string;
  area: number | null;
  perimeter: number | null;
  boundaryCount: number;
}

export interface ParcelTransmission {
  status: "linked" | "incomplete" | "invalid" | "conflict" | "design-conflict" | "setback-pending";
  reason: string;
  at: string;
  signature: string | null;
  nativeId: string | null;
  parcelId?: string;
  /** La parcelle telle qu'elle a été transmise (mesures dans le plan du CRS). */
  parcel?: ParcelSummary;
}

export const projetsApi = {
  listProjects: () => request<Project[]>("/projects"),
  createProject: (code: string, name: string) =>
    request<Project>("/projects", { method: "POST", body: JSON.stringify({ code, name }) }),
  getProject: (id: string) => request<Project>(`/projects/${id}`),
  deleteProject: (id: string) => request<void>(`/projects/${id}`, { method: "DELETE" }),
  /** Sources de l'étape (pièces jointes) — module Projets et sources. */
  listStepFiles: (projectId: string, stepNumber: number) => request<StepFile[]>(`/projects/${projectId}/steps/${stepNumber}/files`),
  listProjectFiles: (projectId: string) => request<(StepFile & { stepNumber: number })[]>(`/projects/${projectId}/files`),
  uploadStepFile: async (projectId: string, stepNumber: number, file: File): Promise<StepFile> => {
    // Octets bruts + nom et type dans les en-têtes : aucun fichier n'est interprété par le serveur.
    const res = await fetch(`/projects/${projectId}/steps/${stepNumber}/files`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/octet-stream", "X-File-Name": encodeURIComponent(file.name), "X-File-Type": file.type || "application/octet-stream" },
      body: file,
    });
    const body: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const code = (body && typeof body === "object" && "error" in body ? String((body as { error: unknown }).error) : null) ?? `http_${res.status}`;
      throw new ApiError(res.status, code, res.status === 413 ? "Fichier trop volumineux (25 Mo maximum)." : null, body);
    }
    return (body as { file: StepFile }).file;
  },
  stepFileUrl: (projectId: string, stepNumber: number, fileId: string) => `/projects/${projectId}/steps/${stepNumber}/files/${encodeURIComponent(fileId)}`,
  deleteStepFile: (projectId: string, stepNumber: number, fileId: string) => request<void>(`/projects/${projectId}/steps/${stepNumber}/files/${encodeURIComponent(fileId)}`, { method: "DELETE" }),
  /** « Essayer une autre répartition en copie » (`copy()` de l'exemple résolu) : un nouveau projet modifiable, la référence intacte. */
  copyProject: (projectId: string, name?: string) =>
    request<{ id: string; code: string; name: string; warnings: string[] }>(`/projects/${projectId}/copies`, { method: "POST", body: JSON.stringify(name ? { name } : {}) }),
  /** « Sauvegarder projet JSON » (`Parcours_V7_<nom>.json`). */
  projectArchiveUrl: (projectId: string) => `/projects/${projectId}/archive`,
  /** « Importer projet JSON » : archive Fadi ou export du logiciel existant (Parcours V6 / V7, base V5) → nouveaux projets. */
  importProjectArchive: async (file: File): Promise<ImportedProjects> => {
    const res = await fetch("/projects/import", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: file });
    const body: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const code = (body && typeof body === "object" && "error" in body ? String((body as { error: unknown }).error) : null) ?? `http_${res.status}`;
      const message = body && typeof body === "object" && "message" in body ? String((body as { message: unknown }).message) : null;
      throw new ApiError(res.status, code, message, body);
    }
    return body as ImportedProjects;
  },
  listParcels: (projectId: string) => request<{ files: ParcelFileMeta[]; initialized: boolean; transmission: ParcelTransmission | null }>(`/projects/${projectId}/parcels`),
  /** Transmet la parcelle capturée dans l'outil (ou, sans `data`, le fichier enregistré) au modèle ; `keepalive` pour la transmission avant de quitter l'étape. */
  transmitParcel: (projectId: string, parcelId: string, data?: unknown) => {
    const body = JSON.stringify(data === undefined ? {} : { data });
    // `keepalive` est plafonné à 64 ko par les navigateurs (même seuil que l'outil Parcelle).
    return request<{ transmission: ParcelTransmission }>(`/projects/${projectId}/parcels/${encodeURIComponent(parcelId)}/transmit`, { method: "POST", body, keepalive: body.length < 60000 });
  },
  listExamples: () => request<ParcoursExample[]>("/examples"),
  importExample: (exampleId: string) =>
    request<Project>(`/examples/${exampleId}/import`, { method: "POST" }),
};
