/**
 * Cas 2 du catalogue, lot 6 (27 novembre 2026) : échanges, import et export. Pur, sans DOM.
 *
 * - n° 2, 22, 91 : import IFC complet (`lireIfcComplet`) inséré objet par objet, chaque objet nommé et porteur de ses
 *   données IFC, rangé par étage puis par classe (`importerIfc`).
 * - n° 6 : rapport d'échange chiffré joint à chaque import et export : écrits, omis, approchés, refusés.
 * - n° 36 : fichier natif de la Planche contrôlé par son empreinte SHA-256 (`enveloppeNatif`, `ouvrirEnveloppeNatif`).
 * - n° 90, 95 : export préparé — objets masqués et balises éteintes déclarés, inclus au choix (`preparerExport`).
 * - n° 112 : coller un tracé SVG, DXF ou une liste de sommets (`lireTraceColle`, `poserTraces`) ; l'unité absente est
 *   demandée, jamais devinée.
 */
import type { Repere } from "./annotations.js";
import { ajouterSegments, ajouterTriangles, grouper, modifierAnnotations, type Id, type Modele, type Occurrence } from "./geometrie-libre.js";
import { sha256Hex } from "./empreinte.js";
import type { ExportMaillage } from "./echanges.js";
import type { LectureIfc, ObjetIfc } from "./echanges-ifc-lecture.js";
import { add, cross, len, scale, sub, v3, type Vec3 } from "./vecteur.js";

// ————————————————————————————————————————————————————————————— Rapport d'échange (n° 6)

export type CleLigneRapport =
  | "objets"
  | "triangles"
  | "triangulation"
  | "faces-polygonales"
  | "extrusion"
  | "brep"
  | "non-lues"
  | "aretes-libres"
  | "annotations"
  | "surfaces-ouvertes"
  | "traces"
  | "sommets";

export interface LigneRapport {
  readonly cle: CleLigneRapport;
  readonly ecrits: number | null;
  readonly omis: number | null;
  readonly approches: number | null;
  readonly refuses: number | null;
}

export interface RapportEchange {
  readonly sens: "import" | "export" | "collage";
  readonly format: string;
  readonly fichier: string;
  readonly date: string;
  readonly lignes: readonly LigneRapport[];
  /** Représentations non lues, avec l'objet qui les portait (import IFC). */
  readonly nonLues: readonly { readonly classe: string; readonly objet: string }[];
  /** Unité et repère réellement écrits (export, n° 90). */
  readonly unite?: string;
  readonly repere?: string;
  /** (Cas 2, lot 7, n° 109, n° 40) Fiche du projet et révision reprises dans le rapport d'export. */
  readonly projet?: readonly (readonly [string, string])[];
  readonly revision?: string;
}

const LIBELLES_LIGNES: Readonly<Record<CleLigneRapport, string>> = {
  objets: "Objets",
  triangles: "Triangles",
  triangulation: "Triangulations",
  "faces-polygonales": "Faces polygonales",
  extrusion: "Extrusions",
  brep: "B-rep à faces planes",
  "non-lues": "Représentations non lues",
  "aretes-libres": "Arêtes libres",
  annotations: "Annotations",
  "surfaces-ouvertes": "Surfaces ouvertes",
  traces: "Tracés",
  sommets: "Sommets",
};

const ligne = (cle: CleLigneRapport, ecrits: number | null, omis: number | null = null, approches: number | null = null, refuses: number | null = null): LigneRapport => ({ cle, ecrits, omis, approches, refuses });

/** Texte du rapport joint au fichier (document produit : écrit en français, non traduit). */
export function texteRapport(r: RapportEchange): string {
  const sens = r.sens === "import" ? "Import" : r.sens === "export" ? "Export" : "Collage";
  const col = (v: number | null) => (v === null ? "" : String(v)).padStart(10);
  const sortie = [
    `Rapport d'échange — ${sens} ${r.format.toUpperCase()}`,
    `Fichier : ${r.fichier}`,
    `Date : ${r.date}`,
    ...(r.unite ? [`Unité écrite : ${r.unite}`] : []),
    ...(r.repere ? [`Repère écrit : ${r.repere}`] : []),
    ...(r.revision ? [`Révision : ${r.revision}`] : []),
    ...(r.projet?.length ? ["", "Projet :", ...r.projet.map(([l, v]) => `  ${l} : ${v}`)] : []),
    "",
    `${"".padEnd(28)}${"écrits".padStart(10)}${"omis".padStart(10)}${"approchés".padStart(10)}${"refusés".padStart(10)}`,
    ...r.lignes.map((l) => `${LIBELLES_LIGNES[l.cle].padEnd(28)}${col(l.ecrits)}${col(l.omis)}${col(l.approches)}${col(l.refuses)}`),
  ];
  if (r.nonLues.length) {
    sortie.push("", "Représentations non lues (objets non importés ou importés en partie) :");
    for (const n of r.nonLues) sortie.push(`- ${n.classe} : ${n.objet}`);
  }
  sortie.push("", "Aucune valeur absente n'est remplacée.");
  return `${sortie.join("\n")}\n`;
}

