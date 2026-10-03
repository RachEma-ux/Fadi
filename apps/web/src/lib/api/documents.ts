/**
 * Client API · Documents — catalogue des documents productibles, exports de dessins enregistrés, adresses des documents produits par le serveur.
 * Code déplacé de `lib/api.ts` (L0.5) ; réexporté par `lib/api/index.ts` (objet `api` inchangé).
 */

import { ApiError, request } from "./http";

/** Module Documents : un document productible, sa dernière production et son actualité. */
export interface DocumentDescriptor {
  kind: string;
  group: "harmonie" | "bilan" | "dessins" | "tableaux" | "exemple" | "archive";
  label: string;
  fileName: string;
  href: string;
  stepNumber: number | null;
  current: { modelRevision: number; inputHash: string };
  produced: { producedAt: string; modelRevision: number; inputHash: string; count: number } | null;
  freshness: "a-jour" | "perime" | null;
}

export interface DrawingExportRecord {
  id: string;
  kind: string;
  fileName: string;
  size: number;
  levelId: string | null;
  levelName: string | null;
  modelRevision: number;
  nativeHash: string;
  createdAt: string;
}

export interface DocumentsView {
  modelRevision: number;
  nativeHash: string;
  computedAt: string;
  documents: DocumentDescriptor[];
}

export const documentsApi = {
  /** Dessin technique / export de l'Atelier enregistré au catalogue des documents (niveau, vue, révision du modèle stampés par le serveur). */
  registerDrawingExport: async (projectId: string, input: { blob: Blob; fileName: string; kind: string; levelId: string | null; levelName: string | null; view: Record<string, unknown> }): Promise<DrawingExportRecord> => {
    const res = await fetch(`/projects/${projectId}/documents/dessins`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/octet-stream",
        "X-File-Name": encodeURIComponent(input.fileName),
        "X-File-Type": input.blob.type || "application/octet-stream",
        "X-Export-Kind": input.kind,
        ...(input.levelId ? { "X-Export-Level": encodeURIComponent(input.levelId) } : {}),
        ...(input.levelName ? { "X-Export-Level-Name": encodeURIComponent(input.levelName) } : {}),
        "X-Export-View": encodeURIComponent(JSON.stringify(input.view)),
      },
      body: input.blob,
    });
    const body: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const code = (body && typeof body === "object" && "error" in body ? String((body as { error: unknown }).error) : null) ?? `http_${res.status}`;
      throw new ApiError(res.status, code, null, body);
    }
    return body as DrawingExportRecord;
  },
  deleteDrawingExport: (projectId: string, exportId: string) => request<void>(`/projects/${projectId}/documents/dessins/${encodeURIComponent(exportId)}`, { method: "DELETE" }),
  getDocuments: (projectId: string) => request<DocumentsView>(`/projects/${projectId}/documents`),
  /** Documents produits par le serveur (production enregistrée) : plan de lecture d'un niveau, tableau des surfaces, programme, fiches de l'exemple. */
  documentUrl: (projectId: string, doc: "surfaces" | "programme" | "fiches" | "dossier-exemple") => `/projects/${projectId}/documents/${doc}`,
  /** « Dossier complet de l’exemple » (`fullReport` de p118-resolved-app, `P118_Exemple_Resolu_V8_19.html`) — projets issus de l'exemple P.118. */
  exampleReportUrl: (projectId: string) => `/projects/${projectId}/documents/dossier-exemple`,
  planUrl: (projectId: string, levelId: string) => `/projects/${projectId}/documents/plan/${encodeURIComponent(levelId)}`,
};
