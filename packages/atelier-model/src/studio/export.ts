import { studioShapeBoundPoints, studioSvgPath } from "./courbes.js";
import { STUDIO_DEFAULT_LAYER_ID, StudioValidationError, validateStudioDocument, type StudioDimension, type StudioDocument, type StudioItem, type StudioPoint } from "./document-2d.js";

/**
 * Exports de fichier d'un document Studio (`studio-document/1`) : SVG et DXF R12 ASCII. Purs et déterministes : même
 * document et mêmes options, même texte octet pour octet. Coordonnées du repère explicite `local-2d`, en mètres, jamais
 * converties (le SVG ne fait que retourner l'axe y, l'écran descendant). Un document produit n'est pas traduit : les
 * seuls textes sont la valeur mesurée des cotes (formatée selon `locale`) et la mention « à résoudre ».
 * Autonome : n'emprunte rien à l'Atelier ; reprend seulement les conventions DXF du dépôt (AC1009, CRLF, $INSUNITS).
 */

export interface StudioExportOptions {
  /** Langue de formatage de la valeur des cotes ; `fr-FR` par défaut. */
  locale?: string;
  /** Hauteur des textes de cote, en mètres ; 0,25 m par défaut. */
  textHeight?: number;
  /** Marge autour des bornes (SVG), en mètres ; par défaut max(0,5 m ; 5 % de la plus grande étendue). */
  margin?: number;
}

/** Mention des cotes dont un lien est rompu : leur valeur n'est pas évaluée. */
export const STUDIO_EXPORT_TO_RESOLVE = "à résoudre" as const;
const DEFAULT_TEXT_HEIGHT = 0.25;
const DXF_LAYER_NAME_MAX = 31;

const nb = (v: number): string => {
  const r = Math.round(v * 1e6) / 1e6;
  return Math.abs(r) < 1e-12 ? "0" : String(r);
};

function options(input: StudioExportOptions | undefined): { locale: string; textHeight: number; margin: number | undefined } {
  const locale = input?.locale ?? "fr-FR";
  let canonical: string;
  try {
    const [first] = Intl.getCanonicalLocales(locale);
    if (!first) throw new RangeError("empty");
    canonical = first;
  } catch {
    throw new StudioValidationError("export.locale", "langue inconnue");
  }
  const textHeight = input?.textHeight ?? DEFAULT_TEXT_HEIGHT;
  if (!Number.isFinite(textHeight) || textHeight <= 0) throw new StudioValidationError("export.textHeight", "hauteur strictement positive attendue");
  const margin = input?.margin;
  if (margin !== undefined && (!Number.isFinite(margin) || margin < 0)) throw new StudioValidationError("export.margin", "marge positive ou nulle attendue");
  return { locale: canonical, textHeight, margin };
}

/** Longueur formatée (mètres, 2 à 3 décimales, sans séparateur de milliers pour rester lisible dans tout lecteur). */
export function formatStudioLength(value: number, locale = "fr-FR"): string {
  return `${new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 3, useGrouping: false }).format(value)} m`;
}

// ——— Calques ———

interface ExportLayer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  dxfName: string;
}

const layerKey = (o: { layerId?: string }): string => o.layerId ?? STUDIO_DEFAULT_LAYER_ID;

/** Nom DXF R12 d'un calque : A–Z, 0–9, `_`, `$`, `-`, 31 caractères au plus ; diacritiques retirés. */
function dxfLayerBase(name: string): string {
  const ascii = name.normalize("NFD").replace(/\p{M}+/gu, "").toUpperCase().replace(/[^A-Z0-9_$-]+/g, "_").replace(/^_+|_+$/g, "");
  const base = ascii.slice(0, DXF_LAYER_NAME_MAX);
  return base === "" || base === "0" ? "L" : base;
}

/**
 * Calques de l'export, dans l'ordre du document ; le calque implicite vient en tête quand il n'est pas matérialisé et
 * devient toujours le calque DXF « 0 ». Les noms DXF en collision reçoivent un suffixe `_2`, `_3`… dans cet ordre.
 */
function exportLayers(doc: StudioDocument): ExportLayer[] {
  const layers = doc.layers ?? [];
  const out: ExportLayer[] = [];
  if (!layers.some((l) => l.id === STUDIO_DEFAULT_LAYER_ID)) out.push({ id: STUDIO_DEFAULT_LAYER_ID, name: "0", visible: true, locked: false, dxfName: "0" });
  const used = new Set<string>(["0"]);
  for (const l of layers) {
    if (l.id === STUDIO_DEFAULT_LAYER_ID) {
      out.push({ ...l, dxfName: "0" });
      continue;
    }
    const base = dxfLayerBase(l.name);
    let name = base;
    for (let n = 2; used.has(name); n++) {
      const suffix = `_${n}`;
      name = base.slice(0, DXF_LAYER_NAME_MAX - suffix.length) + suffix;
    }
    used.add(name);
    out.push({ ...l, dxfName: name });
  }
  return out;
}

