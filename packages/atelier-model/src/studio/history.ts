import { applyStudioCommands, STUDIO_CONTRACT, StudioValidationError, validateStudioDocument, type StudioCommand, type StudioDocument, type StudioEnvelope } from "./document-2d.js";

/**
 * Historique d'édition local (annuler / rétablir), par instantanés de documents validés : chaque pas est un lot de
 * commandes appliqué tout ou rien, donc annuler rend exactement le document d'avant le lot. Pur et immuable : chaque
 * document conservé est une copie privée gelée. L'historique ne persiste rien ; publier un état annulé reste l'affaire
 * de l'éditeur (nouvelle enveloppe de commandes vers le serveur).
 */
export interface StudioHistory {
  readonly past: readonly StudioDocument[];
  readonly present: StudioDocument;
  readonly future: readonly StudioDocument[];
}
export const STUDIO_HISTORY_LIMIT = 200;

function frozen(document: StudioDocument): StudioDocument {
  const freeze = (value: unknown): void => {
    if (value && typeof value === "object") {
      for (const child of Object.values(value)) freeze(child);
      Object.freeze(value);
    }
  };
  const copy = validateStudioDocument(document);
  freeze(copy);
  return copy;
}

function limit(value: number): number {
  if (!Number.isInteger(value) || value < 1) throw new StudioValidationError("history.limit", "entier positif attendu");
  return value;
}

export function createStudioHistory(document: StudioDocument): StudioHistory {
  return Object.freeze({ past: Object.freeze([]), present: frozen(document), future: Object.freeze([]) });
}

/** Ajoute un état ; le futur est abandonné ; le passé est borné aux `max` derniers états. */
export function recordStudioHistory(history: StudioHistory, next: StudioDocument, max = STUDIO_HISTORY_LIMIT): StudioHistory {
  const past = [...history.past, history.present].slice(-limit(max));
  return Object.freeze({ past: Object.freeze(past), present: frozen(next), future: Object.freeze([]) });
}

/** Applique un lot (tout ou rien) comme un seul pas d'historique ; un lot refusé laisse l'historique intact (exception). */
export function applyToStudioHistory(history: StudioHistory, commands: readonly StudioCommand[], max = STUDIO_HISTORY_LIMIT): StudioHistory {
  return recordStudioHistory(history, applyStudioCommands(history.present, commands), max);
}

export const canUndoStudio = (history: StudioHistory): boolean => history.past.length > 0;
export const canRedoStudio = (history: StudioHistory): boolean => history.future.length > 0;

export function undoStudioHistory(history: StudioHistory): StudioHistory {
  const previous = history.past[history.past.length - 1];
  if (!previous) return history;
  return Object.freeze({ past: Object.freeze(history.past.slice(0, -1)), present: previous, future: Object.freeze([history.present, ...history.future]) });
}

export function redoStudioHistory(history: StudioHistory): StudioHistory {
  const next = history.future[0];
  if (!next) return history;
  return Object.freeze({ past: Object.freeze([...history.past, history.present]), present: next, future: Object.freeze(history.future.slice(1)) });
}

/** Rejoue des enveloppes appliquées depuis un document de base : un pas d'historique par enveloppe. */
export function studioHistoryFromEnvelopes(base: StudioDocument, envelopes: readonly StudioEnvelope[], max = STUDIO_HISTORY_LIMIT): StudioHistory {
  let history = createStudioHistory(base);
  envelopes.forEach((envelope, i) => {
    if (envelope.contractVersion !== STUDIO_CONTRACT) throw new StudioValidationError(`envelopes[${i}].contractVersion`, "contrat non pris en charge");
    history = applyToStudioHistory(history, envelope.commands, max);
  });
  return history;
}
