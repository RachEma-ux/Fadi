/**
 * (Cas 4, lot C4, étape 6 : D10-S-001, D10-F14-012, N-D10-1, D10-R-002, D10-R-006, N-D10-2, D10-F14-124) IFC structuré,
 * sans bibliothèque. Pur : ni DOM, ni React.
 *
 * - Lecture : étages (IfcBuildingStorey), trame (IfcGrid, axes en polylignes), géoréférencement (IfcMapConversion et
 *   IfcProjectedCRS, ou les jeux ePset_MapConversion / ePset_ProjectedCRS d'IFC2X3), objets avec leur classe, leur
 *   GlobalId, leur étage et leur géométrie (IfcTriangulatedFaceSet, IfcPolygonalFaceSet, faces à IfcPolyLoop,
 *   IfcExtrudedAreaSolid d'un profil rectangle ou polyligne, IfcMappedItem, premier opérande d'un IfcBooleanResult).
 *   Les autres géométries ne sont pas lues : comptées, jamais ignorées en silence.
 * - Export par classes : un IfcBuildingStorey par niveau, IfcWall pour les murs, IfcSpace pour les locaux, la classe et
 *   le GlobalId gardés pour un objet importé, IfcBuildingElementProxy sinon ; schéma IFC2X3, IFC4 ou IFC4X3_ADD2 ;
 *   géoréférencé depuis le point de base et le niveau de référence (aucune projection calculée).
 * - Relecture : le fichier émis est relu et comparé (étages, objets, triangles, GlobalId, géoréférencement).
 * - Contrôle avant émission : constats, jamais de correction.
 */
import { ajouterNiveau } from "./niveaux.js";
import { REGLAGES_DEFAUT } from "./annotations.js";
import { identifierOccurrencesIfc, modifierAnnotations, rattacherOccurrencesNiveau, type Id, type IdentiteIfc, type Modele } from "./geometrie-libre.js";
import { type ArgStep, type EntiteStep, ErreurStep, enumDe, listeDe, lireStep, nombreDe, refDe, refsDe, texteDe } from "./ifc-step.js";
import { chaineIfc, guidIfc } from "./echanges-ifc.js";
import { construireImport, poserImport, type MaillageLu } from "./echanges-import.js";
import type { ContenuImporte } from "./geometrie-libre.js";
import { maillagesPlanche } from "./representation.js";
import { axesQuadrillage, type PointDeBase } from "./point-de-base.js";
import { nonEtanchesDe } from "./echanges.js";
import { ecrireZip, estZip, lireZip } from "./zip.js";
import { locauxTries, mesurerLocal } from "./locaux.js";

export type SchemaIfc = "IFC2X3" | "IFC4" | "IFC4X3_ADD2";
export const SCHEMAS_IFC: readonly SchemaIfc[] = ["IFC2X3", "IFC4", "IFC4X3_ADD2"];

// ---------------------------------------------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------------------------------------------

export interface EtageIfc {
  readonly globalId: string;
  readonly nom: string;
  /** Altitude (m) : Elevation, sinon la hauteur du placement de l'étage. */
  readonly altitude: number;
}

export interface AxeIfc {
  readonly etiquette: string;
  readonly a: readonly [number, number, number];
  readonly b: readonly [number, number, number];
}

export interface GeoreferencementIfc {
  readonly systeme: string;
  readonly e: number;
  readonly n: number;
  readonly h: number;
  /** Direction de l'axe x du projet dans le système projeté (abscisse, ordonnée). */
  readonly xAbscisse: number;
  readonly xOrdonnee: number;
  readonly echelle: number;
}

export interface ObjetIfc {
  readonly globalId: string;
  readonly classe: string;
  readonly nom: string;
  /** GlobalId de l'étage qui le contient ; `null` = aucun. */
  readonly etage: string | null;
  /** Coordonnées monde en mètres, 3 par sommet. */
  readonly positions: readonly number[];
  readonly triangles: readonly number[];
}

export interface LectureIfcStructure {
  readonly schema: string | null;
  /** Mètres par unité de longueur du fichier. */
  readonly echelle: number;
  readonly etages: readonly EtageIfc[];
  readonly axes: readonly AxeIfc[];
  readonly georef: GeoreferencementIfc | null;
  readonly objets: readonly ObjetIfc[];
  /** Objets dont la géométrie n'a pas pu être lue (codage non pris en charge), par classe. */
  readonly nonLus: Readonly<Record<string, number>>;
  /** Objets importés dont une partie de la géométrie n'a pas pu être lue (codage non pris en charge), par classe. */
  readonly partiels: Readonly<Record<string, number>>;
  /** Locaux (IfcSpace) lus : nom, nom long ; ils ne sont pas posés comme objets. */
  readonly espaces: number;
}

/** Classes IFC (en capitales STEP) d'éléments et leur casse d'origine. */
const CLASSES: readonly string[] = [
  "IfcWall", "IfcWallStandardCase", "IfcSlab", "IfcSlabStandardCase", "IfcBeam", "IfcBeamStandardCase", "IfcColumn", "IfcColumnStandardCase", "IfcDoor", "IfcDoorStandardCase",
  "IfcWindow", "IfcWindowStandardCase", "IfcRoof", "IfcStair", "IfcStairFlight", "IfcRamp", "IfcRampFlight", "IfcRailing", "IfcCovering", "IfcCurtainWall", "IfcPlate", "IfcPlateStandardCase", "IfcMember",
  "IfcMemberStandardCase", "IfcFooting", "IfcPile", "IfcBuildingElementProxy", "IfcBuildingElementPart", "IfcFurnishingElement", "IfcFurniture", "IfcFlowTerminal", "IfcFlowSegment", "IfcFlowFitting",
  "IfcDistributionElement", "IfcOpeningElement", "IfcChimney", "IfcShadingDevice", "IfcGeographicElement", "IfcCivilElement", "IfcElementAssembly", "IfcTransportElement",
];
const CASSE = new Map(CLASSES.map((c) => [c.toUpperCase(), c]));
/** Classes « StandardCase » ramenées à leur classe (supprimées en IFC4X3). */
const SANS_STANDARD = (c: string) => c.replace(/StandardCase$/, "");

type M = readonly number[]; // matrice 4×4 en lignes

const IDENT: M = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function mul(a: M, b: M): M {
  const r = new Array<number>(16).fill(0);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) r[i * 4 + j]! += a[i * 4 + k]! * b[k * 4 + j]!;
  return r;
}
const appliquer = (m: M, x: number, y: number, z: number): [number, number, number] => [m[0]! * x + m[1]! * y + m[2]! * z + m[3]!, m[4]! * x + m[5]! * y + m[6]! * z + m[7]!, m[8]! * x + m[9]! * y + m[10]! * z + m[11]!];
const norme = (v: number[]): number[] => {
  const l = Math.hypot(...v);
  return l > 1e-12 ? v.map((x) => x / l) : v;
};
const vect = (a: number[], b: number[]): number[] => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];

