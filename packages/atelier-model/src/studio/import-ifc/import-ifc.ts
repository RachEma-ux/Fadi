import { studioRingSimple, studioSignedArea } from "../courbes.js";
import { STUDIO_DEFAULT_LAYER_ID, STUDIO_LIMITS } from "../noyau/limites.js";
import { StudioValidationError } from "../noyau/validation.js";
import type { StudioLayer, StudioPoint } from "../noyau/types.js";
import type { StudioCommand, StudioDocument } from "../composition/types.js";
import { validateStudioDocument } from "../composition/document.js";
import type { StudioOpening, StudioOpeningKind, StudioWall } from "../architecture/types.js";
import { controlerArchitecture, validerMur, validerOuverture } from "../architecture/validation.js";
import type { StudioProfilePrism } from "../objets-3d/solides.js";
import { validerSolide } from "../objets-3d/solides.js";
import { validerNonNatif, type StudioNonNatif, type StudioRaisonNonNatif } from "../non-natifs/non-natifs.js";
import { lireStep, type StepEntite, type StepFichier, type StepValeur } from "./step.js";

/**
 * Import IFC vers Studio (lot F3, TEST-028) : du texte STEP physique (IFC2X3, IFC4, IFC4X1 à IFC4X3) à une liste de
 * `StudioCommand` à appliquer au brouillon (rien n'est écrit ici). Pur et déterministe : même texte, même document et
 * mêmes options, mêmes commandes. Lecteur propre (`step.ts`) : ni web-ifc ni WebAssembly ; il n'emprunte rien à la
 * lecture IFC de l'Atelier.
 *
 * Unités : l'unité de longueur est **lue** dans l'`IfcUnitAssignment` du projet (`IfcSIUnit` LENGTHUNIT avec son
 * préfixe, ou `IfcConversionBasedUnit` dont le facteur vers une unité SI de longueur est déclaré dans le fichier) ;
 * absente ou illisible, elle reste **non évaluée** : aucune commande n'est produite (statut `unite-inconnue`), elle n'est
 * jamais supposée. Repère : les coordonnées du fichier, converties en mètres, deviennent celles du repère `local-3d`
 * (x, y du `local-2d`, z vertical) ; une **transformation déclarée** (translation, rotation autour de z, en mètres et
 * radians) s'applique seulement si l'appelant la fournit (modèle partenaire), jamais devinée ; aucun géoréférencement
 * (`IfcMapConversion`) n'est appliqué : il est compté parmi les pertes.
 *
 * Entités prises (géométrie `IfcExtrudedAreaSolid` verticale d'un `IfcRectangleProfileDef` ou d'un
 * `IfcArbitraryClosedProfileDef` à contour `IfcPolyline` / `IfcIndexedPolyCurve` droit, placements `IfcLocalPlacement`
 * tournés autour de z seulement) :
 * - `IfcWall`, `IfcWallStandardCase` à corps rectangulaire → **mur** (axe central, ou l'axe `Axis` du fichier quand il
 *   longe une face ou le milieu : justification déduite ; épaisseur, hauteur, cote de base lues) ; corps non
 *   rectangulaire → **prisme libre** (la sémantique « mur » est comptée parmi les pertes) ;
 * - `IfcSlab` → **prisme libre** (la sémantique « dalle » est comptée parmi les pertes) ;
 * - `IfcOpeningElement` d'un mur importé (`IfcRelVoidsElement`) → **ouverture** de ce mur ; remplie d'un `IfcDoor` ou
 *   d'un `IfcWindow` (`IfcRelFillsElement`), son type déclaré est `porte` ou `fenetre` ;
 * - `IfcBuildingStorey` → **calque** (nom du niveau) qui reçoit les éléments qu'il contient ;
 * - tout autre produit (`IfcSpace`, `IfcColumn`, `IfcBeam`, `IfcBuildingElementProxy`…), et toute entité ci-dessus que
 *   la géométrie ou le placement ne permettent pas de traduire, est **conservé non natif** (`studio.nonnatif.conserver`)
 *   avec son type, son GlobalId, son nom, la raison et, si la géométrie est lisible, son empreinte en plan.
 * Les informations sans équivalent (jeux de propriétés, matériaux, types, styles, classifications, géoréférencement,
 * structure site / bâtiment) sont **comptées par type** dans le rapport de pertes, jamais écartées en silence.
 *
 * Identifiants : `ifc-<GlobalId>` (stables d'une version à l'autre d'un même modèle, ce qui rend la comparaison
 * possible), suffixés `-2`, `-3`… seulement si l'identifiant est déjà pris dans le document.
 */

export const STUDIO_IFC_SCHEMAS_LUS: readonly string[] = Object.freeze(["IFC2X3", "IFC4", "IFC4X1", "IFC4X2", "IFC4X3", "IFC4X3_ADD1", "IFC4X3_ADD2", "IFC4X3_TC1"]);

/** Transformation déclarée par l'émetteur d'un modèle (mètres, radians autour de +z), appliquée après conversion. */
export interface StudioTransformationDeclaree {
  dx: number;
  dy: number;
  dz: number;
  /** Rotation autour de +z, radians, sens trigonométrique. */
  rotation: number;
}

export interface StudioIfcOptions {
  /** Document qui recevra l'import : identifiants pris, calques existants, limites. Vide par défaut. */
  document?: StudioDocument;
  transformation?: StudioTransformationDeclaree;
}

export interface StudioIfcCalque {
  /** Nom du niveau lu (donnée du fichier), ou `null` pour le calque implicite (éléments hors niveau). */
  nom: string | null;
  cible: "implicite" | "existant" | "cree";
  id?: string;
  objets: number;
}

/**
 * Motif d'une perte : `prisme-libre` (mur au corps non rectangulaire, dalle : géométrie gardée, sémantique perdue),
 * `axe-decale` (axe du fichier ni au milieu ni sur une face : axe central retenu), `remplissage-non-repris` (géométrie
 * propre d'une porte ou d'une fenêtre), `instance-complexe` (instance STEP complexe non lue).
 */
export type StudioMotifPerteIfc = "prisme-libre" | "axe-decale" | "remplissage-non-repris" | "instance-complexe";
export interface StudioIfcPerte { type: string; motif?: StudioMotifPerteIfc; nombre: number }

