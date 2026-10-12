import { createHash } from "node:crypto";

/** Dates et provenance disponibles, sans reconstituer un auteur ou un changement absent des données. */
export interface RevisionEvent {
  at: string;
  kind: string;
  label: string;
  detail: string;
  stepNumber: number | null;
  revision: number | null;
  id?: string;
  authorId?: string | null;
  authorLabel?: string | null;
  source?: "snapshot" | "record" | "ledger";
}

export interface HistoryProject {
  id: string;
  code: string;
  name: string;
}

export interface HistoryEvent extends RevisionEvent {
  id: string;
  authorId: string | null;
  authorLabel: string | null;
  source: "snapshot" | "record" | "ledger";
  project: HistoryProject;
}

export const HISTORY_LIMIT = 300;
export const HISTORY_COMMAND_LIMIT = 50;

/** Date normalisée et identifiant stable : un filtre ne dépend ni du fuseau enregistré, ni de l'ordre des lignes. */
export function historyEvent(event: RevisionEvent, project: HistoryProject): HistoryEvent | null {
  const timestamp = Date.parse(event.at);
  if (!Number.isFinite(timestamp)) return null;
  const at = new Date(timestamp).toISOString();
  const fingerprint = createHash("sha256").update(JSON.stringify([at, event.kind, event.label, event.detail, event.stepNumber, event.revision])).digest("hex").slice(0, 24);
  const authorId = event.authorId?.trim() || null;
  return {
    ...event,
    at,
    id: `${project.id}:${event.id ?? fingerprint}`,
    // Le responsable d'une proposition et le propriétaire actuel ne sont pas son auteur.
    authorId,
    authorLabel: authorId ? event.authorLabel?.trim() || authorId : null,
    source: event.source ?? "snapshot",
    project: { id: project.id, code: project.code, name: project.name },
  };
}

export function latestHistory(events: HistoryEvent[], limit = HISTORY_LIMIT): { events: HistoryEvent[]; truncated: boolean } {
  const distinct = [...new Map(events.map((event) => [event.id, event])).values()];
  distinct.sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id));
  return { events: distinct.slice(0, limit), truncated: distinct.length > limit };
}
