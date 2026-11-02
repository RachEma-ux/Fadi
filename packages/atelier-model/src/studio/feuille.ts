import { decouper, EPAISSEUR_MM, GRIS_TRAIT, grisRemplissage, type Bornes, type Primitive, type Trait } from "../documents/dessin.js";
import { pdfPage } from "../documents/rendu-pdf.js";
import type { Vec } from "../geometrie.js";
import { studioShapeBoundPoints, studioShapeOutline } from "./courbes.js";
import { STUDIO_DEFAULT_LAYER_ID, StudioValidationError, validateStudioDocument, type StudioDimension, type StudioDocument, type StudioShape } from "./document-2d.js";
import { formatStudioLength, STUDIO_EXPORT_TO_RESOLVE } from "./export.js";
import { coteAngulairePoints, dessinerCoteAngulaire } from "./objets/cote-angulaire.js";
import { studioTextBox, studioTextRotationDegrees } from "./objets/texte.js";
import { studioPlanArchitecture } from "./architecture/plan.js";

/**
 * Feuille de présentation d'un document Studio (`studio-sheet/1`) : format ISO 216 (A4 à A1, portrait ou paysage, aux
 * dimensions réelles en millimètres), cadre ISO 5457 (marge de 20 mm à gauche, 10 mm ailleurs), dessin placé à une
 * échelle normalisée (1:20 … 1:500) ou ajustée (dénominateur entier calculé pour que le dessin tienne), découpé au
 * cadre, cartouche, échelle graphique et flèche du nord.
 *
 * Rien n'est inventé : le cartouche ne porte que les champs fournis (vide : « — ») et ce qui se déduit des options
 * (format, échelle) ; la flèche du nord n'est tracée que si l'utilisateur la demande avec un angle déclaré (sinon
 * « Nord : non orienté ») ; l'échelle graphique seulement si elle est demandée. Les calques masqués ne sont pas
 * imprimés ; les cotes portent leur valeur mesurée (ou « à résoudre »). La feuille n'est pas traduite (document
 * produit). Pure et déterministe : mêmes entrées, mêmes octets SVG / PDF. Le PDF réutilise le rendu PDF vectoriel du
 * paquet (`pdfPage`) sur les mêmes primitives que le SVG ; le découpage est géométrique (`decouper`), identique pour
 * les deux rendus.
 */

export type StudioSheetFormat = "A4" | "A3" | "A2" | "A1";
export type StudioSheetOrientation = "portrait" | "paysage";
/** Dimensions ISO 216 en millimètres, en portrait (largeur < hauteur). */
export const STUDIO_SHEET_FORMATS: Readonly<Record<StudioSheetFormat, { readonly width: number; readonly height: number }>> = Object.freeze({
  A4: { width: 210, height: 297 },
  A3: { width: 297, height: 420 },
  A2: { width: 420, height: 594 },
  A1: { width: 594, height: 841 },
});
/** Échelles normalisées proposées (dénominateurs) ; « ajuster » calcule un dénominateur entier. */
export const STUDIO_SHEET_SCALES = Object.freeze([20, 50, 100, 200, 500] as const);
export type StudioSheetScaleChoice = (typeof STUDIO_SHEET_SCALES)[number] | "ajuster";

/** Champs du cartouche : seulement des données réelles ou saisies ; un champ absent ou vide s'affiche « — ». */
export interface StudioSheetTitleBlock {
  projectCode?: string;
  projectName?: string;
  study?: string;
  variant?: string;
  title?: string;
  revisionId?: string;
  revisionDate?: string;
  author?: string;
}

export interface StudioSheetOptions {
  format: StudioSheetFormat;
  orientation: StudioSheetOrientation;
  scale: StudioSheetScaleChoice;
  titleBlock?: StudioSheetTitleBlock;
  /** Échelle graphique : tracée seulement si `true` (et si l'échelle est évaluée). */
  scaleBar?: boolean;
  /**
   * Flèche du nord : absente par défaut (« non orienté »). `angle` est déclaré par l'utilisateur : direction du nord,
   * en degrés, comptée depuis l'axe +y du repère local, dans le sens horaire.
   */
  north?: { angle: number } | null;
  /** Langue de formatage des valeurs (cotes, échelle graphique) ; `fr-FR` par défaut. */
  locale?: string;
  /**
   * Murs et ouvertures (A.4) tracés en plan (parties pleines du mur en trait de coupe, montants des ouvertures).
   * Facultatif et absent par défaut : la feuille de présentation historique (paquets de publication) n'en change pas.
   */
  architecture?: boolean;
  /**
   * Ligne de provenance (E.3-01) imprimée sous le cadre : vue source, révision, variante, empreinte des données.
   * Absente par défaut ; fournie par la feuille composée d'un dossier de conception.
   */
  provenance?: string;
}

