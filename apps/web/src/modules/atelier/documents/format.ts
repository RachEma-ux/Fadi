/**
 * Affichage des valeurs du module « documents simples » (L3a.5), en français. Module pur.
 *
 * - Cote (DA-15-02) : valeur **exacte** de ‖b − a‖ (aucun arrondi), au moins deux décimales comme le prototype
 *   (« 4,50 m », « 4,125 m », « 38,13 m ») ;
 * - Mètre (DA-15-01) : trois décimales à l'affichage (« 4,500 m », au millimètre comme le prototype) ; la valeur
 *   interne n'est jamais arrondie ;
 * - CSV : séparateur `;`, cellules entre guillemets, `'` devant `= + - @` (protection contre l'injection de formule,
 *   règle du prototype), nombres exacts (`String(n)`).
 */
import type { ErreurLisible } from "../socle";

export const lisible = (objet: string, cause: string, action: string): ErreurLisible => ({ objet, cause, action, message: `${objet} : ${cause} — ${action}` });

/** Nombre → texte exact, virgule décimale, au moins `min` décimales (zéros complétés, jamais d'arrondi). */
export function texteExactMin(n: number, min = 2): string {
  if (!Number.isFinite(n)) return String(n);
  const s = String(Object.is(n, -0) ? 0 : n);
  if (/e/i.test(s)) return s.replace(".", ",");
  const [ent, dec = ""] = s.split(".");
  return `${ent},${dec.padEnd(min, "0")}`;
}

/** Texte d'une cote : valeur exacte en mètres. */
export const texteCote = (longueur: number): string => `${texteExactMin(longueur, 2)} m`;

/** Valeur arrondie pour la lecture seule (mètre) : `decimales` fixes, virgule décimale. */
export function texteFixe(n: number, decimales: number): string {
  if (!Number.isFinite(n)) return "—";
  const s = n.toFixed(decimales);
  return (/^-0(\.0*)?$/.test(s) ? s.slice(1) : s).replace(".", ",");
}

export const texteMetre = (m: number): string => `${texteFixe(m, 3)} m`;
export const texteDegres = (d: number): string => `${texteFixe(d, 1)}°`;

/** Cellule CSV protégée. */
export function celluleCsv(v: string | number): string {
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  return `"${v.replace(/^[=+\-@]/, "'$&").replace(/"/g, '""')}"`;
}

/** Nom de fichier sûr (lettres, chiffres, `-`, `_`, `.`). */
export const nomSur = (s: string): string => s.normalize("NFD").replace(/\p{M}/gu, "").replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "") || "x";
