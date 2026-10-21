/**
 * Menu de la Planche — import OBJ / STL / IFC : lecture de maillages triangulés (sans dépendance) puis insertion dans la
 * Planche, un groupe par maillage. Texte ou octets → `MaillageLu[]` (pur, testable) ; l'insertion passe par
 * `ajouterTriangles` + `grouper`. Limites déclarées, jamais silencieuses : triangles d'aire nulle ignorés, au plus
 * `MAX_TRIANGLES_IMPORT` triangles, unité du fichier choisie (OBJ, STL) ou lue (IFC : longueur en mètre, centimètre ou
 * millimètre ; une autre unité est refusée), IFC lu seulement s'il contient des `IfcTriangulatedFaceSet`.
 */
import { ajouterTriangles, grouper, type Modele } from "./geometrie-libre.js";
import { cross, len, scale, sub, v3, type Vec3 } from "./vecteur.js";

export type FormatImport = "obj" | "stl" | "ifc";

/** Plafond mesuré : l'insertion est quadratique (528 triangles ≈ 0,5 s, 2 200 ≈ 7,5 s, 4 700 ≈ 40 s). */
export const MAX_TRIANGLES_IMPORT = 1500;

export interface MaillageLu {
  readonly nom: string;
  /** Coordonnées dans l'unité du fichier (avant `echelle`), 3 par sommet. */
  readonly positions: readonly number[];
  /** Indices de sommets (à partir de 0), 3 par triangle. */
  readonly triangles: readonly number[];
}

export interface LectureMaillages {
  readonly maillages: readonly MaillageLu[];
  /** Facteur vers le mètre lu dans le fichier (IFC), `null` quand le format n'en porte pas (OBJ, STL). */
  readonly echelleFichier: number | null;
}

export class ErreurImport extends Error {
  constructor(public readonly code: "vide" | "illisible" | "unite" | "trop-gros", message: string) {
    super(message);
  }
}

const nombres = (s: string): number[] => s.trim().split(/\s+/).map(Number);

/** Indice OBJ (« 3 », « 3/1 », « 3//2 », « -1 ») → index à partir de 0. */
function indiceObj(jeton: string, nbSommets: number): number {
  const i = Number.parseInt(jeton.split("/")[0] as string, 10);
  if (!Number.isFinite(i) || i === 0) return -1;
  return i > 0 ? i - 1 : nbSommets + i;
}

export function lireObj(texte: string): MaillageLu[] {
  const sommets: number[] = [];
  const sortie: { nom: string; triangles: number[]; positions: number[]; carte: Map<number, number> }[] = [];
  let courant: (typeof sortie)[number] | null = null;
  const nouveau = (nom: string) => {
    courant = { nom, triangles: [], positions: [], carte: new Map() };
    sortie.push(courant);
    return courant;
  };
  for (const brute of texte.split(/\r?\n/)) {
    const ligne = brute.trim();
    if (ligne === "" || ligne.startsWith("#")) continue;
    const [mot, ...reste] = ligne.split(/\s+/);
    if (mot === "v") {
      const [x, y, z] = nombres(reste.slice(0, 3).join(" "));
      if (![x, y, z].every((q) => Number.isFinite(q))) throw new ErreurImport("illisible", `Sommet OBJ illisible : « ${ligne} »`);
      sommets.push(x as number, y as number, z as number);
    } else if (mot === "o" || mot === "g") {
      nouveau(reste.join(" ") || `Objet ${sortie.length + 1}`);
    } else if (mot === "f") {
      const m = courant ?? nouveau("Objet 1");
      const nb = sommets.length / 3;
      const ids = reste.map((j) => indiceObj(j, nb));
      if (ids.length < 3 || ids.some((i) => i < 0 || i >= nb)) throw new ErreurImport("illisible", `Face OBJ hors des sommets : « ${ligne} »`);
      const local = ids.map((g) => {
        let l = m.carte.get(g);
        if (l === undefined) {
          l = m.positions.length / 3;
          m.carte.set(g, l);
          m.positions.push(sommets[g * 3] as number, sommets[g * 3 + 1] as number, sommets[g * 3 + 2] as number);
        }
        return l;
      });
      for (let k = 1; k + 1 < local.length; k++) m.triangles.push(local[0] as number, local[k] as number, local[k + 1] as number);
    }
  }
  return sortie.filter((m) => m.triangles.length > 0).map(({ nom, positions, triangles }) => ({ nom, positions, triangles }));
}

export function lireStl(donnees: string | Uint8Array): MaillageLu[] {
  const octets = typeof donnees === "string" ? new TextEncoder().encode(donnees) : donnees;
  const vue = new DataView(octets.buffer, octets.byteOffset, octets.byteLength);
  const positions: number[] = [];
  const triangles: number[] = [];
  const binaire = octets.byteLength >= 84 && 84 + vue.getUint32(80, true) * 50 === octets.byteLength;
  if (binaire) {
    const n = vue.getUint32(80, true);
    for (let k = 0; k < n; k++) {
      const base = 84 + k * 50 + 12;
      for (let v = 0; v < 3; v++) {
        for (let c = 0; c < 3; c++) positions.push(vue.getFloat32(base + v * 12 + c * 4, true));
        triangles.push(positions.length / 3 - 1);
      }
    }
  } else {
    const texte = new TextDecoder().decode(octets);
    const re = /vertex\s+(\S+)\s+(\S+)\s+(\S+)/g;
    let r: RegExpExecArray | null;
    while ((r = re.exec(texte)) !== null) {
      const q = [Number(r[1]), Number(r[2]), Number(r[3])];
      if (!q.every((x) => Number.isFinite(x))) throw new ErreurImport("illisible", "Sommet STL illisible.");
      positions.push(...q);
      triangles.push(positions.length / 3 - 1);
    }
    if (triangles.length % 3 !== 0) throw new ErreurImport("illisible", "STL tronqué : nombre de sommets non multiple de 3.");
  }
  if (triangles.length === 0) return [];
  const nom = /^\s*solid\s+(.+)$/m.exec(binaire ? "" : new TextDecoder().decode(octets.slice(0, 200)))?.[1]?.trim() || "Solide STL";
  return [{ nom, positions, triangles }];
}

