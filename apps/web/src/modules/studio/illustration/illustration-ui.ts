/**
 * Règles pures des boîtes « Illustration depuis la vue » et « Agents (MCP) » (lot F, décision P-12) : corps d'une
 * demande d'illustration (image du rendu en base64, paramètres, et pour un service externe la classification et le
 * consentement explicites au coût déclaré), libellés et messages de refus. Ce qui manque n'est jamais complété : sans
 * consentement coché, aucun consentement n'est envoyé ; sans classification choisie, « inconnue » (le serveur bloque).
 * Pur : ni React ni DOM.
 */
import type { CorpsIllustration, FournisseurIllustration, PropositionLue } from "./api-lot-f";

export const LIBELLES_STYLE: Readonly<Record<string, string>> = Object.freeze({ trait: "Trait", lavis: "Lavis", sepia: "Sépia" });
export const LIBELLES_CLASSIFICATION: Readonly<Record<string, string>> = Object.freeze({
  publique: "Publique", interne: "Interne au projet", confidentielle: "Confidentielle", inconnue: "Non déclarée",
});
export const LIBELLES_STATUT_PROPOSITION: Readonly<Record<PropositionLue["statut"], string>> = Object.freeze({
  "en-attente": "En attente de votre confirmation", confirmee: "Confirmée", refusee: "Refusée", expiree: "Expirée", echec: "Échouée (rien n’a été écrit)",
});
export const LIBELLES_ACTION_AGENT: Readonly<Record<string, string>> = Object.freeze({
  "jeton.creer": "Jeton créé", "jeton.revoquer": "Jeton révoqué", "outil.appeler": "Lecture par l’agent", "proposition.creer": "Proposition de l’agent",
  "proposition.confirmer": "Proposition confirmée", "proposition.refuser": "Proposition refusée", "proposition.echec": "Proposition échouée",
});

/** Octets → base64 (sans dépendance au DOM : `btoa` sur des tranches). */
export function base64DeOctets(octets: Uint8Array): string {
  let s = "";
  for (let i = 0; i < octets.length; i += 0x8000) s += String.fromCharCode(...octets.subarray(i, i + 0x8000));
  return btoa(s);
}

export interface ChoixIllustration {
  fournisseur: FournisseurIllustration["id"];
  style: string;
  /** Intensité de 0 à 100 (curseur), envoyée au centième. */
  intensite: number;
  classification: "publique" | "interne" | "confidentielle" | "";
  /** Case « J'accepte l'envoi de l'image au service externe et son coût déclaré ». */
  consentement: boolean;
}
export const CHOIX_ILLUSTRATION_INITIAL: ChoixIllustration = Object.freeze({ fournisseur: "local-derive", style: "trait", intensite: 50, classification: "", consentement: false });

export function corpsIllustration(requestId: string, png: Uint8Array, c: ChoixIllustration, f: FournisseurIllustration | undefined): CorpsIllustration {
  const corps: CorpsIllustration = { requestId, fournisseur: c.fournisseur, image: base64DeOctets(png), parametres: { style: c.style, intensite: Math.round(Math.min(100, Math.max(0, c.intensite))) / 100 } };
  if (c.fournisseur === "externe") {
    corps.classification = c.classification || "inconnue";
    if (c.consentement && f?.cout && f.cout.devise) corps.consentement = { transfertExterne: true, coutAccepte: { montant: f.cout.montant, devise: f.cout.devise } };
  }
  return corps;
}

/** Ce qui empêche de lancer (affiché à côté du bouton) ; null : prêt. Le serveur revérifie tout. */
export function raisonIndisponible(c: ChoixIllustration, f: FournisseurIllustration | undefined, modifiable: boolean): string | null {
  if (!modifiable) return "Lecture seule : votre rôle ne permet pas de produire une illustration.";
  if (!f) return "Fournisseur inconnu.";
  if (!f.disponible) return `Indisponible : ${f.manque.join(" ; ")}.`;
  if (f.nature === "ia-externe") {
    if (!c.classification) return "Déclarez la classification de l’image avant tout envoi externe.";
    if (!c.consentement) return "Cochez le consentement à l’envoi externe et à son coût déclaré.";
  }
  return null;
}

export function libelleCout(f: FournisseurIllustration): string {
  if (f.nature === "local-deterministe") return "Aucun coût (traitement local, sans réseau)";
  return f.cout && f.cout.devise ? `${f.cout.montant} ${f.cout.devise} par génération (déclaré par l’administrateur)` : "Coût non déclaré : service indisponible";
}

export function messageRefusIllustration(status: number, corps: Record<string, unknown>): string {
  const code = corps["error"];
  if (code === "transfert_refuse" && Array.isArray(corps["refus"])) return `Transfert refusé avant tout envoi : ${(corps["refus"] as { message: string }[]).map((r) => r.message).join(" ")}`;
  if (code === "source_inconnue") return "Le rendu n’a pas de provenance connue : aucune illustration n’est produite.";
  if (code === "revision_differente") return "Le rendu ne porte pas sur une révision enregistrée de cette variante.";
  if (code === "archived") return "Étude ou variante archivée : aucune illustration n’est produite.";
  if (status === 403) return "Votre rôle ne permet pas de produire cette illustration.";
  return typeof corps["message"] === "string" ? corps["message"] : `Refus du serveur (${status}).`;
}

/** Adresse du serveur MCP (transport HTTP) pour une origine donnée. */
export const adresseMcp = (origine: string) => `${origine.replace(/\/$/, "")}/mcp/studio`;
