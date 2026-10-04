/**
 * Lecture d'un fichier IFC avec web-ifc (MPL-2.0, D-013) → `LectureIfc` du modèle pur (`commandesImportIfc`).
 *
 * - géométrie : maillages triangulés de web-ifc (les vides des ouvertures sont déjà soustraits des murs) ; web-ifc
 *   rend des sommets en mètres, Y vers le haut, `(x, y, z)_IFC → (x, z, −y)` : la conversion inverse
 *   `X = x′, Y = −z′, Z = y′` est appliquée ici, une seule fois ;
 * - étage d'un produit : remontée des relations de contenance (`IfcRelContainedInSpatialStructure`), d'agrégation
 *   (`IfcRelAggregates`) et de vides / remplissages (`IfcRelVoidsElement`, `IfcRelFillsElement`) jusqu'à un
 *   `IfcBuildingStorey` ;
 * - repère : `IfcMapConversion` (est, nord, hauteur, axe X, échelle) et nom du `IfcProjectedCRS`, lus tels quels.
 */
import * as WebIFC from "web-ifc";
import type { EtageIfcLu, LectureIfc, ProduitIfcLu } from "@parcours/atelier-model";

let instance: Promise<WebIFC.IfcAPI> | null = null;
function ifcApi(): Promise<WebIFC.IfcAPI> {
  instance ??= (async () => {
    const api = new WebIFC.IfcAPI();
    await api.Init();
    return api;
  })();
  return instance;
}

/** Classe IFC dans la casse du schéma (web-ifc ne donne que les majuscules). */
const CASSE: Record<string, string> = Object.fromEntries(
  [
    "IfcWall", "IfcWallStandardCase", "IfcSlab", "IfcRoof", "IfcDoor", "IfcWindow", "IfcStair", "IfcStairFlight", "IfcColumn", "IfcBeam",
    "IfcRailing", "IfcSpace", "IfcBuildingElementProxy", "IfcCovering", "IfcFurnishingElement", "IfcFurniture", "IfcMember", "IfcPlate",
    "IfcFooting", "IfcRamp", "IfcRampFlight", "IfcCurtainWall", "IfcFlowTerminal", "IfcFlowSegment", "IfcFlowFitting", "IfcOpeningElement",
    "IfcAnnotation", "IfcSite", "IfcBuilding", "IfcBuildingStorey", "IfcPile", "IfcChimney", "IfcShadingDevice", "IfcSanitaryTerminal",
    "IfcGeographicElement", "IfcTransportElement", "IfcDistributionElement", "IfcElementAssembly", "IfcVirtualElement", "IfcSlabStandardCase",
  ].map((c) => [c.toUpperCase(), c]),
);
const casse = (majuscules: string) => CASSE[majuscules] ?? majuscules;

type Ligne = Record<string, unknown>;
const val = (x: unknown): unknown => (x && typeof x === "object" && "value" in (x as Ligne) ? (x as Ligne)["value"] : x);
const texte = (x: unknown): string | null => {
  const v = val(x);
  return typeof v === "string" && v.trim() ? v : null;
};
const nombre = (x: unknown): number | null => {
  const v = val(x);
  return typeof v === "number" && Number.isFinite(v) ? v : null;
};
const refs = (x: unknown): number[] => (Array.isArray(x) ? x.map((r) => Number(val(r))).filter((n) => Number.isInteger(n)) : []);

function ids(api: WebIFC.IfcAPI, modele: number, type: number): number[] {
  const v = api.GetLineIDsWithType(modele, type);
  const out: number[] = [];
  for (let i = 0; i < v.size(); i++) out.push(v.get(i));
  return out;
}