export interface StudioIfcRapport {
  /** Schéma déclaré (`FILE_SCHEMA`). */
  schema: string;
  unite: { origine: "fichier" | "inconnue"; nom: string | null; facteur: number | null };
  transformation: StudioTransformationDeclaree | null;
  entites: { murs: number; ouvertures: number; portes: number; fenetres: number; prismes: number; total: number };
  niveaux: number;
  /** Éléments conservés non natifs, par type d'entité (ordre alphabétique). */
  nonNatifs: { type: string; nombre: number }[];
  /** Total des éléments non natifs. */
  nonNatifsTotal: number;
  /**
   * Informations non reprises, par type IFC (donnée) et motif (code ; absent : l'information n'est pas reprise du tout),
   * ordre alphabétique.
   */
  pertes: StudioIfcPerte[];
  calques: StudioIfcCalque[];
  /** Bornes en plan des objets natifs, en mètres (`local-2d`) ; null si rien n'est importé ou l'unité est inconnue. */
  bornes: { min: StudioPoint; max: StudioPoint } | null;
}

export interface StudioIfcResultat {
  statut: "pret" | "unite-inconnue";
  /** Vide tant que l'unité est inconnue ; sinon calques créés, murs, ouvertures, prismes, éléments non natifs. */
  commandes: StudioCommand[];
  rapport: StudioIfcRapport;
}

function fail(path: string, message: string): never {
  throw new StudioValidationError(path, message);
}

// ——— Lecture des attributs ———

type Ent = StepEntite;
const attr = (e: Ent, i: number): StepValeur => e.attrs[i] ?? { t: "null" };
const texteDe = (v: StepValeur): string | null => (v.t === "str" && v.v.trim() ? v.v : null);
const nombreDe = (v: StepValeur): number | null => {
  if (v.t === "num") return v.v;
  if (v.t === "typed" && v.v.length === 1 && v.v[0]!.t === "num") return v.v[0]!.v;
  return null;
};
const listeDe = (v: StepValeur): StepValeur[] | null => (v.t === "list" ? v.v : null);

/** Noms usuels des types IFC (casse EXPRESS) ; un type absent garde ses capitales. */
const NOMS: Record<string, string> = Object.fromEntries([
  "IfcWall", "IfcWallStandardCase", "IfcWallElementedCase", "IfcSlab", "IfcSlabStandardCase", "IfcSlabElementedCase", "IfcDoor", "IfcDoorStandardCase", "IfcWindow",
  "IfcWindowStandardCase", "IfcOpeningElement", "IfcOpeningStandardCase", "IfcSpace", "IfcBuildingStorey", "IfcBuilding", "IfcSite", "IfcProject", "IfcColumn",
  "IfcColumnStandardCase", "IfcBeam", "IfcBeamStandardCase", "IfcMember", "IfcPlate", "IfcRoof", "IfcStair", "IfcStairFlight", "IfcRamp", "IfcRampFlight", "IfcRailing",
  "IfcCovering", "IfcCurtainWall", "IfcFooting", "IfcPile", "IfcFurnishingElement", "IfcFurniture", "IfcBuildingElementProxy", "IfcFlowTerminal", "IfcFlowSegment",
  "IfcFlowFitting", "IfcDistributionElement", "IfcAnnotation", "IfcGrid", "IfcVirtualElement", "IfcElementAssembly", "IfcChimney", "IfcShadingDevice", "IfcBuildingElementPart",
  "IfcPropertySet", "IfcElementQuantity", "IfcRelAssociatesMaterial", "IfcRelDefinesByType", "IfcStyledItem", "IfcPresentationLayerAssignment",
  "IfcPresentationLayerWithStyle", "IfcRelAssociatesClassification", "IfcMapConversion", "IfcProjectedCRS", "IfcRelSpaceBoundary", "IfcRelConnectsPathElements",
  "IfcMappedItem", "IfcBooleanClippingResult", "IfcBooleanResult", "IfcFacetedBrep", "IfcTriangulatedFaceSet", "IfcPolygonalFaceSet", "IfcExtrudedAreaSolid",
  "IfcCircleProfileDef", "IfcArbitraryProfileDefWithVoids", "IfcIShapeProfileDef", "IfcSweptDiskSolid", "IfcRevolvedAreaSolid", "IfcGridPlacement",
  "IfcRectangleProfileDef", "IfcArbitraryClosedProfileDef", "IfcCompositeCurve", "IfcTrimmedCurve", "IfcAdvancedBrep", "IfcShellBasedSurfaceModel",
].map((n) => [n.toUpperCase(), n]));
export const nomIfc = (type: string): string => NOMS[type] ?? type;

/** Informations comptées parmi les pertes quand le fichier en contient (type → libellé de perte, donnée). */
const PERTES: Record<string, string> = {
  IFCPROPERTYSET: "IfcPropertySet", IFCELEMENTQUANTITY: "IfcElementQuantity", IFCRELASSOCIATESMATERIAL: "IfcRelAssociatesMaterial",
  IFCRELDEFINESBYTYPE: "IfcRelDefinesByType", IFCSTYLEDITEM: "IfcStyledItem", IFCPRESENTATIONLAYERASSIGNMENT: "IfcPresentationLayerAssignment",
  IFCPRESENTATIONLAYERWITHSTYLE: "IfcPresentationLayerWithStyle", IFCRELASSOCIATESCLASSIFICATION: "IfcRelAssociatesClassification",
  IFCMAPCONVERSION: "IfcMapConversion", IFCRELSPACEBOUNDARY: "IfcRelSpaceBoundary", IFCRELCONNECTSPATHELEMENTS: "IfcRelConnectsPathElements",
  IFCSITE: "IfcSite", IFCBUILDING: "IfcBuilding",
};

// ——— Géométrie : transformations rigides ———

type V3 = [number, number, number];
/** Transformation rigide : colonnes X, Y, Z (repère local dans le repère parent) et origine. */
interface T3 { x: V3; y: V3; z: V3; o: V3 }
const IDENTITE: T3 = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1], o: [0, 0, 0] };
const appliquer = (t: T3, p: V3): V3 => [
  t.o[0] + t.x[0] * p[0] + t.y[0] * p[1] + t.z[0] * p[2],
  t.o[1] + t.x[1] * p[0] + t.y[1] * p[1] + t.z[1] * p[2],
  t.o[2] + t.x[2] * p[0] + t.y[2] * p[1] + t.z[2] * p[2],
];
const tourner = (t: T3, v: V3): V3 => [t.x[0] * v[0] + t.y[0] * v[1] + t.z[0] * v[2], t.x[1] * v[0] + t.y[1] * v[1] + t.z[1] * v[2], t.x[2] * v[0] + t.y[2] * v[1] + t.z[2] * v[2]];
const composer = (a: T3, b: T3): T3 => ({ x: tourner(a, b.x), y: tourner(a, b.y), z: tourner(a, b.z), o: appliquer(a, b.o) });
const norme = (v: V3) => Math.hypot(v[0], v[1], v[2]);
const unitaire = (v: V3): V3 | null => { const n = norme(v); return n > 1e-12 && Number.isFinite(n) ? [v[0] / n, v[1] / n, v[2] / n] : null; };
const croix = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const scal = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const EPS = 1e-9;
/** Le repère garde z vertical (+z ou −z) : rotation autour de z seulement, éventuellement retournée. */
const vertical = (t: T3): 1 | -1 | 0 => (Math.abs(t.z[0]) < EPS && Math.abs(t.z[1]) < EPS ? (t.z[2] > 0 ? 1 : -1) : 0);
/** Arrondi au nanomètre (même règle que l'import DXF et l'export IFC). */
const nano = (v: number): number => { const r = Math.round(v * 1e9) / 1e9; return Object.is(r, -0) ? 0 : r; };

