/**
 * (Cas 4, lot C4, étape 7 : D10-F14-038, D10-F14-036, D10-F23a-012) Formats 3D des fabricants, lus sans bibliothèque :
 * glTF 2.0 (`.gltf` à tampons intégrés, `.glb`), PLY (texte et binaire), 3MF, COLLADA (`.dae`) et 3DS. Chaque format
 * donne une scène : des objets (maillage triangulé dans l'unité et les axes du fichier, pose dans la hiérarchie,
 * matière lue : nom et couleur), l'unité et l'axe vertical quand le fichier les porte. L'utilisateur confirme l'unité et
 * l'axe vertical (Y ou Z) avant la pose. Un maillage posé plusieurs fois par des poses rigides devient un composant
 * (une définition, plusieurs occurrences) ; sinon chaque pose est un groupe. Les textures, normales, couleurs par
 * sommet, animations et caméras ne sont pas lues (déclaré). FBX, 3DM et USD sont refusés avec leur motif : leur lecture
 * demande une bibliothèque (ajout prévu plus tard, sur accord du maître d'ouvrage du 27 novembre 2026).
 * Pur : ni DOM, ni React.
 */
import { construireMaillageImporte, modifierAnnotations, poserObjetsImportes, type ContenuImporte, type Id, type Matrice4, type Modele, type ObjetImportePose } from "./geometrie-libre.js";
import { ErreurImport, lireMaillages, trianglesDuMaillage, type MaillageLu } from "./echanges-import.js";
import { lireZip } from "./zip.js";
import { chemin, descendants, enfant, enfants, lireXml, nombresXml, type NoeudXml } from "./xml-mini.js";

export type FormatFabricant = "gltf" | "glb" | "ply" | "3mf" | "dae" | "3ds";
export const FORMATS_FABRICANTS: readonly FormatFabricant[] = ["glb", "gltf", "3mf", "dae", "3ds", "ply"];
/** Formats reconnus mais refusés (motif dit à l'utilisateur). */
export type FormatRefuse = "fbx" | "3dm" | "usd";
export type AxeHaut = "z" | "y";

/** Ce qu'un lecteur a laissé de côté (dit à l'utilisateur, jamais silencieux). */
export type OmisScene = "textures" | "animations" | "primitives-non-triangulees" | "couleurs-sommet" | "matieres-triangle" | "composants-externes" | "geometries-non-maillees" | "polygones-trous" | "maillages-animes" | "transformations-ignorees";

export interface MatiereLue {
  readonly nom: string;
  /** `#rrggbb` (sRGB). */
  readonly couleur: string;
}

export interface ObjetScene {
  readonly nom: string;
  /** Coordonnées locales du maillage, unité du fichier, 3 par sommet. */
  readonly positions: readonly number[];
  readonly triangles: readonly number[];
  /** Pose dans la scène (lignes, unité et axes du fichier). */
  readonly pose: Matrice4;
  /** Clé de `LectureScene.matieres`. */
  readonly matiere?: string;
  /** Même clé = même maillage posé plusieurs fois. */
  readonly cle: string;
}

export interface LectureScene {
  readonly format: FormatFabricant;
  readonly objets: readonly ObjetScene[];
  readonly matieres: Readonly<Record<string, MatiereLue>>;
  /** Mètres par unité lus dans le fichier ; null = non porté (choisi par l'utilisateur). */
  readonly uniteFichier: number | null;
  /** Axe vertical lu ; null = non porté (choisi par l'utilisateur). */
  readonly axeFichier: AxeHaut | null;
  /** Ce qui a été laissé de côté, dit à l'utilisateur (codes traduits par l'interface). */
  readonly omis: readonly OmisScene[];
}

const IDENT: Matrice4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

export function multiplier(a: Matrice4, b: Matrice4): Matrice4 {
  const r = new Array<number>(16).fill(0);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) r[4 * i + j] = (r[4 * i + j] as number) + (a[4 * i + k] as number) * (b[4 * k + j] as number);
  return r;
}

const transposer = (m: readonly number[]): Matrice4 => [0, 1, 2, 3].flatMap((i) => [0, 1, 2, 3].map((j) => m[4 * j + i] as number));

/** Inverse d'une matrice affine (dernière ligne 0 0 0 1) ; null si singulière. */
export function inverserAffine(m: Matrice4): Matrice4 | null {
  const [a, b, c, d, e, f, g, h, i] = [m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]] as number[];
  const det = (a as number) * ((e as number) * (i as number) - (f as number) * (h as number)) - (b as number) * ((d as number) * (i as number) - (f as number) * (g as number)) + (c as number) * ((d as number) * (h as number) - (e as number) * (g as number));
  if (!Number.isFinite(det) || Math.abs(det) < 1e-15) return null;
  const A = a as number, B = b as number, C = c as number, D = d as number, E = e as number, F = f as number, G = g as number, H = h as number, I = i as number;
  const r = [(E * I - F * H) / det, (C * H - B * I) / det, (B * F - C * E) / det, (F * G - D * I) / det, (A * I - C * G) / det, (C * D - A * F) / det, (D * H - E * G) / det, (B * G - A * H) / det, (A * E - B * D) / det];
  const t = [m[3] as number, m[7] as number, m[11] as number];
  const ti = [0, 1, 2].map((k) => -((r[3 * k] as number) * (t[0] as number) + (r[3 * k + 1] as number) * (t[1] as number) + (r[3 * k + 2] as number) * (t[2] as number)));
  return [r[0], r[1], r[2], ti[0], r[3], r[4], r[5], ti[1], r[6], r[7], r[8], ti[2], 0, 0, 0, 1] as number[];
}

/** Rotation pure (orthonormée, déterminant +1) à 1e-6 près, translation quelconque. */
export function estRigide(m: Matrice4): boolean {
  const col = (j: number) => [m[j] as number, m[4 + j] as number, m[8 + j] as number];
  const dot = (u: number[], v: number[]) => (u[0] as number) * (v[0] as number) + (u[1] as number) * (v[1] as number) + (u[2] as number) * (v[2] as number);
  const [x, y, z] = [col(0), col(1), col(2)];
  if ([dot(x, x), dot(y, y), dot(z, z)].some((v) => Math.abs(v - 1) > 1e-6)) return false;
  if ([dot(x, y), dot(y, z), dot(x, z)].some((v) => Math.abs(v) > 1e-6)) return false;
  const det = (x[0] as number) * ((y[1] as number) * (z[2] as number) - (y[2] as number) * (z[1] as number)) - (y[0] as number) * ((x[1] as number) * (z[2] as number) - (x[2] as number) * (z[1] as number)) + (z[0] as number) * ((x[1] as number) * (y[2] as number) - (x[2] as number) * (y[1] as number));
  return det > 0 && m[12] === 0 && m[13] === 0 && m[14] === 0 && m[15] === 1;
}

