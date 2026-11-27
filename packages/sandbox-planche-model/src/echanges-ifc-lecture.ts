/**
 * Cas 2 du catalogue, lot 6 (27 novembre 2026) : lecture IFC complète, pure et sans dépendance.
 *
 * - n° 2 (D10-F14-020) : les placements `IfcLocalPlacement` sont composés avec leur parent (site → bâtiment → étage →
 *   objet) : chaque objet est posé à sa place, jamais à l'origine.
 * - n° 22 (D10-F14-023) : représentations lues : `IfcTriangulatedFaceSet`, `IfcPolygonalFaceSet`,
 *   `IfcExtrudedAreaSolid` (profils rectangle, cercle — approché —, polyligne, courbe indexée, avec vides),
 *   `IfcFacetedBrep` et `IfcMappedItem` ; toute autre représentation est comptée « non lue », avec sa classe et l'objet.
 * - n° 91 (D10-F14-022) : nom, classe, GlobalId, jeux de propriétés et quantités tels qu'écrits dans le fichier, étage
 *   (`IfcRelContainedInSpatialStructure`, `IfcRelAggregates`) — aucune valeur absente n'est remplacée.
 *
 * Unités : longueur SI (mètre et préfixes) ou unité convertie (`IfcConversionBasedUnit`) ; une autre unité est refusée.
 */
import { appliquer, composer, type Matrice4 } from "./geometrie-libre.js";
import { triangulerFace } from "./maillage.js";
import { add, cross, dot, len, normalize, scale, sub, v3, type Vec3 } from "./vecteur.js";
import { ErreurImport } from "./echanges-import.js";

// ————————————————————————————————————————————————————————————— Lecture STEP (ISO 10303-21)

export interface RefStep { readonly ref: number }
export interface EnumStep { readonly enum: string }
export interface TypeStep { readonly type: string; readonly valeur: ValeurStep }
export type ValeurStep = null | number | string | RefStep | EnumStep | TypeStep | readonly ValeurStep[];

export interface EntiteStep { readonly id: number; readonly type: string; readonly args: readonly ValeurStep[] }

/** Décodage des chaînes STEP : apostrophe doublée, `\X2\…\X0\` (UTF-16), `\X\hh` (ISO 8859-1), `\S\c`. */
export function decoderChaineStep(s: string): string {
  return s
    .replace(/''/g, "'")
    .replace(/\\X2\\([0-9A-Fa-f]+)\\X0\\/g, (_, h: string) => {
      let r = "";
      for (let i = 0; i + 4 <= h.length; i += 4) r += String.fromCharCode(parseInt(h.slice(i, i + 4), 16));
      return r;
    })
    .replace(/\\X\\([0-9A-Fa-f]{2})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\S\\(.)/g, (_, c: string) => String.fromCharCode(c.charCodeAt(0) + 128))
    .replace(/\\\\/g, "\\");
}

