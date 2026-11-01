import { studioShapeBoundPoints } from "./courbes.js";
import { STUDIO_DEFAULT_LAYER_ID, StudioValidationError, validateStudioDocument, type StudioDocument, type StudioItem, type StudioPoint } from "./document-2d.js";
import { DxfWriter } from "./exporteurs/dxf.js";
import { dxfText, nb, xml } from "./exporteurs/texte.js";
import { coteDxf, coteSvg, dessinerCote } from "./objets/cote.js";
import { typeObjet } from "./objets/index.js";
import { annotationDxf, annotationPoints, annotationSvg, dessinerAnnotation } from "./objets/annotation.js";
import { architectureDxf, architecturePoints, architectureSvg, studioPlanArchitecture } from "./architecture/plan.js";
import { graphismeDxf, graphismeSvg, studioPointsGraphisme } from "./graphismes/graphismes.js";
import { blocsDxf, insertionDxf, insertionSvg, studioNomsDxfBlocs, studioPointsInsertion } from "./blocs/blocs.js";

export { formatStudioLength, STUDIO_EXPORT_TO_RESOLVE } from "./objets/cote.js";

/**
 * Exports de fichier d'un document Studio (`studio-document/1`) : SVG et DXF R12 ASCII. Purs et déterministes : même
 * document et mêmes options, même texte octet pour octet. Coordonnées du repère explicite `local-2d`, en mètres, jamais
 * converties (le SVG ne fait que retourner l'axe y, l'écran descendant). Un document produit n'est pas traduit : les
 * seuls textes sont la valeur mesurée des cotes (formatée selon `locale`) et la mention « à résoudre ».
 * Autonome : n'emprunte rien à l'Atelier ; reprend seulement les conventions DXF du dépôt (AC1009, CRLF, $INSUNITS).
 * L'écriture de chaque objet est celle de son type (`objets/<type>.ts`, `svg` et `dxf`) ; ce module compose le fichier
 * (en-tête, calques, bornes, ordre) et les cotes (`objets/cote.ts`).
 */

export interface StudioExportOptions {
  /** Langue de formatage de la valeur des cotes ; `fr-FR` par défaut. */
  locale?: string;
  /** Hauteur des textes de cote, en mètres ; 0,25 m par défaut. */
  textHeight?: number;
  /** Marge autour des bornes (SVG), en mètres ; par défaut max(0,5 m ; 5 % de la plus grande étendue). */
  margin?: number;
}

const DEFAULT_TEXT_HEIGHT = 0.25;
const DXF_LAYER_NAME_MAX = 31;

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

function itemPoints(o: StudioItem): StudioPoint[] {
  return o.type === "dimension" || o.type === "angular-dimension" || o.type === "text" ? [] : studioShapeBoundPoints(o);
}

