import { fail, finite, identifier, record } from "../noyau/validation.js";
import { id } from "../registre/schemas-base.js";

/**
 * Niveaux comme objets (lot W3-B, X.1-04 ; EX-064 : « un objet architectural possède type, paramètres, **niveau**, hôtes,
 * relations… ») : un niveau a un identifiant, un **nom** et une **cote** (altitude du niveau, m, repère `local-3d`), tous
 * saisis. Rangés dans le tableau facultatif `StudioDocument.niveaux` (extension additive) : un document sans niveau reste
 * valide et relu à l'identique.
 *
 * Rattachement : un objet architectural posé librement (mur, échelle d'accès, poteau, poutre, dalle) et une occurrence de
 * composant portent un `niveauId` facultatif ; une ouverture suit le niveau de son mur. Les cotes des objets restent
 * **absolues** (aucune lecture n'a besoin du niveau pour placer un objet) ; changer la cote d'un niveau
 * (`studio.niveau.definir`) translate verticalement, dans la même commande, tous les objets qui lui sont rattachés.
 * La géométrie libre (formes 2D, solides libres) n'est jamais rattachée : aucune signification BIM ne lui est acquise
 * (A.3-09). Pur : ni React, ni DOM.
 */

export interface StudioNiveau {
  id: string;
  /** Nom saisi (non vide, 80 caractères au plus). */
  nom: string;
  /** Cote du niveau (m, repère `local-3d`) : altitude saisie, jamais supposée. */
  cote: number;
}

/** Bornes techniques (pas des valeurs métier). */
export const STUDIO_LIMITES_NIVEAUX = Object.freeze({ niveaux: 1000, nom: 80, coteMax: 1e6 } as const);

export const SCHEMA_NIVEAU = {
  type: "object", additionalProperties: false, required: ["id", "nom", "cote"],
  properties: { id, nom: { type: "string", minLength: 1, maxLength: STUDIO_LIMITES_NIVEAUX.nom }, cote: { type: "number" } },
} as const;

/** Nom saisi : chaîne non vide (hors blancs), sans caractère nul, bornée. */
export function nomSaisi(value: unknown, path: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.includes("\0")) fail(path, "nom non vide attendu");
  if (value.length > max) fail(path, `nom de ${max} caractères au plus`);
  return value;
}

export function validerNiveau(value: unknown, path: string): StudioNiveau {
  const o = record(value, ["id", "nom", "cote"], path);
  const cote = finite(o.cote, `${path}.cote`);
  if (Math.abs(cote) > STUDIO_LIMITES_NIVEAUX.coteMax) fail(`${path}.cote`, "cote de 1 000 000 m au plus en valeur absolue");
  return { id: identifier(o.id, `${path}.id`), nom: nomSaisi(o.nom, `${path}.nom`, STUDIO_LIMITES_NIVEAUX.nom), cote: Object.is(cote, -0) ? 0 : cote };
}

/** Liste des niveaux d'un document : bornée, identifiants uniques dans la liste (l'unicité globale est contrôlée par le document). */
export function validerNiveaux(raw: readonly unknown[], path: string): StudioNiveau[] {
  if (raw.length > STUDIO_LIMITES_NIVEAUX.niveaux) fail(path, `${STUDIO_LIMITES_NIVEAUX.niveaux} niveaux au plus`);
  const niveaux = raw.map((n, i) => validerNiveau(n, `${path}[${i}]`));
  const ids = new Set<string>();
  for (const n of niveaux) {
    if (ids.has(n.id)) fail(path, `identifiant de niveau dupliqué : ${n.id}`);
    ids.add(n.id);
  }
  return niveaux;
}

/** Niveaux rangés par cote croissante (affichage, IFC) ; à cote égale, l'ordre du document. Copie. */
export function studioNiveauxParCote(niveaux: readonly StudioNiveau[] | undefined): StudioNiveau[] {
  return (niveaux ?? []).map((n, i) => ({ n, i })).sort((a, b) => a.n.cote - b.n.cote || a.i - b.i).map(({ n }) => n);
}
