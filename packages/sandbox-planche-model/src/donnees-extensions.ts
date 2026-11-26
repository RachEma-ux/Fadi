/**
 * Données attachées par une extension (protocole 1.0, lot 5, permission « donnees ») : des clés et des valeurs posées
 * sur un objet, sur un composant ou sur le projet, enregistrées avec le dessin. Pur : ni React, ni DOM.
 *
 *   donnees.lire     { cible, cle? }          la valeur d'une clé (`null` si absente), ou toutes les clés de la cible
 *   donnees.ecrire   { cible, cle, valeur }   pose la valeur ; une modification, donc dans une opération
 *   donnees.effacer  { cible, cle? }          retire une clé, ou toutes celles de l'extension sur la cible
 *
 * Cibles : `"projet"`, l'identifiant d'un objet (groupe ou occurrence de composant) du contexte courant, ou
 * `{ composant: <identifiant d'une occurrence> }` pour le composant lui-même (toutes ses occurrences le partagent).
 *
 * Règles :
 *  - chaque extension range ses données sous son propre identifiant et ne voit jamais celles d'une autre ;
 *  - une valeur est une donnée (texte, nombre fini, booléen, `null`, listes et objets de ceux-ci), bornée ;
 *  - les données d'un objet le suivent quand il est copié et disparaissent avec lui ; celles d'un composant
 *    appartiennent à sa définition ; celles du projet sont rangées avec les réglages du dessin.
 */
import { REGLAGES_DEFAUT } from "./annotations.js";
import { contexte, definirDonneesDefinition, definirDonneesOccurrence, modifierAnnotations, type DonneesExtensions, type Id, type Modele, type Resultat } from "./geometrie-libre.js";

export const BORNES_DONNEES = { cle: 60, valeur: 4000, cles: 100, profondeur: 8 } as const;

const MOTIF_CLE = /^[a-zA-Z][a-zA-Z0-9_.-]{0,59}$/;

export type CibleDonnees = { readonly genre: "projet" } | { readonly genre: "objet"; readonly id: Id } | { readonly genre: "composant"; readonly occurrence: Id };

export type MotifDonnees = "cible" | "cle" | "valeur" | "trop" | "introuvable";
export type LectureDonnees<T> = { readonly ok: true; readonly valeur: T } | { readonly ok: false; readonly motif: MotifDonnees; readonly detail: string };

const estObjet = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const refus = (motif: MotifDonnees, detail: string): { readonly ok: false; readonly motif: MotifDonnees; readonly detail: string } => ({ ok: false, motif, detail });

/** Relit la cible d'une demande ; `null` = forme refusée. */
export function lireCibleDonnees(v: unknown): CibleDonnees | null {
  if (v === "projet") return { genre: "projet" };
  if (typeof v === "string" && v.length > 0 && v.length <= 64) return { genre: "objet", id: v };
  if (estObjet(v) && Object.keys(v).length === 1 && typeof v["composant"] === "string" && v["composant"].length > 0 && v["composant"].length <= 64) return { genre: "composant", occurrence: v["composant"] };
  return null;
}

export const estCleDonnee = (v: unknown): v is string => typeof v === "string" && MOTIF_CLE.test(v);

/** Une valeur est-elle une donnée transmissible et bornée ? Rend sa copie figée, ou `undefined`. */
export function lireValeurDonnee(v: unknown): { readonly valeur: unknown } | undefined {
  const copier = (x: unknown, niveau: number): unknown => {
    if (x === null || typeof x === "string" || typeof x === "boolean") return x;
    if (typeof x === "number") {
      if (!Number.isFinite(x)) throw new Error("nombre");
      return x;
    }
    if (niveau >= BORNES_DONNEES.profondeur) throw new Error("profondeur");
    if (Array.isArray(x)) return Object.freeze(x.map((y) => copier(y, niveau + 1)));
    if (estObjet(x) && (Object.getPrototypeOf(x) === Object.prototype || Object.getPrototypeOf(x) === null)) {
      const r: Record<string, unknown> = {};
      for (const [k, y] of Object.entries(x)) {
        if (k === "__proto__") throw new Error("cle");
        r[k] = copier(y, niveau + 1);
      }
      return Object.freeze(r);
    }
    throw new Error("genre");
  };
  try {
    const valeur = copier(v, 0);
    return JSON.stringify(valeur).length <= BORNES_DONNEES.valeur ? { valeur } : undefined;
  } catch {
    return undefined;
  }
}

