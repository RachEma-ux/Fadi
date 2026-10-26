/**
 * Noyau exact (P2-1, D-177) — pur, sans interface.
 *
 * Opérations B-rep exécutées par OCCT compilé en WebAssembly (`occt-wasm`) : révolution, extrusion, balayage,
 * lissage, booléens, trou, coque, surface (grille de contrôle épaissie), surface NURBS (pôles, degrés, poids, épaissie),
 * polyèdre fermé (triangles cousus en solide), patch (face non plane sur un contour 3D,
 * épaissie), congé (toutes les arêtes), import STEP. Un résultat est un `SolideExact` : représentation canonique **brep**
 * (binaire OCCT, base64), maillage dérivé (positions, indices ; mètres, z vers le haut), volume, aire, nombre de
 * faces et de solides, nom et version du moteur, empreinte des octets brep. Le même code tourne dans le navigateur
 * (Web Worker) et dans l'API (Node) : le serveur recalcule l'opération et compare l'empreinte (R9, D-177).
 *
 * Règles : le binaire `.wasm` est fourni par l'appelant (URL séparée, remplaçable — LGPL) ou localisé par le paquet
 * en Node ; jamais chargé au chemin d'ouverture (D-013) ; toute entrée est validée avant l'appel du noyau (un `Vec3`
 * mal formé produit sinon une forme nulle sans erreur — constat du banc P2-0) ; un objet paramétrique n'est jamais
 * remplacé par un brep (R15) : une extrusion de son contour sert d'opérande.
 */
import { JoinType, OcctKernel, type ShapeHandle } from "occt-wasm";

export const MOTEUR_EXACT = "occt-wasm" as const;
export const VERSION_MOTEUR_EXACT = "5.6.1";
export const CONTRAT_SOLIDE_EXACT = "solide-exact/1" as const;

export interface Point2 { x: number; y: number }
export interface Point3 { x: number; y: number; z: number }

/** Contour fermé (≥ 3 sommets, mètres) avec trous, dans le plan z = 0 du repère local ; extrudé de `z0` sur `hauteur`. */
export interface Extrusion { profil: Point2[]; trous?: Point2[][]; z0: number; hauteur: number }

/** Pose en plan d'un brep (repère local) : rotation `angleDeg` autour de z puis translation (x, y). */
export interface Pose { x: number; y: number; angleDeg: number }

/** Opérande d'un booléen : un brep existant (posé) ou l'extrusion du contour d'un objet paramétrique (qui reste canonique). */
export type OperandeExacte = { brep: string; pose?: Pose } | { extrusion: Extrusion };

export type OperationExacte =
  | { type: "extrusion"; extrusion: Extrusion }
  | { type: "revolution"; profil: Point2[]; axe: { a: Point2; b: Point2 }; angleDeg: number; z0?: number }
  | { type: "balayage"; profil: Point3[]; trajet: Point3[] }
  | { type: "lissage"; profils: Point3[][]; regle: boolean }
  | { type: "booleen"; op: "union" | "soustraction" | "intersection"; a: OperandeExacte; b: OperandeExacte }
  | { type: "trou"; solide: { brep: string; pose?: Pose }; centre: Point3; direction: Point3; diametre: number; profondeur: number | null }
  | { type: "coque"; solide: { brep: string; pose?: Pose }; epaisseur: number; ouvrirDessus: boolean }
  | { type: "surface"; controle: Point3[]; lignes: number; colonnes: number; epaisseur: number }
  | { type: "nurbs"; nurbs: Nurbs; epaisseur: number }
  | { type: "polyedre"; sommets: Point3[]; triangles: [number, number, number][] }
  | { type: "patch"; contour: Point3[]; epaisseur: number }
  | { type: "conge"; solide: { brep: string; pose?: Pose }; rayon: number }
  | { type: "import-step"; step: string; solide?: number };

/**
 * Surface NURBS (Studio, X.1-05) donnée par ses **pôles** (points de contrôle, jamais des points de passage) :
 * grille `lignes × colonnes` rangée ligne par ligne (`controle[i * colonnes + j]`, i le long de u, j le long de v),
 * degrés `degreU` ≤ lignes − 1 et `degreV` ≤ colonnes − 1, poids rationnels facultatifs (> 0 ; absents : 1, B-spline
 * non rationnelle). Vecteurs de nœuds **uniformes bornés** (clamped) sur [0, 1] : multiplicité degré + 1 aux bornes, 1
 * à l'intérieur. La nappe passe donc par ses quatre coins ; sa normale est ∂S/∂u × ∂S/∂v.
 */
export interface Nurbs { degreU: number; degreV: number; lignes: number; colonnes: number; controle: Point3[]; poids?: number[] }

/** Bornes techniques d'une surface NURBS (pas des valeurs métier) : grille 2..64 par sens, degré 1..9. */
export const LIMITES_NURBS = Object.freeze({ cotes: 64, degre: 9 } as const);

export interface MaillageExact { positions: number[]; indices: number[] }

export interface SolideExact {
  brep: string;
  maillage: MaillageExact;
  volume: number;
  aire: number;
  faces: number;
  solides: number;
  moteur: typeof MOTEUR_EXACT;
  versionMoteur: string;
  empreinte: string;
}

export class ErreurExacte extends Error {
  constructor(public readonly chemin: string, message: string) {
    super(`${chemin} : ${message}`);
    this.name = "ErreurExacte";
  }
}

// ---------------------------------------------------------------------------
// Validation des entrées (R3 : rien de deviné ; constat du banc : un Vec3 mal formé donne une forme nulle)
// ---------------------------------------------------------------------------

const fini = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const LIMITE_POINTS = 20000;

