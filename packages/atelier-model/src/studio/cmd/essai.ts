/**
 * Appel d'essai (prévisualisation, EX-045) : un essai est calculé sur une révision de base et ne vaut que pour elle.
 * Un résultat d'essai reçu quand la révision courante a changé (R12 calculé, R13 courante) est refusé : il n'est ni
 * affiché comme courant ni confirmable ; un essai abandonné n'a aucun effet de référence. Pur.
 */
export type StudioStatutEssai = "en-calcul" | "termine" | "echec" | "abandonne" | "confirme";

export interface StudioResultatEssaiRecu { essaiId: string; baseRevisionId: string; statut: StudioStatutEssai }

export type StudioDecisionEssai =
  | { accepte: true }
  | { accepte: false; motif: "autre-revision" | "abandonne" | "deja-confirme" | "non-termine"; message: string };

export function studioAccepterResultatEssai(revisionCourante: string, r: StudioResultatEssaiRecu): StudioDecisionEssai {
  if (r.baseRevisionId !== revisionCourante) return { accepte: false, motif: "autre-revision", message: `Essai calculé sur la révision ${r.baseRevisionId}, la révision courante est ${revisionCourante} : résultat ignoré.` };
  if (r.statut === "abandonne") return { accepte: false, motif: "abandonne", message: "Prévisualisation abandonnée : aucun effet." };
  if (r.statut === "confirme") return { accepte: false, motif: "deja-confirme", message: "Essai déjà confirmé." };
  if (r.statut !== "termine") return { accepte: false, motif: "non-termine", message: "Essai sans résultat confirmable." };
  return { accepte: true };
}
