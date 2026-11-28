/**
 * (Cas 4, lot C4, étape 7b : D10-R-003) Import KML / KMZ : contours, repères et emprises tracés sur un globe virtuel,
 * projetés dans le système du projet. Lecture sans bibliothèque (`xml-mini.ts`, KMZ par `zip.ts`) : Placemark avec Point,
 * LineString, LinearRing, Polygon (contour et trous), MultiGeometry ; dossiers gardés dans les noms. Coordonnées en
 * WGS84 (longitude, latitude, altitude). La projection vers le système du projet est faite ailleurs (API, définition
 * connue de Fadi ou .prj fourni) ; ce module rend la liste des points à projeter puis pose le résultat à plat (z = 0) au
 * moyen du point de base : polygones en faces (un groupe par polygone), lignes en guides, points en points de guide
 * étiquetés. Les altitudes KML ne sont pas posées (déclaré). Pur : ni DOM, ni React.
 */
import { creerGroupeDepuisFaces, modifierAnnotations, type Id, type Modele } from "./geometrie-libre.js";
import { depuisProjete, type PointDeBase } from "./point-de-base.js";
import { v3, type Vec3 } from "./vecteur.js";
import { estZip, lireZip } from "./zip.js";
import { descendants, enfant, enfants, lireXml, type NoeudXml } from "./xml-mini.js";

export type GenreElementKml = "point" | "ligne" | "polygone";
/** Ce qui est laissé de côté à la lecture (codes traduits par l'interface). */
export type OmisKml = "superpositions" | "modeles-3d" | "trajets" | "altitudes";

export interface ElementKml {
  readonly nom: string;
  readonly genre: GenreElementKml;
  /** Point : une boucle d'un point ; ligne : une boucle ; polygone : contour puis trous. [longitude, latitude]. */
  readonly boucles: readonly (readonly (readonly [number, number])[])[];
}

export interface LectureKml {
  readonly nom: string;
  readonly elements: readonly ElementKml[];
  readonly omis: readonly OmisKml[];
}

export class ErreurKml extends Error {}

function coordonnees(n: NoeudXml | undefined): [number, number][] {
  if (!n) return [];
  const r: [number, number][] = [];
  for (const t of n.texte.trim().split(/\s+/)) {
    if (t === "") continue;
    const [lon, lat] = t.split(",").map(Number);
    if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lon as number) > 180 || Math.abs(lat as number) > 90) throw new ErreurKml(`Coordonnée KML illisible : « ${t} ».`);
    const p: [number, number] = [lon as number, lat as number];
    const der = r[r.length - 1];
    if (!der || der[0] !== p[0] || der[1] !== p[1]) r.push(p);
  }
  return r;
}

/** Boucle fermée sans le point répété final. */
const ouvrir = (b: [number, number][]): [number, number][] => (b.length > 1 && b[0]?.[0] === b[b.length - 1]?.[0] && b[0]?.[1] === b[b.length - 1]?.[1] ? b.slice(0, -1) : b);

export function lireKml(texte: string): LectureKml {
  let racine: NoeudXml;
  try {
    racine = lireXml(texte);
  } catch (e) {
    throw new ErreurKml(`KML illisible : ${e instanceof Error ? e.message : String(e)}`);
  }
  if (racine.nom !== "kml") throw new ErreurKml("Ce fichier n'est pas un KML (élément racine kml absent).");
  const omis = new Set<OmisKml>();
  if (descendants(racine, "GroundOverlay").length + descendants(racine, "ScreenOverlay").length + descendants(racine, "PhotoOverlay").length > 0) omis.add("superpositions");
  if (descendants(racine, "Model").length > 0) omis.add("modeles-3d");
  if (descendants(racine, "Track").length + descendants(racine, "MultiTrack").length > 0) omis.add("trajets");
  const elements: ElementKml[] = [];
  const nomDe = (n: NoeudXml): string => (enfant(n, "name")?.texte ?? "").trim();
  const geometries = (g: NoeudXml, nom: string) => {
    if (g.nom === "MultiGeometry") {
      for (const e of g.enfants) geometries(e, nom);
      return;
    }
    if (enfant(g, "altitudeMode") && ["absolute", "relativeToGround"].includes((enfant(g, "altitudeMode")?.texte ?? "").trim())) omis.add("altitudes");
    if (g.nom === "Point") {
      const c = coordonnees(enfant(g, "coordinates"));
      if (c.length > 0) elements.push({ nom, genre: "point", boucles: [[c[0] as [number, number]]] });
    } else if (g.nom === "LineString") {
      const c = coordonnees(enfant(g, "coordinates"));
      if (c.length >= 2) elements.push({ nom, genre: "ligne", boucles: [c] });
    } else if (g.nom === "LinearRing") {
      const c = ouvrir(coordonnees(enfant(g, "coordinates")));
      if (c.length >= 3) elements.push({ nom, genre: "polygone", boucles: [c] });
    } else if (g.nom === "Polygon") {
      const ext = ouvrir(coordonnees(enfant(enfant(enfant(g, "outerBoundaryIs"), "LinearRing"), "coordinates")));
      const trous = enfants(g, "innerBoundaryIs").map((i) => ouvrir(coordonnees(enfant(enfant(i, "LinearRing"), "coordinates")))).filter((b) => b.length >= 3);
      if (ext.length >= 3) elements.push({ nom, genre: "polygone", boucles: [ext, ...trous] });
    }
  };
  const parcourir = (n: NoeudXml, chemin: string) => {
    for (const e of n.enfants) {
      if (e.nom === "Folder" || e.nom === "Document") {
        const nom = nomDe(e);
        parcourir(e, e.nom === "Folder" && nom ? (chemin ? `${chemin} / ${nom}` : nom) : chemin);
      } else if (e.nom === "Placemark") {
        const nom = nomDe(e) || `${chemin ? `${chemin} / ` : ""}Repère ${elements.length + 1}`;
        for (const g of e.enfants) geometries(g, chemin && nomDe(e) ? `${chemin} / ${nom}` : nom);
      }
    }
  };
  parcourir(racine, "");
  const doc = enfant(racine, "Document");
  return { nom: (doc ? nomDe(doc) : "") || "KML", elements, omis: [...omis] };
}

