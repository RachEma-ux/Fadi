/**
 * Saisie de précision (DA-01-01, DA-02-16 ; syntaxe validée par la maquette, D-022) : analyse pure du texte tapé.
 *
 * - nombre seul (`4,5`, `4.5`, `450 cm`, `90°`) : valeur du champ courant (longueur en m, angle en °) ;
 * - `x;y` : point absolu du repère local ;
 * - `@dx;dy` : point relatif au dernier point posé ;
 * - `@l<a` : point polaire depuis le dernier point posé (longueur en m, angle en ° depuis +x, sens trigo).
 * Les conversions d'affichage (cm, mm) sont faites ici, **avant** l'envoi : l'outil ne reçoit que des m et des °.
 * Aucun arrondi : la valeur saisie est conservée telle quelle (R7) ; les multiples de 90° sont exacts.
 */
import type { PointLocal } from "@parcours/atelier-model";
import type { ErreurLisible } from "../socle";
import { polaire, pt, type Vec } from "./geometrie";

export type ResultatSaisie =
  | { readonly genre: "valeur"; readonly valeur: number }
  | { readonly genre: "point"; readonly point: PointLocal }
  | { readonly genre: "erreur"; readonly erreur: ErreurLisible };

const erreur = (objet: string, cause: string, action: string): ResultatSaisie => ({ genre: "erreur", erreur: { objet, cause, action, message: `${objet} : ${cause} — ${action}` } });

const FACTEURS_LONGUEUR: Readonly<Record<string, number>> = { "": 1, m: 1, cm: 0.01, mm: 0.001 };

/** Nombre décimal, virgule ou point ; `null` si invalide. */
export function lireNombre(texte: string): number | null {
  const t = texte.trim().replace(/\s+/g, "").replace(",", ".");
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t)) return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
}

/** Longueur avec unité facultative (m, cm, mm), rendue en m. */
export function lireLongueur(texte: string): number | null {
  const m = /^\s*([-+0-9.,eE\s]+?)\s*(m|cm|mm)?\s*$/.exec(texte);
  if (!m) return null;
  const v = lireNombre(m[1] ?? "");
  const f = FACTEURS_LONGUEUR[m[2] ?? ""];
  return v === null || f === undefined ? null : v * f;
}

/** Angle en degrés (suffixe ° facultatif). */
export function lireAngle(texte: string): number | null {
  const m = /^\s*([-+0-9.,eE\s]+?)\s*°?\s*$/.exec(texte);
  return m ? lireNombre(m[1] ?? "") : null;
}

/**
 * Analyse le texte tapé pour le champ `unite` ; `reference` = dernier point posé (saisie relative / polaire).
 */
export function analyserSaisie(texte: string, unite: "m" | "°" | "", reference: Vec | null): ResultatSaisie {
  const t = texte.trim();
  if (t === "") return erreur("Saisie", "valeur vide", "taper un nombre, ex. 4,50");
  const relatif = t.startsWith("@");
  const corps = relatif ? t.slice(1) : t;
  if (corps.includes("<")) {
    if (!relatif) return erreur("Saisie", "coordonnée polaire sans « @ »", "écrire @longueur<angle, ex. @4,5<90");
    if (!reference) return erreur("Saisie", "aucun point de départ", "poser un premier point");
    const [l, a] = corps.split("<");
    const longueur = lireLongueur(l ?? "");
    const angle = lireAngle(a ?? "");
    if (longueur === null || angle === null) return erreur("Saisie", "coordonnée polaire illisible", "écrire @longueur<angle, ex. @4,5<90");
    return { genre: "point", point: polaire(reference, longueur, angle) };
  }
  if (corps.includes(";")) {
    const [a, b] = corps.split(";");
    const x = lireLongueur(a ?? "");
    const y = lireLongueur(b ?? "");
    if (x === null || y === null) return erreur("Saisie", "coordonnées illisibles", relatif ? "écrire @dx;dy, ex. @2;0" : "écrire x;y, ex. 2,5;3");
    if (relatif) {
      if (!reference) return erreur("Saisie", "aucun point de départ", "poser un premier point");
      return { genre: "point", point: pt(reference.x + x, reference.y + y) };
    }
    return { genre: "point", point: pt(x, y) };
  }
  if (relatif) return erreur("Saisie", "saisie relative incomplète", "écrire @dx;dy ou @longueur<angle");
  if (unite === "°") {
    const v = lireAngle(t);
    return v === null ? erreur("Angle", "nombre attendu", "taper un angle en degrés, ex. 90") : { genre: "valeur", valeur: v };
  }
  if (unite === "m") {
    if (/[a-zA-Z]/.test(t.replace(/(cm|mm|m)\s*$/, ""))) return erreur("Longueur", `unité inconnue dans « ${t} »`, "utiliser m, cm ou mm");
    const v = lireLongueur(t);
    return v === null ? erreur("Longueur", "nombre attendu", "taper une longueur, ex. 4,50") : { genre: "valeur", valeur: v };
  }
  const v = lireNombre(t);
  return v === null ? erreur("Valeur", "nombre attendu", "taper un nombre, ex. 3") : { genre: "valeur", valeur: v };
}

/** Le caractère ouvre-t-il la saisie de précision (chiffre, signe, séparateur, `@`) ? */
export const ouvreSaisie = (touche: string): boolean => /^[0-9@.,\-+]$/.test(touche);

/** Affichage d'une valeur de champ : m à 2 décimales, ° à 1 décimale (DA-01-01), virgule décimale. */
export function formaterValeur(valeur: number | null, unite: "m" | "°" | ""): string {
  if (valeur === null || !Number.isFinite(valeur)) return "—";
  const d = unite === "m" ? 2 : unite === "°" ? 1 : Number.isInteger(valeur) ? 0 : 3;
  return `${valeur.toFixed(d).replace(".", ",")}${unite === "" ? "" : unite === "m" ? " m" : "°"}`;
}
