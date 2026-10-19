/**
 * Révision courante de l'espace de travail (A.5-10, A.5-11) : une réponse lue ou calculée pour une révision n'est
 * appliquée que si l'espace affiche encore exactement ce qu'il affichait quand la lecture est partie — même révision,
 * même brouillon. Une réponse arrivée après un rechargement, un enregistrement ou un autre report décrit un état
 * dépassé : elle est ignorée, jamais substituée à l'état courant. Pur : ni React, ni réseau.
 */
import type { StudioContext } from "../../../lib/api";
import type { Brouillon } from "../planche2d/brouillon";

export function lectureApplicable(revisionDepart: string, contexteAffiche: StudioContext | null, brouillonAffiche: Brouillon | null, brouillonDepart: Brouillon | null): boolean {
  return !!contexteAffiche && contexteAffiche.revision.id === revisionDepart && brouillonAffiche === brouillonDepart;
}

/**
 * Lectures dérivées à relire après un enregistrement (A.5-11) : seulement quand le serveur a confirmé au moins un lot
 * (révision engagée), jamais sur un refus ni sur une simple tentative. Clés TanStack Query de l'historique et de l'étude.
 */
export function invalidationsApresEngagement(lotsConfirmes: number, projectId: string, studyId: string, variantId: string): (readonly string[])[] {
  if (lotsConfirmes <= 0) return [];
  return [["studio-revisions", projectId, studyId, variantId], ["studio-study", projectId, studyId]];
}