export async function lireIfc(octets: Uint8Array): Promise<LectureIfc> {
  const api = await ifcApi();
  const modele = api.OpenModel(octets, { COORDINATE_TO_ORIGIN: false });
  if (modele < 0) throw new Error("Fichier IFC illisible par web-ifc.");
  try {
    const schema = api.GetModelSchema(modele) ?? "inconnu";
    let application: string | null = null;
    try {
      const h = api.GetHeaderLine(modele, WebIFC.FILE_NAME) as { arguments?: unknown[] } | undefined;
      const a = h?.arguments;
      const sys = a && Array.isArray(a) ? [texte(a[5]), texte(a[4])].filter(Boolean).join(" · ") : "";
      application = sys || null;
    } catch {
      application = null;
    }

    // Parenté spatiale : enfant → parent.
    const parent = new Map<number, number>();
    for (const r of ids(api, modele, WebIFC.IFCRELCONTAINEDINSPATIALSTRUCTURE)) {
      const l = api.GetLine(modele, r) as Ligne;
      const s = Number(val(l["RelatingStructure"]));
      for (const e of refs(l["RelatedElements"])) parent.set(e, s);
    }
    for (const r of ids(api, modele, WebIFC.IFCRELAGGREGATES)) {
      const l = api.GetLine(modele, r) as Ligne;
      const s = Number(val(l["RelatingObject"]));
      for (const e of refs(l["RelatedObjects"])) if (!parent.has(e)) parent.set(e, s);
    }
    for (const r of ids(api, modele, WebIFC.IFCRELVOIDSELEMENT)) {
      const l = api.GetLine(modele, r) as Ligne;
      const o = Number(val(l["RelatedOpeningElement"]));
      if (!parent.has(o)) parent.set(o, Number(val(l["RelatingBuildingElement"])));
    }
    for (const r of ids(api, modele, WebIFC.IFCRELFILLSELEMENT)) {
      const l = api.GetLine(modele, r) as Ligne;
      const e = Number(val(l["RelatedBuildingElement"]));
      if (!parent.has(e)) parent.set(e, Number(val(l["RelatingOpeningElement"])));
    }

    const etagesIds = new Set(ids(api, modele, WebIFC.IFCBUILDINGSTOREY));
    const guid = new Map<number, string>();
    const etages: EtageIfcLu[] = [];
    for (const id of etagesIds) {
      const l = api.GetLine(modele, id) as Ligne;
      const g = texte(l["GlobalId"]) ?? `etage-${id}`;
      guid.set(id, g);
      etages.push({ globalId: g, nom: texte(l["Name"]), elevation: nombre(l["Elevation"]) ?? 0 });
    }
    // L'altitude d'un étage est relue sur son placement quand il en a un (plus sûr que l'attribut, facultatif).
    const etageDe = (id: number): string | null => {
      let c: number | undefined = id;
      for (let k = 0; k < 64 && c !== undefined; k++) {
        if (etagesIds.has(c)) return guid.get(c)!;
        c = parent.get(c);
      }
      return null;
    };

    const produits = new Map<number, ProduitIfcLu>();
    const ajouterMaillage = (mesh: WebIFC.FlatMesh) => {
      const id = mesh.expressID;
      let p = produits.get(id);
      if (!p) {
        const l = api.GetLine(modele, id) as Ligne;
        p = {
          globalId: texte(l["GlobalId"]) ?? `express-${id}`,
          classe: casse(api.GetNameFromTypeCode(api.GetLineType(modele, id))),
          nom: texte(l["Name"]),
          type: texte(l["ObjectType"]),
          etageGlobalId: etageDe(id),
          maillage: { positions: [], indices: [] },
        };
        produits.set(id, p);
      }
      for (let g = 0; g < mesh.geometries.size(); g++) {
        const pg = mesh.geometries.get(g);
        const geo = api.GetGeometry(modele, pg.geometryExpressID);
        const v = api.GetVertexArray(geo.GetVertexData(), geo.GetVertexDataSize());
        const ix = api.GetIndexArray(geo.GetIndexData(), geo.GetIndexDataSize());
        const t = pg.flatTransformation;
        const base = p.maillage.positions.length / 3;
        for (let i = 0; i + 5 < v.length; i += 6) {
          const x = v[i]!;
          const y = v[i + 1]!;
          const z = v[i + 2]!;
          // Transformation (colonne d'abord), puis retour en Z vers le haut.
          const xp = t[0]! * x + t[4]! * y + t[8]! * z + t[12]!;
          const yp = t[1]! * x + t[5]! * y + t[9]! * z + t[13]!;
          const zp = t[2]! * x + t[6]! * y + t[10]! * z + t[14]!;
          p.maillage.positions.push(xp, -zp, yp);
        }
        for (let k = 0; k < ix.length; k++) p.maillage.indices.push(base + ix[k]!);
        geo.delete();
      }
    };
    api.StreamAllMeshes(modele, ajouterMaillage);
    const espaces = ids(api, modele, WebIFC.IFCSPACE);
    if (espaces.length) api.StreamMeshes(modele, espaces, ajouterMaillage);

    const ignores: LectureIfc["ignores"] = [];
    const ouvertures = ids(api, modele, WebIFC.IFCOPENINGELEMENT).length;
    if (ouvertures) ignores.push({ classe: "IfcOpeningElement", nombre: ouvertures, raison: "vides non importés : déjà soustraits du maillage de l'élément hôte" });
    // Produits rattachés à la structure mais sans maillage (conteneurs comme IfcRoof, objets sans volume) : comptés,
    // jamais passés sous silence.
    const sansMaillage = new Map<string, number>();
    const exclus = new Set(["IfcOpeningElement", "IfcAnnotation", "IfcBuildingStorey", "IfcBuilding", "IfcSite", "IfcProject"]);
    for (const id of parent.keys()) {
      if (produits.has(id)) continue;
      const classe = casse(api.GetNameFromTypeCode(api.GetLineType(modele, id)));
      if (exclus.has(classe)) continue;
      sansMaillage.set(classe, (sansMaillage.get(classe) ?? 0) + 1);
    }
    for (const [classe, nombre] of [...sansMaillage].sort()) ignores.push({ classe, nombre, raison: "sans représentation 3D lisible (conteneur ou objet sans volume) : non importé" });
    const annotations = ids(api, modele, WebIFC.IFCANNOTATION).length;
    if (annotations) ignores.push({ classe: "IfcAnnotation", nombre: annotations, raison: "annotations 2D non importées (cotes et textes à recréer)" });

    let conversion: LectureIfc["conversion"] = null;
    const mc = ids(api, modele, WebIFC.IFCMAPCONVERSION)[0];
    if (mc !== undefined) {
      const l = api.GetLine(modele, mc) as Ligne;
      const crsId = Number(val(l["TargetCRS"]));
      const crs = Number.isInteger(crsId) ? (api.GetLine(modele, crsId) as Ligne) : null;
      conversion = {
        crs: crs ? texte(crs["Name"]) : null,
        est: nombre(l["Eastings"]) ?? 0,
        nord: nombre(l["Northings"]) ?? 0,
        hauteur: nombre(l["OrthogonalHeight"]) ?? 0,
        axeX: [nombre(l["XAxisAbscissa"]) ?? 1, nombre(l["XAxisOrdinate"]) ?? 0],
        echelle: nombre(l["Scale"]) ?? 1,
      };
    }
    return { schema, application, etages, produits: [...produits.values()], conversion, ignores };
  } finally {
    api.CloseModel(modele);
  }
}