class Refus extends Error {
  constructor(readonly raison: StudioRaisonNonNatif, readonly detail?: string) { super(raison); }
}

// ——— Interprétation ———

interface Corps {
  /** Contour du profil dans le repère du fichier (mètres, après transformation déclarée), sommets distincts. */
  anneau: StudioPoint[];
  /** Le profil est un rectangle (`IfcRectangleProfileDef` ou contour de 4 sommets à angles droits). */
  base: number;
  hauteur: number;
}

class Lecture {
  readonly f: StepFichier;
  readonly facteur: number;
  readonly declaree: StudioTransformationDeclaree | null;
  private placements = new Map<number, T3>();
  constructor(f: StepFichier, facteur: number, declaree: StudioTransformationDeclaree | null) {
    this.f = f;
    this.facteur = facteur;
    this.declaree = declaree;
  }
  ent(v: StepValeur): Ent | null {
    return v.t === "ref" ? this.f.entites.get(v.n) ?? null : null;
  }
  point(v: StepValeur): V3 {
    const e = this.ent(v);
    if (!e || e.type !== "IFCCARTESIANPOINT") throw new Refus("representation-non-interpretable", "IfcCartesianPoint");
    const c = (listeDe(attr(e, 0)) ?? []).map(nombreDe);
    if (c.length < 2 || c.length > 3 || c.some((x) => x === null)) throw new Refus("representation-non-interpretable", "IfcCartesianPoint");
    return [c[0]! * this.facteur, c[1]! * this.facteur, (c[2] ?? 0) * this.facteur];
  }
  direction(v: StepValeur, defaut: V3): V3 {
    if (v.t === "null") return defaut;
    const e = this.ent(v);
    if (!e || e.type !== "IFCDIRECTION") throw new Refus("placement-non-interpretable", "IfcDirection");
    const c = (listeDe(attr(e, 0)) ?? []).map(nombreDe);
    if (c.length < 2 || c.length > 3 || c.some((x) => x === null)) throw new Refus("placement-non-interpretable", "IfcDirection");
    const u = unitaire([c[0]!, c[1]!, c[2] ?? 0]);
    if (!u) throw new Refus("placement-non-interpretable", "IfcDirection");
    return u;
  }
  /** `IfcAxis2Placement3D` (ou 2D, dans le plan) → transformation rigide. */
  axes(v: StepValeur): T3 {
    if (v.t === "null") return IDENTITE;
    const e = this.ent(v);
    if (!e) throw new Refus("placement-non-interpretable");
    if (e.type === "IFCAXIS2PLACEMENT2D") {
      const o = this.point(attr(e, 0));
      const x = this.direction(attr(e, 1), [1, 0, 0]);
      const xx = unitaire([x[0], x[1], 0]);
      if (!xx) throw new Refus("placement-non-interpretable", "IfcAxis2Placement2D");
      return { x: xx, y: [-xx[1], xx[0], 0], z: [0, 0, 1], o: [o[0], o[1], 0] };
    }
    if (e.type !== "IFCAXIS2PLACEMENT3D") throw new Refus("placement-non-interpretable", nomIfc(e.type));
    const o = this.point(attr(e, 0));
    const z = this.direction(attr(e, 1), [0, 0, 1]);
    const ref = this.direction(attr(e, 2), [1, 0, 0]);
    // X = projection de RefDirection sur le plan normal à Z (ISO 10303-42).
    const d = scal(ref, z);
    const x = unitaire([ref[0] - d * z[0], ref[1] - d * z[1], ref[2] - d * z[2]]);
    if (!x) throw new Refus("placement-non-interpretable", "IfcAxis2Placement3D");
    return { x, y: croix(z, x), z, o };
  }
  /** Placement absolu d'un `IfcLocalPlacement` (chaîne `PlacementRelTo` sans cycle). */
  placement(v: StepValeur, chemin: Set<number> = new Set()): T3 {
    if (v.t === "null") return IDENTITE;
    if (v.t !== "ref") throw new Refus("placement-non-interpretable");
    const deja = this.placements.get(v.n);
    if (deja) return deja;
    const e = this.ent(v);
    if (!e) throw new Refus("placement-non-interpretable");
    if (e.type !== "IFCLOCALPLACEMENT") throw new Refus("placement-non-interpretable", nomIfc(e.type));
    if (chemin.has(v.n)) throw new Refus("placement-non-interpretable", "PlacementRelTo");
    chemin.add(v.n);
    const parent = this.placement(attr(e, 0), chemin);
    const t = composer(parent, this.axes(attr(e, 1)));
    this.placements.set(v.n, t);
    return t;
  }
  /** Point du fichier (m) → repère local après transformation déclarée. */
  monde(p: V3): V3 {
    const t = this.declaree;
    if (!t) return p;
    const c = Math.cos(t.rotation), s = Math.sin(t.rotation);
    return [c * p[0] - s * p[1] + t.dx, s * p[0] + c * p[1] + t.dy, p[2] + t.dz];
  }
  /** Contour 2D d'un profil (repère du profil), sommets distincts, sens quelconque. */
  profil(v: StepValeur): StudioPoint[] {
    const e = this.ent(v);
    if (!e) throw new Refus("representation-non-interpretable");
    if (e.type === "IFCRECTANGLEPROFILEDEF") {
      const t = this.axes(attr(e, 2));
      const X = nombreDe(attr(e, 3)), Y = nombreDe(attr(e, 4));
      if (X === null || Y === null || !(X > 0) || !(Y > 0)) throw new Refus("dimensions-non-interpretables", "IfcRectangleProfileDef");
      const hx = (X * this.facteur) / 2, hy = (Y * this.facteur) / 2;
      return ([[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]] as const).map(([a, b]) => { const q = appliquer(t, [a, b, 0]); return { x: q[0], y: q[1] }; });
    }
    if (e.type === "IFCARBITRARYCLOSEDPROFILEDEF") {
      const c = this.ent(attr(e, 2));
      if (!c) throw new Refus("representation-non-interpretable", "IfcArbitraryClosedProfileDef");
      let pts: StudioPoint[];
      if (c.type === "IFCPOLYLINE") {
        pts = (listeDe(attr(c, 0)) ?? []).map((x) => { const q = this.point(x); return { x: q[0], y: q[1] }; });
      } else if (c.type === "IFCINDEXEDPOLYCURVE") {
        const liste = this.ent(attr(c, 0));
        if (!liste || liste.type !== "IFCCARTESIANPOINTLIST2D") throw new Refus("representation-non-interpretable", nomIfc(liste?.type ?? "IFCINDEXEDPOLYCURVE"));
        const coords = (listeDe(attr(liste, 0)) ?? []).map((x) => (listeDe(x) ?? []).map(nombreDe));
        if (coords.some((q) => q.length !== 2 || q.some((x) => x === null))) throw new Refus("representation-non-interpretable", "IfcCartesianPointList2D");
        const tous = coords.map((q) => ({ x: q[0]! * this.facteur, y: q[1]! * this.facteur }));
        const segments = attr(c, 1);
        if (segments.t === "null") pts = tous;
        else {
          // Segments droits seulement (`IfcLineIndex`) ; un arc (`IfcArcIndex`) n'est pas lu.
          pts = [];
          for (const sgt of listeDe(segments) ?? []) {
            if (sgt.t !== "typed" || sgt.type !== "IFCLINEINDEX") throw new Refus("representation-non-interpretable", sgt.t === "typed" ? sgt.type : "IfcIndexedPolyCurve");
            const idx = (listeDe(sgt.v[0] ?? { t: "null" }) ?? sgt.v).map(nombreDe);
            for (const k of idx) {
              const p = k === null ? undefined : tous[k - 1];
              if (!p) throw new Refus("representation-non-interpretable", "IfcLineIndex");
              const der = pts[pts.length - 1];
              if (!der || der.x !== p.x || der.y !== p.y) pts.push(p);
            }
          }
        }
      } else throw new Refus("representation-non-interpretable", nomIfc(c.type));
      const sans: StudioPoint[] = [];
      for (const p of pts) { const d = sans[sans.length - 1]; if (!d || Math.hypot(d.x - p.x, d.y - p.y) > EPS) sans.push(p); }
      if (sans.length > 1 && Math.hypot(sans[0]!.x - sans[sans.length - 1]!.x, sans[0]!.y - sans[sans.length - 1]!.y) <= EPS) sans.pop();
      if (sans.length < 3) throw new Refus("dimensions-non-interpretables", "OuterCurve");
      return sans;
    }
    throw new Refus("representation-non-interpretable", nomIfc(e.type));
  }
  /** Représentation `Body` d'un produit : une extrusion verticale unique → contour en plan, base et hauteur. */
  corps(produit: Ent, placement: T3): Corps {
    const forme = this.ent(attr(produit, 6));
    if (!forme) throw new Refus("representation-non-interpretable", "Representation");
    const reps = (listeDe(attr(forme, 2)) ?? []).map((r) => this.ent(r)).filter((r): r is Ent => r?.type === "IFCSHAPEREPRESENTATION");
    const body = reps.find((r) => texteDe(attr(r, 1))?.toUpperCase() === "BODY") ?? reps.find((r) => /SWEPTSOLID/i.test(texteDe(attr(r, 2)) ?? ""));
    if (!body) throw new Refus("representation-non-interpretable", reps.length ? "RepresentationIdentifier" : "Representation");
    const items = (listeDe(attr(body, 3)) ?? []).map((x) => this.ent(x));
    if (items.length !== 1 || !items[0]) throw new Refus("representation-non-interpretable", "Items");
    const item = items[0];
    if (item.type !== "IFCEXTRUDEDAREASOLID") throw new Refus("representation-non-interpretable", nomIfc(item.type));
    const pos = composer(placement, this.axes(attr(item, 1)));
    const sens = vertical(pos);
    if (sens === 0) throw new Refus("placement-non-interpretable", "Position");
    const dir = tourner(pos, this.direction(attr(item, 2), [0, 0, 1]));
    if (Math.abs(dir[0]) > EPS || Math.abs(dir[1]) > EPS) throw new Refus("representation-non-interpretable", "ExtrudedDirection");
    const depth = nombreDe(attr(item, 3));
    if (depth === null || !(depth > 0)) throw new Refus("dimensions-non-interpretables", "Depth");
    const h = depth * this.facteur;
    const profil = this.profil(attr(item, 0));
    const pts = profil.map((p) => this.monde(appliquer(pos, [p.x, p.y, 0])));
    const z = pts[0]![2];
    return { anneau: pts.map((q) => ({ x: nano(q[0]), y: nano(q[1]) })), base: nano(dir[2] > 0 ? z : z - h), hauteur: nano(h) };
  }
  /** Axe `Axis` (IfcPolyline de deux points) du produit, en plan, s'il existe. */
  axe(produit: Ent, placement: T3): [StudioPoint, StudioPoint] | null {
    const forme = this.ent(attr(produit, 6));
    if (!forme) return null;
    for (const r of listeDe(attr(forme, 2)) ?? []) {
      const rep = this.ent(r);
      if (rep?.type !== "IFCSHAPEREPRESENTATION" || texteDe(attr(rep, 1))?.toUpperCase() !== "AXIS") continue;
      const items = (listeDe(attr(rep, 3)) ?? []).map((x) => this.ent(x));
      const poly = items.length === 1 ? items[0] : null;
      if (poly?.type !== "IFCPOLYLINE") return null;
      const pts = listeDe(attr(poly, 0)) ?? [];
      if (pts.length !== 2) return null;
      try {
        const [a, b] = pts.map((p) => this.monde(appliquer(placement, this.point(p))));
        return [{ x: a![0], y: a![1] }, { x: b![0], y: b![1] }];
      } catch { return null; }
    }
    return null;
  }
}

