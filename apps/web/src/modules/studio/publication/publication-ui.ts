/**
 * Publications Studio — règles d'affichage pures (aucun DOM). Le serveur reste seul juge des transitions et des droits :
 * les boutons suivent `allowed`, et tout refus est relu de la réponse du serveur.
 */
import type { StudioPublication, StudioPublicationStatus, StudioPublicationTransition } from "../../../lib/api";

export const LIBELLE_STATUT: Readonly<Record<StudioPublicationStatus, string>> = Object.freeze({
  travail: "En travail", soumis: "Soumise", approuve: "Approuvée", refuse: "Refusée", diffuse: "Diffusée", retire: "Retirée",
});
export const LIBELLE_ACTION: Readonly<Record<StudioPublicationTransition, string>> = Object.freeze({
  soumettre: "Soumettre", approuver: "Approuver", refuser: "Refuser", diffuser: "Diffuser", retirer: "Retirer",
});
/** Libellés du journal (action accomplie). */
export const LIBELLE_EVENEMENT: Readonly<Record<StudioPublicationTransition | "creer", string>> = Object.freeze({
  creer: "Création", soumettre: "Soumission", approuver: "Approbation", refuser: "Refus", diffuser: "Diffusion", retirer: "Retrait",
});
/** Transitions dont le commentaire est exigé par le serveur. */
export const COMMENTAIRE_REQUIS: ReadonlySet<StudioPublicationTransition> = new Set(["refuser", "retirer"]);
/** Ordre d'affichage des boutons. */
export const ORDRE_ACTIONS: readonly StudioPublicationTransition[] = ["soumettre", "approuver", "refuser", "diffuser", "retirer"];

export const court = (id: string): string => id.slice(-8);
export const empreinteCourte = (hash: string): string => hash.slice(0, 12);

/** Corps envoyé pour une transition : l'approbation porte la révision et l'empreinte affichées (ensemble examiné). */
export function corpsTransition(publication: Pick<StudioPublication, "revisionId" | "documentHash">, action: StudioPublicationTransition, commentaire: string) {
  const comment = commentaire.trim();
  return {
    ...(comment ? { comment } : {}),
    ...(action === "approuver" ? { revisionId: publication.revisionId, documentHash: publication.documentHash } : {}),
  };
}

/** Message d'un refus serveur, sans rien inventer : les identifiants viennent du corps de la réponse. */
export function messageRefus(status: number, body: unknown): string {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  if (status === 409 && b["error"] === "stale_approval") {
    return `Diffusion refusée : la variante a changé depuis l’approbation (révision approuvée ${court(String(b["approvedRevisionId"] ?? ""))}, tête ${court(String(b["headRevisionId"] ?? ""))}). Préparez une publication de la nouvelle révision.`;
  }
  if (status === 409 && b["error"] === "revision_mismatch") return "Approbation refusée : l’ensemble examiné n’est pas celui de la publication.";
  if (status === 409 && b["error"] === "invalid_transition") return "Transition refusée : le statut a changé entre-temps. Rechargez la liste.";
  if (status === 409 && b["error"] === "archived") return "Étude ou variante archivée : publication impossible.";
  if (status === 400 && b["code"] === "comment_required") return "Un commentaire est requis pour cette action.";
  if (status === 403) return "Action refusée : vos droits sur ce projet ne la permettent pas.";
  if (status === 423) return "Édition réservée par un autre compte : réessayez plus tard.";
  return "Action refusée par le serveur.";
}
