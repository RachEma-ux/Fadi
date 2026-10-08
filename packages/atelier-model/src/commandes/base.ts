/**
 * Socle des commandes (contrat `atelier-commands/1`) : enveloppe, erreurs, identifiants déterministes,
 * lecture validée des paramètres, effets, inverse par instantané différentiel.
 */
import type { ModeleAtelier, Probleme } from "../modele.js";
import { estAngle, estLongueur, estPoint2, type Angle, type Longueur, type Point2 } from "../unites.js";

/** Contrat courant (lot 7 de la Planche : commandes `planche.*`). Les lots écrits sous `/1` restent acceptés : mêmes commandes, mêmes réducteurs. */
export const CONTRAT_COMMANDES = "atelier-commands/2" as const;
export const CONTRATS_ACCEPTES = ["atelier-commands/1", "atelier-commands/2"] as const;
export type ContratCommandes = (typeof CONTRATS_ACCEPTES)[number];

export interface Commande {
  type: string;
  params: Record<string, unknown>;
  cibles?: string[];
}

export interface Enveloppe {
  requestId: string;
  baseRevision: number;
  contract: ContratCommandes;
  label: string;
  commands: Commande[];
}

export type CodeErreur = "invalide" | "precondition" | "inconnue";

export class ErreurCommande extends Error {
  constructor(
    public readonly code: CodeErreur,
    public readonly chemin: string,
    message: string,
  ) {
    super(message);
    this.name = "ErreurCommande";
  }
}

export interface Effets {
  crees: string[];
  modifies: string[];
  supprimes: string[];
  problemes: Probleme[];
  referencesAReparer: string[];
  niveauxTouches: string[];
}

export const effetsVides = (): Effets => ({ crees: [], modifies: [], supprimes: [], problemes: [], referencesAReparer: [], niveauxTouches: [] });

export function fusionnerEffets(a: Effets, b: Effets): Effets {
  const u = (x: string[], y: string[]) => [...new Set([...x, ...y])];
  return {
    crees: u(a.crees, b.crees),
    modifies: u(a.modifies, b.modifies).filter((id) => !b.crees.includes(id) && !a.crees.includes(id)),
    supprimes: u(a.supprimes, b.supprimes),
    problemes: [...a.problemes, ...b.problemes],
    referencesAReparer: u(a.referencesAReparer, b.referencesAReparer),
    niveauxTouches: u(a.niveauxTouches, b.niveauxTouches),
  };
}

export interface IdGenerateur {
  nouveau(prefixe: string): string;
}

/** Identifiants dérivés du `requestId` : le même lot produit les mêmes identifiants dans le navigateur et sur le serveur. */
export function generateurIds(requestId: string): IdGenerateur {
  let n = 0;
  const base = requestId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32) || "cmd";
  return { nouveau: (prefixe) => `${prefixe}-${base}-${(++n).toString(36)}` };
}

export interface ContexteCommande {
  ids: IdGenerateur;
}

export interface ResultatCommande {
  etat: ModeleAtelier;
  effets: Effets;
}

export type Reducteur = (etat: ModeleAtelier, params: Record<string, unknown>, ctx: ContexteCommande, cibles: string[]) => ResultatCommande;

// ---------------------------------------------------------------------------
// Lecture validée des paramètres
// ---------------------------------------------------------------------------