/** Unité de longueur du projet : nom lu et facteur vers le mètre ; null si absente ou illisible. */
function uniteLongueur(f: StepFichier): { nom: string; facteur: number } | null {
  const projet = [...f.entites.values()].find((e) => e.type === "IFCPROJECT");
  if (!projet) return null;
  const ua = attr(projet, 8);
  const assign = ua.t === "ref" ? f.entites.get(ua.n) : undefined;
  if (!assign || assign.type !== "IFCUNITASSIGNMENT") return null;
  const PREFIXES: Record<string, number> = { EXA: 1e18, PETA: 1e15, TERA: 1e12, GIGA: 1e9, MEGA: 1e6, KILO: 1e3, HECTO: 1e2, DECA: 1e1, DECI: 1e-1, CENTI: 1e-2, MILLI: 1e-3, MICRO: 1e-6, NANO: 1e-9, PICO: 1e-12, FEMTO: 1e-15, ATTO: 1e-18 };
  const si = (e: StepEntite | undefined): { nom: string; facteur: number } | null => {
    if (!e || e.type !== "IFCSIUNIT") return null;
    const type = attr(e, 1), prefixe = attr(e, 2), nom = attr(e, 3);
    if (type.t !== "enum" || type.v !== "LENGTHUNIT" || nom.t !== "enum" || nom.v !== "METRE") return null;
    if (prefixe.t === "null") return { nom: "METRE", facteur: 1 };
    if (prefixe.t !== "enum" || !(prefixe.v in PREFIXES)) return null;
    return { nom: `${prefixe.v} METRE`, facteur: PREFIXES[prefixe.v]! };
  };
  for (const u of listeDe(attr(assign, 0)) ?? []) {
    const e = u.t === "ref" ? f.entites.get(u.n) : undefined;
    if (!e) continue;
    const direct = si(e);
    if (direct) return direct;
    if (e.type === "IFCCONVERSIONBASEDUNIT" && attr(e, 1).t === "enum" && (attr(e, 1) as { v: string }).v === "LENGTHUNIT") {
      const mesure = attr(e, 3).t === "ref" ? f.entites.get((attr(e, 3) as { n: number }).n) : undefined;
      if (!mesure || mesure.type !== "IFCMEASUREWITHUNIT") return null;
      const valeur = nombreDe(attr(mesure, 0));
      const base = attr(mesure, 1).t === "ref" ? si(f.entites.get((attr(mesure, 1) as { n: number }).n)) : null;
      if (valeur === null || !(valeur > 0) || !base) return null;
      return { nom: texteDe(attr(e, 2)) ?? "IfcConversionBasedUnit", facteur: valeur * base.facteur };
    }
  }
  return null;
}