/** KMZ : archive ZIP dont le premier .kml (doc.kml d'abord) est lu. */
export function lireKmz(octets: Uint8Array): LectureKml {
  const entrees = estZip(octets) ? lireZip(octets) : null;
  if (!entrees) throw new ErreurKml("Ce fichier n'est pas un KMZ (archive ZIP illisible).");
  const kml = entrees.find((e) => e.nom.toLowerCase() === "doc.kml") ?? entrees.find((e) => e.nom.toLowerCase().endsWith(".kml"));
  if (!kml) throw new ErreurKml("KMZ sans fichier .kml.");
  return lireKml(new TextDecoder().decode(kml.donnees));
}

/** Points à projeter, dans l'ordre de `poserKml`. */
export const pointsKml = (l: LectureKml): [number, number][] => l.elements.flatMap((e) => e.boucles.flatMap((b) => b.map((p) => [p[0], p[1]] as [number, number])));

export interface ResultatKml {
  readonly modele: Modele;
  readonly polygones: number;
  readonly lignes: number;
  readonly points: number;
  /** Polygones dont le contour se recoupe ou dégénère après projection, laissés de côté. */
  readonly ignores: number;
  readonly groupes: readonly Id[];
}

const aire = (b: readonly Vec3[]): number => {
  let s = 0;
  for (let i = 0; i < b.length; i++) {
    const p = b[i] as Vec3;
    const q = b[(i + 1) % b.length] as Vec3;
    s += p.x * q.y - q.x * p.y;
  }
  return s / 2;
};

function croise(b: readonly Vec3[]): boolean {
  const n = b.length;
  const cote = (a: Vec3, c: Vec3, d: Vec3) => (c.x - a.x) * (d.y - a.y) - (c.y - a.y) * (d.x - a.x);
  for (let i = 0; i < n; i++)
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const a = b[i] as Vec3, c = b[(i + 1) % n] as Vec3, d = b[j] as Vec3, e = b[(j + 1) % n] as Vec3;
      const d1 = cote(a, c, d), d2 = cote(a, c, e), d3 = cote(d, e, a), d4 = cote(d, e, c);
      if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
    }
  return false;
}

/**
 * Pose (sans historique ; l'appelant en fait un pas) : `projetes` = coordonnées projetées [e, n] de `pointsKml(l)`,
 * dans le même ordre. Chaque point devient un point du dessin par le point de base (z = 0).
 */
export function poserKml(m: Modele, l: LectureKml, projetes: readonly (readonly [number, number])[], pointDeBase: PointDeBase): ResultatKml {
  if (projetes.length !== pointsKml(l).length) throw new ErreurKml("Projection incomplète : nombre de points différent.");
  let k = 0;
  const local = (): Vec3 => {
    const [e, n] = projetes[k++] as [number, number];
    return depuisProjete(pointDeBase, { e, n, h: 0 }, 0) as Vec3;
  };
  const elements = l.elements.map((e) => ({ e, boucles: e.boucles.map((b) => b.map(() => local())) }));
  let modele = m;
  let polygones = 0;
  let ignores = 0;
  const groupes: Id[] = [];
  for (const { e, boucles } of elements) {
    if (e.genre !== "polygone") continue;
    const [ext, ...trous] = boucles as Vec3[][];
    if (!ext || Math.abs(aire(ext)) < 1e-9 || croise(ext) || trous.some((t) => Math.abs(aire(t)) < 1e-9 || croise(t))) {
      ignores++;
      continue;
    }
    // Contour dans le sens direct (normale vers le haut), trous dans le sens inverse.
    const orienter = (b: Vec3[], direct: boolean) => ((aire(b) > 0) === direct ? b : [...b].reverse());
    const r = creerGroupeDepuisFaces(modele, [[orienter(ext, true), ...trous.map((t) => orienter(t, false))]], { nom: e.nom, tolerance: 1e-6 });
    modele = r.modele;
    groupes.push(r.occurrence);
    polygones++;
  }
  let lignes = 0;
  let points = 0;
  modele = modifierAnnotations(modele, (a, id) => {
    for (const { e, boucles } of elements) {
      if (e.genre === "ligne") {
        const b = boucles[0] as Vec3[];
        for (let i = 0; i + 1 < b.length; i++) {
          const g = id("g");
          a.guides[g] = { id: g, genre: "segment", origine: b[i] as Vec3, fin: b[i + 1] as Vec3 };
        }
        if (e.nom) {
          const t = id("t");
          a.textes[t] = { id: t, genre: "repere", ancre: b[0] as Vec3, position: b[0] as Vec3, texte: e.nom.slice(0, 80) };
        }
        lignes++;
      } else if (e.genre === "point") {
        const p = (boucles[0] as Vec3[])[0] as Vec3;
        const g = id("g");
        a.guides[g] = { id: g, genre: "point", origine: p };
        if (e.nom) {
          const t = id("t");
          a.textes[t] = { id: t, genre: "repere", ancre: p, position: v3(p.x, p.y, p.z), texte: e.nom.slice(0, 80) };
        }
        points++;
      }
    }
  }).modele;
  return { modele, polygones, lignes, points, ignores, groupes };
}
