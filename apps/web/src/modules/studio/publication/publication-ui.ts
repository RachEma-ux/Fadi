/**
 * Publications Studio — règles d'affichage pures (aucun DOM). Le serveur reste seul juge des transitions et des droits :
 * les boutons suivent `allowed`, et tout refus est relu de la réponse du serveur.
 * Trois dimensions distinctes (lot E.4) : travail, diffusion, actualité des contenus dérivés.
 */
import type {
  StudioManifestDrift, StudioPublication, StudioPublicationDiffusionStatus, StudioPublicationStatus, StudioPublicationTransition, StudioPublicationWorkStatus,
} from "../../../lib/api";

export const LIBELLE_STATUT: Readonly<Record<StudioPublicationStatus, string>> = Object.freeze({
  travail: "En travail", soumis: "Soumise", approuve: "Approuvée", refuse: "Refusée", diffuse: "Diffusée", retire: "Retirée",
});
export const LIBELLE_TRAVAIL: Readonly<Record<StudioPublicationWorkStatus, string>> = Object.freeze({
  brouillon: "Brouillon", "en-revue": "En revue", approuve: "Approuvée", refuse: "Refusée",
});
export const LIBELLE_DIFFUSION: Readonly<Record<StudioPublicationDiffusionStatus, string>> = Object.freeze({
  "non-diffuse": "Non diffusée", diffuse: "Diffusée", retire: "Retirée", remplace: "Remplacée",
});
export const LIBELLE_ACTUALITE: Readonly<Record<"a-jour" | "perimee", string>> = Object.freeze({
  "a-jour": "Contenus à jour", perimee: "Contenus périmés",
});
/** Libellé d'actualité : « à jour » seulement si les documents ont été comparés ; sinon la vérification est déclarée absente. */
export function libelleActualite(p: Pick<StudioPublication, "freshness" | "documentsCheck">): string {
  if (p.freshness === "perimee") return LIBELLE_ACTUALITE.perimee;
  return p.documentsCheck === "verifiee" ? LIBELLE_ACTUALITE["a-jour"] : "Sources à jour, documents non vérifiés";
}
export const LIBELLE_ACTION: Readonly<Record<StudioPublicationTransition, string>> = Object.freeze({
  soumettre: "Soumettre", approuver: "Approuver", refuser: "Refuser", diffuser: "Diffuser", retirer: "Retirer", actualiser: "Actualiser le manifeste",
});
/** Libellés du journal (action accomplie). */
export const LIBELLE_EVENEMENT: Readonly<Record<StudioPublicationTransition | "creer" | "remplacer", string>> = Object.freeze({
  creer: "Création", soumettre: "Soumission", approuver: "Approbation", refuser: "Refus", diffuser: "Diffusion", retirer: "Retrait",
  actualiser: "Actualisation du manifeste", remplacer: "Remplacement",
});
/** Transitions dont le commentaire est exigé par le serveur. */
export const COMMENTAIRE_REQUIS: ReadonlySet<StudioPublicationTransition> = new Set(["refuser", "retirer"]);
/** Ordre d'affichage des boutons. */
export const ORDRE_ACTIONS: readonly StudioPublicationTransition[] = ["actualiser", "soumettre", "approuver", "refuser", "diffuser", "retirer"];

export const court = (id: string): string => id.slice(-8);
export const empreinteCourte = (hash: string): string => hash.slice(0, 12);

/**
 * Corps envoyé pour une transition : l'approbation porte le manifeste affiché (ensemble examiné), sa révision et son
 * empreinte. Approuver ou refuser au titre d'une délégation (EX-085) l'envoie explicitement (`delegationId`).
 */
export function corpsTransition(publication: Pick<StudioPublication, "revisionId" | "documentHash" | "manifestHash"> & Partial<Pick<StudioPublication, "delegation">>, action: StudioPublicationTransition, commentaire: string) {
  const comment = commentaire.trim();
  return {
    ...(comment ? { comment } : {}),
    ...(action === "approuver"
      ? { ...(publication.manifestHash ? { manifestHash: publication.manifestHash } : {}), revisionId: publication.revisionId, documentHash: publication.documentHash }
      : {}),
    ...((action === "approuver" || action === "refuser") && publication.delegation ? { delegationId: publication.delegation.id } : {}),
  };
}