/** Produits : entités à GlobalId, placement (ou `$`) et représentation (ou `$`) — tout sauf le projet et les relations. */
function estProduit(f: StepFichier, e: Ent): boolean {
  if (!e.type.startsWith("IFC") || e.type.startsWith("IFCREL") || e.type === "IFCPROJECT" || e.attrs.length < 7) return false;
  const gid = attr(e, 0), pl = attr(e, 5), rep = attr(e, 6);
  if (gid.t !== "str" || !/^[0-9A-Za-z_$]{22}$/.test(gid.v)) return false;
  const de = (v: StepValeur) => (v.t === "ref" ? f.entites.get(v.n)?.type : v.t === "null" ? "$" : undefined);
  return ["$", "IFCLOCALPLACEMENT", "IFCGRIDPLACEMENT", "IFCLINEARPLACEMENT"].includes(de(pl) ?? "") && ["$", "IFCPRODUCTDEFINITIONSHAPE"].includes(de(rep) ?? "");
}

function rectangleAxe(ring: StudioPoint[]): { a: StudioPoint; b: StudioPoint; epaisseur: number } | null {
  if (ring.length !== 4) return null;
  const [p0, p1, p2, p3] = ring as [StudioPoint, StudioPoint, StudioPoint, StudioPoint];
  const v = (p: StudioPoint, q: StudioPoint) => ({ x: q.x - p.x, y: q.y - p.y });
  const l = (u: StudioPoint) => Math.hypot(u.x, u.y);
  const a = v(p0, p1), b = v(p1, p2), c = v(p2, p3), d = v(p3, p0);
  // Tolérance du nanomètre d'écriture des coordonnées (pas une valeur métier) : longueurs et orthogonalité.
  const La = l(a), Lb = l(b), tol = 1e-8 * Math.max(1, La + Lb);
  if (!(La > 0 && Lb > 0) || Math.abs(La - l(c)) > tol || Math.abs(Lb - l(d)) > tol) return null;
  if (Math.abs(a.x * b.x + a.y * b.y) > tol * Math.max(La, Lb) || Math.abs(b.x * c.x + b.y * c.y) > tol * Math.max(La, Lb)) return null;
  const mid = (p: StudioPoint, q: StudioPoint) => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
  return La >= Lb ? { a: mid(p0, p3), b: mid(p1, p2), epaisseur: Lb } : { a: mid(p0, p1), b: mid(p3, p2), epaisseur: La };
}

const cleNom = (s: string) => s.toLocaleUpperCase("en-US");

/**
 * Lit un IFC (STEP physique) et rend les commandes Studio qui l'ajoutent au document, avec le rapport d'import et de
 * pertes. Lève `StudioValidationError` pour un fichier illisible, trop grand, d'un schéma non pris en charge, un calque
 * cible verrouillé, ou un document qui dépasserait `STUDIO_LIMITS` (refus, jamais de troncature).
 */