/** Rapport d'un import OBJ ou STL : objets et triangles écrits, triangles d'aire nulle omis. */
export function rapportImportMaillages(format: "obj" | "stl" | "ifc", fichier: string, r: { readonly objets: number; readonly triangles: number; readonly ignores: number }, date: string): RapportEchange {
  return { sens: "import", format, fichier, date, lignes: [ligne("objets", r.objets, 0, 0, 0), ligne("triangles", r.triangles, r.ignores)], nonLues: [] };
}

// ————————————————————————————————————————————————————————————— Import IFC (n° 2, 22, 91)

/** Plafond de triangles d'un import IFC complet (un objet reste borné à `MAX_TRIANGLES_OBJET_IFC`). */
export const MAX_TRIANGLES_IFC = 20000;

/**
 * Plafond de triangles d'un objet IFC : l'import IFC objet par objet pose chaque objet par `ajouterTriangles` (géométrie
 * collante), pas par la construction quasi linéaire des imports OBJ / STL (cas 4, étape 7a) ; il garde donc la borne
 * de 1 500 triangles que ces imports avaient avant elle.
 */
export const MAX_TRIANGLES_OBJET_IFC = 1500;

/** Données IFC gardées sur l'objet (`donnees.ifc` de sa définition). */
export interface DonneesIfc {
  readonly globalId: string | null;
  readonly classe: string;
  readonly etage: string | null;
  readonly proprietes: Readonly<Record<string, Readonly<Record<string, string>>>>;
}

export const CLE_DONNEES_IFC = "ifc";

export interface BrancheEtage {
  readonly nom: string | null;
  readonly altitude: number | null;
  readonly objets: number;
  readonly classes: readonly { readonly classe: string; readonly objets: number }[];
}

export interface ResultatImportIfc {
  readonly modele: Modele;
  readonly rapport: RapportEchange;
  readonly arbre: readonly BrancheEtage[];
  /** Groupe du fichier (racine du rangement) ; `null` si rien n'a été posé. */
  readonly occurrence: Id | null;
}

/** Données IFC d'un objet de la Planche (définition de l'occurrence), si elles existent. */
export function donneesIfcDe(m: Modele, o: Occurrence | undefined): DonneesIfc | null {
  const d = o ? (m.definitions[o.definition]?.donnees?.[CLE_DONNEES_IFC] as DonneesIfc | undefined) : undefined;
  return d && typeof d.classe === "string" ? d : null;
}

const aire = (t: readonly [Vec3, Vec3, Vec3]) => len(cross(sub(t[1], t[0]), sub(t[2], t[0])));

/** Insère les objets lus, un groupe chacun, rangés fichier → étage → classe. */
export function importerIfc(m: Modele, lu: LectureIfc, fichier: string, date: string): ResultatImportIfc {
  let courant = m;
  const poses: { id: Id; o: ObjetIfc }[] = [];
  let exacts = 0;
  let approches = 0;
  let refuses = 0;
  let omisLimite = 0;
  let total = 0;
  const nonLues: { classe: string; objet: string }[] = [];
  for (const o of lu.objets) {
    const nomObjet = o.nom ?? o.globalId ?? o.classe;
    for (const c of o.nonLues) nonLues.push({ classe: c, objet: nomObjet });
    const tris = o.triangles.filter((t) => aire(t) > 1e-12);
    if (tris.length === 0 || tris.length > MAX_TRIANGLES_OBJET_IFC) {
      refuses++;
      continue;
    }
    if (total + tris.length > MAX_TRIANGLES_IFC) {
      omisLimite++;
      continue;
    }
    total += tris.length;
    const r = ajouterTriangles(courant, tris);
    const donnees: DonneesIfc = { globalId: o.globalId, classe: o.classe, etage: o.etage, proprietes: o.proprietes };
    const g = grouper(r.modele, r.rapport.crees, { nom: nomObjet, genre: "groupe", donnees: { [CLE_DONNEES_IFC]: { ...donnees } } });
    courant = g.modele;
    poses.push({ id: g.occurrence, o });
    if (o.approche || o.nonLues.length > 0) approches++;
    else exacts++;
  }
  // Rangement : étage (ordre des altitudes déclarées), puis classe (ordre alphabétique).
  const altitude = new Map(lu.etages.map((e) => [e.nom, e.altitude]));
  const parEtage = new Map<string | null, Map<string, Id[]>>();
  for (const p of poses) {
    const k = parEtage.get(p.o.etage) ?? new Map<string, Id[]>();
    k.set(p.o.classe, [...(k.get(p.o.classe) ?? []), p.id]);
    parEtage.set(p.o.etage, k);
  }
  const ordre = [...parEtage.keys()].sort((a, b) => {
    if (a === null) return 1;
    if (b === null) return -1;
    return (altitude.get(a) ?? Number.POSITIVE_INFINITY) - (altitude.get(b) ?? Number.POSITIVE_INFINITY) || a.localeCompare(b);
  });
  const arbre: BrancheEtage[] = [];
  const groupesEtages: Id[] = [];
  for (const etage of ordre) {
    const classes = parEtage.get(etage) as Map<string, Id[]>;
    const groupesClasses: Id[] = [];
    const branche: { classe: string; objets: number }[] = [];
    for (const classe of [...classes.keys()].sort()) {
      const ids = classes.get(classe) as Id[];
      const g = grouper(courant, ids, { nom: classe, genre: "groupe" });
      courant = g.modele;
      groupesClasses.push(g.occurrence);
      branche.push({ classe, objets: ids.length });
    }
    const g = grouper(courant, groupesClasses, { nom: etage ?? "Sans étage", genre: "groupe" });
    courant = g.modele;
    groupesEtages.push(g.occurrence);
    arbre.push({ nom: etage, altitude: etage === null ? null : (altitude.get(etage) ?? null), objets: branche.reduce((n, b) => n + b.objets, 0), classes: branche });
  }
  let occurrence: Id | null = null;
  if (groupesEtages.length) {
    const g = grouper(courant, groupesEtages, { nom: fichier.replace(/\.[^.]+$/, ""), genre: "groupe" });
    courant = g.modele;
    occurrence = g.occurrence;
    courant = modifierAnnotations(courant, (a, id) => {
      const k = id("i");
      a.correspondances[k] = { id: k, format: "ifc", fichier, metresParUnite: lu.echelle };
    }).modele;
  }
  const rapport: RapportEchange = {
    sens: "import",
    format: "ifc",
    fichier,
    date,
    lignes: [
      ligne("objets", exacts, lu.ouvertures + omisLimite, approches, refuses),
      ligne("triangulation", lu.lues.triangulation),
      ligne("faces-polygonales", lu.lues["faces-polygonales"]),
      ligne("extrusion", lu.lues.extrusion),
      ligne("brep", lu.lues.brep),
      ligne("non-lues", null, null, null, nonLues.length),
    ],
    nonLues,
  };
  return { modele: courant, rapport, arbre, occurrence };
}

