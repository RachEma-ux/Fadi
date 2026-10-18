import { STUDIO_DEFAULT_LAYER_ID, StudioValidationError, validateStudioDocument, type StudioDocument, type StudioLine, type StudioRectangle, type StudioShape } from "./document-2d.js";

/**
 * Export IFC 4.3 (IFC4X3_ADD2, fichier STEP ISO 10303-21) d'un document Studio (`studio-document/1`). Écriture directe,
 * pure et déterministe : même document et mêmes métadonnées, même texte octet pour octet. Conformité **testée** avec
 * IfcOpenShell, jamais « certifiée ». Autonome : n'emprunte rien à l'Atelier ; reprend seulement les conventions IFC du
 * dépôt (GlobalId déterministe en base 64 IFC, réels au nanomètre, chaînes `\X2\`).
 *
 * Choix d'écriture (rien n'est inventé) :
 * - repère : le repère du fichier est `local-3d` (z vers le haut, mètres), obtenu du `local-2d` du document par la
 *   conversion explicite (x, y) → (x, y, z) ; aucun géoréférencement n'est connu : pas d'`IfcMapConversion` ;
 * - spatial : `IfcProject` (unités SI, mètre) → `IfcSite` (nom de l'étude) → `IfcBuilding` (nom de la variante) →
 *   un `IfcBuildingStorey` de référence à z = 0 ; ni adresse, ni coordonnées géographiques, ni altitude ;
 * - seuls les objets dont l'utilisateur a déclaré l'extrusion deviennent des éléments 3D :
 *   ligne avec épaisseur → `IfcWall` (`IfcExtrudedAreaSolid` d'un `IfcRectangleProfileDef` longueur × épaisseur, centré
 *   sur la ligne, placé et orienté le long de la ligne, à la cote `base`, sur la hauteur `height`) ;
 *   ligne sans épaisseur → `IfcBuildingElementProxy` portant une surface verticale (`IfcTriangulatedFaceSet` ouvert) ;
 *   rectangle → `IfcBuildingElementProxy` prisme (ni dalle ni poteau ne sont devinés) ;
 *   les types prédéfinis restent `.NOTDEFINED.` ;
 * - objets non extrudés et cotes : non exportés en 3D, comptés dans le jeu de propriétés `Fadi_StudioExport` du projet ;
 * - calques : `IfcPresentationLayerWithStyle` (nom du calque, identifiant Studio, visibilité `LayerOn`, verrou
 *   `LayerBlocked`) sur les éléments de représentation ; les objets des calques masqués sont exportés, calque éteint ;
 * - identités : GlobalId dérivé de la clé du document et de l'identifiant Studio ; l'identifiant est aussi le `Tag`.
 */

export const STUDIO_IFC_SCHEMA = "IFC4X3_ADD2" as const;

export interface StudioIfcMeta {
  /** Nom de l'étude (nom du projet et du site IFC). */
  studyName: string;
  /** Nom de la variante (nom du bâtiment IFC). */
  variantName: string;
  /** Révision exportée, écrite dans `Fadi_StudioExport` et le nom de fichier de l'en-tête. */
  revisionId?: string;
  /** Horodatage ISO 8601 de la révision exportée (fourni par l'appelant, pour la reproductibilité). */
  timestamp: string;
  /** Clé des GlobalId ; l'identifiant du document par défaut. */
  key?: string;
}

/** Effectifs de l'export : ce qui devient 3D et ce qui ne l'est pas. */
export interface StudioIfcSummary {
  walls: number;
  surfaces: number;
  prisms: number;
  nonExtruded: number;
  dimensions: number;
  /** Objets exportés dont le calque est masqué (exportés calque éteint). */
  onHiddenLayers: number;
}

// ——— STEP ———