export interface StudioSheetScale {
  /** Dénominateur (1:denominator) ; null si non évaluée (échelle ajustée d'un dessin vide). */
  denominator: number | null;
  fitted: boolean;
  /** « 1:100 », « 1:87 (ajustée) » ou « non évaluée (dessin vide) ». */
  label: string;
}

export interface StudioSheetLayerDrawing {
  layerId: string;
  name: string;
  primitives: Primitive[];
}

export interface StudioSheet {
  schema: "studio-sheet/1";
  documentId: string;
  format: StudioSheetFormat;
  orientation: StudioSheetOrientation;
  /** Dimensions de la feuille en millimètres. */
  width: number;
  height: number;
  scale: StudioSheetScale;
  /** Cadre (millimètres, y vers le haut depuis le bas de la feuille). */
  frame: Bornes;
  /** Zone du dessin, au-dessus du cartouche ; le dessin y est découpé. */
  viewport: Bornes;
  titleBlockBox: Bornes;
  /** Une partie du dessin sort de la zone et a été découpée. */
  clipped: boolean;
  frameLines: Primitive[];
  drawing: StudioSheetLayerDrawing[];
  titleBlock: Primitive[];
  scaleBar: Primitive[];
  north: Primitive[];
  /** Ligne de provenance sous le cadre (présente seulement si l'option `provenance` est donnée). */
  provenance?: Primitive[];
  /** Titre lisible (titre saisi, sinon étude), pour le nom du fichier et les métadonnées du PDF. */
  documentTitle: string;
}

/** Marges du cadre (ISO 5457), en millimètres. */
export const STUDIO_SHEET_MARGINS = Object.freeze({ left: 20, right: 10, top: 10, bottom: 10 });
/** Cartouche (ISO 7200 : 180 mm de large au plus), en bas à droite du cadre. */
export const STUDIO_SHEET_TITLE_BLOCK = Object.freeze({ width: 180, height: 40 });
/** Retrait du dessin dans sa zone pour l'échelle ajustée, en millimètres. */
const FIT_PADDING = 5;
const EMPTY = "—";
const DIM_TEXT_MM = 2.5;
const DIM_LIFT_MM = 1;
const TICK_MM = 1.5;
const MAX_FIELD = 200;
const FIELD_KEYS: readonly (keyof StudioSheetTitleBlock)[] = ["projectCode", "projectName", "study", "variant", "title", "revisionId", "revisionDate", "author"];

const nb = (v: number): string => {
  const r = Math.round(v * 1000) / 1000;
  return Math.abs(r) < 1e-9 ? "0" : String(r);
};
const xml = (s: string): string =>
  s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

/** Dimensions réelles (mm) d'un format dans une orientation. */
export function studioSheetSize(format: StudioSheetFormat, orientation: StudioSheetOrientation): { width: number; height: number } {
  const f = STUDIO_SHEET_FORMATS[format];
  if (!f) throw new StudioValidationError("sheet.format", "format A4, A3, A2 ou A1 attendu");
  return orientation === "paysage" ? { width: f.height, height: f.width } : { width: f.width, height: f.height };
}

/** Longueur sur la feuille (mm) d'une longueur réelle (m) à l'échelle 1:denominator. */
export const studioSheetMm = (metres: number, denominator: number): number => (metres * 1000) / denominator;

/** Libellé d'échelle : « 1:100 » ou « 1:87 (ajustée) ». */
export const studioScaleLabel = (denominator: number, fitted: boolean): string => `1:${denominator}${fitted ? " (ajustée)" : ""}`;

/** Champ du cartouche nettoyé (une ligne, bornée) ; vide → « — ». */
export function studioTitleField(value: string | undefined): string {
  const v = (value ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_FIELD);
  return v === "" ? EMPTY : v;
}

/** Texte tronqué (« … ») pour tenir dans `widthMm` à la hauteur `heightMm` (largeur moyenne de caractère approchée). */
export function studioFitText(text: string, widthMm: number, heightMm: number): string {
  const max = Math.max(1, Math.floor(widthMm / (heightMm * 0.6)));
  const chars = [...text];
  return chars.length <= max ? text : `${chars.slice(0, max - 1).join("")}…`;
}