/** Arguments d'une entité : `(…)` lu récursivement. */
function lireArgs(s: string, i0: number): { valeurs: ValeurStep[]; fin: number } {
  const valeurs: ValeurStep[] = [];
  let i = i0;
  const espaces = () => {
    while (i < s.length && /\s/.test(s[i] as string)) i++;
  };
  espaces();
  if (s[i] === ")") return { valeurs, fin: i + 1 };
  for (;;) {
    espaces();
    const c = s[i];
    let v: ValeurStep;
    if (c === "$" || c === "*") {
      v = null;
      i++;
    } else if (c === "#") {
      const m = /^#(\d+)/.exec(s.slice(i, i + 24));
      v = { ref: Number(m?.[1]) };
      i += m?.[0].length ?? 1;
    } else if (c === "'") {
      let j = i + 1;
      let brut = "";
      for (;;) {
        if (j >= s.length) throw new ErreurImport("illisible", "Chaîne IFC non fermée.");
        if (s[j] === "'") {
          if (s[j + 1] === "'") {
            brut += "''";
            j += 2;
            continue;
          }
          break;
        }
        brut += s[j];
        j++;
      }
      v = decoderChaineStep(brut);
      i = j + 1;
    } else if (c === ".") {
      const m = /^\.([A-Z0-9_]+)\./.exec(s.slice(i, i + 64));
      v = { enum: m?.[1] ?? "" };
      i += m?.[0].length ?? 1;
    } else if (c === "(") {
      const r = lireArgs(s, i + 1);
      v = r.valeurs;
      i = r.fin;
    } else if (c !== undefined && /[A-Za-z]/.test(c)) {
      const m = /^([A-Za-z0-9_]+)\s*\(/.exec(s.slice(i, i + 80));
      if (!m) throw new ErreurImport("illisible", "Valeur IFC illisible.");
      const r = lireArgs(s, i + m[0].length);
      v = { type: (m[1] as string).toUpperCase(), valeur: r.valeurs.length === 1 ? (r.valeurs[0] as ValeurStep) : r.valeurs };
      i = r.fin;
    } else {
      const m = /^[-+0-9.eE]+/.exec(s.slice(i, i + 40));
      if (!m) throw new ErreurImport("illisible", "Valeur IFC illisible.");
      v = Number(m[0]);
      i += m[0].length;
    }
    valeurs.push(v);
    espaces();
    if (s[i] === ",") {
      i++;
      continue;
    }
    if (s[i] === ")") return { valeurs, fin: i + 1 };
    throw new ErreurImport("illisible", "Liste IFC mal fermée.");
  }
}

/** Entités de la section DATA ; les instructions sont coupées aux `;` hors chaînes. */
export function lireEntitesStep(texte: string): Map<number, EntiteStep> {
  const debut = texte.indexOf("DATA;");
  if (debut < 0) throw new ErreurImport("illisible", "Section DATA absente : ce n'est pas un fichier IFC (STEP).");
  const entites = new Map<number, EntiteStep>();
  let i = debut + 5;
  let instr = "";
  let dansChaine = false;
  for (; i < texte.length; i++) {
    const c = texte[i] as string;
    if (c === "'") dansChaine = !dansChaine;
    if (c === ";" && !dansChaine) {
      const m = /^\s*#(\d+)\s*=\s*([A-Za-z0-9_]+)\s*\(/.exec(instr);
      if (m) {
        const r = lireArgs(instr, m[0].length);
        entites.set(Number(m[1]), { id: Number(m[1]), type: (m[2] as string).toUpperCase(), args: r.valeurs });
      } else if (/^\s*ENDSEC\s*$/.test(instr)) break;
      instr = "";
      continue;
    }
    instr += c;
  }
  return entites;
}

// ————————————————————————————————————————————————————————————— Modèle lu

export type GenreRepresentation = "triangulation" | "faces-polygonales" | "extrusion" | "brep";

export interface ObjetIfc {
  readonly globalId: string | null;
  /** Classe IFC telle qu'écrite (IfcWall…). */
  readonly classe: string;
  readonly nom: string | null;
  readonly etage: string | null;
  /** Triangles posés (placements composés), en mètres. */
  readonly triangles: readonly (readonly [Vec3, Vec3, Vec3])[];
  /** Jeux de propriétés et de quantités, valeurs telles qu'écrites. */
  readonly proprietes: Readonly<Record<string, Readonly<Record<string, string>>>>;
  /** Une courbe (cercle) a été approchée par des segments. */
  readonly approche: boolean;
  /** Classes des représentations non lues de cet objet. */
  readonly nonLues: readonly string[];
}

export interface EtageIfc {
  readonly nom: string;
  /** Altitude déclarée (m) ; `null` = non déclarée. */
  readonly altitude: number | null;
}

export interface LectureIfc {
  readonly objets: readonly ObjetIfc[];
  readonly etages: readonly EtageIfc[];
  /** Représentations lues, par genre. */
  readonly lues: Readonly<Record<GenreRepresentation, number>>;
  /** Ouvertures (`IfcOpeningElement`) : vides, jamais posées comme objets. */
  readonly ouvertures: number;
  /** Mètres par unité de longueur du fichier. */
  readonly echelle: number;
}

/** Classes courantes, pour écrire la classe comme la norme (IFCWALLSTANDARDCASE → IfcWallStandardCase). */
const CLASSES = [
  "IfcWall", "IfcWallStandardCase", "IfcWallElementedCase", "IfcSlab", "IfcSlabStandardCase", "IfcRoof", "IfcBeam", "IfcColumn", "IfcDoor", "IfcWindow",
  "IfcStair", "IfcStairFlight", "IfcRailing", "IfcRamp", "IfcRampFlight", "IfcCovering", "IfcCurtainWall", "IfcPlate", "IfcMember", "IfcFooting",
  "IfcPile", "IfcBuildingElementProxy", "IfcFurnishingElement", "IfcFurniture", "IfcSpace", "IfcSite", "IfcBuilding", "IfcBuildingStorey",
  "IfcOpeningElement", "IfcFlowTerminal", "IfcFlowSegment", "IfcFlowFitting", "IfcDistributionElement", "IfcChimney", "IfcShadingDevice",
  "IfcTransportElement", "IfcGeographicElement", "IfcCivilElement", "IfcElementAssembly", "IfcBuildingElementPart", "IfcVirtualElement",
  "IfcTriangulatedFaceSet", "IfcPolygonalFaceSet", "IfcExtrudedAreaSolid", "IfcFacetedBrep", "IfcMappedItem", "IfcAdvancedBrep",
  "IfcBooleanClippingResult", "IfcBooleanResult", "IfcSweptDiskSolid", "IfcRevolvedAreaSolid", "IfcFacetedBrepWithVoids", "IfcBoundingBox",
  "IfcPolyline", "IfcIndexedPolyCurve", "IfcCompositeCurve", "IfcTrimmedCurve", "IfcCircle", "IfcGeometricCurveSet", "IfcShellBasedSurfaceModel",
  "IfcFaceBasedSurfaceModel", "IfcSurfaceCurveSweptAreaSolid", "IfcFixedReferenceSweptAreaSolid", "IfcCsgSolid", "IfcBlock",
];
const CLASSE_PAR_MAJ = new Map(CLASSES.map((c) => [c.toUpperCase(), c]));
export const classeIfc = (type: string): string => CLASSE_PAR_MAJ.get(type) ?? (type.startsWith("IFC") ? `Ifc${type.slice(3, 4)}${type.slice(4).toLowerCase()}` : type);

const FACTEURS_SI: Readonly<Record<string, number>> = { "": 1, MILLI: 0.001, CENTI: 0.01, DECI: 0.1, KILO: 1000 };

/** Segments d'un cercle de profil (approché, déclaré). */
const SEGMENTS_CERCLE = 24;

const IDENTITE: Matrice4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

class Lecteur {
  echelle = 1;
  constructor(readonly e: Map<number, EntiteStep>) {}

  get(v: ValeurStep | undefined): EntiteStep | undefined {
    return v && typeof v === "object" && "ref" in v ? this.e.get(v.ref) : undefined;
  }

  nombres(v: ValeurStep | undefined): number[] {
    return Array.isArray(v) ? v.map((x) => (typeof x === "number" ? x : Number.NaN)) : [];
  }

  /** Point cartésien (2D ou 3D) en mètres. */
  point(v: ValeurStep | undefined): Vec3 | null {
    const p = this.get(v);
    if (!p || p.type !== "IFCCARTESIANPOINT") return null;
    const c = this.nombres(p.args[0]);
    if (c.length < 2 || c.some((x) => !Number.isFinite(x))) return null;
    return v3((c[0] as number) * this.echelle, (c[1] as number) * this.echelle, (c[2] ?? 0) * this.echelle);
  }

  direction(v: ValeurStep | undefined, defaut: Vec3): Vec3 {
    const d = this.get(v);
    if (!d || d.type !== "IFCDIRECTION") return defaut;
    const c = this.nombres(d.args[0]);
    const r = v3(c[0] ?? 0, c[1] ?? 0, c[2] ?? 0);
    return len(r) > 1e-12 ? normalize(r) : defaut;
  }

  /** Matrice d'un `IfcAxis2Placement3D` ou `IfcAxis2Placement2D`. */
  placement(v: ValeurStep | undefined): Matrice4 {
    const p = this.get(v);
    if (!p) return IDENTITE;
    const o = this.point(p.args[0]) ?? v3(0, 0, 0);
    let z = v3(0, 0, 1);
    let x = v3(1, 0, 0);
    if (p.type === "IFCAXIS2PLACEMENT3D") {
      z = this.direction(p.args[1], z);
      x = this.direction(p.args[2], x);
    } else if (p.type === "IFCAXIS2PLACEMENT2D") x = this.direction(p.args[1], x);
    else return IDENTITE;
    x = sub(x, scale(z, dot(x, z)));
    x = len(x) > 1e-9 ? normalize(x) : Math.abs(z.x) < 0.9 ? normalize(cross(v3(0, 1, 0), z)) : normalize(cross(z, v3(0, 0, 1)));
    const y = cross(z, x);
    return [x.x, y.x, z.x, o.x, x.y, y.y, z.y, o.y, x.z, y.z, z.z, o.z, 0, 0, 0, 1];
  }

  /** `IfcLocalPlacement` composé avec ses parents (n° 2). */
  placementLocal(v: ValeurStep | undefined, profondeur = 0): Matrice4 {
    const p = this.get(v);
    if (!p || p.type !== "IFCLOCALPLACEMENT" || profondeur > 64) return IDENTITE;
    const local = this.placement(p.args[1]);
    return p.args[0] ? composer(this.placementLocal(p.args[0], profondeur + 1), local) : local;
  }

  /** Liste de points 3D d'une `IfcCartesianPointList3D` (ou 2D, z = 0), en mètres. */
  listePoints(v: ValeurStep | undefined): Vec3[] | null {
    const l = this.get(v);
    if (!l || (l.type !== "IFCCARTESIANPOINTLIST3D" && l.type !== "IFCCARTESIANPOINTLIST2D")) return null;
    const lignes = Array.isArray(l.args[0]) ? (l.args[0] as readonly ValeurStep[]) : [];
    return lignes.map((q) => {
      const c = this.nombres(q);
      return v3((c[0] ?? 0) * this.echelle, (c[1] ?? 0) * this.echelle, (c[2] ?? 0) * this.echelle);
    });
  }

  /** Contour fermé d'un profil (dans son plan, z = 0) ; `approche` si une courbe a été remplacée par des segments. */
  courbe(v: ValeurStep | undefined): { points: Vec3[]; approche: boolean } | null {
    const c = this.get(v);
    if (!c) return null;
    if (c.type === "IFCPOLYLINE") {
      const pts = (Array.isArray(c.args[0]) ? (c.args[0] as ValeurStep[]) : []).map((r) => this.point(r)).filter((p): p is Vec3 => p !== null);
      return { points: ferme(pts), approche: false };
    }
    if (c.type === "IFCINDEXEDPOLYCURVE") {
      const pts = this.listePoints(c.args[0]);
      if (!pts) return null;
      // Segments déclarés (IfcLineIndex seulement) ; un arc (IfcArcIndex) est approché par sa corde.
      const segs = Array.isArray(c.args[1]) ? (c.args[1] as ValeurStep[]) : null;
      if (!segs) return { points: ferme(pts), approche: false };
      const sortie: Vec3[] = [];
      let approche = false;
      for (const s of segs) {
        if (!s || typeof s !== "object" || !("type" in s)) continue;
        if (s.type === "IFCARCINDEX") approche = true;
        for (const k of this.nombres(Array.isArray(s.valeur) ? s.valeur : [s.valeur])) {
          const p = pts[k - 1];
          if (p && !(sortie.length && egalPt(sortie[sortie.length - 1] as Vec3, p))) sortie.push(p);
        }
      }
      return { points: ferme(sortie), approche };
    }
    return null;
  }

  /** Profil : contour extérieur, vides et placement 2D. */
  profil(v: ValeurStep | undefined): { exterieur: Vec3[]; trous: Vec3[][]; approche: boolean } | null {
    const p = this.get(v);
    if (!p) return null;
    if (p.type === "IFCRECTANGLEPROFILEDEF") {
      const M = this.placement(p.args[2]);
      const dx = ((p.args[3] as number) * this.echelle) / 2;
      const dy = ((p.args[4] as number) * this.echelle) / 2;
      if (!(dx > 0 && dy > 0)) return null;
      return { exterieur: [v3(-dx, -dy, 0), v3(dx, -dy, 0), v3(dx, dy, 0), v3(-dx, dy, 0)].map((q) => appliquer(M, q)), trous: [], approche: false };
    }
    if (p.type === "IFCCIRCLEPROFILEDEF") {
      const M = this.placement(p.args[2]);
      const r = (p.args[3] as number) * this.echelle;
      if (!(r > 0)) return null;
      const pts: Vec3[] = [];
      for (let i = 0; i < SEGMENTS_CERCLE; i++) pts.push(appliquer(M, v3(r * Math.cos((2 * Math.PI * i) / SEGMENTS_CERCLE), r * Math.sin((2 * Math.PI * i) / SEGMENTS_CERCLE), 0)));
      return { exterieur: pts, trous: [], approche: true };
    }
    if (p.type === "IFCARBITRARYCLOSEDPROFILEDEF" || p.type === "IFCARBITRARYPROFILEDEFWITHVOIDS") {
      const ext = this.courbe(p.args[2]);
      if (!ext || ext.points.length < 3) return null;
      const trous: Vec3[][] = [];
      let approche = ext.approche;
      if (p.type === "IFCARBITRARYPROFILEDEFWITHVOIDS") {
        for (const r of Array.isArray(p.args[3]) ? (p.args[3] as ValeurStep[]) : []) {
          const t = this.courbe(r);
          if (t && t.points.length >= 3) {
            trous.push(t.points);
            approche ||= t.approche;
          }
        }
      }
      return { exterieur: ext.points, trous, approche };
    }
    return null;
  }
}

const egalPt = (a: Vec3, b: Vec3): boolean => len(sub(a, b)) < 1e-9;
/** Retire le point de fermeture répété d'un contour. */
function ferme(pts: Vec3[]): Vec3[] {
  return pts.length > 1 && egalPt(pts[0] as Vec3, pts[pts.length - 1] as Vec3) ? pts.slice(0, -1) : pts;
}

type Triangle = readonly [Vec3, Vec3, Vec3];

/** Triangles d'un polygone plan (vides compris), transformés par M. */
function trianglesPolygone(exterieur: readonly Vec3[], trous: readonly (readonly Vec3[])[], M: Matrice4, sortie: Triangle[]): void {
  if (exterieur.length < 3) return;
  const ext = exterieur.map((q) => appliquer(M, q));
  const tr = trous.map((b) => b.map((q) => appliquer(M, q)));
  const tous = [...ext, ...tr.flat()];
  const idx = triangulerFace(ext, tr);
  for (let i = 0; i + 2 < idx.length; i += 3) sortie.push([tous[idx[i] as number] as Vec3, tous[idx[i + 1] as number] as Vec3, tous[idx[i + 2] as number] as Vec3]);
}

interface Lu {
  triangles: Triangle[];
  approche: boolean;
  nonLues: string[];
  lues: Record<GenreRepresentation, number>;
}

/** Un élément de représentation, sous la matrice M (placement de l'objet composé avec un éventuel `IfcMappedItem`). */
function lireItem(L: Lecteur, item: EntiteStep, M: Matrice4, lu: Lu, profondeur = 0): void {
  const a = item.args;
  switch (item.type) {
    case "IFCTRIANGULATEDFACESET": {
      const pts = L.listePoints(a[0]);
      const pn = L.nombres(a[4]);
      const indices = Array.isArray(a[3]) ? (a[3] as ValeurStep[]) : [];
      if (!pts) return void lu.nonLues.push(classeIfc(item.type));
      const pt = (k: number) => pts[(pn.length ? (pn[k - 1] as number) : k) - 1];
      for (const t of indices) {
        const [i, j, k] = L.nombres(t);
        const p = pt(i as number), q = pt(j as number), r = pt(k as number);
        if (!p || !q || !r) throw new ErreurImport("illisible", "Indices de triangles IFC hors de la liste de points.");
        lu.triangles.push([appliquer(M, p), appliquer(M, q), appliquer(M, r)]);
      }
      lu.lues.triangulation++;
      return;
    }
    case "IFCPOLYGONALFACESET": {
      const pts = L.listePoints(a[0]);
      const pn = L.nombres(a[3]);
      if (!pts) return void lu.nonLues.push(classeIfc(item.type));
      const pt = (k: number) => pts[(pn.length ? (pn[k - 1] as number) : k) - 1];
      for (const r of Array.isArray(a[2]) ? (a[2] as ValeurStep[]) : []) {
        const f = L.get(r);
        if (!f) continue;
        const contour = (v: ValeurStep | undefined) => L.nombres(v).map((k) => pt(k)).filter((p): p is Vec3 => !!p);
        const trous = f.type === "IFCINDEXEDPOLYGONALFACEWITHVOIDS" ? (Array.isArray(f.args[1]) ? (f.args[1] as ValeurStep[]) : []).map(contour) : [];
        trianglesPolygone(contour(f.args[0]), trous, M, lu.triangles);
      }
      lu.lues["faces-polygonales"]++;
      return;
    }
    case "IFCEXTRUDEDAREASOLID": {
      const prof = L.profil(a[0]);
      if (!prof) return void lu.nonLues.push(`${classeIfc(item.type)} (${classeIfc(L.get(a[0])?.type ?? "?")})`);
      const P = composer(M, L.placement(a[1]));
      const d = L.direction(a[2], v3(0, 0, 1));
      const h = (a[3] as number) * L.echelle;
      if (!(h > 0)) return void lu.nonLues.push(classeIfc(item.type));
      const D = scale(d, h);
      // Bas (sens inverse), haut, côtés : un solide fermé.
      const bas = [...prof.exterieur].reverse();
      trianglesPolygone(bas, prof.trous.map((t) => [...t].reverse()), P, lu.triangles);
      trianglesPolygone(prof.exterieur.map((q) => add(q, D)), prof.trous.map((t) => t.map((q) => add(q, D))), P, lu.triangles);
      for (const b of [prof.exterieur, ...prof.trous]) {
        for (let i = 0; i < b.length; i++) {
          const p = b[i] as Vec3, q = b[(i + 1) % b.length] as Vec3;
          trianglesPolygone([p, q, add(q, D), add(p, D)], [], P, lu.triangles);
        }
      }
      if (prof.approche) lu.approche = true;
      lu.lues.extrusion++;
      return;
    }
    case "IFCFACETEDBREP": {
      const coque = L.get(a[0]);
      const faces = coque && Array.isArray(coque.args[0]) ? (coque.args[0] as ValeurStep[]) : [];
      for (const r of faces) {
        const f = L.get(r);
        if (!f) continue;
        let exterieur: Vec3[] = [];
        const trous: Vec3[][] = [];
        for (const rb of Array.isArray(f.args[0]) ? (f.args[0] as ValeurStep[]) : []) {
          const b = L.get(rb);
          const boucle = L.get(b?.args[0]);
          if (!b || !boucle || boucle.type !== "IFCPOLYLOOP") continue;
          let pts = (Array.isArray(boucle.args[0]) ? (boucle.args[0] as ValeurStep[]) : []).map((q) => L.point(q)).filter((p): p is Vec3 => p !== null);
          if ((b.args[1] as EnumStep | null)?.enum === "F") pts = pts.reverse();
          if (b.type === "IFCFACEOUTERBOUND" || exterieur.length === 0) {
            if (exterieur.length) trous.push(exterieur);
            exterieur = pts;
          } else trous.push(pts);
        }
        trianglesPolygone(exterieur, trous, M, lu.triangles);
      }
      lu.lues.brep++;
      return;
    }
    case "IFCMAPPEDITEM": {
      const source = L.get(a[0]);
      const cible = L.get(a[1]);
      const rep = L.get(source?.args[1]);
      if (!source || !rep || profondeur > 8) return void lu.nonLues.push(classeIfc(item.type));
      let T = composer(M, transformation(L, cible));
      T = composer(T, L.placement(source.args[0]));
      for (const r of Array.isArray(rep.args[3]) ? (rep.args[3] as ValeurStep[]) : []) {
        const it = L.get(r);
        if (it) lireItem(L, it, T, lu, profondeur + 1);
      }
      return;
    }
    default:
      lu.nonLues.push(classeIfc(item.type));
  }
}

/** `IfcCartesianTransformationOperator3D` (axes, origine, échelle uniforme). */
function transformation(L: Lecteur, t: EntiteStep | undefined): Matrice4 {
  if (!t || !t.type.startsWith("IFCCARTESIANTRANSFORMATIONOPERATOR")) return IDENTITE;
  const x = L.direction(t.args[0], v3(1, 0, 0));
  const y0 = L.direction(t.args[1], v3(0, 1, 0));
  const o = L.point(t.args[2]) ?? v3(0, 0, 0);
  const k = typeof t.args[3] === "number" ? t.args[3] : 1;
  const z = t.type.endsWith("3D") || t.type.endsWith("3DNONUNIFORM") ? L.direction(t.args[4], normalize(cross(x, y0))) : normalize(cross(x, y0));
  const y = normalize(cross(z, x));
  return [x.x * k, y.x * k, z.x * k, o.x, x.y * k, y.y * k, z.y * k, o.y, x.z * k, y.z * k, z.z * k, o.z, 0, 0, 0, 1];
}

/** Mètres par unité de longueur déclarée ; refus d'une unité qui n'est pas une longueur connue. */
function echelleIfc(e: Map<number, EntiteStep>): number {
  const L = new Lecteur(e);
  const facteurSi = (u: EntiteStep): number => {
    const prefixe = (u.args[2] as EnumStep | null)?.enum ?? "";
    const f = FACTEURS_SI[prefixe];
    if (f === undefined || (u.args[3] as EnumStep | null)?.enum !== "METRE") throw new ErreurImport("unite", `Unité de longueur IFC non prise en charge : ${prefixe} ${(u.args[3] as EnumStep | null)?.enum ?? ""}`.trim());
    return f;
  };
  // Les unités du projet (IfcUnitAssignment) priment ; à défaut, toute unité de longueur déclarée.
  const candidates: EntiteStep[] = [];
  for (const x of e.values()) {
    if (x.type !== "IFCUNITASSIGNMENT") continue;
    for (const r of Array.isArray(x.args[0]) ? (x.args[0] as ValeurStep[]) : []) {
      const u = L.get(r);
      if (u) candidates.push(u);
    }
  }
  if (candidates.length === 0) candidates.push(...e.values());
  for (const u of candidates) {
    if ((u.args[1] as EnumStep | null)?.enum !== "LENGTHUNIT") continue;
    if (u.type === "IFCSIUNIT") return facteurSi(u);
    if (u.type === "IFCCONVERSIONBASEDUNIT") {
      const mesure = L.get(u.args[3]);
      const valeur = mesure?.args[0];
      const n = typeof valeur === "number" ? valeur : valeur && typeof valeur === "object" && "type" in valeur && typeof valeur.valeur === "number" ? valeur.valeur : Number.NaN;
      const base = L.get(mesure?.args[1]);
      if (!Number.isFinite(n) || !base || base.type !== "IFCSIUNIT") throw new ErreurImport("unite", `Unité de longueur IFC convertie illisible : ${String(u.args[2] ?? "")}`);
      return n * facteurSi(base);
    }
  }
  return 1;
}

/** Valeur d'une propriété telle qu'écrite (texte, nombre, booléen, énuméré). */
function texteValeur(v: ValeurStep | undefined): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) return v.map((x) => texteValeur(x) ?? "").join(", ");
  if (typeof v === "object" && "enum" in v) return v.enum === "T" ? "vrai" : v.enum === "F" ? "faux" : v.enum === "U" ? "inconnu" : v.enum;
  if (typeof v === "object" && "type" in v) return texteValeur(v.valeur);
  return null;
}

