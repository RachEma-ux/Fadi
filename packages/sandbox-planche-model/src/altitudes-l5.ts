/**
 * Cas 2 du catalogue, lot 5 — altitudes (n° 5, 18, 45, 55, 70). Pur, sans React ni DOM.
 *
 * Le ±0,00 du projet est l'origine verticale du dessin (z = 0) ; son altitude NGF est **une seule valeur** saisie (le
 * niveau de référence des Niveaux, le H du point de base, l'altitude de l'Emplacement). Une altitude NGF est donc
 * `z + référence`, « non évaluée » (`null`) tant que la référence n'est pas déclarée.
 */
import { boiteOccurrence, contexte, type Id, type Modele } from "./geometrie-libre.js";
import type { Vec3 } from "./vecteur.js";

/** Ce que le champ Mesures attend dans Déplacer et Pousser-tirer (Tab fait défiler, n° 55 et 70). */
export type MesureAltitude = "distance" | "relative" | "ngf";
export const MESURES_ALTITUDE: readonly MesureAltitude[] = ["distance", "relative", "ngf"];
export const mesureSuivante = (m: MesureAltitude | undefined): MesureAltitude => MESURES_ALTITUDE[(MESURES_ALTITUDE.indexOf(m ?? "distance") + 1) % MESURES_ALTITUDE.length]!;

/** Libellés du champ Mesures (traduits par la couche DOM, comme les autres textes des outils). */
export const LIBELLE_MESURE_ALTITUDE: Readonly<Record<Exclude<MesureAltitude, "distance">, string>> = { relative: "Altitude ±0,00", ngf: "Altitude NGF" };
export const ERREUR_ALTITUDE_NGF = "Altitude NGF non évaluée : déclarez d'abord l'altitude NGF du ±0,00 (Emplacement ou Niveaux).";
export const ERREUR_ALTITUDE_GROUPE = "Les altitudes se posent à la racine de la Planche : fermez d'abord le groupe ouvert.";
export const ERREUR_ALTITUDE_FACE = "Une altitude ne se donne qu'à une face horizontale.";
export const ERREUR_ALTITUDE_SAISIE = "Tapez une altitude en mètres (par exemple 3,10 ou −1,20).";
export const CONSIGNE_TAB_ALTITUDE = "Tab : distance, altitude ±0,00 ou altitude NGF.";

/** Altitude NGF d'une altitude du dessin ; `null` = non évaluée. */
export const versNGF = (z: number, reference: number | null): number | null => (reference === null ? null : reference + z);

/** Altitude du dessin (z) visée par une saisie, selon ce qu'attend Mesures ; `null` = référence NGF absente. */
export function altitudeCible(valeur: number, mesure: Exclude<MesureAltitude, "distance">, reference: number | null): number | null {
  if (mesure === "relative") return valeur;
  return reference === null ? null : valeur - reference;
}

/** Nombre tapé (virgule ou point, signe « − » typographique accepté, « m » et « NGF » tolérés) ; `null` sinon. */
export function lireAltitude(texte: string): number | null {
  const t = texte.trim().replace(/[−–]/g, "-").replace(/\s*(m|ngf)\s*$/i, "").replace(/\s*(m|ngf)\s*$/i, "").replace(/\s/g, "").replace(",", ".");
  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(t)) return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
}

export interface Encombrement {
  /** Altitudes du dessin (±0,00 = 0) du point le plus bas et du plus haut. */
  readonly basse: number;
  readonly haute: number;
  /** Longueur ≥ largeur (plan, axes du dessin) et hauteur, en mètres. */
  readonly longueur: number;
  readonly largeur: number;
  readonly hauteur: number;
  readonly min: Vec3;
  readonly max: Vec3;
}

/** Boîte monde d'éléments de la racine (objets, faces, arêtes) ; `null` si rien n'a de géométrie. */
export function boiteElements(m: Modele, ids: readonly Id[]): { readonly min: Vec3; readonly max: Vec3 } | null {
  const c = contexte(m, undefined);
  let min = { x: Infinity, y: Infinity, z: Infinity };
  let max = { x: -Infinity, y: -Infinity, z: -Infinity };
  const point = (p: Vec3) => {
    min = { x: Math.min(min.x, p.x), y: Math.min(min.y, p.y), z: Math.min(min.z, p.z) };
    max = { x: Math.max(max.x, p.x), y: Math.max(max.y, p.y), z: Math.max(max.z, p.z) };
  };
  const sommet = (s: Id) => {
    const v = c.sommets[s];
    if (v) point(v.position);
  };
  for (const id of ids) {
    if (c.occurrences[id]) {
      const b = boiteOccurrence(m, id);
      if (b) {
        point(b.min);
        point(b.max);
      }
    } else if (c.faces[id]) {
      const f = c.faces[id]!;
      for (const s of f.exterieur) sommet(s);
    } else if (c.aretes[id]) {
      sommet(c.aretes[id]!.a);
      sommet(c.aretes[id]!.b);
    } else if (c.courbes[id]) {
      for (const a of c.courbes[id]!.aretes) {
        const ar = c.aretes[a];
        if (ar) {
          sommet(ar.a);
          sommet(ar.b);
        }
      }
    }
  }
  return Number.isFinite(min.x) ? { min, max } : null;
}

/** Altitudes basse et haute et encombrement (n° 45) d'éléments de la racine ; `null` sans géométrie. */
export function encombrement(m: Modele, ids: readonly Id[]): Encombrement | null {
  const b = boiteElements(m, ids);
  if (!b) return null;
  const dx = b.max.x - b.min.x;
  const dy = b.max.y - b.min.y;
  return { basse: b.min.z, haute: b.max.z, longueur: Math.max(dx, dy), largeur: Math.min(dx, dy), hauteur: b.max.z - b.min.z, min: b.min, max: b.max };
}
