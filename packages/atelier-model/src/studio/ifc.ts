import { studioSignedArea } from "./courbes.js";
import { STUDIO_DEFAULT_LAYER_ID, StudioValidationError, validateStudioDocument, type StudioDocument, type StudioExtrusion, type StudioPoint, type StudioShape } from "./document-2d.js";
import { bool, ref, refs, Step, studioIfcGuid, studioStepReal, studioStepString, type IfcConstruit, type IfcContexte, type StudioIfcSummary } from "./exporteurs/ifc-step.js";
import { typeObjet } from "./objets/index.js";
import { studioIfcSolide } from "./objets-3d/ifc.js";

export { studioIfcGuid, studioStepReal, studioStepString, type StudioIfcSummary } from "./exporteurs/ifc-step.js";

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
 *   cercle → `IfcBuildingElementProxy` prisme d'un `IfcCircleProfileDef` (exact) ;
 *   polyligne fermée → `IfcBuildingElementProxy` prisme d'un `IfcArbitraryClosedProfileDef` sur son contour discrétisé
 *   (arcs en `STUDIO_SEGMENTS_PAR_TOUR` segments par tour, déterministe) ;
 *   arc avec épaisseur → `IfcWall` (profil de couronne discrétisé, centré sur l'arc) ; arc sans épaisseur et polyligne
 *   ouverte → `IfcBuildingElementProxy` surface verticale (`IfcTriangulatedFaceSet` ouvert le long du tracé discrétisé) ;
 *   les types prédéfinis restent `.NOTDEFINED.` ;
 * - objets non extrudés et cotes : non exportés en 3D, comptés dans le jeu de propriétés `Fadi_StudioExport` du projet ;
 * - annotations 2D (cotes angulaires, textes) : aucun `IfcAnnotation` n'est écrit (choix explicite : l'IFC de Studio ne
 *   porte que les objets extrudés) ; elles sont comptées (`AnnotationsNotExported`) quand le document en contient ;
 * - calques : `IfcPresentationLayerWithStyle` (nom du calque, identifiant Studio, visibilité `LayerOn`, verrou
 *   `LayerBlocked`) sur les éléments de représentation ; les objets des calques masqués sont exportés, calque éteint ;
 * - identités : GlobalId dérivé de la clé du document et de l'identifiant Studio ; l'identifiant est aussi le `Tag`.
 *
 * L'élément de chaque objet extrudé est écrit par son type (`objets/<type>.ts`, `ifc`) avec le contexte `IfcContexte` ;
 * ce module écrit l'en-tête, la structure spatiale, les jeux de propriétés et les calques.
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

function metaText(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) throw new StudioValidationError(path, "texte non vide attendu");
  return value;
}

// ——— Export ———

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
  const built: IfcConstruit[] = [];
  const summary: StudioIfcSummary = { walls: 0, surfaces: 0, prisms: 0, nonExtruded: 0, dimensions: doc.dimensions?.length ?? 0, onHiddenLayers: 0 };
  // Annotations (cotes angulaires, textes) : non exportées, comptées (jamais omises en silence).
  if (doc.annotations?.length) summary.annotations = doc.annotations.length;

  /** Profil fermé discrétisé (coordonnées absolues du plan, sens trigonométrique), extrudé depuis la cote de base. */
  const arbitrarySolid = (ring: StudioPoint[], depth: number) => {
    const r = studioSignedArea(ring) < 0 ? [...ring].reverse() : ring;
    const curve = s.add(`IFCPOLYLINE(${refs([...r, r[0]!].map((p) => pt2(p.x, p.y)))})`);
    const profile = s.add(`IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,${ref(curve)})`);
    return s.add(`IFCEXTRUDEDAREASOLID(${ref(profile)},$,${ref(zAxis)},${studioStepReal(depth)})`);
  };
  const proxy = (o: StudioShape, description: string, item: number, representation: "SweptSolid" | "Tessellation", placement: number) => {
    const rep = s.add(`IFCSHAPEREPRESENTATION(${ref(body)},'Body','${representation}',${refs([item])})`);
    return s.add(`IFCBUILDINGELEMENTPROXY(${gid(o.id)},$,${studioStepString(o.id)},${studioStepString(description)},$,${ref(placement)},${ref(shape([rep]))},${studioStepString(o.id)},.NOTDEFINED.)`);
  };
  /** Surface verticale ouverte le long d'un tracé discrétisé (coordonnées absolues, z de 0 à h au-dessus de la base). */
  const stripItem = (path: StudioPoint[], h: number) => {
    const n = path.length;
    const coords = [...path.map((p) => [p.x, p.y, 0]), ...path.map((p) => [p.x, p.y, h])].map((p) => `(${p.map(studioStepReal).join(",")})`).join(",");
    const list = s.add(`IFCCARTESIANPOINTLIST3D((${coords}),$)`);
    const faces: string[] = [];
    for (let i = 1; i < n; i++) faces.push(`(${i},${i + 1},${n + i + 1})`, `(${i},${n + i + 1},${n + i})`);
    return s.add(`IFCTRIANGULATEDFACESET(${ref(list)},$,.F.,(${faces.join(",")}),$)`);
  };
  const contexte: IfcContexte = { s, zAxis, body, axis, summary, gid, pt2, shape, placed, rectangleSolid, arbitrarySolid, proxy, stripItem, layerOf };

  for (const o of doc.objects) {
    if (!o.extrusion) { summary.nonExtruded++; continue; }
    const e: StudioExtrusion = o.extrusion;
    const b = typeObjet(o).ifc(o, e, contexte);
    pset(`object|${o.id}`, "Fadi_StudioExtrusion", b.element, [
      prop("StudioId", label(o.id)), prop("Base", length(e.base)), prop("Height", length(e.height)),
      ...(e.thickness !== undefined ? [prop("Thickness", length(e.thickness))] : []),
    ]);
    if (hiddenLayers.has(b.layerId)) summary.onHiddenLayers++;
    built.push(b);
  }
  // Solides libres : un `IfcBuildingElementProxy` `.NOTDEFINED.` chacun (A.3-09), comptés parmi les prismes.
  const solides = doc.solides ?? [];
  for (const sol of solides) {
    const b = studioIfcSolide(sol, contexte);
    const { origin, rotation } = sol.placement;
    pset(`solid|${sol.id}`, "Fadi_StudioFreeSolid", b.element, [
      prop("StudioId", label(sol.id)), prop("Shape", label(sol.type)),
      prop("OriginX", length(origin.x)), prop("OriginY", length(origin.y)), prop("OriginZ", length(origin.z)),
      prop("RotationZ", `IFCPLANEANGLEMEASURE(${studioStepReal(rotation)})`),
      ...(sol.type === "box" ? [prop("Width", length(sol.width)), prop("Depth", length(sol.depth))] : [prop("ProfileVertices", integer(sol.profile.length))]),
      prop("Height", length(sol.height)),
    ]);
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
    ...(solides.length ? [prop("FreeSolids", integer(solides.length))] : []),
    ...(summary.annotations !== undefined ? [prop("AnnotationsNotExported", integer(summary.annotations))] : []),
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
