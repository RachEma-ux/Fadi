import type { DxfWriter } from "../exporteurs/dxf.js";
import { dxfText, nb, svgY, xml } from "../exporteurs/texte.js";
import { angle as angleValide, discriminator, fail, finite, identifier, layerRef, point, record } from "../noyau/validation.js";
import type { StudioPoint } from "../noyau/types.js";
import { angle, id, layerId, point as pointSchema } from "../registre/schemas-base.js";

/**
 * Texte (`text`) : annotation rangée avec les cotes angulaires dans `StudioDocument.annotations`, sur un calque. Position
 * (point d'insertion, sur la ligne de base), hauteur en mètres, rotation en radians dans [0 ; 2π[ (sens trigonométrique),
 * contenu d'une ligne de 500 caractères au plus, justification (gauche, centre, droite). Le contenu est une donnée du
 * projet : il n'est jamais traduit ni réécrit (seuls les exports DXF l'écrivent en ASCII échappé, comme le format l'exige).
 */

export type StudioTextJustification = "left" | "center" | "right";
export const STUDIO_TEXT_JUSTIFICATIONS: readonly StudioTextJustification[] = Object.freeze(["left", "center", "right"] as const);
/** Longueur maximale du contenu d'un texte, en caractères (points de code). */
export const STUDIO_TEXT_MAX = 500;
/** Borne technique de la hauteur (pas une valeur métier). */
const HAUTEUR_MAX = 1e6;

export interface StudioText {
  id: string;
  type: "text";
  layerId?: string;
  position: StudioPoint;
  height: number;
  rotation: number;
  content: string;
  justification: StudioTextJustification;
}

// ——— Schéma ———

export const SCHEMA_TEXTE = {
  type: "object", additionalProperties: false, required: ["id", "type", "position", "height", "rotation", "content", "justification"],
  properties: {
    id, type: { const: "text" }, layerId, position: pointSchema,
    height: { type: "number", exclusiveMinimum: 0, maximum: HAUTEUR_MAX }, rotation: angle,
    content: { type: "string", minLength: 1, maxLength: STUDIO_TEXT_MAX, pattern: "^[^\\u0000-\\u001F\\u007F]*\\S[^\\u0000-\\u001F\\u007F]*$" },
    justification: { enum: [...STUDIO_TEXT_JUSTIFICATIONS] },
  },
} as const;

// ——— Validation ———

export function validerTexte(value: unknown, path: string): StudioText {
  if (discriminator(value, path) !== "text") fail(`${path}.type`, "texte attendu");
  const o = record(value, ["id", "type", "position", "height", "rotation", "content", "justification"], path, ["layerId"]);
  const position = point(o.position, `${path}.position`);
  const height = finite(o.height, `${path}.height`);
  if (height <= 0) fail(`${path}.height`, "hauteur strictement positive attendue");
  if (height > HAUTEUR_MAX) fail(`${path}.height`, "hauteur de 1 000 000 m au plus");
  const rotation = angleValide(o.rotation, `${path}.rotation`);
  const content = o.content;
  if (typeof content !== "string" || !content.trim()) fail(`${path}.content`, "texte non vide attendu");
  if (/[\u0000-\u001F\u007F]/.test(content)) fail(`${path}.content`, "une seule ligne, sans caractère de contrôle");
  if ([...content].length > STUDIO_TEXT_MAX) fail(`${path}.content`, `${STUDIO_TEXT_MAX} caractères au plus`);
  const justification = o.justification;
  if (typeof justification !== "string" || !(STUDIO_TEXT_JUSTIFICATIONS as readonly string[]).includes(justification)) fail(`${path}.justification`, "justification left, center ou right attendue");
  return { id: identifier(o.id, `${path}.id`), type: "text", ...layerRef(o, path), position, height, rotation, content, justification: justification as StudioTextJustification };
}

// ——— Géométrie dérivée ———

/** Rotation en degrés (sens trigonométrique), arrondie au micro-degré. */
export const studioTextRotationDegrees = (t: Pick<StudioText, "rotation">): number => Math.round(((t.rotation * 180) / Math.PI) * 1e6) / 1e6;

/**
 * Emprise approchée d'un texte (largeur moyenne de caractère 0,6 × hauteur), quatre coins tournés autour de la position :
 * bornes de la vue, de l'export et sélection seulement — jamais une donnée du document.
 */
export function studioTextBox(t: Pick<StudioText, "position" | "height" | "rotation" | "content" | "justification">): StudioPoint[] {
  const w = [...t.content].length * t.height * 0.6;
  const x0 = t.justification === "left" ? 0 : t.justification === "center" ? -w / 2 : -w;
  const c = Math.cos(t.rotation), s = Math.sin(t.rotation);
  return [[x0, 0], [x0 + w, 0], [x0 + w, t.height], [x0, t.height]].map(([u, v]) => ({ x: t.position.x + u! * c - v! * s, y: t.position.y + u! * s + v! * c }));
}

export const translaterTexte = (t: StudioText, f: (p: StudioPoint) => StudioPoint): StudioText => ({ ...t, position: f(t.position) });

// ——— Exports de fichier ———

const ANCRE_SVG: Record<StudioTextJustification, string> = { left: "start", center: "middle", right: "end" };

/** `<text data-text>` : position sur la ligne de base, hauteur en mètres, rotation (repère retourné : angle opposé). */
export function texteSvg(t: StudioText): string {
  const deg = studioTextRotationDegrees(t);
  const rotate = deg === 0 ? "" : ` transform="rotate(${nb(-deg)} ${nb(t.position.x)} ${svgY(t.position.y)})"`;
  return `<text data-text="${xml(t.id)}" data-justification="${t.justification}" x="${nb(t.position.x)}" y="${svgY(t.position.y)}" font-size="${nb(t.height)}" font-family="sans-serif" text-anchor="${ANCRE_SVG[t.justification]}" fill="#000" stroke="none"${rotate}>${xml(t.content)}</text>`;
}

/** TEXT R12 : 10 = insertion, 40 = hauteur, 1 = contenu, 50 = rotation (degrés), 72 = justification (0, 1, 2) et 11 = point d'alignement. */
export function texteDxf(t: StudioText, layer: string, w: DxfWriter): void {
  const deg = studioTextRotationDegrees(t);
  const just = t.justification === "left" ? 0 : t.justification === "center" ? 1 : 2;
  w.pair(0, "TEXT");
  w.pair(8, layer);
  w.point(10, t.position);
  w.pair(40, t.height);
  w.pair(1, dxfText(t.content));
  if (deg) w.pair(50, deg);
  if (just) {
    w.pair(72, just);
    w.point(11, t.position);
  }
}
