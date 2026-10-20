/**
 * Sections des outils Profilé (lot L12, D-215) — adaptateur pur, sans React ni DOM.
 *
 * Deux sources, jamais de valeur supposée (R3) — la Planche de Sandbox n'a aucun catalogue de projet :
 * 1. des **dimensions saisies** (mm) : un champ requis vide bloque (« dimension manquante ») ;
 * 2. une **face de la Planche** : son contour (trous compris) dans son plan.
 * Le rond et le rond creux sont facettisés avec le nombre de segments saisi (24 par défaut, relevé du Cercle).
 */
import { type Id, type Modele, type PointSection, type SectionCourante, type SectionProfil, baseDuPlan, contexte, dot, validerSection } from "@parcours/sandbox-planche-model";

/** Formes de section (copie locale : Sandbox ne dépend d'aucun autre modèle que le sien). */
type FormeSection = "rectangle" | "cercle" | "I" | "H" | "T" | "L" | "U" | "tube";
interface Longueur {
  readonly value: number;
  readonly unit?: "m";
}
interface SectionStructure {
  readonly forme: FormeSection;
  readonly largeur: Longueur;
  readonly hauteur: Longueur;
  readonly epaisseur: Longueur | null;
  readonly epaisseurAile: Longueur | null;
}
const LIBELLES_FORME: Record<FormeSection, string> = { rectangle: "Rectangle", cercle: "Cercle", I: "Profilé I", H: "Profilé H", T: "Profilé T", L: "Cornière L", U: "Profilé U", tube: "Tube" };

/** Contour fermé de la section (sens direct), coordonnées [y, z] en m, centré. */
function contourSection(s: SectionStructure): [number, number][] {
  const w = s.largeur.value, h = s.hauteur.value;
  const x = w / 2, y = h / 2;
  const t = s.epaisseur?.value ?? 0, ta = s.epaisseurAile?.value ?? t;
  const hx = t / 2;
  switch (s.forme) {
    case "cercle":
      return Array.from({ length: 32 }, (_, k) => [x * Math.cos((2 * Math.PI * k) / 32), x * Math.sin((2 * Math.PI * k) / 32)] as [number, number]);
    case "tube":
      return [[-x, -y], [x, -y], [x, y], [-x, y]];
    case "I":
    case "H":
      return [[-x, -y], [x, -y], [x, -y + ta], [hx, -y + ta], [hx, y - ta], [x, y - ta], [x, y], [-x, y], [-x, y - ta], [-hx, y - ta], [-hx, -y + ta], [-x, -y + ta]];
    case "T":
      return [[-hx, -y], [hx, -y], [hx, y - ta], [x, y - ta], [x, y], [-x, y], [-x, y - ta], [-hx, y - ta]];
    case "L":
      return [[-x, -y], [x, -y], [x, -y + t], [-x + t, -y + t], [-x + t, y], [-x, y]];
    case "U":
      return [[-x, -y], [x, -y], [x, y], [x - ta, y], [x - ta, -y + t], [-x + ta, -y + t], [-x + ta, y], [-x, y]];
    case "rectangle":
    default:
      return [[-x, -y], [x, -y], [x, y], [-x, y]];
  }
}

/** Trous de la section (tube creux) ; vide sinon. */
function trousSection(s: SectionStructure): [number, number][][] {
  if (s.forme !== "tube" || !s.epaisseur) return [];
  const t = s.epaisseur.value;
  const x = s.largeur.value / 2 - t, y = s.hauteur.value / 2 - t;
  if (x <= 0 || y <= 0) return [];
  return [[[-x, -y], [-x, y], [x, y], [x, -y]]];
}

/** Désignation lisible d'une section saisie. */
function designationSection(s: SectionStructure): string {
  const d = (x: number) => `${Math.round(x * 1000)}`;
  const base = s.forme === "cercle" ? `Ø ${d(s.largeur.value)}` : `${d(s.largeur.value)} × ${d(s.hauteur.value)}`;
  return `${LIBELLES_FORME[s.forme]} ${base}${s.epaisseur ? ` e ${d(s.epaisseur.value)}` : ""} mm`;
}

