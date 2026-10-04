/**
 * Affichage et saisie des valeurs de l'interface (L3a.1), en français. Module pur (ni React ni DOM).
 *
 * Règles :
 * - une valeur du modèle est affichée **exacte** dans un champ modifiable (`texteExact` : aucun arrondi, sinon un
 *   champ non touché réécrirait le modèle à la validation) ; l'arrondi n'existe que pour un texte en lecture seule
 *   (`texteCourt`) ;
 * - une saisie se lit en virgule ou point décimal ; une unité tapée est contrôlée : `cm` et `mm` sont convertis
 *   explicitement en m pour un champ en m, toute autre unité différente de celle du champ est refusée avec une
 *   erreur « objet, cause, action » (jamais réinterprétée) ;
 * - une valeur absente est « non renseigné », une `NonEvaluee` « non évaluée » (R3), jamais 0.
 */
import { estNonEvaluee } from "@parcours/atelier-model";
import type { ErreurLisible } from "../socle";

export const NON_RENSEIGNE = "non renseigné";
export const NON_EVALUEE = "non évaluée";

export const lisible = (objet: string, cause: string, action: string): ErreurLisible => ({ objet, cause, action, message: `${objet} : ${cause} — ${action}` });

/** Nombre JavaScript → texte français exact (virgule décimale, aucun arrondi, pas de séparateur de milliers). */
export function texteExact(n: number): string {
  return String(n).replace(".", ",");
}

/** Nombre → texte français arrondi pour la lecture (`maxDecimales`, zéros de fin retirés). */
export function texteCourt(n: number, maxDecimales = 3): string {
  if (!Number.isFinite(n)) return String(n);
  const f = Number(n.toFixed(maxDecimales));
  return texteExact(Object.is(f, -0) ? 0 : f);
}

/** Grandeur `{ value, unit }` reconnue à l'affichage. */
export function estGrandeurAffichable(v: unknown): v is { readonly value: number; readonly unit: string } {
  return typeof v === "object" && v !== null && typeof (v as { value?: unknown }).value === "number" && typeof (v as { unit?: unknown }).unit === "string";
}

/**
 * Valeur quelconque d'un champ → texte de lecture. Formes admises : nombre, grandeur, `NonEvaluee`, texte,
 * booléen, `null` / `undefined` ; tout autre objet est résumé (jamais omis en silence).
 */
export function texteValeur(v: unknown, unite?: string): string {
  if (v === null || v === undefined || v === "") return NON_RENSEIGNE;
  if (estNonEvaluee(v)) return v.motif ? `${NON_EVALUEE} (${v.motif})` : NON_EVALUEE;
  if (typeof v === "number") return unite ? `${texteCourt(v)} ${unite}` : texteCourt(v);
  if (typeof v === "boolean") return v ? "oui" : "non";
  if (typeof v === "string") return v;
  if (estGrandeurAffichable(v)) return `${texteCourt(v.value)} ${v.unit}`;
  if (Array.isArray(v)) return `${v.length} élément(s)`;
  return JSON.stringify(v);
}

/** Valeur numérique d'un champ (nombre ou grandeur), `null` sinon. */
export function nombreDe(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (estGrandeurAffichable(v) && Number.isFinite(v.value)) return v.value;
  return null;
}

/** Texte initial d'un champ modifiable : valeur exacte, vide si absente ou non évaluée. */
export function texteSaisieInitial(v: unknown): string {
  const n = nombreDe(v);
  if (n !== null) return texteExact(n);
  if (typeof v === "string") return v;
  return "";
}

const CONVERSIONS_VERS_M: Readonly<Record<string, number>> = { m: 1, cm: 0.01, mm: 0.001 };
const UNITES_CONNUES = ["m²", "m2", "m³", "m3", "mm", "cm", "m", "°", "deg", "rad", "kg/m²", "kN/m²"];

export type LectureNombre = { readonly ok: true; readonly valeur: number | null } | { readonly ok: false; readonly erreur: ErreurLisible };

/**
 * Lit une saisie numérique dans l'unité `unite` du champ. Vide → `null` (retirer un facultatif, refusé par le
 * contrôle si obligatoire). `libelle` nomme l'objet de l'erreur (« Hauteur », « Longueur »).
 */
export function lireNombre(texte: string, unite: string, libelle: string): LectureNombre {
  const brut = texte.trim().replace(/\s+/g, " ");
  if (brut === "") return { ok: true, valeur: null };
  const m = /^([+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:e[+-]?\d+)?)\s*(.*)$/i.exec(brut);
  if (!m) return { ok: false, erreur: lisible(libelle, `« ${brut} » n'est pas un nombre`, unite ? `saisir un nombre en ${unite}, par exemple 0,25` : "saisir un nombre, par exemple 2") };
  const valeur = Number((m[1] ?? "").replace(",", "."));
  const u = (m[2] ?? "").trim();
  if (!Number.isFinite(valeur)) return { ok: false, erreur: lisible(libelle, "nombre hors limites", "saisir une valeur finie") };
  if (u === "" || u === unite) return { ok: true, valeur };
  if (unite === "°" && u === "deg") return { ok: true, valeur };
  if (unite === "m" && u in CONVERSIONS_VERS_M) return { ok: true, valeur: valeur * (CONVERSIONS_VERS_M[u] ?? 1) };
  if (UNITES_CONNUES.includes(u)) {
    return { ok: false, erreur: lisible(libelle, `grandeur incompatible : ${unite ? `ce champ attend des ${unite}` : "ce champ est sans unité"}, la saisie est en ${u}`, unite ? `saisir la valeur en ${unite}` : "saisir un nombre sans unité") };
  }
  return { ok: false, erreur: lisible(libelle, `unité « ${u} » inconnue`, unite ? `saisir la valeur en ${unite}` : "saisir un nombre sans unité") };
}

/** Altitude et hauteur d'un niveau pour le navigateur : « 0 m · h 3,2 m ». */
export function texteNiveau(elevation: unknown, hauteur: unknown): string {
  const e = nombreDe(elevation);
  const h = nombreDe(hauteur);
  return `${e === null ? NON_RENSEIGNE : `${texteCourt(e)} m`} · h ${h === null ? NON_RENSEIGNE : `${texteCourt(h)} m`}`;
}