function point2(p: unknown, chemin: string): Point2 {
  if (!p || typeof p !== "object" || !fini((p as Point2).x) || !fini((p as Point2).y)) throw new ErreurExacte(chemin, "point { x, y } attendu (nombres finis, m)");
  return { x: (p as Point2).x, y: (p as Point2).y };
}
function point3(p: unknown, chemin: string): Point3 {
  const q = point2(p, chemin);
  if (!fini((p as Point3).z)) throw new ErreurExacte(chemin, "point { x, y, z } attendu (nombres finis, m)");
  return { ...q, z: (p as Point3).z };
}
function contour2(c: unknown, chemin: string, min = 3): Point2[] {
  if (!Array.isArray(c) || c.length < min || c.length > LIMITE_POINTS) throw new ErreurExacte(chemin, `contour de ${min} à ${LIMITE_POINTS} sommets attendu`);
  const pts = c.map((p, i) => point2(p, `${chemin}[${i}]`));
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!, b = pts[(i + 1) % pts.length]!;
    if (Math.hypot(a.x - b.x, a.y - b.y) < 1e-9 && pts.length > min) throw new ErreurExacte(`${chemin}[${i}]`, "deux sommets consécutifs confondus");
  }
  return pts;
}
function contour3(c: unknown, chemin: string, min = 3): Point3[] {
  if (!Array.isArray(c) || c.length < min || c.length > LIMITE_POINTS) throw new ErreurExacte(chemin, `${min} points au moins attendus`);
  return c.map((p, i) => point3(p, `${chemin}[${i}]`));
}
function nombre(v: unknown, chemin: string, options: { min?: number; max?: number } = {}): number {
  if (!fini(v)) throw new ErreurExacte(chemin, "nombre fini attendu");
  if (options.min !== undefined && v < options.min) throw new ErreurExacte(chemin, `≥ ${options.min} attendu`);
  if (options.max !== undefined && v > options.max) throw new ErreurExacte(chemin, `≤ ${options.max} attendu`);
  return v;
}
function extrusion(e: unknown, chemin: string): Extrusion {
  if (!e || typeof e !== "object") throw new ErreurExacte(chemin, "extrusion { profil, trous?, z0, hauteur } attendue");
  const x = e as Extrusion;
  const trous = x.trous === undefined ? [] : (Array.isArray(x.trous) ? x.trous.map((t, i) => contour2(t, `${chemin}.trous[${i}]`)) : (() => { throw new ErreurExacte(`${chemin}.trous`, "tableau de contours attendu"); })());
  return { profil: contour2(x.profil, `${chemin}.profil`), trous, z0: nombre(x.z0, `${chemin}.z0`), hauteur: nombre(x.hauteur, `${chemin}.hauteur`, { min: 1e-6 }) };
}
function brep(b: unknown, chemin: string): string {
  if (typeof b !== "string" || !b.length || !/^[A-Za-z0-9+/=]+$/.test(b)) throw new ErreurExacte(chemin, "brep base64 attendu");
  return b;
}
function pose(p: unknown, chemin: string): Pose | undefined {
  if (p === undefined || p === null) return undefined;
  if (!p || typeof p !== "object") throw new ErreurExacte(chemin, "pose { x, y, angleDeg } attendue");
  const q = p as Pose;
  return { x: nombre(q.x, `${chemin}.x`), y: nombre(q.y, `${chemin}.y`), angleDeg: nombre(q.angleDeg, `${chemin}.angleDeg`) };
}
function solideRef(o: unknown, chemin: string): { brep: string; pose?: Pose } {
  const b = brep((o as { brep?: unknown })?.brep, `${chemin}.brep`);
  const ps = pose((o as { pose?: unknown })?.pose, `${chemin}.pose`);
  return ps ? { brep: b, pose: ps } : { brep: b };
}
function operande(o: unknown, chemin: string): OperandeExacte {
  if (o && typeof o === "object" && "brep" in o) return solideRef(o, chemin);
  if (o && typeof o === "object" && "extrusion" in o) return { extrusion: extrusion((o as { extrusion: unknown }).extrusion, `${chemin}.extrusion`) };
  throw new ErreurExacte(chemin, "opérande { brep } ou { extrusion } attendue");
}

function nombreNonNul(v: unknown, chemin: string): number {
  const n = nombre(v, chemin);
  if (Math.abs(n) < 1e-6) throw new ErreurExacte(chemin, "épaisseur non nulle attendue (|e| ≥ 1e-6 m)");
  return n;
}
function entierBorne(v: unknown, chemin: string, min: number, max: number): number {
  const n = nombre(v, chemin, { min, max });
  if (!Number.isInteger(n)) throw new ErreurExacte(chemin, "entier attendu");
  return n;
}

/** Valide une surface NURBS (pôles, degrés, poids) ; refuse un bord dégénéré (réduit à un point) ou deux coins confondus. */
export function validerNurbs(brut: unknown, chemin = "nurbs"): Nurbs {
  if (!brut || typeof brut !== "object") throw new ErreurExacte(chemin, "surface { degreU, degreV, lignes, colonnes, controle, poids? } attendue");
  const o = brut as Record<string, unknown>;
  const lignes = entierBorne(o["lignes"], `${chemin}.lignes`, 2, LIMITES_NURBS.cotes), colonnes = entierBorne(o["colonnes"], `${chemin}.colonnes`, 2, LIMITES_NURBS.cotes);
  const degreU = entierBorne(o["degreU"], `${chemin}.degreU`, 1, Math.min(LIMITES_NURBS.degre, lignes - 1));
  const degreV = entierBorne(o["degreV"], `${chemin}.degreV`, 1, Math.min(LIMITES_NURBS.degre, colonnes - 1));
  const controle = contour3(o["controle"], `${chemin}.controle`, 4);
  if (controle.length !== lignes * colonnes) throw new ErreurExacte(`${chemin}.controle`, `${lignes * colonnes} pôles attendus (lignes × colonnes)`);
  let poids: number[] | undefined;
  if (o["poids"] !== undefined) {
    const w = o["poids"];
    if (!Array.isArray(w) || w.length !== lignes * colonnes) throw new ErreurExacte(`${chemin}.poids`, `${lignes * colonnes} poids attendus`);
    poids = w.map((x, i) => { const n = nombre(x, `${chemin}.poids[${i}]`); if (n <= 0) throw new ErreurExacte(`${chemin}.poids[${i}]`, "poids strictement positif attendu"); return n; });
  }
  const P = (i: number, j: number) => controle[i * colonnes + j]!;
  const dist = (a: Point3, b: Point3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  const bords: [string, Point3[]][] = [
    ["u = 0", Array.from({ length: colonnes }, (_, j) => P(0, j))], ["u = 1", Array.from({ length: colonnes }, (_, j) => P(lignes - 1, j))],
    ["v = 0", Array.from({ length: lignes }, (_, i) => P(i, 0))], ["v = 1", Array.from({ length: lignes }, (_, i) => P(i, colonnes - 1))],
  ];
  for (const [nom, pts] of bords) if (pts.every((p) => dist(p, pts[0]!) < 1e-9)) throw new ErreurExacte(`${chemin}.controle`, `bord ${nom} réduit à un point (surface dégénérée non prise en charge)`);
  const coins = [P(0, 0), P(0, colonnes - 1), P(lignes - 1, 0), P(lignes - 1, colonnes - 1)];
  for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) if (dist(coins[a]!, coins[b]!) < 1e-9) throw new ErreurExacte(`${chemin}.controle`, "deux coins de la surface confondus");
  return { degreU, degreV, lignes, colonnes, controle, ...(poids ? { poids } : {}) };
}

