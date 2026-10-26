/**
 * Contrôle de politique avant tout transfert vers un service externe (EX-094, TR-EX-094 ; lot F, décision P-12) : un
 * rendu, un fichier importé, un modèle de référence ou une image n'est adressé à un service externe qu'au terme de ce
 * contrôle, qui vérifie la politique de l'administrateur, le fournisseur (activé, autorisé, clé fournie, coût déclaré),
 * la classification et la provenance de chaque source, le droit d'export du compte et le consentement explicite de
 * l'utilisateur (coût accepté compris). Ce qui n'est pas connu est **signalé**, jamais inventé : une classification
 * inconnue ou une provenance inconnue bloquent, une version de fournisseur inconnue est déclarée « inconnue ».
 * Un fournisseur local (aucun réseau) ne transfère rien : le verdict le dit (`transfert: "aucun"`).
 * Pur : ni réseau, ni horloge, ni React.
 */

export const STUDIO_CLASSIFICATIONS_SOURCE = Object.freeze(["publique", "interne", "confidentielle"] as const);
export type StudioClassificationSource = (typeof STUDIO_CLASSIFICATIONS_SOURCE)[number];

export interface StudioCoutDeclare {
  /** Montant par génération, déclaré par l'administrateur (jamais deviné). */
  montant: number;
  /** Code ISO 4217 (trois lettres majuscules). */
  devise: string;
}

/** Politique de l'administrateur ; par défaut tout transfert externe est interdit. */
export interface StudioPolitiqueTransfert {
  transfertsExternes: "interdits" | "avec-consentement";
  /** Classifications admises au transfert ; « confidentielle » exige en plus un contrat cité. */
  classificationsAdmises: readonly StudioClassificationSource[];
  /** Référence du contrat ou de l'accord de traitement avec le fournisseur ; null : aucun. */
  contrat: string | null;
  /** Identifiants des fournisseurs externes autorisés. */
  fournisseursAutorises: readonly string[];
}

export const STUDIO_POLITIQUE_TRANSFERT_DEFAUT: StudioPolitiqueTransfert = Object.freeze({
  transfertsExternes: "interdits", classificationsAdmises: Object.freeze([]), contrat: null, fournisseursAutorises: Object.freeze([]),
});

export type StudioTypeSourceTransfert = "rendu" | "fichier-importe" | "modele-reference" | "image";

export interface StudioSourceTransfert {
  type: StudioTypeSourceTransfert;
  /** Empreinte SHA-256 de ce qui serait envoyé. */
  empreinte: string;
  /** Classification déclarée ; « inconnue » bloque le transfert. */
  classification: StudioClassificationSource | "inconnue";
  /** Provenance relue et vérifiée (révision, étude, variante) ; faux : inconnue, le transfert est bloqué. */
  provenanceConnue: boolean;
}

export interface StudioFournisseurTransfert {
  id: string;
  /** `local` : aucun réseau ; `externe` : service tiers. */
  nature: "local" | "externe";
  active: boolean;
  cleFournie: boolean;
  cout: StudioCoutDeclare | null;
  /** Version annoncée ; null : inconnue (signalée). */
  version: string | null;
  /** Restrictions de droits déclarées sur les images produites ; null : non déclarées (signalées). */
  droits: string | null;
  /** Quotas déclarés ; null : non évalués (signalés). */
  quotas: string | null;
}

export interface StudioConsentementTransfert {
  transfertExterne: boolean;
  /** Coût accepté par l'utilisateur pour cette génération. */
  coutAccepte: StudioCoutDeclare | null;
}

export interface StudioDemandeTransfert {
  fournisseur: StudioFournisseurTransfert;
  sources: readonly StudioSourceTransfert[];
  consentement: StudioConsentementTransfert | null;
  /** Droit d'export du compte sur le projet (un lecteur sans export ne fait rien sortir). */
  droitExport: boolean;
}

export type StudioCodeRefusTransfert =
  | "aucune-source" | "fournisseur-inactif" | "cle-absente" | "cout-non-declare" | "politique-interdit" | "fournisseur-non-autorise"
  | "classification-inconnue" | "classification-refusee" | "contrat-absent" | "provenance-inconnue" | "droit-export-absent"
  | "consentement-absent" | "cout-non-accepte";