/** Délégations d'approbation (EX-085) : état et portée. */
export const LIBELLE_ETAT_DELEGATION: Readonly<Record<"a-venir" | "active" | "expiree" | "revoquee", string>> = Object.freeze({
  "a-venir": "À venir", active: "Active", expiree: "Expirée", revoquee: "Révoquée",
});
export const LIBELLE_PORTEE_DELEGATION: Readonly<Record<"projet" | "etude" | "variante" | "publication", string>> = Object.freeze({
  projet: "Projet", etude: "Étude", variante: "Variante", publication: "Publication",
});
/** Refus d'une délégation (codes du serveur, même texte que les règles du modèle). */
const REFUS_DELEGATION: Readonly<Record<string, string>> = Object.freeze({
  delegation_autre_delegue: "Cette délégation est nominative : seul son délégué peut l’employer.",
  delegation_revoquee: "Cette délégation a été révoquée : elle ne permet plus aucune approbation.",
  delegation_a_venir: "La période de cette délégation n’a pas commencé : aucune approbation n’est possible avant son début.",
  delegation_expiree: "La période de cette délégation est terminée : aucune approbation n’est possible après sa fin.",
  delegation_hors_portee: "Cette publication est hors de la portée de la délégation.",
  delegant_sans_droit: "Le délégant ne détient plus le droit d’approuver cette publication : sa délégation ne le transmet pas.",
  delegation_sans_droit: "Vous ne détenez pas le droit d’approuver sur cette portée : vous ne pouvez pas le déléguer.",
  delegation_delegue_identique: "Le délégué doit être un autre compte que le délégant.",
  delegation_periode_invalide: "Période invalide : la fin doit suivre le début (dates ISO 8601).",
  delegation_periode_terminee: "La période est déjà terminée : une délégation ne se crée pas rétroactivement.",
  delegation_motif_requis: "Le motif de la délégation est requis.",
  delegue_inconnu: "Le délégué doit être un participant qui lit ce projet.",
  portee_inconnue: "Élément de la portée inconnu dans ce projet.",
  portee_invalide: "Portée invalide : projet, ou étude, variante ou publication désignée par son identifiant.",
});

const LIBELLE_CHAMP: Readonly<Record<string, string>> = Object.freeze({
  projectCode: "code du projet", projectName: "nom du projet", studyName: "nom de l’étude", variantName: "nom de la variante",
});
/** Écart du manifeste en une phrase (identifiants et noms viennent du serveur). */
export function libelleEcart(e: StudioManifestDrift): string {
  if (e.type === "source") {
    const quoi = e.role === "principale" ? "Variante publiée" : "Variante coordonnée";
    return e.revisionCourante
      ? `${quoi} modifiée : révision ${court(e.revisionFigee)} figée, ${court(e.revisionCourante)} courante.`
      : `${quoi} introuvable (révision ${court(e.revisionFigee)} figée).`;
  }
  if (e.type === "documents") return `Documents régénérés : ${e.formats.map((f) => f.toUpperCase()).join(", ")}.`;
  return `Métadonnée modifiée : ${LIBELLE_CHAMP[e.champ] ?? e.champ}.`;
}

/** Message d'un refus serveur, sans rien inventer : les identifiants viennent du corps de la réponse. */
export function messageRefus(status: number, body: unknown): string {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  if (status === 409 && b["error"] === "manifest_mismatch") {
    return `Diffusion refusée : le manifeste courant diffère du manifeste approuvé (approuvé ${empreinteCourte(String(b["approvedManifestHash"] ?? ""))}, courant ${empreinteCourte(String(b["currentManifestHash"] ?? ""))}). Une nouvelle approbation est requise : actualisez, soumettez puis faites approuver.`;
  }
  if (status === 409 && b["error"] === "stale_approval") {
    return `Diffusion refusée : la variante a changé depuis l’approbation (révision approuvée ${court(String(b["approvedRevisionId"] ?? ""))}, tête ${court(String(b["headRevisionId"] ?? ""))}). Préparez une publication de la nouvelle révision.`;
  }
  if (status === 409 && b["error"] === "manifest_outdated") return "Une source a changé depuis le manifeste : actualisez le dossier avant de le soumettre ou de l’approuver.";
  if (status === 409 && b["error"] === "manifest_missing") return "Ce dossier n’a pas de manifeste approuvé : actualisez-le, soumettez-le et faites-le approuver.";
  if (status === 409 && b["error"] === "manifest_current") return "Le manifeste est déjà à jour : rien à actualiser.";
  if (status === 409 && b["error"] === "revision_mismatch") return "Approbation refusée : l’ensemble examiné n’est pas celui de la publication.";
  if (status === 409 && b["error"] === "invalid_transition") return "Transition refusée : le statut a changé entre-temps. Rechargez la liste.";
  if (status === 409 && b["error"] === "archived") return "Étude ou variante archivée : publication impossible.";
  if (status === 400 && b["code"] === "comment_required") return "Un commentaire est requis pour cette action.";
  if (status === 400 && b["code"] === "drawing_coordinated_invalid") return "Un dessin 2D indépendant se publie seul : retirez les variantes coordonnées.";
  if (typeof b["code"] === "string" && REFUS_DELEGATION[b["code"]]) return REFUS_DELEGATION[b["code"]]!;
  if (status === 409 && b["error"] === "delegation_revoquee") return REFUS_DELEGATION["delegation_revoquee"]!;
  if (status === 422 && b["error"] === "self_approval_forbidden") return "Approbation refusée : vous avez produit ou soumis ce dossier et l’auto-contrôle n’est pas autorisé pour votre compte.";
  if (status === 403) return "Action refusée : vos droits sur ce projet ne la permettent pas.";
  if (status === 423) return "Édition réservée par un autre compte : réessayez plus tard.";
  return "Action refusée par le serveur.";
}
