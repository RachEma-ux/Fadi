/**
 * Demandes de précision (Collaboration partagée, COM-D10) — cycle et droits, purs, testés par `demandes-regles.test.ts`.
 *
 *   ouverte ──repondre──▶ repondue ──cloturer──▶ close
 *      │                     │                     │
 *      └──cloturer (motif)──▶ close ◀──────────────┘
 *   repondue | close ──rouvrir──▶ ouverte ;  ouverte ──reattribuer──▶ ouverte (autre répondant)
 *
 * La question et chaque réponse ne sont jamais réécrites : une correction passe par une réouverture et une nouvelle
 * réponse. Une échéance dépassée laisse la demande ouverte (« en retard ») : le temps écoulé ne la ferme jamais.
 */
import type { DemandeStatut } from "../db/schema.js";
import type { ProjectRole } from "./owned-project.js";

export type DemandeTransition = "repondre" | "cloturer" | "rouvrir" | "reattribuer";
export const DEMANDE_TRANSITIONS: readonly DemandeTransition[] = ["repondre", "cloturer", "rouvrir", "reattribuer"];

export const DEMANDE_CYCLE: Record<DemandeTransition, { depuis: readonly DemandeStatut[]; vers: DemandeStatut }> = {
  repondre: { depuis: ["ouverte"], vers: "repondue" },
  cloturer: { depuis: ["ouverte", "repondue"], vers: "close" },
  rouvrir: { depuis: ["repondue", "close"], vers: "ouverte" },
  reattribuer: { depuis: ["ouverte"], vers: "ouverte" },
};

export interface ActeurDemande {
  userId: string;
  role: ProjectRole;
  requesterId: string;
  responderId: string;
}

/** Statut après le passage, ou null s'il n'est pas permis depuis ce statut. */
export function demandeApres(statut: DemandeStatut, action: DemandeTransition): DemandeStatut | null {
  const c = DEMANDE_CYCLE[action];
  return c.depuis.includes(statut) ? c.vers : null;
}

/** Qui fait quoi : le répondant tenu répond ; le demandeur ou le propriétaire clôt, rouvre, réattribue. */
export function demandeAutorisee(action: DemandeTransition, a: ActeurDemande): boolean {
  if (a.role === "support") return false;
  if (action === "repondre") return a.userId === a.responderId;
  return a.userId === a.requesterId || a.role === "proprietaire";
}

export const REFUS_DEMANDE: Record<DemandeTransition, string> = {
  repondre: "Seul le répondant désigné répond à la demande ; demandez une réattribution au demandeur.",
  cloturer: "Seuls le demandeur et le propriétaire du projet clôturent une demande.",
  rouvrir: "Seuls le demandeur et le propriétaire du projet rouvrent une demande.",
  reattribuer: "Seuls le demandeur et le propriétaire du projet réattribuent une demande.",
};

/** Clôture sans réponse : un motif est exigé (la demande ne se ferme pas en silence). */
export function refusClotureDemande(statut: DemandeStatut, motif: string | undefined): string | null {
  return statut === "ouverte" && !(motif && motif.trim()) ? "Clôturer une demande sans réponse exige un motif." : null;
}

/** En retard : ouverte et échéance (date locale AAAA-MM-JJ) strictement passée. */
export function enRetard(d: { statut: DemandeStatut; echeance: string | null }, aujourdHui: string): boolean {
  return d.statut === "ouverte" && !!d.echeance && d.echeance < aujourdHui;
}

/** Date du jour au format AAAA-MM-JJ dans le fuseau de Fadi. */
export function aujourdHui(now = new Date(), tz = process.env["FADI_TZ"] ?? "Europe/Paris"): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
