/**
 * Rattachement territorial des libellés de localité des sources de prix (Concept §5, PRX06).
 *
 * Les territoires candidats (code, nom, niveau, rang) sont **fournis par l'appelant**, lus en base dans la hiérarchie
 * administrative GeoData : ce module ne contient aucun territoire (D-GD-29). Le rang est celui du niveau en base
 * (plus grand = plus fin : région < province < commune < arrondissement).
 *
 * Règle de précision : une observation connue seulement à la commune n'est jamais rattachée à un arrondissement ni à
 * une zone plus fine. Un quartier commercial (Racine, Gauthier…) n'est pas une unité administrative : il reste non
 * rattaché tant qu'une correspondance revue (`alias` d'un candidat, lue en base) ne le relie pas à une unité.
 */

/** Territoire candidat, lu en base. */
export interface TerritoireCandidat {
  readonly code: string;
  readonly nom: string;
  readonly niveau: string;
  /** Rang du niveau dans la hiérarchie en base (plus grand = plus fin). */
  readonly rang: number;
  /** Autres libellés revus (correspondances validées en base), facultatifs. */
  readonly alias?: readonly string[];
}

export type ResultatRattachement =
  | { readonly resultat: "exact"; readonly territoire: TerritoireCandidat; readonly methode: "nom" | "alias" }
  | { readonly resultat: "ambigu"; readonly candidats: readonly TerritoireCandidat[] }
  | { readonly resultat: "non-rattache"; readonly motif: "libelle-vide" | "aucun-candidat" | "precision-insuffisante" };

/**
 * Libellé comparable : minuscules, sans accents, apostrophes, traits d'union, tirets bas et ponctuation remplacés par
 * une espace, espaces resserrées. « Aïn-Sebaâ » et « ain  sebaa » donnent « ain sebaa ».
 */
export function normaliserLibelleLocalite(texte: string): string {
  return texte.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[’'`ʼ‘\-‐‑–—_]/g, " ").replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
}

/** Une précision connue au rang `rangPrecision` permet-elle un rattachement au rang `rangCible` ? (jamais plus fin) */
export const precisionSuffisante = (rangPrecision: number, rangCible: number): boolean => rangCible <= rangPrecision;

/**
 * Rattache un libellé de localité à un territoire candidat :
 * - seuls les candidats dont le rang ne dépasse pas `rangPrecision` (précision de la source) sont considérés ;
 * - correspondance sur le nom normalisé, puis, à défaut, sur un alias revu ;
 * - un seul candidat → `exact` ; plusieurs (même nom à plusieurs niveaux ou homonymes) → `ambigu`, à revoir ;
 * - aucun → `non-rattache`, avec `precision-insuffisante` si seul un candidat plus fin que la précision correspondait.
 */
export function rattacherLocalite(libelle: string, candidats: readonly TerritoireCandidat[], rangPrecision: number): ResultatRattachement {
  const cle = normaliserLibelleLocalite(libelle);
  if (!cle) return { resultat: "non-rattache", motif: "libelle-vide" };
  const parNom = (c: TerritoireCandidat) => normaliserLibelleLocalite(c.nom) === cle;
  const parAlias = (c: TerritoireCandidat) => (c.alias ?? []).some((a) => normaliserLibelleLocalite(a) === cle);
  const admissibles = candidats.filter((c) => precisionSuffisante(rangPrecision, c.rang));
  const trier = (l: TerritoireCandidat[]) => l.sort((a, b) => a.rang - b.rang || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
  for (const [methode, test] of [["nom", parNom], ["alias", parAlias]] as const) {
    const trouves = trier(admissibles.filter(test));
    if (trouves.length === 1) return { resultat: "exact", territoire: trouves[0]!, methode };
    if (trouves.length > 1) return { resultat: "ambigu", candidats: trouves };
  }
  const tropFins = candidats.some((c) => !precisionSuffisante(rangPrecision, c.rang) && (parNom(c) || parAlias(c)));
  return { resultat: "non-rattache", motif: tropFins ? "precision-insuffisante" : "aucun-candidat" };
}