/** Lecture d'un fichier IFC (texte STEP) ou d'une archive `.ifczip` (premier fichier `.ifc` de l'archive). */
export function texteIfcDe(donnees: string | Uint8Array): string {
  if (typeof donnees === "string") return donnees;
  if (estZip(donnees)) {
    const entrees = lireZip(donnees);
    const ifc = entrees?.find((e) => /\.ifc$/i.test(e.nom));
    if (!ifc) throw new ErreurStep("archive .ifczip illisible ou sans fichier .ifc");
    return new TextDecoder().decode(ifc.donnees);
  }
  return new TextDecoder().decode(donnees);
}

const FACTEURS: Readonly<Record<string, number>> = { MILLI: 0.001, CENTI: 0.01, DECI: 0.1, KILO: 1000 };

export function lireIfcStructure(donnees: string | Uint8Array): LectureIfcStructure {
  const f = lireStep(texteIfcDe(donnees));
  const E = f.entites;
  const get = (id: number | null): EntiteStep | undefined => (id === null ? undefined : E.get(id));
  const parType = (t: string) => [...E.values()].filter((e) => e.type === t);

  // Unité de longueur du projet : celle de IfcProject.UnitsInContext (les unités propres à un repère cartographique,
  // IfcProjectedCRS.MapUnit, n'y entrent pas) ; à défaut d'affectation, la dernière unité de longueur du fichier ;
  // mètre par défaut. SI (préfixe) ou unité convertie (pied, pouce).
  const facteurUnite = (u: EntiteStep): number | null => {
    if (u.type === "IFCSIUNIT") {
      if (enumDe(u.args[1]) !== "LENGTHUNIT") return null;
      const pre = enumDe(u.args[2]);
      return pre ? (FACTEURS[pre] ?? 1) : 1;
    }
    if (u.type === "IFCCONVERSIONBASEDUNIT") {
      if (enumDe(u.args[1]) !== "LENGTHUNIT") return null;
      const mesure = get(refDe(u.args[3]));
      const v = nombreDe(mesure?.args[0]);
      const base = get(refDe(mesure?.args[1]));
      const pre = base ? enumDe(base.args[2]) : null;
      return v !== null ? v * (pre ? (FACTEURS[pre] ?? 1) : 1) : null;
    }
    return null;
  };
  let echelle = 1;
  const affectation = get(refDe(parType("IFCPROJECT")[0]?.args[8]));
  const unitesProjet = affectation?.type === "IFCUNITASSIGNMENT" ? refsDe(affectation.args[0]).map((r) => get(r)).filter((u): u is EntiteStep => !!u) : null;
  const candidates = unitesProjet ?? [...parType("IFCSIUNIT"), ...parType("IFCCONVERSIONBASEDUNIT")];
  for (const u of candidates) {
    const k = facteurUnite(u);
    if (k !== null) echelle = k;
  }

  const point = (id: number | null): number[] => {
    const p = get(id);
    const c = listeDe(p?.args[0]).map((x) => nombreDe(x) ?? 0);
    return [c[0] ?? 0, c[1] ?? 0, c[2] ?? 0];
  };
  const direction = (id: number | null, defaut: number[]): number[] => {
    const d = get(id);
    if (!d) return defaut;
    const c = listeDe(d.args[0]).map((x) => nombreDe(x) ?? 0);
    return norme([c[0] ?? 0, c[1] ?? 0, c[2] ?? 0]);
  };
  /** IfcAxis2Placement3D / 2D → matrice (unités du fichier). */
  const placementAxes = (id: number | null): M => {
    const a = get(id);
    if (!a) return IDENT;
    const o = point(refDe(a.args[0]));
    if (a.type === "IFCAXIS2PLACEMENT2D") {
      const x = direction(refDe(a.args[1]), [1, 0, 0]);
      return [x[0]!, -x[1]!, 0, o[0]!, x[1]!, x[0]!, 0, o[1]!, 0, 0, 1, 0, 0, 0, 0, 1];
    }
    const z = direction(refDe(a.args[1]), [0, 0, 1]);
    let x = direction(refDe(a.args[2]), Math.abs(z[2]!) > 0.9 ? [1, 0, 0] : [0, 0, 1]);
    const y = norme(vect(z, x));
    x = vect(y, z);
    return [x[0]!, y[0]!, z[0]!, o[0]!, x[1]!, y[1]!, z[1]!, o[1]!, x[2]!, y[2]!, z[2]!, o[2]!, 0, 0, 0, 1];
  };
  const memo = new Map<number, M>();
  const placementObjet = (id: number | null, profondeur = 0): M => {
    if (id === null || profondeur > 64) return IDENT;
    const m0 = memo.get(id);
    if (m0) return m0;
    const p = get(id);
    let r = IDENT;
    if (p?.type === "IFCLOCALPLACEMENT") r = mul(placementObjet(refDe(p.args[0]), profondeur + 1), placementAxes(refDe(p.args[1])));
    memo.set(id, r);
    return r;
  };

  // Géométrie d'un élément de représentation → triangles (unités du fichier, repère de l'objet).
  const pts: number[] = [];
  const tris: number[] = [];
  let illisible = false;
  const ajouterPolygone = (poly: number[][], Mx: M) => {
    if (poly.length < 3) return;
    const base = pts.length / 3;
    for (const p of poly) pts.push(...appliquer(Mx, p[0]!, p[1]!, p[2]!));
    // Éventail : les faces IFC lues ici sont convexes ou presque (écart déclaré : faces concaves mal triangulées).
    for (let k = 1; k + 1 < poly.length; k++) tris.push(base, base + k, base + k + 1);
  };
  const polyligne = (id: number | null): number[][] => {
    const c = get(id);
    if (c?.type === "IFCPOLYLINE") return refsDe(c.args[0]).map((r) => point(r));
    if (c?.type === "IFCINDEXEDPOLYCURVE") {
      const liste = get(refDe(c.args[0]));
      return listeDe(liste?.args[0]).map((p) => listeDe(p).map((x) => nombreDe(x) ?? 0)).map((p) => [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0]);
    }
    return [];
  };
  const faces = (refs: number[], Mx: M) => {
    for (const fr of refs) {
      const fa = get(fr);
      const bornes = refsDe(fa?.args[0]).map((b) => get(b));
      const ext = bornes.find((b) => b?.type === "IFCFACEOUTERBOUND") ?? bornes[0];
      const boucle = get(refDe(ext?.args[0]));
      if (boucle?.type !== "IFCPOLYLOOP") {
        illisible = true;
        continue;
      }
      let poly = refsDe(boucle.args[0]).map((r) => point(r));
      if (enumDe(ext?.args[1]) === "F") poly = poly.reverse();
      ajouterPolygone(poly, Mx);
    }
  };
  const item = (id: number | null, Mx: M, profondeur = 0): void => {
    const it = get(id);
    if (!it || profondeur > 16) return;
    switch (it.type) {
      case "IFCTRIANGULATEDFACESET":
      case "IFCTRIANGULATEDIRREGULARNETWORK": {
        const liste = get(refDe(it.args[0]));
        const coords = listeDe(liste?.args[0]).map((p) => listeDe(p).map((x) => nombreDe(x) ?? 0));
        const idx = listeDe(it.args[3]).map((t) => listeDe(t).map((x) => (nombreDe(x) ?? 1) - 1));
        const pn = listeDe(it.args[4]).map((x) => (nombreDe(x) ?? 1) - 1);
        const base = pts.length / 3;
        for (const c of coords) pts.push(...appliquer(Mx, c[0] ?? 0, c[1] ?? 0, c[2] ?? 0));
        const v = (i: number) => (pn.length ? (pn[i] ?? i) : i);
        for (const t of idx) if (t.length === 3 && t.every((i) => v(i) >= 0 && v(i) < coords.length)) tris.push(base + v(t[0]!), base + v(t[1]!), base + v(t[2]!));
        return;
      }
      case "IFCPOLYGONALFACESET": {
        const liste = get(refDe(it.args[0]));
        const coords = listeDe(liste?.args[0]).map((p) => listeDe(p).map((x) => nombreDe(x) ?? 0));
        for (const fr of refsDe(it.args[2])) {
          const fa = get(fr);
          const idx = listeDe(fa?.args[0]).map((x) => (nombreDe(x) ?? 1) - 1);
          ajouterPolygone(idx.map((i) => coords[i] ?? [0, 0, 0]), Mx);
        }
        return;
      }
      case "IFCFACETEDBREP":
      case "IFCFACETEDBREPWITHVOIDS": {
        const coque = get(refDe(it.args[0]));
        faces(refsDe(coque?.args[0]), Mx);
        return;
      }
      case "IFCSHELLBASEDSURFACEMODEL":
      case "IFCFACEBASEDSURFACEMODEL":
        for (const c of refsDe(it.args[0])) faces(refsDe(get(c)?.args[0]), Mx);
        return;
      case "IFCEXTRUDEDAREASOLID": {
        const profil = get(refDe(it.args[0]));
        const Mp = mul(Mx, placementAxes(refDe(it.args[1])));
        const dir = direction(refDe(it.args[2]), [0, 0, 1]);
        const h = nombreDe(it.args[3]) ?? 0;
        let contour: number[][] = [];
        if (profil?.type === "IFCRECTANGLEPROFILEDEF") {
          const Mpr = placementAxes(refDe(profil.args[2]));
          const dx = (nombreDe(profil.args[3]) ?? 0) / 2;
          const dy = (nombreDe(profil.args[4]) ?? 0) / 2;
          contour = [[-dx, -dy], [dx, -dy], [dx, dy], [-dx, dy]].map(([x, y]) => appliquer(Mpr, x!, y!, 0));
        } else if (profil?.type === "IFCARBITRARYCLOSEDPROFILEDEF" || profil?.type === "IFCARBITRARYPROFILEDEFWITHVOIDS") {
          contour = polyligne(refDe(profil.args[2])).map((p) => [p[0]!, p[1]!, 0]);
          if (contour.length > 1) {
            const a = contour[0]!;
            const b = contour[contour.length - 1]!;
            if (Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!) < 1e-9) contour.pop();
          }
        } else {
          illisible = true;
          return;
        }
        if (contour.length < 3 || h <= 0) return;
        const haut = contour.map((p) => [p[0]! + dir[0]! * h, p[1]! + dir[1]! * h, p[2]! + dir[2]! * h]);
        ajouterPolygone([...contour].reverse(), Mp);
        ajouterPolygone(haut, Mp);
        for (let k = 0; k < contour.length; k++) {
          const k2 = (k + 1) % contour.length;
          ajouterPolygone([contour[k]!, contour[k2]!, haut[k2]!, haut[k]!], Mp);
        }
        return;
      }
      case "IFCMAPPEDITEM": {
        const source = get(refDe(it.args[0]));
        const cible = get(refDe(it.args[1]));
        let T = IDENT;
        if (cible?.type === "IFCCARTESIANTRANSFORMATIONOPERATOR3D" || cible?.type === "IFCCARTESIANTRANSFORMATIONOPERATOR3DNONUNIFORM") {
          const x = direction(refDe(cible.args[0]), [1, 0, 0]);
          const y = direction(refDe(cible.args[1]), [0, 1, 0]);
          const o = point(refDe(cible.args[2]));
          const s = nombreDe(cible.args[3]) ?? 1;
          const z = direction(refDe(cible.args[4]), norme(vect(x, y)));
          // Opérateur non uniforme : Scale2 (y) et Scale3 (z), Scale à défaut.
          const nu = cible.type === "IFCCARTESIANTRANSFORMATIONOPERATOR3DNONUNIFORM";
          const s2 = (nu ? nombreDe(cible.args[5]) : null) ?? s;
          const s3 = (nu ? nombreDe(cible.args[6]) : null) ?? s;
          T = [x[0]! * s, y[0]! * s2, z[0]! * s3, o[0]!, x[1]! * s, y[1]! * s2, z[1]! * s3, o[1]!, x[2]! * s, y[2]! * s2, z[2]! * s3, o[2]!, 0, 0, 0, 1];
        }
        const Mm = mul(mul(Mx, T), placementAxes(refDe(source?.args[0])));
        const repr = get(refDe(source?.args[1]));
        for (const r of refsDe(repr?.args[3])) item(r, Mm, profondeur + 1);
        return;
      }
      case "IFCBOOLEANRESULT":
      case "IFCBOOLEANCLIPPINGRESULT":
        // Premier opérande seulement (la découpe n'est pas calculée : écart déclaré).
        item(refDe(it.args[1]), Mx, profondeur + 1);
        return;
      default:
        illisible = true;
    }
  };

  // Étages.
  const etages: EtageIfc[] = parType("IFCBUILDINGSTOREY").map((s) => {
    const Mz = placementObjet(refDe(s.args[5]));
    const el = nombreDe(s.args[9]);
    return { globalId: texteDe(s.args[0]) ?? "", nom: texteDe(s.args[2]) ?? texteDe(s.args[7]) ?? "Étage", altitude: (el ?? Mz[11]!) * echelle };
  });
  etages.sort((a, b) => a.altitude - b.altitude);

  // Contenance : élément → étage (IfcRelContainedInSpatialStructure, puis décomposition IfcRelAggregates).
  const etageDe = new Map<number, string>();
  const idEtage = new Map(parType("IFCBUILDINGSTOREY").map((s) => [s.id, texteDe(s.args[0]) ?? ""]));
  for (const r of parType("IFCRELCONTAINEDINSPATIALSTRUCTURE")) {
    const st = refDe(r.args[5]);
    const g = st !== null ? idEtage.get(st) : undefined;
    if (g) for (const e of refsDe(r.args[4])) etageDe.set(e, g);
  }
  for (const r of parType("IFCRELAGGREGATES")) {
    const parent = refDe(r.args[4]);
    const g = parent !== null ? (idEtage.get(parent) ?? etageDe.get(parent)) : undefined;
    if (g) for (const e of refsDe(r.args[5])) if (!etageDe.has(e)) etageDe.set(e, g);
  }

  // Objets.
  const objets: ObjetIfc[] = [];
  const nonLus: Record<string, number> = {};
  const partiels: Record<string, number> = {};
  for (const e of E.values()) {
    const classe = CASSE.get(e.type);
    if (!classe || e.type === "IFCOPENINGELEMENT") continue;
    const forme = get(refDe(e.args[6]));
    if (!forme) continue;
    pts.length = 0;
    tris.length = 0;
    illisible = false;
    const Mo = placementObjet(refDe(e.args[5]));
    for (const rr of refsDe(forme.args[2])) {
      const repr = get(rr);
      const ident = texteDe(repr?.args[1])?.toUpperCase();
      if (ident && ident !== "BODY" && ident !== "FACETATION" && ident !== "MAPPEDREPRESENTATION") continue;
      for (const it of refsDe(repr?.args[3])) item(it, Mo);
    }
    if (tris.length === 0) {
      if (illisible) nonLus[classe] = (nonLus[classe] ?? 0) + 1;
      continue;
    }
    // Lu en partie : l'objet est importé, la perte est comptée à part.
    if (illisible) partiels[classe] = (partiels[classe] ?? 0) + 1;
    objets.push({
      globalId: texteDe(e.args[0]) ?? "",
      classe: SANS_STANDARD(classe),
      nom: texteDe(e.args[2]) ?? classe,
      etage: etageDe.get(e.id) ?? null,
      positions: pts.map((v) => v * echelle),
      triangles: [...tris],
    });
  }

  // Trame : axes des IfcGrid (polylignes ou segments), placés par la grille.
  const axes: AxeIfc[] = [];
  for (const g of parType("IFCGRID")) {
    const Mg = placementObjet(refDe(g.args[5]));
    for (const k of [7, 8, 9]) {
      for (const ar of refsDe(g.args[k])) {
        const a = get(ar);
        const p = polyligne(refDe(a?.args[1]));
        if (p.length < 2) continue;
        const q0 = appliquer(Mg, p[0]![0]!, p[0]![1]!, p[0]![2]!).map((v) => v * echelle) as [number, number, number];
        const q1 = appliquer(Mg, p[p.length - 1]![0]!, p[p.length - 1]![1]!, p[p.length - 1]![2]!).map((v) => v * echelle) as [number, number, number];
        axes.push({ etiquette: texteDe(a?.args[0]) ?? "", a: q0, b: q1 });
      }
    }
  }

  // Géoréférencement : IfcMapConversion (IFC4, IFC4X3), sinon les jeux de propriétés d'IFC2X3.
  let georef: GeoreferencementIfc | null = null;
  const conv = parType("IFCMAPCONVERSION")[0] ?? parType("IFCMAPCONVERSIONSCALED")[0];
  if (conv) {
    const crs = get(refDe(conv.args[1]));
    georef = {
      systeme: texteDe(crs?.args[0]) ?? "",
      e: (nombreDe(conv.args[2]) ?? 0),
      n: (nombreDe(conv.args[3]) ?? 0),
      h: (nombreDe(conv.args[4]) ?? 0),
      xAbscisse: nombreDe(conv.args[5]) ?? 1,
      xOrdonnee: nombreDe(conv.args[6]) ?? 0,
      echelle: nombreDe(conv.args[7]) ?? 1,
    };
  } else {
    const jeu = (nom: string): Map<string, ArgStep> | null => {
      const ps = parType("IFCPROPERTYSET").find((p) => (texteDe(p.args[2]) ?? "").toLowerCase() === nom.toLowerCase());
      if (!ps) return null;
      return new Map(refsDe(ps.args[4]).flatMap((r) => {
        const pr = get(r);
        return pr?.type === "IFCPROPERTYSINGLEVALUE" ? [[(texteDe(pr.args[0]) ?? "").toLowerCase(), pr.args[2] ?? null] as [string, ArgStep]] : [];
      }));
    };
    const mc = jeu("ePset_MapConversion");
    const crs = jeu("ePset_ProjectedCRS");
    if (mc && nombreDe(mc.get("eastings")) !== null && nombreDe(mc.get("northings")) !== null) {
      georef = {
        systeme: texteDe(crs?.get("name")) ?? "",
        e: nombreDe(mc.get("eastings"))!,
        n: nombreDe(mc.get("northings"))!,
        h: nombreDe(mc.get("orthogonalheight")) ?? 0,
        xAbscisse: nombreDe(mc.get("xaxisabscissa")) ?? 1,
        xOrdonnee: nombreDe(mc.get("xaxisordinate")) ?? 0,
        echelle: nombreDe(mc.get("scale")) ?? 1,
      };
    }
  }

  return { schema: f.schema, echelle, etages, axes, georef, objets, nonLus, partiels, espaces: parType("IFCSPACE").length };
}