export const lire = {
  chaine(params: Record<string, unknown>, cle: string, options: { optionnel?: boolean } = {}): string {
    const v = params[cle];
    if (v === undefined || v === null) {
      if (options.optionnel) return "";
      throw new ErreurCommande("invalide", cle, `paramètre « ${cle} » requis`);
    }
    if (typeof v !== "string") throw new ErreurCommande("invalide", cle, `« ${cle} » doit être une chaîne`);
    return v;
  },
  chaineOuNull(params: Record<string, unknown>, cle: string): string | null {
    const v = params[cle];
    if (v === undefined || v === null) return null;
    if (typeof v !== "string") throw new ErreurCommande("invalide", cle, `« ${cle} » doit être une chaîne`);
    return v;
  },
  booleen(params: Record<string, unknown>, cle: string, defaut: boolean): boolean {
    const v = params[cle];
    if (v === undefined || v === null) return defaut;
    if (typeof v !== "boolean") throw new ErreurCommande("invalide", cle, `« ${cle} » doit être un booléen`);
    return v;
  },
  nombre(params: Record<string, unknown>, cle: string, options: { min?: number; max?: number; optionnel?: boolean; entier?: boolean } = {}): number | null {
    const v = params[cle];
    if (v === undefined || v === null) {
      if (options.optionnel) return null;
      throw new ErreurCommande("invalide", cle, `paramètre « ${cle} » requis`);
    }
    if (typeof v !== "number" || !Number.isFinite(v)) throw new ErreurCommande("invalide", cle, `« ${cle} » doit être un nombre`);
    if (options.entier && !Number.isInteger(v)) throw new ErreurCommande("invalide", cle, `« ${cle} » doit être un entier`);
    if (options.min !== undefined && v < options.min) throw new ErreurCommande("invalide", cle, `« ${cle} » doit être ≥ ${options.min}`);
    if (options.max !== undefined && v > options.max) throw new ErreurCommande("invalide", cle, `« ${cle} » doit être ≤ ${options.max}`);
    return v;
  },
  longueur(params: Record<string, unknown>, cle: string, options: { min?: number; strict?: boolean; optionnel?: boolean } = {}): Longueur | null {
    const v = params[cle];
    if (v === undefined || v === null) {
      if (options.optionnel) return null;
      throw new ErreurCommande("invalide", cle, `paramètre « ${cle} » requis (grandeur { value, unit: "m" })`);
    }
    if (!estLongueur(v)) throw new ErreurCommande("invalide", cle, `« ${cle} » doit être une longueur en mètres ({ value, unit: "m" }) — unité incompatible refusée`);
    if (options.strict && v.value <= 0) throw new ErreurCommande("invalide", cle, `« ${cle} » doit être strictement positive`);
    if (options.min !== undefined && v.value < options.min) throw new ErreurCommande("invalide", cle, `« ${cle} » doit être ≥ ${options.min} m`);
    return { value: v.value, unit: "m" };
  },
  angle(params: Record<string, unknown>, cle: string, options: { optionnel?: boolean } = {}): Angle | null {
    const v = params[cle];
    if (v === undefined || v === null) {
      if (options.optionnel) return null;
      throw new ErreurCommande("invalide", cle, `paramètre « ${cle} » requis (angle { value, unit: "deg" })`);
    }
    if (!estAngle(v)) throw new ErreurCommande("invalide", cle, `« ${cle} » doit être un angle en degrés`);
    return { value: v.value, unit: "deg" };
  },
  point(params: Record<string, unknown>, cle: string, options: { optionnel?: boolean } = {}): Point2 | null {
    const v = params[cle];
    if (v === undefined || v === null) {
      if (options.optionnel) return null;
      throw new ErreurCommande("invalide", cle, `paramètre « ${cle} » requis (point { x, y, frame: "local", unit: "m" })`);
    }
    if (!estPoint2(v)) throw new ErreurCommande("invalide", cle, `« ${cle} » doit être un point du repère local en mètres`);
    return { x: v.x, y: v.y, frame: "local", unit: "m" };
  },
  points(params: Record<string, unknown>, cle: string, options: { min?: number; optionnel?: boolean } = {}): Point2[] {
    const v = params[cle];
    if (v === undefined || v === null) {
      if (options.optionnel) return [];
      throw new ErreurCommande("invalide", cle, `paramètre « ${cle} » requis (liste de points)`);
    }
    if (!Array.isArray(v) || !v.every(estPoint2)) throw new ErreurCommande("invalide", cle, `« ${cle} » doit être une liste de points du repère local`);
    if (options.min !== undefined && v.length < options.min) throw new ErreurCommande("invalide", cle, `« ${cle} » doit contenir au moins ${options.min} points`);
    return v.map((p) => ({ x: p.x, y: p.y, frame: "local", unit: "m" }));
  },
  trous(params: Record<string, unknown>, cle = "trous"): Point2[][] {
    const v = params[cle];
    if (v === undefined || v === null) return [];
    if (!Array.isArray(v) || !v.every((t) => Array.isArray(t) && t.every(estPoint2) && t.length >= 3)) throw new ErreurCommande("invalide", cle, `« ${cle} » doit être une liste de contours (≥ 3 points)`);
    return v.map((t: Point2[]) => t.map((p) => ({ x: p.x, y: p.y, frame: "local" as const, unit: "m" as const })));
  },
  enumeration<T extends string>(params: Record<string, unknown>, cle: string, valeurs: readonly T[], defaut?: T): T {
    const v = params[cle];
    if (v === undefined || v === null) {
      if (defaut !== undefined) return defaut;
      throw new ErreurCommande("invalide", cle, `paramètre « ${cle} » requis (${valeurs.join(" / ")})`);
    }
    if (typeof v !== "string" || !valeurs.includes(v as T)) throw new ErreurCommande("invalide", cle, `« ${cle} » doit valoir ${valeurs.join(" / ")}`);
    return v as T;
  },
  niveau(etat: ModeleAtelier, params: Record<string, unknown>, cle = "niveauId"): string {
    const id = lire.chaine(params, cle);
    if (!etat.niveaux[id]) throw new ErreurCommande("precondition", cle, `niveau inconnu : ${id}`);
    return id;
  },
  objet(etat: ModeleAtelier, params: Record<string, unknown>, cle: string): string {
    const id = lire.chaine(params, cle);
    if (!etat.objets[id]) throw new ErreurCommande("precondition", cle, `objet inconnu : ${id}`);
    return id;
  },
  calque(etat: ModeleAtelier, params: Record<string, unknown>, cle = "calqueId"): string | null {
    const id = lire.chaineOuNull(params, cle);
    if (id === null) return null;
    const calque = etat.calques[id];
    if (!calque) throw new ErreurCommande("precondition", cle, `calque inconnu : ${id}`);
    if (calque.verrouille) throw new ErreurCommande("precondition", cle, `calque verrouillé : ${calque.nom}`);
    return id;
  },
};

