/**
 * Découpage territorial d'un pays (lot H, D-GD-28 ; D-GD-42) : Fadi est neutre — aucun pays, niveau ni unité n'est écrit
 * dans le code. Une fiche de couche déclare sa place dans le découpage (`territoire`) ; une fois sa version publiée, ses
 * unités (contours) sont copiées dans `geodata_territoires`. La barre territoriale de l'interface lit ce découpage en
 * base, indépendamment des couches affichées. Pur : aucun DOM, aucune base.
 *
 * Deux formes de déclaration, deux règles de parenté (jamais devinées) :
 *   - `{ pays, nomPays, niveau: "<code du niveau>" }` — règle « decoupage » : le rang et les noms du niveau viennent de
 *     la table des niveaux en base, le parent de chaque unité de la table des entités en base (lien parent → enfant) ;
 *   - `{ pays, nomPays, rang, niveau: { singulier, pluriel }, parent: "inclusion" }` — pays sans découpage importé :
 *     le parent est l'unité du rang supérieur qui contient un point intérieur de l'unité (calcul en base).
 */
import type { RangAdministratif } from "./limites.js";

export type RegleParent = "decoupage" | "inclusion";
export const REGLES_PARENT: readonly RegleParent[] = ["decoupage", "inclusion"];

export interface NomNiveau { readonly singulier: string; readonly pluriel: string }

export type DeclarationTerritoire =
  /** Niveau de la table des niveaux en base (règle « decoupage »). */
  | { readonly pays: string; readonly nomPays: string; readonly niveau: string }
  /** Niveau nommé par la fiche, parenté par inclusion géométrique. */
  | { readonly pays: string; readonly nomPays: string; readonly rang: RangAdministratif; readonly niveau: NomNiveau; readonly parent: "inclusion" };

export const regleDe = (d: DeclarationTerritoire): RegleParent => (typeof d.niveau === "string" ? "decoupage" : "inclusion");

export type ValidationTerritoire = { readonly ok: true; readonly declaration: DeclarationTerritoire } | { readonly ok: false; readonly erreurs: readonly string[] };

const texte = (x: unknown, max: number): x is string => typeof x === "string" && x.trim().length > 0 && x.length <= max;

export function validerDeclarationTerritoire(x: unknown): ValidationTerritoire {
  if (!x || typeof x !== "object" || Array.isArray(x)) return { ok: false, erreurs: ["territoire : objet attendu"] };
  const d = x as Record<string, unknown>;
  const erreurs: string[] = [];
  if (typeof d["pays"] !== "string" || !/^[A-Z]{2}$/.test(d["pays"])) erreurs.push("territoire.pays : code ISO 3166-1 alpha-2 attendu (« MA »)");
  if (!texte(d["nomPays"], 80)) erreurs.push("territoire.nomPays : nom du pays attendu (80 caractères au plus)");
  if (typeof d["niveau"] === "string") {
    if (!/^[A-Za-z0-9._-]{1,64}$/.test(d["niveau"])) erreurs.push("territoire.niveau : code de niveau de la table des niveaux attendu");
    if (erreurs.length) return { ok: false, erreurs };
    return { ok: true, declaration: { pays: d["pays"] as string, nomPays: (d["nomPays"] as string).trim(), niveau: d["niveau"] } };
  }
  if (typeof d["rang"] !== "number" || !Number.isInteger(d["rang"]) || d["rang"] < 1) erreurs.push("territoire.rang : entier ≥ 1");
  const n = d["niveau"] as Record<string, unknown> | undefined;
  if (!n || !texte(n["singulier"], 60) || !texte(n["pluriel"], 60)) erreurs.push("territoire.niveau : code de niveau, ou { singulier, pluriel }");
  if (d["parent"] !== "inclusion") erreurs.push("territoire.parent : « inclusion » (ou déclarer le code d'un niveau du découpage en base)");
  if (erreurs.length) return { ok: false, erreurs };
  return { ok: true, declaration: { pays: d["pays"] as string, nomPays: (d["nomPays"] as string).trim(), rang: d["rang"] as number, niveau: { singulier: (n!["singulier"] as string).trim(), pluriel: (n!["pluriel"] as string).trim() }, parent: "inclusion" } };
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
