/**
 * Empreinte d'entrée d'une tâche de Studio (D.2-02) : identifiant de révision du document plus empreinte de ses
 * paramètres. Deux tâches de même empreinte calculent la même chose ; une empreinte nouvelle sur la même clé périme la
 * précédente.
 *
 * - Révision : les documents de Studio sont immuables (chaque commande produit un nouvel objet). Chaque objet document
 *   reçoit donc, à sa première rencontre, un numéro croissant (`revisionDocument`) : deux brouillons différents n'ont
 *   jamais le même numéro, et un brouillon plus récent a toujours un numéro plus grand. Le numéro vaut pour la session
 *   seulement ; il n'est jamais enregistré.
 * - Paramètres : hachage FNV-1a 32 bits d'un JSON stable (clés triées). Ce n'est pas une empreinte cryptographique :
 *   elle sert à reconnaître un même calcul, jamais à prouver une intégrité.
 *
 * Pur : ni React, ni DOM.
 */

export interface Empreinte {
  /** Révision du document lu (numéro de session, voir `revisionDocument`), ou identifiant fourni par l'appelant. */
  revision: string;
  /** Hachage des paramètres (`hacher`). */
  parametres: string;
}

const revisions = new WeakMap<object, number>();
let prochaine = 1;

/** Numéro de révision de session d'un document immuable : stable pour un même objet, croissant pour un nouvel objet. */
export function revisionDocument(doc: object): number {
  let r = revisions.get(doc);
  if (r === undefined) { r = prochaine++; revisions.set(doc, r); }
  return r;
}

/** JSON à clés triées (les tableaux gardent leur ordre) ; `undefined` est omis comme dans `JSON.stringify`. */
export function jsonStable(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map((x) => (x === undefined ? "null" : jsonStable(x))).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => `${JSON.stringify(k)}:${jsonStable(o[k])}`).join(",")}}`;
}

/** Hachage FNV-1a 32 bits (hexadécimal, 8 caractères) du JSON stable de `v`. */
export function hacher(v: unknown): string {
  const s = jsonStable(v);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export function empreinteDe(doc: object, parametres: unknown = null): Empreinte {
  return { revision: String(revisionDocument(doc)), parametres: hacher(parametres) };
}

export const memeEmpreinte = (a: Empreinte, b: Empreinte): boolean => a.revision === b.revision && a.parametres === b.parametres;

export const texteEmpreinte = (e: Empreinte): string => `${e.revision}:${e.parametres}`;