/** Noms DXF attribués aux calques du document (identifiant Studio → nom DXF), pour l'affichage et les tests. */
export function studioDxfLayerNames(doc: StudioDocument): Record<string, string> {
  return Object.fromEntries(exportLayers(validateStudioDocument(doc)).map((l) => [l.id, l.dxfName]));
}

// ——— Géométrie dérivée des cotes ———

interface DimensionDrawing {
  dimension: StudioDimension;
  value: number | null;
  label: string;
  a: StudioPoint;
  b: StudioPoint;
  extensions: [StudioPoint, StudioPoint][];
  text: StudioPoint;
  /** Angle du texte en degrés, sens trigonométrique, ramené dans ]-90 ; 90] pour rester lisible. */
  angle: number;
}

function drawDimension(d: StudioDimension, locale: string, textHeight: number): DimensionDrawing {
  const dx = d.end.x - d.start.x, dy = d.end.y - d.start.y;
  // Même formule que `measureStudioDimension` (contrôlé par test), sans revalider le document à chaque cote.
  const length = Math.hypot(dx, dy);
  const value = d.toResolve ? null : length;
  const n = { x: -dy / length, y: dx / length };
  const a = { x: d.start.x + n.x * d.offset, y: d.start.y + n.y * d.offset };
  const b = { x: d.end.x + n.x * d.offset, y: d.end.y + n.y * d.offset };
  const extensions: [StudioPoint, StudioPoint][] = d.offset === 0 ? [] : [[{ ...d.start }, a], [{ ...d.end }, b]];
  let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  let side = 1;
  if (angle > 90 || angle <= -90) {
    angle += angle > 90 ? -180 : 180;
    side = -1;
  }
  const lift = textHeight * 0.3 * side;
  const text = { x: (a.x + b.x) / 2 + n.x * lift, y: (a.y + b.y) / 2 + n.y * lift };
  const label = value === null ? STUDIO_EXPORT_TO_RESOLVE : formatStudioLength(value, locale);
  return { dimension: d, value, label, a, b, extensions, text, angle };
}

function itemPoints(o: StudioItem): StudioPoint[] {
  return o.type === "dimension" ? [] : studioShapeBoundPoints(o);
}

// ——— SVG ———

const xml = (s: string): string =>
  // Caractères de contrôle interdits en XML 1.0 retirés, puis échappement des cinq entités.
  s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

/**
 * SVG du document (lignes `<line>`, rectangles `<rect>`, cercles `<circle>`, arcs et polylignes `<path>` à arcs exacts) : unité utilisateur = 1 m, `viewBox` = bornes des éléments visibles (tous s'il n'y en a aucun) plus
 * la marge ; y retourné (y SVG = −y local). Un `<g data-layer>` par calque, dans l'ordre ; un calque masqué garde son
 * contenu sous `display="none"`. Chaque cote est un `<g data-dimension>` (ligne, lignes d'attache, texte de la valeur
 * mesurée) ; une cote à résoudre porte `data-status="to-resolve"` et la mention « à résoudre ».
 */