function validateOptions(o: StudioSheetOptions): void {
  if (!o || typeof o !== "object") throw new StudioValidationError("sheet", "options attendues");
  if (!(o.format in STUDIO_SHEET_FORMATS)) throw new StudioValidationError("sheet.format", "format A4, A3, A2 ou A1 attendu");
  if (o.orientation !== "portrait" && o.orientation !== "paysage") throw new StudioValidationError("sheet.orientation", "portrait ou paysage attendu");
  if (o.scale !== "ajuster" && !(STUDIO_SHEET_SCALES as readonly number[]).includes(o.scale)) throw new StudioValidationError("sheet.scale", "échelle 1:20, 1:50, 1:100, 1:200, 1:500 ou « ajuster » attendue");
  if (o.north != null && !Number.isFinite(o.north.angle)) throw new StudioValidationError("sheet.north.angle", "angle fini attendu (degrés)");
  if (o.architecture !== undefined && typeof o.architecture !== "boolean") throw new StudioValidationError("sheet.architecture", "booléen attendu");
  if (o.provenance !== undefined && typeof o.provenance !== "string") throw new StudioValidationError("sheet.provenance", "texte attendu");
  for (const k of FIELD_KEYS) {
    const v = o.titleBlock?.[k];
    if (v !== undefined && typeof v !== "string") throw new StudioValidationError(`sheet.titleBlock.${k}`, "texte attendu");
  }
}

function localeOf(locale: string | undefined): string {
  try {
    const [first] = Intl.getCanonicalLocales(locale ?? "fr-FR");
    if (!first) throw new RangeError("empty");
    return first;
  } catch {
    throw new StudioValidationError("sheet.locale", "langue inconnue");
  }
}

// ——— Dessin (mètres, repère local-2d) ———

interface DrawnDimension {
  d: StudioDimension;
  a: Vec;
  b: Vec;
  ext: [Vec, Vec][];
  normal: Vec;
  dir: Vec;
  angle: number;
  side: number;
  label: string;
}

function dimensionGeometry(d: StudioDimension, locale: string): DrawnDimension {
  const dx = d.end.x - d.start.x, dy = d.end.y - d.start.y;
  const length = Math.hypot(dx, dy);
  const dir = { x: dx / length, y: dy / length };
  const normal = { x: -dir.y, y: dir.x };
  const a = { x: d.start.x + normal.x * d.offset, y: d.start.y + normal.y * d.offset };
  const b = { x: d.end.x + normal.x * d.offset, y: d.end.y + normal.y * d.offset };
  const ext: [Vec, Vec][] = d.offset === 0 ? [] : [[{ ...d.start }, a], [{ ...d.end }, b]];
  let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  let side = 1;
  if (angle > 90 || angle <= -90) {
    angle += angle > 90 ? -180 : 180;
    side = -1;
  }
  const label = d.toResolve ? STUDIO_EXPORT_TO_RESOLVE : formatStudioLength(length, locale);
  return { d, a, b, ext, normal, dir, angle, side, label };
}

const layerOf = (o: { layerId?: string }): string => o.layerId ?? STUDIO_DEFAULT_LAYER_ID;
const ANCRE_TEXTE = { left: "debut", center: "milieu", right: "fin" } as const;

function shapePoints(o: StudioShape): Vec[] {
  return studioShapeBoundPoints(o);
}

/**
 * Compose la feuille. Les coordonnées de la feuille sont en millimètres, y vers le haut depuis le coin inférieur gauche
 * (convention des primitives du paquet, comme le PDF) ; le SVG retourne l'axe.
 */