/** Chaîne STEP : apostrophes et barres obliques inverses doublées, hors ASCII imprimable en `\X2\…\X0\`. */
export function studioStepString(t: string): string {
  let out = "";
  let ext = "";
  const flush = () => {
    if (ext) {
      out += `\\X2\\${ext}\\X0\\`;
      ext = "";
    }
  };
  for (let i = 0; i < t.length; i++) {
    const c = t.charCodeAt(i);
    if (c >= 0x20 && c <= 0x7e) {
      flush();
      out += c === 0x27 ? "''" : c === 0x5c ? "\\\\" : t[i];
    } else if (c >= 0x20 || c === 0x09) ext += c.toString(16).toUpperCase().padStart(4, "0");
    // Les autres contrôles (fins de ligne comprises) sont retirés.
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

class Step {
  readonly lines: string[] = [];
  add(entity: string): number {
    this.lines.push(`#${this.lines.length + 1}=${entity};`);
    return this.lines.length;
  }
}
const ref = (n: number) => `#${n}`;
const refs = (ns: readonly number[]) => `(${ns.map(ref).join(",")})`;
const bool = (b: boolean) => (b ? ".T." : ".F.");

function metaText(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) throw new StudioValidationError(path, "texte non vide attendu");
  return value;
}

// ——— Export ———

interface Built {
  element: number;
  item: number;
  layerId: string;
}

/** Fichier IFC4X3_ADD2 du document (validé d'abord). */
export function exportStudioIfc(input: StudioDocument, meta: StudioIfcMeta): string {
  return studioIfc(input, meta).content;
}

/** Effectifs de `exportStudioIfc` pour le même document (affichage, tests). */
export function studioIfcSummary(input: StudioDocument): StudioIfcSummary {
  return studioIfc(input, { studyName: "-", variantName: "-", timestamp: "1970-01-01T00:00:00" }).summary;
}

function studioIfc(input: StudioDocument, meta: StudioIfcMeta): { content: string; summary: StudioIfcSummary } {
  const doc = validateStudioDocument(input);
  const studyName = metaText(meta?.studyName, "ifc.studyName");
  const variantName = metaText(meta?.variantName, "ifc.variantName");
  const timestamp = metaText(meta?.timestamp, "ifc.timestamp");
  const key = meta.key === undefined ? doc.id : metaText(meta.key, "ifc.key");
  const revisionId = meta.revisionId === undefined ? undefined : metaText(meta.revisionId, "ifc.revisionId");
  const s = new Step();
  const gid = (id: string) => studioStepString(studioIfcGuid(`${key}|${id}`));
  const pt3 = (x: number, y: number, z: number) => s.add(`IFCCARTESIANPOINT((${studioStepReal(x)},${studioStepReal(y)},${studioStepReal(z)}))`);
  const pt2 = (x: number, y: number) => s.add(`IFCCARTESIANPOINT((${studioStepReal(x)},${studioStepReal(y)}))`);
  const dir3 = (x: number, y: number, z: number) => s.add(`IFCDIRECTION((${studioStepReal(x)},${studioStepReal(y)},${studioStepReal(z)}))`);

  // Unités, contexte et repère du fichier (local-3d).
  const units = s.add(`IFCUNITASSIGNMENT(${refs([
    s.add("IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)"), s.add("IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)"),
    s.add("IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.)"), s.add("IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.)"),
  ])})`);
  const origin = pt3(0, 0, 0);
  const zAxis = dir3(0, 0, 1);
  const world = s.add(`IFCAXIS2PLACEMENT3D(${ref(origin)},${ref(zAxis)},${ref(dir3(1, 0, 0))})`);
  const context = s.add(`IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,${ref(world)},$)`);
  const body = s.add(`IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Model',*,*,*,*,${ref(context)},$,.MODEL_VIEW.,$)`);
  const axis = s.add(`IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Axis','Model',*,*,*,*,${ref(context)},$,.GRAPH_VIEW.,$)`);
  const project = s.add(`IFCPROJECT(${gid("project")},$,${studioStepString(studyName)},${studioStepString("Fadi Studio — repère local-3d (x, y, z) dérivé du local-2d, mètres ; sans géoréférencement")},$,${studioStepString(variantName)},$,${refs([context])},${ref(units)})`);

  // Structure spatiale : contenants nommés d'après l'étude et la variante, aucune donnée ajoutée.
  const sitePlacement = s.add(`IFCLOCALPLACEMENT($,${ref(world)})`);
  const site = s.add(`IFCSITE(${gid("site")},$,${studioStepString(studyName)},$,$,${ref(sitePlacement)},$,$,.ELEMENT.,$,$,$,$,$)`);
  const buildingPlacement = s.add(`IFCLOCALPLACEMENT(${ref(sitePlacement)},${ref(world)})`);
  const building = s.add(`IFCBUILDING(${gid("building")},$,${studioStepString(variantName)},$,$,${ref(buildingPlacement)},$,$,.ELEMENT.,$,$,$)`);
  const storeyPlacement = s.add(`IFCLOCALPLACEMENT(${ref(buildingPlacement)},${ref(world)})`);
  const storey = s.add(`IFCBUILDINGSTOREY(${gid("storey")},$,${studioStepString("Niveau de référence")},${studioStepString("z = 0 du repère local-3d")},$,${ref(storeyPlacement)},$,$,.ELEMENT.,0.)`);
  s.add(`IFCRELAGGREGATES(${gid("rel-project-site")},$,$,$,${ref(project)},${refs([site])})`);
  s.add(`IFCRELAGGREGATES(${gid("rel-site-building")},$,$,$,${ref(site)},${refs([building])})`);
  s.add(`IFCRELAGGREGATES(${gid("rel-building-storey")},$,$,$,${ref(building)},${refs([storey])})`);

  const prop = (name: string, value: string) => s.add(`IFCPROPERTYSINGLEVALUE(${studioStepString(name)},$,${value},$)`);
  const length = (v: number) => `IFCLENGTHMEASURE(${studioStepReal(v)})`;
  const label = (v: string) => `IFCLABEL(${studioStepString(v)})`;
  const integer = (v: number) => `IFCINTEGER(${v})`;
  const pset = (id: string, name: string, target: number, props: number[]) => {
    const set = s.add(`IFCPROPERTYSET(${gid(`pset|${id}`)},$,${studioStepString(name)},$,${refs(props)})`);
    s.add(`IFCRELDEFINESBYPROPERTIES(${gid(`rel-pset|${id}`)},$,$,$,${refs([target])},${ref(set)})`);
  };
  const shape = (reps: number[]) => s.add(`IFCPRODUCTDEFINITIONSHAPE($,$,${refs(reps)})`);
  const placed = (x: number, y: number, z: number, ux = 1, uy = 0) =>
    s.add(`IFCLOCALPLACEMENT(${ref(storeyPlacement)},${ref(s.add(`IFCAXIS2PLACEMENT3D(${ref(pt3(x, y, z))},${ref(zAxis)},${ref(dir3(ux, uy, 0))})`))})`);
  const rectangleSolid = (cx: number, cy: number, xDim: number, yDim: number, depth: number) => {
    const profile = s.add(`IFCRECTANGLEPROFILEDEF(.AREA.,$,${ref(s.add(`IFCAXIS2PLACEMENT2D(${ref(pt2(cx, cy))},$)`))},${studioStepReal(xDim)},${studioStepReal(yDim)})`);
    return s.add(`IFCEXTRUDEDAREASOLID(${ref(profile)},$,${ref(zAxis)},${studioStepReal(depth)})`);
  };

  const layers = doc.layers ?? [];
  const layerOf = (o: StudioShape) => o.layerId ?? STUDIO_DEFAULT_LAYER_ID;
  const hiddenLayers = new Set(layers.filter((l) => !l.visible).map((l) => l.id));
  const built: Built[] = [];
  const summary: StudioIfcSummary = { walls: 0, surfaces: 0, prisms: 0, nonExtruded: 0, dimensions: doc.dimensions?.length ?? 0, onHiddenLayers: 0 };

  const wall = (o: StudioLine & { extrusion: NonNullable<StudioLine["extrusion"]> }, thickness: number): Built => {
    const dx = o.end.x - o.start.x, dy = o.end.y - o.start.y;
    const l = Math.hypot(dx, dy);
    const placement = placed(o.start.x, o.start.y, o.extrusion.base, dx / l, dy / l);
    const item = rectangleSolid(l / 2, 0, l, thickness, o.extrusion.height);
    const axisCurve = s.add(`IFCPOLYLINE(${refs([pt2(0, 0), pt2(l, 0)])})`);
    // Corps d'abord : les lecteurs qui ne prennent qu'une représentation construisent le volume.
    const reps = [
      s.add(`IFCSHAPEREPRESENTATION(${ref(body)},'Body','SweptSolid',${refs([item])})`),
      s.add(`IFCSHAPEREPRESENTATION(${ref(axis)},'Axis','Curve2D',${refs([axisCurve])})`),
    ];
    const element = s.add(`IFCWALL(${gid(o.id)},$,${studioStepString(o.id)},$,$,${ref(placement)},${ref(shape(reps))},${studioStepString(o.id)},.NOTDEFINED.)`);
    summary.walls++;
    return { element, item, layerId: layerOf(o) };
  };
  const surface = (o: StudioLine & { extrusion: NonNullable<StudioLine["extrusion"]> }): Built => {
    const dx = o.end.x - o.start.x, dy = o.end.y - o.start.y;
    const l = Math.hypot(dx, dy), h = o.extrusion.height;
    const placement = placed(o.start.x, o.start.y, o.extrusion.base, dx / l, dy / l);
    // Surface verticale dans le plan local xz : (0,0,0) (l,0,0) (l,0,h) (0,0,h), deux triangles, ouverte.
    const coords = [[0, 0, 0], [l, 0, 0], [l, 0, h], [0, 0, h]].map((p) => `(${p.map(studioStepReal).join(",")})`).join(",");
    const list = s.add(`IFCCARTESIANPOINTLIST3D((${coords}),$)`);
    const item = s.add(`IFCTRIANGULATEDFACESET(${ref(list)},$,.F.,((1,2,3),(1,3,4)),$)`);
    const rep = s.add(`IFCSHAPEREPRESENTATION(${ref(body)},'Body','Tessellation',${refs([item])})`);
    const element = s.add(`IFCBUILDINGELEMENTPROXY(${gid(o.id)},$,${studioStepString(o.id)},${studioStepString("Surface verticale (ligne extrudée sans épaisseur)")},$,${ref(placement)},${ref(shape([rep]))},${studioStepString(o.id)},.NOTDEFINED.)`);
    summary.surfaces++;
    return { element, item, layerId: layerOf(o) };
  };
  const prism = (o: StudioRectangle & { extrusion: NonNullable<StudioRectangle["extrusion"]> }): Built => {
    const placement = placed(o.origin.x, o.origin.y, o.extrusion.base);
    const item = rectangleSolid(o.width / 2, o.height / 2, o.width, o.height, o.extrusion.height);
    const rep = s.add(`IFCSHAPEREPRESENTATION(${ref(body)},'Body','SweptSolid',${refs([item])})`);
    const element = s.add(`IFCBUILDINGELEMENTPROXY(${gid(o.id)},$,${studioStepString(o.id)},${studioStepString("Prisme (rectangle extrudé)")},$,${ref(placement)},${ref(shape([rep]))},${studioStepString(o.id)},.NOTDEFINED.)`);
    summary.prisms++;
    return { element, item, layerId: layerOf(o) };
  };

  for (const o of doc.objects) {
    if (!o.extrusion) { summary.nonExtruded++; continue; }
    let b: Built;
    if (o.type === "line") {
      const e = o.extrusion;
      b = e.thickness !== undefined ? wall({ ...o, extrusion: e }, e.thickness) : surface({ ...o, extrusion: e });
      pset(`object|${o.id}`, "Fadi_StudioExtrusion", b.element, [
        prop("StudioId", label(o.id)), prop("Base", length(e.base)), prop("Height", length(e.height)),
        ...(e.thickness !== undefined ? [prop("Thickness", length(e.thickness))] : []),
      ]);
    } else {
      const e = o.extrusion;
      b = prism({ ...o, extrusion: e });
      pset(`object|${o.id}`, "Fadi_StudioExtrusion", b.element, [prop("StudioId", label(o.id)), prop("Base", length(e.base)), prop("Height", length(e.height))]);
    }
    if (hiddenLayers.has(b.layerId)) summary.onHiddenLayers++;
    built.push(b);
  }
  if (built.length) s.add(`IFCRELCONTAINEDINSPATIALSTRUCTURE(${gid("rel-storey-elements")},$,$,$,${refs(built.map((b) => b.element))},${ref(storey)})`);

  // Calques : ordre du document, le calque implicite d'abord s'il n'est pas matérialisé ; un calque vide n'est pas écrit.
  const ordered = [
    ...(layers.some((l) => l.id === STUDIO_DEFAULT_LAYER_ID) ? [] : [{ id: STUDIO_DEFAULT_LAYER_ID, name: "0", visible: true, locked: false }]),
    ...layers,
  ];
  for (const l of ordered) {
    const items = built.filter((b) => b.layerId === l.id).map((b) => b.item);
    if (!items.length) continue;
    s.add(`IFCPRESENTATIONLAYERWITHSTYLE(${studioStepString(l.name)},$,${refs(items)},${studioStepString(l.id)},${bool(l.visible)},.F.,${bool(l.locked)},())`);
  }

  pset("export", "Fadi_StudioExport", project, [
    prop("DocumentId", label(doc.id)),
    ...(revisionId !== undefined ? [prop("RevisionId", label(revisionId))] : []),
    prop("Schema", label("studio-document/1")),
    prop("Frame", label("local-2d (x, y) → local-3d (x, y, z), m")),
    prop("ExportedWalls", integer(summary.walls)),
    prop("ExportedSurfaces", integer(summary.surfaces)),
    prop("ExportedPrisms", integer(summary.prisms)),
    prop("NonExtrudedObjects", integer(summary.nonExtruded)),
    prop("DimensionsNotExported", integer(summary.dimensions)),
    prop("ObjectsOnHiddenLayers", integer(summary.onHiddenLayers)),
  ]);

  const header = [
    "ISO-10303-21;",
    "HEADER;",
    "FILE_DESCRIPTION(('ViewDefinition [ReferenceView]'),'2;1');",
    `FILE_NAME(${studioStepString(`studio_${doc.id}${revisionId ? `_${revisionId}` : ""}.ifc`)},${studioStepString(timestamp)},(''),(''),${studioStepString("Fadi — Studio (atelier-model, écriture directe)")},'Fadi','');`,
    `FILE_SCHEMA(('${STUDIO_IFC_SCHEMA}'));`,
    "ENDSEC;",
    "DATA;",
  ];
  return { content: [...header, ...s.lines, "ENDSEC;", "END-ISO-10303-21;", ""].join("\n"), summary };
}
