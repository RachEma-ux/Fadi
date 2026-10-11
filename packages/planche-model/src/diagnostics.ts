/**
 * Codes de diagnostic stables de la famille d'extrusion (lot L19, cahier V1 EX-ERR-01). Les fonctions de géométrie
 * lèvent une `ErreurPlanche` : une `RangeError` qui garde son message français détaillé (source de l'interface,
 * traduit par le dictionnaire) et porte un code stable que l'interface relie à un libellé et à un recours traduits.
 * Aucune trace de pile n'est montrée à l'utilisateur ; un journal de développement peut citer le code et des comptes,
 * jamais le texte ni les coordonnées du projet.
 */

export const CODES_DIAGNOSTIC = [
  "EX_SOURCE_INVALID",
  "EX_CONTEXT_MISMATCH",
  "EX_CONTEXT_TRANSFORM_UNSUPPORTED",
  "EX_DISTANCE_INVALID",
  "EX_PROFILE_INVALID",
  "EX_PATH_DISCONNECTED",
  "EX_PATH_BRANCH",
  "EX_JOIN_INVALID",
  "EX_SELF_INTERSECTION",
  "EX_AXIS_INVALID",
  "EX_LINK_UNAVAILABLE",
  "EX_PREVIEW_STALE",
  "EX_TEXT_GLYPHS",
  "EX_COMPLEXITY_LIMIT",
] as const;

export type CodeDiagnostic = (typeof CODES_DIAGNOSTIC)[number];

/** Erreur de domaine codée : `instanceof RangeError` reste vrai (les appelants existants n'ont rien à changer). */
export class ErreurPlanche extends RangeError {
  readonly code: CodeDiagnostic;
  constructor(code: CodeDiagnostic, message: string) {
    super(message);
    this.name = "ErreurPlanche";
    this.code = code;
  }
}

export const erreurPlanche = (code: CodeDiagnostic, message: string): ErreurPlanche => new ErreurPlanche(code, message);

/** Code d'une erreur levée (ou `null` : erreur non codée, à traiter comme un message brut). */
export function codeDe(err: unknown): CodeDiagnostic | null {
  return err instanceof ErreurPlanche ? err.code : null;
}

/**
 * Plafond de complexité (EX-PERF-02) : nombre de triangles nouvellement produits par une opération. Budget produit
 * proposé par le cahier (200 000), à régler sur mesures ; au-delà, l'opération est refusée sans tronquer la géométrie.
 */
export const PLAFOND_TRIANGLES = 200_000;

export const messagePlafond = (estimes: number, plafond: number): string =>
  `Opération trop complexe : environ ${Math.round(estimes)} triangles à produire, au-delà du plafond de ${plafond}. Réduisez le profil, le chemin, la segmentation ou le texte.`;

/** Refus avant génération si l'estimation dépasse le plafond (`plafond` réglable, défaut `PLAFOND_TRIANGLES`). */
export function exigerComplexite(estimes: number, plafond: number = PLAFOND_TRIANGLES): void {
  if (!Number.isFinite(estimes) || estimes > plafond) throw erreurPlanche("EX_COMPLEXITY_LIMIT", messagePlafond(estimes, plafond));
}