// ————————————————————————————————————————————————————————————— Export préparé (n° 90, 95)

export interface ObjetsNonAffiches {
  /** Objets masqués de la racine (hors balise éteinte). */
  readonly masques: readonly { readonly id: Id; readonly nom: string }[];
  /** Balises éteintes portant au moins un objet de la racine. */
  readonly eteintes: readonly { readonly balise: string; readonly nom: string; readonly objets: number }[];
}

const nomOcc = (m: Modele, o: Occurrence): string => o.nom ?? m.definitions[o.definition]?.nom ?? o.id;

/** Ce que l'export laisserait de côté sans le dire : objets masqués, objets de balises éteintes. */
export function objetsNonAffiches(m: Modele): ObjetsNonAffiches {
  const balises = m.annotations?.balises ?? {};
  const masques: { id: Id; nom: string }[] = [];
  const parBalise = new Map<string, number>();
  for (const o of Object.values(m.racine.occurrences).sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const b = o.balise ? balises[o.balise] : undefined;
    if (b && b.visible === false) parBalise.set(b.id, (parBalise.get(b.id) ?? 0) + 1);
    else if (o.masquee) masques.push({ id: o.id, nom: nomOcc(m, o) });
  }
  return { masques, eteintes: [...parBalise].map(([balise, objets]) => ({ balise, nom: balises[balise]?.nom ?? balise, objets })) };
}

export interface ChoixExport {
  readonly masques: boolean;
  /** Balises éteintes dont les objets sont inclus. */
  readonly balises: readonly string[];
}

/** Copie du modèle prête à l'export : objets non inclus masqués, objets inclus affichés ; nombre d'objets omis. */
export function preparerExport(m: Modele, choix: ChoixExport): { readonly modele: Modele; readonly omis: number } {
  const balises = m.annotations?.balises ?? {};
  const inclus = new Set(choix.balises);
  let omis = 0;
  const occurrences: Record<Id, Occurrence> = {};
  for (const [k, o] of Object.entries(m.racine.occurrences)) {
    const b = o.balise ? balises[o.balise] : undefined;
    const eteinte = !!b && b.visible === false;
    const garder = eteinte ? inclus.has(b!.id) : o.masquee ? choix.masques : true;
    if (!garder) omis++;
    occurrences[k] = garder === !o.masquee ? o : { ...o, masquee: !garder };
  }
  return { modele: { ...m, racine: { ...m.racine, occurrences } }, omis };
}

/** Rapport d'un export de maillage (prévu puis joint au fichier). */
export function rapportExport(
  format: string,
  fichier: string,
  r: ExportMaillage,
  omisObjets: number,
  date: string,
  ecrit: { readonly unite: string; readonly repere: string },
  piece?: { readonly projet: readonly (readonly [string, string])[]; readonly revision: string | null },
): RapportEchange {
  return {
    ...(piece ? { projet: piece.projet, ...(piece.revision ? { revision: piece.revision } : {}) } : {}),
    sens: "export",
    format,
    fichier,
    date,
    unite: ecrit.unite,
    repere: ecrit.repere,
    lignes: [ligne("objets", r.objets, omisObjets, 0, 0), ligne("aretes-libres", null, r.omis.aretesLibres), ligne("annotations", null, r.omis.annotations), ligne("surfaces-ouvertes", null, null, r.nonEtanches)],
    nonLues: [],
  };
}

