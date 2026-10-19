/**
 * Brouillon local d'une variante : document de la tête serveur + lots de commandes non enregistrés. Chaque lot est un
 * pas de l'historique local (`history.ts`, instantanés) ; annuler retire le dernier lot des commandes en attente,
 * rétablir le remet. Rien n'est annulé côté serveur : après un enregistrement, le brouillon repart de la nouvelle tête
 * et l'historique local est vide. Pur : ni React ni DOM.
 */
import {
  applyToStudioHistory, canRedoStudio, canUndoStudio, createStudioHistory, redoStudioHistory, STUDIO_CONTRACT, StudioValidationError,
  undoStudioHistory, type StudioCommand, type StudioDocument, type StudioEnvelope, type StudioHistory,
} from "@parcours/atelier-model";

export interface Brouillon {
  readonly history: StudioHistory;
  /** Lots appliqués depuis la tête serveur, dans l'ordre. */
  readonly pas: readonly (readonly StudioCommand[])[];
  /** Lots annulés, prêts à être rétablis (le plus proche en tête). */
  readonly refaire: readonly (readonly StudioCommand[])[];
  /**
   * Pas déjà partis dans une enveloppe non confirmée (hors ligne) : on peut dessiner par-dessus, pas les annuler.
   * Absent = 0.
   */
  readonly plancher?: number;
}

export function creerBrouillon(document: StudioDocument): Brouillon {
  return { history: createStudioHistory(document), pas: [], refaire: [] };
}

export const documentBrouillon = (b: Brouillon): StudioDocument => b.history.present;

/** Applique un lot tout ou rien ; un lot refusé lève `StudioValidationError` et laisse le brouillon intact. */
export function appliquerBrouillon(b: Brouillon, commandes: readonly StudioCommand[]): Brouillon {
  return { history: applyToStudioHistory(b.history, commandes), pas: [...b.pas, [...commandes]], refaire: [], ...(b.plancher ? { plancher: b.plancher } : {}) };
}

/** Fixe le plancher d'annulation (pas couverts par une enveloppe en attente) ; 0 le retire. */
export function avecPlancher(b: Brouillon, plancher: number): Brouillon {
  const { plancher: _ancien, ...reste } = b;
  return plancher > 0 ? { ...reste, plancher: Math.min(plancher, b.pas.length) } : reste;
}

/** L'historique local est borné (STUDIO_HISTORY_LIMIT) ; les commandes en attente, elles, ne le sont jamais. */
export const peutAnnuler = (b: Brouillon): boolean => canUndoStudio(b.history) && b.pas.length > (b.plancher ?? 0);
export const peutRetablir = (b: Brouillon): boolean => canRedoStudio(b.history) && b.refaire.length > 0;

export function annulerBrouillon(b: Brouillon): Brouillon {
  if (!peutAnnuler(b)) return b;
  return { ...b, history: undoStudioHistory(b.history), pas: b.pas.slice(0, -1), refaire: [b.pas[b.pas.length - 1]!, ...b.refaire] };
}

export function retablirBrouillon(b: Brouillon): Brouillon {
  if (!peutRetablir(b)) return b;
  return { ...b, history: redoStudioHistory(b.history), pas: [...b.pas, b.refaire[0]!], refaire: b.refaire.slice(1) };
}

export const commandesEnAttente = (b: Brouillon): StudioCommand[] => b.pas.flat();

/** Enveloppe d'enregistrement : toutes les commandes en attente, sur la révision de tête chargée. */
export function enveloppeBrouillon(b: Brouillon, baseRevisionId: string, requestId: string): StudioEnvelope {
  return { contractVersion: STUDIO_CONTRACT, requestId, baseRevisionId, commands: commandesEnAttente(b) };
}

/** Message d'interface (français source) pour un refus du modèle ; jamais le message technique brut. */
export function messageRefus(e: unknown): string {
  const m = e instanceof StudioValidationError ? e.message : "";
  if (m.includes("calque cible verrouillé")) return "Le calque actif est verrouillé : rien n’y est placé.";
  if (m.includes("calque verrouillé")) return "Calque verrouillé : modification refusée.";
  if (m.includes("ne se déplace pas seule")) return "Une cote liée suit ses objets : déplacez l’objet coté.";
  if (m.includes("longueur nulle")) return "La cote liée deviendrait de longueur nulle : modification refusée.";
  if (m.includes("deux points distincts")) return "Les deux points doivent être distincts.";
  if (m.includes("décalage impossible")) return "Décalage impossible pour cet objet : rayon ou côté annulé, jonction non tangente ou segment retourné.";
  if (m.includes("contour simple")) return "Une polyligne fermée extrudée doit avoir un contour simple (sans croisement).";
  if (m.includes("l’épaisseur ne s’applique qu’aux lignes et aux arcs")) return "L’épaisseur ne s’applique qu’aux lignes et aux arcs.";
  if (m.includes("sommets consécutifs confondus")) return "Deux sommets consécutifs doivent être distincts.";
  if (m.includes("rayon strictement positif")) return "Le rayon doit être strictement positif.";
  return "Géométrie invalide. Vérifiez les valeurs saisies.";
}
