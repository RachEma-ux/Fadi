import { GRANDEURS_QUANTITE, UNITE_GRANDEUR, type GrandeurQuantite, type NatureQuantite } from "../quantites.js";
import { array, fail, finite, identifier, record } from "../noyau/validation.js";
import { STUDIO_LIMITES_EXIGENCES, STUDIO_LIMITES_PROPRIETES } from "./limites.js";

/**
 * Exigences d'une étude Studio (E.1-02 à E.1-04), rangées **à part des résultats dessinés** : un jeu d'exigences
 * versionné par étude, en ajout seul (chaque modification crée la version suivante ; une version n'est jamais
 * réécrite). Pur : ni React, ni DOM, ni stockage — le serveur range les versions (`studio_requirement_sets`).
 *
 * Une exigence vise une **métrique** du métré (`quantitesStudio`) ou une propriété déclarée, avec une comparaison, une
 * valeur, une unité (celle de la métrique, jamais convertie) et une **source déclarée** (texte saisi : document,
 * article, programme…). Fadi ne fournit **aucune** exigence par défaut et aucune donnée réglementaire : un jeu vide
 * est l'état initial. Une exigence n'est jamais réécrite par un contrôle (`composition/ecarts.ts`).
 *
 * Référence partenaire (E.1-04) : une exigence reprise d'une référence partenaire porte `origine.reference` ; elle
 * n'est utilisée par un contrôle qu'après une **acceptation explicite** (qui, quand), posée par le serveur
 * (`accepterExigence`), jamais saisie par le client. Toute modification de son contenu retire l'acceptation.
 */

/** Métrique visée : total (document ou calque), grandeur d'un objet, nombre d'objets métrés, propriété déclarée. */
export type MetriqueExigence =
  | { type: "total"; grandeur: GrandeurQuantite; calqueId?: string }
  | { type: "objet"; objetId: string; grandeur: GrandeurQuantite }
  | { type: "nombre"; nature?: NatureQuantite; calqueId?: string }
  | { type: "propriete"; cibleId: string; nom: string };

export type ComparaisonExigence = "<=" | "<" | ">=" | ">" | "=";
export const COMPARAISONS_EXIGENCE: readonly ComparaisonExigence[] = Object.freeze(["<=", "<", ">=", ">", "="] as const);
/** Unité d'un nombre d'objets. */
export const UNITE_NOMBRE = "u" as const;

export interface AcceptationExigence {
  /** Compte qui a accepté (identifiant et adresse, posés par le serveur). */
  par: string;
  parEmail?: string;
  /** Date ISO 8601 de l'acceptation (horloge du serveur). */
  le: string;
}

export interface ExigenceStudio {
  /** Identifiant stable d'une version à l'autre. */
  id: string;
  libelle: string;
  metrique: MetriqueExigence;
  comparaison: ComparaisonExigence;
  valeur: number;
  /** Écart admis pour `=` seulement (déclaré, ≥ 0) ; absent : égalité exacte. */
  tolerance?: number;
  /** Unité de la métrique (m, m2, m3, u ; unité déclarée de la propriété visée). */
  unite: string;
  /** Source déclarée de l'exigence (obligatoire). */
  source: string;
  /** Exigence reprise d'une référence partenaire : utilisée seulement une fois acceptée. */
  origine?: { reference: string; acceptation?: AcceptationExigence };
}

/** Version d'un jeu d'exigences (append-only). */
export interface JeuExigences {
  studyId: string;
  /** 1, 2, 3… ; la version 1 est le premier enregistrement. */
  version: number;
  exigences: ExigenceStudio[];
  auteur: string;
  creeLe: string;
  motif?: string;
}

const NATURES: readonly NatureQuantite[] = [
  "ligne", "rectangle", "mur", "ligne-extrudee", "prisme", "cercle", "cylindre", "arc", "mur-courbe", "arc-extrude",
  "polyligne-ouverte", "polyligne-ouverte-extrudee", "polyligne-fermee", "prisme-polyligne", "mur-architectural", "ouverture", "non-pris-en-charge",
];

function texte(value: unknown, path: string, max: number, nom: string): string {
  if (typeof value !== "string" || !value.trim() || value.includes("\0")) fail(path, `${nom} non vide attendu`);
  if (value.length > max) fail(path, `${nom} de ${max} caractères au plus`);
  if (value !== value.trim()) fail(path, `${nom} sans espace de bord attendu`);
  return value;
}
function grandeur(value: unknown, path: string): GrandeurQuantite {
  if (typeof value !== "string" || !GRANDEURS_QUANTITE.includes(value as GrandeurQuantite)) fail(path, "grandeur du métré attendue");
  return value as GrandeurQuantite;
}