// ————————————————————————————————————————————————————————————— Fichier natif (n° 36)

export const FORMAT_NATIF = "fadi-planche/1";
export const EXTENSION_NATIF = ".planche";

export interface EnveloppeNatif {
  readonly contenu: string;
  readonly empreinte: string;
}

/** Fichier natif : le brouillon sérialisé tel quel et son empreinte SHA-256 (écrite dans le fichier). */
export function enveloppeNatif(texteModele: string, nom: string, maintenant: Date): EnveloppeNatif {
  const empreinte = sha256Hex(texteModele);
  const contenu = JSON.stringify({ format: FORMAT_NATIF, nom, exporteLe: maintenant.toISOString(), empreinte, modele: texteModele }, null, 1);
  return { contenu, empreinte };
}

export type LectureNatif =
  | { readonly ok: true; readonly nom: string; readonly exporteLe: string; readonly empreinte: string; readonly texteModele: string }
  | { readonly ok: false; readonly motif: "illisible" | "format" | "empreinte" };

/** Ouverture contrôlée : format reconnu et empreinte recalculée égale à l'empreinte écrite, sinon refus. */
export function ouvrirEnveloppeNatif(texte: string): LectureNatif {
  let v: unknown;
  try {
    v = JSON.parse(texte);
  } catch {
    return { ok: false, motif: "illisible" };
  }
  const x = v as { format?: unknown; nom?: unknown; exporteLe?: unknown; empreinte?: unknown; modele?: unknown } | null;
  if (!x || typeof x !== "object" || x.format !== FORMAT_NATIF) return { ok: false, motif: "format" };
  if (typeof x.modele !== "string" || typeof x.empreinte !== "string") return { ok: false, motif: "illisible" };
  if (sha256Hex(x.modele) !== x.empreinte) return { ok: false, motif: "empreinte" };
  return { ok: true, nom: typeof x.nom === "string" ? x.nom : "", exporteLe: typeof x.exporteLe === "string" ? x.exporteLe : "", empreinte: x.empreinte, texteModele: x.modele };
}

/** Résumé d'une Planche : objets de la racine, balises, scènes. */
export function resumeNatif(m: Modele): { readonly objets: number; readonly balises: number; readonly scenes: number } {
  return { objets: Object.keys(m.racine.occurrences).length, balises: Object.keys(m.annotations?.balises ?? {}).length, scenes: Object.keys(m.annotations?.scenes ?? {}).length };
}

/** Empreinte abrégée pour l'affichage (« 3f9a…c21e »). */
export const empreinteCourte = (e: string): string => (e.length > 10 ? `${e.slice(0, 4)}…${e.slice(-4)}` : e);

// ————————————————————————————————————————————————————————————— Coller un tracé (n° 112)

export type TypeColle = "svg" | "dxf" | "sommets";
export type UniteColle = "m" | "cm" | "mm";
export const METRES_PAR_UNITE_COLLE: Readonly<Record<UniteColle, number>> = { m: 1, cm: 0.01, mm: 0.001 };

export interface TraceColle {
  readonly points: readonly Vec3[];
  readonly ferme: boolean;
}

export interface LectureColle {
  readonly type: TypeColle;
  readonly traces: readonly TraceColle[];
  /** Courbes (arcs, cercles, Bézier) remplacées par des segments. */
  readonly courbesApprochees: number;
  /** Éléments non tracés : textes, images, blocs, hachures… */
  readonly refuses: number;
  /** Unité déclarée par le contenu ; `null` = absente (demandée). */
  readonly unite: UniteColle | null;
}

const SEGMENTS_COURBE = 12;

type Mat2 = readonly [number, number, number, number, number, number];
const ID2: Mat2 = [1, 0, 0, 1, 0, 0];
const mul2 = (a: Mat2, b: Mat2): Mat2 => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
const app2 = (m: Mat2, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

/** Attribut `transform` SVG : matrix, translate, scale, rotate (composés de gauche à droite). */
function transformSvg(t: string | undefined): Mat2 {
  let m: Mat2 = ID2;
  if (!t) return m;
  for (const r of t.matchAll(/(matrix|translate|scale|rotate)\s*\(([^)]*)\)/g)) {
    const n = (r[2] as string).split(/[\s,]+/).filter(Boolean).map(Number);
    let k: Mat2 = ID2;
    if (r[1] === "matrix" && n.length === 6) k = n as unknown as Mat2;
    else if (r[1] === "translate") k = [1, 0, 0, 1, n[0] ?? 0, n[1] ?? 0];
    else if (r[1] === "scale") k = [n[0] ?? 1, 0, 0, n[1] ?? n[0] ?? 1, 0, 0];
    else if (r[1] === "rotate") {
      const a = ((n[0] ?? 0) * Math.PI) / 180;
      const [cx, cy] = [n[1] ?? 0, n[2] ?? 0];
      k = mul2(mul2([1, 0, 0, 1, cx, cy], [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0]), [1, 0, 0, 1, -cx, -cy]);
    }
    m = mul2(m, k);
  }
  return m;
}

