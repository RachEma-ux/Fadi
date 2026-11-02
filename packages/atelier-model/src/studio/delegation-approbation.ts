/**
 * Délégation contrôlée de l'approbation d'une publication Studio (EX-085, REF-02 w:p 816) : « L'absence d'un
 * approbateur ne vaut pas accord. Une délégation, si permise, possède portée, période, délégant/délégué, justification
 * et événement d'audit. » Règles pures (ni base, ni DOM), appliquées par le serveur (`apps/api/src/lib/studio-delegations.ts`)
 * et relues par l'interface (panneau Publications).
 *
 * - Une délégation est **nominative** (un délégant, un délégué distinct), **bornée** (début inclus, fin exclue), **motivée**
 *   et porte une **portée** : le projet, une étude, une variante (publication qui ne porte que sur elle) ou une publication.
 * - Elle ne transmet que l'approbation (approuver ou refuser), jamais la diffusion, et seulement tant que le délégant
 *   détient lui-même ce droit sur la publication visée (vérifié à chaque usage, pas seulement à la création).
 * - Elle n'approuve rien par elle-même : créer, laisser expirer ou révoquer une délégation ne change le statut d'aucune
 *   publication. Une publication sans décision reste « en revue » indéfiniment (`decisionApprobation`).
 * - Hors période, hors portée, révoquée, ou présentée par un autre compte que le délégué : refus explicite, motif nommé.
 */

export type PorteeDelegation =
  | { readonly type: "projet" }
  | { readonly type: "etude"; readonly id: string }
  | { readonly type: "variante"; readonly id: string }
  | { readonly type: "publication"; readonly id: string };

export const TYPES_PORTEE_DELEGATION = ["projet", "etude", "variante", "publication"] as const;
export type TypePorteeDelegation = (typeof TYPES_PORTEE_DELEGATION)[number];

export interface DelegationApprobation {
  readonly id: string;
  readonly delegantId: string;
  readonly delegueId: string;
  readonly portee: PorteeDelegation;
  /** Début de la période (ISO 8601, inclus). */
  readonly debut: string;
  /** Fin de la période (ISO 8601, exclue). */
  readonly fin: string;
  /** Justification déclarée par le délégant. */
  readonly motif: string;
  /** Révocation (ISO 8601) ; null tant que la délégation n'est pas révoquée. */
  readonly revoqueeLe: string | null;
}

/** Publication visée par un usage de la délégation : relue en base par le serveur, jamais lue du corps de la requête. */
export interface CibleApprobation {
  readonly publicationId: string;
  readonly studyId: string;
  /** Toutes les variantes du contenu (principale et coordonnées). */
  readonly variantIds: readonly string[];
}

export type EtatDelegation = "a-venir" | "active" | "expiree" | "revoquee";

export type MotifRefusDelegation =
  | "delegation-autre-delegue" | "delegation-revoquee" | "delegation-a-venir" | "delegation-expiree" | "delegation-hors-portee" | "delegant-sans-droit";

export const MESSAGES_REFUS_DELEGATION: Readonly<Record<MotifRefusDelegation, string>> = Object.freeze({
  "delegation-autre-delegue": "Cette délégation est nominative : seul son délégué peut l’employer.",
  "delegation-revoquee": "Cette délégation a été révoquée : elle ne permet plus aucune approbation.",
  "delegation-a-venir": "La période de cette délégation n’a pas commencé : aucune approbation n’est possible avant son début.",
  "delegation-expiree": "La période de cette délégation est terminée : aucune approbation n’est possible après sa fin.",
  "delegation-hors-portee": "Cette publication est hors de la portée de la délégation.",
  "delegant-sans-droit": "Le délégant ne détient plus le droit d’approuver cette publication : sa délégation ne le transmet pas.",
});

const instant = (iso: string): number => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? Number.NaN : t;
};

/** État à l'instant `maintenant` : la révocation l'emporte, puis la période (début inclus, fin exclue). */
export function etatDelegation(d: Pick<DelegationApprobation, "debut" | "fin" | "revoqueeLe">, maintenant: Date): EtatDelegation {
  if (d.revoqueeLe !== null) return "revoquee";
  const t = maintenant.getTime();
  if (!(t >= instant(d.debut))) return "a-venir";
  if (!(t < instant(d.fin))) return "expiree";
  return "active";
}

/**
 * La portée couvre-t-elle la publication ? Comparaison exacte des identifiants, même règle que les portées étroites
 * (`@parcours/domain-model`) : une portée variante ne couvre pas une publication coordonnée avec une autre variante.
 */