export function exportStudioSvg(input: StudioDocument, exportOptions?: StudioExportOptions): string {
  const doc = validateStudioDocument(input);
  const opts = options(exportOptions);
  const layers = exportLayers(doc);
  const visible = new Set(layers.filter((l) => l.visible).map((l) => l.id));
  const dims = (doc.dimensions ?? []).map((d) => drawDimension(d, opts.locale, opts.textHeight));

  const all: StudioPoint[] = [], shown: StudioPoint[] = [];
  const add = (layer: string, pts: StudioPoint[]) => {
    all.push(...pts);
    if (visible.has(layer)) shown.push(...pts);
  };
  for (const o of doc.objects) add(layerKey(o), itemPoints(o));
  for (const g of dims) add(layerKey(g.dimension), [g.a, g.b, g.text, ...g.extensions.flat()]);
  const pts = shown.length ? shown : all;
  // Document vide : bornes nulles autour de l'origine (la marge seule donne la vue).
  let minX = pts.length ? Infinity : 0, minY = pts.length ? Infinity : 0, maxX = pts.length ? -Infinity : 0, maxY = pts.length ? -Infinity : 0;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const extent = Math.max(maxX - minX, maxY - minY);
  const margin = opts.margin ?? Math.max(0.5, extent * 0.05);
  const viewBox = [minX - margin, -maxY - margin, maxX - minX + 2 * margin, maxY - minY + 2 * margin].map(nb).join(" ");

  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" data-schema="studio-document/1" data-document="${xml(doc.id)}" data-units="m" data-frame="local-2d">`,
  ];
  const Y = (y: number) => nb(-y);
  for (const layer of layers) {
    lines.push(`<g data-layer="${xml(layer.id)}" data-name="${xml(layer.name)}"${layer.visible ? "" : ' display="none"'} fill="none" stroke="#000" stroke-width="1" vector-effect="non-scaling-stroke">`);
    for (const o of doc.objects) {
      if (layerKey(o) !== layer.id) continue;
      if (o.type === "line") lines.push(`<line data-id="${xml(o.id)}" x1="${nb(o.start.x)}" y1="${Y(o.start.y)}" x2="${nb(o.end.x)}" y2="${Y(o.end.y)}" vector-effect="non-scaling-stroke"/>`);
      else if (o.type === "circle") lines.push(`<circle data-id="${xml(o.id)}" cx="${nb(o.center.x)}" cy="${Y(o.center.y)}" r="${nb(o.radius)}" vector-effect="non-scaling-stroke"/>`);
      else if (o.type === "arc" || o.type === "polyline") lines.push(`<path data-id="${xml(o.id)}" data-type="${o.type}" d="${studioSvgPath(o, true, nb)}" vector-effect="non-scaling-stroke"/>`);
      else lines.push(`<rect data-id="${xml(o.id)}" x="${nb(o.origin.x)}" y="${Y(o.origin.y + o.height)}" width="${nb(o.width)}" height="${nb(o.height)}" vector-effect="non-scaling-stroke"/>`);
    }
    for (const g of dims) {
      if (layerKey(g.dimension) !== layer.id) continue;
      const status = g.value === null ? "to-resolve" : "resolved";
      lines.push(`<g data-dimension="${xml(g.dimension.id)}" data-status="${status}"${g.value === null ? "" : ` data-value="${nb(g.value)}"`}>`);
      lines.push(`<line x1="${nb(g.a.x)}" y1="${Y(g.a.y)}" x2="${nb(g.b.x)}" y2="${Y(g.b.y)}" vector-effect="non-scaling-stroke"/>`);
      for (const [p, q] of g.extensions) lines.push(`<line x1="${nb(p.x)}" y1="${Y(p.y)}" x2="${nb(q.x)}" y2="${Y(q.y)}" vector-effect="non-scaling-stroke"/>`);
      const rotate = g.angle === 0 ? "" : ` transform="rotate(${nb(-g.angle)} ${nb(g.text.x)} ${Y(g.text.y)})"`;
      lines.push(`<text x="${nb(g.text.x)}" y="${Y(g.text.y)}" font-size="${nb(opts.textHeight)}" font-family="sans-serif" text-anchor="middle" fill="#000" stroke="none"${rotate}>${xml(g.label)}</text>`);
      lines.push("</g>");
    }
    lines.push("</g>");
  }
  lines.push("</svg>");
  return lines.join("\n") + "\n";
}

// ——— DXF R12 ———

/** Chaîne DXF en ASCII strict : fins de ligne et contrôles retirés, hors ASCII en `\U+XXXX`, 250 caractères au plus. */
function dxfText(s: string): string {
  let out = "";
  for (const ch of s.replace(/[\r\n]+/g, " ").replace(/[\u0000-\u001F\u007F]/g, "")) {
    const code = ch.codePointAt(0)!;
    out += code < 0x80 ? ch : code <= 0xffff ? `\\U+${code.toString(16).toUpperCase().padStart(4, "0")}` : "?";
  }
  return out.slice(0, 250);
}

class DxfWriter {
  readonly out: string[] = [];
  pair(code: number, value: string | number): void {
    this.out.push(String(code), typeof value === "number" ? nb(value) : value);
  }
  point(base: number, p: StudioPoint): void {
    this.pair(base, p.x);
    this.pair(base + 10, p.y);
    this.pair(base + 20, 0);
  }
  line(layer: string, a: StudioPoint, b: StudioPoint): void {
    this.pair(0, "LINE");
    this.pair(8, layer);
    this.point(10, a);
    this.point(11, b);
  }
  closedPolyline(layer: string, pts: readonly StudioPoint[]): void {
    this.polyline(layer, pts, true);
  }
  /** POLYLINE R12 (66 = 1, VERTEX… SEQEND) ; renflement d'un segment en code 42 sur son sommet de départ. */
  polyline(layer: string, pts: readonly StudioPoint[], closed: boolean, bulges?: readonly number[]): void {
    this.pair(0, "POLYLINE");
    this.pair(8, layer);
    this.pair(66, 1);
    this.point(10, { x: 0, y: 0 });
    this.pair(70, closed ? 1 : 0);
    pts.forEach((p, i) => {
      this.pair(0, "VERTEX");
      this.pair(8, layer);
      this.point(10, p);
      const b = bulges?.[i] ?? 0;
      if (b !== 0) this.pair(42, b);
    });
    this.pair(0, "SEQEND");
    this.pair(8, layer);
  }
  circle(layer: string, c: StudioPoint, r: number): void {
    this.pair(0, "CIRCLE");
    this.pair(8, layer);
    this.point(10, c);
    this.pair(40, r);
  }
  /** ARC : angles en degrés, sens trigonométrique, de 50 (début) à 51 (fin). */
  arc(layer: string, c: StudioPoint, r: number, start: number, end: number): void {
    this.pair(0, "ARC");
    this.pair(8, layer);
    this.point(10, c);
    this.pair(40, r);
    this.pair(50, (start * 180) / Math.PI);
    this.pair(51, (end * 180) / Math.PI);
  }
  text(layer: string, p: StudioPoint, height: number, value: string, angle: number): void {
    this.pair(0, "TEXT");
    this.pair(8, layer);
    this.point(10, p);
    this.pair(40, height);
    this.pair(1, dxfText(value));
    if (angle) this.pair(50, angle);
    this.pair(72, 1); // centré
    this.point(11, p);
  }
}