const attr = (a: string, n: string): string | undefined => new RegExp(`(?:^|\\s)${n}\\s*=\\s*("([^"]*)"|'([^']*)')`).exec(a)?.slice(2).find((x) => x !== undefined);
const nombre = (a: string, n: string): number => Number.parseFloat(attr(a, n) ?? "0") || 0;

/** Arc elliptique SVG (paramétrage par extrémités, SVG 1.1 annexe F.6) en points. */
function arcSvg(x1: number, y1: number, rx: number, ry: number, phi: number, grand: boolean, sens: boolean, x2: number, y2: number): [number, number][] {
  if (rx === 0 || ry === 0) return [[x2, y2]];
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  const c = Math.cos(phi), s = Math.sin(phi);
  const xp = (c * (x1 - x2)) / 2 + (s * (y1 - y2)) / 2, yp = (-s * (x1 - x2)) / 2 + (c * (y1 - y2)) / 2;
  const l = (xp * xp) / (rx * rx) + (yp * yp) / (ry * ry);
  if (l > 1) {
    rx *= Math.sqrt(l);
    ry *= Math.sqrt(l);
  }
  const num = rx * rx * ry * ry - rx * rx * yp * yp - ry * ry * xp * xp;
  const k = (grand === sens ? -1 : 1) * Math.sqrt(Math.max(0, num / (rx * rx * yp * yp + ry * ry * xp * xp)));
  const cxp = (k * rx * yp) / ry, cyp = (-k * ry * xp) / rx;
  const cx = c * cxp - s * cyp + (x1 + x2) / 2, cy = s * cxp + c * cyp + (y1 + y2) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t1 = ang(1, 0, (xp - cxp) / rx, (yp - cyp) / ry);
  let dt = ang((xp - cxp) / rx, (yp - cyp) / ry, (-xp - cxp) / rx, (-yp - cyp) / ry);
  if (!sens && dt > 0) dt -= 2 * Math.PI;
  if (sens && dt < 0) dt += 2 * Math.PI;
  const pts: [number, number][] = [];
  for (let i = 1; i <= SEGMENTS_COURBE; i++) {
    const t = t1 + (dt * i) / SEGMENTS_COURBE;
    pts.push([c * rx * Math.cos(t) - s * ry * Math.sin(t) + cx, s * rx * Math.cos(t) + c * ry * Math.sin(t) + cy]);
  }
  return pts;
}

