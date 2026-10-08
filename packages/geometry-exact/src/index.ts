/**
 * Noyau exact (P2-1, D-177) — pur, sans interface.
 *
 * Opérations B-rep exécutées par OCCT compilé en WebAssembly (`occt-wasm`) : révolution, extrusion, balayage,
 * lissage, booléens, trou, coque, import STEP. Un résultat est un `SolideExact` : représentation canonique **brep**
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
  | { type: "import-step"; step: string };

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
    case "import-step": {
      const s = o["step"];
      if (typeof s !== "string" || !/^ISO-10303-21;/.test(s.trimStart())) throw new ErreurExacte("step", "fichier STEP (ISO-10303-21) attendu");
      if (s.length > 64 * 1024 * 1024) throw new ErreurExacte("step", "fichier trop volumineux (64 Mo au plus)");
      return { type: "import-step", step: s };
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
// Moteur
// ---------------------------------------------------------------------------

export interface OptionsMoteur {
  /** Binaire `.wasm` : octets, ou URL / chemin ; absent : localisé à côté du module (Node). */
  wasm?: string | URL | ArrayBuffer | Uint8Array;
  /** Déflexion linéaire de la tessellation (m) ; angulaire (rad). */
  tessellation?: { lineaire?: number; angulaire?: number };
}

let partage: Promise<MoteurExact> | null = null;

export class MoteurExact {
  private constructor(private readonly k: OcctKernel, private readonly tess: { lineaire: number; angulaire: number }) {}

  /** Charge le noyau (une seule fois par processus si `partage`). Jamais appelé au chemin d'ouverture. */
  static async charger(options: OptionsMoteur = {}, partager = true): Promise<MoteurExact> {
    const creer = async () => new MoteurExact(await OcctKernel.init(options.wasm !== undefined ? { wasm: options.wasm } : {}), { lineaire: options.tessellation?.lineaire ?? 0.005, angulaire: options.tessellation?.angulaire ?? 0.3 });
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
        case "import-step":
          forme = garder(k.importStep(op.step));
          break;
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

  /** Maillage seul d'un brep (relecture, documents). */
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