/** Nœuds distincts et multiplicités d'un vecteur uniforme borné sur [0, 1] (n pôles, degré p). */
export function noeudsUniformesBornes(n: number, p: number): [number, number][] {
  const travees = n - p;
  return Array.from({ length: travees + 1 }, (_, i) => [i / travees, i === 0 || i === travees ? p + 1 : 1] as [number, number]);
}

/**
 * Texte BREP OCCT (« CASCADE Topology V3 ») d'une face NURBS à bornes naturelles : la surface rationnelle ou non
 * (`Geom_BSplineSurface`, type 9), ses quatre bords (courbes iso exactes : pôles et poids de la ligne ou de la colonne
 * de bord, nœuds du sens concerné) et leurs courbes paramétriques (droites de l'espace (u, v)). Écrit sans perte (les
 * nombres sont écrits par leur plus courte représentation exacte) ; relu par `fromBREP`. Pur.
 */
export function brepTexteNurbs(s: Nurbs): string {
  const { degreU: pu, degreV: pv, lignes: m, colonnes: n, controle, poids } = s;
  const f = (x: number) => (Object.is(x, -0) ? "0" : String(x));
  const rationnel = poids?.some((w) => w !== 1) ? 1 : 0;
  const pole = (i: number, j: number) => { const p = controle[i * n + j]!; return `${f(p.x)} ${f(p.y)} ${f(p.z)}${rationnel ? ` ${f(poids![i * n + j]!)}` : ""}`; };
  const ku = noeudsUniformesBornes(m, pu), kv = noeudsUniformesBornes(n, pv);
  const noeuds = (k: [number, number][], sep: string) => k.map(([u, mu]) => `${f(u)} ${mu}`).join(sep);
  const courbe = (pts: [number, number][], p: number, k: [number, number][]) => `7 ${rationnel} 0  ${p} ${pts.length} ${k.length}  ${pts.map(([i, j]) => pole(i, j)).join("  ")} \n ${noeuds(k, " ")}`;
  const ligne = (i: number) => Array.from({ length: n }, (_, j) => [i, j] as [number, number]);
  const colonne = (j: number) => Array.from({ length: m }, (_, i) => [i, j] as [number, number]);
  const sommet = (i: number, j: number) => { const p = controle[i * n + j]!; return `Ve\n1e-07\n${f(p.x)} ${f(p.y)} ${f(p.z)}\n0 0\n\n0101101\n*`; };
  const arete = (c: number, sommets: string) => `Ed\n 1e-07 1 1 0\n1  ${c} 0 0 1\n2  ${c} 1 0 0 1\n0\n\n0101000\n${sommets} *`;
  const nappe = Array.from({ length: m }, (_, i) => Array.from({ length: n }, (_, j) => pole(i, j)).join("  ") + "  ").join("\n");
  // Formes numérotées depuis la fin (la dernière écrite est 1) : sommets 10, 9, 7, 5 ; arêtes 8, 6, 4, 3 ; fil 2 ; face 1.
  return [
    "CASCADE Topology V3, (c) Open Cascade", "Locations 0", "Curve2ds 4", "1 0 0 0 1 ", "1 0 0 1 0 ", "1 1 0 0 1 ", "1 0 1 1 0 ",
    "Curves 4", courbe(ligne(0), pv, kv), courbe(colonne(0), pu, ku), courbe(ligne(m - 1), pv, kv), courbe(colonne(n - 1), pu, ku),
    "Polygon3D 0", "PolygonOnTriangulations 0", "Surfaces 1",
    `9 ${rationnel} ${rationnel} 0 0 ${pu} ${pv} ${m} ${n} ${ku.length} ${kv.length} ${nappe}`, "", noeuds(ku, "\n"), "", noeuds(kv, "\n"), "",
    "Triangulations 0", "", "TShapes 10",
    sommet(0, 0), sommet(0, n - 1), arete(1, "+10 0 -9 0"), sommet(m - 1, 0), arete(2, "+10 0 -7 0"), sommet(m - 1, n - 1),
    arete(3, "+7 0 -5 0"), arete(4, "+9 0 -5 0"), "Wi\n\n0101100\n-8 0 +6 0 +4 0 -3 0 *", "Fa\n1  1e-07 1 0\n\n1101000\n+2 0 *", "", "+1 0", "",
  ].join("\n");
}

