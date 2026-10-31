/**
 * Qualification d'une source (D-GD-54) : une source est **qualifiée** (fiche relue, producteur, licence et droits établis)
 * ou **provisoire** (admise par une décision du maître d'ouvrage pour une étape de développement, droits du producteur non
 * établis). Une source provisoire porte son motif et sa décision ; elle n'est importée et publiée que là où l'exploitation
 * l'admet explicitement (préproduction, développement), jamais en production, et l'interface la signale partout où elle
 * paraît. Logique pure : la lecture du réglage d'environnement se fait dans l'API.
 */

export const QUALIFICATIONS = ["qualifiee", "provisoire"] as const;
export type EtatQualification = (typeof QUALIFICATIONS)[number];

export interface Qualification {
  readonly etat: EtatQualification;
  /** Pourquoi la source est provisoire (droits non établis, en attente d'une source qualifiée…) ; null si qualifiée. */
  readonly motif: string | null;
  /** Décision qui l'admet (ex. « D-GD-54 ») ; null si qualifiée. */
  readonly decision: string | null;
}

export const QUALIFIEE: Qualification = Object.freeze({ etat: "qualifiee", motif: null, decision: null });

const DECISION = /^D-GD-\d+$/;

/**
 * Qualification déclarée par une fiche (`version.qualification`) : absente = qualifiée ; « provisoire » exige un motif
 * (10 à 500 caractères) et une décision `D-GD-n`. Une déclaration mal formée est une erreur, jamais une qualification.
 */
export function validerQualification(x: unknown): { ok: true; qualification: Qualification } | { ok: false; erreur: string } {
  if (x === undefined || x === null) return { ok: true, qualification: QUALIFIEE };
  if (typeof x !== "object") return { ok: false, erreur: "qualification : objet attendu." };
  const o = x as Record<string, unknown>;
  if (o["etat"] === "qualifiee") return { ok: true, qualification: QUALIFIEE };
  if (o["etat"] !== "provisoire") return { ok: false, erreur: "qualification.etat : « qualifiee » ou « provisoire » attendu." };
  const motif = typeof o["motif"] === "string" ? o["motif"].trim() : "";
  if (motif.length < 10 || motif.length > 500) return { ok: false, erreur: "qualification.motif : 10 à 500 caractères." };
  const decision = typeof o["decision"] === "string" ? o["decision"].trim() : "";
  if (!DECISION.test(decision)) return { ok: false, erreur: "qualification.decision : décision « D-GD-n » attendue." };
  return { ok: true, qualification: { etat: "provisoire", motif, decision } };
}

/** Qualification lue en base (colonnes `qualification`, `qualification_motif`, `qualification_decision`). */
export function lireQualification(etat: unknown, motif: unknown, decision: unknown): Qualification {
  if (etat !== "provisoire") return QUALIFIEE;
  return { etat: "provisoire", motif: typeof motif === "string" ? motif : null, decision: typeof decision === "string" ? decision : null };
}

/**
 * Une version de cette qualification peut-elle être importée ou publiée ici ? Une source qualifiée, toujours ; une
 * source provisoire, seulement si l'exploitation admet les sources provisoires (réglage explicite de l'environnement).
 */
export function qualificationAdmise(q: Qualification, provisoiresAdmises: boolean): { ok: true } | { ok: false; motif: string } {
  if (q.etat === "qualifiee" || provisoiresAdmises) return { ok: true };
  return { ok: false, motif: `Source provisoire (${q.decision ?? "sans décision"}) : non admise sur cet environnement (sources provisoires non autorisées).` };
}
