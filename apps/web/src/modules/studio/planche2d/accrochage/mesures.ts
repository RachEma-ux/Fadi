/**
 * Saisie directe pendant le tracé (champ « Mesures ») : « 3 » pose le point suivant à 3 m du dernier point dans la
 * direction courante (pointeur, repérage ou angle imposé) ; « <45 » impose l'angle (degrés, depuis +x vers +y) ;
 * « 3<45 » pose le point à 3 m sous 45°. Point ou virgule décimale. Pur : ni React ni DOM.
 */
import type { StudioPoint } from "@parcours/atelier-model";
import { netPoint } from "./intersections";

export interface Mesure {
  /** Longueur (mètres, non nulle ; négative : à l'opposé de la direction), ou null. */
  longueur: number | null;
  /** Angle imposé (degrés), ou null. */
  angle: number | null;
}

const NOMBRE = String.raw`[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)`;
const MESURE = new RegExp(String.raw`^\s*(${NOMBRE})?\s*(?:<\s*(${NOMBRE}))?\s*$`);
const lire = (v: string | undefined) => (v === undefined ? null : Number(v.replace(",", ".")));

/** Mesure saisie, ou null si le texte n'en est pas une (vide, longueur nulle, illisible). */
export function lireMesure(texte: string): Mesure | null {
  const m = MESURE.exec(texte);
  if (!m || (m[1] === undefined && m[2] === undefined)) return null;
  const longueur = lire(m[1]), angle = lire(m[2]);
  if (longueur !== null && (!Number.isFinite(longueur) || longueur === 0)) return null;
  if (angle !== null && !Number.isFinite(angle)) return null;
  return { longueur, angle };
}

/** Point à `longueur` de `base` dans la direction `angle` (radians), nettoyé du bruit flottant au nanomètre. */
export function pointMesure(base: StudioPoint, angle: number, longueur: number): StudioPoint {
  return netPoint({ x: base.x + longueur * Math.cos(angle), y: base.y + longueur * Math.sin(angle) });
}

/** Direction de `base` vers `p` (radians), ou null s'ils sont confondus. */
export const direction = (base: StudioPoint, p: StudioPoint): number | null => (base.x === p.x && base.y === p.y ? null : Math.atan2(p.y - base.y, p.x - base.x));

/** Angle affiché (degrés dans [0 ; 360[, deux décimales au plus). */
export const angleAffiche = (radians: number): number => {
  const d = Math.round(((((radians * 180) / Math.PI) % 360) + 360) % 360 * 100) / 100;
  return d === 360 ? 0 : d;
};

export type ResultatSaisie =
  | { type: "point"; point: StudioPoint }
  | { type: "angle"; angle: number }
  | { type: "erreur"; message: string };

export const ERREUR_MESURE = "Saisissez une longueur (3), un angle (<45) ou les deux (3<45).";
export const ERREUR_DIRECTION = "Indiquez d’abord la direction avec le pointeur, ou un angle (<45).";

/**
 * Effet d'une saisie : point posé (longueur, avec l'angle saisi, imposé ou la direction courante), ou angle imposé
 * pour la suite du tracé. `courante` : direction du pointeur suivi (radians), null si elle n'est pas définie.
 */
export function appliquerSaisie(texte: string, base: StudioPoint, courante: number | null, verrou: number | null): ResultatSaisie {
  const m = lireMesure(texte);
  if (!m) return { type: "erreur", message: ERREUR_MESURE };
  if (m.longueur === null) return { type: "angle", angle: m.angle! };
  const deg = m.angle ?? verrou;
  const angle = deg !== null ? (deg * Math.PI) / 180 : courante;
  if (angle === null) return { type: "erreur", message: ERREUR_DIRECTION };
  return { type: "point", point: pointMesure(base, angle, m.longueur) };
}
