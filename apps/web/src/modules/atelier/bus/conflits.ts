/**
 * Données d'un conflit 409 pour l'écran (`ConflictPanel`, via `adaptateurs.ts`) : pour chaque objet en cause,
 * la version du serveur (`etatServeur` du 409) et la version locale (optimiste, au moment du refus), avec les
 * écarts champ par champ. Fonctions pures.
 */
import type { EnveloppeCommandes, IdObjet, ObjetModele, TypeCommande } from "@parcours/atelier-model";
import type { DetailErreur } from "../../../lib/api/atelier-commandes";
import type { ConflitEnregistre } from "./types";

export interface EcartChamp {
  readonly cle: string;
  readonly serveur: string;
  readonly local: string;
}

export interface ObjetEnConflit {
  readonly objetId: IdObjet;
  readonly motif: string;
  readonly serveur: ObjetModele | null;
  readonly local: ObjetModele | null;
  readonly ecarts: readonly EcartChamp[];
}

export interface DonneesConflit {
  readonly requestId: string;
  readonly label: string;
  readonly recuLe: string;
  readonly baseRevision: number;
  readonly revisionCourante: number;
  readonly commandes: readonly TypeCommande[];
  /** Lots suivants, bloqués derrière celui-ci (ordre préservé). */
  readonly lotsBloques: number;
  readonly objets: readonly ObjetEnConflit[];
  readonly erreursRevalidation: readonly DetailErreur[];
}

const ABSENT = "absent";

/** Valeur lisible et compacte (grandeurs `{ value, unit }`, points, listes). */
export function valeurLisible(v: unknown): string {
  if (v === undefined) return ABSENT;
  if (v === null) return "retiré";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v === "object" && v !== null && "value" in v && "unit" in v) return `${String((v as { value: unknown }).value)} ${String((v as { unit: unknown }).unit)}`;
  const s = JSON.stringify(v);
  return s.length > 160 ? `${s.slice(0, 157)}…` : s;
}

/** Écarts entre deux versions d'un objet : paramètres, puis niveau, calque, groupe, type. */
export function ecartsObjet(serveur: ObjetModele | null, local: ObjetModele | null): EcartChamp[] {
  if (!serveur || !local) {
    if (!serveur && !local) return [];
    return [{ cle: "existence", serveur: serveur ? "présent" : "supprimé", local: local ? "présent" : "supprimé" }];
  }
  const ecarts: EcartChamp[] = [];
  const ps = serveur.params as unknown as Record<string, unknown>;
  const pl = local.params as unknown as Record<string, unknown>;
  for (const cle of [...new Set([...Object.keys(ps), ...Object.keys(pl)])].sort()) {
    if (JSON.stringify(ps[cle]) !== JSON.stringify(pl[cle])) ecarts.push({ cle, serveur: valeurLisible(ps[cle]), local: valeurLisible(pl[cle]) });
  }
  for (const cle of ["niveauId", "calqueId", "groupeId", "definitionId"] as const) {
    if (serveur[cle] !== local[cle]) ecarts.push({ cle, serveur: valeurLisible(serveur[cle]), local: valeurLisible(local[cle]) });
  }
  return ecarts;
}

export function donneesConflit(requestId: string, enveloppe: EnveloppeCommandes, conflit: ConflitEnregistre, lotsBloques: number): DonneesConflit {
  return {
    requestId,
    label: enveloppe.label,
    recuLe: conflit.recuLe,
    baseRevision: conflit.reponse.baseRevision,
    revisionCourante: conflit.reponse.revisionCourante,
    commandes: enveloppe.commands.map((c) => c.type),
    lotsBloques,
    objets: conflit.reponse.conflits.map((c) => {
      const local = conflit.objetsLocaux[c.objetId] ?? null;
      return { objetId: c.objetId, motif: c.motif, serveur: c.etatServeur, local, ecarts: ecartsObjet(c.etatServeur, local) };
    }),
    erreursRevalidation: conflit.erreursRevalidation,
  };
}