export function composerFeuilleStudio(input: StudioDocument, options: StudioSheetOptions): StudioSheet {
  const doc = validateStudioDocument(input);
  validateOptions(options);
  const locale = localeOf(options.locale);
  const { width, height } = studioSheetSize(options.format, options.orientation);
  const M = STUDIO_SHEET_MARGINS, T = STUDIO_SHEET_TITLE_BLOCK;
  const frame: Bornes = { min: { x: M.left, y: M.bottom }, max: { x: width - M.right, y: height - M.top } };
  const titleBlockBox: Bornes = { min: { x: frame.max.x - T.width, y: frame.min.y }, max: { x: frame.max.x, y: frame.min.y + T.height } };
  const viewport: Bornes = { min: { x: frame.min.x, y: titleBlockBox.max.y }, max: { ...frame.max } };

  // Calques visibles seulement : un calque masqué n'est pas imprimé.
  const declared = doc.layers ?? [];
  const layers = declared.some((l) => l.id === STUDIO_DEFAULT_LAYER_ID) ? declared : [{ id: STUDIO_DEFAULT_LAYER_ID, name: "0", visible: true, locked: false }, ...declared];
  const visible = layers.filter((l) => l.visible);
  const shown = new Set(visible.map((l) => l.id));
  const shapes = doc.objects.filter((o) => shown.has(layerOf(o)));
  const dims = (doc.dimensions ?? []).filter((d) => shown.has(layerOf(d))).map((d) => dimensionGeometry(d, locale));
  // Annotations : arc et libellé des cotes angulaires (texte à hauteur fixe sur la feuille), textes à l'échelle.
  const notes = (doc.annotations ?? []).filter((a) => shown.has(layerOf(a)));
  const angulaires = notes.flatMap((a) => (a.type === "angular-dimension" ? [dessinerCoteAngulaire(a, locale, 0)] : []));
  const textes = notes.flatMap((a) => (a.type === "text" ? [a] : []));
  // Architecture (option) : murs et ouvertures des calques visibles ; une ouverture suit le calque de son mur.
  const plan = options.architecture && doc.architecture?.length ? studioPlanArchitecture(doc.architecture) : null;
  const murs = plan ? plan.murs.filter((m) => shown.has(layerOf(m.mur))) : [];
  const ouvertures = plan ? plan.ouvertures.filter((o) => shown.has(layerOf(o))) : [];
  const echelles = plan ? (plan.echelles ?? []).filter((e) => shown.has(layerOf(e.echelle))) : [];

  // Bornes du dessin visible, en mètres.
  const pts: Vec[] = [
    ...shapes.flatMap(shapePoints), ...dims.flatMap((g) => [g.a, g.b, ...g.ext.flat()]),
    ...angulaires.flatMap((g) => [g.dimension.vertex, ...coteAngulairePoints(g), ...g.extensions.flat()]), ...textes.flatMap((t) => studioTextBox(t)),
    ...murs.flatMap((m) => m.emprise), ...echelles.flatMap((e) => e.emprise),
  ];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  const empty = pts.length === 0;
  const vpW = viewport.max.x - viewport.min.x, vpH = viewport.max.y - viewport.min.y;

  let scale: StudioSheetScale;
  if (options.scale === "ajuster") {
    if (empty) scale = { denominator: null, fitted: true, label: "non évaluée (dessin vide)" };
    else {
      const need = Math.max(((maxX - minX) * 1000) / (vpW - 2 * FIT_PADDING), ((maxY - minY) * 1000) / (vpH - 2 * FIT_PADDING));
      // Dénominateur entier arrondi vers le haut (le dessin tient toujours) ; 1:1 au plus grand.
      const denominator = Math.max(1, Math.ceil(need - 1e-9));
      scale = { denominator, fitted: true, label: studioScaleLabel(denominator, true) };
    }
  } else scale = { denominator: options.scale, fitted: false, label: studioScaleLabel(options.scale, false) };

  // Placement : centre du dessin au centre de la zone.
  const drawing: StudioSheetLayerDrawing[] = [];
  let clipped = false;
  if (!empty && scale.denominator !== null) {
    const k = 1000 / scale.denominator;
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const vx = (viewport.min.x + viewport.max.x) / 2, vy = (viewport.min.y + viewport.max.y) / 2;
    const map = (p: Vec): Vec => ({ x: vx + (p.x - cx) * k, y: vy + (p.y - cy) * k });
    const eps = 1e-6;
    clipped = vx + (minX - cx) * k < viewport.min.x - eps || vx + (maxX - cx) * k > viewport.max.x + eps || vy + (minY - cy) * k < viewport.min.y - eps || vy + (maxY - cy) * k > viewport.max.y + eps;
    for (const layer of visible) {
      const raw: Primitive[] = [];
      for (const o of shapes) {
        if (layerOf(o) !== layer.id) continue;
        if (o.type === "line") raw.push({ type: "ligne", a: map(o.start), b: map(o.end), trait: "vue", objetId: o.id });
        else if (o.type !== "rectangle") {
          // Cercles, arcs, polylignes : contour discrétisé (déterministe), découpé comme tout polygone.
          const { points, closed } = studioShapeOutline(o);
          raw.push({ type: "poly", points: points.map(map), ferme: closed, trait: "vue", remplissage: null, objetId: o.id });
        } else {
          const { x, y } = o.origin;
          raw.push({ type: "poly", points: [{ x, y }, { x: x + o.width, y }, { x: x + o.width, y: y + o.height }, { x, y: y + o.height }].map(map), ferme: true, trait: "vue", remplissage: null, objetId: o.id });
        }
      }
      for (const g of dims) {
        if (layerOf(g.d) !== layer.id) continue;
        const a = map(g.a), b = map(g.b);
        raw.push({ type: "ligne", a, b, trait: "annotation", objetId: g.d.id });
        for (const [p, q] of g.ext) raw.push({ type: "ligne", a: map(p), b: map(q), trait: "annotation", objetId: g.d.id });
        // Traits obliques (45°) aux extrémités, longueur fixe sur la feuille.
        const t = { x: ((g.dir.x + g.normal.x) * TICK_MM) / (2 * Math.SQRT2), y: ((g.dir.y + g.normal.y) * TICK_MM) / (2 * Math.SQRT2) };
        for (const e of [a, b]) raw.push({ type: "ligne", a: { x: e.x - t.x, y: e.y - t.y }, b: { x: e.x + t.x, y: e.y + t.y }, trait: "annotation", objetId: g.d.id });
        const mid = { x: (a.x + b.x) / 2 + g.normal.x * DIM_LIFT_MM * g.side, y: (a.y + b.y) / 2 + g.normal.y * DIM_LIFT_MM * g.side };
        raw.push({ type: "texte", position: mid, texte: g.label, hauteurMm: DIM_TEXT_MM, ancre: "milieu", angle: g.angle, trait: "annotation", objetId: g.d.id });
      }
      for (const g of angulaires) {
        if (layerOf(g.dimension) !== layer.id) continue;
        const id = g.dimension.id;
        raw.push({ type: "poly", points: coteAngulairePoints(g).map(map), ferme: false, trait: "annotation", remplissage: null, objetId: id });
        for (const [p, q] of g.extensions) raw.push({ type: "ligne", a: map(p), b: map(q), trait: "annotation", objetId: id });
        // Libellé au-delà de l'arc, sur sa bissectrice, à hauteur fixe sur la feuille.
        const bis = g.arc.startAngle + g.sweep / 2, recul = DIM_LIFT_MM + DIM_TEXT_MM / 2;
        const on = map({ x: g.dimension.vertex.x + g.dimension.radius * Math.cos(bis), y: g.dimension.vertex.y + g.dimension.radius * Math.sin(bis) });
        raw.push({ type: "texte", position: { x: on.x + Math.cos(bis) * recul, y: on.y + Math.sin(bis) * recul }, texte: g.label, hauteurMm: DIM_TEXT_MM, ancre: "milieu", angle: g.angle, trait: "annotation", objetId: id });
      }
      for (const t of textes) {
        if (layerOf(t) !== layer.id) continue;
        // Texte du projet, tel quel, à sa hauteur réelle à l'échelle (mètres → millimètres de feuille).
        raw.push({ type: "texte", position: map(t.position), texte: t.content, hauteurMm: t.height * k, ancre: ANCRE_TEXTE[t.justification], angle: studioTextRotationDegrees(t), trait: "annotation", objetId: t.id });
      }
      for (const m of murs) {
        if (layerOf(m.mur) !== layer.id) continue;
        for (const q of m.morceaux) raw.push({ type: "poly", points: q.map(map), ferme: true, trait: "coupe", remplissage: null, objetId: m.mur.id });
      }
      for (const o of ouvertures) {
        if (layerOf(o) !== layer.id) continue;
        for (const [a, b] of o.montants) raw.push({ type: "ligne", a: map(a), b: map(b), trait: "vue", objetId: o.id });
      }
      // Échelles d'accès (EX-027) : montants et échelons en trait de vue (aucune coupe supposée).
      for (const e of echelles) {
        if (layerOf(e.echelle) !== layer.id) continue;
        for (const q of [...e.montants, e.echelons]) raw.push({ type: "poly", points: q.map(map), ferme: true, trait: "vue", remplissage: null, objetId: e.echelle.id });
      }
      drawing.push({ layerId: layer.id, name: layer.name, primitives: decouper(raw, viewport) });
    }
  }

  const fields = Object.fromEntries(FIELD_KEYS.map((k) => [k, studioTitleField(options.titleBlock?.[k])])) as Record<keyof StudioSheetTitleBlock, string>;
  const titleBlock = composeTitleBlock(titleBlockBox, fields, scale, `${options.format} ${options.orientation}`, options.north == null);
  const scaleBar = options.scaleBar && scale.denominator !== null ? composeScaleBar(titleBlockBox, scale.denominator, locale) : [];
  const north = options.north != null ? composeNorth(titleBlockBox, options.north.angle) : [];
  const frameLines: Primitive[] = [
    { type: "poly", points: [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }], ferme: true, trait: null, remplissage: "blanc", objetId: null },
    { type: "poly", points: rectPoints(frame), ferme: true, trait: "coupe", remplissage: null, objetId: "cadre" },
  ];
  const documentTitle = fields.title !== EMPTY ? fields.title : fields.study !== EMPTY ? fields.study : doc.id;
  const sheet: StudioSheet = { schema: "studio-sheet/1", documentId: doc.id, format: options.format, orientation: options.orientation, width, height, scale, frame, viewport, titleBlockBox, clipped, frameLines, drawing, titleBlock, scaleBar, north, documentTitle };
  if (options.provenance !== undefined) {
    const texte = options.provenance.replace(/\s+/g, " ").trim();
    sheet.provenance = texte
      ? [{ type: "texte", position: { x: frame.min.x, y: frame.min.y / 2 - LABEL_MM / 2 }, texte: studioFitText(texte, frame.max.x - frame.min.x, LABEL_MM), hauteurMm: LABEL_MM, ancre: "debut", angle: 0, trait: "fin", objetId: "provenance" }]
      : [];
  }
  return sheet;
}