const translation = (x: number, y: number, z: number): Matrice4 => [1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z, 0, 0, 0, 1];
const echelleM = (x: number, y: number, z: number): Matrice4 => [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1];
function quaternion(x: number, y: number, z: number, w: number): Matrice4 {
  const n = Math.hypot(x, y, z, w) || 1;
  [x, y, z, w] = [x / n, y / n, z / n, w / n];
  return [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w), 0, 2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w), 0, 2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y), 0, 0, 0, 0, 1];
}
function rotationAxe(ax: number, ay: number, az: number, degres: number): Matrice4 {
  const n = Math.hypot(ax, ay, az) || 1;
  const s = Math.sin((degres * Math.PI) / 360);
  return quaternion((ax / n) * s, (ay / n) * s, (az / n) * s, Math.cos((degres * Math.PI) / 360));
}

/** Passage des axes du fichier à ceux du projet (Z vertical) : Y vertical → (x, −z, y). */
export const matriceAxe = (axe: AxeHaut): Matrice4 => (axe === "z" ? IDENT : [1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1]);

const hex2 = (v: number): string => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, "0");
const versHex = (r: number, g: number, b: number): string => `#${hex2(r)}${hex2(g)}${hex2(b)}`;
/** Couleur linéaire (glTF) → sRGB. */
const srgb = (c: number): number => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

// ---------------------------------------------------------------- glTF / GLB

const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
export function decoderBase64(s: string): Uint8Array {
  const propre = s.replace(/[^A-Za-z0-9+/]/g, "");
  const sortie = new Uint8Array(Math.floor((propre.length * 3) / 4));
  let o = 0;
  for (let i = 0; i + 1 < propre.length; i += 4) {
    const q = [0, 1, 2, 3].map((k) => (i + k < propre.length ? BASE64.indexOf(propre[i + k] as string) : -1));
    const n = ((q[0] as number) << 18) | ((q[1] as number) << 12) | (Math.max(0, q[2] as number) << 6) | Math.max(0, q[3] as number);
    if (o < sortie.length) sortie[o++] = (n >> 16) & 255;
    if ((q[2] as number) >= 0 && o < sortie.length) sortie[o++] = (n >> 8) & 255;
    if ((q[3] as number) >= 0 && o < sortie.length) sortie[o++] = n & 255;
  }
  return sortie.slice(0, o);
}

type Json = Record<string, unknown>;
const estObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const tableau = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const nombre = (v: unknown, d: number): number => (typeof v === "number" && Number.isFinite(v) ? v : d);

const EXTENSIONS_REFUSEES: Readonly<Record<string, string>> = {
  KHR_draco_mesh_compression: "maillages compressés Draco",
  EXT_meshopt_compression: "maillages compressés meshopt",
  KHR_mesh_quantization: "positions quantifiées",
};

export function lireGlb(octets: Uint8Array): LectureScene {
  const v = new DataView(octets.buffer, octets.byteOffset, octets.byteLength);
  if (octets.length < 20 || v.getUint32(0, true) !== 0x46546c67) throw new ErreurImport("illisible", "Ce fichier n'est pas un GLB (signature glTF absente).");
  if (v.getUint32(4, true) !== 2) throw new ErreurImport("illisible", `GLB version ${v.getUint32(4, true)} : seule la version 2 est lue.`);
  let json: unknown = null;
  let bin: Uint8Array | null = null;
  for (let p = 12; p + 8 <= octets.length; ) {
    const lg = v.getUint32(p, true);
    const type = v.getUint32(p + 4, true);
    const contenu = octets.subarray(p + 8, p + 8 + lg);
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(contenu));
    else if (type === 0x004e4942 && bin === null) bin = contenu;
    p += 8 + lg;
  }
  if (!estObj(json)) throw new ErreurImport("illisible", "GLB sans bloc JSON.");
  return lireGltfJson(json, bin, "glb");
}

export function lireGltf(texte: string): LectureScene {
  let json: unknown;
  try {
    json = JSON.parse(texte);
  } catch {
    throw new ErreurImport("illisible", "glTF illisible : JSON invalide.");
  }
  if (!estObj(json)) throw new ErreurImport("illisible", "glTF illisible.");
  return lireGltfJson(json, null, "gltf");
}