/** Point de base déduit d'un géoréférencement lu : E, N, système, rotation (nord du quadrillage depuis +y). */
export function pointDeBaseDepuisIfc(g: GeoreferencementIfc): PointDeBase | null {
  if (!g.systeme.trim()) return null;
  // L'axe x du projet a pour direction (xAbscisse, xOrdonnee) dans (E, N) : est = (cos r, -sin r) dans le dessin, donc
  // x vu dans (E, N) = (cos r, sin r) → r = atan2(ordonnée, abscisse).
  const r = (Math.atan2(g.xOrdonnee, g.xAbscisse) * 180) / Math.PI;
  const rotation = ((r % 360) + 360) % 360;
  return { e: g.e, n: g.n, systeme: g.systeme.trim().slice(0, 40), rotation: Math.round(rotation * 1e9) / 1e9 };
}

// ---------------------------------------------------------------------------------------------------------------
// Import dans la Planche
// ---------------------------------------------------------------------------------------------------------------

export interface ChoixImportIfc {
  readonly niveaux: boolean;
  readonly trame: boolean;
  /** Poser le point de base lu ; jamais quand un point de base existe déjà. */
  readonly georef: boolean;
}

export interface ResultatImportIfc {
  readonly modele: Modele;
  readonly objets: number;
  readonly niveaux: number;
  readonly axes: number;
  readonly pointDeBase: boolean;
  readonly triangles: number;
  readonly ignores: number;
}