/**
 * DXF R12 ASCII (AC1009, CRLF), mètres ($INSUNITS = 6), repère local-2d. Table LAYER : « 0 » (calque implicite) puis
 * les calques du document (nom ASCII dérivé, `studioDxfLayerNames`) ; un calque masqué a une couleur négative (éteint),
 * un calque verrouillé le drapeau 4. Lignes → LINE ; rectangles → POLYLINE fermée de 4 sommets (R12 n'a pas de
 * LWPOLYLINE) ; cercles → CIRCLE ; arcs → ARC (degrés, sens trigonométrique) ; polylignes → POLYLINE (70 = 1 si
 * fermée) dont chaque VERTEX porte le renflement de son segment (code 42, omis s'il est nul) ; cotes → LINE (cote et attaches) + TEXT de la valeur mesurée ou « à résoudre », sur leur calque.
 */
export function exportStudioDxf(input: StudioDocument, exportOptions?: Omit<StudioExportOptions, "margin">): string {
  const doc = validateStudioDocument(input);
  const opts = options(exportOptions);
  const layers = exportLayers(doc);
  const nameOf = new Map(layers.map((l) => [l.id, l.dxfName]));
  const w = new DxfWriter();
  w.pair(999, dxfText(`Fadi Studio - document ${doc.id}`));
  w.pair(999, "studio-document/1 - repere local-2d, metres");
  w.pair(0, "SECTION");
  w.pair(2, "HEADER");
  w.pair(9, "$ACADVER");
  w.pair(1, "AC1009");
  w.pair(9, "$INSUNITS");
  w.pair(70, 6);
  w.pair(0, "ENDSEC");
  w.pair(0, "SECTION");
  w.pair(2, "TABLES");
  w.pair(0, "TABLE");
  w.pair(2, "LTYPE");
  w.pair(70, 1);
  w.pair(0, "LTYPE");
  w.pair(2, "CONTINUOUS");
  w.pair(70, 0);
  w.pair(3, "Solid line");
  w.pair(72, 65);
  w.pair(73, 0);
  w.pair(40, 0);
  w.pair(0, "ENDTAB");
  w.pair(0, "TABLE");
  w.pair(2, "LAYER");
  w.pair(70, layers.length);
  for (const l of layers) {
    w.pair(0, "LAYER");
    w.pair(2, l.dxfName);
    w.pair(70, l.locked ? 4 : 0);
    w.pair(62, l.visible ? 7 : -7);
    w.pair(6, "CONTINUOUS");
  }
  w.pair(0, "ENDTAB");
  w.pair(0, "ENDSEC");
  w.pair(0, "SECTION");
  w.pair(2, "ENTITIES");
  for (const o of doc.objects) {
    const layer = nameOf.get(layerKey(o))!;
    if (o.type === "line") w.line(layer, o.start, o.end);
    else if (o.type === "circle") w.circle(layer, o.center, o.radius);
    else if (o.type === "arc") w.arc(layer, o.center, o.radius, o.startAngle, o.endAngle);
    else if (o.type === "polyline") w.polyline(layer, o.points, o.closed, o.bulges);
    else {
      const { x, y } = o.origin;
      w.closedPolyline(layer, [{ x, y }, { x: x + o.width, y }, { x: x + o.width, y: y + o.height }, { x, y: y + o.height }]);
    }
  }
  for (const d of doc.dimensions ?? []) {
    const g = drawDimension(d, opts.locale, opts.textHeight);
    const layer = nameOf.get(layerKey(d))!;
    w.line(layer, g.a, g.b);
    for (const [p, q] of g.extensions) w.line(layer, p, q);
    w.text(layer, g.text, opts.textHeight, g.label, g.angle);
  }
  w.pair(0, "ENDSEC");
  w.pair(0, "EOF");
  return w.out.join("\r\n") + "\r\n";
}