export function lireIfcStudio(texte: string, options: StudioIfcOptions = {}): StudioIfcResultat {
  const doc = options.document ? validateStudioDocument(options.document) : null;
  const declaree = options.transformation ? validerTransformation(options.transformation) : null;
  const f = lireStep(texte);
  const schema = f.schemas[0] ?? "";
  if (!STUDIO_IFC_SCHEMAS_LUS.includes(schema)) fail("ifc.schema", `schéma IFC non pris en charge : ${schema || "absent"} (IFC2X3, IFC4, IFC4X3 lus)`);
  const unite = uniteLongueur(f);
  const pertes = new Map<string, StudioIfcPerte>();
  const perte = (type: string, motif?: StudioMotifPerteIfc, n = 1) => {
    const cle = `${type}|${motif ?? ""}`;
    const p = pertes.get(cle) ?? { type, ...(motif ? { motif } : {}), nombre: 0 };
    p.nombre += n;
    pertes.set(cle, p);
  };
  for (const e of f.entites.values()) if (PERTES[e.type]) perte(PERTES[e.type]!);
  const complexes = [...f.entites.values()].filter((e) => e.type === "(COMPLEXE)").length;
  if (complexes) perte("STEP", "instance-complexe", complexes);
  const rapport: StudioIfcRapport = {
    schema, unite: unite ? { origine: "fichier", nom: unite.nom, facteur: unite.facteur } : { origine: "inconnue", nom: null, facteur: null },
    transformation: declaree, entites: { murs: 0, ouvertures: 0, portes: 0, fenetres: 0, prismes: 0, total: 0 }, niveaux: 0,
    nonNatifs: [], nonNatifsTotal: 0, pertes: [], calques: [], bornes: null,
  };
  const trier = (m: Map<string, number>) => [...m].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([type, nombre]) => ({ type, nombre }));
  const pertesTriees = () => [...pertes].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, p]) => p);
  if (!unite) {
    rapport.pertes = pertesTriees();
    return { statut: "unite-inconnue", commandes: [], rapport };
  }
  const L = new Lecture(f, unite.facteur, declaree);
  const ents = [...f.entites.values()];
  const parType = (t: string) => ents.filter((e) => e.type === t);
  const refN = (v: StepValeur) => (v.t === "ref" ? v.n : null);

  // Relations : contenance par niveau, agrégations, vides et remplissages.
  const niveauDe = new Map<number, number>();
  for (const r of parType("IFCRELCONTAINEDINSPATIALSTRUCTURE")) {
    const s = refN(attr(r, 5));
    if (s === null) continue;
    for (const x of listeDe(attr(r, 4)) ?? []) { const n = refN(x); if (n !== null) niveauDe.set(n, s); }
  }
  const parentDe = new Map<number, number>();
  for (const r of parType("IFCRELAGGREGATES")) {
    const p = refN(attr(r, 4));
    if (p === null) continue;
    for (const x of listeDe(attr(r, 5)) ?? []) { const n = refN(x); if (n !== null) parentDe.set(n, p); }
  }
  const hoteDe = new Map<number, number>(); // ouverture → élément hôte
  for (const r of parType("IFCRELVOIDSELEMENT")) { const h = refN(attr(r, 4)), o = refN(attr(r, 5)); if (h !== null && o !== null) hoteDe.set(o, h); }
  const remplissageDe = new Map<number, number>(); // ouverture → remplissage
  const ouvertureDe = new Map<number, number>(); // remplissage → ouverture
  for (const r of parType("IFCRELFILLSELEMENT")) { const o = refN(attr(r, 4)), x = refN(attr(r, 5)); if (o !== null && x !== null) { remplissageDe.set(o, x); ouvertureDe.set(x, o); } }

  const niveaux = parType("IFCBUILDINGSTOREY");
  rapport.niveaux = niveaux.length;
  const estNiveau = new Set(niveaux.map((n) => n.n));
  /** Niveau d'un produit : contenance directe, sinon celle de son parent (agrégation), de son hôte ou de son ouverture. */
  const niveau = (n: number, vus = new Set<number>()): number | null => {
    if (vus.has(n)) return null;
    vus.add(n);
    if (estNiveau.has(n)) return n;
    const s = niveauDe.get(n);
    if (s !== undefined) return estNiveau.has(s) ? s : niveau(s, vus);
    const p = parentDe.get(n) ?? hoteDe.get(n) ?? ouvertureDe.get(n);
    return p === undefined ? null : niveau(p, vus);
  };

  // Identifiants : `ifc-<GlobalId>`, suffixés si déjà pris.
  const pris = new Set<string>([
    ...(doc?.objects ?? []).map((o) => o.id), ...(doc?.dimensions ?? []).map((d) => d.id), ...(doc?.solides ?? []).map((s) => s.id),
    ...(doc?.annotations ?? []).map((a) => a.id), ...(doc?.architecture ?? []).map((a) => a.id), ...(doc?.nonNatifs ?? []).map((n) => n.id),
    ...(doc?.layers ?? []).map((l) => l.id),
  ]);
  const ids = new Map<number, string>();
  const idPour = (e: Ent): string => {
    const deja = ids.get(e.n);
    if (deja) return deja;
    const g = texteDe(attr(e, 0));
    const base = g ? `ifc-${g}` : `ifc-${e.n}`;
    let id = base;
    for (let k = 2; pris.has(id); k++) id = `${base}-${k}`;
    pris.add(id);
    ids.set(e.n, id);
    return id;
  };

  const produits = ents.filter((e) => estProduit(f, e));
  const murs: { e: Ent; mur: StudioWall }[] = [];
  const murDe = new Map<number, StudioWall>();
  const ouvertures: { mur: StudioWall; o: StudioOpening; niveau: number | null }[] = [];
  const prismes: { s: StudioProfilePrism; niveau: number | null }[] = [];
  const nonNatifs: { n: Omit<StudioNonNatif, "layerId">; niveau: number | null }[] = [];
  const consommes = new Set<number>();
  const conserver = (e: Ent, refus: Refus, empreinte?: StudioPoint[]) => {
    const nom = texteDe(attr(e, 2));
    const gid = texteDe(attr(e, 0));
    const n: Omit<StudioNonNatif, "layerId"> = {
      id: idPour(e), type: "non-native",
      origine: { format: "ifc", entite: nomIfc(e.type).slice(0, 64), ...(gid ? { identifiant: gid } : {}), ...(nom ? { nom: nom.slice(0, 200) } : {}) },
      raison: refus.raison, ...(refus.detail ? { detail: refus.detail.slice(0, 200) } : {}),
      ...(empreinte && empreinte.length >= 3 && empreinte.length <= 1024 ? { empreinte } : {}),
    };
    nonNatifs.push({ n: validerNonNatif(n, "ifc.nonNatif") as Omit<StudioNonNatif, "layerId">, niveau: niveau(e.n) });
    consommes.add(e.n);
  };
  const empreinteDe = (e: Ent): StudioPoint[] | undefined => {
    try { return L.corps(e, L.placement(attr(e, 5))).anneau; } catch { return undefined; }
  };

  // 1. Murs.
  for (const e of produits.filter((x) => x.type === "IFCWALL" || x.type === "IFCWALLSTANDARDCASE")) {
    try {
      const pl = L.placement(attr(e, 5));
      const c = L.corps(e, pl);
      const r = rectangleAxe(c.anneau);
      if (!r) {
        prismes.push({ s: prisme(idPour(e), c), niveau: niveau(e.n) });
        perte(nomIfc(e.type), "prisme-libre");
        consommes.add(e.n);
        continue;
      }
      let axe: StudioPoint[] = [r.a, r.b], justification: StudioWall["justification"] = "center";
      const fichier = L.axe(e, pl);
      if (fichier) {
        // Axe du fichier parallèle au corps : il longe le milieu ou une face (justification), sinon il est ignoré.
        const d = { x: r.b.x - r.a.x, y: r.b.y - r.a.y }, l = Math.hypot(d.x, d.y);
        const u = { x: (fichier[1].x - fichier[0].x), y: (fichier[1].y - fichier[0].y) }, lu = Math.hypot(u.x, u.y);
        if (lu > 0 && Math.abs(d.x * u.y - d.y * u.x) / (l * lu) < 1e-8) {
          const sens = d.x * u.x + d.y * u.y > 0;
          const [a, b] = sens ? [r.a, r.b] : [r.b, r.a];
          const t = { x: (b.x - a.x) / l, y: (b.y - a.y) / l }, n = { x: -t.y, y: t.x };
          const off = (a.x - fichier[0].x) * n.x + (a.y - fichier[0].y) * n.y;
          const tol = 1e-8 * Math.max(1, l);
          const j = Math.abs(off) <= tol ? "center" : Math.abs(off - r.epaisseur / 2) <= tol ? "left" : Math.abs(off + r.epaisseur / 2) <= tol ? "right" : null;
          if (j) {
            justification = j;
            axe = [{ x: a.x - n.x * off, y: a.y - n.y * off }, { x: b.x - n.x * off, y: b.y - n.y * off }];
          } else perte(nomIfc(e.type), "axe-decale");
        }
      }
      const mur = validerMur({ id: idPour(e), type: "wall", axis: axe.map((p) => ({ x: nano(p.x), y: nano(p.y) })), thickness: nano(r.epaisseur), height: c.hauteur, base: c.base, justification }, "ifc.mur");
      murs.push({ e, mur });
      murDe.set(e.n, mur);
      consommes.add(e.n);
    } catch (err) {
      if (err instanceof Refus) conserver(e, err);
      else if (err instanceof StudioValidationError) conserver(e, new Refus("dimensions-non-interpretables"), empreinteDe(e));
      else throw err;
    }
  }

  // 2. Ouvertures des murs importés (avec leur remplissage porte / fenêtre).
  const parMur = new Map<string, StudioOpening[]>();
  for (const e of produits.filter((x) => x.type === "IFCOPENINGELEMENT" || x.type === "IFCOPENINGSTANDARDCASE")) {
    const hote = hoteDe.get(e.n);
    const mur = hote === undefined ? undefined : murDe.get(hote);
    const remplissage = remplissageDe.get(e.n);
    const rempl = remplissage === undefined ? undefined : f.entites.get(remplissage);
    const cible = rempl ?? e;
    if (!mur) {
      conserver(e, new Refus("hote-introuvable", hote === undefined ? "IfcRelVoidsElement" : nomIfc(f.entites.get(hote)?.type ?? "")), empreinteDe(e));
      if (rempl && estProduit(f, rempl)) conserver(rempl, new Refus("hote-introuvable"), empreinteDe(e));
      continue;
    }
    const kind: StudioOpeningKind | undefined = rempl?.type === "IFCDOOR" || rempl?.type === "IFCDOORSTANDARDCASE" ? "porte" : rempl?.type === "IFCWINDOW" || rempl?.type === "IFCWINDOWSTANDARDCASE" ? "fenetre" : undefined;
    try {
      const c = L.corps(e, L.placement(attr(e, 5)));
      const a = mur.axis[0]!, b = mur.axis[1]!;
      const l = Math.hypot(b.x - a.x, b.y - a.y), t = { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
      const ts = c.anneau.map((p) => (p.x - a.x) * t.x + (p.y - a.y) * t.y);
      const tol = 1e-9 * Math.max(1, l);
      const debut = Math.min(...ts), fin = Math.max(...ts);
      const sill = c.base - mur.base;
      if (debut < -tol || sill < -tol) throw new Refus("dimensions-non-interpretables", "IfcRelVoidsElement");
      const o = validerOuverture({
        id: idPour(e), type: "opening", hostId: mur.id, position: nano(Math.max(0, debut)), width: nano(fin - Math.max(0, debut)),
        height: c.hauteur, sill: nano(Math.max(0, sill)), ...(kind ? { kind } : {}),
      }, "ifc.ouverture");
      const deja = parMur.get(mur.id) ?? [];
      try { controlerArchitecture([mur, ...deja, o], "ifc.ouverture"); }
      catch (err) { if (err instanceof StudioValidationError) throw new Refus("dimensions-non-interpretables", "IfcRelVoidsElement"); throw err; }
      deja.push(o);
      parMur.set(mur.id, deja);
      ouvertures.push({ mur, o, niveau: niveau(e.n) });
      consommes.add(e.n);
      if (rempl) {
        consommes.add(rempl.n);
        if (!kind) conserver(rempl, new Refus("type-sans-equivalent", "IfcRelFillsElement"), empreinteDe(rempl));
        else if (attr(rempl, 6).t !== "null") perte(nomIfc(rempl.type), "remplissage-non-repris");
      }
      if (kind === "porte") rapport.entites.portes++;
      if (kind === "fenetre") rapport.entites.fenetres++;
    } catch (err) {
      if (!(err instanceof Refus) && !(err instanceof StudioValidationError)) throw err;
      const refus = err instanceof Refus ? err : new Refus("dimensions-non-interpretables");
      conserver(e, refus, empreinteDe(e));
      if (rempl && cible !== e && estProduit(f, rempl)) conserver(rempl, refus, empreinteDe(e));
    }
  }

  // 3. Dalles → prismes libres.
  for (const e of produits.filter((x) => x.type === "IFCSLAB" || x.type === "IFCSLABSTANDARDCASE")) {
    try {
      const c = L.corps(e, L.placement(attr(e, 5)));
      prismes.push({ s: prisme(idPour(e), c), niveau: niveau(e.n) });
      perte(nomIfc(e.type), "prisme-libre");
      consommes.add(e.n);
    } catch (err) {
      if (err instanceof Refus) conserver(e, err);
      else if (err instanceof StudioValidationError) conserver(e, new Refus("dimensions-non-interpretables"), empreinteDe(e));
      else throw err;
    }
  }

  // 4. Tout autre produit (hors structure spatiale) : conservé non natif.
  const SPATIAL = new Set(["IFCSITE", "IFCBUILDING", "IFCBUILDINGSTOREY"]);
  for (const e of produits) {
    if (consommes.has(e.n) || SPATIAL.has(e.type)) continue;
    // Porte ou fenêtre hors de toute ouverture : pas d'hôte.
    if ((e.type === "IFCDOOR" || e.type === "IFCWINDOW") && !ouvertureDe.has(e.n)) { conserver(e, new Refus("hote-introuvable", "IfcRelFillsElement"), empreinteDe(e)); continue; }
    // Type sans équivalent : la représentation non lisible est précisée (donnée), l'empreinte lisible conservée.
    let empreinte: StudioPoint[] | undefined, detail: string | undefined;
    if (attr(e, 6).t !== "null") {
      try { empreinte = L.corps(e, L.placement(attr(e, 5))).anneau; }
      catch (err) { if (err instanceof Refus) detail = err.detail; else if (!(err instanceof StudioValidationError)) throw err; }
    }
    conserver(e, new Refus("type-sans-equivalent", detail), empreinte);
  }

  // Calques : un par niveau qui reçoit au moins un élément ; nom du niveau (donnée), repris s'il existe déjà.
  const existants = doc?.layers ?? [];
  const objetsParNiveau = new Map<number | null, number>();
  for (const x of [...murs.map((m) => niveau(m.e.n)), ...ouvertures.map((o) => o.niveau), ...prismes.map((p) => p.niveau), ...nonNatifs.map((n) => n.niveau)]) {
    objetsParNiveau.set(x, (objetsParNiveau.get(x) ?? 0) + 1);
  }
  const calqueDe = new Map<number | null, string | undefined>();
  const creer: StudioLayer[] = [];
  let nCalque = 0;
  const nomsPris = new Set(existants.map((l) => cleNom(l.name)));
  for (const s of [null, ...niveaux.map((n) => n.n)]) {
    const objets = objetsParNiveau.get(s) ?? 0;
    if (!objets) continue;
    if (s === null) {
      if (existants.find((l) => l.id === STUDIO_DEFAULT_LAYER_ID)?.locked) fail("ifc.calques", "le calque implicite du document est verrouillé");
      rapport.calques.push({ nom: null, cible: "implicite", objets });
      calqueDe.set(null, undefined);
      continue;
    }
    const e = f.entites.get(s)!;
    const nom = (texteDe(attr(e, 2)) ?? texteDe(attr(e, 0)) ?? `#${s}`).trim().slice(0, STUDIO_LIMITS.layerName);
    const meme = existants.find((l) => l.id !== STUDIO_DEFAULT_LAYER_ID && cleNom(l.name) === cleNom(nom));
    if (meme) {
      if (meme.locked) fail("ifc.calques", `calque verrouillé dans le document : ${meme.name}`);
      rapport.calques.push({ nom, cible: "existant", id: meme.id, objets });
      calqueDe.set(s, meme.id);
      continue;
    }
    let nomStudio = nom;
    for (let k = 2; nomsPris.has(cleNom(nomStudio)); k++) nomStudio = `${nom.slice(0, STUDIO_LIMITS.layerName - ` (${k})`.length)} (${k})`;
    nomsPris.add(cleNom(nomStudio));
    let id: string;
    do id = `ifc-calque-${++nCalque}`; while (pris.has(id));
    pris.add(id);
    creer.push({ id, name: nomStudio, visible: true, locked: false });
    rapport.calques.push({ nom, cible: "cree", id, objets });
    calqueDe.set(s, id);
  }
  const avecCalque = <T extends object>(o: T, s: number | null): T => { const id = calqueDe.get(s); return id === undefined ? o : { ...o, layerId: id }; };

  rapport.entites = { ...rapport.entites, murs: murs.length, ouvertures: ouvertures.length, prismes: prismes.length, total: murs.length + ouvertures.length + prismes.length };
  const parTypeNN = new Map<string, number>();
  for (const { n } of nonNatifs) parTypeNN.set(n.origine.entite, (parTypeNN.get(n.origine.entite) ?? 0) + 1);
  rapport.nonNatifs = trier(parTypeNN);
  rapport.nonNatifsTotal = nonNatifs.length;
  rapport.pertes = pertesTriees();

  const avant = (doc?.objects.length ?? 0) + (doc?.dimensions?.length ?? 0) + (doc?.annotations?.length ?? 0) + (doc?.solides?.length ?? 0) + (doc?.architecture?.length ?? 0);
  if (avant + rapport.entites.total > STUDIO_LIMITS.objects) fail("ifc.objets", `${STUDIO_LIMITS.objects} objets au plus par document : l’import en ajouterait ${rapport.entites.total} aux ${avant} existants`);
  if ((doc?.nonNatifs?.length ?? 0) + nonNatifs.length > STUDIO_LIMITS.objects) fail("ifc.objets", `${STUDIO_LIMITS.objects} éléments non natifs au plus par document`);
  if (existants.length + creer.length > STUDIO_LIMITS.layers) fail("ifc.calques", `${STUDIO_LIMITS.layers} calques au plus par document`);

  const pts: StudioPoint[] = [];
  const commandes: StudioCommand[] = creer.map((l) => ({ toolId: "studio.calque.creer", params: l }));
  for (const { e, mur } of murs) { commandes.push({ toolId: "studio.architecture.mur", params: avecCalque(mur, niveau(e.n)) }); pts.push(...mur.axis); }
  for (const { o } of ouvertures) commandes.push({ toolId: "studio.architecture.ouverture", params: o });
  for (const { s, niveau: n } of prismes) {
    commandes.push({ toolId: "studio.solide.prisme", params: avecCalque(s, n) });
    pts.push(...s.profile.map((p) => ({ x: p.x + s.placement.origin.x, y: p.y + s.placement.origin.y })));
  }
  for (const { n, niveau: s } of nonNatifs) commandes.push({ toolId: "studio.nonnatif.conserver", params: avecCalque(n as StudioNonNatif, s) });
  if (pts.length) {
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    rapport.bornes = { min: { x: Math.min(...xs), y: Math.min(...ys) }, max: { x: Math.max(...xs), y: Math.max(...ys) } };
  }
  return { statut: "pret", commandes, rapport };
}