/** Objets en maillages (un groupe chacun) ; l'étage, la classe et le GlobalId suivent l'objet. */
export function maillagesDeLecture(l: LectureIfcStructure): MaillageLu[] {
  return l.objets.map((o) => ({ nom: o.nom, positions: o.positions, triangles: o.triangles }));
}

export function importerIfcStructure(m: Modele, l: LectureIfcStructure, choix: ChoixImportIfc, fichier: string): ResultatImportIfc {
  // Un contenu par objet, gardé avec son objet (les objets sans triangle utile ne sont pas posés).
  const paires: { objet: ObjetIfc; contenu: ContenuImporte }[] = [];
  let ignores = 0;
  for (const objet of l.objets) {
    const c = construireImport([{ nom: objet.nom, positions: objet.positions, triangles: objet.triangles }], 1, "Import IFC");
    ignores += c.ignores;
    const contenu = c.contenus[0];
    if (contenu && Object.keys(contenu.contenu.faces).length > 0) paires.push({ objet, contenu });
  }
  const r = poserImport(m, paires.map((x) => x.contenu), ignores, 1, { format: "ifc", fichier });
  let modele = r.modele;
  const identites: Record<Id, IdentiteIfc> = {};
  const parEtage = new Map<string, Id[]>();
  r.occurrences.forEach((id, i) => {
    const o = paires[i]?.objet;
    if (!o) return;
    if (/^[0-9A-Za-z_$]{22}$/.test(o.globalId)) identites[id] = { classe: o.classe, globalId: o.globalId };
    if (o.etage) parEtage.set(o.etage, [...(parEtage.get(o.etage) ?? []), id]);
  });
  modele = identifierOccurrencesIfc(modele, identites).modele;
  let niveaux = 0;
  if (choix.niveaux) {
    const pris = new Set(Object.values(modele.annotations?.niveaux ?? {}).map((n) => n.nom.toLocaleLowerCase("fr")));
    l.etages.forEach((e, k) => {
      let nom = e.nom.trim().slice(0, 60) || `Niveau ${k + 1}`;
      for (let j = 2; pris.has(nom.toLocaleLowerCase("fr")); j++) nom = `${e.nom.trim().slice(0, 55) || "Niveau"} (${j})`;
      const suivant = l.etages[k + 1];
      const hauteur = suivant && suivant.altitude > e.altitude ? Math.round((suivant.altitude - e.altitude) * 1e6) / 1e6 : 3;
      const a = ajouterNiveau(modele, { nom, altitude: Math.round(e.altitude * 1e6) / 1e6, hauteur });
      if (!a.ok) return;
      pris.add(nom.toLocaleLowerCase("fr"));
      modele = a.modele;
      niveaux++;
      const ids = parEtage.get(e.globalId) ?? [];
      if (ids.length > 0) modele = rattacherOccurrencesNiveau(modele, ids, a.id).modele;
    });
  }
  let axes = 0;
  if (choix.trame && l.axes.length > 0) {
    modele = modifierAnnotations(modele, (a, id) => {
      for (const x of l.axes) {
        const d = [x.b[0] - x.a[0], x.b[1] - x.a[1], x.b[2] - x.a[2]];
        const lg = Math.hypot(d[0]!, d[1]!, d[2]!);
        if (lg < 1e-9) continue;
        const g = id("g");
        a.guides[g] = { id: g, genre: "ligne", origine: { x: x.a[0], y: x.a[1], z: x.a[2] }, direction: { x: d[0]! / lg, y: d[1]! / lg, z: d[2]! / lg } };
        if (x.etiquette.trim()) {
          const t = id("t");
          const p = { x: x.a[0], y: x.a[1], z: x.a[2] };
          a.textes[t] = { id: t, genre: "repere", ancre: p, position: p, texte: x.etiquette.trim().slice(0, 40) };
        }
        axes++;
      }
    }).modele;
  }
  let pointDeBase = false;
  if (choix.georef && l.georef && !modele.annotations?.reglages?.pointDeBase) {
    const p = pointDeBaseDepuisIfc(l.georef);
    if (p) {
      modele = modifierAnnotations(modele, (a) => {
        a.reglages = { ...(a.reglages ?? REGLAGES_DEFAUT), pointDeBase: p };
      }).modele;
      pointDeBase = true;
    }
  }
  return { modele, objets: r.objets, niveaux, axes, pointDeBase, triangles: r.triangles, ignores: r.ignores };
}