/** Données de toutes les extensions sur la cible, ou un refus si la cible n'existe pas dans le contexte. */
function porteur(m: Modele, cible: CibleDonnees, dans: Id | undefined): LectureDonnees<{ readonly donnees: DonneesExtensions | undefined; readonly definition?: Id }> {
  if (cible.genre === "projet") return { ok: true, valeur: { donnees: m.annotations?.reglages?.donneesExtensions } };
  const id = cible.genre === "objet" ? cible.id : cible.occurrence;
  const occ = contexte(m, dans).occurrences[id];
  if (!occ) return refus("introuvable", id);
  if (cible.genre === "objet") return { ok: true, valeur: { donnees: occ.donnees } };
  const d = m.definitions[occ.definition];
  if (!d) return refus("introuvable", id);
  return { ok: true, valeur: { donnees: d.donnees, definition: d.id } };
}

/** Toutes les clés de l'extension sur la cible (objet vide si aucune). */
export function lireDonneesExtension(m: Modele, extension: string, cible: CibleDonnees, dans?: Id): LectureDonnees<Readonly<Record<string, unknown>>> {
  const p = porteur(m, cible, dans);
  if (!p.ok) return p;
  return { ok: true, valeur: (Object.prototype.hasOwnProperty.call(p.valeur.donnees ?? {}, extension) ? p.valeur.donnees![extension] : undefined) ?? {} };
}

/**
 * Pose (`valeur` donnée), retire une clé (`valeur` absente), ou retire toutes les clés de l'extension (`cle` absente)
 * sur la cible. Rend l'opération du modèle ; `null` dans `valeur` = rien à changer.
 */
export function changerDonneesExtension(m: Modele, extension: string, cible: CibleDonnees, changement: { readonly cle?: string; readonly valeur?: { readonly valeur: unknown } }, dans?: Id): LectureDonnees<Resultat | null> {
  const p = porteur(m, cible, dans);
  if (!p.ok) return p;
  const toutes = p.valeur.donnees ?? {};
  const miennes: Record<string, unknown> = { ...(Object.prototype.hasOwnProperty.call(toutes, extension) ? toutes[extension] : {}) };
  if (changement.cle === undefined) {
    if (Object.keys(miennes).length === 0) return { ok: true, valeur: null };
    for (const k of Object.keys(miennes)) delete miennes[k];
  } else if (changement.valeur === undefined) {
    if (!Object.prototype.hasOwnProperty.call(miennes, changement.cle)) return { ok: true, valeur: null };
    delete miennes[changement.cle];
  } else {
    if (!Object.prototype.hasOwnProperty.call(miennes, changement.cle) && Object.keys(miennes).length >= BORNES_DONNEES.cles) return refus("trop", `${BORNES_DONNEES.cles} clés au plus par cible`);
    if (Object.prototype.hasOwnProperty.call(miennes, changement.cle) && JSON.stringify(miennes[changement.cle]) === JSON.stringify(changement.valeur.valeur)) return { ok: true, valeur: null };
    miennes[changement.cle] = changement.valeur.valeur;
  }
  const { [extension]: _ancien, ...autres } = toutes;
  const suite: Record<string, Readonly<Record<string, unknown>>> = { ...autres, ...(Object.keys(miennes).length ? { [extension]: Object.freeze(miennes) } : {}) };
  const donnees: DonneesExtensions | undefined = Object.keys(suite).length ? Object.freeze(suite) : undefined;
  if (cible.genre === "objet") return { ok: true, valeur: definirDonneesOccurrence(m, cible.id, donnees, dans !== undefined ? { dans } : {}) };
  if (cible.genre === "composant") return { ok: true, valeur: definirDonneesDefinition(m, p.valeur.definition!, donnees) };
  return {
    ok: true,
    valeur: modifierAnnotations(m, (a) => {
      const { donneesExtensions: _anciennes, ...reste } = a.reglages ?? REGLAGES_DEFAUT;
      a.reglages = donnees ? { ...reste, donneesExtensions: donnees } : reste;
    }),
  };
}