export interface StudioRefusTransfert { code: StudioCodeRefusTransfert; message: string }

export type StudioVerdictTransfert =
  | { autorise: true; transfert: "aucun" | "externe"; inconnues: string[] }
  | { autorise: false; refus: StudioRefusTransfert[]; inconnues: string[] };

const DEVISE = /^[A-Z]{3}$/;
export function studioCoutValide(c: StudioCoutDeclare | null | undefined): c is StudioCoutDeclare {
  return !!c && typeof c.montant === "number" && Number.isFinite(c.montant) && c.montant >= 0 && typeof c.devise === "string" && DEVISE.test(c.devise);
}

/** Inconnues du fournisseur, à signaler dans la provenance (EX-071, EX-072). */
export function studioInconnuesFournisseur(f: StudioFournisseurTransfert): string[] {
  if (f.nature === "local") return [];
  const out: string[] = [];
  if (!f.version) out.push("version du fournisseur inconnue");
  if (!f.droits) out.push("restrictions de droits non déclarées par le fournisseur");
  if (!f.quotas) out.push("quotas non évalués");
  return out;
}

/**
 * Verdict du transfert, **avant** toute transmission. Tous les motifs de refus sont rendus (pas seulement le premier),
 * pour que l'utilisateur et l'administrateur voient ce qui manque.
 */
export function studioControlerTransfert(politique: StudioPolitiqueTransfert, d: StudioDemandeTransfert): StudioVerdictTransfert {
  const inconnues = studioInconnuesFournisseur(d.fournisseur);
  if (d.fournisseur.nature === "local") return { autorise: true, transfert: "aucun", inconnues };
  const refus: StudioRefusTransfert[] = [];
  const r = (code: StudioCodeRefusTransfert, message: string) => refus.push({ code, message });
  if (d.sources.length === 0) r("aucune-source", "Aucune source déclarée : rien ne peut être envoyé sans être identifié.");
  if (!d.fournisseur.active) r("fournisseur-inactif", "Le service externe n’est pas activé par l’administrateur.");
  if (!d.fournisseur.cleFournie) r("cle-absente", "Aucune clé d’accès n’a été fournie par l’administrateur.");
  if (!studioCoutValide(d.fournisseur.cout)) r("cout-non-declare", "Le coût par génération n’est pas déclaré : aucun appel payant sans coût connu.");
  if (politique.transfertsExternes !== "avec-consentement") r("politique-interdit", "La politique de l’administrateur interdit les transferts externes.");
  if (!politique.fournisseursAutorises.includes(d.fournisseur.id)) r("fournisseur-non-autorise", "Ce fournisseur n’est pas autorisé par la politique.");
  if (!d.droitExport) r("droit-export-absent", "Votre rôle ne permet pas de faire sortir des données du projet.");
  for (const s of d.sources) {
    if (!s.provenanceConnue) r("provenance-inconnue", `Source « ${s.type} » : provenance inconnue, transfert bloqué.`);
    if (s.classification === "inconnue") r("classification-inconnue", `Source « ${s.type} » : classification inconnue, transfert bloqué.`);
    else if (!politique.classificationsAdmises.includes(s.classification)) r("classification-refusee", `Source « ${s.type} » : la classification « ${s.classification} » n’est pas admise au transfert.`);
    else if (s.classification === "confidentielle" && !politique.contrat) r("contrat-absent", "Source confidentielle : aucun contrat de traitement n’est cité par la politique.");
  }
  if (!d.consentement || d.consentement.transfertExterne !== true) r("consentement-absent", "Le transfert vers le service externe n’a pas été consenti.");
  else if (studioCoutValide(d.fournisseur.cout)) {
    const a = d.consentement.coutAccepte;
    if (!studioCoutValide(a) || a.devise !== d.fournisseur.cout.devise || a.montant < d.fournisseur.cout.montant) r("cout-non-accepte", "Le coût déclaré n’a pas été accepté.");
  }
  return refus.length ? { autorise: false, refus, inconnues } : { autorise: true, transfert: "externe", inconnues };
}
