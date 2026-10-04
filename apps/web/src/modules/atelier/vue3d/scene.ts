/**
 * Scène 3D du nouvel Atelier (L3b.1, cahier §7 lot 3b, R14) — module **pur** (ni three.js, ni DOM) : l'état du
 * modèle typé devient des prismes verticaux (contour, trous, z0, z1) et des surfaces de baies, objet par objet,
 * dans le repère local du projet (x, y en m ; z = altitude en m). `rendu.ts` les extrude avec three.js.
 *
 * Murs, baies, poteaux et escaliers passent par `buildModelGeometry` de `@parcours/core-geometry` (murs découpés
 * autour des baies, marches) ; dalles, toitures et solides sont des prismes directs. Rien n'est inventé : une
 * valeur absente ou une forme non portée est **signalée** (`diagnostics`), jamais devinée en silence (R7).
 *
 * Modes (§7 lot 3b) : `volume` (niveaux à leur altitude), `eclate` (niveaux écartés de `ecartEclate` m par rang),
 * `coupe` (comme `volume` ; le plan de coupe horizontal est appliqué au rendu, `hauteurCoupe`).
 */
import {
  buildModelGeometry,
  type BuildingModel,
  type ColumnElement,
  type Level,
  type Opening,
  type Point2Local,
  type Stair,
  type Wall,
} from "@parcours/core-geometry";
import { estNonEvaluee, FORMES_POTEAU_RECTANGULAIRES, type EtatModele, type IdObjet, type ObjetModele, type PointLocal } from "@parcours/atelier-model";

export const MODES_3D = ["volume", "eclate", "coupe"] as const;
export type Mode3d = (typeof MODES_3D)[number];

export const LIBELLES_MODE: Readonly<Record<Mode3d, string>> = { volume: "Volume", eclate: "Éclaté", coupe: "Coupe" };

export type Xy = readonly [number, number];

export interface Prisme3d {
  readonly objetId: IdObjet;
  readonly classe: string;
  readonly niveauId: IdObjet;
  readonly contour: readonly Xy[];
  readonly trous: readonly (readonly Xy[])[];
  readonly z0: number;
  readonly z1: number;
}

/** Remplissage d'une baie (vitrage, passage), quadrilatère vertical. */
export interface Surface3d {
  readonly objetId: IdObjet;
  readonly classe: string;
  readonly niveauId: IdObjet;
  readonly points: readonly (readonly [number, number, number])[];
}

export interface Diagnostic3d {
  readonly objetId: IdObjet | null;
  readonly message: string;
}

export interface Scene3d {
  readonly prismes: readonly Prisme3d[];
  readonly surfaces: readonly Surface3d[];
  readonly diagnostics: readonly Diagnostic3d[];
  /** Boîte englobante (null si la scène est vide). */
  readonly bornes: { readonly min: readonly [number, number, number]; readonly max: readonly [number, number, number] } | null;
  /** Décalage vertical appliqué à chaque niveau (mode éclaté), en m. */
  readonly decalages: Readonly<Record<IdObjet, number>>;
}

export interface OptionsScene {
  /** Niveaux rendus (ordre indifférent) ; vide = aucun. */
  readonly niveaux: readonly IdObjet[];
  readonly mode: Mode3d;
  /** Écart ajouté entre deux niveaux consécutifs en mode éclaté (m). */
  readonly ecartEclate?: number;
}

export const ECART_ECLATE = 3;

type ObjetDe<C extends string> = Extract<ObjetModele, { classe: C }>;
const de = <C extends string>(o: ObjetModele, c: C): o is ObjetDe<C> => o.classe === c;
const xy = (p: PointLocal): Point2Local => [p.x, p.y] as Point2Local;
const anneau = (pts: readonly PointLocal[]): Xy[] => pts.map((p) => [p.x, p.y] as const);

/** Niveaux du modèle triés par ordre puis altitude. */
export function niveauxDuModele(etat: EtatModele): ObjetDe<"niveau">[] {
  return Object.values(etat.objets)
    .filter((o): o is ObjetDe<"niveau"> => de(o, "niveau"))
    .sort((a, b) => a.params.ordre - b.params.ordre || a.params.elevation.value - b.params.elevation.value || a.id.localeCompare(b.id));
}