const rectPoints = (r: Bornes): Vec[] => [{ x: r.min.x, y: r.min.y }, { x: r.max.x, y: r.min.y }, { x: r.max.x, y: r.max.y }, { x: r.min.x, y: r.max.y }];

/** Colonne gauche du cartouche (échelle, échelle graphique, nord), en millimètres. */
const LEFT_COL = 60;
const ROW = 8;
const LABEL_MM = 1.8;
const VALUE_MM = 3;

function composeTitleBlock(box: Bornes, f: Record<keyof StudioSheetTitleBlock, string>, scale: StudioSheetScale, format: string, northUnset: boolean): Primitive[] {
  const out: Primitive[] = [];
  const x0 = box.min.x, y0 = box.min.y;
  const line = (a: Vec, b: Vec, trait: Trait = "fin") => out.push({ type: "ligne", a, b, trait, objetId: null });
  out.push({ type: "poly", points: rectPoints(box), ferme: true, trait: "vue", remplissage: "blanc", objetId: "cartouche" });
  const cell = (key: string, label: string, value: string, x: number, row: number, w: number) => {
    const y = y0 + row * ROW;
    out.push({ type: "texte", position: { x: x + 1.5, y: y + ROW - 1 - LABEL_MM }, texte: label, hauteurMm: LABEL_MM, ancre: "debut", angle: 0, trait: "fin", objetId: `cartouche.${key}.libelle` });
    out.push({ type: "texte", position: { x: x + 1.5, y: y + 1.4 }, texte: studioFitText(value, w - 3, VALUE_MM), hauteurMm: VALUE_MM, ancre: "debut", angle: 0, trait: "annotation", objetId: `cartouche.${key}` });
  };
  // Grille : colonne gauche (60 mm) puis bloc des champs (120 mm), cinq rangées de 8 mm.
  const xr = x0 + LEFT_COL;
  line({ x: xr, y: y0 }, { x: xr, y: box.max.y }, "vue");
  for (let r = 1; r < 5; r++) line({ x: xr, y: y0 + r * ROW }, { x: box.max.x, y: y0 + r * ROW });
  line({ x: x0, y: y0 + 4 * ROW }, { x: xr, y: y0 + 4 * ROW });
  const half = xr + 60;
  // Rangée 4 (haut) : code | projet ; 3 : étude | variante ; 2 : titre ; 1 : révision | date ; 0 : auteur | format.
  line({ x: xr + 40, y: y0 + 4 * ROW }, { x: xr + 40, y: box.max.y });
  for (const r of [3, 1, 0]) line({ x: half, y: y0 + r * ROW }, { x: half, y: y0 + (r + 1) * ROW });
  cell("projectCode", "Code projet", f.projectCode, xr, 4, 40);
  cell("projectName", "Projet", f.projectName, xr + 40, 4, 80);
  cell("study", "Étude", f.study, xr, 3, 60);
  cell("variant", "Variante", f.variant, half, 3, 60);
  cell("title", "Titre", f.title, xr, 2, 120);
  cell("revisionId", "Révision", f.revisionId, xr, 1, 60);
  cell("revisionDate", "Date de révision", f.revisionDate, half, 1, 60);
  cell("author", "Auteur", f.author, xr, 0, 60);
  cell("format", "Format", format, half, 0, 60);
  cell("scale", "Échelle", scale.label, x0, 4, LEFT_COL);
  if (northUnset) out.push({ type: "texte", position: { x: x0 + 1.5, y: y0 + 2 }, texte: "Nord : non orienté", hauteurMm: LABEL_MM, ancre: "debut", angle: 0, trait: "fin", objetId: "cartouche.north" });
  return out;
}