export type FormeSaisie = "rectangle" | "rond" | "rond-creux" | "tube" | "I" | "H" | "T" | "L" | "U";
export const FORMES_SAISIE: readonly FormeSaisie[] = ["rectangle", "rond", "rond-creux", "tube", "I", "H", "T", "L", "U"];

/** Formes saisies qui demandent une épaisseur (âme ou paroi) et une épaisseur d'aile. */
export const SAISIE_AVEC_EPAISSEUR: readonly FormeSaisie[] = ["rond-creux", "tube", "I", "H", "T", "L", "U"];
export const SAISIE_AVEC_AILE: readonly FormeSaisie[] = ["I", "H", "T", "U"];
export const SAISIE_AVEC_HAUTEUR: readonly FormeSaisie[] = ["rectangle", "tube", "I", "H", "T", "L", "U"];

/** Nombre de segments d'un rond par défaut : celui relevé pour le Cercle de la Planche. */
export const SEGMENTS_ROND_DEFAUT = 24;

export interface DimensionsSaisies {
  readonly forme: FormeSaisie;
  /** Largeur (ou diamètre d'un rond), hauteur, épaisseurs : texte du champ, en millimètres. */
  readonly largeur: string;
  readonly hauteur: string;
  readonly epaisseur: string;
  readonly epaisseurAile: string;
  /** Segments d'un rond, texte « 24 » ou « 24s » ; vide = défaut. */
  readonly segments: string;
}

export const DIMENSIONS_VIDES: DimensionsSaisies = { forme: "rectangle", largeur: "", hauteur: "", epaisseur: "", epaisseurAile: "", segments: "" };

/** Erreur nommée d'une section (dimension manquante, cellule vide…) : affichée telle quelle, rien n'est posé. */
export class ErreurSection extends Error {}

const NOMS_CHAMPS: Record<"largeur" | "hauteur" | "epaisseur" | "epaisseurAile", string> = { largeur: "largeur", hauteur: "hauteur", epaisseur: "épaisseur", epaisseurAile: "épaisseur d'aile" };

function millimetres(d: DimensionsSaisies, champ: keyof typeof NOMS_CHAMPS): number {
  const t = d[champ].trim().replace(",", ".");
  if (t === "") throw new ErreurSection(`Dimension manquante : ${NOMS_CHAMPS[champ]}.`);
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) throw new ErreurSection(`Dimension invalide : ${NOMS_CHAMPS[champ]} « ${d[champ]} » (un nombre de millimètres positif).`);
  return n / 1000;
}

function segmentsDe(texte: string): number {
  const t = texte.trim().replace(/s$/i, "");
  if (t === "") return SEGMENTS_ROND_DEFAUT;
  const n = Number(t);
  if (!Number.isInteger(n) || n < 3 || n > 999) throw new ErreurSection("Segments d'un rond : un entier de 3 à 999 (ex. 24 ou 24s).");
  return n;
}

const point = ([y, z]: readonly [number, number]): PointSection => ({ y, z });
const cercle = (rayon: number, n: number, sens: 1 | -1 = 1): PointSection[] => Array.from({ length: n }, (_, k) => ({ y: rayon * Math.cos((sens * 2 * Math.PI * k) / n), z: rayon * Math.sin((sens * 2 * Math.PI * k) / n) }));
const mmTexte = (m: number) => `${Math.round(m * 1e4) / 10}`.replace(".", ",");

/** Rond plein ou creux facettisé : contour direct, trou en sens inverse. */
function rond(diametre: number, epaisseur: number | null, n: number): SectionProfil {
  if (epaisseur !== null && epaisseur * 2 >= diametre) throw new ErreurSection("Épaisseur incompatible avec le diamètre du rond creux.");
  return { exterieur: cercle(diametre / 2, n), trous: epaisseur !== null ? [cercle(diametre / 2 - epaisseur, n, -1)] : [] };
}

