/**
 * Outils de l'importeur P.118 : lecture prudente du JSON source, propriétés `import.*` conservées bit à bit,
 * polygones et trous. Purs, sans E/S.
 */
import type { Propriete, ValeurJson } from "../ontologie/proprietes.js";
import { pointLocal, type PointLocal, type PolygoneAvecTrous, type TrouPolygone } from "../ontologie/reperes.js";

export type Json = Record<string, unknown>;
export type Point2 = readonly [number, number];

export const estObjet = (x: unknown): x is Json => typeof x === "object" && x !== null && !Array.isArray(x);
export const estNombre = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
export const estTexte = (x: unknown): x is string => typeof x === "string";
export const estPoint2 = (x: unknown): x is Point2 => Array.isArray(x) && x.length === 2 && estNombre(x[0]) && estNombre(x[1]);
export const estListePoints = (x: unknown): x is Point2[] => Array.isArray(x) && x.every(estPoint2);

/** Erreur de conversion d'un élément source : l'élément est conservé brut et signalé (rien n'est supprimé). */
export class ErreurConversion extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErreurConversion";
  }
}

export function exiger<T>(x: unknown, garde: (v: unknown) => v is T, champ: string): T {
  if (!garde(x)) throw new ErreurConversion(`champ « ${champ} » absent ou mal formé`);
  return x;
}

/** Copie profonde d'une valeur JSON (aucune transformation des nombres : copie bit à bit). */
export function cloner(v: unknown): ValeurJson {
  if (v === null || typeof v === "number" || typeof v === "string" || typeof v === "boolean") return v;
  if (Array.isArray(v)) return v.map(cloner);
  if (estObjet(v)) {
    const o: Record<string, ValeurJson> = {};
    for (const k of Object.keys(v)) if (v[k] !== undefined) o[k] = cloner(v[k]);
    return o;
  }
  throw new ErreurConversion(`valeur non JSON (${typeof v})`);
}

export function sans(o: Json, cles: readonly string[]): Json {
  const r: Json = {};
  for (const k of Object.keys(o)) if (!cles.includes(k)) r[k] = o[k];
  return r;
}

/** Champs source dont l'unité est connue (mètres) : la propriété importée porte `unite: "m"`. */
const CLES_EN_METRES = new Set(["thickness", "height", "baseOffset", "width", "depth", "nominalWidth", "offset", "sill"]);

/** Propriété `import.<cle>` : valeur source conservée bit à bit, provenance `import`, statut `declaree`. */
export function proprieteImport(cle: string, valeur: unknown): Propriete {
  const p: Propriete = { nom: `import.${cle}`, valeur: cloner(valeur), provenance: "import", statut: "declaree" };
  return typeof valeur === "number" && CLES_EN_METRES.has(cle) ? { ...p, unite: "m" } : p;
}

/** Propriété technique de l'importeur (`importeur.<nom>`) : rang source, métadonnées de trous, tracés rattachés… */
export function proprieteImporteur(nom: string, valeur: unknown): Propriete {
  return { nom: `importeur.${nom}`, valeur: cloner(valeur), provenance: "import", statut: "declaree" };
}

/** Tous les champs non consommés par les paramètres canoniques, en propriétés `import.*`, dans l'ordre source. */
export function reste(src: Json, consommes: readonly string[]): Propriete[] {
  return Object.keys(src)
    .filter((k) => !consommes.includes(k) && src[k] !== undefined)
    .map((k) => proprieteImport(k, src[k]));
}

export const pl = (p: Point2, repere?: string): PointLocal => pointLocal(p[0], p[1], repere);

/** Trous source (`[[x, y]…]` ou `{ id, kind, poly, … }`) → trous tagués et métadonnées (sans la géométrie). */
export function convertirTrous(holes: unknown, repere?: string): { trous: TrouPolygone<PointLocal>[]; meta: ValeurJson[] | null } {
  if (holes === undefined) return { trous: [], meta: null };
  if (!Array.isArray(holes)) throw new ErreurConversion("champ « holes » mal formé");
  const trous: TrouPolygone<PointLocal>[] = [];
  const meta: ValeurJson[] = [];
  holes.forEach((h, i) => {
    if (estListePoints(h)) {
      trous.push({ polygone: h.map((p) => pl(p, repere)) });
      meta.push(null);
    } else if (estObjet(h) && estListePoints(h.poly)) {
      trous.push({
        polygone: h.poly.map((p) => pl(p, repere)),
        ...(estTexte(h.id) ? { id: h.id } : {}),
        ...(estTexte(h.source) ? { source: h.source } : {}),
      });
      meta.push(cloner(sans(h, ["poly"])));
    } else throw new ErreurConversion(`trou ${i} mal formé`);
  });
  return { trous, meta: holes.length ? meta : null };
}

export function polygoneAvecTrousSource(points: unknown, holes: unknown, repere?: string): { poly: PolygoneAvecTrous<PointLocal>; meta: ValeurJson[] | null } {
  const pts = exiger(points, estListePoints, "points");
  if (pts.length < 3) throw new ErreurConversion("au moins 3 sommets attendus");
  const { trous, meta } = convertirTrous(holes, repere);
  return { poly: { contour: pts.map((p) => pl(p, repere)), trous }, meta };
}

/** Aire non signée (formule du prototype, origine au premier sommet). Sert au contrôle d'écart seulement. */
export function aireContour(pts: readonly { readonly x: number; readonly y: number }[]): number {
  if (pts.length < 3) return 0;
  const o = pts[0]!;
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const q = pts[(i + 1) % pts.length]!;
    s += (p.x - o.x) * (q.y - o.y) - (q.x - o.x) * (p.y - o.y);
  }
  return Math.abs(s) / 2;
}

export function aireAvecTrous(p: PolygoneAvecTrous<PointLocal>): number {
  return Math.max(0, aireContour(p.contour) - p.trous.reduce((n, t) => n + aireContour(t.polygone), 0));
}