/** Longueur réelle de l'échelle graphique : la plus grande valeur « ronde » qui tient dans 44 mm. */
const BAR_LENGTHS = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
const BAR_MAX_MM = 44;

function composeScaleBar(box: Bornes, denominator: number, locale: string): Primitive[] {
  // Très grande échelle (dessin minuscule ajusté) : la plus grande puissance de dix qui tient, jamais une barre qui déborde.
  const length = [...BAR_LENGTHS].reverse().find((l) => studioSheetMm(l, denominator) <= BAR_MAX_MM)
    ?? 10 ** Math.floor(Math.log10((BAR_MAX_MM * denominator) / 1000));
  const w = studioSheetMm(length, denominator);
  const x = box.min.x + 4, y = box.min.y + 2 * ROW + 3, h = 1.5;
  const fmt = (v: number) => `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2, useGrouping: false }).format(v)} m`;
  const out: Primitive[] = [
    { type: "poly", points: [{ x, y }, { x: x + w / 2, y }, { x: x + w / 2, y: y + h }, { x, y: y + h }], ferme: true, trait: "annotation", remplissage: "poche", objetId: "echelle-graphique" },
    { type: "poly", points: [{ x: x + w / 2, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x: x + w / 2, y: y + h }], ferme: true, trait: "annotation", remplissage: "blanc", objetId: "echelle-graphique" },
  ];
  for (const [t, v, a] of [[0, "0", "debut"], [w / 2, fmt(length / 2), "milieu"], [w, fmt(length), "fin"]] as const) {
    out.push({ type: "texte", position: { x: x + t, y: y + h + 1 }, texte: v, hauteurMm: LABEL_MM, ancre: a, angle: 0, trait: "annotation", objetId: "echelle-graphique" });
  }
  return out;
}