/** Valide et normalise une opération reçue (du navigateur, de l'API, d'un script) ; lève `ErreurExacte`. */
export function validerOperation(brut: unknown): OperationExacte {
  if (!brut || typeof brut !== "object" || typeof (brut as { type?: unknown }).type !== "string") throw new ErreurExacte("type", "opération { type, … } attendue");
  const o = brut as Record<string, unknown>;
  switch (o["type"]) {
    case "extrusion":
      return { type: "extrusion", extrusion: extrusion(o["extrusion"], "extrusion") };
    case "revolution": {
      const axe = o["axe"] as { a?: unknown; b?: unknown } | undefined;
      const a = point2(axe?.a, "axe.a"), b = point2(axe?.b, "axe.b");
      if (Math.hypot(a.x - b.x, a.y - b.y) < 1e-9) throw new ErreurExacte("axe", "axe de longueur nulle");
      const profil = contour2(o["profil"], "profil");
      // Le profil doit rester d'un seul côté de l'axe (sinon le solide se traverse lui-même).
      const ux = b.x - a.x, uy = b.y - a.y;
      const cotes = profil.map((p) => Math.sign(ux * (p.y - a.y) - uy * (p.x - a.x))).filter((s) => s !== 0);
      if (cotes.some((s) => s !== cotes[0])) throw new ErreurExacte("profil", "le profil traverse l'axe de révolution");
      return { type: "revolution", profil, axe: { a, b }, angleDeg: nombre(o["angleDeg"], "angleDeg", { min: 1e-6, max: 360 }), z0: o["z0"] === undefined ? 0 : nombre(o["z0"], "z0") };
    }
    case "balayage":
      return { type: "balayage", profil: contour3(o["profil"], "profil"), trajet: contour3(o["trajet"], "trajet", 2) };
    case "lissage": {
      const ps = o["profils"];
      if (!Array.isArray(ps) || ps.length < 2) throw new ErreurExacte("profils", "deux profils fermés au moins");
      return { type: "lissage", profils: ps.map((p, i) => contour3(p, `profils[${i}]`)), regle: o["regle"] === true };
    }
    case "booleen": {
      const op = o["op"];
      if (op !== "union" && op !== "soustraction" && op !== "intersection") throw new ErreurExacte("op", "union | soustraction | intersection");
      return { type: "booleen", op, a: operande(o["a"], "a"), b: operande(o["b"], "b") };
    }
    case "trou": {
      const d = point3(o["direction"], "direction");
      if (Math.hypot(d.x, d.y, d.z) < 1e-9) throw new ErreurExacte("direction", "direction nulle");
      const pf = o["profondeur"];
      return { type: "trou", solide: solideRef(o["solide"], "solide"), centre: point3(o["centre"], "centre"), direction: d, diametre: nombre(o["diametre"], "diametre", { min: 1e-6 }), profondeur: pf === null || pf === undefined ? null : nombre(pf, "profondeur", { min: 1e-6 }) };
    }
    case "coque":
      return { type: "coque", solide: solideRef(o["solide"], "solide"), epaisseur: nombre(o["epaisseur"], "epaisseur", { min: 1e-6 }), ouvrirDessus: o["ouvrirDessus"] === true };
    case "surface": {
      // Surface B-spline (P2-6, DA-03-02) : grille de `lignes × colonnes` points de contrôle (≥ 2 × 2), épaissie.
      const lignes = nombre(o["lignes"], "lignes", { min: 2, max: 64 }), colonnes = nombre(o["colonnes"], "colonnes", { min: 2, max: 64 });
      if (!Number.isInteger(lignes) || !Number.isInteger(colonnes)) throw new ErreurExacte("lignes", "entiers attendus");
      const controle = contour3(o["controle"], "controle", 4);
      if (controle.length !== lignes * colonnes) throw new ErreurExacte("controle", `${lignes * colonnes} points attendus (lignes × colonnes)`);
      return { type: "surface", controle, lignes, colonnes, epaisseur: nombre(o["epaisseur"], "epaisseur", { min: 1e-6 }) };
    }
    case "nurbs":
      // Surface NURBS (Studio, X.1-05) : pôles, degrés et poids ; épaisseur signée (signe : côté de la normale).
      return { type: "nurbs", nurbs: validerNurbs(o["nurbs"], "nurbs"), epaisseur: nombreNonNul(o["epaisseur"], "epaisseur") };
    case "polyedre": {
      // Polyèdre fermé (Studio, X.1-05 : surface de subdivision solidifiée) : triangles cousus en un solide.
      const sommets = contour3(o["sommets"], "sommets", 4);
      const t = o["triangles"];
      if (!Array.isArray(t) || t.length < 4 || t.length > 200000) throw new ErreurExacte("triangles", "4 à 200 000 triangles attendus");
      const triangles = t.map((x, i): [number, number, number] => {
        if (!Array.isArray(x) || x.length !== 3 || !x.every((v) => Number.isInteger(v) && v >= 0 && v < sommets.length)) throw new ErreurExacte(`triangles[${i}]`, "trois indices de sommet attendus");
        if (x[0] === x[1] || x[1] === x[2] || x[0] === x[2]) throw new ErreurExacte(`triangles[${i}]`, "triangle dégénéré (sommets répétés)");
        return [x[0], x[1], x[2]];
      });
      // Fermé : chaque arête portée par exactement deux triangles (sinon le solide n'enferme rien).
      const aretes = new Map<string, number>();
      for (const [a, b, c] of triangles) for (const [u, v] of [[a, b], [b, c], [c, a]]) { const k = u! < v! ? `${u}|${v}` : `${v}|${u}`; aretes.set(k, (aretes.get(k) ?? 0) + 1); }
      for (const [k, n] of aretes) if (n !== 2) throw new ErreurExacte("triangles", `polyèdre non fermé (arête ${k} portée par ${n} triangle(s))`);
      return { type: "polyedre", sommets, triangles };
    }
    case "patch": {
      // Patch (DA-03-04) : face non plane tendue sur un contour 3D fermé (≥ 3 points), épaissie.
      const contour = contour3(o["contour"], "contour", 3);
      for (let i = 0; i < contour.length; i++) { const a = contour[i]!, b = contour[(i + 1) % contour.length]!; if (Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < 1e-9) throw new ErreurExacte(`contour[${i}]`, "deux sommets consécutifs confondus"); }
      return { type: "patch", contour, epaisseur: nombre(o["epaisseur"], "epaisseur", { min: 1e-6 }) };
    }
    case "conge":
      // Congé (DA-03-08) : rayon constant sur toutes les arêtes d'un solide ; le noyau refuse un rayon trop grand.
      return { type: "conge", solide: solideRef(o["solide"], "solide"), rayon: nombre(o["rayon"], "rayon", { min: 1e-6 }) };
    case "import-step": {
      const s = o["step"];
      if (typeof s !== "string" || !/^ISO-10303-21;/.test(s.trimStart())) throw new ErreurExacte("step", "fichier STEP (ISO-10303-21) attendu");
      if (s.length > 64 * 1024 * 1024) throw new ErreurExacte("step", "fichier trop volumineux (64 Mo au plus)");
      // `solide` : rang (0..n−1) du solide retenu dans un fichier qui en contient plusieurs (un objet par solide).
      const sol = o["solide"];
      if (sol === undefined || sol === null) return { type: "import-step", step: s };
      if (typeof sol !== "number" || !Number.isInteger(sol) || sol < 0) throw new ErreurExacte("solide", "rang de solide entier ≥ 0 attendu");
      return { type: "import-step", step: s, solide: sol };
    }
    default:
      throw new ErreurExacte("type", `opération inconnue : ${String(o["type"])}`);
  }
}