function lireGltfJson(g: Json, bin: Uint8Array | null, format: "gltf" | "glb"): LectureScene {
  const version = estObj(g["asset"]) ? String(g["asset"]["version"] ?? "") : "";
  if (!version.startsWith("2")) throw new ErreurImport("illisible", `glTF version « ${version || "absente"} » : seule la version 2.0 est lue.`);
  for (const e of tableau(g["extensionsRequired"])) {
    const motif = EXTENSIONS_REFUSEES[String(e)];
    if (motif) throw new ErreurImport("illisible", `glTF à ${motif} (${String(e)}) : non lu sans bibliothèque. Exportez le fichier sans compression.`);
  }
  const tampons = tableau(g["buffers"]).map((b, i): Uint8Array => {
    const uri = estObj(b) ? b["uri"] : undefined;
    if (typeof uri !== "string") {
      if (bin) return bin;
      throw new ErreurImport("illisible", `Tampon glTF ${i} sans données.`);
    }
    const m = /^data:[^,]*;base64,(.*)$/s.exec(uri);
    if (!m) throw new ErreurImport("illisible", `Ressource externe « ${uri} » : choisissez le .glb ou un .gltf aux tampons intégrés.`);
    return decoderBase64(m[1] as string);
  });
  const vues = tableau(g["bufferViews"]);
  const accesseurs = tableau(g["accessors"]);
  const lireAccesseur = (index: unknown, attendu: "VEC3" | "SCALAR"): number[] => {
    const a = accesseurs[nombre(index, -1)];
    if (!estObj(a)) throw new ErreurImport("illisible", "Accesseur glTF absent.");
    if (a["sparse"] !== undefined) throw new ErreurImport("illisible", "Accesseur glTF clairsemé : non lu.");
    if (a["type"] !== attendu) throw new ErreurImport("illisible", `Accesseur glTF de type ${String(a["type"])} au lieu de ${attendu}.`);
    const n = nombre(a["count"], 0);
    const comp = attendu === "VEC3" ? 3 : 1;
    const ct = nombre(a["componentType"], 0);
    const taille = ct === 5126 || ct === 5125 ? 4 : ct === 5123 || ct === 5122 ? 2 : ct === 5121 || ct === 5120 ? 1 : 0;
    if (taille === 0) throw new ErreurImport("illisible", `Type de composante glTF ${ct} inconnu.`);
    const vue = vues[nombre(a["bufferView"], -1)];
    if (!estObj(vue)) return new Array<number>(n * comp).fill(0);
    const tampon = tampons[nombre(vue["buffer"], -1)];
    if (!tampon) throw new ErreurImport("illisible", "Tampon glTF absent.");
    const debut = nombre(vue["byteOffset"], 0) + nombre(a["byteOffset"], 0);
    const pas = nombre(vue["byteStride"], 0) || taille * comp;
    const dv = new DataView(tampon.buffer, tampon.byteOffset, tampon.byteLength);
    if (debut + pas * (n - 1) + taille * comp > tampon.byteLength) throw new ErreurImport("illisible", "Accesseur glTF hors de son tampon.");
    const r = new Array<number>(n * comp);
    for (let k = 0; k < n; k++)
      for (let c = 0; c < comp; c++) {
        const o = debut + k * pas + c * taille;
        r[k * comp + c] = ct === 5126 ? dv.getFloat32(o, true) : ct === 5125 ? dv.getUint32(o, true) : ct === 5123 ? dv.getUint16(o, true) : ct === 5122 ? dv.getInt16(o, true) : ct === 5121 ? dv.getUint8(o) : dv.getInt8(o);
      }
    return r;
  };
  const matieres: Record<string, MatiereLue> = {};
  tableau(g["materials"]).forEach((m, i) => {
    if (!estObj(m)) return;
    const pbr = estObj(m["pbrMetallicRoughness"]) ? m["pbrMetallicRoughness"] : {};
    const f = tableau(pbr["baseColorFactor"]).map((x) => nombre(x, 1));
    matieres[`g${i}`] = { nom: typeof m["name"] === "string" && m["name"].trim() !== "" ? m["name"].trim() : `Matière ${i + 1}`, couleur: versHex(srgb(f[0] ?? 1), srgb(f[1] ?? 1), srgb(f[2] ?? 1)) };
  });
  const omis = new Set<OmisScene>();
  if (tableau(g["textures"]).length > 0) omis.add("textures");
  if (tableau(g["animations"]).length > 0) omis.add("animations");
  const noeuds = tableau(g["nodes"]);
  const maillages = tableau(g["meshes"]);
  const objets: ObjetScene[] = [];
  const poseNoeud = (n: Json): Matrice4 => {
    if (Array.isArray(n["matrix"]) && n["matrix"].length === 16) return transposer(n["matrix"].map((x) => nombre(x, 0)));
    const t = tableau(n["translation"]).map((x) => nombre(x, 0));
    const r = tableau(n["rotation"]).map((x) => nombre(x, 0));
    const s = tableau(n["scale"]).map((x) => nombre(x, 1));
    return multiplier(multiplier(translation(t[0] ?? 0, t[1] ?? 0, t[2] ?? 0), r.length === 4 ? quaternion(r[0] as number, r[1] as number, r[2] as number, r[3] as number) : IDENT), echelleM(s[0] ?? 1, s[1] ?? 1, s[2] ?? 1));
  };
  const visites = new Set<number>();
  const parcourir = (index: number, parent: Matrice4, profondeur: number) => {
    const n = noeuds[index];
    if (!estObj(n) || profondeur > 64) return;
    if (visites.has(index)) throw new ErreurImport("illisible", "Hiérarchie glTF cyclique.");
    visites.add(index);
    const pose = multiplier(parent, poseNoeud(n));
    const im = typeof n["mesh"] === "number" ? n["mesh"] : -1;
    const mesh = maillages[im];
    if (estObj(mesh)) {
      const prims = tableau(mesh["primitives"]);
      prims.forEach((p, ip) => {
        if (!estObj(p)) return;
        const mode = nombre(p["mode"], 4);
        if (mode < 4 || mode > 6) {
          omis.add("primitives-non-triangulees");
          return;
        }
        const attr = estObj(p["attributes"]) ? p["attributes"] : {};
        if (attr["POSITION"] === undefined) return;
        if (attr["COLOR_0"] !== undefined) omis.add("couleurs-sommet");
        const positions = lireAccesseur(attr["POSITION"], "VEC3");
        const nb = positions.length / 3;
        const brut = p["indices"] !== undefined ? lireAccesseur(p["indices"], "SCALAR") : Array.from({ length: nb }, (_, k) => k);
        const triangles: number[] = [];
        if (mode === 4) for (let k = 0; k + 2 < brut.length; k += 3) triangles.push(brut[k] as number, brut[k + 1] as number, brut[k + 2] as number);
        else if (mode === 5) for (let k = 0; k + 2 < brut.length; k++) triangles.push(...(k % 2 === 0 ? [brut[k], brut[k + 1], brut[k + 2]] : [brut[k + 1], brut[k], brut[k + 2]]) as number[]);
        else for (let k = 1; k + 1 < brut.length; k++) triangles.push(brut[0] as number, brut[k] as number, brut[k + 1] as number);
        if (triangles.some((x) => x < 0 || x >= nb)) throw new ErreurImport("illisible", "Indices glTF hors des sommets.");
        const mat = typeof p["material"] === "number" && matieres[`g${p["material"]}`] ? `g${p["material"]}` : undefined;
        const base = (typeof n["name"] === "string" && n["name"].trim()) || (typeof mesh["name"] === "string" && mesh["name"].trim()) || `Objet ${objets.length + 1}`;
        const nom = prims.length > 1 ? `${base} / ${mat ? (matieres[mat] as MatiereLue).nom : ip + 1}` : base;
        objets.push({ nom, positions, triangles, pose, cle: `m${im}p${ip}`, ...(mat ? { matiere: mat } : {}) });
      });
    }
    for (const c of tableau(n["children"])) if (typeof c === "number") parcourir(c, pose, profondeur + 1);
    visites.delete(index);
  };
  const scenes = tableau(g["scenes"]);
  const scene = scenes[nombre(g["scene"], 0)];
  let racines: number[];
  if (estObj(scene)) racines = tableau(scene["nodes"]).filter((x): x is number => typeof x === "number");
  else {
    const enfantsDe = new Set(noeuds.flatMap((n) => (estObj(n) ? tableau(n["children"]) : [])));
    racines = noeuds.map((_, i) => i).filter((i) => !enfantsDe.has(i));
  }
  for (const r of racines) parcourir(r, IDENT, 0);
  return { format, objets, matieres, uniteFichier: 1, axeFichier: "y", omis: [...omis] };
}

// ---------------------------------------------------------------- PLY