// ——— SVG ———

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
  const dims = (doc.dimensions ?? []).map((d) => dessinerCote(d, opts.locale, opts.textHeight));
  const notes = (doc.annotations ?? []).map((a) => dessinerAnnotation(a, opts.locale, opts.textHeight));
  // Objets architecturaux (A.4) : parties pleines des murs et montants des ouvertures, sur le calque du mur.
  const plan = doc.architecture?.length ? studioPlanArchitecture(doc.architecture) : null;

  const all: StudioPoint[] = [], shown: StudioPoint[] = [];
  const add = (layer: string, pts: StudioPoint[]) => {
    all.push(...pts);
    if (visible.has(layer)) shown.push(...pts);
  };
  for (const o of doc.objects) add(layerKey(o), itemPoints(o));
  for (const g of dims) add(layerKey(g.dimension), [g.a, g.b, g.text, ...g.extensions.flat()]);
  for (const n of notes) add(layerKey(n.annotation), annotationPoints(n));
  if (plan) for (const m of architecturePoints(plan)) add(layerKey(m), m.points);
  for (const g of doc.graphismes ?? []) add(layerKey(g), studioPointsGraphisme(g));
  // Blocs (X.1-01) : chaque insertion bornée par les formes posées de sa définition.
  const defs = new Map((doc.blocs ?? []).map((b) => [b.id, b]));
  for (const i of doc.insertions ?? []) add(layerKey(i), studioPointsInsertion(defs.get(i.bloc)!, i));
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
  for (const layer of layers) {
    lines.push(`<g data-layer="${xml(layer.id)}" data-name="${xml(layer.name)}"${layer.visible ? "" : ' display="none"'} fill="none" stroke="#000" stroke-width="1" vector-effect="non-scaling-stroke">`);
    for (const o of doc.objects) {
      if (layerKey(o) !== layer.id) continue;
      lines.push(typeObjet(o).svg(o));
    }
    for (const g of dims) {
      if (layerKey(g.dimension) !== layer.id) continue;
      lines.push(...coteSvg(g, opts.textHeight));
    }
    for (const n of notes) {
      if (layerKey(n.annotation) !== layer.id) continue;
      lines.push(...annotationSvg(n, opts.textHeight));
    }
    if (plan) lines.push(...architectureSvg(plan, layer.id, layerKey));
    // Graphismes (EX-055) : un `<g data-graphisme>` chacun, `opacity` s'il est transparent.
    for (const g of doc.graphismes ?? []) if (layerKey(g) === layer.id) lines.push(...graphismeSvg(g));
    // Insertions de blocs (X.1-01) : un `<g data-insertion data-bloc>` chacune, formes de la définition posées
    // (la définition n'est pas réutilisable dans le fichier : rapport de fidélité « bloc-developpe »).
    for (const i of doc.insertions ?? []) if (layerKey(i) === layer.id) lines.push(...insertionSvg(defs.get(i.bloc)!, i));
    lines.push("</g>");
  }
  lines.push("</svg>");
  return lines.join("\n") + "\n";
}

// ——— DXF R12 ———

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
  // Blocs (X.1-01) : section BLOCKS (un BLOCK par définition, nom ASCII dérivé) avant les entités.
  const blocs = doc.blocs ?? [];
  const nomsBlocs = studioNomsDxfBlocs(blocs);
  if (blocs.length) blocsDxf(blocs, nomsBlocs, w);
  w.pair(0, "SECTION");
  w.pair(2, "ENTITIES");
  for (const o of doc.objects) typeObjet(o).dxf(o, nameOf.get(layerKey(o))!, w);
  for (const d of doc.dimensions ?? []) coteDxf(dessinerCote(d, opts.locale, opts.textHeight), nameOf.get(layerKey(d))!, opts.textHeight, w);
  // Annotations : cote angulaire → ARC + LINE + TEXT (valeur en degrés ou « à résoudre ») ; texte → TEXT (justification 72).
  for (const a of doc.annotations ?? []) annotationDxf(dessinerAnnotation(a, opts.locale, opts.textHeight), nameOf.get(layerKey(a))!, opts.textHeight, w);
  // Murs (POLYLINE fermée par partie pleine, interrompue aux ouvertures) et montants des ouvertures (LINE).
  if (doc.architecture?.length) architectureDxf(studioPlanArchitecture(doc.architecture), (o) => nameOf.get(layerKey(o))!, w);
  // Graphismes (EX-055) : spline → POLYLINE découpée (STUDIO_SEGMENTS_PAR_BEZIER par morceau), hachure → POLYLINE fermée
  // du contour + LINE par trait, symbole → LINE / CIRCLE / POLYLINE ; transparence déclarée en commentaire 999.
  for (const g of doc.graphismes ?? []) graphismeDxf(g, nameOf.get(layerKey(g))!, w);
  // Insertions (X.1-01) : INSERT (position, facteur x négatif pour la symétrie, rotation en degrés).
  for (const i of doc.insertions ?? []) insertionDxf(i, nomsBlocs.get(i.bloc)!, nameOf.get(layerKey(i))!, w);
  // Contraintes (X.1-01) : relations non représentables en DXF R12, déclarées (la géométrie résolue est écrite).
  for (const c of doc.contraintes ?? []) w.pair(999, dxfText(`contrainte ${c.id} (${c.type}) non representable en DXF R12`));
  w.pair(0, "ENDSEC");
  w.pair(0, "EOF");
  return w.out.join("\r\n") + "\r\n";
}