function composeNorth(box: Bornes, angle: number): Primitive[] {
  // Direction déclarée : sens horaire depuis +y du repère local (le dessin n'est pas tourné sur la feuille).
  const r = (angle * Math.PI) / 180;
  const d = { x: Math.sin(r), y: Math.cos(r) }, n = { x: -d.y, y: d.x };
  const c = { x: box.min.x + LEFT_COL - 9, y: box.min.y + ROW };
  const L = 6;
  const tip = { x: c.x + d.x * L, y: c.y + d.y * L };
  const tail = { x: c.x - d.x * L, y: c.y - d.y * L };
  const base = { x: c.x + d.x * (L - 3), y: c.y + d.y * (L - 3) };
  return [
    { type: "ligne", a: tail, b: tip, trait: "annotation", objetId: "nord" },
    { type: "poly", points: [tip, { x: base.x + n.x * 1.5, y: base.y + n.y * 1.5 }, { x: base.x - n.x * 1.5, y: base.y - n.y * 1.5 }], ferme: true, trait: "annotation", remplissage: "poche", objetId: "nord" },
    { type: "texte", position: { x: c.x + d.x * (L + 2.5) - 1, y: c.y + d.y * (L + 2.5) - 1 }, texte: "N", hauteurMm: VALUE_MM, ancre: "debut", angle: 0, trait: "annotation", objetId: "nord" },
  ];
}

// ——— Rendus ———

const gris = (g: number): string => {
  const v = Math.round(Math.min(1, Math.max(0, g)) * 255).toString(16).padStart(2, "0");
  return `#${v}${v}${v}`;
};

