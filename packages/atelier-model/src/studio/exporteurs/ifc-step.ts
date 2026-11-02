import { StudioValidationError } from "../noyau/validation.js";
import type { StudioPoint, StudioShapeBase } from "../noyau/types.js";

/**
 * Écriture STEP (ISO 10303-21) de l'export IFC Studio : chaînes, réels, GlobalId déterministes, numérotation des
 * entités, et contexte d'écriture partagé par les écrivains par type d'objet (`objets/`).
 */

/**
 * Chaîne STEP : apostrophes et barres obliques inverses doublées ; hors ASCII imprimable en `\X2\…\X0\` (plan
 * multilingue de base, tabulation et fins de ligne LF / CR comprises : `\X2\000A\X0\`, `\X2\000D\X0\`) ; au-delà de
 * U+FFFF, un point de code en `\X4\00XXXXXX\X0\`, jamais une paire de substitution. Les autres caractères de contrôle
 * sont retirés.
 */
export function studioStepString(t: string): string {
  let out = "";
  let ext = "";
  const flush = () => {
    if (ext) {
      out += `\\X2\\${ext}\\X0\\`;
      ext = "";
    }
  };
  for (const ch of t) {
    const c = ch.codePointAt(0)!;
    if (c >= 0x20 && c <= 0x7e) {
      flush();
      out += c === 0x27 ? "''" : c === 0x5c ? "\\\\" : ch;
    } else if (c > 0xffff) {
      flush();
      out += `\\X4\\${c.toString(16).toUpperCase().padStart(8, "0")}\\X0\\`;
    } else if (c >= 0x20 || c === 0x09 || c === 0x0a || c === 0x0d) ext += c.toString(16).toUpperCase().padStart(4, "0");
  }
  flush();
  return `'${out}'`;
}

/** Réel STEP : toujours un point décimal ; arrondi au nanomètre. */
export function studioStepReal(v: number): string {
  if (!Number.isFinite(v)) throw new StudioValidationError("ifc", "nombre fini attendu");
  const r = Math.round(v * 1e9) / 1e9;
  if (r === 0) return "0.";
  if (Number.isInteger(r) && Math.abs(r) < 1e21) return `${r}.`;
  const s = String(r);
  if (s.includes("e")) {
    const [m, e] = s.split("e");
    return `${m!.includes(".") ? m : `${m}.`}E${e}`;
  }
  return s;
}

/**
 * Réel STEP d'une valeur **déclarée** (propriétés E.1-01) : la représentation la plus courte qui relit le même nombre
 * (aller-retour exact), toujours un point décimal, exposant `E` ; aucun arrondi, à la différence de `studioStepReal`
 * (coordonnées et dimensions, au nanomètre).
 */
export function studioStepRealDeclare(v: number): string {
  if (!Number.isFinite(v)) throw new StudioValidationError("ifc", "nombre fini attendu");
  if (v === 0) return "0.";
  const [m, e] = String(v).split("e");
  const mantisse = m!.includes(".") ? m! : `${m}.`;
  return e === undefined ? mantisse : `${mantisse}E${e.replace("+", "")}`;
}

/** FNV-1a 64 bits (deux moitiés de 32 bits), en hexadécimal sur 16 caractères. */
function fnv(text: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0xcbf29ce4;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ ((c * 31 + (h1 & 0xff)) & 0xffff), 0x01000193) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

const GUID_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$";

/** GlobalId IFC déterministe (22 caractères base 64 IFC, premier caractère 0–3 : 128 bits). */
export function studioIfcGuid(key: string): string {
  let n = BigInt(`0x${[0, 1].map((k) => fnv(`${k}:${key}`)).join("")}`);
  let out = "";
  for (let i = 0; i < 22; i++) {
    out = GUID_CHARS[Number(n & 63n)]! + out;
    n >>= 6n;
  }
  return GUID_CHARS[GUID_CHARS.indexOf(out[0]!) & 3]! + out.slice(1);
}