/** Tracés d'un attribut `d` ; `approchees` compte les courbes remplacées par des segments. */
function cheminSvg(d: string): { traces: { points: [number, number][]; ferme: boolean }[]; approchees: number } {
  const jetons = d.match(/[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? [];
  const traces: { points: [number, number][]; ferme: boolean }[] = [];
  let pts: [number, number][] = [];
  let approchees = 0;
  let x = 0, y = 0, x0 = 0, y0 = 0;
  let cmd = "";
  let ctrl: [number, number] | null = null;
  let i = 0;
  const n = () => Number(jetons[i++]);
  const fin = (ferme: boolean) => {
    if (pts.length >= 2) traces.push({ points: pts, ferme });
    pts = [];
  };
  const bezier = (p: [number, number][]) => {
    for (let k = 1; k <= SEGMENTS_COURBE; k++) {
      const t = k / SEGMENTS_COURBE;
      const pt = p.length === 3
        ? [(1 - t) ** 2 * p[0]![0] + 2 * (1 - t) * t * p[1]![0] + t * t * p[2]![0], (1 - t) ** 2 * p[0]![1] + 2 * (1 - t) * t * p[1]![1] + t * t * p[2]![1]]
        : [(1 - t) ** 3 * p[0]![0] + 3 * (1 - t) ** 2 * t * p[1]![0] + 3 * (1 - t) * t * t * p[2]![0] + t ** 3 * p[3]![0], (1 - t) ** 3 * p[0]![1] + 3 * (1 - t) ** 2 * t * p[1]![1] + 3 * (1 - t) * t * t * p[2]![1] + t ** 3 * p[3]![1]];
      pts.push(pt as [number, number]);
    }
    approchees++;
  };
  while (i < jetons.length) {
    const j = jetons[i] as string;
    if (/[A-Za-z]/.test(j)) {
      cmd = j;
      i++;
      if (cmd === "Z" || cmd === "z") {
        fin(true);
        x = x0;
        y = y0;
        ctrl = null;
        continue;
      }
    } else if (!cmd) break;
    const rel = cmd === cmd.toLowerCase();
    const bx = rel ? x : 0, by = rel ? y : 0;
    switch (cmd.toUpperCase()) {
      case "M": {
        fin(false);
        x = bx + n();
        y = by + n();
        x0 = x;
        y0 = y;
        pts.push([x, y]);
        cmd = rel ? "l" : "L";
        ctrl = null;
        break;
      }
      case "L":
        x = bx + n();
        y = by + n();
        pts.push([x, y]);
        ctrl = null;
        break;
      case "H":
        x = bx + n();
        pts.push([x, y]);
        ctrl = null;
        break;
      case "V":
        y = by + n();
        pts.push([x, y]);
        ctrl = null;
        break;
      case "C": {
        const c1: [number, number] = [bx + n(), by + n()], c2: [number, number] = [bx + n(), by + n()], p: [number, number] = [bx + n(), by + n()];
        bezier([[x, y], c1, c2, p]);
        ctrl = c2;
        [x, y] = p;
        break;
      }
      case "S": {
        const c1: [number, number] = ctrl ? [2 * x - ctrl[0], 2 * y - ctrl[1]] : [x, y];
        const c2: [number, number] = [bx + n(), by + n()], p: [number, number] = [bx + n(), by + n()];
        bezier([[x, y], c1, c2, p]);
        ctrl = c2;
        [x, y] = p;
        break;
      }
      case "Q": {
        const c1: [number, number] = [bx + n(), by + n()], p: [number, number] = [bx + n(), by + n()];
        bezier([[x, y], c1, p]);
        ctrl = c1;
        [x, y] = p;
        break;
      }
      case "T": {
        const c1: [number, number] = ctrl ? [2 * x - ctrl[0], 2 * y - ctrl[1]] : [x, y];
        const p: [number, number] = [bx + n(), by + n()];
        bezier([[x, y], c1, p]);
        ctrl = c1;
        [x, y] = p;
        break;
      }
      case "A": {
        const rx = n(), ry = n(), phi = (n() * Math.PI) / 180, grand = n() !== 0, sens = n() !== 0;
        const p: [number, number] = [bx + n(), by + n()];
        pts.push(...arcSvg(x, y, rx, ry, phi, grand, sens, p[0], p[1]));
        approchees++;
        [x, y] = p;
        ctrl = null;
        break;
      }
      default:
        i++;
    }
    if (!Number.isFinite(x) || !Number.isFinite(y)) break;
  }
  fin(false);
  return { traces, approchees };
}

const UNITES_SVG: Readonly<Record<string, UniteColle>> = { mm: "mm", cm: "cm", m: "m" };
const NON_DESSINES_SVG: ReadonlySet<string> = new Set(["defs", "clippath", "mask", "symbol", "pattern", "marker", "lineargradient", "radialgradient", "filter"]);

function lireSvg(texte: string): LectureColle {
  const traces: TraceColle[] = [];
  let approchees = 0;
  let refuses = 0;
  let unite: UniteColle | null = null;
  const pile: Mat2[] = [ID2];
  const haut = () => pile[pile.length - 1] as Mat2;
  const pousser = (p: [number, number][], ferme: boolean, M: Mat2) => {
    const q = p.map(([a, b]) => app2(M, a, b));
    // SVG : y vers le bas ; la Planche : y vers le haut.
    if (q.length >= 2) traces.push({ points: q.map(([a, b]) => v3(a, -b, 0)), ferme });
  };
  // Sous-arbres jamais dessinés (définitions, découpes, masques, symboles, motifs, marqueurs) : ignorés ; ce qu'ils portent
  // n'est posé que par une instance (`use`), elle-même refusée.
  let cache = 0;
  for (const r of texte.matchAll(/<\s*(\/?)\s*([A-Za-z][\w:-]*)([^>]*?)(\/?)\s*>/g)) {
    const [, ferme, nomBrut, a = "", auto] = r;
    const nom = (nomBrut as string).toLowerCase();
    if (NON_DESSINES_SVG.has(nom)) {
      if (ferme) cache = Math.max(0, cache - 1);
      else if (!auto) cache++;
      continue;
    }
    if (cache > 0) continue;
    if (nom === "svg" && !ferme) {
      const w = /^\s*([\d.]+)\s*(mm|cm|m)\s*$/.exec(attr(a, "width") ?? "");
      const vb = (attr(a, "viewBox") ?? "").split(/[\s,]+/).filter(Boolean).map(Number);
      if (w && (vb.length !== 4 || Math.abs((vb[2] as number) - Number(w[1])) < 1e-9)) unite = UNITES_SVG[w[2] as string] ?? null;
      continue;
    }
    if (nom === "g") {
      if (ferme) pile.length > 1 && pile.pop();
      else if (!auto) pile.push(mul2(haut(), transformSvg(attr(a, "transform"))));
      continue;
    }
    if (ferme) continue;
    const M = mul2(haut(), transformSvg(attr(a, "transform")));
    if (nom === "path") {
      const c = cheminSvg(attr(a, "d") ?? "");
      approchees += c.approchees;
      for (const t of c.traces) pousser(t.points, t.ferme, M);
    } else if (nom === "polyline" || nom === "polygon") {
      const n = (attr(a, "points") ?? "").split(/[\s,]+/).filter(Boolean).map(Number);
      const p: [number, number][] = [];
      for (let k = 0; k + 1 < n.length; k += 2) p.push([n[k] as number, n[k + 1] as number]);
      pousser(p, nom === "polygon", M);
    } else if (nom === "line") pousser([[nombre(a, "x1"), nombre(a, "y1")], [nombre(a, "x2"), nombre(a, "y2")]], false, M);
    else if (nom === "rect") {
      const x = nombre(a, "x"), y = nombre(a, "y"), w = nombre(a, "width"), h = nombre(a, "height");
      if (w > 0 && h > 0) pousser([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], true, M);
    } else if (nom === "circle" || nom === "ellipse") {
      const cx = nombre(a, "cx"), cy = nombre(a, "cy"), rx = nom === "circle" ? nombre(a, "r") : nombre(a, "rx"), ry = nom === "circle" ? rx : nombre(a, "ry");
      const p: [number, number][] = [];
      for (let k = 0; k < 2 * SEGMENTS_COURBE; k++) p.push([cx + rx * Math.cos((Math.PI * k) / SEGMENTS_COURBE), cy + ry * Math.sin((Math.PI * k) / SEGMENTS_COURBE)]);
      if (rx > 0 && ry > 0) {
        pousser(p, true, M);
        approchees++;
      }
    } else if (["text", "image", "use", "foreignobject", "tspan"].includes(nom)) refuses++;
  }
  return { type: "svg", traces, courbesApprochees: approchees, refuses, unite };
}

const UNITES_DXF: Readonly<Record<string, UniteColle>> = { "4": "mm", "5": "cm", "6": "m" };

function lireDxf(texte: string): LectureColle {
  const l = texte.split(/\r?\n/).map((s) => s.trim());
  const paires: [number, string][] = [];
  for (let i = 0; i + 1 < l.length; i += 2) paires.push([Number(l[i]), l[i + 1] as string]);
  let unite: UniteColle | null = null;
  const traces: TraceColle[] = [];
  let approchees = 0;
  let refuses = 0;
  let dansEntites = false;
  for (let i = 0; i < paires.length; i++) {
    const [code, val] = paires[i] as [number, string];
    if (code === 9 && val === "$INSUNITS") {
      const v = paires.slice(i + 1, i + 3).find(([c]) => c === 70)?.[1];
      unite = v !== undefined ? (UNITES_DXF[v.trim()] ?? null) : null;
    }
    if (code === 2 && val === "ENTITIES") dansEntites = true;
    if (code === 0 && val === "ENDSEC") dansEntites = false;
    if (!dansEntites || code !== 0) continue;
    // Groupes de l'entité jusqu'au prochain code 0.
    const g: [number, string][] = [];
    for (let k = i + 1; k < paires.length && (paires[k] as [number, string])[0] !== 0; k++) g.push(paires[k] as [number, string]);
    const v = (c: number) => Number(g.find(([x]) => x === c)?.[1] ?? 0);
    if (val === "LINE") traces.push({ points: [v3(v(10), v(20), v(30)), v3(v(11), v(21), v(31))], ferme: false });
    else if (val === "LWPOLYLINE") {
      const xs = g.filter(([c]) => c === 10).map(([, s]) => Number(s));
      const ys = g.filter(([c]) => c === 20).map(([, s]) => Number(s));
      if (g.some(([c, s]) => c === 42 && Number(s) !== 0)) approchees++;
      const pts = xs.map((x, k) => v3(x, ys[k] ?? 0, v(38)));
      if (pts.length >= 2) traces.push({ points: pts, ferme: (v(70) & 1) === 1 });
    } else if (val === "POLYLINE") {
      const pts: Vec3[] = [];
      let k = i + 1 + g.length;
      while (k < paires.length) {
        const [c, s] = paires[k] as [number, string];
        if (c === 0 && s === "VERTEX") {
          const h: [number, string][] = [];
          for (let q = k + 1; q < paires.length && (paires[q] as [number, string])[0] !== 0; q++) h.push(paires[q] as [number, string]);
          const w = (cc: number) => Number(h.find(([x]) => x === cc)?.[1] ?? 0);
          pts.push(v3(w(10), w(20), w(30)));
          k += 1 + h.length;
          continue;
        }
        if (c === 0) break;
        k++;
      }
      if (pts.length >= 2) traces.push({ points: pts, ferme: (v(70) & 1) === 1 });
    } else if (val === "CIRCLE" || val === "ARC") {
      const r = v(40);
      const a0 = val === "ARC" ? (v(50) * Math.PI) / 180 : 0;
      let a1 = val === "ARC" ? (v(51) * Math.PI) / 180 : 2 * Math.PI;
      if (a1 <= a0) a1 += 2 * Math.PI;
      const n = val === "ARC" ? SEGMENTS_COURBE : 2 * SEGMENTS_COURBE;
      const pts: Vec3[] = [];
      for (let k = 0; k <= n - (val === "CIRCLE" ? 1 : 0); k++) pts.push(v3(v(10) + r * Math.cos(a0 + ((a1 - a0) * k) / n), v(20) + r * Math.sin(a0 + ((a1 - a0) * k) / n), v(30)));
      if (r > 0) {
        traces.push({ points: pts, ferme: val === "CIRCLE" });
        approchees++;
      }
    } else if (!["VERTEX", "SEQEND", "ENDSEC", "SECTION", "EOF"].includes(val)) refuses++;
  }
  return { type: "dxf", traces, courbesApprochees: approchees, refuses, unite };
}

/** Liste de sommets : « x ; y » (virgule décimale permise), « x, y, z », tabulations ou espaces. */
function lireSommets(texte: string): LectureColle | null {
  const lignes = texte.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  if (lignes.length < 2) return null;
  const pts: Vec3[] = [];
  for (const s of lignes) {
    let parts: string[];
    if (s.includes(";") || s.includes("\t")) parts = s.split(/\s*[;\t]\s*/).map((p) => p.replace(",", "."));
    else if (s.includes(",")) parts = s.split(/\s*,\s*/);
    else parts = s.split(/\s+/);
    if (parts.length < 2 || parts.length > 3 || !parts.every((p) => /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(p))) return null;
    const [x, y, z] = parts.map(Number);
    pts.push(v3(x as number, y as number, z ?? 0));
  }
  const ferme = pts.length > 3 && len(sub(pts[0] as Vec3, pts[pts.length - 1] as Vec3)) < 1e-12;
  return { type: "sommets", traces: [{ points: ferme ? pts.slice(0, -1) : pts, ferme }], courbesApprochees: 0, refuses: 0, unite: null };
}

/** Reconnaît le contenu du presse-papiers ; `null` s'il ne contient aucun tracé lisible. */
export function lireTraceColle(texte: string): LectureColle | null {
  const t = texte.trim();
  if (!t) return null;
  let r: LectureColle | null;
  if (/<svg[\s>]/i.test(t) || /^<(path|polyline|polygon|line|rect|g)\b/i.test(t)) r = lireSvg(t);
  else if (/^0\s*\r?\n\s*SECTION\b/.test(t) || /\n\s*ENTITIES\s*\r?\n/.test(t)) r = lireDxf(t);
  else r = lireSommets(t);
  if (!r) return null;
  // Points consécutifs confondus retirés ; un tracé de moins de deux points est écarté.
  const traces = r.traces
    .map((x) => ({ ...x, points: x.points.filter((p, k) => k === 0 || len(sub(p, x.points[k - 1] as Vec3)) > 1e-12) }))
    .map((x) => (x.ferme && x.points.length > 2 && len(sub(x.points[0] as Vec3, x.points[x.points.length - 1] as Vec3)) < 1e-12 ? { ...x, points: x.points.slice(0, -1) } : x))
    .filter((x) => x.points.length >= 2 && x.points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)));
  return traces.length ? { ...r, traces } : null;
}

