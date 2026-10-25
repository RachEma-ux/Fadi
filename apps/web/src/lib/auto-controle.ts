/**
 * Auto-contrôle (lot OP-AUTOCONTROLE, décision OP-6) — libellés de l'interface, purs (aucun DOM). Le serveur décide
 * seul (`GET …/controle-approbation`, refus 422 `self_approval_forbidden`) ; ces textes ne font que l'expliquer.
 * Français source, traduits à l'affichage par `en.json` (D-163).
 */
import type { ApprobateurPossible, ControleApprobation } from "./api";

export const MARQUE_AUTO_CONTROLE = "Auto-contrôle";
export const TITRE_MARQUE = "Approbation enregistrée par une personne qui a produit ou soumis ce dossier";
export const LIBELLE_EVENEMENT_AUTO = "Approbation (auto-contrôle)";
export const LIBELLE_JOURNAL_AUTO = "Approbation enregistrée (auto-contrôle)";

/** Motifs relevés par le serveur, en une phrase (sans rien inventer). */
export function motifsAutoControle(c: Pick<ControleApprobation, "revisionsAuteur" | "soumisParLui">): string {
  if (c.revisionsAuteur > 0 && c.soumisParLui) return `Vous avez produit ${c.revisionsAuteur} révision(s) de ce dossier et vous l’avez soumis`;
  if (c.revisionsAuteur > 0) return `Vous avez produit ${c.revisionsAuteur} révision(s) de ce dossier`;
  return "Vous avez soumis ce dossier";
}

/** Avertissement avant d'approuver (option activée) : l'approbation sera marquée. */
export const avertissementAutoControle = (c: Pick<ControleApprobation, "revisionsAuteur" | "soumisParLui">): string =>
  `${motifsAutoControle(c)} : cette approbation sera marquée auto-contrôle.`;

/** Explication d'un refus (option désactivée par l'administration). */
export const refusAutoControle = (c: Pick<ControleApprobation, "revisionsAuteur" | "soumisParLui">): string =>
  `${motifsAutoControle(c)} : l’auto-contrôle n’est pas autorisé pour votre compte, l’approbation vous est fermée.`;

export const CONFIRMER_AUTO_CONTROLE = "Je confirme approuver en auto-contrôle";
export const AUTRES_APPROBATEURS = "Autres approbateurs possibles :";
export const AUCUN_AUTRE_APPROBATEUR = "Aucun autre approbateur n’est nommé sur ce projet : demandez au propriétaire d’en désigner un.";

export const ROLE_APPROBATEUR: Readonly<Record<ApprobateurPossible["role"], string>> = Object.freeze({
  proprietaire: "propriétaire du projet", approbateur: "approbateur du projet", "approbateur-revue": "approbateur de la revue externe",
});

/** Corps d'un refus 422 `self_approval_forbidden`, s'il en est un. */
export function refusServeur(status: number, body: unknown): ControleApprobation | null {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  if (status !== 422 || b["error"] !== "self_approval_forbidden") return null;
  return {
    autoControle: true, autorise: false, revisionsAuteur: typeof b["revisionsAuteur"] === "number" ? b["revisionsAuteur"] : 0,
    soumisParLui: b["soumisParLui"] === true, approvers: Array.isArray(b["approvers"]) ? (b["approvers"] as ApprobateurPossible[]) : [],
  };
}
