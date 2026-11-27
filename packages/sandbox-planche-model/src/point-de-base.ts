/**
 * Point de base du projet (cas 4 du catalogue des extensions, étape 2 : D6-F8-001). Pur : ni React, ni DOM.
 *
 * Le dessin reste près de l'origine (0 ; 0 ; 0) : le point de base déclare les coordonnées projetées de cette origine
 * (E, N, en mètres, dans le système horizontal **déclaré**, par exemple « EPSG:2154 ») et la rotation du projet (angle
 * du nord du quadrillage depuis l'axe vert +y, sens horaire vu de dessus, en degrés). L'altitude H de l'origine est le
 * niveau de référence de la Planche (étape 1 : altitude NGF du ±0,00), jamais saisie deux fois.
 *
 * Aucune projection n'est calculée ni supposée : Fadi ne convertit pas entre systèmes, il ajoute le décalage déclaré.
 * Sans point de base, les coordonnées projetées sont « non évaluées » (`null`) ; sans niveau de référence, H l'est.
 */
import type { Repere } from "./annotations.js";
import { lireNombreSaisi } from "./saisies-extensions.js";
import type { Vec3 } from "./vecteur.js";

/** Longueur maximale d'un nom de système (choix Fadi : un code EPSG ou un nom court). */
export const SYSTEME_MAX = 40;

export interface PointDeBase {
  /** Coordonnée est (m) de l'origine du dessin, dans le système horizontal déclaré. */
  readonly e: number;
  /** Coordonnée nord (m) de l'origine du dessin. */
  readonly n: number;
  /** Système horizontal déclaré (texte libre, par exemple « EPSG:2154 »). */
  readonly systeme: string;
  /** Système vertical déclaré (par exemple « NGF-IGN69 ») ; absent = non déclaré. */
  readonly systemeVertical?: string;
  /** Nord du quadrillage : angle en degrés depuis +y, sens horaire vu de dessus, dans [0, 360). */
  readonly rotation: number;
}

export type ChampPointDeBase = "e" | "n" | "systeme" | "systemeVertical" | "rotation";

export interface SaisiePointDeBase {
  readonly e: string;
  readonly n: string;
  readonly systeme: string;
  readonly systemeVertical: string;
  readonly rotation: string;
}

export interface CoordonneesProjetees {
  readonly e: number;
  readonly n: number;
  /** `null` = non évaluée (niveau de référence non déclaré). */
  readonly h: number | null;
}

const RAD = Math.PI / 180;
const fini = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const normaliser = (a: number): number => ((a % 360) + 360) % 360;

/** Point de base lu d'une saisie ; le premier champ refusé est nommé, rien n'est corrigé en silence. */
export function lirePointDeBase(s: SaisiePointDeBase): { readonly point: PointDeBase } | { readonly erreur: ChampPointDeBase } {
  const e = lireNombreSaisi(s.e);
  if (e === null) return { erreur: "e" };
  const n = lireNombreSaisi(s.n);
  if (n === null) return { erreur: "n" };
  const systeme = s.systeme.trim();
  if (systeme === "" || systeme.length > SYSTEME_MAX) return { erreur: "systeme" };
  const systemeVertical = s.systemeVertical.trim();
  if (systemeVertical.length > SYSTEME_MAX) return { erreur: "systemeVertical" };
  const rotation = s.rotation.trim() === "" ? 0 : lireNombreSaisi(s.rotation);
  if (rotation === null) return { erreur: "rotation" };
  return { point: { e, n, systeme, ...(systemeVertical ? { systemeVertical } : {}), rotation: normaliser(rotation) } };
}

/** Point de base reçu (document, delta) : jamais cru sur parole. */
export function estPointDeBase(v: unknown): v is PointDeBase {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const p = v as Record<string, unknown>;
  const texte = (x: unknown, vide: boolean): boolean => typeof x === "string" && x.length <= SYSTEME_MAX && (vide || x.trim() !== "");
  return fini(p["e"]) && fini(p["n"]) && texte(p["systeme"], false) && (p["systemeVertical"] === undefined || texte(p["systemeVertical"], false)) && fini(p["rotation"]) && p["rotation"] >= 0 && p["rotation"] < 360;
}

/** Directions du quadrillage (est, nord) dans le repère du dessin, unitaires et horizontales. */
export function axesQuadrillage(p: PointDeBase): { readonly est: Vec3; readonly nord: Vec3 } {
  const s = Math.sin(p.rotation * RAD);
  const c = Math.cos(p.rotation * RAD);
  return { nord: { x: s, y: c, z: 0 }, est: { x: c, y: -s, z: 0 } };
}

/** Coordonnées projetées d'un point du dessin (E, N, et H si le niveau de référence est déclaré). */
export function versProjete(p: PointDeBase, q: Vec3, reference: number | null): CoordonneesProjetees {
  const { est, nord } = axesQuadrillage(p);
  return { e: p.e + est.x * q.x + est.y * q.y, n: p.n + nord.x * q.x + nord.y * q.y, h: reference === null ? null : reference + q.z };
}

/** Point du dessin correspondant à des coordonnées projetées ; `null` si H est donné sans niveau de référence. */
export function depuisProjete(p: PointDeBase, c: { readonly e: number; readonly n: number; readonly h: number }, reference: number | null): Vec3 | null {
  if (reference === null) return null;
  const { est, nord } = axesQuadrillage(p);
  const de = c.e - p.e;
  const dn = c.n - p.n;
  return { x: est.x * de + nord.x * dn, y: est.y * de + nord.y * dn, z: c.h - reference };
}

/** Contrôle d'aller-retour sur un point de contrôle : point du dessin et écart (m) après retour aux coordonnées projetées. */
export function controleAllerRetour(p: PointDeBase, c: { readonly e: number; readonly n: number; readonly h: number }, reference: number | null): { readonly dessin: Vec3; readonly ecart: number } | null {
  const d = depuisProjete(p, c, reference);
  if (!d) return null;
  const r = versProjete(p, d, reference);
  return { dessin: d, ecart: Math.hypot(r.e - c.e, r.n - c.n, (r.h ?? 0) - c.h) };
}

/**
 * Repère dont les coordonnées locales sont les coordonnées projetées (axes est, nord, haut) : sert à l'export
 * « projetées » par `modeleDansRepere` (local = axes · (p − origine) = (E, N, H)).
 */
export function repereProjete(p: PointDeBase, reference: number): Repere {
  const { est, nord } = axesQuadrillage(p);
  const haut = { x: 0, y: 0, z: 1 };
  const origine = { x: -(p.e * est.x + p.n * nord.x), y: -(p.e * est.y + p.n * nord.y), z: -reference };
  return { origine, x: est, y: nord, z: haut };
}

/** Écriture d'une coordonnée projetée : groupes de trois chiffres, trois décimales (« 652 410,250 »). */
export function texteCoordonnee(v: number, separateur: "," | "." = ","): string {
  const [ent, dec] = Math.abs(v).toFixed(3).split(".");
  const groupes = ent!.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${v < 0 ? "−" : ""}${groupes}${separateur}${dec}`;
}
