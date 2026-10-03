/**
 * Grandeurs typées et coordonnées taguées (cahier des charges, section 5.2 ; AGENTS.md : jamais de repère
 * implicite). Une longueur est toujours en mètres dans le modèle ; les unités d'affichage sont l'affaire de
 * l'interface. Une coordonnée du modèle est locale (repère du bâtiment) ; la parcelle porte en plus ses sommets
 * cadastraux, convertis explicitement.
 */

export interface Longueur {
  value: number;
  unit: "m";
}

export interface Surface {
  value: number;
  unit: "m2";
}

export interface Angle {
  value: number;
  unit: "deg";
}

export type Repere = "local" | "cadastral" | "geographic";

export interface Point2 {
  x: number;
  y: number;
  frame: "local";
  unit: "m";
}

/** Sommet d'une parcelle : coordonnées cadastrales (CRS déclaré) et locales, toutes deux explicites. */
export interface SommetParcelle {
  id: string;
  cadastral: { x: number; y: number; frame: "cadastral"; crs: string; unit: "m" };
  local: Point2;
}

export const m = (value: number): Longueur => ({ value, unit: "m" });
export const m2 = (value: number): Surface => ({ value, unit: "m2" });
export const deg = (value: number): Angle => ({ value, unit: "deg" });
export const pt = (x: number, y: number): Point2 => ({ x, y, frame: "local", unit: "m" });

export const TOLERANCE_REDUCTEUR = 0.001; // m — coïncidence, longueur nulle (D-012)
export const TOLERANCE_GESTE = 0.01; // m — accrochage de tracé (D-012)
export const TOLERANCE_AIRE_ABS = 0.5; // m² — écart aire déclarée / calculée (D-012, à confirmer)
export const TOLERANCE_AIRE_REL = 0.02; // 2 %

export function estLongueur(v: unknown): v is Longueur {
  return typeof v === "object" && v !== null && (v as Longueur).unit === "m" && Number.isFinite((v as Longueur).value);
}

export function estPoint2(v: unknown): v is Point2 {
  if (typeof v !== "object" || v === null) return false;
  const p = v as Point2;
  return p.frame === "local" && p.unit === "m" && Number.isFinite(p.x) && Number.isFinite(p.y);
}

export function estAngle(v: unknown): v is Angle {
  return typeof v === "object" && v !== null && (v as Angle).unit === "deg" && Number.isFinite((v as Angle).value);
}