// ---------------------------------------------------------------------------
// Inverse par instantané différentiel
// ---------------------------------------------------------------------------

type Cle = "niveaux" | "objets" | "relations" | "definitions" | "calques" | "groupes" | "references" | "problemes";
const CLES: readonly Cle[] = ["niveaux", "objets", "relations", "definitions", "calques", "groupes", "references", "problemes"];

export interface InstantaneDiff {
  avant: Partial<Record<Cle, Record<string, unknown>>>;
  crees: Partial<Record<Cle, string[]>>;
  site?: ModeleAtelier["site"];
  proprietes?: ModeleAtelier["proprietes"];
}

/** Ce qu'il faut pour revenir de `apres` à `avant` : entrées modifiées ou supprimées (valeur d'avant) et entrées créées (à retirer). */
export function differentiel(avant: ModeleAtelier, apres: ModeleAtelier): InstantaneDiff {
  const diff: InstantaneDiff = { avant: {}, crees: {} };
  for (const cle of CLES) {
    const a = avant[cle] as Record<string, unknown>;
    const b = apres[cle] as Record<string, unknown>;
    if (a === b) continue;
    const restaurer: Record<string, unknown> = {};
    const crees: string[] = [];
    for (const id of Object.keys(a)) if (a[id] !== b[id]) restaurer[id] = a[id];
    for (const id of Object.keys(b)) if (!(id in a)) crees.push(id);
    if (Object.keys(restaurer).length) diff.avant[cle] = restaurer;
    if (crees.length) diff.crees[cle] = crees;
  }
  if (avant.site !== apres.site) diff.site = avant.site;
  if (avant.proprietes !== apres.proprietes) diff.proprietes = avant.proprietes;
  return diff;
}

export function appliquerDifferentiel(etat: ModeleAtelier, diff: InstantaneDiff): ModeleAtelier {
  const suivant: ModeleAtelier = { ...etat };
  for (const cle of CLES) {
    const restaurer = diff.avant[cle];
    const crees = diff.crees[cle];
    if (!restaurer && !crees) continue;
    const table: Record<string, unknown> = { ...(etat[cle] as Record<string, unknown>) };
    for (const id of crees ?? []) delete table[id];
    for (const [id, valeur] of Object.entries(restaurer ?? {})) table[id] = valeur;
    (suivant as unknown as Record<Cle, Record<string, unknown>>)[cle] = table;
  }
  if (diff.site) suivant.site = diff.site;
  if (diff.proprietes) suivant.proprietes = diff.proprietes;
  return suivant;
}

/** La commande inverse d'un lot : restaurer l'instantané différentiel (type réservé du contrat). */
export const TYPE_RESTAURER = "interne.restaurer";

export function commandeInverse(diff: InstantaneDiff): Commande {
  return { type: TYPE_RESTAURER, params: { diff } };
}

export function nouveauProbleme(ids: IdGenerateur, type: Probleme["type"], objetId: string | null, message: string): Probleme {
  return { id: ids.nouveau("pb"), type, objetId, message };
}