// ---------------------------------------------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------------------------------------------

export interface OptionsExportIfcStructure {
  readonly schema: SchemaIfc;
  readonly georef: boolean;
  readonly nom: string;
  readonly maintenant: Date;
  /** Niveau de référence (altitude du ±0,00) ; `null` = non déclaré (géoréférencement impossible). */
  readonly reference: number | null;
}

export interface ExportIfcStructure {
  readonly contenu: string;
  readonly nomFichier: string;
  readonly etages: number;
  readonly objets: number;
  readonly locaux: number;
  readonly triangles: number;
  readonly globalIds: readonly string[];
  readonly georef: GeoreferencementIfc | null;
  /** Nombre d'objets par classe écrite. */
  readonly classes: Readonly<Record<string, number>>;
  /** Classes importées ramenées à IfcBuildingElementProxy (inconnues du schéma choisi). */
  readonly ramenees: number;
  /** GlobalId en double (objet importé copié) : un nouveau GlobalId est écrit. */
  readonly renouveles: number;
}

/** Fin des arguments après `Tag`, par classe et par schéma (PredefinedType et attributs propres). */
const FINS: Readonly<Record<string, { readonly ifc2x3: string; readonly ifc4: string }>> = {
  IfcWall: { ifc2x3: "", ifc4: ",.NOTDEFINED." },
  IfcSlab: { ifc2x3: ",$", ifc4: ",.NOTDEFINED." },
  IfcBeam: { ifc2x3: "", ifc4: ",.NOTDEFINED." },
  IfcColumn: { ifc2x3: "", ifc4: ",.NOTDEFINED." },
  IfcDoor: { ifc2x3: ",$,$", ifc4: ",$,$,.NOTDEFINED.,.NOTDEFINED.,$" },
  IfcWindow: { ifc2x3: ",$,$", ifc4: ",$,$,.NOTDEFINED.,.NOTDEFINED.,$" },
  IfcRoof: { ifc2x3: ",.NOTDEFINED.", ifc4: ",.NOTDEFINED." },
  IfcStair: { ifc2x3: ",.NOTDEFINED.", ifc4: ",.NOTDEFINED." },
  IfcRailing: { ifc2x3: ",$", ifc4: ",.NOTDEFINED." },
  IfcCovering: { ifc2x3: ",$", ifc4: ",.NOTDEFINED." },
  IfcPlate: { ifc2x3: "", ifc4: ",.NOTDEFINED." },
  IfcMember: { ifc2x3: "", ifc4: ",.NOTDEFINED." },
  IfcFooting: { ifc2x3: ",.NOTDEFINED.", ifc4: ",.NOTDEFINED." },
  IfcBuildingElementProxy: { ifc2x3: ",$", ifc4: ",.NOTDEFINED." },
};
export const CLASSES_EXPORT: readonly string[] = Object.keys(FINS);

const reel = (x: number, decimales = 6): string => {
  const v = Math.abs(x) < 0.5 * 10 ** -decimales ? 0 : x;
  const t = v.toFixed(decimales).replace(/0+$/, "");
  return t.endsWith(".") ? t : t.includes(".") ? t : `${t}.`;
}