export class Step {
  readonly lines: string[] = [];
  add(entity: string): number {
    this.lines.push(`#${this.lines.length + 1}=${entity};`);
    return this.lines.length;
  }
}
export const ref = (n: number) => `#${n}`;
export const refs = (ns: readonly number[]) => `(${ns.map(ref).join(",")})`;
export const bool = (b: boolean) => (b ? ".T." : ".F.");

/** Effectifs de l'export : ce qui devient 3D et ce qui ne l'est pas. */
export interface StudioIfcSummary {
  walls: number;
  surfaces: number;
  prisms: number;
  nonExtruded: number;
  dimensions: number;
  /** Objets exportés dont le calque est masqué (exportés calque éteint). */
  onHiddenLayers: number;
  /**
   * Annotations 2D (cotes angulaires, textes) non exportées : l'IFC ne porte que les objets extrudés (aucun
   * `IfcAnnotation` n'est écrit). Présent seulement quand le document en compte, pour ne rien changer aux autres exports.
   */
  annotations?: number;
  /** Objets architecturaux (A.4), présents seulement quand le document en compte : murs, ouvertures, portes, fenêtres. */
  architecture?: {
    walls: number; openings: number; doors: number; windows: number; /** EX-027 : échelles d’accès (IfcStair .LADDER.), présent seulement s’il y en a. */ ladders?: number;
    /** Lot W3-B : poteaux, poutres, dalles (IfcColumn, IfcBeam, IfcSlab), présents seulement s’il y en a. */
    columns?: number; beams?: number; slabs?: number;
  };
  /** Lot W3-B : niveaux écrits en `IfcBuildingStorey` (en plus du niveau de référence), présent seulement s’il y en a. */
  storeys?: number;
  /** Lot W3-B : définitions de composants (`IfcBuildingElementProxyType`) et occurrences (`IfcMappedItem`). */
  components?: { types: number; occurrences: number };
  /**
   * Propriétés déclarées (E.1-01), présent seulement quand le document en porte : écrites dans `Fadi_ProprietesDeclarees`
   * (valuées) et non écrites (sans valeur, « non évaluées »).
   */
  proprietes?: { exported: number; notEvaluated: number };
}

/** Élément IFC produit pour un objet extrudé : l'élément, l'item de représentation (calques) et le calque Studio. */
export interface IfcConstruit {
  element: number;
  item: number;
  layerId: string;
  /** Niveau de rattachement (lot W3-B) : l'élément est contenu dans l'`IfcBuildingStorey` de ce niveau. */
  niveauId?: string;
}

/**
 * Contexte d'écriture d'un fichier IFC : entités déjà posées (contextes, axe z) et fabriques d'entités. L'ordre des
 * appels détermine la numérotation des entités : un écrivain par type doit l'appeler dans un ordre fixe.
 */
export interface IfcContexte {
  readonly s: Step;
  readonly zAxis: number;
  readonly body: number;
  readonly axis: number;
  readonly summary: StudioIfcSummary;
  gid(id: string): string;
  pt2(x: number, y: number): number;
  shape(reps: number[]): number;
  placed(x: number, y: number, z: number, ux?: number, uy?: number): number;
  /** Placement d'orientation quelconque : axe z local (`axe`) et axe x local (`ref`), unitaires et orthogonaux. */
  placedAxes(x: number, y: number, z: number, axe: { x: number; y: number; z: number }, ref: { x: number; y: number; z: number }): number;
  rectangleSolid(cx: number, cy: number, xDim: number, yDim: number, depth: number): number;
  /** Profil fermé discrétisé (coordonnées absolues du plan, sens trigonométrique), extrudé depuis la cote de base. */
  arbitrarySolid(ring: StudioPoint[], depth: number, direction?: { x: number; y: number; z: number }): number;
  proxy(o: StudioShapeBase, description: string, item: number, representation: "SweptSolid" | "Tessellation", placement: number): number;
  /** Surface verticale ouverte le long d'un tracé discrétisé (coordonnées absolues, z de 0 à h au-dessus de la base). */
  stripItem(path: StudioPoint[], h: number): number;
  layerOf(o: StudioShapeBase): string;
}