// ---------------------------------------------------------------------------
// Base64 et empreinte (sans Buffer : navigateur et Node)
// ---------------------------------------------------------------------------

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
export function versBase64(octets: Uint8Array): string {
  let s = "";
  for (let i = 0; i < octets.length; i += 3) {
    const a = octets[i]!, b = octets[i + 1], c = octets[i + 2];
    const n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);
    s += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + (b === undefined ? "=" : B64[(n >> 6) & 63]!) + (c === undefined ? "=" : B64[n & 63]!);
  }
  return s;
}
export function depuisBase64(texte: string): Uint8Array {
  const clean = texte.replace(/=+$/, "");
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0, acc = 0, bits = 0;
  for (let i = 0; i < clean.length; i++) {
    const v = B64.indexOf(clean[i]!);
    if (v < 0) throw new ErreurExacte("brep", "base64 invalide");
    acc = (acc << 6) | v; bits += 6;
    if (bits >= 8) { bits -= 8; out[o++] = (acc >> bits) & 255; }
  }
  return out.subarray(0, o);
}

/** FNV-1a 64 bits sur les octets du brep (hexadécimal, 16 caractères) — même fonction que l'empreinte des Planches. */
export function empreinteOctets(octets: Uint8Array): string {
  let h = 0xcbf29ce484222325n;
  const P = 0x100000001b3n, M = 0xffffffffffffffffn;
  for (let i = 0; i < octets.length; i++) h = ((h ^ BigInt(octets[i]!)) * P) & M;
  return h.toString(16).padStart(16, "0");
}

// ---------------------------------------------------------------------------
// Pièces d'un export STEP nommé
// ---------------------------------------------------------------------------

/** Solide d'une pièce STEP : extrusion, brep existant, ou lissage réglé entre deux contours fermés de même taille (m). */
export type SolideStep = { extrusion: Extrusion } | { brep: string; pose?: Pose } | { lissage: [Point3[], Point3[]] };
export interface PieceStep { nom: string; solides: SolideStep[] }
export interface PieceStepLue { nom: string; solides: number; volume: number; boite: { min: Point3; max: Point3 } | null }

/** Nom d'un produit STEP : ASCII imprimable (1 à 256), sans apostrophe ni barre oblique inverse (aucun échappement). */
const NOM_STEP = /^[\x20-\x26\x28-\x5B\x5D-\x7E]{1,256}$/;
const LIMITE_PIECES = 20000;

export function validerPiecesStep(brut: unknown): PieceStep[] {
  if (!Array.isArray(brut) || brut.length < 1 || brut.length > LIMITE_PIECES) throw new ErreurExacte("pieces", `1 à ${LIMITE_PIECES} pièces attendues`);
  return brut.map((p, i) => {
    const chemin = `pieces[${i}]`;
    const o = (p ?? {}) as { nom?: unknown; solides?: unknown };
    if (typeof o.nom !== "string" || !NOM_STEP.test(o.nom)) throw new ErreurExacte(`${chemin}.nom`, "nom ASCII imprimable sans apostrophe ni barre oblique inverse attendu");
    if (!Array.isArray(o.solides) || o.solides.length < 1 || o.solides.length > 1024) throw new ErreurExacte(`${chemin}.solides`, "1 à 1 024 solides attendus");
    const solides = o.solides.map((s, j): SolideStep => {
      const cs = `${chemin}.solides[${j}]`;
      if (s && typeof s === "object" && "lissage" in s) {
        const l = (s as { lissage: unknown }).lissage;
        if (!Array.isArray(l) || l.length !== 2) throw new ErreurExacte(`${cs}.lissage`, "deux contours attendus");
        const a = contour3(l[0], `${cs}.lissage[0]`), b = contour3(l[1], `${cs}.lissage[1]`);
        if (a.length !== b.length) throw new ErreurExacte(`${cs}.lissage`, "contours de même nombre de sommets attendus");
        return { lissage: [a, b] };
      }
      return operande(s, cs);
    });
    return { nom: o.nom, solides };
  });
}

// ---------------------------------------------------------------------------
// Moteur
// ---------------------------------------------------------------------------

export interface OptionsMoteur {
  /** Binaire `.wasm` : octets, ou URL / chemin ; absent : localisé à côté du module (Node). */
  wasm?: string | URL | ArrayBuffer | Uint8Array;
  /** Déflexion linéaire de la tessellation (m) ; angulaire (rad). */
  tessellation?: { lineaire?: number; angulaire?: number };
}

let partage: Promise<MoteurExact> | null = null;

/** Sous-ensemble de l'API WebAssembly observé (sans dépendre de la bibliothèque DOM du compilateur). */
interface MemoireWasm { readonly buffer: ArrayBuffer }
interface ApiWasm {
  instantiate: (...a: unknown[]) => Promise<unknown>;
  instantiateStreaming?: (...a: unknown[]) => Promise<unknown>;
  Instance: abstract new (...a: never[]) => { readonly exports: Record<string, unknown> };
  Memory: abstract new (...a: never[]) => MemoireWasm;
}

/** Mémoires linéaires des instances WebAssembly du noyau, relevées à leur instanciation (EX-062). */
const memoires: MemoireWasm[] = [];