/** Échelle saisie « 1:N » (le tracé est N fois plus petit que la réalité) ou « N » ; `null` si illisible. */
export function lireEchelleColle(s: string): number | null {
  const m = /^\s*(?:1\s*[:/]\s*)?(\d+(?:[.,]\d+)?)\s*$/.exec(s);
  const n = m ? Number((m[1] as string).replace(",", ".")) : Number.NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

export const sommetsColles = (l: LectureColle): number => l.traces.reduce((n, t) => n + t.points.length, 0);
export const aretesCollees = (l: LectureColle): number => l.traces.reduce((n, t) => n + t.points.length - (t.ferme ? 0 : 1), 0);

/** Pose les tracés sur le plan `repere` : (x, y, z) du tracé × mètres par unité × échelle, dans les axes du repère. */
export function poserTraces(m: Modele, l: LectureColle, o: { readonly metresParUnite: number; readonly echelle: number; readonly repere: Repere; readonly dans?: Id }) {
  const k = o.metresParUnite * o.echelle;
  const P = (p: Vec3): Vec3 => add(o.repere.origine, add(scale(o.repere.x, p.x * k), add(scale(o.repere.y, p.y * k), scale(o.repere.z, p.z * k))));
  const segments: [Vec3, Vec3][] = [];
  for (const t of l.traces) {
    const q = t.points.map(P);
    for (let i = 0; i + 1 < q.length; i++) segments.push([q[i] as Vec3, q[i + 1] as Vec3]);
    if (t.ferme && q.length > 2) segments.push([q[q.length - 1] as Vec3, q[0] as Vec3]);
  }
  return ajouterSegments(m, segments, o.dans ? { dans: o.dans } : {});
}

/** Rapport du collage : tracés et sommets écrits, courbes approchées, éléments refusés. */
export function rapportCollage(l: LectureColle, date: string): RapportEchange {
  return {
    sens: "collage",
    format: l.type,
    fichier: "presse-papiers",
    date,
    lignes: [ligne("traces", l.traces.length, null, l.courbesApprochees, l.refuses), ligne("sommets", sommetsColles(l))],
    nonLues: [],
  };
}