function svgPrimitives(prims: readonly Primitive[], H: number, out: string[]): void {
  const P = (p: Vec) => `${nb(p.x)},${nb(H - p.y)}`;
  const id = (p: Primitive) => (p.objetId ? ` data-id="${xml(p.objetId)}"` : "");
  const stroke = (t: Trait | null) => (t ? ` stroke="${gris(GRIS_TRAIT[t])}" stroke-width="${nb(EPAISSEUR_MM[t])}"` : ' stroke="none"');
  for (const p of prims) {
    if (p.type === "ligne") out.push(`<line${id(p)} x1="${nb(p.a.x)}" y1="${nb(H - p.a.y)}" x2="${nb(p.b.x)}" y2="${nb(H - p.b.y)}"${stroke(p.trait)}/>`);
    else if (p.type === "poly") {
      const fill = p.remplissage ? gris(grisRemplissage(p)) : "none";
      out.push(`<${p.ferme ? "polygon" : "polyline"}${id(p)} points="${p.points.map(P).join(" ")}" fill="${fill}"${stroke(p.trait)}/>`);
    } else if (p.type === "cercle") out.push(`<circle${id(p)} cx="${nb(p.centre.x)}" cy="${nb(H - p.centre.y)}" r="${nb(p.rayon)}" fill="none"${stroke(p.trait)}/>`);
    else {
      const anchor = p.ancre === "milieu" ? "middle" : p.ancre === "fin" ? "end" : "start";
      const rotate = p.angle ? ` transform="rotate(${nb(-p.angle)} ${nb(p.position.x)} ${nb(H - p.position.y)})"` : "";
      out.push(`<text${id(p)} x="${nb(p.position.x)}" y="${nb(H - p.position.y)}" font-size="${nb(p.hauteurMm)}" font-family="sans-serif" text-anchor="${anchor}" fill="${gris(GRIS_TRAIT[p.trait])}"${rotate}>${xml(p.texte)}</text>`);
    }
  }
}

/**
 * SVG de la feuille à sa taille réelle (`width="420mm"`), unité utilisateur = 1 mm. Parties : `data-sheet-part`
 * (`frame`, `drawing` avec un `<g data-layer>` par calque visible, `title-block`, `scale-bar`, `north`). Le dessin est
 * découpé géométriquement et porte en plus un `clip-path` sur la zone du dessin.
 */
export function studioSheetSvg(sheet: StudioSheet): string {
  const H = sheet.height;
  const v = sheet.viewport;
  const out: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${nb(sheet.width)}mm" height="${nb(H)}mm" viewBox="0 0 ${nb(sheet.width)} ${nb(H)}" data-schema="studio-sheet/1" data-document="${xml(sheet.documentId)}" data-format="${sheet.format}" data-orientation="${sheet.orientation}" data-scale="${sheet.scale.denominator ?? ""}" data-scale-label="${xml(sheet.scale.label)}" data-clipped="${sheet.clipped}" stroke-linecap="round" stroke-linejoin="round">`,
    `<title>${xml(sheet.documentTitle)}</title>`,
    `<defs><clipPath id="studio-sheet-viewport"><rect x="${nb(v.min.x)}" y="${nb(H - v.max.y)}" width="${nb(v.max.x - v.min.x)}" height="${nb(v.max.y - v.min.y)}"/></clipPath></defs>`,
  ];
  out.push('<g data-sheet-part="frame">');
  svgPrimitives(sheet.frameLines, H, out);
  out.push("</g>");
  out.push('<g data-sheet-part="drawing" clip-path="url(#studio-sheet-viewport)">');
  for (const l of sheet.drawing) {
    out.push(`<g data-layer="${xml(l.layerId)}" data-name="${xml(l.name)}">`);
    svgPrimitives(l.primitives, H, out);
    out.push("</g>");
  }
  out.push("</g>");
  for (const [part, prims] of [["title-block", sheet.titleBlock], ["scale-bar", sheet.scaleBar], ["north", sheet.north], ["provenance", sheet.provenance ?? []]] as const) {
    if (!prims.length) continue;
    out.push(`<g data-sheet-part="${part}">`);
    svgPrimitives(prims, H, out);
    out.push("</g>");
  }
  out.push("</svg>");
  return out.join("\n") + "\n";
}

/** Toutes les primitives de la feuille, dans l'ordre de rendu. */
export const studioSheetPrimitives = (sheet: StudioSheet): Primitive[] => [...sheet.frameLines, ...sheet.drawing.flatMap((l) => l.primitives), ...sheet.titleBlock, ...sheet.scaleBar, ...sheet.north, ...(sheet.provenance ?? [])];

/** PDF vectoriel d'une page à la taille réelle de la feuille (mêmes primitives que le SVG). */
export function studioSheetPdf(sheet: StudioSheet): Uint8Array {
  return pdfPage(sheet.width, sheet.height, studioSheetPrimitives(sheet), sheet.documentTitle);
}

/** Composition et SVG en un appel. */
export function exportStudioSheetSvg(doc: StudioDocument, options: StudioSheetOptions): string {
  return studioSheetSvg(composerFeuilleStudio(doc, options));
}