const FACTEURS_IFC: Readonly<Record<string, number>> = { "$": 1, ".MILLI.": 0.001, ".CENTI.": 0.01, ".DECI.": 0.1, ".KILO.": 1000 };

export function lireIfc(texte: string): LectureMaillages {
  const dansDonnees = texte.slice(Math.max(0, texte.indexOf("DATA;")));
  const entites = new Map<number, { type: string; args: string }>();
  const re = /#(\d+)\s*=\s*([A-Z0-9_]+)\s*\(([\s\S]*?)\)\s*;(?=\s*(?:#|ENDSEC))/g;
  let r: RegExpExecArray | null;
  while ((r = re.exec(dansDonnees)) !== null) entites.set(Number(r[1]), { type: (r[2] as string).toUpperCase(), args: r[3] as string });
  let echelle = 1;
  let uniteLue = false;
  for (const { type, args } of entites.values()) {
    if (type !== "IFCSIUNIT") continue;
    const p = args.split(",").map((x) => x.trim());
    if (p[1] !== ".LENGTHUNIT.") continue;
    const f = FACTEURS_IFC[p[2] as string];
    if (f === undefined || p[3] !== ".METRE.") throw new ErreurImport("unite", `Unité de longueur IFC non prise en charge : ${p.slice(2, 4).join(" ")}`);
    echelle = f;
    uniteLue = true;
  }
  const maillages: MaillageLu[] = [];
  for (const { type, args } of entites.values()) {
    if (type !== "IFCTRIANGULATEDFACESET") continue;
    const ref = /^\s*#(\d+)/.exec(args);
    const liste = ref ? entites.get(Number(ref[1])) : undefined;
    if (!liste || liste.type !== "IFCCARTESIANPOINTLIST3D") continue;
    const positions = [...liste.args.matchAll(/\(\s*([-+0-9.eE]+)\s*,\s*([-+0-9.eE]+)\s*,\s*([-+0-9.eE]+)\s*\)/g)].flatMap((q) => [Number(q[1]), Number(q[2]), Number(q[3])]);
    const apres = args.slice((ref?.[0].length ?? 0));
    const indices = [...apres.matchAll(/\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/g)].flatMap((q) => [Number(q[1]) - 1, Number(q[2]) - 1, Number(q[3]) - 1]);
    if (indices.length === 0 || indices.some((i) => i < 0 || i >= positions.length / 3)) throw new ErreurImport("illisible", "Indices de triangles IFC hors de la liste de points.");
    maillages.push({ nom: `Import IFC ${maillages.length + 1}`, positions, triangles: indices });
  }
  return { maillages, echelleFichier: uniteLue ? echelle : 1 };
}

/** Lecture selon le format : texte ou octets (STL binaire). */
export function lireMaillages(format: FormatImport, donnees: string | Uint8Array): LectureMaillages {
  const texte = (): string => (typeof donnees === "string" ? donnees : new TextDecoder().decode(donnees));
  const lu: LectureMaillages = format === "obj" ? { maillages: lireObj(texte()), echelleFichier: null } : format === "stl" ? { maillages: lireStl(donnees), echelleFichier: null } : lireIfc(texte());
  if (lu.maillages.length === 0) throw new ErreurImport("vide", format === "ifc" ? "Aucun IfcTriangulatedFaceSet lisible dans ce fichier IFC." : "Aucun triangle dans ce fichier.");
  return lu;
}

export interface ResultatImport {
  readonly modele: Modele;
  readonly objets: number;
  readonly triangles: number;
  /** Triangles d'aire nulle laissés de côté. */
  readonly ignores: number;
}

/** Insère les maillages (un groupe chacun) ; `echelle` = mètres par unité du fichier. */
export function importerMaillages(m: Modele, maillages: readonly MaillageLu[], echelle: number, nomBase = "Import"): ResultatImport {
  const total = maillages.reduce((n, x) => n + x.triangles.length / 3, 0);
  if (total > MAX_TRIANGLES_IMPORT) throw new ErreurImport("trop-gros", `${total} triangles : au plus ${MAX_TRIANGLES_IMPORT} sont importés (au-delà, la géométrie collante devient trop lente).`);
  let courant = m;
  let objets = 0;
  let triangles = 0;
  let ignores = 0;
  for (const mesh of maillages) {
    const tris: [Vec3, Vec3, Vec3][] = [];
    const p = (i: number): Vec3 => scale(v3(mesh.positions[i * 3] as number, mesh.positions[i * 3 + 1] as number, mesh.positions[i * 3 + 2] as number), echelle);
    for (let k = 0; k < mesh.triangles.length; k += 3) {
      const a = p(mesh.triangles[k] as number);
      const b = p(mesh.triangles[k + 1] as number);
      const c = p(mesh.triangles[k + 2] as number);
      if (len(cross(sub(b, a), sub(c, a))) < 1e-12) ignores++;
      else tris.push([a, b, c]);
    }
    if (tris.length === 0) continue;
    const r = ajouterTriangles(courant, tris);
    const g = grouper(r.modele, r.rapport.crees, { nom: mesh.nom || nomBase, genre: "groupe" });
    courant = g.modele;
    objets++;
    triangles += tris.length;
  }
  return { modele: courant, objets, triangles, ignores };
}