export function lirePly(octets: Uint8Array): LectureScene {
  const tete = new TextDecoder("latin1").decode(octets.subarray(0, Math.min(octets.length, 65536)));
  const fin = /end_header\r?\n/.exec(tete);
  if (!tete.startsWith("ply") || !fin) throw new ErreurImport("illisible", "Ce fichier n'est pas un PLY (en-tête absent).");
  const lignes = tete.slice(0, fin.index).split(/\r?\n/).map((l) => l.trim());
  const fmt = /^format\s+(\S+)/.exec(lignes.find((l) => l.startsWith("format")) ?? "")?.[1];
  if (fmt !== "ascii" && fmt !== "binary_little_endian" && fmt !== "binary_big_endian") throw new ErreurImport("illisible", `Format PLY « ${fmt ?? "absent"} » inconnu.`);
  type Prop = { nom: string; type: string; liste?: { compte: string; type: string } };
  const elements: { nom: string; nombre: number; props: Prop[] }[] = [];
  for (const l of lignes) {
    const m = l.split(/\s+/);
    if (m[0] === "element") elements.push({ nom: m[1] as string, nombre: Number(m[2]), props: [] });
    else if (m[0] === "property" && elements.length > 0) {
      const e = elements[elements.length - 1] as (typeof elements)[number];
      if (m[1] === "list") e.props.push({ nom: m[4] as string, type: m[3] as string, liste: { compte: m[2] as string, type: m[3] as string } });
      else e.props.push({ nom: m[2] as string, type: m[1] as string });
    }
  }
  const TAILLES: Record<string, number> = { char: 1, int8: 1, uchar: 1, uint8: 1, short: 2, int16: 2, ushort: 2, uint16: 2, int: 4, int32: 4, uint: 4, uint32: 4, float: 4, float32: 4, double: 8, float64: 8 };
  const positions: number[] = [];
  const triangles: number[] = [];
  const debut = new TextEncoder().encode(tete.slice(0, fin.index + fin[0].length)).length;
  const corps = octets.subarray(debut);
  const ve = elements.find((e) => e.nom === "vertex");
  if (!ve) throw new ErreurImport("illisible", "PLY sans élément vertex.");
  const ix = ["x", "y", "z"].map((c) => ve.props.findIndex((p) => p.nom === c && !p.liste));
  if (ix.some((i) => i < 0)) throw new ErreurImport("illisible", "PLY sans coordonnées x, y, z.");
  const nomListe = (p: Prop) => p.liste && (p.nom === "vertex_indices" || p.nom === "vertex_index");
  const ajouterFace = (ids: number[]) => {
    for (let k = 1; k + 1 < ids.length; k++) triangles.push(ids[0] as number, ids[k] as number, ids[k + 1] as number);
  };
  if (fmt === "ascii") {
    const jetons = new TextDecoder().decode(corps).split(/\s+/).filter((x) => x !== "");
    let j = 0;
    for (const e of elements)
      for (let k = 0; k < e.nombre; k++)
        for (const p of e.props) {
          if (p.liste) {
            const n = Number(jetons[j++]);
            const ids = jetons.slice(j, j + n).map(Number);
            j += n;
            if (e.nom === "face" && nomListe(p)) ajouterFace(ids);
          } else {
            const v = Number(jetons[j++]);
            if (e === ve) {
              const c = ix.indexOf(e.props.indexOf(p));
              if (c >= 0) positions.push(v);
            }
          }
        }
    if (j > jetons.length) throw new ErreurImport("illisible", "PLY tronqué.");
  } else {
    const le = fmt === "binary_little_endian";
    const dv = new DataView(corps.buffer, corps.byteOffset, corps.byteLength);
    let o = 0;
    const lire = (type: string): number => {
      const t = TAILLES[type];
      if (t === undefined) throw new ErreurImport("illisible", `Type PLY « ${type} » inconnu.`);
      if (o + t > dv.byteLength) throw new ErreurImport("illisible", "PLY tronqué.");
      const v = type === "char" || type === "int8" ? dv.getInt8(o) : type === "uchar" || type === "uint8" ? dv.getUint8(o) : type === "short" || type === "int16" ? dv.getInt16(o, le) : type === "ushort" || type === "uint16" ? dv.getUint16(o, le) : type === "int" || type === "int32" ? dv.getInt32(o, le) : type === "uint" || type === "uint32" ? dv.getUint32(o, le) : type === "float" || type === "float32" ? dv.getFloat32(o, le) : dv.getFloat64(o, le);
      o += t;
      return v;
    };
    for (const e of elements)
      for (let k = 0; k < e.nombre; k++)
        for (const p of e.props) {
          if (p.liste) {
            const n = lire(p.liste.compte);
            const ids: number[] = [];
            for (let q = 0; q < n; q++) ids.push(lire(p.liste.type));
            if (e.nom === "face" && nomListe(p)) ajouterFace(ids);
          } else {
            const v = lire(p.type);
            if (e === ve) {
              const c = ix.indexOf(e.props.indexOf(p));
              if (c >= 0) positions.push(v);
            }
          }
        }
  }
  // Les coordonnées sont rangées dans l'ordre des propriétés : on les remet en x, y, z.
  const ordre = [...ix].sort((a, b) => a - b).map((i) => ix.indexOf(i));
  const xyz: number[] = new Array<number>(positions.length);
  for (let k = 0; k < positions.length; k += 3) for (let c = 0; c < 3; c++) xyz[k + (ordre[c] as number)] = positions[k + c] as number;
  const nb = xyz.length / 3;
  if (triangles.some((x) => x < 0 || x >= nb)) throw new ErreurImport("illisible", "Indices PLY hors des sommets.");
  if (triangles.length === 0) throw new ErreurImport("vide", `PLY sans faces (${nb.toLocaleString("fr-CH")} points) : c'est un nuage de points, à poser par la tranche de nuage.`);
  return { format: "ply", objets: [{ nom: "Objet PLY", positions: xyz, triangles, pose: IDENT, cle: "ply" }], matieres: {}, uniteFichier: null, axeFichier: null, omis: elements.some((e) => e.props.some((p) => p.nom === "red")) ? ["couleurs-sommet"] : [] };
}

// ---------------------------------------------------------------- 3MF

const UNITES_3MF: Readonly<Record<string, number>> = { micron: 1e-6, millimeter: 0.001, centimeter: 0.01, inch: 0.0254, foot: 0.3048, meter: 1 };

