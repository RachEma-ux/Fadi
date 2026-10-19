/**
 * Règles pures des observations Studio (E.2-01 à E.2-05) : aucune requête, aucun DOM. Le serveur
 * (`studio-commentaires.ts`) les applique sous transaction ; le panneau web en relit le même tableau.
 *
 * Cycle : ouverte → corrigée → recontrôlée → clôturée ; rouverte depuis corrigée, recontrôlée ou clôturée ;
 * une observation rouverte se corrige comme une ouverte.
 *
 * Correspondance avec les rôles existants (`owned-project.ts`, aucun rôle nouveau) :
 *   - promouvoir un commentaire : son auteur ou le propriétaire du projet, avec le droit `comment` ;
 *   - responsable désigné : le propriétaire ou un membre `editeur` (droit `write` : il peut produire la révision
 *     de correction ; un `lecteur` ne le peut pas) ;
 *   - corriger : le responsable seul, en citant la révision de la variante où la correction a été faite ;
 *   - recontrôler : l'auteur de l'observation ou le propriétaire, contre une révision descendante (ou égale) de la
 *     révision de correction ;
 *   - clôturer : le propriétaire seul (droit `owner`, seul rôle « autorisé » du contrat existant) ;
 *   - rouvrir : l'auteur de l'observation ou le propriétaire.
 */
import type { StudioObservationAction, StudioObservationStatut } from "../db/schema.js";

export type ObservationTransition = Exclude<StudioObservationAction, "ouvrir">;
export const OBSERVATION_TRANSITIONS: readonly ObservationTransition[] = ["corriger", "recontroler", "cloturer", "rouvrir"];

/** Statuts de départ admis et statut d'arrivée de chaque passage. */
export const OBSERVATION_CYCLE: Record<ObservationTransition, { depuis: readonly StudioObservationStatut[]; vers: StudioObservationStatut }> = {
  corriger: { depuis: ["ouverte", "rouverte"], vers: "corrigee" },
  recontroler: { depuis: ["corrigee"], vers: "recontrolee" },
  cloturer: { depuis: ["recontrolee"], vers: "cloturee" },
  rouvrir: { depuis: ["corrigee", "recontrolee", "cloturee"], vers: "rouverte" },
};

/** Passages qui exigent une révision citée. */
export const REVISION_EXIGEE: Readonly<Record<ObservationTransition, boolean>> = { corriger: true, recontroler: true, cloturer: false, rouvrir: false };

export interface ActeurObservation {
  estResponsable: boolean;
  estAuteur: boolean;
  /** Rôle `proprietaire` du projet (droit `owner`). */
  estProprietaire: boolean;
}

/** Le statut d'arrivée, ou null si le passage n'est pas permis depuis ce statut. */
export function statutApres(statut: StudioObservationStatut, action: ObservationTransition): StudioObservationStatut | null {
  const regle = OBSERVATION_CYCLE[action];
  return regle.depuis.includes(statut) ? regle.vers : null;
}

/** Qui peut faire quel passage (indépendant du statut). */
export function acteurAutorise(action: ObservationTransition, a: ActeurObservation): boolean {
  switch (action) {
    case "corriger": return a.estResponsable;
    case "recontroler": return a.estAuteur || a.estProprietaire;
    case "cloturer": return a.estProprietaire;
    case "rouvrir": return a.estAuteur || a.estProprietaire;
  }
}

export const REFUS_ACTEUR: Record<ObservationTransition, string> = {
  corriger: "Seul le responsable de l'observation la déclare corrigée.",
  recontroler: "Seul l'auteur de l'observation ou le propriétaire du projet la recontrôle.",
  cloturer: "Seul le propriétaire du projet clôture une observation.",
  rouvrir: "Seul l'auteur de l'observation ou le propriétaire du projet la rouvre.",
};

/** `true` quand `ancetre` est `descendant` ou l'un de ses parents (chaîne des révisions d'une même variante). */
export function estAncetreOuEgale(parents: ReadonlyMap<string, string | null>, ancetre: string, descendant: string): boolean {
  const vus = new Set<string>();
  for (let r: string | null | undefined = descendant; r && !vus.has(r); r = parents.get(r)) {
    if (r === ancetre) return true;
    vus.add(r);
  }
  return false;
}

/** Échéance au format AAAA-MM-JJ et date réelle du calendrier. */
export function echeanceValide(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}