export function validerMetrique(value: unknown, path: string): MetriqueExigence {
  const t = value && typeof value === "object" ? (value as { type?: unknown }).type : undefined;
  if (t === "total") {
    const o = record(value, ["type", "grandeur"], path, ["calqueId"]);
    return { type: "total", grandeur: grandeur(o.grandeur, `${path}.grandeur`), ...(Object.hasOwn(o, "calqueId") ? { calqueId: identifier(o.calqueId, `${path}.calqueId`) } : {}) };
  }
  if (t === "objet") {
    const o = record(value, ["type", "objetId", "grandeur"], path);
    return { type: "objet", objetId: identifier(o.objetId, `${path}.objetId`), grandeur: grandeur(o.grandeur, `${path}.grandeur`) };
  }
  if (t === "nombre") {
    const o = record(value, ["type"], path, ["nature", "calqueId"]);
    if (Object.hasOwn(o, "nature") && (typeof o.nature !== "string" || !NATURES.includes(o.nature as NatureQuantite))) fail(`${path}.nature`, "nature du métré attendue");
    return {
      type: "nombre",
      ...(Object.hasOwn(o, "nature") ? { nature: o.nature as NatureQuantite } : {}),
      ...(Object.hasOwn(o, "calqueId") ? { calqueId: identifier(o.calqueId, `${path}.calqueId`) } : {}),
    };
  }
  if (t === "propriete") {
    const o = record(value, ["type", "cibleId", "nom"], path);
    return { type: "propriete", cibleId: identifier(o.cibleId, `${path}.cibleId`), nom: texte(o.nom, `${path}.nom`, STUDIO_LIMITES_PROPRIETES.nom, "nom") };
  }
  return fail(`${path}.type`, "métrique total, objet, nombre ou propriete attendue");
}

/** Unité imposée par la métrique (`null` pour une propriété : celle qu'elle déclare, contrôlée au contrôle). */
export function uniteMetrique(m: MetriqueExigence): string | null {
  if (m.type === "total" || m.type === "objet") return UNITE_GRANDEUR[m.grandeur];
  if (m.type === "nombre") return UNITE_NOMBRE;
  return null;
}

function validerAcceptation(value: unknown, path: string): AcceptationExigence {
  const o = record(value, ["par", "le"], path, ["parEmail"]);
  const le = texte(o.le, `${path}.le`, 40, "date");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(le) || Number.isNaN(Date.parse(le))) fail(`${path}.le`, "date ISO 8601 (UTC) attendue");
  return {
    par: identifier(o.par, `${path}.par`),
    ...(Object.hasOwn(o, "parEmail") ? { parEmail: texte(o.parEmail, `${path}.parEmail`, STUDIO_LIMITES_EXIGENCES.auteur, "adresse") } : {}),
    le,
  };
}

export function validerExigence(value: unknown, path: string): ExigenceStudio {
  const o = record(value, ["id", "libelle", "metrique", "comparaison", "valeur", "unite", "source"], path, ["tolerance", "origine"]);
  const metrique = validerMetrique(o.metrique, `${path}.metrique`);
  if (typeof o.comparaison !== "string" || !COMPARAISONS_EXIGENCE.includes(o.comparaison as ComparaisonExigence)) fail(`${path}.comparaison`, "comparaison <=, <, >=, > ou = attendue");
  const comparaison = o.comparaison as ComparaisonExigence;
  const valeurBrute = finite(o.valeur, `${path}.valeur`);
  const unite = texte(o.unite, `${path}.unite`, STUDIO_LIMITES_PROPRIETES.unite, "unité");
  const attendue = uniteMetrique(metrique);
  if (attendue !== null && unite !== attendue) fail(`${path}.unite`, `unité ${attendue} attendue pour cette métrique (aucune conversion)`);
  let tolerance: number | undefined;
  if (Object.hasOwn(o, "tolerance")) {
    if (comparaison !== "=") fail(`${path}.tolerance`, "tolérance admise pour la comparaison = seulement");
    tolerance = finite(o.tolerance, `${path}.tolerance`);
    if (tolerance < 0) fail(`${path}.tolerance`, "tolérance positive ou nulle attendue");
  }
  let origine: ExigenceStudio["origine"];
  if (Object.hasOwn(o, "origine")) {
    const r = record(o.origine, ["reference"], `${path}.origine`, ["acceptation"]);
    origine = {
      reference: texte(r.reference, `${path}.origine.reference`, STUDIO_LIMITES_EXIGENCES.reference, "référence"),
      ...(Object.hasOwn(r, "acceptation") ? { acceptation: validerAcceptation(r.acceptation, `${path}.origine.acceptation`) } : {}),
    };
  }
  return {
    id: identifier(o.id, `${path}.id`), libelle: texte(o.libelle, `${path}.libelle`, STUDIO_LIMITES_EXIGENCES.libelle, "libellé"),
    metrique, comparaison, valeur: Object.is(valeurBrute, -0) ? 0 : valeurBrute,
    ...(tolerance !== undefined ? { tolerance } : {}),
    unite, source: texte(o.source, `${path}.source`, STUDIO_LIMITES_EXIGENCES.source, "source"),
    ...(origine ? { origine } : {}),
  };
}