export function lire3mf(octets: Uint8Array): LectureScene {
  const entrees = lireZip(octets);
  if (!entrees) throw new ErreurImport("illisible", "Ce fichier n'est pas un 3MF (archive ZIP illisible).");
  const texte = (nom: string) => {
    const e = entrees.find((x) => x.nom.replace(/^\//, "").toLowerCase() === nom.replace(/^\//, "").toLowerCase());
    return e ? new TextDecoder().decode(e.donnees) : null;
  };
  let cheminModele = "3D/3dmodel.model";
  const rels = texte("_rels/.rels");
  if (rels) {
    const r = descendants(lireXml(rels), "Relationship").find((x) => (x.attributs["Type"] ?? "").endsWith("/3dmodel"));
    if (r?.attributs["Target"]) cheminModele = r.attributs["Target"];
  }
  const xml = texte(cheminModele);
  if (!xml) throw new ErreurImport("illisible", "3MF sans modèle 3D (3D/3dmodel.model).");
  const modele = lireXml(xml);
  const unite = UNITES_3MF[modele.attributs["unit"] ?? "millimeter"];
  if (unite === undefined) throw new ErreurImport("unite", `Unité 3MF « ${modele.attributs["unit"]} » inconnue.`);
  const ressources = enfant(modele, "resources");
  const matieres: Record<string, MatiereLue> = {};
  for (const bm of enfants(ressources, "basematerials"))
    enfants(bm, "base").forEach((b, i) => {
      const c = /^#?([0-9a-fA-F]{6})/.exec(b.attributs["displaycolor"] ?? "")?.[1];
      matieres[`b${bm.attributs["id"]}_${i}`] = { nom: (b.attributs["name"] ?? "").trim() || `Matière ${Object.keys(matieres).length + 1}`, couleur: c ? `#${c.toLowerCase()}` : "#cccccc" };
    });
  const objetsXml = new Map(enfants(ressources, "object").map((o) => [o.attributs["id"] ?? "", o]));
  const transformee = (s: string | undefined): Matrice4 => {
    if (!s) return IDENT;
    const m = nombresXml(s);
    if (m.length !== 12 || m.some((x) => !Number.isFinite(x))) throw new ErreurImport("illisible", "Transformation 3MF illisible.");
    const [a, b, c, d, e, f, g, h, i, j, k, l] = m as [number, number, number, number, number, number, number, number, number, number, number, number];
    return [a, d, g, j, b, e, h, k, c, f, i, l, 0, 0, 0, 1];
  };
  const objets: ObjetScene[] = [];
  const omis = new Set<OmisScene>();
  const poser = (id: string, pose: Matrice4, profondeur: number, nomParent?: string) => {
    const o = objetsXml.get(id);
    if (!o || profondeur > 32) return;
    const nom = (o.attributs["name"] ?? "").trim() || nomParent || `Objet ${id}`;
    const mesh = enfant(o, "mesh");
    if (mesh) {
      const positions = enfants(enfant(mesh, "vertices"), "vertex").flatMap((v) => [Number(v.attributs["x"]), Number(v.attributs["y"]), Number(v.attributs["z"])]);
      const tris = enfants(enfant(mesh, "triangles"), "triangle");
      const triangles = tris.flatMap((t) => [Number(t.attributs["v1"]), Number(t.attributs["v2"]), Number(t.attributs["v3"])]);
      const nb = positions.length / 3;
      if (positions.some((x) => !Number.isFinite(x)) || triangles.some((x) => !Number.isInteger(x) || x < 0 || x >= nb)) throw new ErreurImport("illisible", `Maillage 3MF « ${nom} » illisible.`);
      const pid = o.attributs["pid"];
      const pindex = o.attributs["pindex"] ?? "0";
      const mat = pid !== undefined && matieres[`b${pid}_${pindex}`] ? `b${pid}_${pindex}` : undefined;
      if (tris.some((t) => t.attributs["pid"] !== undefined || t.attributs["p1"] !== undefined)) omis.add("matieres-triangle");
      if (triangles.length > 0) objets.push({ nom, positions, triangles, pose, cle: `o${id}`, ...(mat ? { matiere: mat } : {}) });
    }
    for (const c of enfants(enfant(o, "components"), "component")) {
      if (c.attributs["path"]) {
        omis.add("composants-externes");
        continue;
      }
      poser(c.attributs["objectid"] ?? "", multiplier(pose, transformee(c.attributs["transform"])), profondeur + 1, nom);
    }
  };
  for (const item of enfants(enfant(modele, "build"), "item")) poser(item.attributs["objectid"] ?? "", transformee(item.attributs["transform"]), 0);
  if (entrees.some((e) => /\.(png|jpe?g)$/i.test(e.nom))) omis.add("textures");
  return { format: "3mf", objets, matieres, uniteFichier: unite, axeFichier: "z", omis: [...omis] };
}

// ---------------------------------------------------------------- COLLADA

export function lireDae(texte: string): LectureScene {
  let racine: NoeudXml;
  try {
    racine = lireXml(texte);
  } catch (e) {
    throw new ErreurImport("illisible", `COLLADA illisible : ${e instanceof Error ? e.message : String(e)}`);
  }
  if (racine.nom !== "COLLADA") throw new ErreurImport("illisible", "Ce fichier n'est pas un COLLADA (élément racine COLLADA absent).");
  const asset = enfant(racine, "asset");
  const metre = Number(enfant(asset, "unit")?.attributs["meter"] ?? "1");
  const haut = (enfant(asset, "up_axis")?.texte ?? "Y_UP").trim();
  if (haut === "X_UP") throw new ErreurImport("unite", "COLLADA à axe X vertical : non pris en charge (choisir Y ou Z à l'export).");
  const parId = new Map<string, NoeudXml>();
  const indexer = (n: NoeudXml) => {
    const id = n.attributs["id"];
    if (id) parId.set(id, n);
    for (const e of n.enfants) indexer(e);
  };
  indexer(racine);
  const cible = (url: string | undefined) => (url?.startsWith("#") ? parId.get(url.slice(1)) : undefined);
  const omis = new Set<OmisScene>();
  const matieres: Record<string, MatiereLue> = {};
  const matiereDe = (idMatiere: string): string | undefined => {
    if (matieres[idMatiere]) return idMatiere;
    const m = parId.get(idMatiere);
    if (!m) return undefined;
    const effet = cible(enfant(m, "instance_effect")?.attributs["url"]);
    const tech = effet ? enfant(enfant(effet, "profile_COMMON"), "technique") : undefined;
    const modele = tech?.enfants.find((e) => ["phong", "lambert", "blinn", "constant"].includes(e.nom));
    const diffuse = enfant(modele, "diffuse") ?? enfant(modele, "emission");
    const c = nombresXml(enfant(diffuse, "color")?.texte ?? "");
    if (enfant(diffuse, "texture")) omis.add("textures");
    matieres[idMatiere] = { nom: (m.attributs["name"] ?? idMatiere).trim() || idMatiere, couleur: c.length >= 3 ? versHex(c[0] as number, c[1] as number, c[2] as number) : "#cccccc" };
    return idMatiere;
  };
  const geometrie = new Map<string, { positions: number[]; prims: { triangles: number[]; symbole?: string }[] }>();
  const lireGeometrie = (g: NoeudXml) => {
    const id = g.attributs["id"] ?? "";
    const deja = geometrie.get(id);
    if (deja) return deja;
    const mesh = enfant(g, "mesh");
    const r = { positions: [] as number[], prims: [] as { triangles: number[]; symbole?: string }[] };
    geometrie.set(id, r);
    if (!mesh) {
      omis.add("geometries-non-maillees");
      return r;
    }
    const sourceFloat = (url: string | undefined): number[] => {
      const s = cible(url);
      if (!s) return [];
      if (s.nom === "vertices") return sourceFloat(enfants(s, "input").find((i) => i.attributs["semantic"] === "POSITION")?.attributs["source"]);
      const tab = nombresXml(enfant(s, "float_array")?.texte ?? "");
      const acc = chemin(s, "technique_common", "accessor");
      const pas = Number(acc?.attributs["stride"] ?? "3");
      if (pas === 3) return tab;
      const sortie: number[] = [];
      for (let k = 0; k + 2 < tab.length; k += pas) sortie.push(tab[k] as number, tab[k + 1] as number, tab[k + 2] as number);
      return sortie;
    };
    r.positions = [];
    for (const prim of mesh.enfants) {
      if (!["triangles", "polylist", "polygons", "tristrips", "trifans"].includes(prim.nom)) {
        if (["lines", "linestrips"].includes(prim.nom)) omis.add("primitives-non-triangulees");
        continue;
      }
      const entrees = enfants(prim, "input");
      const vertex = entrees.find((i) => i.attributs["semantic"] === "VERTEX");
      if (!vertex) continue;
      const base = r.positions.length / 3;
      const pos = sourceFloat(vertex.attributs["source"]);
      r.positions.push(...pos);
      const nb = pos.length / 3;
      const decal = Number(vertex.attributs["offset"] ?? "0");
      const pas = Math.max(...entrees.map((i) => Number(i.attributs["offset"] ?? "0"))) + 1;
      const sommetsDe = (p: number[]): number[] => {
        const ids: number[] = [];
        for (let k = decal; k < p.length; k += pas) ids.push(p[k] as number);
        if (ids.some((x) => !Number.isInteger(x) || x < 0 || x >= nb)) throw new ErreurImport("illisible", "Indices COLLADA hors des sommets.");
        return ids.map((x) => x + base);
      };
      const triangles: number[] = [];
      const ps = enfants(prim, "p").map((p) => sommetsDe(nombresXml(p.texte)));
      if (prim.nom === "triangles") for (const ids of ps) for (let k = 0; k + 2 < ids.length; k += 3) triangles.push(ids[k] as number, ids[k + 1] as number, ids[k + 2] as number);
      else if (prim.nom === "polylist") {
        const vc = nombresXml(enfant(prim, "vcount")?.texte ?? "");
        const ids = ps[0] ?? [];
        let o = 0;
        for (const n of vc) {
          for (let k = 1; k + 1 < n; k++) triangles.push(ids[o] as number, ids[o + k] as number, ids[o + k + 1] as number);
          o += n;
        }
      } else if (prim.nom === "polygons" || prim.nom === "trifans") {
        if (enfant(prim, "ph")) omis.add("polygones-trous");
        for (const ids of ps) for (let k = 1; k + 1 < ids.length; k++) triangles.push(ids[0] as number, ids[k] as number, ids[k + 1] as number);
      } else for (const ids of ps) for (let k = 0; k + 2 < ids.length; k++) triangles.push(...(k % 2 === 0 ? [ids[k], ids[k + 1], ids[k + 2]] : [ids[k + 1], ids[k], ids[k + 2]]) as number[]);
      const symbole = prim.attributs["material"];
      r.prims.push({ triangles, ...(symbole ? { symbole } : {}) });
    }
    return r;
  };
  const objets: ObjetScene[] = [];
  const poseNoeud = (n: NoeudXml): Matrice4 => {
    let m = IDENT;
    for (const e of n.enfants) {
      const v = nombresXml(e.texte);
      if (e.nom === "matrix" && v.length === 16) m = multiplier(m, v);
      else if (e.nom === "translate" && v.length === 3) m = multiplier(m, translation(v[0] as number, v[1] as number, v[2] as number));
      else if (e.nom === "rotate" && v.length === 4) m = multiplier(m, rotationAxe(v[0] as number, v[1] as number, v[2] as number, v[3] as number));
      else if (e.nom === "scale" && v.length === 3) m = multiplier(m, echelleM(v[0] as number, v[1] as number, v[2] as number));
      else if (e.nom === "lookat" || e.nom === "skew") omis.add("transformations-ignorees");
    }
    return m;
  };
  const parcourir = (n: NoeudXml, parent: Matrice4, profondeur: number) => {
    if (profondeur > 64) return;
    const pose = multiplier(parent, poseNoeud(n));
    for (const ig of enfants(n, "instance_geometry")) {
      const g = cible(ig.attributs["url"]);
      if (!g) continue;
      const geo = lireGeometrie(g);
      const liaisons = new Map(descendants(ig, "instance_material").map((im) => [im.attributs["symbol"] ?? "", (im.attributs["target"] ?? "").replace(/^#/, "")]));
      geo.prims.forEach((p, ip) => {
        if (p.triangles.length === 0) return;
        const idMat = p.symbole !== undefined ? (liaisons.get(p.symbole) ?? p.symbole) : undefined;
        const mat = idMat ? matiereDe(idMat) : undefined;
        const base = (n.attributs["name"] ?? g.attributs["name"] ?? "").trim() || `Objet ${objets.length + 1}`;
        objets.push({ nom: geo.prims.length > 1 ? `${base} / ${mat ? (matieres[mat] as MatiereLue).nom : ip + 1}` : base, positions: geo.positions, triangles: p.triangles, pose, cle: `${g.attributs["id"] ?? ""}#${ip}`, ...(mat ? { matiere: mat } : {}) });
      });
    }
    if (enfants(n, "instance_controller").length > 0) omis.add("maillages-animes");
    for (const inst of enfants(n, "instance_node")) {
      const c = cible(inst.attributs["url"]);
      if (c) parcourir(c, pose, profondeur + 1);
    }
    for (const c of enfants(n, "node")) parcourir(c, pose, profondeur + 1);
  };
  const scene = cible(chemin(racine, "scene", "instance_visual_scene")?.attributs["url"]) ?? enfants(enfant(racine, "library_visual_scenes"), "visual_scene")[0];
  if (scene) for (const n of enfants(scene, "node")) parcourir(n, IDENT, 0);
  return { format: "dae", objets, matieres, uniteFichier: Number.isFinite(metre) && metre > 0 ? metre : 1, axeFichier: haut === "Z_UP" ? "z" : "y", omis: [...omis] };
}

// ---------------------------------------------------------------- 3DS

export function lire3ds(octets: Uint8Array): LectureScene {
  const dv = new DataView(octets.buffer, octets.byteOffset, octets.byteLength);
  if (octets.length < 6 || dv.getUint16(0, true) !== 0x4d4d) throw new ErreurImport("illisible", "Ce fichier n'est pas un 3DS (bloc principal absent).");
  const chaine = (o: number, fin: number): [string, number] => {
    let k = o;
    while (k < fin && octets[k] !== 0) k++;
    return [new TextDecoder("latin1").decode(octets.subarray(o, k)), k + 1];
  };
  const blocs = (debut: number, fin: number, f: (id: number, o: number, finBloc: number) => void) => {
    for (let o = debut; o + 6 <= fin; ) {
      const id = dv.getUint16(o, true);
      const lg = dv.getUint32(o + 2, true);
      if (lg < 6 || o + lg > fin) throw new ErreurImport("illisible", "3DS tronqué.");
      f(id, o + 6, o + lg);
      o += lg;
    }
  };
  const matieres: Record<string, MatiereLue> = {};
  const objets: ObjetScene[] = [];
  const couleur = (debut: number, fin: number): string | null => {
    let c: string | null = null;
    blocs(debut, fin, (id, o) => {
      if (c) return;
      if (id === 0x0011 || id === 0x0012) c = versHex((octets[o] as number) / 255, (octets[o + 1] as number) / 255, (octets[o + 2] as number) / 255);
      else if (id === 0x0010 || id === 0x0013) c = versHex(dv.getFloat32(o, true), dv.getFloat32(o + 4, true), dv.getFloat32(o + 8, true));
    });
    return c;
  };
  let textures = false;
  blocs(6, Math.min(octets.length, dv.getUint32(2, true)), (id, o, fin) => {
    if (id !== 0x3d3d) return;
    blocs(o, fin, (id2, o2, fin2) => {
      if (id2 === 0xafff) {
        let nom = "";
        let c = "#cccccc";
        blocs(o2, fin2, (id3, o3, fin3) => {
          if (id3 === 0xa000) nom = chaine(o3, fin3)[0];
          else if (id3 === 0xa020) c = couleur(o3, fin3) ?? c;
          else if (id3 === 0xa200) textures = true;
        });
        if (nom) matieres[`t${nom}`] = { nom, couleur: c };
      } else if (id2 === 0x4000) {
        const [nom, apres] = chaine(o2, fin2);
        blocs(apres, fin2, (id3, o3, fin3) => {
          if (id3 !== 0x4100) return;
          let positions: number[] = [];
          let faces: number[] = [];
          const groupes: { mat: string; faces: number[] }[] = [];
          blocs(o3, fin3, (id4, o4, fin4) => {
            if (id4 === 0x4110) {
              const n = dv.getUint16(o4, true);
              if (o4 + 2 + n * 12 > fin4) throw new ErreurImport("illisible", "3DS : sommets tronqués.");
              positions = Array.from({ length: n * 3 }, (_, k) => dv.getFloat32(o4 + 2 + k * 4, true));
            } else if (id4 === 0x4120) {
              const n = dv.getUint16(o4, true);
              const finFaces = o4 + 2 + n * 8;
              if (finFaces > fin4) throw new ErreurImport("illisible", "3DS : faces tronquées.");
              faces = [];
              for (let k = 0; k < n; k++) faces.push(dv.getUint16(o4 + 2 + k * 8, true), dv.getUint16(o4 + 4 + k * 8, true), dv.getUint16(o4 + 6 + k * 8, true));
              blocs(finFaces, fin4, (id5, o5, fin5) => {
                if (id5 !== 0x4130) return;
                const [mat, a] = chaine(o5, fin5);
                const m = dv.getUint16(a, true);
                groupes.push({ mat, faces: Array.from({ length: m }, (_, k) => dv.getUint16(a + 2 + k * 2, true)) });
              });
            }
          });
          const nb = positions.length / 3;
          if (faces.some((x) => x >= nb)) throw new ErreurImport("illisible", `3DS : faces de « ${nom} » hors des sommets.`);
          const prises = new Set<number>();
          const nbFaces = faces.length / 3;
          const couvertes = new Set(groupes.flatMap((g) => g.faces.filter((f) => f < nbFaces)));
          const plusieurs = groupes.length > 1 || couvertes.size < nbFaces;
          for (const g of groupes) {
            const tris = g.faces.filter((f) => f * 3 + 2 < faces.length && !prises.has(f)).flatMap((f) => (prises.add(f), [faces[f * 3] as number, faces[f * 3 + 1] as number, faces[f * 3 + 2] as number]));
            if (tris.length > 0) objets.push({ nom: plusieurs ? `${nom} / ${g.mat}` : nom, positions, triangles: tris, pose: IDENT, cle: `${nom}#${g.mat}`, matiere: `t${g.mat}` });
          }
          const reste: number[] = [];
          for (let f = 0; f * 3 + 2 < faces.length; f++) if (!prises.has(f)) reste.push(faces[f * 3] as number, faces[f * 3 + 1] as number, faces[f * 3 + 2] as number);
          if (reste.length > 0) objets.push({ nom: nom || `Objet ${objets.length + 1}`, positions, triangles: reste, pose: IDENT, cle: `${nom}#` });
        });
      }
    });
  });
  for (const o of objets) if (o.matiere && !matieres[o.matiere]) delete (o as { matiere?: string }).matiere;
  return { format: "3ds", objets, matieres, uniteFichier: null, axeFichier: "z", omis: textures ? ["textures"] : [] };
}

// ---------------------------------------------------------------- Reconnaissance et refus

/** Format déduit de l'extension, confirmé par la signature quand elle existe. */
export function formatDuFichier(nom: string, octets: Uint8Array): FormatFabricant | FormatRefuse | null {
  const ext = /\.([a-z0-9]+)$/i.exec(nom)?.[1]?.toLowerCase() ?? "";
  const debut = new TextDecoder("latin1").decode(octets.subarray(0, 32));
  if (debut.startsWith("Kaydara FBX Binary") || ext === "fbx") return "fbx";
  if (debut.startsWith("3D Geometry File Format") || ext === "3dm") return "3dm";
  if (debut.startsWith("PXR-USDC") || debut.startsWith("#usda") || ["usd", "usda", "usdc", "usdz"].includes(ext)) return "usd";
  if (debut.startsWith("glTF")) return "glb";
  if (debut.startsWith("ply")) return "ply";
  if (octets[0] === 0x4d && octets[1] === 0x4d && ext === "3ds") return "3ds";
  return (FORMATS_FABRICANTS as readonly string[]).includes(ext) ? (ext as FormatFabricant) : null;
}

export const MOTIFS_REFUS: Readonly<Record<FormatRefuse, string>> = {
  fbx: "FBX est un format propriétaire non publié : sa lecture demande une bibliothèque. Exportez en glTF (.glb), COLLADA ou OBJ.",
  "3dm": "3DM se lit avec la bibliothèque OpenNURBS, non intégrée. Exportez en glTF (.glb), 3MF ou OBJ.",
  usd: "USD (et USDZ) demande la bibliothèque OpenUSD, non intégrée. Exportez en glTF (.glb) ou OBJ.",
};

export const estFormatRefuse = (f: FormatFabricant | FormatRefuse | null): f is FormatRefuse => f === "fbx" || f === "3dm" || f === "usd";

export function lireScene(format: FormatFabricant, octets: Uint8Array): LectureScene {
  const texte = () => new TextDecoder().decode(octets);
  const l = format === "glb" ? lireGlb(octets) : format === "gltf" ? lireGltf(texte()) : format === "ply" ? lirePly(octets) : format === "3mf" ? lire3mf(octets) : format === "dae" ? lireDae(texte()) : lire3ds(octets);
  if (l.objets.length === 0 || l.objets.every((o) => o.triangles.length === 0)) throw new ErreurImport("vide", "Aucun maillage triangulé dans ce fichier.");
  return l;
}

// ---------------------------------------------------------------- Préparation et pose

export interface ResumeScene {
  readonly objets: number;
  readonly triangles: number;
  readonly matieres: number;
  /** Maillages posés plusieurs fois (deviendront des composants si leurs poses sont rigides). */
  readonly repetes: number;
  readonly omis: readonly OmisScene[];
  /** Dimensions de la boîte englobante en mètres (x, y, z du projet), après unité et axe. */
  readonly dimensions: readonly [number, number, number];
}

const appliquerPoint = (m: Matrice4, x: number, y: number, z: number): [number, number, number] => [
  (m[0] as number) * x + (m[1] as number) * y + (m[2] as number) * z + (m[3] as number),
  (m[4] as number) * x + (m[5] as number) * y + (m[6] as number) * z + (m[7] as number),
  (m[8] as number) * x + (m[9] as number) * y + (m[10] as number) * z + (m[11] as number),
];

/** Pose d'un objet dans le repère du projet en mètres : axes, unité, puis pose du fichier. */
const poseProjet = (o: ObjetScene, echelle: number, axe: AxeHaut): Matrice4 => multiplier(multiplier(echelleM(echelle, echelle, echelle), matriceAxe(axe)), o.pose);

/** Maillages à plat, dans le repère du projet (positions en unité du fichier, axes ramenés à Z vertical) : références et relevés. */
export function maillagesDeScene(l: LectureScene, axe: AxeHaut): MaillageLu[] {
  return l.objets.map((o) => {
    const m = multiplier(matriceAxe(axe), o.pose);
    const positions: number[] = [];
    for (let k = 0; k < o.positions.length; k += 3) positions.push(...appliquerPoint(m, o.positions[k] as number, o.positions[k + 1] as number, o.positions[k + 2] as number));
    return { nom: o.nom, positions, triangles: o.triangles };
  });
}

export function resumerScene(l: LectureScene, echelle: number, axe: AxeHaut): ResumeScene {
  const mini = [Infinity, Infinity, Infinity];
  const maxi = [-Infinity, -Infinity, -Infinity];
  let triangles = 0;
  for (const o of l.objets) {
    const m = poseProjet(o, echelle, axe);
    triangles += o.triangles.length / 3;
    for (let k = 0; k < o.positions.length; k += 3) {
      const p = appliquerPoint(m, o.positions[k] as number, o.positions[k + 1] as number, o.positions[k + 2] as number);
      for (let c = 0; c < 3; c++) {
        mini[c] = Math.min(mini[c] as number, p[c] as number);
        maxi[c] = Math.max(maxi[c] as number, p[c] as number);
      }
    }
  }
  const compte = new Map<string, number>();
  for (const o of l.objets) compte.set(o.cle, (compte.get(o.cle) ?? 0) + 1);
  const dims = [0, 1, 2].map((c) => (Number.isFinite(mini[c]) ? (maxi[c] as number) - (mini[c] as number) : 0)) as [number, number, number];
  return { objets: l.objets.length, triangles, matieres: new Set(l.objets.map((o) => o.matiere).filter(Boolean)).size, repetes: [...compte.values()].filter((n) => n > 1).length, omis: l.omis, dimensions: dims };
}

export interface SceneConstruite {
  readonly objets: readonly ObjetImportePose[];
  readonly matieres: Readonly<Record<string, MatiereLue>>;
  readonly ignores: number;
  readonly composants: number;
}

/**
 * Construction (coûteuse, faite dans le travailleur d'import) : un contenu par maillage distinct. La première pose d'un
 * maillage fixe son contenu (sommets dans le repère du projet) ; chaque autre pose devient une occurrence de ce contenu
 * si son écart à la première est rigide (rotation et translation), sinon un groupe à part.
 */
export function construireScene(l: LectureScene, echelle: number, axe: AxeHaut, progression?: (fait: number, total: number) => void): SceneConstruite {
  const total = l.objets.reduce((n, o) => n + o.triangles.length / 3, 0);
  let fait = 0;
  let ignores = 0;
  const parCle = new Map<string, ObjetScene[]>();
  for (const o of l.objets) parCle.set(o.cle, [...(parCle.get(o.cle) ?? []), o]);
  const sortie: ObjetImportePose[] = [];
  let composants = 0;
  const contenuDe = (o: ObjetScene, pose: Matrice4): ContenuImporte | null => {
    const positions: number[] = [];
    for (let k = 0; k < o.positions.length; k += 3) positions.push(...appliquerPoint(pose, o.positions[k] as number, o.positions[k + 1] as number, o.positions[k + 2] as number));
    const lu = trianglesDuMaillage({ nom: o.nom, positions, triangles: o.triangles }, 1);
    ignores += lu.ignores;
    const n = o.triangles.length / 3;
    const avant = fait;
    const c = lu.triangles.length > 0 ? construireMaillageImporte(o.nom, lu.triangles, progression ? (f) => progression(avant + f, total) : undefined) : null;
    fait += n;
    progression?.(fait, total);
    return c;
  };
  for (const liste of parCle.values()) {
    const premier = liste[0] as ObjetScene;
    const W1 = poseProjet(premier, echelle, axe);
    const inverse = inverserAffine(W1);
    const rigides: Matrice4[] = [IDENT];
    const autres: ObjetScene[] = [];
    for (const o of liste.slice(1)) {
      const T = inverse ? multiplier(poseProjet(o, echelle, axe), inverse) : null;
      if (T && estRigide(T)) rigides.push(T.map((x) => (Math.abs(x) < 1e-12 ? 0 : x)));
      else autres.push(o);
    }
    const c = contenuDe(premier, W1);
    if (c) {
      if (rigides.length > 1) composants++;
      sortie.push({ contenu: c, genre: rigides.length > 1 ? "composant" : "groupe", poses: rigides, ...(premier.matiere ? { matiere: premier.matiere } : {}) });
    } else fait += (rigides.length - 1) * (premier.triangles.length / 3);
    for (const o of autres) {
      const ci = contenuDe(o, poseProjet(o, echelle, axe));
      if (ci) sortie.push({ contenu: ci, genre: "groupe", poses: [IDENT], ...(o.matiere ? { matiere: o.matiere } : {}) });
    }
  }
  return { objets: sortie, matieres: l.matieres, ignores, composants };
}

export interface ResultatScene {
  readonly modele: Modele;
  readonly objets: number;
  readonly occurrences: readonly Id[];
  readonly triangles: number;
  readonly matieresCreees: number;
  readonly composants: number;
  readonly ignores: number;
}

/** Pose en un pas, unité consignée (correspondance de l'import, comme OBJ et STL). */
export function poserScene(m: Modele, s: SceneConstruite, echelle: number, consigner?: { readonly format: FormatFabricant; readonly fichier: string }): ResultatScene {
  const r = poserObjetsImportes(m, s.objets, s.matieres);
  let modele = r.modele;
  if (consigner && r.occurrences.length > 0)
    modele = modifierAnnotations(modele, (a, id) => {
      const k = id("i");
      a.correspondances[k] = { id: k, format: consigner.format, fichier: consigner.fichier, metresParUnite: echelle };
    }).modele;
  const parDefinition = s.objets.filter((o) => Object.keys(o.contenu.contenu.faces).length > 0);
  return { modele, objets: parDefinition.length, occurrences: r.occurrences, triangles: parDefinition.reduce((n, o) => n + o.contenu.triangles * o.poses.length, 0), matieresCreees: r.matieresCreees, composants: s.composants, ignores: s.ignores };
}

/**
 * Maillages d'une référence (relecture du fichier archivé à l'ouverture) : OBJ, STL, IFC par leur lecteur, formats des
 * fabricants par la scène ramenée à Z vertical (`axe` de la fiche). Positions dans l'unité du fichier.
 */
export function maillagesReference(format: FormatFabricant | "obj" | "stl" | "ifc", octets: Uint8Array, axe: AxeHaut = "z"): { readonly maillages: readonly MaillageLu[]; readonly echelleFichier: number | null } {
  if (format === "obj" || format === "stl" || format === "ifc") return lireMaillages(format, format === "stl" ? octets : new TextDecoder().decode(octets));
  const l = lireScene(format, octets);
  return { maillages: maillagesDeScene(l, axe), echelleFichier: l.uniteFichier };
}