/**
 * Relève la mémoire linéaire exportée par les instances WebAssembly créées pendant `f` (le module d'occt-wasm ne
 * l'expose pas) : `WebAssembly.instantiate` / `instantiateStreaming` sont observés le temps du chargement seulement,
 * puis rendus tels quels. Rien n'est modifié dans l'instance ; sans WebAssembly observable, rien n'est relevé.
 */
async function avecReleveMemoire<T>(f: () => Promise<T>): Promise<T> {
  const W = (globalThis as unknown as { WebAssembly?: ApiWasm }).WebAssembly;
  if (!W) return f();
  const instantiate = W.instantiate, streaming = W.instantiateStreaming;
  const noter = (r: unknown) => {
    const instance = r instanceof W.Instance ? r : (r as { instance?: unknown } | null)?.instance;
    if (instance instanceof W.Instance) for (const v of Object.values(instance.exports)) if (v instanceof W.Memory && !memoires.includes(v)) memoires.push(v);
    return r;
  };
  W.instantiate = (...a: unknown[]) => instantiate.apply(W, a).then(noter);
  if (streaming) W.instantiateStreaming = (...a: unknown[]) => streaming.apply(W, a).then(noter);
  try { return await f(); } finally {
    W.instantiate = instantiate;
    if (streaming) W.instantiateStreaming = streaming;
  }
}

export class MoteurExact {
  private constructor(private readonly k: OcctKernel, private readonly tess: { lineaire: number; angulaire: number }) {}

  /**
   * Instances du noyau compilées et initialisées dans ce contexte (processus ou Worker) depuis son chargement : suivi de
   * l'instance unique (EX-062, TR-EX-062) — un second noyau n'est initialisé que par `charger(…, false)`, explicitement.
   */
  static instancesCreees = 0;

  /**
   * Allocations WebAssembly mesurables (EX-062) : taille courante de la mémoire linéaire des instances du noyau
   * (`WebAssembly.Memory.buffer.byteLength`, octets) — elle croît avec les allocations d'OCCT et ne rétrécit jamais.
   * null : non évaluée (aucune mémoire relevée dans ce contexte).
   */
  static memoireWasmOctets(): number | null {
    return memoires.length ? memoires.reduce((n, m) => n + m.buffer.byteLength, 0) : null;
  }

  /** Charge le noyau (une seule fois par processus si `partage`). Jamais appelé au chemin d'ouverture. */
  static async charger(options: OptionsMoteur = {}, partager = true): Promise<MoteurExact> {
    const creer = async () => {
      const k = await avecReleveMemoire(() => OcctKernel.init(options.wasm !== undefined ? { wasm: options.wasm } : {}));
      MoteurExact.instancesCreees += 1;
      return new MoteurExact(k, { lineaire: options.tessellation?.lineaire ?? 0.005, angulaire: options.tessellation?.angulaire ?? 0.3 });
    };
    if (!partager) return creer();
    if (!partage) partage = creer().catch((e) => { partage = null; throw e; });
    return partage;
  }

  /** Exécute une opération validée ; le résultat est reproductible pour un même binaire. */
  executer(brut: unknown): SolideExact {
    const op = validerOperation(brut);
    const k = this.k;
    const liberer: ShapeHandle[] = [];
    const garder = (s: ShapeHandle) => { liberer.push(s); return s; };
    try {
      let forme: ShapeHandle;
      switch (op.type) {
        case "extrusion": forme = this.extruder(op.extrusion, garder); break;
        case "revolution": {
          const face = garder(this.facePlane(op.profil, [], op.z0 ?? 0, garder));
          forme = garder(k.revolve(face, { point: { x: op.axe.a.x, y: op.axe.a.y, z: op.z0 ?? 0 }, direction: { x: op.axe.b.x - op.axe.a.x, y: op.axe.b.y - op.axe.a.y, z: 0 } }, (op.angleDeg * Math.PI) / 180));
          break;
        }
        case "balayage": {
          const profil = garder(this.fil3(op.profil, true, garder));
          const spine = garder(this.fil3(op.trajet, false, garder));
          forme = garder(k.sweepPipeShell(profil, spine, false, false));
          break;
        }
        case "lissage": {
          const fils = op.profils.map((p) => garder(this.fil3(p, true, garder)));
          forme = garder(k.loft(fils, true, op.regle));
          break;
        }
        case "booleen": {
          const a = this.operande(op.a, garder), b = this.operande(op.b, garder);
          forme = garder(op.op === "union" ? k.fuse(a, b) : op.op === "soustraction" ? k.cut(a, b) : k.common(a, b));
          break;
        }
        case "trou": {
          const s = this.operande(op.solide, garder);
          const L = Math.hypot(op.direction.x, op.direction.y, op.direction.z);
          const d = { x: op.direction.x / L, y: op.direction.y / L, z: op.direction.z / L };
          const bb = k.getBoundingBox(s);
          const diag = Math.hypot(bb.xmax - bb.xmin, bb.ymax - bb.ymin, bb.zmax - bb.zmin) + 1;
          const prof = op.profondeur ?? diag;
          // Cylindre = extrusion d'un disque perpendiculaire à la direction, depuis le centre (un peu en arrière pour traverser la face).
          const recul = op.profondeur === null ? diag / 2 : 1e-3;
          const centre = { x: op.centre.x - d.x * recul, y: op.centre.y - d.y * recul, z: op.centre.z - d.z * recul };
          const disque = garder(k.makeFace(garder(k.makeWire([garder(k.makeCircleEdge(centre, d, op.diametre / 2))]))));
          const long = prof + recul;
          const cyl = garder(k.extrude(disque, d.x * long, d.y * long, d.z * long));
          forme = garder(k.cut(s, cyl));
          break;
        }
        case "coque": {
          // Coque = solide − son décalage intérieur (jointure par intersection : arêtes vives). Dessus ouvert : la cavité
          // est prolongée vers le haut de deux épaisseurs (union avec sa translation), ce qui retire la paroi supérieure.
          // (`shell` du noyau inverse le sens de l'épaisseur selon la jointure : non retenu, constat du lot P2-1.)
          const s0 = this.operande(op.solide, garder);
          const s = garder(this.unSolide(s0, garder));
          let cavite = garder(k.offset(s, -op.epaisseur, 1e-4, JoinType.Intersection));
          if (op.ouvrirDessus) cavite = garder(k.fuse(cavite, garder(k.translate(cavite, 0, 0, 2 * op.epaisseur))));
          forme = garder(k.cut(s, cavite));
          break;
        }
        case "surface": {
          const nappe = garder(k.bsplineSurface(op.controle, op.lignes, op.colonnes));
          forme = garder(k.thicken(nappe, op.epaisseur, 1e-4));
          break;
        }
        case "nurbs": {
          // Face NURBS exacte écrite en BREP texte (pôles, poids, nœuds), relue par le noyau puis épaissie (normale ∂S/∂u × ∂S/∂v).
          const face = garder(k.fromBREP(brepTexteNurbs(op.nurbs)));
          if (!k.isValid(face)) throw new ErreurExacte("nurbs", "surface invalide (noyau)");
          forme = garder(k.thicken(face, op.epaisseur, 1e-6));
          break;
        }
        case "polyedre": {
          // Faces planes triangulaires cousues puis fermées en solide (représentation exacte du polyèdre donné).
          const faces = op.triangles.map(([a, b, c]) => {
            const [A, B, C] = [op.sommets[a]!, op.sommets[b]!, op.sommets[c]!];
            return garder(k.makeFace(garder(k.makeWire([garder(k.makeLineEdge(A, B)), garder(k.makeLineEdge(B, C)), garder(k.makeLineEdge(C, A))]))));
          });
          forme = garder(k.sewAndSolidify(faces, 1e-6));
          break;
        }
        case "patch": {
          const fil = garder(this.fil3(op.contour, true, garder));
          const face = garder(k.makeNonPlanarFace(fil));
          forme = garder(k.thicken(face, op.epaisseur, 1e-4));
          break;
        }
        case "conge": {
          const s = garder(this.unSolide(this.operande(op.solide, garder), garder));
          const aretes = k.getSubShapes(s, "edge").map(garder);
          if (!aretes.length) throw new ErreurExacte("solide", "aucune arête");
          try { forme = garder(k.fillet(s, aretes, op.rayon)); }
          catch (e) { throw new ErreurExacte("rayon", `congé impossible (rayon ${op.rayon} m trop grand pour ce solide ?) : ${(e as Error).message}`); }
          break;
        }
        case "import-step": {
          const tout = garder(k.importStep(op.step));
          const sols = k.getSubShapes(tout, "solid");
          if (op.solide !== undefined) {
            if (op.solide >= sols.length) throw new ErreurExacte("solide", `rang ${op.solide} hors du fichier (${sols.length} solide(s))`);
            forme = garder(sols[op.solide]!);
          } else if (sols.length > 1) throw new ErreurExacte("solide", `${sols.length} solides dans le fichier : importez-les un par un (champ « solide »)`);
          else forme = tout;
          break;
        }
      }
      return this.solide(forme);
    } finally {
      for (const s of liberer) { try { k.release(s); } catch { /* déjà libéré */ } }
    }
  }

