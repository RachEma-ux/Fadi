/**
 * Découpage territorial d'un pays (lot H, D-GD-28) : Fadi est neutre — aucun pays, niveau ni unité n'est écrit dans le
 * code. Chaque pays est chargé **en base** depuis des fiches de source qualifiées qui déclarent leur place dans le
 * découpage (`territoire` : pays ISO 3166-1, nom du pays, rang, nom du niveau, règle de parenté). La barre territoriale
 * de l'interface lit ce découpage en base, indépendamment des couches affichées. Pur : aucun DOM, aucune base.
 *
 * Règles de parenté (jamais devinées) :
 *   - « codes-hcp » : codes géographiques du HCP (Maroc), parenté lue des codes (`parentHcp`) ;
 *   - « inclusion » : le parent est l'unité du rang supérieur qui contient un point intérieur de l'unité (calcul en base).
 */
import type { RangAdministratif } from "./limites.js";
import { parentHcp } from "./niveaux.js";

export type RegleParent = "codes-hcp" | "inclusion";
export const REGLES_PARENT: readonly RegleParent[] = ["codes-hcp", "inclusion"];

export interface NomNiveau { readonly singulier: string; readonly pluriel: string }

export interface DeclarationTerritoire {
  /** Code ISO 3166-1 alpha-2 (« MA ») ; les codes réservés à l'usage privé (« ZZ ») servent aux jeux synthétiques. */
  readonly pays: string;
  readonly nomPays: string;
  readonly rang: RangAdministratif;
  readonly niveau: NomNiveau;
  readonly parent: RegleParent;
}

export type ValidationTerritoire = { readonly ok: true; readonly declaration: DeclarationTerritoire } | { readonly ok: false; readonly erreurs: readonly string[] };

const texte = (x: unknown, max: number): x is string => typeof x === "string" && x.trim().length > 0 && x.length <= max;

export function validerDeclarationTerritoire(x: unknown): ValidationTerritoire {
  if (!x || typeof x !== "object" || Array.isArray(x)) return { ok: false, erreurs: ["territoire : objet attendu"] };
  const d = x as Record<string, unknown>;
  const erreurs: string[] = [];
  if (typeof d["pays"] !== "string" || !/^[A-Z]{2}$/.test(d["pays"])) erreurs.push("territoire.pays : code ISO 3166-1 alpha-2 attendu (« MA »)");
  if (!texte(d["nomPays"], 80)) erreurs.push("territoire.nomPays : nom du pays attendu (80 caractères au plus)");
  if (d["rang"] !== 1 && d["rang"] !== 2 && d["rang"] !== 3 && d["rang"] !== 4) erreurs.push("territoire.rang : 1 à 4");
  const n = d["niveau"] as Record<string, unknown> | undefined;
  if (!n || !texte(n["singulier"], 60) || !texte(n["pluriel"], 60)) erreurs.push("territoire.niveau : { singulier, pluriel } attendus");
  if (!REGLES_PARENT.includes(d["parent"] as RegleParent)) erreurs.push(`territoire.parent : ${REGLES_PARENT.join(" ou ")}`);
  if (erreurs.length) return { ok: false, erreurs };
  return { ok: true, declaration: { pays: d["pays"] as string, nomPays: (d["nomPays"] as string).trim(), rang: d["rang"] as RangAdministratif, niveau: { singulier: (n!["singulier"] as string).trim(), pluriel: (n!["pluriel"] as string).trim() }, parent: d["parent"] as RegleParent } };
}

/** Code retenu dans le découpage : la règle « codes-hcp » n'admet que des codes HCP (un contour non rattaché est écarté). */
export const codeAdmis = (code: string, regle: RegleParent): boolean => (regle === "codes-hcp" ? /^\d{1,9}$/.test(code) : code.trim().length > 0);

/** Parents selon la règle « codes-hcp » (la règle « inclusion » se calcule en base) : code enfant → code parent ou null. */
export function parentsParCodes(enfants: readonly string[], rangEnfant: RangAdministratif, parents: ReadonlySet<string>): Map<string, string | null> {
  return new Map(enfants.map((c) => [c, parentHcp(c, rangEnfant, parents)]));
}

/** Pays tel que servi par l'API : ses niveaux chargés, du plus haut au plus fin. */
export interface PaysTerritorial {
  readonly code: string; readonly nom: string;
  readonly niveaux: readonly (NomNiveau & { readonly rang: RangAdministratif; readonly unites: number })[];
  /** Versions (publiées) dont les unités forment ce découpage : seules les couches de ces versions suivent le chemin de la barre. */
  readonly versions: readonly string[];
}

/** Unité servie par l'API (liste d'un niveau) ; emprise [ouest, sud, est, nord] en WGS 84. */
export interface UniteTerritoriale { readonly code: string; readonly nom: string; readonly rang: RangAdministratif; readonly emprise: readonly [number, number, number, number] }
