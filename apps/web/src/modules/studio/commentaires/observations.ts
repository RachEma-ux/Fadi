/**
 * Lectures pures des observations dans le panneau « Commentaires » de Studio (aucun DOM, aucune requête) : libellés
 * des statuts et des passages, filtres du panneau. Les droits ne sont pas recalculés ici : le serveur renvoie, pour
 * chaque observation, les passages permis à l'utilisateur courant (`possibles`).
 */
import type { StudioComment, StudioObservationEvent, StudioObservationStatut, StudioObservationTransition } from "../../../lib/api";
import type { FilCommentaires } from "./fils";

export const STATUT_LIBELLE: Record<StudioObservationStatut, string> = {
  ouverte: "Ouverte",
  corrigee: "Corrigée",
  recontrolee: "Recontrôlée",
  cloturee: "Clôturée",
  rouverte: "Rouverte",
};

export const PASSAGE_LIBELLE: Record<StudioObservationTransition, string> = {
  corriger: "Déclarer corrigée",
  recontroler: "Recontrôler",
  cloturer: "Clôturer",
  rouvrir: "Rouvrir",
};

export const JOURNAL_LIBELLE: Record<StudioObservationEvent["action"], string> = {
  ouvrir: "Ouverte",
  corriger: "Corrigée",
  recontroler: "Recontrôlée",
  cloturer: "Clôturée",
  rouvrir: "Rouverte",
};

/** Passages qui citent une révision (exigée par le serveur). */
export const PASSAGE_AVEC_REVISION: Readonly<Record<StudioObservationTransition, boolean>> = { corriger: true, recontroler: true, cloturer: false, rouvrir: false };

export type FiltreObservations = "tous" | "mes" | "ouvertes" | "a-recontroler";
export const FILTRES: readonly FiltreObservations[] = ["tous", "mes", "ouvertes", "a-recontroler"];
export const FILTRE_LIBELLE: Record<FiltreObservations, string> = {
  tous: "Tous les commentaires",
  mes: "Mes observations",
  ouvertes: "Ouvertes",
  "a-recontroler": "À recontrôler",
};

/**
 * Un commentaire passe le filtre : « mes observations » = celles dont je suis responsable ou auteur ; « ouvertes » =
 * ouverte ou rouverte ; « à recontrôler » = corrigée, en attente du recontrôle.
 */
export function passeFiltre(c: StudioComment, filtre: FiltreObservations): boolean {
  if (filtre === "tous") return true;
  const o = c.observation;
  if (!o) return false;
  if (filtre === "mes") return o.assignedToMe || c.mine;
  if (filtre === "ouvertes") return o.statut === "ouverte" || o.statut === "rouverte";
  return o.statut === "corrigee";
}

/** Fils dont l'origine passe le filtre (les réponses suivent leur origine). */
export function filtrerFils(fils: readonly FilCommentaires[], filtre: FiltreObservations): FilCommentaires[] {
  return fils.filter((f) => passeFiltre(f.origine, filtre));
}

/** Nombre de commentaires par filtre (pastilles des boutons). */
export function compterFiltres(fils: readonly FilCommentaires[]): Record<FiltreObservations, number> {
  return Object.fromEntries(FILTRES.map((f) => [f, filtrerFils(fils, f).length])) as Record<FiltreObservations, number>;
}

/** Échéance dépassée d'une observation non clôturée (comparée à la date du jour, AAAA-MM-JJ). */
export function enRetard(echeance: string | null, statut: StudioObservationStatut, aujourdhui: string): boolean {
  return echeance !== null && statut !== "cloturee" && echeance < aujourdhui;
}
