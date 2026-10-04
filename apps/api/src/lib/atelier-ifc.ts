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
import type { AnnotationIfcLue, EtageIfcLu, LectureIfc, ProduitIfcLu } from "@parcours/atelier-model";

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
    "IfcMaterial", "IfcMaterialLayerSetUsage", "IfcMaterialLayerSet", "IfcMaterialList", "IfcMaterialConstituentSet", "IfcMaterialProfileSetUsage",
    "IfcMaterialProfileSet", "IfcPropertySet", "IfcPropertySingleValue", "IfcLocalPlacement", "IfcTextLiteral", "IfcTextLiteralWithExtent",
    "IfcPolyline", "IfcIndexedPolyCurve", "IfcGeometricCurveSet", "IfcGeometricSet", "IfcLengthMeasure", "IfcPositiveLengthMeasure",
    "IfcAreaMeasure", "IfcVolumeMeasure", "IfcPlaneAngleMeasure", "IfcThermalTransmittanceMeasure", "IfcMassMeasure", "IfcCountMeasure",
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

    // Unité de longueur du fichier (préfixe SI) : les coordonnées lues ici directement (annotations, épaisseurs) en mètres.
    let unite = 1;
    const PREFIXES: Record<string, number> = { MILLI: 0.001, CENTI: 0.01, DECI: 0.1, KILO: 1000 };
    for (const id of ids(api, modele, WebIFC.IFCSIUNIT)) {
      const l = api.GetLine(modele, id) as Ligne;
      if (String(val(l["UnitType"])) === "LENGTHUNIT") unite = PREFIXES[String(val(l["Prefix"]) ?? "")] ?? 1;
    }
    for (const id of ids(api, modele, WebIFC.IFCCONVERSIONBASEDUNIT)) {
      const l = api.GetLine(modele, id) as Ligne;
      if (String(val(l["UnitType"])) !== "LENGTHUNIT") continue;
      const nom = (texte(l["Name"]) ?? "").toUpperCase();
      unite = nom.includes("FOOT") ? 0.3048 : nom.includes("INCH") ? 0.0254 : unite;
    }
    const ligne = (id: number): Ligne | null => {
      try {
        return Number.isInteger(id) && id > 0 ? (api.GetLine(modele, id) as Ligne) : null;
      } catch {
        return null;
      }
    };
    const typeDe = (id: number) => casse(api.GetNameFromTypeCode(api.GetLineType(modele, id)));
    const nombres = (x: unknown): number[] => (Array.isArray(x) ? x.map((v) => Number(val(v))).filter((n) => Number.isFinite(n)) : []);

    // Types, matériaux et propriétés des produits importés.
    const typeNom = new Map<number, string>();
    for (const r of ids(api, modele, WebIFC.IFCRELDEFINESBYTYPE)) {
      const l = api.GetLine(modele, r) as Ligne;
      const t = ligne(Number(val(l["RelatingType"])));
      const nom = t ? texte(t["Name"]) : null;
      if (nom) for (const e of refs(l["RelatedObjects"])) typeNom.set(e, nom);
    }
    const materiauxDe = (id: number, profondeur = 0): { nom: string; epaisseur: number | null }[] => {
      const l = ligne(id);
      if (!l || profondeur > 4) return [];
      const t = typeDe(id);
      const nomMat = (m: unknown) => {
        const x = ligne(Number(val(m)));
        return x ? texte(x["Name"]) : null;
      };
      switch (t) {
        case "IfcMaterial":
          return texte(l["Name"]) ? [{ nom: texte(l["Name"])!, epaisseur: null }] : [];
        case "IfcMaterialLayerSetUsage":
          return materiauxDe(Number(val(l["ForLayerSet"])), profondeur + 1);
        case "IfcMaterialLayerSet":
          return refs(l["MaterialLayers"]).flatMap((c) => {
            const x = ligne(c);
            if (!x) return [];
            const e = nombre(x["LayerThickness"]);
            return [{ nom: nomMat(x["Material"]) ?? texte(x["Name"]) ?? "couche sans matériau", epaisseur: e === null ? null : Math.round(e * unite * 1e6) / 1e6 }];
          });
        case "IfcMaterialList":
          return refs(l["Materials"]).flatMap((m) => materiauxDe(m, profondeur + 1));
        case "IfcMaterialConstituentSet":
          return refs(l["MaterialConstituents"]).flatMap((c) => {
            const x = ligne(c);
            const n = x ? nomMat(x["Material"]) : null;
            return n ? [{ nom: n, epaisseur: null }] : [];
          });
        case "IfcMaterialProfileSetUsage":
          return materiauxDe(Number(val(l["ForProfileSet"])), profondeur + 1);
        case "IfcMaterialProfileSet":
          return refs(l["MaterialProfiles"]).flatMap((c) => {
            const x = ligne(c);
            const n = x ? nomMat(x["Material"]) : null;
            return n ? [{ nom: n, epaisseur: null }] : [];
          });
        default:
          return [];
      }
    };
    const materiaux = new Map<number, { nom: string; epaisseur: number | null }[]>();
    for (const r of ids(api, modele, WebIFC.IFCRELASSOCIATESMATERIAL)) {
      const l = api.GetLine(modele, r) as Ligne;
      const m = materiauxDe(Number(val(l["RelatingMaterial"])));
      if (m.length) for (const e of refs(l["RelatedObjects"])) materiaux.set(e, m);
    }
    const proprietes = new Map<number, NonNullable<ProduitIfcLu["proprietes"]>>();
    for (const r of ids(api, modele, WebIFC.IFCRELDEFINESBYPROPERTIES)) {
      const l = api.GetLine(modele, r) as Ligne;
      const ps = ligne(Number(val(l["RelatingPropertyDefinition"])));
      if (!ps || typeDe(Number(val(l["RelatingPropertyDefinition"]))) !== "IfcPropertySet") continue;
      const ensemble = texte(ps["Name"]) ?? "Pset";
      const valeurs: NonNullable<ProduitIfcLu["proprietes"]> = [];
      for (const pid of refs(ps["HasProperties"])) {
        const q = ligne(pid);
        if (!q || typeDe(pid) !== "IfcPropertySingleValue") continue;
        const nv = q["NominalValue"] as Ligne | null | undefined;
        // web-ifc : valeur dans `value` (textes, booléens) ou `_representationValue` (mesures), type dans `name`.
        const brute = nv && typeof nv === "object" ? (nv["value"] ?? nv["_representationValue"]) : null;
        const v = typeof brute === "object" && brute !== null && "value" in (brute as Ligne) ? (brute as Ligne)["value"] : brute;
        const nom = texte(q["Name"]);
        if (!nom || (typeof v !== "string" && typeof v !== "number" && typeof v !== "boolean")) continue;
        const mesure = nv && typeof nv["name"] === "string" ? String(nv["name"]) : nv && typeof nv["label"] === "string" ? String(nv["label"]) : null;
        valeurs.push({ ensemble, nom, valeur: v, mesure: mesure && /MEASURE$/i.test(mesure) ? casse(mesure) : null });
      }
      for (const e of refs(l["RelatedObjects"])) proprietes.set(e, [...(proprietes.get(e) ?? []), ...valeurs]);
    }
    for (const [id, p] of produits) {
      if (typeNom.has(id)) p.typeNom = typeNom.get(id)!;
      if (materiaux.has(id)) p.materiaux = materiaux.get(id)!;
      if (proprietes.has(id)) p.proprietes = proprietes.get(id)!;
    }

    // Annotations 2D : placement local composé (IfcLocalPlacement → IfcAxis2Placement3D), puis textes et polylignes.
    type M4 = number[];
    const mult = (a: M4, b: M4): M4 => {
      const o = new Array<number>(16).fill(0);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) o[i * 4 + j]! += a[i * 4 + k]! * b[k * 4 + j]!;
      return o;
    };
    const I4: M4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const point = (id: number) => {
      const l = ligne(id);
      const c = l ? nombres(l["Coordinates"]) : [];
      return { x: (c[0] ?? 0) * unite, y: (c[1] ?? 0) * unite, z: (c[2] ?? 0) * unite };
    };
    const axe = (id: number): M4 => {
      const l = ligne(id);
      if (!l) return I4;
      const o = point(Number(val(l["Location"])));
      const dz = ligne(Number(val(l["Axis"])));
      const dx = ligne(Number(val(l["RefDirection"])));
      const z = dz ? nombres(dz["DirectionRatios"]) : [0, 0, 1];
      const xr = dx ? nombres(dx["DirectionRatios"]) : [1, 0, 0];
      const nz = Math.hypot(z[0] ?? 0, z[1] ?? 0, z[2] ?? 1) || 1;
      const Z = [(z[0] ?? 0) / nz, (z[1] ?? 0) / nz, (z[2] ?? 1) / nz];
      const X0 = [xr[0] ?? 1, xr[1] ?? 0, xr[2] ?? 0];
      const d = X0[0]! * Z[0]! + X0[1]! * Z[1]! + X0[2]! * Z[2]!;
      const Xp = [X0[0]! - d * Z[0]!, X0[1]! - d * Z[1]!, X0[2]! - d * Z[2]!];
      const nx = Math.hypot(Xp[0]!, Xp[1]!, Xp[2]!) || 1;
      const X = Xp.map((v) => v / nx);
      const Y = [Z[1]! * X[2]! - Z[2]! * X[1]!, Z[2]! * X[0]! - Z[0]! * X[2]!, Z[0]! * X[1]! - Z[1]! * X[0]!];
      return [X[0]!, Y[0]!, Z[0]!, o.x, X[1]!, Y[1]!, Z[1]!, o.y, X[2]!, Y[2]!, Z[2]!, o.z, 0, 0, 0, 1];
    };
    const placement = (id: number, profondeur = 0): M4 => {
      const l = ligne(id);
      if (!l || profondeur > 32 || typeDe(id) !== "IfcLocalPlacement") return I4;
      const rel = Number(val(l["PlacementRelTo"]));
      const local = axe(Number(val(l["RelativePlacement"])));
      return Number.isInteger(rel) && rel > 0 ? mult(placement(rel, profondeur + 1), local) : local;
    };
    const appliquer = (m: M4, p: { x: number; y: number; z: number }) => ({ x: m[0]! * p.x + m[1]! * p.y + m[2]! * p.z + m[3]!, y: m[4]! * p.x + m[5]! * p.y + m[6]! * p.z + m[7]!, z: m[8]! * p.x + m[9]! * p.y + m[10]! * p.z + m[11]! });
    const annotations: AnnotationIfcLue[] = [];
    for (const id of ids(api, modele, WebIFC.IFCANNOTATION)) {
      const l = api.GetLine(modele, id) as Ligne;
      const M = placement(Number(val(l["ObjectPlacement"])));
      const a: AnnotationIfcLue = { globalId: texte(l["GlobalId"]) ?? `express-${id}`, nom: texte(l["Name"]), etageGlobalId: etageDe(id), textes: [], polylignes: [] };
      const forme = ligne(Number(val(l["Representation"])));
      const items: number[] = [];
      for (const rep of forme ? refs(forme["Representations"]) : []) {
        const r = ligne(rep);
        if (r) items.push(...refs(r["Items"]));
      }
      const visiter = (item: number, profondeur: number) => {
        const x = ligne(item);
        if (!x || profondeur > 6) return;
        const t = typeDe(item);
        if (t === "IfcTextLiteral" || t === "IfcTextLiteralWithExtent") {
          const pl = ligne(Number(val(x["Placement"])));
          const o = pl ? point(Number(val(pl["Location"]))) : { x: 0, y: 0, z: 0 };
          const q = appliquer(M, o);
          const txt = texte(x["Literal"]);
          if (txt) a.textes.push({ texte: txt, ...q });
        } else if (t === "IfcPolyline") {
          a.polylignes.push(refs(x["Points"]).map((pp) => appliquer(M, point(pp))));
        } else if (t === "IfcIndexedPolyCurve") {
          const liste = ligne(Number(val(x["Points"])));
          const coords = liste && Array.isArray(liste["CoordList"]) ? (liste["CoordList"] as unknown[]).map((c) => nombres(c)) : [];
          a.polylignes.push(coords.map((c) => appliquer(M, { x: (c[0] ?? 0) * unite, y: (c[1] ?? 0) * unite, z: (c[2] ?? 0) * unite })));
        } else if (t === "IfcGeometricCurveSet" || t === "IfcGeometricSet") {
          for (const e of refs(x["Elements"])) visiter(e, profondeur + 1);
        }
      };
      for (const it of items) visiter(it, 0);
      annotations.push(a);
    }

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
    return { schema, application, etages, produits: [...produits.values()], conversion, ignores, annotations };
  } finally {
    api.CloseModel(modele);
  }
}