export function exporterIfcStructure(m: Modele, o: OptionsExportIfcStructure): ExportIfcStructure {
  const ifc2x3 = o.schema === "IFC2X3";
  const l: string[] = [];
  let n = 0;
  const e = (t: string): number => {
    n++;
    l.push(`#${n}=${t};`);
    return n;
  };
  const horodatage = o.maintenant.toISOString().replace(/\.\d+Z$/, "");
  const base = o.nom.replace(/[^\w.-]+/g, "_") || "planche";
  const nomFichier = `${base}.ifc`;
  const entete = [
    "ISO-10303-21;",
    "HEADER;",
    `FILE_DESCRIPTION(('ViewDefinition [${ifc2x3 ? "CoordinationView_V2.0" : "ReferenceView_V1.2"}]'),'2;1');`,
    `FILE_NAME(${chaineIfc(nomFichier)},'${horodatage}',(''),(''),'Fadi Sandbox','Fadi','');`,
    `FILE_SCHEMA(('${o.schema}'));`,
    "ENDSEC;",
    "DATA;",
  ];
  // Historique (obligatoire en IFC2X3 seulement) : application Fadi, personne non renseignée (écart déclaré).
  let hist = "$";
  if (ifc2x3) {
    const personne = e(`IFCPERSON($,${chaineIfc("Non renseigné")},$,$,$,$,$,$)`);
    const org = e("IFCORGANIZATION($,'Fadi',$,$,$)");
    const po = e(`IFCPERSONANDORGANIZATION(#${personne},#${org},$)`);
    const app = e(`IFCAPPLICATION(#${org},'1','Fadi Planche','Fadi')`);
    hist = `#${e(`IFCOWNERHISTORY(#${po},#${app},$,.NOCHANGE.,$,$,$,${Math.floor(o.maintenant.getTime() / 1000)})`)}`;
  }
  const racineO = e("IFCCARTESIANPOINT((0.,0.,0.))");
  const axes = e(`IFCAXIS2PLACEMENT3D(#${racineO},$,$)`);
  const contexte = e(`IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,#${axes},$)`);
  const corps = e(`IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Model',*,*,*,*,#${contexte},$,.MODEL_VIEW.,$)`);
  const longueur = e("IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)");
  const surface = e("IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)");
  const volume = e("IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.)");
  const angle = e("IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.)");
  const unites = e(`IFCUNITASSIGNMENT((#${longueur},#${surface},#${volume},#${angle}))`);
  const projet = e(`IFCPROJECT('${guidIfc("projet")}',${hist},${chaineIfc(o.nom)},$,$,$,$,(#${contexte}),#${unites})`);

  // Géoréférencement.
  const pb = m.annotations?.reglages?.pointDeBase;
  let georef: GeoreferencementIfc | null = null;
  if (o.georef && pb && o.reference !== null) {
    const { est } = axesQuadrillage(pb);
    // Axe x du dessin dans (E, N) : (est.x, nord.x) = (cos r, sin r).
    georef = { systeme: pb.systeme, e: pb.e, n: pb.n, h: o.reference, xAbscisse: est.x, xOrdonnee: -est.y, echelle: 1 };
  }
  if (georef && !ifc2x3) {
    const crs = e(`IFCPROJECTEDCRS(${chaineIfc(georef.systeme)},$,$,${pb?.systemeVertical ? chaineIfc(pb.systemeVertical) : "$"},$,$,#${longueur})`);
    e(`IFCMAPCONVERSION(#${contexte},#${crs},${reel(georef.e)},${reel(georef.n)},${reel(georef.h)},${reel(georef.xAbscisse, 12)},${reel(georef.xOrdonnee, 12)},${reel(georef.echelle)})`);
  }

  const placementSite = e(`IFCLOCALPLACEMENT($,#${axes})`);
  const site = e(`IFCSITE('${guidIfc("site")}',${hist},'Site',$,$,#${placementSite},$,$,.ELEMENT.,$,$,$,$,$)`);
  const placementBat = e(`IFCLOCALPLACEMENT(#${placementSite},#${axes})`);
  const batiment = e(`IFCBUILDING('${guidIfc("batiment")}',${hist},${chaineIfc("Bâtiment")},$,$,#${placementBat},$,$,.ELEMENT.,$,$,$)`);
  e(`IFCRELAGGREGATES('${guidIfc("agrege-projet")}',${hist},$,$,#${projet},(#${site}))`);
  e(`IFCRELAGGREGATES('${guidIfc("agrege-site")}',${hist},$,$,#${site},(#${batiment}))`);
  if (georef && ifc2x3) {
    // IFC2X3 : géoréférencement par les jeux de propriétés du guide buildingSMART (ePset), posés sur le site.
    const val = (nom: string, type: string, v: string) => e(`IFCPROPERTYSINGLEVALUE(${chaineIfc(nom)},$,${type}(${v}),$)`);
    const mc = [val("Eastings", "IFCLENGTHMEASURE", reel(georef.e)), val("Northings", "IFCLENGTHMEASURE", reel(georef.n)), val("OrthogonalHeight", "IFCLENGTHMEASURE", reel(georef.h)), val("XAxisAbscissa", "IFCREAL", reel(georef.xAbscisse, 12)), val("XAxisOrdinate", "IFCREAL", reel(georef.xOrdonnee, 12)), val("Scale", "IFCREAL", reel(1))];
    const jmc = e(`IFCPROPERTYSET('${guidIfc("pset-mapconversion")}',${hist},'ePset_MapConversion',$,(${mc.map((x) => `#${x}`).join(",")}))`);
    const crs = [val("Name", "IFCLABEL", chaineIfc(georef.systeme))];
    const jcrs = e(`IFCPROPERTYSET('${guidIfc("pset-projectedcrs")}',${hist},'ePset_ProjectedCRS',$,(${crs.map((x) => `#${x}`).join(",")}))`);
    e(`IFCRELDEFINESBYPROPERTIES('${guidIfc("def-mapconversion")}',${hist},$,$,(#${site}),#${jmc})`);
    e(`IFCRELDEFINESBYPROPERTIES('${guidIfc("def-projectedcrs")}',${hist},$,$,(#${site}),#${jcrs})`);
  }

  // Étages : un par niveau, par altitude.
  const niveaux = Object.values(m.annotations?.niveaux ?? {}).sort((a, b) => a.altitude - b.altitude || a.id.localeCompare(b.id));
  const etage = new Map<Id, number>();
  const placementEtage = new Map<Id, number>();
  for (const nv of niveaux) {
    const pt = e(`IFCCARTESIANPOINT((0.,0.,${reel(nv.altitude)}))`);
    const ax = e(`IFCAXIS2PLACEMENT3D(#${pt},$,$)`);
    const pl = e(`IFCLOCALPLACEMENT(#${placementBat},#${ax})`);
    placementEtage.set(nv.id, pl);
    etage.set(nv.id, e(`IFCBUILDINGSTOREY('${guidIfc(`niveau|${nv.id}`)}',${hist},${chaineIfc(nv.nom)},$,$,#${pl},$,$,.ELEMENT.,${reel(nv.altitude)})`));
  }
  if (etage.size > 0) e(`IFCRELAGGREGATES('${guidIfc("agrege-batiment")}',${hist},$,$,#${batiment},(${[...etage.values()].map((x) => `#${x}`).join(",")}))`);

  // Objets.
  const murs = new Set(Object.values(m.annotations?.murs ?? {}).map((x) => x.occurrence));
  const contenus = new Map<number, number[]>(); // structure → produits
  const classes: Record<string, number> = {};
  const globalIds: string[] = [];
  const vus = new Set<string>();
  let triangles = 0;
  let ramenees = 0;
  let renouveles = 0;
  const maillages = maillagesPlanche(m).filter((x) => x.triangles.length > 0);
  for (const mesh of maillages) {
    const occ = mesh.id === "racine" ? undefined : m.racine.occurrences[mesh.id];
    let classe = occ?.ifc ? SANS_STANDARD(occ.ifc.classe) : murs.has(mesh.id) ? "IfcWall" : "IfcBuildingElementProxy";
    if (!FINS[classe]) {
      classe = "IfcBuildingElementProxy";
      ramenees++;
    }
    let gid = occ?.ifc?.globalId ?? guidIfc(`objet|${mesh.id}`);
    if (vus.has(gid)) {
      gid = guidIfc(`objet|${mesh.id}|copie`);
      renouveles++;
    }
    vus.add(gid);
    globalIds.push(gid);
    const nbPts = mesh.positions.length / 3;
    let repr: number;
    if (ifc2x3) {
      // Faces à IfcPolyLoop (IfcTriangulatedFaceSet n'existe pas en IFC2X3).
      const p = Array.from({ length: nbPts }, (_, i) => e(`IFCCARTESIANPOINT((${reel(mesh.positions[i * 3]!)},${reel(mesh.positions[i * 3 + 1]!)},${reel(mesh.positions[i * 3 + 2]!)}))`));
      const fs: number[] = [];
      for (let k = 0; k < mesh.triangles.length; k += 3) {
        const b = e(`IFCPOLYLOOP((#${p[mesh.triangles[k]!]},#${p[mesh.triangles[k + 1]!]},#${p[mesh.triangles[k + 2]!]}))`);
        const ob = e(`IFCFACEOUTERBOUND(#${b},.T.)`);
        fs.push(e(`IFCFACE((#${ob}))`));
      }
      const coque = e(`IFCOPENSHELL((${fs.map((x) => `#${x}`).join(",")}))`);
      const modeleSurf = e(`IFCSHELLBASEDSURFACEMODEL((#${coque}))`);
      repr = e(`IFCSHAPEREPRESENTATION(#${corps},'Body','SurfaceModel',(#${modeleSurf}))`);
    } else {
      const pts = e(`IFCCARTESIANPOINTLIST3D((${Array.from({ length: nbPts }, (_, i) => `(${reel(mesh.positions[i * 3]!)},${reel(mesh.positions[i * 3 + 1]!)},${reel(mesh.positions[i * 3 + 2]!)})`).join(",")}))`);
      const idx = Array.from({ length: mesh.triangles.length / 3 }, (_, k) => `(${mesh.triangles[k * 3]! + 1},${mesh.triangles[k * 3 + 1]! + 1},${mesh.triangles[k * 3 + 2]! + 1})`).join(",");
      const fs = e(`IFCTRIANGULATEDFACESET(#${pts},$,$,(${idx}),$)`);
      repr = e(`IFCSHAPEREPRESENTATION(#${corps},'Body','Tessellation',(#${fs}))`);
    }
    triangles += mesh.triangles.length / 3;
    const forme = e(`IFCPRODUCTDEFINITIONSHAPE($,$,(#${repr}))`);
    // Géométrie en coordonnées monde : placement absolu (identité), contenance par l'étage.
    const pl = e(`IFCLOCALPLACEMENT($,#${axes})`);
    const fin = ifc2x3 ? FINS[classe]!.ifc2x3 : FINS[classe]!.ifc4;
    const produit = e(`${classe.toUpperCase()}('${gid}',${hist},${chaineIfc(mesh.nom)},$,$,#${pl},#${forme},$${fin})`);
    classes[classe] = (classes[classe] ?? 0) + 1;
    const st = occ?.niveau !== undefined ? etage.get(occ.niveau) : undefined;
    const s = st ?? batiment;
    contenus.set(s, [...(contenus.get(s) ?? []), produit]);
  }
  for (const [s, ps] of contenus) e(`IFCRELCONTAINEDINSPATIALSTRUCTURE('${guidIfc(`contient|${s}`)}',${hist},$,$,(${ps.map((p) => `#${p}`).join(",")}),#${s})`);

  // Locaux : IfcSpace sans géométrie (numéro, nom, usage), rattachés à l'étage mesuré, sinon au bâtiment.
  const locaux = locauxTries(m);
  const parStructure = new Map<number, number[]>();
  for (const lc of locaux) {
    const mesure = mesurerLocal(m, lc);
    const nv = mesure.niveau ? niveaux.find((x) => x.id === mesure.niveau!.id) : undefined;
    const pl = e(`IFCLOCALPLACEMENT(#${nv ? placementEtage.get(nv.id) : placementBat},#${axes})`);
    const sp = ifc2x3
      ? e(`IFCSPACE('${guidIfc(`local|${lc.id}`)}',${hist},${chaineIfc(lc.numero)},$,${lc.usage ? chaineIfc(lc.usage) : "$"},#${pl},$,${chaineIfc(lc.nom)},.ELEMENT.,.INTERNAL.,$)`)
      : e(`IFCSPACE('${guidIfc(`local|${lc.id}`)}',${hist},${chaineIfc(lc.numero)},$,${lc.usage ? chaineIfc(lc.usage) : "$"},#${pl},$,${chaineIfc(lc.nom)},.ELEMENT.,.NOTDEFINED.,$)`);
    const s = nv ? etage.get(nv.id)! : batiment;
    parStructure.set(s, [...(parStructure.get(s) ?? []), sp]);
    globalIds.push(guidIfc(`local|${lc.id}`));
  }
  for (const [s, sps] of parStructure) e(`IFCRELAGGREGATES('${guidIfc(`locaux|${s}`)}',${hist},$,$,#${s},(${sps.map((x) => `#${x}`).join(",")}))`);

  const contenu = [...entete, ...l, "ENDSEC;", "END-ISO-10303-21;", ""].join("\n");
  return { contenu, nomFichier, etages: etage.size, objets: maillages.length, locaux: locaux.length, triangles, globalIds, georef, classes, ramenees, renouveles };
}

/** `.ifczip` : l'IFC dans une archive stockée (méthode 0, écart déclaré : pas de compression). */
export function ifczip(x: ExportIfcStructure, maintenant: Date): Uint8Array {
  return ecrireZip([{ nom: x.nomFichier, donnees: new TextEncoder().encode(x.contenu) }], maintenant);
}

// ---------------------------------------------------------------------------------------------------------------
// Relecture et contrôle
// ---------------------------------------------------------------------------------------------------------------

export interface RelectureIfc {
  readonly identique: boolean;
  /** Écarts constatés, en clés de message et valeurs (vide si identique). */
  readonly ecarts: readonly { readonly cle: "etages" | "objets" | "triangles" | "globalIds" | "georef" | "schema"; readonly attendu: string; readonly lu: string }[];
  readonly etages: number;
  readonly objets: number;
  readonly triangles: number;
}

/** Relit le fichier émis (texte ou .ifczip) et le compare à ce qui devait être écrit. */
export function relireIfcStructure(x: ExportIfcStructure, schema: SchemaIfc, donnees: string | Uint8Array): RelectureIfc {
  const ecarts: { cle: RelectureIfc["ecarts"][number]["cle"]; attendu: string; lu: string }[] = [];
  let l: LectureIfcStructure;
  try {
    l = lireIfcStructure(donnees);
  } catch (err) {
    return { identique: false, ecarts: [{ cle: "schema", attendu: schema, lu: err instanceof Error ? err.message : "illisible" }], etages: 0, objets: 0, triangles: 0 };
  }
  const tri = l.objets.reduce((s, o) => s + o.triangles.length / 3, 0);
  if (l.schema !== schema) ecarts.push({ cle: "schema", attendu: schema, lu: l.schema ?? "" });
  if (l.etages.length !== x.etages) ecarts.push({ cle: "etages", attendu: String(x.etages), lu: String(l.etages.length) });
  if (l.objets.length !== x.objets) ecarts.push({ cle: "objets", attendu: String(x.objets), lu: String(l.objets.length) });
  if (tri !== x.triangles) ecarts.push({ cle: "triangles", attendu: String(x.triangles), lu: String(tri) });
  const lus = new Set(l.objets.map((o) => o.globalId));
  const manquants = x.globalIds.slice(0, x.objets).filter((g) => !lus.has(g)).length;
  if (manquants > 0) ecarts.push({ cle: "globalIds", attendu: String(x.objets), lu: String(x.objets - manquants) });
  const g = x.georef;
  const ok = (a: number, b: number) => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a));
  if (g ? !(l.georef && l.georef.systeme === g.systeme && ok(l.georef.e, g.e) && ok(l.georef.n, g.n) && ok(l.georef.h, g.h) && ok(l.georef.xAbscisse, g.xAbscisse) && ok(l.georef.xOrdonnee, g.xOrdonnee)) : l.georef !== null) {
    ecarts.push({ cle: "georef", attendu: g ? `${g.systeme} ${g.e} ${g.n} ${g.h}` : "-", lu: l.georef ? `${l.georef.systeme} ${l.georef.e} ${l.georef.n} ${l.georef.h}` : "-" });
  }
  return { identique: ecarts.length === 0, ecarts, etages: l.etages.length, objets: l.objets.length, triangles: tri };
}

export type CleControleIfc = "georef-declare" | "georef-absent" | "reference-absente" | "objets-niveau" | "objets-sans-niveau" | "non-etanches" | "niveaux-vides" | "vide" | "classes-ramenees" | "georef-2x3";
export interface ConstatIfc {
  readonly cle: CleControleIfc;
  readonly niveau: "ok" | "attention" | "bloquant";
  readonly nombre?: number;
  readonly noms?: string;
}

/** Contrôle avant émission : constats sur le modèle et les options ; seul un modèle vide bloque l'export. */
export function controlerAvantEmissionIfc(m: Modele, o: { readonly schema: SchemaIfc; readonly georef: boolean; readonly reference: number | null }): ConstatIfc[] {
  const r: ConstatIfc[] = [];
  const maillages = maillagesPlanche(m).filter((x) => x.triangles.length > 0);
  if (maillages.length === 0) return [{ cle: "vide", niveau: "bloquant" }];
  const pb = m.annotations?.reglages?.pointDeBase;
  if (o.georef) {
    if (!pb) r.push({ cle: "georef-absent", niveau: "attention" });
    else if (o.reference === null) r.push({ cle: "reference-absente", niveau: "attention" });
    else r.push({ cle: "georef-declare", niveau: "ok" });
    if (pb && o.reference !== null && o.schema === "IFC2X3") r.push({ cle: "georef-2x3", niveau: "attention" });
  }
  const niveaux = Object.values(m.annotations?.niveaux ?? {});
  const occs = maillages.filter((x) => x.id !== "racine").map((x) => m.racine.occurrences[x.id]);
  const sans = occs.filter((x) => x && x.niveau === undefined).length + (maillages.some((x) => x.id === "racine") ? 1 : 0);
  if (niveaux.length > 0) r.push(sans === 0 ? { cle: "objets-niveau", niveau: "ok" } : { cle: "objets-sans-niveau", niveau: "attention", nombre: sans });
  const ne = nonEtanchesDe(maillages);
  if (ne > 0) r.push({ cle: "non-etanches", niveau: "attention", nombre: ne });
  const vides = niveaux.filter((nv) => !occs.some((x) => x?.niveau === nv.id)).sort((a, b) => a.altitude - b.altitude);
  if (vides.length > 0) r.push({ cle: "niveaux-vides", niveau: "attention", nombre: vides.length, noms: vides.map((x) => x.nom).join(", ") });
  const ramenees = occs.filter((x) => x?.ifc && !FINS[SANS_STANDARD(x.ifc.classe)]).length;
  if (ramenees > 0) r.push({ cle: "classes-ramenees", niveau: "attention", nombre: ramenees });
  return r;
}

/** Compte des classes qu'écrirait l'export (aperçu du panneau). */
export function classesAExporter(m: Modele): { readonly classes: Readonly<Record<string, number>>; readonly importes: number; readonly etages: number; readonly locaux: number } {
  const murs = new Set(Object.values(m.annotations?.murs ?? {}).map((x) => x.occurrence));
  const classes: Record<string, number> = {};
  let importes = 0;
  for (const mesh of maillagesPlanche(m)) {
    if (mesh.triangles.length === 0) continue;
    const occ = mesh.id === "racine" ? undefined : m.racine.occurrences[mesh.id];
    let c = occ?.ifc ? SANS_STANDARD(occ.ifc.classe) : murs.has(mesh.id) ? "IfcWall" : "IfcBuildingElementProxy";
    if (!FINS[c]) c = "IfcBuildingElementProxy";
    if (occ?.ifc) importes++;
    classes[c] = (classes[c] ?? 0) + 1;
  }
  return { classes, importes, etages: Object.keys(m.annotations?.niveaux ?? {}).length, locaux: locauxTries(m).length };
}