/** Section polygonale : contour et trous calculés par `contourSection` / `trousSection`. */
function polygonale(s: SectionStructure): SectionProfil {
  return { exterieur: contourSection(s).map(point), trous: trousSection(s).map((t) => t.map(point)) };
}

/** Section saisie : dimensions en millimètres, aucune valeur par défaut. */
export function sectionSaisie(d: DimensionsSaisies): SectionCourante {
  const largeur = millimetres(d, "largeur");
  let section: SectionProfil;
  let designation: string;
  if (d.forme === "rond" || d.forme === "rond-creux") {
    const n = segmentsDe(d.segments);
    const e = d.forme === "rond-creux" ? millimetres(d, "epaisseur") : null;
    section = rond(largeur, e, n);
    designation = `${d.forme === "rond" ? "Rond" : "Rond creux"} Ø ${mmTexte(largeur)}${e !== null ? ` e ${mmTexte(e)}` : ""} mm (${n} segments)`;
  } else {
    const hauteur = millimetres(d, "hauteur");
    const epaisseur = SAISIE_AVEC_EPAISSEUR.includes(d.forme) ? millimetres(d, "epaisseur") : null;
    const epaisseurAile = SAISIE_AVEC_AILE.includes(d.forme) ? millimetres(d, "epaisseurAile") : null;
    if (epaisseur !== null && epaisseur * 2 >= Math.min(largeur, hauteur)) throw new ErreurSection("Épaisseur incompatible avec les dimensions de la section.");
    if (epaisseurAile !== null && epaisseurAile * 2 >= hauteur) throw new ErreurSection("Épaisseur d'aile incompatible avec la hauteur de la section.");
    const s: SectionStructure = {
      forme: d.forme as FormeSection,
      largeur: { value: largeur, unit: "m" },
      hauteur: { value: hauteur, unit: "m" },
      epaisseur: epaisseur !== null ? { value: epaisseur, unit: "m" } : null,
      epaisseurAile: epaisseurAile !== null ? { value: epaisseurAile, unit: "m" } : null,
    };
    section = polygonale(s);
    designation = designationSection(s);
  }
  validerSection(section);
  return { designation, section, source: { genre: "saisie" } };
}

/** Section d'une face de la Planche : son contour et ses trous dans son plan, centrés sur sa boîte. */
export function sectionDepuisFace(m: Modele, face: Id, dans?: Id): SectionCourante {
  const c = contexte(m, dans);
  const f = c.faces[face];
  if (!f) throw new ErreurSection("Sélectionnez une face pour en faire la section.");
  const { u, w } = baseDuPlan(f.normale);
  const pos = (s: Id) => c.sommets[s]!.position;
  const p2 = (s: Id): PointSection => ({ y: dot(pos(s), u), z: dot(pos(s), w) });
  const ext = f.exterieur.map(p2);
  const ys = ext.map((p) => p.y);
  const zs = ext.map((p) => p.z);
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const cz = (Math.min(...zs) + Math.max(...zs)) / 2;
  const centrer = (p: PointSection): PointSection => ({ y: p.y - cy, z: p.z - cz });
  const section: SectionProfil = { exterieur: ext.map(centrer), trous: f.trous.map((b) => b.map(p2).map(centrer)) };
  validerSection(section);
  return { designation: `Contour de face (${f.exterieur.length} sommets${f.trous.length ? `, ${f.trous.length} trou${f.trous.length > 1 ? "s" : ""}` : ""})`, section, source: { genre: "saisie" } };
}

/** Texte de la source d'une pièce, pour l'Info entité : « saisie » ou « source, édition, page, ligne ». */
export function texteSource(s: SectionCourante["source"]): string {
  if (s.genre === "saisie") return "saisie";
  return [s.source, s.edition, s.page ? `p. ${s.page}` : null, s.ligne ? `ligne ${s.ligne}` : null].filter(Boolean).join(", ");
}