/** Axe du mur ramené au milieu de son épaisseur selon l'alignement (DA-02-07), `null` si non évalué. */
function axeCentre(m: ObjetDe<"mur">): { a: Point2Local; b: Point2Local; evalue: boolean } {
  const { a, b } = m.params.axe;
  const al = m.params.alignement;
  const L = Math.hypot(b.x - a.x, b.y - a.y);
  if (estNonEvaluee(al) || al === "axe" || L === 0) return { a: xy(a), b: xy(b), evalue: !estNonEvaluee(al) };
  const n = { x: -(b.y - a.y) / L, y: (b.x - a.x) / L };
  // « gauche » : l'axe est la face gauche, le corps est côté −n ; « droite » : corps côté +n.
  const k = ((al === "gauche" ? -1 : 1) * m.params.epaisseur.value) / 2;
  return { a: [a.x + n.x * k, a.y + n.y * k] as Point2Local, b: [b.x + n.x * k, b.y + n.y * k] as Point2Local, evalue: true };
}

/** Profil d'un poteau : rectangle `largeur × profondeur` centré (seules formes rectangulaires portées). */
function profilPoteau(c: ColumnElement): { solids: [number, number][][]; holes: [number, number][][]; inserts: [number, number][][] } {
  const w = (c.width ?? 0) / 2;
  const d = (c.depth ?? 0) / 2;
  return { solids: [[[-w, -d], [w, -d], [w, d], [-w, d]]], holes: [], inserts: [] };
}

export function sceneDuModele(etat: EtatModele, options: OptionsScene): Scene3d {
  const tous = niveauxDuModele(etat);
  const levels: Level[] = tous.map((n) => ({ id: n.id, elevation: n.params.elevation.value, height: n.params.hauteur.value }));
  const voulus = new Set(options.niveaux);
  const ecart = options.mode === "eclate" ? (options.ecartEclate ?? ECART_ECLATE) : 0;
  const decalages: Record<IdObjet, number> = {};
  tous.forEach((n, rang) => (decalages[n.id] = rang * ecart));

  const prismes: Prisme3d[] = [];
  const surfaces: Surface3d[] = [];
  const diagnostics: Diagnostic3d[] = [];
  const objets = Object.values(etat.objets);
  const classeDe = new Map(objets.map((o) => [o.id, o.classe]));

  for (const niveau of tous) {
    if (!voulus.has(niveau.id)) continue;
    const level = levels.find((l) => l.id === niveau.id) as Level;
    const dz = decalages[niveau.id] ?? 0;
    const zNiveau = level.elevation;
    const ici = objets.filter((o) => o.niveauId === niveau.id);
    const pousser = (p: Omit<Prisme3d, "niveauId" | "z0" | "z1"> & { z0: number; z1: number }) => {
      if (p.contour.length >= 3 && p.z1 > p.z0) prismes.push({ ...p, niveauId: niveau.id, z0: p.z0 + dz, z1: p.z1 + dz });
    };

    // Murs, baies, poteaux, escaliers : géométrie de référence (core-geometry).
    const modele: Required<Pick<BuildingModel, "walls" | "doors" | "windows" | "columns" | "stairs">> = { walls: [], doors: [], windows: [], columns: [], stairs: [] };
    for (const o of ici) {
      if (de(o, "mur")) {
        const { a, b, evalue } = axeCentre(o);
        if (!evalue) diagnostics.push({ objetId: o.id, message: `${o.id} : alignement non évalué, axe tracé pris au milieu de l'épaisseur.` });
        const w: Wall = { id: o.id, a, b, thickness: o.params.epaisseur.value, baseLevel: niveau.id };
        if (o.params.hauteur) w.height = o.params.hauteur.value;
        else if (o.params.niveauHaut) w.topLevel = o.params.niveauHaut;
        modele.walls.push(w);
      } else if (de(o, "porte") || de(o, "fenetre") || de(o, "ouverture")) {
        const p = o.params;
        const op: Opening = { id: o.id, hostWallId: p.murHoteId, kind: p.allege.value > 0 ? "window" : "door", t: p.position.t, width: p.largeur.value, sill: p.allege.value, height: p.hauteur.value };
        (op.kind === "door" ? modele.doors : modele.windows).push(op);
      } else if (de(o, "poteau")) {
        const p = o.params;
        if (!(FORMES_POTEAU_RECTANGULAIRES as readonly string[]).includes(p.formeId)) diagnostics.push({ objetId: o.id, message: `${o.id} : profil « ${p.formeId} » non porté, emprise largeur × profondeur représentée.` });
        modele.columns.push({ id: o.id, p: xy(p.point), angle: p.angle.value, width: p.largeur.value, depth: p.profondeur.value, height: p.hauteur.value, baseLevel: niveau.id });
      } else if (de(o, "escalier")) {
        const p = o.params;
        if (!estNonEvaluee(p.referencePlanSeulement) && p.referencePlanSeulement) continue;
        const h = estNonEvaluee(p.hauteurAFranchir) ? undefined : p.hauteurAFranchir.value;
        const marches = estNonEvaluee(p.marches) ? undefined : p.marches;
        if (h === undefined) diagnostics.push({ objetId: o.id, message: `${o.id} : hauteur à franchir non évaluée, hauteur du niveau retenue.` });
        const st: Stair = { id: o.id, a: xy(p.axe.a), b: xy(p.axe.b), width: p.largeur.value, ...(h !== undefined ? { height: h } : {}), ...(marches !== undefined ? { steps: marches } : {}) };
        modele.stairs.push(st);
      }
    }
    const geo = buildModelGeometry(modele, level, levels, profilPoteau);
    for (const pr of geo.prisms) {
      pousser({ objetId: pr.id, classe: classeDe.get(pr.id) ?? pr.kind, contour: pr.poly.map((p) => [p[0], p[1]] as const), trous: pr.holes.map((h) => h.map((p) => [p[0], p[1]] as const)), z0: pr.z0, z1: pr.z1 });
    }
    for (const s of geo.surfaces) {
      surfaces.push({ objetId: s.id, classe: classeDe.get(s.id) ?? s.kind, niveauId: niveau.id, points: s.points.map((p) => [p[0], p[1], p[2] + dz] as const) });
    }
    for (const d of geo.diagnostics) diagnostics.push({ objetId: d.elementId, message: d.message });

    // Dalles, toitures, solides : prismes directs sur leur contour.
    for (const o of ici) {
      if (de(o, "dalle") || de(o, "toiture")) {
        const p = o.params;
        const z0 = zNiveau + p.decalageBase.value;
        if (de(o, "toiture") && o.params.type !== "plate") diagnostics.push({ objetId: o.id, message: `${o.id} : toiture ${o.params.type}, pente non représentée au lot 3b (prisme plat).` });
        pousser({ objetId: o.id, classe: o.classe, contour: anneau(p.contour), trous: p.trous.map((t) => anneau(t.polygone)), z0, z1: z0 + p.epaisseur.value });
      } else if (de(o, "solide")) {
        const p = o.params;
        const z0 = zNiveau + p.decalageBase.value;
        pousser({ objetId: o.id, classe: o.classe, contour: anneau(p.contour), trous: p.trous.map((t) => anneau(t.polygone)), z0, z1: z0 + p.hauteur.value });
      }
    }
  }

  return { prismes, surfaces, diagnostics, bornes: bornesDe(prismes, surfaces), decalages };
}