/** Prisme libre d'un corps lu : origine au premier sommet (cote de base), profil relatif, sens trigonométrique. */
function prisme(id: string, c: Corps): StudioProfilePrism {
  const o = c.anneau[0]!;
  let profil = c.anneau.map((p) => ({ x: nano(p.x - o.x), y: nano(p.y - o.y) }));
  if (studioSignedArea(profil) < 0) profil = [profil[0]!, ...profil.slice(1).reverse()];
  if (!studioRingSimple(profil)) throw new Refus("dimensions-non-interpretables", "SweptArea");
  return validerSolide({ id, type: "prism", placement: { origin: { x: o.x, y: o.y, z: c.base }, rotation: 0 }, profile: profil, height: c.hauteur }, "ifc.prisme") as StudioProfilePrism;
}

/** Transformation déclarée : nombres finis, translation de 10⁹ m au plus, rotation ramenée dans [0 ; 2π[. */
export function validerTransformation(t: unknown): StudioTransformationDeclaree {
  if (!t || typeof t !== "object") fail("ifc.transformation", "objet attendu");
  const o = t as Record<string, unknown>;
  const keys = Object.keys(o).sort().join(",");
  if (keys !== "dx,dy,dz,rotation") fail("ifc.transformation", "champs dx, dy, dz et rotation attendus");
  const n = (k: string, max: number) => {
    const v = o[k];
    if (typeof v !== "number" || !Number.isFinite(v) || Math.abs(v) > max) fail(`ifc.transformation.${k}`, `nombre fini de valeur absolue ${max} au plus attendu`);
    return Object.is(v, -0) ? 0 : v;
  };
  const r = n("rotation", 1e3);
  const tour = 2 * Math.PI;
  return { dx: n("dx", 1e9), dy: n("dy", 1e9), dz: n("dz", 1e9), rotation: ((r % tour) + tour) % tour };
}