/** Lecture complète d'un fichier IFC (texte). */
export function lireIfcComplet(texte: string): LectureIfc {
  const e = lireEntitesStep(texte);
  const L = new Lecteur(e);
  L.echelle = echelleIfc(e);
  // Étages : contenance spatiale, puis agrégation (une volée hérite de l'étage de son escalier).
  const etageDe = new Map<number, number>();
  const parent = new Map<number, number>();
  for (const x of e.values()) {
    if (x.type === "IFCRELCONTAINEDINSPATIALSTRUCTURE") {
      const s = L.get(x.args[5]);
      for (const r of Array.isArray(x.args[4]) ? (x.args[4] as ValeurStep[]) : []) if (s && r && typeof r === "object" && "ref" in r) etageDe.set(r.ref, s.id);
    } else if (x.type === "IFCRELAGGREGATES") {
      const p = x.args[4];
      for (const r of Array.isArray(x.args[5]) ? (x.args[5] as ValeurStep[]) : []) if (p && typeof p === "object" && "ref" in p && r && typeof r === "object" && "ref" in r) parent.set(r.ref, p.ref);
    }
  }
  const structureDe = (id: number): EntiteStep | undefined => {
    for (let k = id, n = 0; n < 32; n++) {
      const s = etageDe.get(k);
      if (s !== undefined) return e.get(s);
      const p = parent.get(k);
      if (p === undefined) return undefined;
      if (e.get(p)?.type === "IFCBUILDINGSTOREY") return e.get(p);
      k = p;
    }
    return undefined;
  };
  // Propriétés et quantités.
  const proprietes = new Map<number, Record<string, Record<string, string>>>();
  for (const x of e.values()) {
    if (x.type !== "IFCRELDEFINESBYPROPERTIES") continue;
    const jeu = L.get(x.args[5]);
    if (!jeu) continue;
    const valeurs: Record<string, string> = {};
    if (jeu.type === "IFCPROPERTYSET") {
      for (const r of Array.isArray(jeu.args[4]) ? (jeu.args[4] as ValeurStep[]) : []) {
        const p = L.get(r);
        if (p?.type === "IFCPROPERTYSINGLEVALUE" && typeof p.args[0] === "string") {
          const t = texteValeur(p.args[2]);
          if (t !== null) valeurs[p.args[0]] = t;
        }
      }
    } else if (jeu.type === "IFCELEMENTQUANTITY") {
      for (const r of Array.isArray(jeu.args[5]) ? (jeu.args[5] as ValeurStep[]) : []) {
        const q = L.get(r);
        if (q && q.type.startsWith("IFCQUANTITY") && typeof q.args[0] === "string" && typeof q.args[3] === "number") valeurs[q.args[0]] = String(q.args[3]);
      }
    } else continue;
    const nomJeu = typeof jeu.args[2] === "string" ? jeu.args[2] : classeIfc(jeu.type);
    for (const r of Array.isArray(x.args[4]) ? (x.args[4] as ValeurStep[]) : []) {
      if (!r || typeof r !== "object" || !("ref" in r)) continue;
      const p = proprietes.get(r.ref) ?? {};
      p[nomJeu] = { ...(p[nomJeu] ?? {}), ...valeurs };
      proprietes.set(r.ref, p);
    }
  }
  const lues: Record<GenreRepresentation, number> = { triangulation: 0, "faces-polygonales": 0, extrusion: 0, brep: 0 };
  const objets: ObjetIfc[] = [];
  const etages = new Map<string, EtageIfc>();
  for (const x of e.values()) {
    if (x.type !== "IFCBUILDINGSTOREY") continue;
    const nom = typeof x.args[2] === "string" ? x.args[2] : `Étage #${x.id}`;
    etages.set(nom, { nom, altitude: typeof x.args[9] === "number" ? x.args[9] * L.echelle : null });
  }
  let ouvertures = 0;
  for (const x of [...e.values()].sort((a, b) => a.id - b.id)) {
    // Un produit : GlobalId, placement local, définition de forme.
    const placement = L.get(x.args[5]);
    const forme = L.get(x.args[6]);
    if (!placement || placement.type !== "IFCLOCALPLACEMENT" || !forme || forme.type !== "IFCPRODUCTDEFINITIONSHAPE") continue;
    if (x.type === "IFCOPENINGELEMENT") {
      ouvertures++;
      continue;
    }
    const M = L.placementLocal(x.args[5]);
    const lu: Lu = { triangles: [], approche: false, nonLues: [], lues };
    const reps = (Array.isArray(forme.args[2]) ? (forme.args[2] as ValeurStep[]) : []).map((r) => L.get(r)).filter((r): r is EntiteStep => !!r);
    // Corps seulement (« Body ») quand il est déclaré : l'axe ou l'emprise ne sont pas des solides.
    const corps = reps.filter((r) => r.args[1] === "Body");
    for (const r of corps.length ? corps : reps.filter((r) => r.args[1] !== "Axis" && r.args[1] !== "FootPrint" && r.args[1] !== "Box")) {
      for (const it of Array.isArray(r.args[3]) ? (r.args[3] as ValeurStep[]) : []) {
        const item = L.get(it);
        if (item) lireItem(L, item, M, lu);
      }
    }
    const s = structureDe(x.id);
    const etage = s?.type === "IFCBUILDINGSTOREY" ? (typeof s.args[2] === "string" ? s.args[2] : `Étage #${s.id}`) : null;
    objets.push({
      globalId: typeof x.args[0] === "string" ? x.args[0] : null,
      classe: classeIfc(x.type),
      nom: typeof x.args[2] === "string" ? x.args[2] : null,
      etage,
      triangles: lu.triangles,
      proprietes: proprietes.get(x.id) ?? {},
      approche: lu.approche,
      nonLues: lu.nonLues,
    });
  }
  return { objets, etages: [...etages.values()], lues, ouvertures, echelle: L.echelle };
}