function bornesDe(prismes: readonly Prisme3d[], surfaces: readonly Surface3d[]): Scene3d["bornes"] {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const voir = (x: number, y: number, z: number) => {
    min[0] = Math.min(min[0] as number, x);
    min[1] = Math.min(min[1] as number, y);
    min[2] = Math.min(min[2] as number, z);
    max[0] = Math.max(max[0] as number, x);
    max[1] = Math.max(max[1] as number, y);
    max[2] = Math.max(max[2] as number, z);
  };
  for (const p of prismes) for (const [x, y] of p.contour) (voir(x, y, p.z0), voir(x, y, p.z1));
  for (const s of surfaces) for (const [x, y, z] of s.points) voir(x, y, z);
  if (!Number.isFinite(min[0])) return null;
  return { min: [min[0], min[1], min[2]] as [number, number, number], max: [max[0], max[1], max[2]] as [number, number, number] };
}

/** Hauteur de coupe par défaut d'un niveau : 1,20 m au-dessus de son altitude (plan de coupe usuel), décalage éclaté compris. */
export function hauteurCoupeParDefaut(etat: EtatModele, niveauId: IdObjet | null, decalages: Readonly<Record<IdObjet, number>> = {}): number {
  const n = niveauId ? etat.objets[niveauId] : undefined;
  return n && de(n, "niveau") ? n.params.elevation.value + (decalages[n.id] ?? 0) + 1.2 : 1.2;
}
