/**
 * Coordonnées taguées (R5, AGENTS.md) : `cadastral`, `geographic`, `local`, jamais mélangées.
 *
 * Forme du cahier §5.2 : `{ x, y, frame: "local", unit: "m" }`. Ces types sont des sous-types structurels de
 * `Coordinate` de `@parcours/domain-model` (même champ `frame`), qui reste la référence des repères et des
 * conversions explicites. Aucune conversion n'est faite ici.
 *
 * Repère local nommé (D-021) : un jeu de données peut contenir des coordonnées locales qui ne sont pas dans le
 * repère local du projet (P.118 : `rooms[].polygons` dans le repère `modelPoints` de la registration 8.19).
 * Elles portent `repereLocal` (identifiant du repère) et ne sont jamais mélangées avec celles du projet.
 * `repereLocal` absent = repère local du projet (`REPERE_LOCAL_PROJET`).
 */
import type { CadastralCoordinate, Coordinate, GeographicCoordinate, LocalCoordinate } from "@parcours/domain-model";

export type Repere = Coordinate["frame"];
export const REPERES = ["cadastral", "geographic", "local"] as const satisfies readonly Repere[];

/** Identifiant du repère local du projet (celui des murs, dalles, pièces courantes…). */
export const REPERE_LOCAL_PROJET = "projet";

export interface PointLocal extends LocalCoordinate {
  readonly frame: "local";
  readonly x: number;
  readonly y: number;
  readonly unit: "m";
  /** Repère local nommé ; absent = `REPERE_LOCAL_PROJET`. */
  readonly repereLocal?: string;
}

export interface PointCadastral extends CadastralCoordinate {
  readonly frame: "cadastral";
  readonly x: number;
  readonly y: number;
  readonly unit: "m";
  /** Système de référence, ex. `EPSG:26191` (tel que déclaré par la source, jamais deviné). */
  readonly crs: string;
}

export interface PointGeographique extends GeographicCoordinate {
  readonly frame: "geographic";
  readonly lat: number;
  readonly lon: number;
  readonly unit: "°";
}

export type PointTague = PointLocal | PointCadastral | PointGeographique;

/** Polygone (contour fermé implicite : le dernier sommet n'est pas répété). */
export type Polygone<P extends PointTague = PointLocal> = readonly P[];

/** Polygone avec trous, tous dans le même repère. `id` des trous conservé quand la source en fournit un. */
export interface PolygoneAvecTrous<P extends PointTague = PointLocal> {
  readonly contour: Polygone<P>;
  readonly trous: readonly TrouPolygone<P>[];
}

export interface TrouPolygone<P extends PointTague = PointLocal> {
  readonly id?: string;
  readonly polygone: Polygone<P>;
  /** Origine du trou (ex. identifiant d'objet source), facultative. */
  readonly source?: string;
}

/** Segment orienté (axe d'un mur, d'un escalier, cotation…). */
export interface Segment<P extends PointTague = PointLocal> {
  readonly a: P;
  readonly b: P;
}

export class ErreurRepere extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErreurRepere";
  }
}

/** Clé d'identité d'un repère : deux points sont dans le même repère si et seulement si leurs clés sont égales. */
export function cleRepere(p: PointTague): string {
  switch (p.frame) {
    case "local":
      return `local:${p.repereLocal ?? REPERE_LOCAL_PROJET}`;
    case "cadastral":
      return `cadastral:${p.crs}`;
    case "geographic":
      return "geographic";
  }
}

export function estPointLocal(p: unknown): p is PointLocal {
  if (typeof p !== "object" || p === null) return false;
  const q = p as Record<string, unknown>;
  return (
    q.frame === "local" &&
    q.unit === "m" &&
    typeof q.x === "number" &&
    Number.isFinite(q.x) &&
    typeof q.y === "number" &&
    Number.isFinite(q.y) &&
    (q.repereLocal === undefined || (typeof q.repereLocal === "string" && q.repereLocal.length > 0))
  );
}

export function estPointCadastral(p: unknown): p is PointCadastral {
  if (typeof p !== "object" || p === null) return false;
  const q = p as Record<string, unknown>;
  return (
    q.frame === "cadastral" &&
    q.unit === "m" &&
    typeof q.x === "number" &&
    Number.isFinite(q.x) &&
    typeof q.y === "number" &&
    Number.isFinite(q.y) &&
    typeof q.crs === "string" &&
    q.crs.length > 0
  );
}

export function estPointGeographique(p: unknown): p is PointGeographique {
  if (typeof p !== "object" || p === null) return false;
  const q = p as Record<string, unknown>;
  return (
    q.frame === "geographic" &&
    q.unit === "°" &&
    typeof q.lat === "number" &&
    Number.isFinite(q.lat) &&
    typeof q.lon === "number" &&
    Number.isFinite(q.lon)
  );
}

export function estPointTague(p: unknown): p is PointTague {
  return estPointLocal(p) || estPointCadastral(p) || estPointGeographique(p);
}

/** Constructeurs : valeurs conservées telles quelles (aucun arrondi). */
export function pointLocal(x: number, y: number, repereLocal?: string): PointLocal {
  const p: PointLocal = repereLocal === undefined ? { x, y, frame: "local", unit: "m" } : { x, y, frame: "local", unit: "m", repereLocal };
  if (!estPointLocal(p)) throw new ErreurRepere(`point local invalide (${String(x)}, ${String(y)})`);
  return p;
}

export function pointCadastral(x: number, y: number, crs: string): PointCadastral {
  const p: PointCadastral = { x, y, frame: "cadastral", unit: "m", crs };
  if (!estPointCadastral(p)) throw new ErreurRepere(`point cadastral invalide (${String(x)}, ${String(y)}, ${crs})`);
  return p;
}

export type ResultatRepere = { readonly ok: true; readonly cle: string | null } | { readonly ok: false; readonly message: string };

/**
 * Vérifie qu'une liste de points est dans un seul repère (même `frame`, même `crs`, même `repereLocal`).
 * Liste vide : `ok` avec `cle: null`.
 */
export function controlerRepereUnique(points: readonly unknown[]): ResultatRepere {
  let cle: string | null = null;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (!estPointTague(p)) return { ok: false, message: `point ${i} non tagué ou mal formé (frame, unit, coordonnées finies)` };
    const c = cleRepere(p);
    if (cle === null) cle = c;
    else if (c !== cle) return { ok: false, message: `repères mélangés : « ${cle} » et « ${c} » (point ${i})` };
  }
  return { ok: true, cle };
}

/** Comme `controlerRepereUnique`, mais lève `ErreurRepere`. */
export function exigerRepereUnique(points: readonly unknown[]): string | null {
  const r = controlerRepereUnique(points);
  if (!r.ok) throw new ErreurRepere(r.message);
  return r.cle;
}

/** Tous les sommets (contour et trous) d'un polygone avec trous. */
export function sommetsDe<P extends PointTague>(p: PolygoneAvecTrous<P>): P[] {
  return [...p.contour, ...p.trous.flatMap((t) => t.polygone)];
}

/** Construit un polygone avec trous en refusant tout mélange de repères. */
export function polygoneAvecTrous<P extends PointTague>(contour: Polygone<P>, trous: readonly TrouPolygone<P>[] = []): PolygoneAvecTrous<P> {
  const poly: PolygoneAvecTrous<P> = { contour, trous };
  exigerRepereUnique(sommetsDe(poly));
  return poly;
}