  /** Fichier STEP AP242 (texte) d'un brep, posé si une pose est donnée. */
  exporterStep(brepBase64: string, poseBrut?: unknown): string {
    const liberer: ShapeHandle[] = [];
    const garder = (s: ShapeHandle) => { liberer.push(s); return s; };
    try {
      const ps = pose(poseBrut, "pose");
      const b = brep(brepBase64, "brep");
      const s = this.operande(ps ? { brep: b, pose: ps } : { brep: b }, garder);
      return this.k.exportStep(s);
    } finally { for (const s of liberer) { try { this.k.release(s); } catch { /* déjà libéré */ } } }
  }

  /**
   * Fichier STEP **nommé** (assemblage XCAF, schéma AP214 `AUTOMOTIVE_DESIGN` écrit par OCCT) : un produit par pièce,
   * nommé par `nom`, fait d'un ou plusieurs solides (extrusion d'un contour, lissage réglé entre deux contours 3D, brep
   * existant), juxtaposés sans fusion. Géométrie reçue en **mètres** (repère local) ; OCCT écrit le STEP en millimètres
   * (`SI_UNIT(.MILLI.,.METRE.)`) : la géométrie est mise à l'échelle × 1 000 avant l'écriture, l'unité déclarée est donc
   * exacte. L'horodatage de l'en-tête (`FILE_NAME`) est remplacé par `horodatage` (reproductible) et le nom du fichier
   * par `nomFichier`. Lève `ErreurExacte` sur une entrée mal formée.
   */
  exporterStepPieces(piecesBrutes: unknown, options: { horodatage: string; nomFichier: string }): string {
    const pieces = validerPiecesStep(piecesBrutes);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(options.horodatage)) throw new ErreurExacte("horodatage", "AAAA-MM-JJTHH:MM:SS attendu");
    if (!NOM_STEP.test(options.nomFichier)) throw new ErreurExacte("nomFichier", "nom ASCII imprimable sans apostrophe ni barre oblique inverse attendu");
    const liberer: ShapeHandle[] = [];
    const garder = (s: ShapeHandle) => { liberer.push(s); return s; };
    const doc = this.k.createXCAFDocument();
    try {
      for (const p of pieces) {
        const formes = p.solides.map((s) => ("lissage" in s ? garder(this.k.loft(s.lissage.map((c) => garder(this.fil3(c, true, garder))), true, true)) : this.operande(s, garder)));
        const forme = formes.length === 1 ? formes[0]! : garder(this.k.makeCompound(formes));
        doc.addShape(garder(this.k.scale(forme, { x: 0, y: 0, z: 0 }, 1000)), { name: p.nom });
      }
      const step = doc.exportSTEP();
      const entete = /FILE_NAME\('(?:[^']|'')*','[^']*'/;
      if (!entete.test(step)) throw new ErreurExacte("resultat", "en-tête FILE_NAME absent du STEP écrit");
      return step.replace(entete, `FILE_NAME('${options.nomFichier}','${options.horodatage}'`);
    } finally {
      doc.close();
      for (const s of liberer) { try { this.k.release(s); } catch { /* déjà libéré */ } }
    }
  }

  /**
   * Relit un STEP nommé (XCAF) : par produit racine, son nom, son nombre de solides, son volume (m³) et sa boîte
   * englobante (m), l'unité du fichier étant convertie par OCCT. Sert au contrôle d'aller-retour de l'export.
   */
  lireStepPieces(step: string): PieceStepLue[] {
    if (typeof step !== "string" || !/^ISO-10303-21;/.test(step.trimStart())) throw new ErreurExacte("step", "fichier STEP (ISO-10303-21) attendu");
    const doc = this.k.importXCAFFromSTEP(step);
    try {
      return doc.getRoots().map((r) => {
        const info = doc.getLabelInfo(r);
        const s = info.shapeHandle;
        if (s === null || s === undefined) return { nom: info.name, solides: 0, volume: 0, boite: null };
        try {
          const b = this.k.getBoundingBox(s);
          return {
            nom: info.name, solides: this.k.getSubShapes(s, "solid").length, volume: this.k.getVolume(s) / 1e9,
            boite: { min: { x: b.xmin / 1000, y: b.ymin / 1000, z: b.zmin / 1000 }, max: { x: b.xmax / 1000, y: b.ymax / 1000, z: b.zmax / 1000 } },
          };
        } finally { try { this.k.release(s); } catch { /* déjà libéré */ } }
      });
    } finally { doc.close(); }
  }

  /** Maillage seul d'un brep (relecture, documents). */
  /** Nombre de solides d'un fichier STEP (un `solide-exact` par solide à l'import ; 0 si le fichier n'en contient aucun). */
  compterSolidesStep(step: string): number {
    const op = validerOperation({ type: "import-step", step }) as { step: string };
    const s = this.k.importStep(op.step);
    try { return this.k.getSubShapes(s, "solid").length; } finally { this.k.release(s); }
  }

  mailler(brepBase64: string): MaillageExact {
    const s = this.k.fromBREPBinary(depuisBase64(brep(brepBase64, "brep")));
    try { return this.maillage(s); } finally { this.k.release(s); }
  }

  private solide(forme: ShapeHandle): SolideExact {
    const k = this.k;
    if (!k.isValid(forme)) throw new ErreurExacte("resultat", "résultat invalide (noyau)");
    const solides = k.getSubShapes(forme, "solid").length;
    const faces = k.getSubShapes(forme, "face").length;
    if (!solides || !faces) throw new ErreurExacte("resultat", "résultat vide : aucun solide");
    const octets = k.toBREPBinary(forme);
    return { brep: versBase64(octets), maillage: this.maillage(forme), volume: k.getVolume(forme), aire: k.getSurfaceArea(forme), faces, solides, moteur: MOTEUR_EXACT, versionMoteur: VERSION_MOTEUR_EXACT, empreinte: empreinteOctets(octets) };
  }

  private maillage(forme: ShapeHandle): MaillageExact {
    const m = this.k.tessellate(forme, { linearDeflection: this.tess.lineaire, angularDeflection: this.tess.angulaire });
    return { positions: Array.from(m.positions), indices: Array.from(m.indices) };
  }

  private facePlane(profil: Point2[], trous: Point2[][], z: number, garder: (s: ShapeHandle) => ShapeHandle): ShapeHandle {
    const k = this.k;
    const fil = (pts: Point2[]) => garder(k.makeWire(pts.map((p, i) => { const q = pts[(i + 1) % pts.length]!; return garder(k.makeLineEdge({ x: p.x, y: p.y, z }, { x: q.x, y: q.y, z })); })));
    let face = garder(k.makeFace(fil(profil)));
    if (trous.length) face = garder(k.addHolesInFace(face, trous.map(fil)));
    return face;
  }

  private fil3(pts: Point3[], ferme: boolean, garder: (s: ShapeHandle) => ShapeHandle): ShapeHandle {
    const k = this.k;
    const n = ferme ? pts.length : pts.length - 1;
    const aretes: ShapeHandle[] = [];
    for (let i = 0; i < n; i++) { const a = pts[i]!, b = pts[(i + 1) % pts.length]!; if (Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < 1e-9) continue; aretes.push(garder(k.makeLineEdge(a, b))); }
    if (!aretes.length) throw new ErreurExacte("profil", "fil dégénéré");
    return garder(k.makeWire(aretes));
  }

  private extruder(e: Extrusion, garder: (s: ShapeHandle) => ShapeHandle): ShapeHandle {
    return garder(this.k.extrude(this.facePlane(e.profil, e.trous ?? [], e.z0, garder), 0, 0, e.hauteur));
  }

  private operande(o: OperandeExacte, garder: (s: ShapeHandle) => ShapeHandle): ShapeHandle {
    if (!("brep" in o)) return this.extruder(o.extrusion, garder);
    let s = garder(this.k.fromBREPBinary(depuisBase64(o.brep)));
    if (o.pose) {
      // Pose du modèle : rotation autour de z (origine) puis translation — même convention que `positionsPosees`.
      if (Math.abs(o.pose.angleDeg) > 1e-12) s = garder(this.k.rotate(s, { point: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 0, z: 1 } }, (o.pose.angleDeg * Math.PI) / 180));
      if (Math.abs(o.pose.x) > 1e-12 || Math.abs(o.pose.y) > 1e-12) s = garder(this.k.translate(s, o.pose.x, o.pose.y, 0));
    }
    return s;
  }

  /** `fuse` rend un compound même connexe (constat du banc) : la coque et le congé exigent un solide. */
  private unSolide(forme: ShapeHandle, garder: (s: ShapeHandle) => ShapeHandle): ShapeHandle {
    const sol = this.k.getSubShapes(forme, "solid");
    if (sol.length !== 1) throw new ErreurExacte("solide", sol.length ? "plusieurs solides : fusionnez-les d'abord" : "aucun solide");
    return garder(sol[0]!);
  }
}

/** Recalcule une opération et dit si elle reproduit le résultat annoncé (empreinte du brep). */
export function memeResultat(obtenu: SolideExact, annonce: Pick<SolideExact, "empreinte">): boolean {
  return obtenu.empreinte === annonce.empreinte;
}
