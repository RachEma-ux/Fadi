/**
 * Grandeurs typées (cahier §5.2 : « toute grandeur est `{ value, unit }` »).
 *
 * Stockage en unités SI (T03) ; l'unité d'affichage (cm, mm…) est un état d'affichage, jamais une donnée du
 * modèle. Les angles canoniques sont en degrés (`°`), comme dans les fiches (DA-01-03, DA-07-10) ; `rad`
 * n'existe que pour les tolérances numériques (D-012).
 */

/** Unités admises dans le modèle. `kg/m²` et `kN/m²` servent aux charges déclarées (structureDeclaree). */
export const UNITES = ["m", "m²", "m³", "°", "rad", "kg/m²", "kN/m²"] as const;
export type Unite = (typeof UNITES)[number];

/** Grandeur physique : valeur numérique finie et unité explicite. */
export interface Grandeur<U extends Unite = Unite> {
  readonly value: number;
  readonly unit: U;
}

export type Longueur = Grandeur<"m">;
export type Aire = Grandeur<"m²">;
export type Volume = Grandeur<"m³">;
export type Angle = Grandeur<"°">;
export type ChargeSurfacique = Grandeur<"kg/m²"> | Grandeur<"kN/m²">;

export function estUnite(u: unknown): u is Unite {
  return typeof u === "string" && (UNITES as readonly string[]).includes(u);
}

/** Vrai si `x` est une grandeur bien formée (valeur finie) dans l'unité attendue (ou dans une unité admise). */
export function estGrandeur<U extends Unite>(x: unknown, unite?: U): x is Grandeur<U> {
  if (typeof x !== "object" || x === null) return false;
  const g = x as { value?: unknown; unit?: unknown };
  if (typeof g.value !== "number" || !Number.isFinite(g.value)) return false;
  if (!estUnite(g.unit)) return false;
  return unite === undefined || g.unit === unite;
}

/** Erreur levée par les constructeurs quand une grandeur est mal formée. */
export class ErreurUnite extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErreurUnite";
  }
}

function grandeur<U extends Unite>(value: number, unit: U): Grandeur<U> {
  if (!Number.isFinite(value)) throw new ErreurUnite(`valeur non finie pour une grandeur en ${unit} : ${String(value)}`);
  return { value, unit };
}

/** Constructeurs (aucune conversion, aucun arrondi : la valeur est conservée bit à bit). */
export const longueur = (value: number): Longueur => grandeur(value, "m");
export const aire = (value: number): Aire => grandeur(value, "m²");
export const volume = (value: number): Volume => grandeur(value, "m³");
export const angle = (value: number): Angle => grandeur(value, "°");

/**
 * Contrôle d'unité pour la validation à l'exécution (données venues de JSON, commandes reçues).
 * Retourne un message d'erreur, ou `null` si la grandeur est conforme.
 */
export function controlerGrandeur(x: unknown, unite: Unite): string | null {
  if (typeof x !== "object" || x === null) return `grandeur attendue en ${unite}`;
  const g = x as { value?: unknown; unit?: unknown };
  if (typeof g.value !== "number" || !Number.isFinite(g.value)) return `valeur numérique finie attendue (${unite})`;
  if (g.unit !== unite) return `unité « ${String(g.unit)} » incompatible, « ${unite} » attendue`;
  return null;
}