export function couvreDelegation(p: PorteeDelegation, cible: CibleApprobation): boolean {
  const variantes = [...new Set(cible.variantIds)];
  switch (p.type) {
    case "projet": return true;
    case "etude": return cible.studyId === p.id;
    case "variante": return variantes.length > 0 && variantes.every((v) => v === p.id);
    case "publication": return cible.publicationId === p.id;
  }
}

export type VerdictDelegation = { ok: true } | { ok: false; motif: MotifRefusDelegation; message: string };
const refus = (motif: MotifRefusDelegation): VerdictDelegation => ({ ok: false, motif, message: MESSAGES_REFUS_DELEGATION[motif] });

/**
 * Usage de la délégation `d` par `acteurId`, à l'instant `maintenant`, sur `cible`. `delegantApprouve` : le délégant
 * détient-il lui-même, maintenant, le droit d'approuver cette publication (relu par le serveur) ?
 */
export function verifierDelegation(d: DelegationApprobation, usage: { acteurId: string; maintenant: Date; cible: CibleApprobation; delegantApprouve: boolean }): VerdictDelegation {
  if (d.delegueId !== usage.acteurId) return refus("delegation-autre-delegue");
  const etat = etatDelegation(d, usage.maintenant);
  if (etat === "revoquee") return refus("delegation-revoquee");
  if (etat === "a-venir") return refus("delegation-a-venir");
  if (etat === "expiree") return refus("delegation-expiree");
  if (!couvreDelegation(d.portee, usage.cible)) return refus("delegation-hors-portee");
  if (!usage.delegantApprouve) return refus("delegant-sans-droit");
  return { ok: true };
}

export type ProblemeDelegation = "delegue-identique" | "periode-invalide" | "periode-terminee" | "motif-requis" | "portee-invalide";
export const MESSAGES_PROBLEME_DELEGATION: Readonly<Record<ProblemeDelegation, string>> = Object.freeze({
  "delegue-identique": "Le délégué doit être un autre compte que le délégant.",
  "periode-invalide": "Période invalide : la fin doit suivre le début (dates ISO 8601).",
  "periode-terminee": "La période est déjà terminée : une délégation ne se crée pas rétroactivement.",
  "motif-requis": "Le motif de la délégation est requis.",
  "portee-invalide": "Portée invalide : projet, ou étude, variante ou publication désignée par son identifiant.",
});

/** Problèmes d'une nouvelle délégation (liste vide : admissible). Le serveur vérifie en plus droits et existence de la cible. */
export function problemesNouvelleDelegation(
  d: Pick<DelegationApprobation, "delegantId" | "delegueId" | "debut" | "fin" | "motif" | "portee">, maintenant: Date,
): ProblemeDelegation[] {
  const out: ProblemeDelegation[] = [];
  if (d.delegantId === d.delegueId) out.push("delegue-identique");
  const debut = instant(d.debut), fin = instant(d.fin);
  if (Number.isNaN(debut) || Number.isNaN(fin) || fin <= debut) out.push("periode-invalide");
  else if (fin <= maintenant.getTime()) out.push("periode-terminee");
  if (d.motif.trim() === "") out.push("motif-requis");
  const p = d.portee as { type?: unknown; id?: unknown };
  if (!(TYPES_PORTEE_DELEGATION as readonly unknown[]).includes(p.type) || (p.type === "projet" ? "id" in p : typeof p.id !== "string" || p.id.trim() === "")) out.push("portee-invalide");
  return out;
}

/**
 * Décision d'approbation lue au journal d'une publication soumise : la dernière décision explicite (approbation ou
 * refus, par l'approbateur ou son délégué), sinon `en-attente`. Ni le temps écoulé, ni l'absence de l'approbateur, ni
 * l'expiration d'une délégation ne produisent un accord : seule une décision enregistrée en est un (EX-085).
 */
export function decisionApprobation(journal: readonly { action: string }[]): "approuvee" | "refusee" | "en-attente" {
  for (let i = journal.length - 1; i >= 0; i--) {
    const a = journal[i]!.action;
    if (a === "approuver") return "approuvee";
    if (a === "refuser") return "refusee";
    // Une nouvelle soumission ou une actualisation rouvre l'examen : aucune décision antérieure ne la couvre.
    if (a === "soumettre" || a === "actualiser" || a === "creer") return "en-attente";
  }
  return "en-attente";
}