/** Liste d'exigences d'une version : chacune valide, identifiants uniques, nombre borné. Une liste vide est admise. */
export function validerExigences(value: unknown, path: string): ExigenceStudio[] {
  const raw = array(value, path);
  if (raw.length > STUDIO_LIMITES_EXIGENCES.exigences) fail(path, `${STUDIO_LIMITES_EXIGENCES.exigences} exigences au plus`);
  const out = raw.map((e, i) => validerExigence(e, `${path}[${i}]`));
  const ids = new Set<string>();
  out.forEach((e, i) => {
    if (ids.has(e.id)) fail(`${path}[${i}].id`, "identifiant d’exigence dupliqué");
    ids.add(e.id);
  });
  return out;
}

/** Une exigence de référence partenaire non acceptée n'est pas utilisée par un contrôle. */
export const exigenceUtilisable = (e: ExigenceStudio): boolean => !e.origine || e.origine.acceptation !== undefined;

/** Contenu d'une exigence hors acceptation (comparaison de deux versions). */
function contenu(e: ExigenceStudio): string {
  const { origine, ...reste } = e;
  return JSON.stringify([reste.id, reste.libelle, reste.metrique, reste.comparaison, reste.valeur, reste.tolerance ?? null, reste.unite, reste.source, origine?.reference ?? null]);
}

export type RefusVersion = "version-perimee" | "acceptation-forgee" | "inchangee";

/**
 * Prochaine liste d'exigences (édition) à partir de la version de base : les acceptations ne viennent jamais du client.
 * Une exigence partenaire dont le contenu est inchangé garde l'acceptation de la base ; si son contenu change (ou si elle
 * est nouvelle), toute acceptation proposée est refusée (`acceptation-forgee`) — elle redevient « non acceptée ».
 * Rien à enregistrer si la liste est identique à la base (`inchangee`).
 */
export function preparerVersion(base: readonly ExigenceStudio[], proposees: readonly ExigenceStudio[]): { exigences: ExigenceStudio[] } | { refus: RefusVersion; exigenceId?: string } {
  const parId = new Map(base.map((e) => [e.id, e]));
  const out: ExigenceStudio[] = [];
  for (const e of proposees) {
    const avant = parId.get(e.id);
    const inchangee = avant !== undefined && contenu(avant) === contenu(e);
    if (e.origine?.acceptation) {
      const memeAcceptation = inchangee && JSON.stringify(avant!.origine?.acceptation ?? null) === JSON.stringify(e.origine.acceptation);
      if (!memeAcceptation) return { refus: "acceptation-forgee", exigenceId: e.id };
      out.push(e);
      continue;
    }
    // Contenu inchangé, acceptation omise par le client : l'acceptation de la base est conservée.
    if (e.origine && inchangee && avant!.origine?.acceptation) out.push({ ...e, origine: { ...e.origine, acceptation: avant!.origine.acceptation } });
    else out.push(e);
  }
  if (JSON.stringify(out) === JSON.stringify(base)) return { refus: "inchangee" };
  return { exigences: out };
}

/** Acceptation d'une exigence de référence partenaire (posée par le serveur : qui, quand) ; nouvelle liste ou refus. */
export function accepterExigence(base: readonly ExigenceStudio[], exigenceId: string, acceptation: AcceptationExigence): { exigences: ExigenceStudio[] } | { refus: "exigence-inconnue" | "pas-une-reference" | "deja-acceptee" } {
  const i = base.findIndex((e) => e.id === exigenceId);
  if (i < 0) return { refus: "exigence-inconnue" };
  const e = base[i]!;
  if (!e.origine) return { refus: "pas-une-reference" };
  if (e.origine.acceptation) return { refus: "deja-acceptee" };
  return { exigences: base.map((x, j) => (j === i ? { ...x, origine: { reference: e.origine!.reference, acceptation } } : x)) };
}
